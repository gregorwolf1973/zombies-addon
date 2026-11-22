// Rucksack und Kiste mit Stapeln: je Platz bis zu STAPEL_MAX Stück derselben Art.
// Speicherformat (auch im Netz-Zustand): Liste von Zeichenketten, ein Eintrag je Platz: "wasser" (1 Stück) oder "wasser*3" (3 Stück).
// Alte Spielstände (ein Eintrag je Stück, nur "id") bleiben gültig: laden() legt gleiche Dinge beim Einlesen auf Stapel.
// Alle Hilfen arbeiten mit normalen Arrays UND mit Colyseus-ArraySchema (nur push/splice/Index/length).
import { DINGE, STAPEL_MAX } from './welt.mjs';

const STAPEL_WAFFEN = new Set(['messer']);   // Waffen, die trotzdem stapeln (Handgranate 'granate' ist keine Waffe)

export function dingId(e) { const s = String(e ?? ''), k = s.indexOf('*'); return k < 0 ? s : s.slice(0, k); }
export function dingN(e) {
  const s = String(e ?? ''), k = s.indexOf('*');
  if (k < 0) return 1;
  const n = parseInt(s.slice(k + 1), 10);
  return Number.isFinite(n) && n >= 1 ? Math.min(n, STAPEL_MAX) : 1;
}
const eintrag = (id, n) => (n > 1 ? `${id}*${n}` : id);

export function stapelbar(id) {
  const d = DINGE[id];
  return !!d && (!d.waffe || STAPEL_WAFFEN.has(id)) && !d.plaetze && !d.mission;
}
export const stapelMax = id => (stapelbar(id) ? STAPEL_MAX : 1);

// Anzahl Stück einer Art (id weglassen: alle Stücke) / Vorhandensein / erster bzw. letzter Platz
export function zaehle(liste, id) {
  let n = 0;
  for (const e of liste ?? []) if (id === undefined || dingId(e) === id) n += dingN(e);
  return n;
}
export const hat = (liste, id) => zaehle(liste, id) > 0;
export function indexVon(liste, id) {
  const l = liste ?? [];
  for (let i = 0; i < l.length; i++) if (dingId(l[i]) === id) return i;
  return -1;
}
export function letzterIndex(liste, id) {
  const l = liste ?? [];
  for (let i = l.length - 1; i >= 0; i--) if (dingId(l[i]) === id) return i;
  return -1;
}
// Flache Liste einzelner Dinge ("wasser","wasser",…) für lesende Auswertungen (some/find/Zufall)
export function flach(liste) {
  const r = [];
  for (const e of liste ?? []) { const id = dingId(e); for (let k = dingN(e); k > 0; k--) r.push(id); }
  return r;
}
// Taschen (erhöhen beim Umpacken die Platzzahl): mehrere erlaubt, jede belegt einen eigenen Platz (nicht stapelbar)
export const istTasche = id => !!DINGE[id]?.plaetze;
export const hatTasche = liste => (liste ?? []).some(e => istTasche(dingId(e)));

// Wie viele Stück von id passen noch hinein (Plätze insgesamt: plaetze; kiste: ohne Wirkung, nur Kompatibilität)?
export function platzFuer(liste, plaetze, id, kiste = false) {
  const m = stapelMax(id);
  let n = Math.max(0, plaetze - (liste?.length ?? 0)) * m;
  for (const e of liste ?? []) if (dingId(e) === id) n += m - dingN(e);
  return n;
}
export const kannAufnehmen = (liste, plaetze, id, n = 1, kiste = false) => platzFuer(liste, plaetze, id, kiste) >= n;
// Grund, warum nichts hineinpasst: '' = passt, 'voll'
export function blockGrund(liste, plaetze, id, n = 1, kiste = false) {
  return platzFuer(liste, plaetze, id, kiste) >= n ? '' : 'voll';
}
// Noch nicht belegte Plätze
export const freiePlaetze = (liste, plaetze) => Math.max(0, plaetze - (liste?.length ?? 0));

// n Stück hineinlegen: erst auf vorhandene, nicht volle Stapel, dann neue Plätze. Liefert die Zahl wirklich abgelegter Stück.
export function fuegeHinzu(liste, plaetze, id, n = 1, kiste = false) {
  if (!id || n < 1) return 0;
  const m = stapelMax(id);
  let rest = n;
  for (let i = 0; i < liste.length && rest > 0; i++) {
    if (dingId(liste[i]) !== id) continue;
    const z = dingN(liste[i]), mehr = Math.min(m - z, rest);
    if (mehr > 0) { liste[i] = eintrag(id, z + mehr); rest -= mehr; }
  }
  while (rest > 0 && liste.length < plaetze) { const z = Math.min(m, rest); liste.push(eintrag(id, z)); rest -= z; }
  return n - rest;
}
// Ein Stück (oder n, höchstens der ganze Stapel) von Platz i entfernen; ein leerer Platz wird gestrichen. Liefert die Art ('' bei Fehler).
export function nimmEins(liste, i, n = 1) {
  if (!Number.isInteger(i) || i < 0 || i >= liste.length) return '';
  const id = dingId(liste[i]), z = dingN(liste[i]);
  if (n >= z) liste.splice(i, 1); else liste[i] = eintrag(id, z - n);
  return id;
}
// Ganzen Stapel von Platz i herausnehmen: { id, n } oder null
export function nimmStapel(liste, i) {
  if (!Number.isInteger(i) || i < 0 || i >= liste.length) return null;
  const id = dingId(liste[i]), n = dingN(liste[i]);
  liste.splice(i, 1);
  return { id, n };
}
// n Stück einer Art entfernen (zuerst aus dem hintersten Stapel). Liefert die Zahl entfernter Stück.
export function entferne(liste, id, n = 1) {
  let rest = n;
  for (let i = liste.length - 1; i >= 0 && rest > 0; i--) {
    if (dingId(liste[i]) !== id) continue;
    const z = dingN(liste[i]), w = Math.min(z, rest);
    if (w >= z) liste.splice(i, 1); else liste[i] = eintrag(id, z - w);
    rest -= w;
  }
  return n - rest;
}
// Platz von → Platz nach umsortieren: leeres Ziel hinter den Dingen = ans Ende, gleiche Art = zusammenlegen, sonst tauschen
export function verschiebe(liste, von, nach, plaetze) {
  const n = liste.length;
  if (!Number.isInteger(von) || !Number.isInteger(nach) || von < 0 || von >= n || nach < 0 || nach >= plaetze || von === nach) return false;
  if (nach >= n) { const [d] = liste.splice(von, 1); liste.push(d); return true; }
  const a = liste[von], b = liste[nach];
  if (dingId(a) === dingId(b) && stapelbar(dingId(a))) {   // Stapel zusammenlegen (Rest bleibt beim Quellplatz)
    const m = stapelMax(dingId(a)), za = dingN(a), zb = dingN(b), mehr = Math.min(m - zb, za);
    if (mehr > 0) {
      liste[nach] = eintrag(dingId(b), zb + mehr);
      if (mehr >= za) liste.splice(von, 1); else liste[von] = eintrag(dingId(a), za - mehr);
      return true;
    }
  }
  liste[von] = b; liste[nach] = a;
  return true;
}
// Gespeicherte Liste (alt: je Stück ein Eintrag, neu: mit "*n") in eine frische Liste einlesen. Unbekannte Dinge fallen weg.
export function laden(ziel, gespeichert, plaetze, kiste = false) {
  for (const e of Array.isArray(gespeichert) ? gespeichert : []) {
    const id = dingId(e);
    if (DINGE[id]) fuegeHinzu(ziel, plaetze, id, dingN(e), kiste);
  }
}

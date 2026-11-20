// Magazine, Nachladen und Waffenplätze (links = Haupt, rechts = Neben, dazu ein Ersatzplatz).
// p.waffe ist immer die Waffe in der Hand = der Inhalt des aktiven Platzes p.wplatz; alter Code, der p.waffe setzt, bleibt
// deshalb gültig – abgleich() übernimmt die Hand jeden Tick in den aktiven Platz und verwaltet das Magazin dazu.
// p.munition / p.pfeile / p.granaten sind der Vorrat AUSSERHALB des Magazins (p.magazin = Schuss im Magazin der Hand).
import { WAFFEN, DINGE, vorratFeld, vorratVon, magazinGroesse, MUNITION_MAX, PFEILE_MAX, GRANATEN_MAX } from '../client/welt.mjs';

export const PLATZ_FELD = ['wp0', 'wp1', 'wp2'];
export const PLATZ_NAME = ['Haupt', 'Neben', 'Ersatz'];
const VORRAT_MAX = { munition: MUNITION_MAX, pfeile: PFEILE_MAX, granaten: GRANATEN_MAX };

// Magazingröße / Nachladedauer: Verwaltung (einst.waffen) vor Vorgabe aus WAFFEN
export const magGroesse = (name, einst) => { const w = WAFFEN[name]; return w?.fern ? Math.max(1, Math.round(einst?.waffen?.[name]?.magazin ?? magazinGroesse(w))) : 0; };
export const nachladeDauer = (name, einst) => Math.max(0.3, einst?.waffen?.[name]?.nachlade ?? WAFFEN[name]?.nachlade ?? 4);

// Magazin aus dem Vorrat füllen (Rückgabe: geladene Schuss)
function fuelle(p, name, einst, schon = 0) {
  const w = WAFFEN[name], f = vorratFeld(w);
  const n = Math.max(0, Math.min(magGroesse(name, einst) - schon, p[f] ?? 0));
  p[f] -= n;
  return n;
}
// Schuss einer abgelegten/ersetzten Waffe zurück in den Vorrat
function erstatte(p, name, n) {
  const f = vorratFeld(WAFFEN[name]);
  p[f] = Math.min(VORRAT_MAX[f], (p[f] ?? 0) + n);
}

// Spielstand aus der Datenbank übernehmen (Plätze, Magazine); danach gleicht abgleich() alles an
export function lade(p, x, g) {
  x.mag = [null, null, null];
  const ok = n => DINGE[n]?.waffe ? n : '';
  p.wplatz = Number.isInteger(g?.wplatz) && g.wplatz >= 0 && g.wplatz <= 2 ? g.wplatz : 0;
  PLATZ_FELD.forEach((f, i) => { p[f] = i === p.wplatz ? p.waffe : ok(g?.[f]); });
  (Array.isArray(g?.mag) ? g.mag : []).slice(0, 3).forEach((n, i) => {
    const name = p[PLATZ_FELD[i]];
    if (name && WAFFEN[name]?.fern && Number.isFinite(Number(n)) && Number(n) > 0) x.mag[i] = { waffe: name, n: Math.min(255, Math.floor(Number(n))) };
  });
  p.magazin = x.mag[p.wplatz]?.n ?? 0;
  p.nachladen = 0;
}
export const speicherDaten = (p, x) => ({ wplatz: p.wplatz, wp0: p.wp0, wp1: p.wp1, wp2: p.wp2, mag: [0, 1, 2].map(i => i === p.wplatz ? p.magazin : x.mag?.[i]?.n ?? 0) });

// Hand ↔ Platz ↔ Magazin angleichen (jeden Tick, billig)
export function abgleich(p, x, einst) {
  abgleich1(p, x, einst);
  [0, 1, 2].forEach(i => {   // Magazinstand je Platz für den Client (HUD-Knöpfe)
    const name = p[PLATZ_FELD[i]], gm = magGroesse(name, einst);
    const n = !gm ? 0 : i === p.wplatz ? p.magazin : (x.mag[i]?.waffe === name ? x.mag[i].n : 0);
    if (p['mg' + i] !== n) p['mg' + i] = n;
    if (p['mx' + i] !== gm) p['mx' + i] = Math.min(255, gm);
  });
}
function abgleich1(p, x, einst) {
  x.mag ??= [null, null, null];
  const a = p.wplatz;
  p[PLATZ_FELD[a]] = p.waffe;
  const e = x.mag[a], gm = magGroesse(p.waffe, einst);
  if (e && e.waffe !== p.waffe) {   // Waffe im Platz ausgetauscht (z. B. gegen eine aus dem Rucksack): Schuss zurück in den Vorrat
    if (e.n > 0) erstatte(p, e.waffe, e.n);
    x.mag[a] = null; p.magazin = 0; p.nachladen = 0; x.nRest = 0;
  }
  p.magmax = gm;
  if (!gm) { p.magazin = 0; p.nachladen = 0; x.mag[a] = null; return; }
  if (!x.mag[a]) { p.nachladen = 0; p.magazin = fuelle(p, p.waffe, einst); }   // frisch aufgenommen: gleich geladen
  if (p.magazin > gm) { erstatte(p, p.waffe, p.magazin - gm); p.magazin = gm; }   // Einstellung verkleinert
  x.mag[a] = { waffe: p.waffe, n: p.magazin };
}

// Ist die Waffe in Platz i noch brauchbar (Nahwaffe oder Schuss da)?
function brauchbar(p, x, i) {
  const name = p[PLATZ_FELD[i]];
  if (!name) return false;
  const w = WAFFEN[name];
  if (!w?.fern) return true;
  return (x.mag?.[i]?.waffe === name ? x.mag[i].n : 0) + vorratVon(p, w) > 0;
}

export function wechsle(raum, client, p, x, platz, einst, still = false) {
  if (!Number.isInteger(platz) || platz < 0 || platz > 2 || platz === p.wplatz) return false;
  abgleich(p, x, einst);
  const name = p[PLATZ_FELD[platz]];
  p.wplatz = platz; p.waffe = name; p.nachladen = 0; x.nRest = 0;
  const e = x.mag[platz];
  p.magazin = e && e.waffe === name ? e.n : 0;   // fehlt der Eintrag, füllt abgleich() beim nächsten Schritt
  if (!still) client?.send('meldung', { text: name ? `${DINGE[name].zeichen} ${PLATZ_NAME[platz]}: ${DINGE[name].name}` : `✊ ${PLATZ_NAME[platz]}: leer – Faust` });
  return true;
}

// nächster belegter Platz (Taste F)
export function naechster(p) {
  for (let k = 1; k <= 2; k++) { const i = (p.wplatz + k) % 3; if (p[PLATZ_FELD[i]]) return i; }
  return -1;
}

// Eine Waffe aus dem Rucksack in die Hand nehmen: ist ein anderer Platz frei, kommt sie dorthin (die bisherige Waffe bleibt im
// Platz), sonst ersetzt sie die Waffe in der Hand (die wandert in den Rucksack). Rückgabe: Name der bisherigen Waffe, die in den
// Rucksack gehört, oder '' wenn nichts zurückgelegt werden muss.
export function inDieHand(raum, client, p, x, ding, einst) {
  abgleich(p, x, einst);
  if (!p.waffe) { p.waffe = ding; return ''; }
  const frei = [1, 2, 0].map(k => (p.wplatz + k) % 3).find(i => !p[PLATZ_FELD[i]]);
  if (frei === undefined) { const alt = p.waffe; p.waffe = ding; return alt; }
  p[PLATZ_FELD[frei]] = ding;
  wechsle(raum, null, p, x, frei, einst, true);
  return '';
}

// Nachladen starten (von Hand mit R oder automatisch bei leerem Magazin); true = gestartet
export function startNachladen(raum, p, x, einst) {
  abgleich(p, x, einst);
  const w = WAFFEN[p.waffe];
  if (!w?.fern || p.nachladen > 0 || p.unten || p.zombie > 0) return false;
  if (p.magazin >= magGroesse(p.waffe, einst) || vorratVon(p, w) <= 0) return false;
  x.nDauer = x.nRest = nachladeDauer(p.waffe, einst);
  p.nachladen = 0.001;
  raum.broadcast('nachladen', { x: p.x, y: p.y, art: p.waffe, ebene: p.ebene ?? '' });
  return true;
}

// jeden Tick je Spieler (auch Bots): Nachladen vorantreiben, bei leerem Magazin selbst nachladen, bei leerer Waffe wechseln
export function schritt(raum, client, p, x, dt, einst) {
  abgleich(p, x, einst);
  const w = WAFFEN[p.waffe];
  if (!w?.fern) return;
  if (p.nachladen > 0) {
    x.nRest -= dt;
    if (x.nRest <= 0) {
      p.magazin += fuelle(p, p.waffe, einst, p.magazin);
      p.nachladen = 0;
      x.mag[p.wplatz] = { waffe: p.waffe, n: p.magazin };
    } else p.nachladen = Math.max(0.001, 1 - x.nRest / x.nDauer);
    return;
  }
  if (p.magazin <= 0 && vorratVon(p, w) > 0) { startNachladen(raum, p, x, einst); return; }
  // Magazin und Vorrat leer: auf einen anderen Platz mit brauchbarer Waffe wechseln
  if (p.magazin <= 0) {
    const ziel = [1, 2].map(k => (p.wplatz + k) % 3).find(i => brauchbar(p, x, i));
    if (ziel !== undefined) {
      const alt = p.waffe;
      wechsle(raum, client, p, x, ziel, einst, true);
      client?.send('meldung', { text: `${DINGE[alt].zeichen} ${DINGE[alt].name} leer – ${DINGE[p.waffe].zeichen} ${DINGE[p.waffe].name}` });
    }
  }
}

// Waffen aller Plätze (für den Sterbehaufen)
export const alleWaffen = p => [p.wp0, p.wp1, p.wp2].filter((n, i) => n && i !== p.wplatz);
export function leeren(p, x) { p.wp0 = p.wp1 = p.wp2 = ''; p.wplatz = 0; p.magazin = 0; p.nachladen = 0; if (x) { x.mag = [null, null, null]; x.nRest = 0; } }

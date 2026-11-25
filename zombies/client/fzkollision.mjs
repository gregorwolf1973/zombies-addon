// Fahrzeuge als Hindernisse für Figuren (Server UND Client-Vorhersage rechnen mit denselben Funktionen, ARCHITEKTUR.md):
//  - parkende/stehende Fahrzeuge (geparkte Autos der Welt = welt.behaelter 'auto', Fahrzeuge mit haelt = Wracks, wartende Autos, Stau): man steigt
//    langsam darüber (50 % Tempo, AUTO_KLETTERN) statt hindurchzulaufen;
//  - fahrende Fahrzeuge (haelt = false): blockieren den Spielerkreis (Kreis gegen gedrehtes Rechteck); ihr Stoß: server/fahrzeugkontakt.mjs.
// Maße in Pixeln (8 px = 1 m). Nur + − × ÷ und Math.sqrt/cos/sin für die Ausrichtung (Laufzeitlogik, keine Weltdaten).
import { FAHRBAR } from './fahrbar.mjs';

export const AUTO_KLETTERN = 0.5;                 // Tempo auf einem stehenden Fahrzeug (Anteil; bis 0.88: 0.2)
export const KLETTER_RADIUS = 0.3;                // Kletterzone: nur der Mittelpunkt-Bereich der Figur zählt (Anteil des Kreisradius), erst wer wirklich am/auf dem Auto steht, klettert (0.89)
export const STOSS_TAUMEL_FAKTOR = 0.4;           // Steuerung während des Taumelns (Anteil der Eingabe)
const ZELLE = 64;
const PARK = { hl: 18, hb: 8 };                   // geparkter Pkw 4,5 × 2,0 m
export const FZ_LAENGE = { auto: 36, laster: 72, bus: 96, polizei: 39, feuerwehr: 76, krankenwagen: 47, wrack: 36 };
export const FZ_BREITE = { auto: 16, laster: 23, bus: 22, polizei: 16, feuerwehr: 22, krankenwagen: 19, wrack: 16 };

// Maße (halbe Länge, halbe Breite) einer Fahrzeugart; null = nicht als Hindernis (Evakuierungsfahrzeug: Einstieg bleibt frei)
export function fzMasse(art) {
  if (art === 'evakuierung') return null;
  const fb = FAHRBAR[art];
  if (fb) return { hl: fb.laenge / 2, hb: fb.breite / 2 };
  return { hl: (FZ_LAENGE[art] ?? 36) / 2, hb: (FZ_BREITE[art] ?? 16) / 2 };
}

// Kreis (Mitte x/y, Radius rad) gegen gedrehtes Rechteck r = { x, y, c, s, hl, hb } (c/s = cos/sin der Längsachse)
export function kreisImRechteck(r, x, y, rad) {
  const dx = x - r.x, dy = y - r.y, u = dx * r.c + dy * r.s, v = -dx * r.s + dy * r.c;
  const qx = Math.max(-r.hl, Math.min(r.hl, u)) - u, qy = Math.max(-r.hb, Math.min(r.hb, v)) - v;
  return qx * qx + qy * qy < rad * rad;
}

// Index der geparkten Autos der Welt (Außenwelt), je Welt einmal gebaut
function parkIndex(welt) {
  if (welt._parkIdx !== undefined) return welt._parkIdx;
  const liste = welt.behaelter;
  if (!liste?.length || welt.kachel || welt.ebene) return (welt._parkIdx = null);
  const m = new Map();
  for (const b of liste) {
    if (b.art !== 'auto') continue;
    const w = Number.isFinite(b.winkel) ? b.winkel : b.senkrecht ? Math.PI / 2 : 0;
    const r = { x: b.x, y: b.y, c: Math.cos(w), s: Math.sin(w), hl: PARK.hl, hb: PARK.hb };
    const k = Math.floor(b.x / ZELLE) + ',' + Math.floor(b.y / ZELLE);
    (m.get(k) ?? m.set(k, []).get(k)).push(r);
  }
  return (welt._parkIdx = m.size ? m : null);
}

// Rechtecke der geparkten Autos der Welt, deren Zelle das Rechteck (x0, y0)–(x1, y1) in px berührt (Superuser-Anzeige „Kollision zeigen“)
export function parkRechteckeIn(welt, x0, y0, x1, y1) {
  const idx = parkIndex(welt), aus = [];
  if (!idx) return aus;
  for (let cy = Math.floor(y0 / ZELLE) - 1; cy <= Math.floor(y1 / ZELLE) + 1; cy++) for (let cx = Math.floor(x0 / ZELLE) - 1; cx <= Math.floor(x1 / ZELLE) + 1; cx++) for (const r of idx.get(cx + ',' + cy) ?? []) aus.push(r);
  return aus;
}

// liegt der Kreis auf einem geparkten Auto der Welt?
export function aufParkAuto(welt, x, y, rad) {
  const idx = parkIndex(welt);
  if (!idx) return false;
  const cx = Math.floor(x / ZELLE), cy = Math.floor(y / ZELLE);
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) for (const r of idx.get((cx + i) + ',' + (cy + j)) ?? []) if (kreisImRechteck(r, x, y, rad)) return true;
  return false;
}

// Fahrzeuge (Map id → Fahrzeug) in { steht: [Rechtecke], faehrt: [Rechtecke] } aufteilen; richtungVon(f) liefert die Fahrtrichtung (Bogenmaß)
export function fzRechtecke(fahrzeuge, richtungVon = f => f.richtung ?? 0) {
  const steht = [], faehrt = [];
  if (fahrzeuge) for (const [id, f] of fahrzeuge) {
    const m = fzMasse(f.art);
    if (!m) continue;
    const w = richtungVon(f), r = { id, x: f.x, y: f.y, c: Math.cos(w), s: Math.sin(w), hl: m.hl, hb: m.hb, art: f.art, w };
    (f.haelt ? steht : faehrt).push(r);
  }
  return { steht, faehrt };
}

// liegt der Kreis auf einem stehenden Fahrzeug (Liste aus fzRechtecke) oder einem geparkten Auto?
export function aufAuto(welt, fz, x, y, rad0) {
  if (welt.kachel || welt.ebene) return false;
  const rad = rad0 * KLETTER_RADIUS;
  if (aufParkAuto(welt, x, y, rad)) return true;
  if (fz) for (const r of fz.steht) if (Math.abs(x - r.x) <= r.hl + rad + 2 && Math.abs(y - r.y) <= r.hl + rad + 2 && kreisImRechteck(r, x, y, rad)) return true;
  return false;
}
// Tempofaktor: AUTO_KLETTERN auf einem stehenden Fahrzeug, sonst 1
export const autoTempo = (welt, fz, x, y, rad) => (aufAuto(welt, fz, x, y, rad) ? AUTO_KLETTERN : 1);

// trifft der Kreis ein FAHRENDES Fahrzeug?
export function imFahrenden(fz, x, y, rad) {
  if (fz) for (const r of fz.faehrt) if (Math.abs(x - r.x) <= r.hl + rad + 2 && Math.abs(y - r.y) <= r.hl + rad + 2 && kreisImRechteck(r, x, y, rad)) return r;
  return null;
}

// Wie bewege() aus welt.mjs, aber fahrende Fahrzeuge sind Wände: ein Schritt, der den Kreis erst in ein fahrendes Fahrzeug brächte, wird
// ganz oder (nur x bzw. nur y) teilweise verworfen. Steckt die Figur schon darin (Fahrzeug fuhr auf sie), darf sie sich frei bewegen (Stoß schiebt sie heraus).
export function bewegeFz(bewege, welt, obj, dx, dy, rad, fz, frei) {
  if (!fz?.faehrt.length || welt.kachel || welt.ebene) { bewege(welt, obj, dx, dy, rad, frei); return; }
  const x0 = obj.x, y0 = obj.y, drin = !!imFahrenden(fz, x0, y0, rad);
  bewege(welt, obj, dx, dy, rad, frei);
  if (drin || !imFahrenden(fz, obj.x, obj.y, rad)) return;
  const x1 = obj.x, y1 = obj.y;
  obj.x = x1; obj.y = y0;                                   // nur die x-Bewegung
  if (obj.x !== x0 && !imFahrenden(fz, obj.x, obj.y, rad)) return;
  obj.x = x0; obj.y = y1;                                   // nur die y-Bewegung
  if (obj.y !== y0 && !imFahrenden(fz, obj.x, obj.y, rad)) return;
  obj.x = x0; obj.y = y0;
}

// Kulisse nach echten Luftbildern (Paket H): Bäume und Äcker liegen dort, wo sie auf dem amtlichen Luftbild zu sehen sind.
// Das Kartenfeld "luftbild" (tools/luftbild.py) hat je Kachel eine Ziffer: 0 unsicher, 1 Baum, 2 Wiese, 3 Acker, 4 befestigt, 5 Wasser.
// Läuft identisch auf Client und Server: deterministisch, kein Math.random, kein Welt-Zufall r() – nur Positions-Hashes, feste Schleifenreihenfolge.
import { BREITE, HOEHE, T } from './welt.mjs';
import { freihalteKreise, b11Zone } from './laendlich.mjs';

export const LB_UNSICHER = 0, LB_BAUM = 1, LB_WIESE = 2, LB_ACKER = 3, LB_BEFESTIGT = 4, LB_WASSER = 5;
const DICHTE = 0.65;   // Anteil der Luftbild-Baumkacheln, auf denen wirklich ein Baum steht (der Rest bleibt als Lücke)

const hsh = (x, y, s = 0) => {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1013904223)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

// gültiges Luftbild-Feld der Karte oder null (dann gilt der Rückfall: zufällige Bäume wie bisher)
export function luftbildFeld(karte) {
  const s = karte?.luftbild;
  return typeof s === 'string' && s.length === BREITE * HOEHE ? s : null;
}

// Nahe an der Landebahn (inkl. Rollwege)? – wie laendlich.mjs
function nahPiste(piste, px, py) {
  const [x0, y0, x1, y1] = piste.p, L = Math.hypot(x1 - x0, y1 - y0), ux = (x1 - x0) / L, uy = (y1 - y0) / L, b = piste.b ?? 11;
  const u = (px - x0) * ux + (py - y0) * uy, v = -(px - x0) * uy + (py - y0) * ux;
  if (u >= -8 && u <= L + 8 && Math.abs(v) <= b / 2 + 8) return true;
  for (const l of piste.rollweg ?? []) for (let i = 0; i + 3 < l.length; i += 2) {
    const dx = l[i + 2] - l[i], dy = l[i + 3] - l[i + 1], t = Math.max(0, Math.min(1, ((px - l[i]) * dx + (py - l[i + 1]) * dy) / (dx * dx + dy * dy || 1)));
    if (Math.hypot(px - l[i] - t * dx, py - l[i + 1] - t * dy) <= (piste.rb ?? 3) / 2 + 6) return true;
  }
  return false;
}

// Setzt Bäume auf Wiesenkacheln, die im Luftbild Baum sind. darf(x, y) = Freihalte-Prüfung der Welt (Straßen, Wege, Türen, Objekte …).
// Gibt { neu } zurück oder null, wenn die Karte kein Luftbild hat.
export function luftbildBaeume({ karte, k, setze, darf, start, KACHEL }) {
  const lb = luftbildFeld(karte);
  if (!lb) return null;
  const kreise = freihalteKreise(karte), b11 = b11Zone(karte), piste = karte.piste;
  const sx = start.x / KACHEL, sy = start.y / KACHEL;
  let neu = 0;
  for (let y = 2; y < HOEHE - 2; y++) for (let x = 2; x < BREITE - 2; x++) {
    const i = y * BREITE + x;
    if (lb.charCodeAt(i) - 48 !== LB_BAUM || k[i] !== T.WIESE) continue;
    if (hsh(x, y, 91) >= DICHTE || !darf(x, y)) continue;
    if (kreise.some(([cx, cy, r]) => Math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= r) || (b11 && b11(x, y)) ||
        Math.hypot(x + 0.5 - sx, y + 0.5 - sy) < 8 || (piste && nahPiste(piste, x + 0.5, y + 0.5))) continue;
    setze(x, y, T.BAUM); neu++;
  }
  return { neu };
}

// Acker-Flächen (Aussehen): zusammenhängende Luftbild-Ackerkacheln auf freier Wiese als Rechtecke (Zeilenstücke, senkrecht verschmolzen).
// Rückgabe im Format der OSM-Flächen: [{ a: 'acker', p: [x0, y0, x1, y0, x1, y1, x0, y1] }, …]
export function luftbildAcker(karte, k) {
  const lb = luftbildFeld(karte);
  if (!lb) return [];
  const ist = (x, y) => x >= 0 && y >= 0 && x < BREITE && y < HOEHE && lb.charCodeAt(y * BREITE + x) - 48 === LB_ACKER;
  const mask = new Uint8Array(BREITE * HOEHE);
  for (let y = 0; y < HOEHE; y++) for (let x = 0; x < BREITE; x++) {
    if (!ist(x, y) || k[y * BREITE + x] !== T.WIESE) continue;
    let n = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && ist(x + dx, y + dy)) n++;
    if (n >= 5) mask[y * BREITE + x] = 1;   // Einzelpunkte und dünne Ränder weglassen
  }
  const aus = [], offen = new Map();   // offen: "x0,x1" → Rechteck, das in der Vorzeile endete
  for (let y = 0; y <= HOEHE; y++) {
    const jetzt = new Map();
    for (let x = 0; y < HOEHE && x < BREITE;) {
      if (!mask[y * BREITE + x]) { x++; continue; }
      let e = x; while (e < BREITE && mask[y * BREITE + e]) e++;
      const key = x + ',' + e, r = offen.get(key);
      if (r) { r.y1 = y + 1; jetzt.set(key, r); offen.delete(key); } else { const n = { x0: x, x1: e, y0: y, y1: y + 1 }; jetzt.set(key, n); aus.push(n); }
      x = e;
    }
    offen.clear(); for (const [key, r] of jetzt) offen.set(key, r);
  }
  return aus.filter(r => (r.x1 - r.x0) * (r.y1 - r.y0) >= 6).map(r => ({ a: 'acker', p: [r.x0, r.y0, r.x1, r.y0, r.x1, r.y1, r.x0, r.y1] }));
}

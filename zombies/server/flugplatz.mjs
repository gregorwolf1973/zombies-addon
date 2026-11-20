// Flugplan für die A400M-Evakuierung: eine lange freie Fläche zum Landen (aus dem feinen Raster) und ein Hubschrauber-Landeplatz
// in einiger Entfernung, zu Fuß erreichbar. Deterministisch aus dem Seed; das Ergebnis hängt an der Welt (`welt._flugplan`).
import { BREITE, HOEHE, KACHEL, frei, findeWeg, zufall } from '../client/welt.mjs';
import { A400M } from '../client/evak.mjs';

const SCHRITT = 128;        // Rasterweite der Suche (Pixel)
const HELI_RAD = 70;        // freier Platz für den Hubschrauber (Radius)
const HELI_ABSTAND = [640, 1500];   // Abstand Hubschrauberplatz – Heckrampe (Pixel, 80–190 m)

// freier Streifen ab (x, y) in Richtung w: Länge L, Breite B (Proben alle 24 px, Kreise vom Radius B/2)
const streifenFrei = (welt, x, y, w, L, B) => {
  const c = Math.cos(w), s = Math.sin(w);
  for (let d = 0; d <= L; d += 24) if (!frei(welt, x + c * d, y + s * d, B / 2)) return false;
  return true;
};

// null, wenn die Welt keinen Landestreifen oder keinen erreichbaren Hubschrauberplatz hat
export function flugplanBerechnen(welt, seed = welt.seed ?? 1) {
  if (welt._flugplan !== undefined) return welt._flugplan;
  const rnd = zufall((seed ^ 0x4a4f4e) >>> 0);
  const L = A400M.landeStrecke, B = A400M.landeBreite, W = BREITE * KACHEL, H = HOEHE * KACHEL;
  const kandidaten = [];
  for (let y = B; y < H - B; y += SCHRITT) for (let x = B; x < W - B; x += SCHRITT) {
    if (!frei(welt, x, y, B / 2)) continue;
    for (const w of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      const ex = x + Math.cos(w) * L, ey = y + Math.sin(w) * L;
      if (ex < B || ey < B || ex > W - B || ey > H - B) continue;
      if (streifenFrei(welt, x, y, w, L, B)) kandidaten.push({ x, y, w });
    }
  }
  // Mischen mit dem Zufall der Welt (nie sort mit Zufall), dann der erste Kandidat mit erreichbarem Hubschrauberplatz
  for (let i = kandidaten.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [kandidaten[i], kandidaten[j]] = [kandidaten[j], kandidaten[i]]; }
  for (const k of kandidaten.slice(0, 40)) {
    const c = Math.cos(k.w), s = Math.sin(k.w);
    const mitte = { x: k.x + c * (L - A400M.laenge / 2 - 40), y: k.y + s * (L - A400M.laenge / 2 - 40) };   // Rumpfmitte nach der Landerolle
    const start = { x: mitte.x - c * A400M.rollweg, y: mitte.y - s * A400M.rollweg };                       // Rumpfmitte beim Aufsetzen
    const rampe = { x: mitte.x - c * A400M.heck, y: mitte.y - s * A400M.heck };
    const heli = hubschrauberPlatz(welt, rampe, rnd);
    if (heli) return welt._flugplan = { w: k.w, start, mitte, rampe, heli };
  }
  return welt._flugplan = null;
}

function hubschrauberPlatz(welt, rampe, rnd) {
  const W = BREITE * KACHEL, H = HOEHE * KACHEL, liste = [];
  for (let n = 0; n < 160 && liste.length < 6; n++) {
    const a = rnd() * Math.PI * 2, d = HELI_ABSTAND[0] + rnd() * (HELI_ABSTAND[1] - HELI_ABSTAND[0]);
    const x = rampe.x + Math.cos(a) * d, y = rampe.y + Math.sin(a) * d;
    if (x < 200 || y < 200 || x > W - 200 || y > H - 200) continue;
    if (!frei(welt, x, y, HELI_RAD)) continue;
    liste.push({ x, y });
  }
  for (const p of liste) if (findeWeg(welt, rampe.x, rampe.y, p.x, p.y, 11, 40000, true)) return p;
  return null;
}

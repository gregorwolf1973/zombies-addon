// Spurhilfe für fahrbare Fahrzeuge (server/fahrbar.mjs): Straßenrichtung an einer Stelle der Welt.
// Amtliche/OSM-Karten: aus den Straßenlinien (welt.vektor.strassen, Kacheln) einmal je Welt ein dünnes Raster (Zellen 16 px) mit der
// Richtung der Fahrbahn (Winkel 0…π, Fahrtrichtung egal); Kreuzungen (Richtungen weichen > 15° ab) bekommen keine Richtung.
// Kachelkarten ohne Vektordaten: Straßenkachel, deren Straße in einer Achse deutlich länger läuft als in der anderen.
// Deterministisch, ohne Zufall; Abfrage = ein Map-Zugriff.
import { KACHEL, T } from '../client/welt.mjs';
import { fahrbahnBreite } from '../client/vektor.mjs';

const ZELLE = 16;                                       // px
const KEINE = new Set(['footway', 'path', 'cycleway', 'track', 'steps', 'pedestrian', 'bridleway', 'piste']);
const KREUZUNG = 15 * Math.PI / 180;
const cache = new WeakMap();
const modPi = w => { w %= Math.PI; return w < 0 ? w + Math.PI : w; };
const abstandPi = (a, b) => { const d = Math.abs(a - b) % Math.PI; return Math.min(d, Math.PI - d); };

// Richtungsraster aus Straßenlinien [{ t, p: [x0, y0, x1, y1, …] (Kacheln), ref, spuren, breite }]
export function richtungsRaster(strassen) {
  const raster = new Map();   // Zellschlüssel → Winkel (NaN = Kreuzung)
  for (const s of strassen ?? []) {
    if (!s?.p || s.p.length < 4 || KEINE.has(s.t)) continue;
    const hw = fahrbahnBreite({ t: s.t, ref: s.ref, spuren: Number(s.spuren) || 0, breite: parseFloat(s.breite) || 0 }) / 2 + 2;
    for (let i = 0; i + 3 < s.p.length; i += 2) {
      const ax = s.p[i] * KACHEL, ay = s.p[i + 1] * KACHEL, dx = s.p[i + 2] * KACHEL - ax, dy = s.p[i + 3] * KACHEL - ay, l2 = dx * dx + dy * dy;
      if (l2 < 1) continue;
      const w = modPi(Math.atan2(dy, dx));
      const zx0 = Math.floor((Math.min(ax, ax + dx) - hw) / ZELLE), zx1 = Math.floor((Math.max(ax, ax + dx) + hw) / ZELLE);
      const zy0 = Math.floor((Math.min(ay, ay + dy) - hw) / ZELLE), zy1 = Math.floor((Math.max(ay, ay + dy) + hw) / ZELLE);
      for (let zy = zy0; zy <= zy1; zy++) for (let zx = zx0; zx <= zx1; zx++) {
        const px = (zx + 0.5) * ZELLE, py = (zy + 0.5) * ZELLE;
        let t = ((px - ax) * dx + (py - ay) * dy) / l2; t = t < 0 ? 0 : t > 1 ? 1 : t;
        const qx = ax + dx * t - px, qy = ay + dy * t - py;
        if (qx * qx + qy * qy > hw * hw) continue;
        const k = zy * 100000 + zx, alt = raster.get(k);
        if (alt === undefined) raster.set(k, w);
        else if (!Number.isNaN(alt) && abstandPi(alt, w) > KREUZUNG) raster.set(k, NaN);
      }
    }
  }
  return raster;
}

// Kachelkarte: Länge der Straße durch Kachel (kx, ky) in x- bzw. y-Richtung (höchstens ±4 Kacheln)
function kachelRichtung(welt, x, y) {
  const kx = Math.floor(x / KACHEL), ky = Math.floor(y / KACHEL);
  if (welt.hole(kx, ky) !== T.STRASSE) return null;
  const lauf = (ux, uy) => { let n = 0; for (const s of [1, -1]) for (let i = 1; i <= 4 && welt.hole(kx + ux * i * s, ky + uy * i * s) === T.STRASSE; i++) n++; return n; };
  const h = lauf(1, 0), v = lauf(0, 1);
  if (h >= 5 && v <= 2) return 0;
  if (v >= 5 && h <= 2) return Math.PI / 2;
  return null;
}

// Fahrbahnrichtung (0…π) an (x, y) in Pixeln oder null (keine Straße, Kreuzung, drinnen)
export function strassenRichtung(welt, x, y) {
  if (!welt || welt.kachel || welt.ebene) return null;
  const linien = welt.vektor?.strassen;
  if (linien?.length) {
    let r = cache.get(welt);
    if (!r) { r = richtungsRaster(linien); cache.set(welt, r); }
    const w = r.get(Math.floor(y / ZELLE) * 100000 + Math.floor(x / ZELLE));
    return w === undefined || Number.isNaN(w) ? null : w;
  }
  return typeof welt.hole === 'function' ? kachelRichtung(welt, x, y) : null;
}

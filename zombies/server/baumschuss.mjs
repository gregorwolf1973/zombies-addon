// Schießen durch Wald: Bäume verdecken Ziele nicht ganz (wie die Zombie-Sicht, sichtGuete), mindern aber die Trefferchance.
import { KACHEL, T, sichtGuete } from '../client/welt.mjs';

export const NAH_SCHUSS = KACHEL * 0.75;   // 3 m (4 m je Kachel): wer so nah ist, wird immer anvisiert und normal getroffen

// Güte 0..1 des Schusses auf z: 0 = Wand/Innentür/Leer im Weg; Nahangreifer immer 1
export function schussGuete(welt, x, y, z, angreift = false) {
  const g = sichtGuete(welt, x, y, z.x, z.y);
  if (g <= 0) return 0;
  return angreift || Math.hypot(z.x - x, z.y - y) < NAH_SCHUSS ? 1 : g;
}

// bestes Ziel: kleinste effektive Distanz d / Güte innerhalb der Reichweite (echte Distanz)
// kandidaten: [[id, z, angreift?], …]; Ergebnis [id, z, guete] oder null
export function waehleZiel(welt, kandidaten, x, y, reichweite) {
  let best = null, bw = Infinity;
  for (const [id, z, angreift] of kandidaten) {
    const d = Math.hypot(z.x - x, z.y - y);
    if (d >= reichweite) continue;
    const g = schussGuete(welt, x, y, z, angreift);
    if (g <= 0) continue;
    const eff = d / g;
    if (eff < bw) { bw = eff; best = [id, z, g]; }
  }
  return best;
}

// Punkt der ersten Baumkachel (nicht Start/Ziel) auf der Linie, sonst null
export function ersterBaum(welt, x1, y1, x2, y2) {
  const d = Math.hypot(x2 - x1, y2 - y1), n = Math.ceil(d / (KACHEL / 3));
  const k1 = Math.floor(x1 / KACHEL) + ',' + Math.floor(y1 / KACHEL), k2 = Math.floor(x2 / KACHEL) + ',' + Math.floor(y2 / KACHEL);
  for (let i = 1; i < n; i++) {
    const x = x1 + (x2 - x1) * i / n, y = y1 + (y2 - y1) * i / n, kx = Math.floor(x / KACHEL), ky = Math.floor(y / KACHEL);
    const k = kx + ',' + ky;
    if (welt.hole(kx, ky) === T.BAUM && k !== k1 && k !== k2) return { x, y };
  }
  return null;
}

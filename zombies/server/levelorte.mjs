// Feste Orte der Level-Karten (Kachelkoordinaten aus client/karten/LEVELORTE.md): Hubschrauberplatz (Kochel) und Bunkertor (Andermatt).
// Wird nach dem Weltaufbau gesetzt (raum.mjs); der Weltaufbau und der Fingerabdruck bleiben unberührt.
import { KACHEL, frei } from '../client/welt.mjs';

export const LEVELORTE = {
  kochel: { heliplatz: { kx: 169, ky: 207, reserve: [[168, 207], [169, 208]], radius: 70 } },
  andermatt: { bunkertor: { kx: 222, ky: 9, reserve: [[271, 9], [198, 52], [58, 27], [73, 15]], radius: 40 } },
};

// Mitte der Kachel; ist sie nicht frei, die Reserve, danach die nächste freie Kachel im Umkreis
function freierPunkt(welt, o) {
  const mitte = (kx, ky) => ({ x: (kx + 0.5) * KACHEL, y: (ky + 0.5) * KACHEL });
  for (const [kx, ky] of [[o.kx, o.ky], ...(o.reserve ?? [])]) { const p = mitte(kx, ky); if (frei(welt, p.x, p.y, o.radius)) return p; }
  for (let r = 1; r <= 30; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
    const p = mitte(o.kx + dx, o.ky + dy);
    if (frei(welt, p.x, p.y, o.radius)) return p;
  }
  return mitte(o.kx, o.ky);
}

// setzt welt.heliplatz / welt.bunkertor ({x, y} in Pixeln), falls die Karte welche hat
export function levelorteSetzen(welt, karte) {
  if (welt?.piste) {   // Landebahn (osmwelt.mjs, Karte mit 'piste'): Anfang West, Richtung w in rad, Länge/Breite in Pixeln
    const pi = welt.piste;
    welt.landebahn = { x: pi.x0 * KACHEL, y: pi.y0 * KACHEL, w: pi.w, laenge: pi.laenge * KACHEL, breite: pi.b * KACHEL };
  }
  const t = LEVELORTE[karte];
  if (!t || !welt) return;
  for (const [name, o] of Object.entries(t)) welt[name] = freierPunkt(welt, o);
}

// Fensterlicht nachts im Innenraum (nur Darstellung, kein Weltcode): Durch die Fenster EINER Hausseite fällt schwaches Licht der Straßenlaterne.
// Lichtseite = Seite (im gedrehten Feinraster: n/s/w/o), die der nächsten Laterne zugewandt ist; ohne Laterne in der Nähe: Seite zur nächsten Straße.
// Die Flecken werden einmal je Ebene berechnet (siehe spiel.mjs innenAnsicht) und nur noch in die Abdunklung radiert.
import { fensterPositionen } from './innen_fein_bild.mjs';
import { INNEN_Z } from './innen_fein.mjs';

const LATERNE_MAX = 480;   // px (60 m): weiter weg zählt keine Laterne

// Richtung (Weltpixel) vom Haus zur nächsten Laterne bzw. Straße, oder null
export function lichtRichtungWelt(haus, laternen, welt, KACHEL, STRASSE) {
  const cx = (haus.x + haus.b / 2) * KACHEL, cy = (haus.y + haus.h / 2) * KACHEL;
  let best = null, bd = LATERNE_MAX * LATERNE_MAX;
  for (const l of laternen ?? []) {
    const dx = l.x - cx, dy = l.y - cy, d = dx * dx + dy * dy;
    if (d < bd) { bd = d; best = [dx, dy]; }
  }
  if (best) return best;
  const tx = Math.floor(cx / KACHEL), ty = Math.floor(cy / KACHEL);
  let bs = 1e9;
  for (let r = 1; r <= 16; r++) {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      if (welt.hole(tx + dx, ty + dy) !== STRASSE) continue;
      const d = dx * dx + dy * dy;
      if (d < bs) { bs = d; best = [dx * KACHEL, dy * KACHEL]; }
    }
    if (best) break;
  }
  return best;
}

// Weltrichtung → Seite des Innenrasters (Raster ist an der längsten Hauskante gedreht: zuKarte() liefert die Achsen)
export function lichtSeite(w, richtungWelt) {
  if (!richtungWelt || !w.zuKarte) return null;
  const a = w.zuKarte(0, 0), bx = w.zuKarte(1000 * 1, 0), by = w.zuKarte(0, 1000);
  const ux = [bx[0] - a[0], bx[1] - a[1]], uy = [by[0] - a[0], by[1] - a[1]];   // Raster-x und Raster-y in Weltpixeln (je 1000 px lang)
  const lx = (richtungWelt[0] * ux[0] + richtungWelt[1] * ux[1]) / 1000, ly = (richtungWelt[0] * uy[0] + richtungWelt[1] * uy[1]) / 1000;
  if (Math.abs(lx) > Math.abs(ly)) return lx > 0 ? 'o' : 'w';
  return ly > 0 ? 's' : 'n';
}

// Lichtflecken (Ellipsen aus drei weichen Pinseln je Fenster, nach innen breiter): [{ x, y, sx, sy }] in Pixeln des Innenbilds,
// sx/sy = Skalierung des 256-px-Pinsels
export function fensterFlecken(w, seite) {
  if (!seite || !w.kachel) return [];
  const innen = { n: [0, 1], s: [0, -1], w: [1, 0], o: [-1, 0] }[seite];
  const quer = seite === 'n' || seite === 's';   // Wand waagrecht: Fenster liegen entlang x
  const aus = [];
  for (const f of fensterPositionen(w)) {
    if (f.richtung !== seite) continue;
    const mx = quer ? f.x + f.n / 2 : f.x + 1, my = quer ? f.y + 1 : f.y + f.n / 2;   // Fenstermitte (Zellen), Wand ist 2 Zellen dick
    for (const t of [0.9, 1.9, 3.0]) {   // Tiefe in m, Lichtfleck wird breiter
      const tz = t * 4, along = f.n / 2 + tz * 0.55, across = 1.1 * tz;   // Halbachsen in Zellen
      const px = (mx + innen[0] * tz * 0.9) * INNEN_Z, py = (my + innen[1] * tz * 0.9) * INNEN_Z;
      const ra = along * INNEN_Z * 2.2, rc = across * INNEN_Z * 1.9;   // Pinsel hat weichen Rand: großzügig
      aus.push(quer ? { x: px, y: py, sx: ra / 128, sy: rc / 128 } : { x: px, y: py, sx: rc / 128, sy: ra / 128 });
    }
  }
  return aus;
}

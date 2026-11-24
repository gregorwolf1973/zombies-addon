// Wegefeld-Hilfe: Die Kachelkarte (4 m) ist gröber als das Feinraster (1 m, `welt.fein`). Schmale, schräge Durchgänge
// (Innenhof-Eingänge, Passagen) sind im Feinraster offen, obwohl die Kacheln dort als Wand zählen oder ihre Mitte nicht frei ist.
// Ohne diese Hilfe führt das Wegefeld nie hindurch, die Zombies kommen nicht zum Spieler im Hof.
// Serverlaufzeit, kein Weltcode (nur Prüfung gegen das fertige Feinraster, Ergebnis wird je Welt zwischengespeichert).
import { KACHEL, BREITE, HOEHE, WERTE as W, freiBewegung } from '../client/welt.mjs';

const ENG = () => W.spielerRadius;   // Engpassbreite: wo ein Spieler durchpasst, kommt der Zombie im Engpass auch durch (siehe zombieGehen)
const cache = new WeakMap();   // Welt -> { z: Uint8Array (0 unbekannt, 1 Mitte frei, 2 Ersatzpunkt, 3 keiner), x, y: Float32Array }

function speicher(welt) {
  let c = cache.get(welt);
  if (!c || c.n !== BREITE * HOEHE) cache.set(welt, c = { n: BREITE * HOEHE, z: new Uint8Array(BREITE * HOEHE), x: new Float32Array(BREITE * HOEHE), y: new Float32Array(BREITE * HOEHE) });
  return c;
}

// Zielpunkt einer Kachel für das Wegefeld: die Mitte, wenn dort ein Spieler hinpasst, sonst der nächste freie Punkt der Kachel
// (Raster 8 px, Mitte zuerst, dann nach Abstand), sonst null. Nur draußen mit Feinraster.
export function feinZiel(welt, kx, ky) {
  if (!welt.fein || welt.kachel || welt.ebene || kx < 0 || ky < 0 || kx >= BREITE || ky >= HOEHE) return null;
  const c = speicher(welt), i = ky * BREITE + kx, mx = (kx + 0.5) * KACHEL, my = (ky + 0.5) * KACHEL, r = ENG();
  if (!c.z[i]) {
    if (freiBewegung(welt, mx, my, r)) c.z[i] = 1;
    else {
      let bd = Infinity;
      c.z[i] = 3;
      for (let oy = 4; oy < KACHEL; oy += 8) for (let ox = 4; ox < KACHEL; ox += 8) {
        const px = kx * KACHEL + ox, py = ky * KACHEL + oy, d = (px - mx) * (px - mx) + (py - my) * (py - my);
        if (d < bd && freiBewegung(welt, px, py, r)) { bd = d; c.z[i] = 2; c.x[i] = px; c.y[i] = py; }
      }
    }
  }
  return c.z[i] === 1 ? { x: mx, y: my } : c.z[i] === 2 ? { x: c.x[i], y: c.y[i] } : null;
}

// Darf das Wegefeld von Kachel (x,y) in die (nach Kachelkarte gesperrte) Nachbarkachel (nx,ny) laufen?
// Ja, wenn die Nachbarkachel einen freien Punkt hat und die Gerade dorthin für die Engpassbreite frei ist.
export function feinDurchgang(welt, x, y, nx, ny) {
  const a = feinZiel(welt, x, y), b = feinZiel(welt, nx, ny);
  if (!a || !b) return false;
  const r = ENG(), n = Math.max(1, Math.ceil(Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y)) / 4));
  for (let k = 1; k <= n; k++) if (!freiBewegung(welt, a.x + (b.x - a.x) * k / n, a.y + (b.y - a.y) * k / n, r)) return false;
  return true;
}

// Zielpunkt für die Richtung zur Nachbarkachel: Ersatzpunkt (falls die Mitte nicht passt), sonst die Kachelmitte
export function feldZielpunkt(welt, kx, ky) {
  if (!welt.fein || welt.kachel || welt.ebene) return { x: (kx + 0.5) * KACHEL, y: (ky + 0.5) * KACHEL };
  return feinZiel(welt, kx, ky) ?? { x: (kx + 0.5) * KACHEL, y: (ky + 0.5) * KACHEL };
}

// Kachel neu prüfen lassen (z. B. nachdem ein Panzer dort einen Zaun plattgewalzt hat, server/walze.mjs)
export function feinZielVergessen(welt, kx, ky) {
  const c = cache.get(welt);
  if (c && kx >= 0 && ky >= 0 && kx < BREITE && ky < HOEHE) c.z[ky * BREITE + kx] = 0;
}

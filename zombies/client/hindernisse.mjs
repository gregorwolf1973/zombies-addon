// Superuser-Anzeige „Hindernisse zeigen“: rechnet für ein Rechteck von 1-m-Feldern aus, wo die Spielfigur nicht durchkommt –
// mit genau der Logik der Bewegung (welt.mjs frei(): feines Raster, sonst grobe Kacheln, Kreis mit Spielerradius).
// Reine Rechnung ohne Phaser (testbar); spiel.mjs legt das Ergebnis als halbtransparentes Bild über die Welt.
import { FEIN, FEIN_PX, BREITE, HOEHE, T, BLOCKIERT, WERTE, frei } from './welt.mjs';

// Feldcodes
export const H_FREI = 0, H_FEST = 1, H_ZAUN = 2, H_FLANDERN = 3, H_RAND = 4;
// Farben (RGBA je Code): Rand = Figurmitte darf nicht hin (Spielerradius), Rest = das Hindernis selbst
export const H_FARBEN = [
  [0, 0, 0, 0],
  [235, 30, 30, 120],     // fest (Wand, Wasser, Deko …)
  [255, 150, 20, 120],    // Zaun/Hecke (Mensch kommt nur per Übersteigen durch)
  [190, 40, 220, 120],    // Flandernzaun
  [235, 30, 30, 48],      // Randstreifen durch den Radius der Figur
];

// Felder fx0..fx0+nx-1 × fy0..fy0+ny-1 (Feld = 8 px). Rückgabe: Uint8Array nx*ny mit Codes.
// grenze (optional): { x0, y0, x1, y1 } in Kacheln – außerhalb bleibt alles frei (Innenräume zeigen nur ihr Haus).
export function hindernisFelder(welt, fx0, fy0, nx, ny, rad = WERTE.spielerRadius, grenze = null) {
  const aus = new Uint8Array(nx * ny), f = welt.fein, fb = BREITE * FEIN;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const fx = fx0 + i, fy = fy0 + j, kx = Math.floor(fx / FEIN), ky = Math.floor(fy / FEIN);
    if (grenze && (kx < grenze.x0 || ky < grenze.y0 || kx >= grenze.x1 || ky >= grenze.y1)) continue;
    let code = H_FREI;
    if (f) {
      const inn = fx >= 0 && fy >= 0 && fx < fb && fy < HOEHE * FEIN;
      const v = inn ? f[fy * fb + fx] : 1;
      code = v === 0 ? H_FREI : v === 2 ? H_ZAUN : v === 4 ? H_FLANDERN : H_FEST;
    } else {
      const t = welt.hole(kx, ky);
      code = !BLOCKIERT.has(t) ? H_FREI : t === T.ZAUN ? H_ZAUN : H_FEST;
    }
    if (code === H_FREI && !frei(welt, (fx + 0.5) * FEIN_PX, (fy + 0.5) * FEIN_PX, rad)) code = H_RAND;   // Figur (Kreis) passt mit der Mitte hier nicht hin
    aus[j * nx + i] = code;
  }
  return aus;
}

// Maßstäbliche Innenräume (welt.kachel): ein Feld = eine Zelle (0,25 m); Grenze = Rastergröße des Raums
export function hindernisFelderFein(welt, fx0, fy0, nx, ny, rad = WERTE.spielerRadius) {
  const aus = new Uint8Array(nx * ny), K = welt.kachel;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const fx = fx0 + i, fy = fy0 + j, t = welt.hole(fx, fy);
    let code = H_FREI;
    if (BLOCKIERT.has(t)) code = H_FEST;
    else if (!frei(welt, (fx + 0.5) * K, (fy + 0.5) * K, rad)) code = H_RAND;
    aus[j * nx + i] = code;
  }
  return aus;
}

// Codes → RGBA-Bytes (für ImageData)
export function hindernisPixel(codes, ziel) {
  for (let i = 0; i < codes.length; i++) { const c = H_FARBEN[codes[i]]; ziel[i * 4] = c[0]; ziel[i * 4 + 1] = c[1]; ziel[i * 4 + 2] = c[2]; ziel[i * 4 + 3] = c[3]; }
  return ziel;
}

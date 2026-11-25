// Superuser-Anzeige „Hindernisse zeigen“: rechnet für ein Rechteck von 1-m-Feldern aus, wo die Spielfigur nicht durchkommt –
// mit genau der Logik der Bewegung (welt.mjs frei(): feines Raster, sonst grobe Kacheln, Kreis mit Spielerradius).
// Reine Rechnung ohne Phaser (testbar); spiel.mjs legt das Ergebnis als halbtransparentes Bild über die Welt.
import { FEIN, FEIN_PX, BREITE, HOEHE, T, BLOCKIERT, WERTE, frei, zaunIndex, zaunStueck } from './welt.mjs';
import { parkRechteckeIn } from './fzkollision.mjs';
import { staemmeIn, STAMM_R } from './walze.mjs';

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

// ---------- Superuser „Kollision zeigen“: Umrisse statt Flächen ----------
// Rechnet für das Rechteck (px) die Sperrflächen genau so, wie die Bewegung sie prüft (welt.mjs freiBewegung): feste Felder und Flandernzaun
// als Feldkanten, Zäune/Hecken als die Linienstücke in den noch stehenden Zaunfeldern (Halbdicke je Art, zaunImFeld), Zaunfelder ohne Linie
// als Feldkanten; dazu geparkte Autos (Klettern, 50 % Tempo) und Baumstämme (sperren nur Fahrzeuge). Reine Rechnung, spiel.mjs zeichnet.
// Rückgabe: { fest, flandern, zaunFeld: [[x1, y1, x2, y2] …], zaun: [{ ax, ay, bx, by, h }], autos: [{ x, y, c, s, hl, hb }], staemme: [{ x, y, r }] }
export const K_FARBEN = { fest: 0xff3b3b, flandern: 0xd04cff, zaunFeld: 0xffe14d, zaun: 0xff9a1a, auto: 0x3ad0ff, fahrzeug: 0xff4dd2, stamm: 0x5cff6a, figur: 0xffffff };
export function kollisionsUmrisse(welt, x0, y0, x1, y1) {
  const aus = { fest: [], flandern: [], zaunFeld: [], zaun: [], autos: [], staemme: [] };
  const f = welt?.fein;
  if (!f || welt.kachel || welt.ebene) return aus;
  const fb = BREITE * FEIN, fh = HOEHE * FEIN, zi = zaunIndex(welt);
  const fx0 = Math.max(0, Math.floor(x0 / FEIN_PX)), fx1 = Math.min(fb - 1, Math.floor(x1 / FEIN_PX));
  const fy0 = Math.max(0, Math.floor(y0 / FEIN_PX)), fy1 = Math.min(fh - 1, Math.floor(y1 / FEIN_PX));
  // Klasse je Feld: 0 frei/Zaun mit Linie, 1 fest, 2 Flandern, 3 Zaunfeld ohne Linie
  const kl = (fx, fy) => {
    if (fx < 0 || fy < 0 || fx >= fb || fy >= fh) return 1;
    const i = fy * fb + fx, v = f[i];
    return !v || v === 5 ? 0 : v === 4 ? 2 : v === 2 ? (zi?.map.get(i) ? 0 : 3) : 1;   // 5 = Container: Umriss unten genau
  };
  const ziel = [null, aus.fest, aus.flandern, aus.zaunFeld];
  // waagrechte Kanten (oben/unten je Feld) zeilenweise zusammenfassen, senkrechte spaltenweise
  for (let fy = fy0; fy <= fy1 + 1; fy++) {
    let lauf = null;
    for (let fx = fx0; fx <= fx1 + 1; fx++) {
      const a = fx <= fx1 ? kl(fx, fy - 1) : -1, b = fx <= fx1 ? kl(fx, fy) : -1, k = a !== b ? Math.max(a, b) : 0;
      if (lauf && lauf.k !== k) { if (lauf.k > 0) ziel[lauf.k].push([lauf.fx * FEIN_PX, fy * FEIN_PX, fx * FEIN_PX, fy * FEIN_PX]); lauf = null; }
      if (!lauf && k > 0) lauf = { k, fx };
    }
  }
  for (let fx = fx0; fx <= fx1 + 1; fx++) {
    let lauf = null;
    for (let fy = fy0; fy <= fy1 + 1; fy++) {
      const a = fy <= fy1 ? kl(fx - 1, fy) : -1, b = fy <= fy1 ? kl(fx, fy) : -1, k = a !== b ? Math.max(a, b) : 0;
      if (lauf && lauf.k !== k) { if (lauf.k > 0) ziel[lauf.k].push([fx * FEIN_PX, lauf.fy * FEIN_PX, fx * FEIN_PX, fy * FEIN_PX]); lauf = null; }
      if (!lauf && k > 0) lauf = { k, fy };
    }
  }
  // Zaunlinien: Stücke in stehenden Zaunfeldern, je Linienstück zu durchgehenden Abschnitten verbunden
  if (zi) {
    const stuecke = new Map();   // Segment → [[t0, t1] …]
    for (let fy = fy0; fy <= fy1; fy++) for (let fx = fx0; fx <= fx1; fx++) {
      const i = fy * fb + fx;
      if (f[i] !== 2) continue;
      for (const s of zi.map.get(i) ?? []) {
        const o = s * 5, t = zaunStueck(zi.seg[o], zi.seg[o + 1], zi.seg[o + 2], zi.seg[o + 3], fx, fy);
        if (t) (stuecke.get(s) ?? stuecke.set(s, []).get(s)).push([t[0], t[1]]);
      }
    }
    for (const [s, l] of stuecke) {
      const o = s * 5, ax = zi.seg[o], ay = zi.seg[o + 1], dx = zi.seg[o + 2] - ax, dy = zi.seg[o + 3] - ay, h = zi.seg[o + 4];
      l.sort((p, q) => p[0] - q[0]);
      let a = l[0][0], b = l[0][1];
      const raus = () => aus.zaun.push({ ax: ax + dx * a, ay: ay + dy * a, bx: ax + dx * b, by: ay + dy * b, h });
      for (let j = 1; j < l.length; j++) { if (l[j][0] <= b + 1e-6) { if (l[j][1] > b) b = l[j][1]; } else { raus(); a = l[j][0]; b = l[j][1]; } }
      raus();
    }
  }
  for (const k of welt.kaesten ?? []) if (k.x1 >= x0 && k.x0 <= x1 && k.y1 >= y0 && k.y0 <= y1) aus.fest.push([k.x0, k.y0, k.x1, k.y0], [k.x1, k.y0, k.x1, k.y1], [k.x1, k.y1, k.x0, k.y1], [k.x0, k.y1, k.x0, k.y0]);
  for (const r of parkRechteckeIn(welt, x0, y0, x1, y1)) aus.autos.push({ x: r.x, y: r.y, c: r.c, s: r.s, hl: r.hl, hb: r.hb });
  for (const b of staemmeIn(welt, x0, y0, x1, y1)) aus.staemme.push({ x: b.x, y: b.y, r: STAMM_R });
  return aus;
}

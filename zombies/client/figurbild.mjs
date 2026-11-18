// Spielerfiguren umfärben: Die Vorlage (grafik/figuren.png) hat rote Haare und blaue Kleidung.
// Diese beiden Farben werden durch die gewählten ersetzt; Schattierung und Umriss bleiben erhalten.

export const HAARFARBEN = [
  { name: 'Schwarz', rgb: [40, 34, 32] }, { name: 'Braun', rgb: [110, 66, 34] }, { name: 'Blond', rgb: [226, 186, 102] },
  { name: 'Rot', rgb: [196, 62, 34] }, { name: 'Grau', rgb: [160, 160, 156] }, { name: 'Lila', rgb: [140, 70, 170] },
];
export const KLEIDFARBEN = [
  { name: 'Blau', rgb: [40, 90, 200] }, { name: 'Rot', rgb: [190, 40, 40] }, { name: 'Grün', rgb: [50, 140, 60] },
  { name: 'Gelb', rgb: [230, 190, 40] }, { name: 'Schwarz', rgb: [45, 45, 50] }, { name: 'Weiß', rgb: [230, 230, 225] },
  { name: 'Orange', rgb: [235, 120, 30] }, { name: 'Lila', rgb: [120, 60, 160] },
];
export const WAFFEN_BILD = ['hand', 'pistole', 'schlaeger', 'messer'];

export function aussehenLesen(text) {
  const m = /^([mw]),([0-5]),([0-7])$/.exec(String(text ?? ''));
  return m ? { g: m[1], haar: Number(m[2]), kleid: Number(m[3]) } : { g: 'm', haar: 1, kleid: 0 };
}
export const aussehenText = a => `${a.g},${a.haar},${a.kleid}`;

// Farbton (0–360) und Sättigung (0–1) eines Pixels
function farbton(r, g, b) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  if (d === 0) return [0, 0, max];
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60; if (h < 0) h += 360;
  return [h, d / max, max];
}

// zeichnet Feld nr (Quadrat feld×feld) aus dem Bogen umgefärbt in ctx bei (zx, zy)
export function umgefaerbt(ctx, bogen, feld, nr, spalten, zx, zy, aussehen) {
  const sx = (nr % spalten) * feld, sy = Math.floor(nr / spalten) * feld;
  const c = document.createElement('canvas'); c.width = c.height = feld;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(bogen, sx, sy, feld, feld, 0, 0, feld, feld);
  const bild = g.getImageData(0, 0, feld, feld), d = bild.data;
  const haar = HAARFARBEN[aussehen.haar]?.rgb ?? HAARFARBEN[1].rgb, kleid = KLEIDFARBEN[aussehen.kleid]?.rgb ?? KLEIDFARBEN[0].rgb;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 16) continue;
    const [h, s, v] = farbton(d[i], d[i + 1], d[i + 2]);
    if (s < 0.45 || v < 40) continue;
    let ziel = null;
    if (h < 14 || h > 345) ziel = haar;                       // reines Rot der Vorlage → Haare
    else if (h > 205 && h < 255) ziel = kleid;                 // reines Blau → Kleidung
    if (!ziel) continue;
    const k = Math.min(1.25, v / 225);                         // Helligkeit der Vorlage überträgt die Schattierung
    d[i] = Math.min(255, ziel[0] * k); d[i + 1] = Math.min(255, ziel[1] * k); d[i + 2] = Math.min(255, ziel[2] * k);
  }
  g.putImageData(bild, 0, 0);
  ctx.drawImage(c, zx, zy);
}

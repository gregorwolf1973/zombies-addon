// Glatte Gewässer: aus den Wasserkacheln wird eine weich gerechnete Dichte (3×3-Binomial) und daraus per Marching Squares
// eine Uferlinie gezogen, die zusätzlich einmal abgerundet wird. Nur Zeichnung – Kollision bleibt beim Kachelraster.
import { KACHEL, BREITE, HOEHE, T } from './welt.mjs';

const K = KACHEL, SCHWELLE = 0.45;

function hash(x, y) {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// 1 = Wasser; eine Straße/Platz mit Wasser auf zwei gegenüberliegenden Seiten ist eine Brücke und zählt als Wasser
function wasserFeld(welt) {
  const f = new Float32Array(BREITE * HOEHE);
  const w = (x, y) => x >= 0 && y >= 0 && x < BREITE && y < HOEHE && welt.hole(x, y) === T.WASSER;
  for (let y = 0; y < HOEHE; y++) for (let x = 0; x < BREITE; x++) {
    const t = welt.hole(x, y);
    if (t === T.WASSER) f[y * BREITE + x] = 1;
    else if ((t === T.STRASSE || t === T.PLATZ) && ((w(x - 1, y) && w(x + 1, y)) || (w(x, y - 1) && w(x, y + 1)))) f[y * BREITE + x] = 1;
  }
  return f;
}

// Abrunden (Chaikin) einer geschlossenen Linie
function runde(p) {
  const n = p.length, q = [];
  for (let i = 0; i < n; i++) {
    const [ax, ay] = p[i], [bx, by] = p[(i + 1) % n];
    q.push([ax * 0.75 + bx * 0.25, ay * 0.75 + by * 0.25], [ax * 0.25 + bx * 0.75, ay * 0.25 + by * 0.75]);
  }
  return q;
}

// geschlossene Uferlinien (Pixelkoordinaten) um alle Gewässer; Gitter ringsum mit Rand 0 → alles bleibt geschlossen
export function wasserLinien(welt) {
  if (welt._wasser) return welt._wasser;
  const f = wasserFeld(welt);
  const B = BREITE + 2, H = HOEHE + 2;                       // Gitter mit 1 Kachel Rand (Wert 0)
  const g = new Float32Array(B * H);
  const v = (x, y) => (x < 0 || y < 0 || x >= BREITE || y >= HOEHE ? 0 : f[y * BREITE + x]);
  for (let y = 0; y < H; y++) for (let x = 0; x < B; x++) {
    const X = x - 1, Y = y - 1;
    g[y * B + x] = (v(X, Y) * 4 + (v(X - 1, Y) + v(X + 1, Y) + v(X, Y - 1) + v(X, Y + 1)) * 2 + v(X - 1, Y - 1) + v(X + 1, Y - 1) + v(X - 1, Y + 1) + v(X + 1, Y + 1)) / 16;
  }
  // Randgitter selbst auf 0 setzen, damit am äußeren Rand nichts offen bleibt
  for (let x = 0; x < B; x++) { g[x] = 0; g[(H - 1) * B + x] = 0; }
  for (let y = 0; y < H; y++) { g[y * B] = 0; g[y * B + B - 1] = 0; }
  // Kantenpunkte: h-Kante (i,j)-(i+1,j) = id (j*B+i)*2, v-Kante (i,j)-(i,j+1) = id +1
  const punkt = new Map();
  const kante = (id) => {
    let p = punkt.get(id);
    if (p) return p;
    const e = id & 1, c = id >> 1, i = c % B, j = (c / B) | 0;
    const a = g[j * B + i], b = e ? g[(j + 1) * B + i] : g[j * B + i + 1];
    const t = (SCHWELLE - a) / (b - a || 1);
    const ax = i - 1 + 0.5, ay = j - 1 + 0.5;               // Kachelmitte (Gitter ist um 1 verschoben)
    p = e ? [(ax) * K, (ay + t) * K] : [(ax + t) * K, ay * K];
    punkt.set(id, p); return p;
  };
  const nachbar = new Map();
  const segment = (a, b) => {
    (nachbar.get(a) ?? nachbar.set(a, []).get(a)).push(b);
    (nachbar.get(b) ?? nachbar.set(b, []).get(b)).push(a);
  };
  for (let j = 0; j < H - 1; j++) for (let i = 0; i < B - 1; i++) {
    const tl = g[j * B + i], tr = g[j * B + i + 1], br = g[(j + 1) * B + i + 1], bl = g[(j + 1) * B + i];
    const fall = (tl >= SCHWELLE ? 1 : 0) | (tr >= SCHWELLE ? 2 : 0) | (br >= SCHWELLE ? 4 : 0) | (bl >= SCHWELLE ? 8 : 0);
    if (fall === 0 || fall === 15) continue;
    const o = (j * B + i) * 2, u = ((j + 1) * B + i) * 2, oben = o, unten = u, links = o + 1, rechts = o + 3;   // rechts: v-Kante (i+1,j) = ((j*B+i+1)*2)+1
    const mitte = (tl + tr + br + bl) / 4 >= SCHWELLE;
    switch (fall) {
      case 1: case 14: segment(links, oben); break;
      case 2: case 13: segment(oben, rechts); break;
      case 3: case 12: segment(links, rechts); break;
      case 4: case 11: segment(rechts, unten); break;
      case 6: case 9: segment(oben, unten); break;
      case 7: case 8: segment(links, unten); break;
      case 5: if (mitte) { segment(oben, rechts); segment(links, unten); } else { segment(links, oben); segment(rechts, unten); } break;
      case 10: if (mitte) { segment(links, oben); segment(rechts, unten); } else { segment(oben, rechts); segment(links, unten); } break;
    }
  }
  const benutzt = new Set(), linien = [];
  const ids = [...nachbar.keys()].sort((a, b) => a - b);     // feste Reihenfolge
  for (const start of ids) {
    if (benutzt.has(start)) continue;
    const kette = []; let akt = start, vor = -1;
    for (;;) {
      benutzt.add(akt); kette.push(kante(akt));
      const n = nachbar.get(akt).find(x => x !== vor && !benutzt.has(x));
      if (n === undefined) break;
      vor = akt; akt = n;
    }
    if (kette.length < 3) continue;
    const p = runde(kette);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of p) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    linien.push({ p, box: { x0, y0, x1, y1 } });
  }
  return (welt._wasser = linien);
}

function pfad(ctx, p) {
  ctx.moveTo((p[p.length - 1][0] + p[0][0]) / 2, (p[p.length - 1][1] + p[0][1]) / 2);   // Mittelpunktkurve: ganz glatt
  for (let i = 0; i < p.length; i++) {
    const a = p[i], b = p[(i + 1) % p.length];
    ctx.quadraticCurveTo(a[0], a[1], (a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
  }
  ctx.closePath();
}

// Kiesufer, Wasserfläche und Wellenstriche; rect in Kacheln, ctx ist schon verschoben
export function zeichneWasser(ctx, welt, rect) {
  const r = { x0: rect.x0 * K - 12, y0: rect.y0 * K - 12, x1: rect.x1 * K + 12, y1: rect.y1 * K + 12 };
  const sicht = wasserLinien(welt).filter(l => l.box.x1 >= r.x0 && l.box.x0 <= r.x1 && l.box.y1 >= r.y0 && l.box.y0 <= r.y1);
  if (!sicht.length) return;
  ctx.save();
  ctx.beginPath();
  for (const l of sicht) pfad(ctx, l.p);
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#d3bf8a'; ctx.lineWidth = 13; ctx.stroke();              // Kies: 6–7 px auf der Landseite
  ctx.fillStyle = '#2a7098'; ctx.fill('evenodd');
  ctx.save(); ctx.clip('evenodd');
  ctx.strokeStyle = 'rgba(20,60,90,.35)'; ctx.lineWidth = 5; ctx.stroke();    // dunkler Uferstreifen im Wasser
  ctx.strokeStyle = 'rgba(255,255,255,.18)'; ctx.lineWidth = 1.5; ctx.beginPath();
  const x0 = Math.max(0, rect.x0 - 1), x1 = Math.min(BREITE, rect.x1 + 1), y0 = Math.max(0, rect.y0 - 1), y1 = Math.min(HOEHE, rect.y1 + 1);
  for (let ky = y0; ky < y1; ky++) for (let kx = x0; kx < x1; kx++) {
    if (welt.hole(kx, ky) !== T.WASSER) continue;
    const wy = ky * K + 8 + hash(kx, ky) * 16, wx = kx * K + hash(ky, kx) * 12;
    ctx.moveTo(wx, wy); ctx.quadraticCurveTo(wx + 5, wy - 3, wx + 10, wy); ctx.quadraticCurveTo(wx + 15, wy + 3, wx + 20, wy);
  }
  ctx.stroke();
  ctx.restore();
  ctx.restore();
}

// Luftbild-Boden: Wasser fehlt als Hindernis im Foto → glatte, halbtransparente Fläche mit weichem Rand (kein Kachelraster)
export function zeichneWasserHauch(ctx, welt, rect) {
  const r = { x0: rect.x0 * K - 12, y0: rect.y0 * K - 12, x1: rect.x1 * K + 12, y1: rect.y1 * K + 12 };
  const sicht = wasserLinien(welt).filter(l => l.box.x1 >= r.x0 && l.box.x0 <= r.x1 && l.box.y1 >= r.y0 && l.box.y0 <= r.y1);
  if (!sicht.length) return;
  ctx.save();
  if ('filter' in ctx) ctx.filter = 'blur(2px)';
  ctx.beginPath();
  for (const l of sicht) pfad(ctx, l.p);
  ctx.fillStyle = 'rgba(42,112,152,.40)'; ctx.fill('evenodd');
  ctx.restore();
}

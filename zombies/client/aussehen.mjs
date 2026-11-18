// Aussehen der Welt im Stil des Einzelspieler-Prototyps.
// Die eigentlichen Zeichenfunktionen (Bäume, Häuser, Kühe …) stammen wörtlich aus dem Prototyp
// (proto_grafik.mjs, erzeugt von tools/baue_aussehen.py); hier wird nur unsere Karte darauf abgebildet.
import { KACHEL, BREITE, HOEHE, T } from './welt.mjs';
import { erzeugeZeichner } from './proto_grafik.mjs';
import { zeichneFlaechen, zeichneStrassen, zeichneVektorDaecher, zeichneVektorSafeDach } from './vektor.mjs';

const TAU = Math.PI * 2;

function hash(x, y) {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// weiche Helligkeitswolken über die Wiese (Wertrauschen)
function rauschen(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

const begehbarWiese = t => t === T.WIESE || t === T.BAUM;

// ---------- Bodenebene: alles Flache ----------
function safeMaske(welt) {
  if (welt._safeMaske) return welt._safeMaske;
  const m = new Uint8Array(BREITE * HOEHE);
  for (const h of welt.haeuser) if (h.safe) for (let y = h.y - 1; y <= h.y + h.h; y++) for (let x = h.x - 1; x <= h.x + h.b; x++) {
    if (x >= 0 && y >= 0 && x < BREITE && y < HOEHE) m[y * BREITE + x] = 1;
  }
  return (welt._safeMaske = m);
}

export function zeichneBoden(ctx, welt, rect = null) {
  const { x0, y0, x1, y1 } = rect ?? { x0: 0, y0: 0, x1: BREITE, y1: HOEHE };
  ctx.save();
  ctx.translate(-x0 * KACHEL, -y0 * KACHEL);
  // Wiese als Grundfläche mit Farbwolken
  ctx.fillStyle = '#4d8c3b';
  ctx.fillRect(x0 * KACHEL, y0 * KACHEL, (x1 - x0) * KACHEL, (y1 - y0) * KACHEL);
  for (let y = y0 * KACHEL; y < y1 * KACHEL; y += 8) for (let x = x0 * KACHEL; x < x1 * KACHEL; x += 8) {
    const n = rauschen(x / 90, y / 90) * 0.7 + rauschen(x / 23, y / 23) * 0.3;
    if (n > 0.55) { ctx.fillStyle = `rgba(110,170,80,${(n - 0.55) * 0.5})`; ctx.fillRect(x, y, 8, 8); }
    else if (n < 0.4) { ctx.fillStyle = `rgba(20,50,15,${(0.4 - n) * 0.45})`; ctx.fillRect(x, y, 8, 8); }
  }
  const vek = !!welt.vektor;
  if (vek) zeichneFlaechen(ctx, welt, { x0, y0, x1, y1 });
  for (let ky = y0; ky < y1; ky++) for (let kx = x0; kx < x1; kx++) {
    const t = welt.hole(kx, ky), px = kx * KACHEL, py = ky * KACHEL;
    const nb = (dx, dy) => welt.hole(kx + dx, ky + dy);
    if (vek && (t === T.STRASSE || t === T.PLATZ)) continue;   // kommen als glatte Linien/Flächen
    // Gebäude zeigt das Dach nach dem echten Umriss; Rasterwände nur in Safe Rooms (deren Dach wird durchsichtig)
    if (vek && (t === T.LEER || t === T.WAND || t === T.BODEN || t === T.TUER) && !safeMaske(welt)[ky * BREITE + kx]) continue;
    if (t === T.LEER) { ctx.fillStyle = '#5d4a40'; ctx.fillRect(px, py, KACHEL, KACHEL); continue; }
    const gart = welt.details?.garten[ky * BREITE + kx];
    if (gart && gart !== '.' && (t === T.WIESE || t === T.BAUM || t === T.ZAUN)) {
      // gepflegter Rasen: etwas heller, ohne Kachelkanten
      ctx.fillStyle = 'rgba(150,210,95,.13)'; ctx.fillRect(px, py, KACHEL, KACHEL);
    }
    if (begehbarWiese(t) || t === T.ZAUN) {
      // Grasbüschel
      ctx.strokeStyle = 'rgba(30,70,25,.55)'; ctx.lineWidth = 1; ctx.beginPath();
      for (let k = 0; k < 3; k++) {
        const x = px + hash(kx * 13 + k, ky * 7) * KACHEL, y = py + hash(kx * 7, ky * 13 + k) * KACHEL;
        ctx.moveTo(x - 3, y); ctx.lineTo(x - 1.5, y - 5); ctx.moveTo(x, y); ctx.lineTo(x + 0.5, y - 6.5); ctx.moveTo(x + 3, y); ctx.lineTo(x + 4, y - 4);
      }
      ctx.stroke();
      if (hash(kx * 3, ky * 5) < 0.06) {   // Wiesenblumen
        ctx.fillStyle = ['#fff59d', '#f8bbd0', '#ffffff', '#ce93d8'][Math.floor(hash(kx, ky * 9) * 4)];
        ctx.beginPath(); ctx.arc(px + hash(kx, ky) * 28 + 2, py + hash(ky, kx) * 28 + 2, 1.8, 0, TAU); ctx.fill();
      }
    }
    if (t === T.STRASSE) {
      const n = hash(kx, ky) * 10;
      ctx.fillStyle = `rgb(${86 + n},${88 + n},${92 + n})`; ctx.fillRect(px, py, KACHEL, KACHEL);
      ctx.fillStyle = 'rgba(0,0,0,.12)';
      for (let k = 0; k < 4; k++) ctx.fillRect(px + hash(kx + k, ky) * 30, py + hash(kx, ky + k) * 30, 2, 2);
      // Randlinie und Bordstein zur Nicht-Straße
      ctx.fillStyle = '#d7d2c4';
      if (nb(-1, 0) !== T.STRASSE && nb(-1, 0) !== T.PLATZ) ctx.fillRect(px, py, 3, KACHEL);
      if (nb(1, 0) !== T.STRASSE && nb(1, 0) !== T.PLATZ) ctx.fillRect(px + KACHEL - 3, py, 3, KACHEL);
      if (nb(0, -1) !== T.STRASSE && nb(0, -1) !== T.PLATZ) ctx.fillRect(px, py, KACHEL, 3);
      if (nb(0, 1) !== T.STRASSE && nb(0, 1) !== T.PLATZ) ctx.fillRect(px, py + KACHEL - 3, KACHEL, 3);
    } else if (t === T.PLATZ) {
      ctx.fillStyle = '#b9ae96'; ctx.fillRect(px, py, KACHEL, KACHEL);
      ctx.strokeStyle = 'rgba(90,80,60,.35)'; ctx.lineWidth = 1;
      for (let r = 0; r < 4; r++) for (let s = 0; s < 4; s++) {
        const off = (r % 2) * 4;
        ctx.strokeRect(px + s * 8 + off - 4 + 0.5, py + r * 8 + 0.5, 8, 8);
      }
    } else if (t === T.WASSER) {
      ctx.fillStyle = '#2a7098'; ctx.fillRect(px, py, KACHEL, KACHEL);
      ctx.strokeStyle = 'rgba(255,255,255,.18)'; ctx.lineWidth = 1.5; ctx.beginPath();
      const wy = py + 8 + hash(kx, ky) * 16, wx = px + hash(ky, kx) * 12;
      ctx.moveTo(wx, wy); ctx.quadraticCurveTo(wx + 5, wy - 3, wx + 10, wy); ctx.quadraticCurveTo(wx + 15, wy + 3, wx + 20, wy);
      ctx.stroke();
      // Ufer: Kiesstreifen zur Landseite
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const n = nb(dx, dy);
        if (n === T.WASSER || n === T.ZAUN) continue;
        ctx.fillStyle = '#d3bf8a';
        if (dx === -1) ctx.fillRect(px, py, 6, KACHEL);
        if (dx === 1) ctx.fillRect(px + KACHEL - 6, py, 6, KACHEL);
        if (dy === -1) ctx.fillRect(px, py, KACHEL, 6);
        if (dy === 1) ctx.fillRect(px, py + KACHEL - 6, KACHEL, 6);
      }
    } else if (t === T.BODEN || t === T.TUER) {
      ctx.fillStyle = t === T.TUER ? '#6d4c41' : '#b08a62'; ctx.fillRect(px, py, KACHEL, KACHEL);
      if (t === T.BODEN) {
        ctx.fillStyle = 'rgba(80,50,25,.35)';
        for (let i = 0; i < 4; i++) ctx.fillRect(px, py + i * 8 + 7, KACHEL, 1);
        ctx.fillRect(px + (ky % 2) * 16 + 8, py, 1, KACHEL);
      }
    } else if (t === T.WAND) {
      ctx.fillStyle = '#efe4d8'; ctx.fillRect(px, py, KACHEL, KACHEL);
      ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.fillRect(px, py + KACHEL - 4, KACHEL, 4);
    } else if (t === T.ZAUN && welt.details && kx > 0 && ky > 0 && kx < BREITE - 1 && ky < HOEHE - 1) {
      zaunTeil(ctx, welt.details.zaunart[ky * BREITE + kx], px, py, nb, kx, ky);
    } else if (t === T.ZAUN) {
      // Holzzaun: Latten zu den Nachbarzäunen, Pfosten in der Mitte
      const m = KACHEL / 2;
      ctx.fillStyle = 'rgba(0,0,0,.22)';
      if (nb(1, 0) === T.ZAUN) ctx.fillRect(px + m, py + m + 3, m, 4);
      if (nb(0, 1) === T.ZAUN) ctx.fillRect(px + m + 3, py + m, 4, m);
      ctx.fillStyle = '#a1887f';
      if (nb(-1, 0) === T.ZAUN) { ctx.fillRect(px, py + m - 5, m, 3); ctx.fillRect(px, py + m + 1, m, 3); }
      if (nb(1, 0) === T.ZAUN) { ctx.fillRect(px + m, py + m - 5, m, 3); ctx.fillRect(px + m, py + m + 1, m, 3); }
      if (nb(0, -1) === T.ZAUN) { ctx.fillRect(px + m - 5, py, 3, m); ctx.fillRect(px + m + 1, py, 3, m); }
      if (nb(0, 1) === T.ZAUN) { ctx.fillRect(px + m - 5, py + m, 3, m); ctx.fillRect(px + m + 1, py + m, 3, m); }
      ctx.fillStyle = '#5d4037'; ctx.fillRect(px + m - 4, py + m - 4, 8, 8);
      ctx.fillStyle = '#8d6e63'; ctx.fillRect(px + m - 3, py + m - 3, 4, 4);
    }
  }
  if (vek) zeichneStrassen(ctx, welt, { x0, y0, x1, y1 });
  if (welt.details) gartenObjekte(ctx, welt, { x0, y0, x1, y1 }, false);
  // geparkte Autos gehören zum Boden (viele – als eigene Objekte wären sie zu teuer)
  for (const b of welt.behaelter ?? []) {
    if (b.art !== 'auto' || b.x < x0 * KACHEL - 40 || b.x > x1 * KACHEL + 40 || b.y < y0 * KACHEL - 40 || b.y > y1 * KACHEL + 40) continue;
    autoVonOben(ctx, b);
  }
  ctx.restore();
}

// ---------- obere Ebene: Bäume und Deko aus dem Prototyp ----------
export function zeichneOben(ctx, welt, bilder = {}, rect = null) {
  const { x0, y0, x1, y1 } = rect ?? { x0: 0, y0: 0, x1: BREITE, y1: HOEHE };
  ctx.save();
  ctx.translate(-x0 * KACHEL, -y0 * KACHEL);
  const z = erzeugeZeichner(ctx);
  const ax0 = Math.max(0, x0 - 2), ay0 = Math.max(0, y0 - 2), ax1 = Math.min(BREITE, x1 + 2), ay1 = Math.min(HOEHE, y1 + 2);
  const imAusschnitt = (x, y, rand = 120) => x >= x0 * KACHEL - rand && x <= x1 * KACHEL + rand && y >= y0 * KACHEL - rand && y <= y1 * KACHEL + rand;
  const dinge = [];   // [y, zeichnen] – nach y sortiert, damit hintere zuerst kommen
  const wiese = (kx, ky, r = 1) => {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (welt.hole(kx + dx, ky + dy) !== T.WIESE) return false;
    return true;
  };
  const mitte = (k) => k * KACHEL + KACHEL / 2;

  for (let ky = ay0; ky < ay1; ky++) for (let kx = ax0; kx < ax1; kx++) {
    const t = welt.hole(kx, ky);
    if (t === T.BAUM) {
      // Bäume von oben (Kenney, CC0): große und kleine Kronen, ein paar herbstliche
      const h = hash(kx * 31, ky * 17);
      const x = mitte(kx), y = mitte(ky);
      const art = h < 0.62 ? 'baum_gross' : h < 0.82 ? 'baum_klein' : h < 0.93 ? 'baum_herbst' : 'baum_herbst_klein';
      const bild = bilder[art], gr = art.endsWith('klein') ? 40 : 58, dreh = hash(ky, kx) * Math.PI * 2;
      if (bild) dinge.push([y, () => {
        ctx.fillStyle = 'rgba(0,0,0,.22)'; ctx.beginPath(); ctx.ellipse(x + 5, y + 6, gr / 2, gr / 2.3, 0, 0, Math.PI * 2); ctx.fill();
        ctx.translate(x, y); ctx.rotate(dreh); ctx.drawImage(bild, -gr / 2, -gr / 2, gr, gr);
      }]);
    } else if (t === T.WASSER && hash(kx * 5, ky * 3) < 0.25) {
      // Schilf am Ufer
      const land = [[-1, 0], [1, 0]].some(([dx]) => { const n = welt.hole(kx + dx, ky); return n !== T.WASSER && n !== T.ZAUN; });
      if (land) dinge.push([mitte(ky), () => z.schilf(mitte(kx), mitte(ky) + 6, 0.8)]);
    } else if (t === T.STRASSE && (kx + ky * 3) % 9 === 0) {
      // Leitpfosten am Straßenrand
      const rand = welt.hole(kx - 1, ky) === T.WIESE ? -1 : welt.hole(kx + 1, ky) === T.WIESE ? 1 : 0;
      if (rand) dinge.push([mitte(ky), () => z.leitpfosten(mitte(kx) + rand * 14, mitte(ky) + 8)]);
    }
  }

  // Hindernisse und Deko: Lage kommt aus der Karte (welt.deko), damit Server und Browser übereinstimmen
  for (const d of welt.deko ?? []) {
    const { x, y } = d, v = d.v ?? 0.5;
    if (!imAusschnitt(x, y)) continue;
    const f = {
      maibaum: () => z.maibaum(x, y),
      biertisch: () => z.biertisch(x, y),
      kuh: () => z.kuh(x, y, v),
      heu: () => z.heu(x, y, v),
      traktor: () => traktorVonOben(ctx, x, y),
      bus: () => busVonOben(ctx, x, y, d.senkrecht, v),
      vogelscheuche: () => z.vogelscheuche(x, y),
      hochsitz: () => z.hochsitz(x, y),
      fels: () => bildZeichnen(ctx, bilder[v < 0.5 ? 'fels1' : 'fels2'], x, y, 30, v * 6),
      busch: () => bildZeichnen(ctx, bilder[v < 0.75 ? 'busch' : 'busch_herbst'], x, y, 30, v * 6),
    }[d.art];
    if (f) dinge.push([y, f]);
  }

  // Enten auf der Isar
  let enten = 0;
  for (let ky = 3; ky < HOEHE - 3 && enten < 4; ky += 9) for (let kx = BREITE - 5; kx < BREITE - 1; kx++) {
    if (welt.hole(kx, ky) === T.WASSER && welt.hole(kx - 1, ky) === T.WASSER) {
      const x = mitte(kx), y = mitte(ky);
      dinge.push([y, () => z.ente(x, y, hash(kx, ky))]); enten++; break;
    }
  }

  dinge.sort((a, b) => a[0] - b[0]);
  for (const [, f] of dinge) { ctx.save(); f(); ctx.restore(); }
  ctx.restore();
}

// ---------- Dächer für einen Kartenausschnitt ----------
const DACH_FARBEN = [['#a1442f', '#8a3826', '#6d2a1c'], ['#8b4513', '#74390f', '#4e260a'], ['#6d6d6d', '#5a5a5a', '#3d3d3d'],
  ['#9c5b3c', '#844b30', '#5d3420'], ['#7a3b2e', '#663126', '#45201a']];

// Dachfläche je Kachel (OSM-Karten mit unregelmäßigen Grundrissen): Farbe je Gebäude, dunklere Traufe am Rand
function dachKachel(ctx, welt, kx, ky, farbe, istDach) {
  const px = kx * KACHEL, py = ky * KACHEL;
  ctx.fillStyle = farbe[0]; ctx.fillRect(px, py, KACHEL, KACHEL);
  ctx.fillStyle = 'rgba(0,0,0,.10)'; for (let i = 4; i < KACHEL; i += 6) ctx.fillRect(px, py + i, KACHEL, 1);
  ctx.fillStyle = farbe[2];
  if (!istDach(kx, ky - 1)) ctx.fillRect(px, py, KACHEL, 3);
  if (!istDach(kx, ky + 1)) { ctx.fillRect(px, py + KACHEL - 3, KACHEL, 3); ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(px + 3, py + KACHEL, KACHEL, 5); ctx.fillStyle = farbe[2]; }
  if (!istDach(kx - 1, ky)) ctx.fillRect(px, py, 3, KACHEL);
  if (!istDach(kx + 1, ky)) { ctx.fillRect(px + KACHEL - 3, py, 3, KACHEL); ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(px + KACHEL, py + 4, 5, KACHEL); }
}

// zusammenhängende Dachflächen erkennen: eine Farbe je Dach (OSM-Gebäude bestehen oft aus mehreren Teilen)
function dachIndex(welt) {
  if (welt._dachNr) return welt._dachNr;
  const nr = new Int32Array(BREITE * HOEHE).fill(-1);
  const safe = new Uint8Array(BREITE * HOEHE);
  for (const h of welt.haeuser) if (h.safe) for (let y = h.y; y < h.y + h.h; y++) for (let x = h.x; x < h.x + h.b; x++) {
    if (x >= 0 && y >= 0 && x < BREITE && y < HOEHE) safe[y * BREITE + x] = 1;
  }
  const istDach = (x, y) => { const t = welt.hole(x, y); return t === T.WAND || t === T.LEER || t === T.TUER; };
  let id = 0;
  for (let y = 0; y < HOEHE; y++) for (let x = 0; x < BREITE; x++) {
    const i = y * BREITE + x;
    if (nr[i] !== -1 || !istDach(x, y)) continue;
    const q = [i]; nr[i] = safe[i] ? -2 : id;
    for (let k = 0; k < q.length; k++) {
      const cx = q[k] % BREITE, cy = (q[k] - cx) / BREITE;
      for (const [nx, ny] of [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]]) {
        const j = ny * BREITE + nx;
        if (nx < 0 || ny < 0 || nx >= BREITE || ny >= HOEHE || nr[j] !== -1 || !istDach(nx, ny)) continue;
        nr[j] = safe[j] ? -2 : id; q.push(j);
      }
    }
    id++;
  }
  welt._dachNr = nr;
  return nr;
}

export function zeichneDaecher(ctx, welt, rect) {
  const { x0, y0, x1, y1 } = rect;
  ctx.save();
  ctx.translate(-x0 * KACHEL, -y0 * KACHEL);
  if (welt.vektor) {
    zeichneVektorDaecher(ctx, welt, rect);
    if (welt.details) gartenObjekte(ctx, welt, rect, true);   // Gartenhäuser, Haltestellen
  } else if (welt.karte) {
    const nr = dachIndex(welt);
    const istDach = (x, y) => { const t = welt.hole(x, y); return (t === T.WAND || t === T.LEER || t === T.TUER) && nr[y * BREITE + x] !== -2; };
    for (let ky = Math.max(0, y0 - 1); ky < Math.min(HOEHE, y1 + 1); ky++) for (let kx = Math.max(0, x0 - 1); kx < Math.min(BREITE, x1 + 1); kx++) {
      const t = welt.hole(kx, ky);
      if (t !== T.WAND && t !== T.LEER) continue;
      const n = nr[ky * BREITE + kx];
      if (n === -2) continue;   // Safe Rooms haben ein eigenes, ausblendbares Dach
      dachKachel(ctx, welt, kx, ky, DACH_FARBEN[Math.max(0, n) % DACH_FARBEN.length], istDach);
    }
  } else {
    for (const h of welt.haeuser) {
      if (h.safe || h.x + h.b + 1 < x0 || h.x - 1 > x1 || h.y + h.h + 1 < y0 || h.y - 1 > y1) continue;
      ctx.save(); ctx.translate(h.x * KACHEL - DACH_RAND, h.y * KACHEL - DACH_RAND); zeichneDach(ctx, h, h.nr); ctx.restore();
    }
  }
  ctx.restore();
}

// ausblendbares Dach eines Safe Rooms (Ursprung = Hausecke minus DACH_RAND)
export function zeichneSafeDach(ctx, welt, h) {
  if (!welt.karte) return zeichneDach(ctx, h, h.nr);
  if (welt.vektor && zeichneVektorSafeDach(ctx, welt, h, DACH_RAND)) return;
  ctx.save();
  ctx.translate(DACH_RAND - h.x * KACHEL, DACH_RAND - h.y * KACHEL);
  const inBox = (x, y) => x >= h.x && y >= h.y && x < h.x + h.b && y < h.y + h.h;
  const istDach = (x, y) => inBox(x, y) && [T.WAND, T.BODEN, T.TUER].includes(welt.hole(x, y));
  for (let y = h.y; y < h.y + h.h; y++) for (let x = h.x; x < h.x + h.b; x++) if (istDach(x, y)) dachKachel(ctx, welt, x, y, ['#78909c', '#607d8b', '#37474f'], istDach);
  ctx.restore();
}

// Auto von oben: Karosserie mit Glanz, Front- und Heckscheibe, Dach, Scheinwerfer und Rückleuchten
const AUTO_FARBEN = ['#c62828', '#1565c0', '#eeeeee', '#2e7d32', '#424242', '#f9a825', '#6d4c41', '#90a4ae'];
function autoVonOben(ctx, b) {
  const lang = 46, breit = 21, f = AUTO_FARBEN[b.farbe % AUTO_FARBEN.length];
  ctx.save();
  ctx.translate(b.x, b.y);
  if (b.senkrecht) ctx.rotate(Math.PI / 2);
  if ((b.farbe + Math.round(b.x)) % 2) ctx.rotate(Math.PI);   // mal vorwärts, mal rückwärts geparkt
  const rund = (x, y, w, h, r) => { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); };
  ctx.fillStyle = 'rgba(0,0,0,.32)'; rund(-lang / 2 + 3, -breit / 2 + 4, lang, breit, 7); ctx.fill();
  const g = ctx.createLinearGradient(0, -breit / 2, 0, breit / 2);
  g.addColorStop(0, f); g.addColorStop(0.5, f); g.addColorStop(1, 'rgba(0,0,0,.35)');
  ctx.fillStyle = f; rund(-lang / 2, -breit / 2, lang, breit, 7); ctx.fill();
  ctx.fillStyle = g; ctx.globalAlpha = 0.5; ctx.fill(); ctx.globalAlpha = 1;
  ctx.fillStyle = 'rgba(255,255,255,.18)'; rund(-lang / 2 + 4, -breit / 2 + 2, lang - 8, 4, 2); ctx.fill();
  ctx.fillStyle = '#1f2a33';
  rund(lang / 2 - 17, -breit / 2 + 2.5, 7, breit - 5, 2); ctx.fill();    // Frontscheibe
  rund(-lang / 2 + 6, -breit / 2 + 3, 5, breit - 6, 2); ctx.fill();      // Heckscheibe
  ctx.fillStyle = 'rgba(255,255,255,.12)'; rund(-lang / 2 + 12, -breit / 2 + 3, 16, breit - 6, 3); ctx.fill();   // Dach
  ctx.fillStyle = '#fff59d'; ctx.fillRect(lang / 2 - 3, -breit / 2 + 2, 2.5, 4); ctx.fillRect(lang / 2 - 3, breit / 2 - 6, 2.5, 4);
  ctx.fillStyle = '#e53935'; ctx.fillRect(-lang / 2 + 0.5, -breit / 2 + 2, 2, 4); ctx.fillRect(-lang / 2 + 0.5, breit / 2 - 6, 2, 4);
  ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.fillRect(lang / 2 - 20, -breit / 2 - 1, 3, 2); ctx.fillRect(lang / 2 - 20, breit / 2 - 1, 3, 2);   // Spiegel
  ctx.restore();
}

// Gartenzäune: Hecke (h), Holz (z), Metall (m), Mauer (w). Verbunden wird auch schräg, damit treppige Grenzen durchgehen.
function zaunTeil(ctx, art, px, py, nb, kx, ky) {
  const m = KACHEL / 2, cx = px + m, cy = py + m;
  const gerade = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => nb(dx, dy) === T.ZAUN);
  const schraeg = [[1, 1], [1, -1], [-1, 1], [-1, -1]].filter(([dx, dy]) => nb(dx, dy) === T.ZAUN && nb(dx, 0) !== T.ZAUN && nb(0, dy) !== T.ZAUN);
  const ziele = [...gerade.map(([dx, dy]) => [cx + dx * m, cy + dy * m]), ...schraeg.map(([dx, dy]) => [cx + dx * m, cy + dy * m])];
  const linien = (farbe, breite, versatz = 0) => {
    ctx.strokeStyle = farbe; ctx.lineWidth = breite; ctx.lineCap = 'round';
    ctx.beginPath();
    if (!ziele.length) { ctx.moveTo(cx - 6 + versatz, cy + versatz); ctx.lineTo(cx + 6 + versatz, cy + versatz); }
    for (const [zx, zy] of ziele) { ctx.moveTo(cx + versatz, cy + versatz); ctx.lineTo(zx + versatz, zy + versatz); }
    ctx.stroke();
  };
  if (art === 'h') {
    linien('rgba(0,0,0,.22)', 18, 3);
    linien('#2f6b2a', 18);
    ctx.fillStyle = '#3f8a37';
    for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(cx - 6 + hash(kx * 9 + i, ky) * 12, cy - 6 + hash(kx, ky * 9 + i) * 12, 4.5, 0, TAU); ctx.fill(); }
  } else if (art === 'm') {
    linien('rgba(0,0,0,.18)', 3, 2);
    linien('#90a4ae', 2);
    ctx.fillStyle = '#455a64'; ctx.fillRect(cx - 2.5, cy - 2.5, 5, 5);
  } else if (art === 'w') {
    linien('rgba(0,0,0,.25)', 10, 3);
    linien('#8a8580', 10);
    linien('#b5b0a8', 5);
  } else {
    // Holzzaun: zwei Latten und Pfosten
    linien('rgba(0,0,0,.22)', 7, 3);
    linien('#a1887f', 6);
    linien('#8d6e63', 2);
    ctx.fillStyle = '#5d4037'; ctx.fillRect(cx - 3.5, cy - 3.5, 7, 7);
  }
}

// Gartenausstattung, Bänke, Haltestellen. oben = false: flache Dinge (Boden), true: Dächer (Gartenhaus, Haltestelle)
function gartenObjekte(ctx, welt, rect, oben) {
  const K = KACHEL;
  for (const o of welt.details.objekte) {
    const x = o.x * K, y = o.y * K, b = (o.b ?? 1) * K, h = (o.h ?? 1) * K;
    if (x + b < rect.x0 * K - 60 || x > rect.x1 * K + 60 || y + h < rect.y0 * K - 60 || y > rect.y1 * K + 60) continue;
    ctx.save();
    if (!oben && o.a === 'pool') {
      ctx.fillStyle = '#d7d2c8'; ctx.fillRect(x + 2, y + 2, b - 4, h - 4);
      const g = ctx.createLinearGradient(x, y, x + b, y + h); g.addColorStop(0, '#4fc3f7'); g.addColorStop(1, '#0288d1');
      ctx.fillStyle = g; ctx.fillRect(x + 6, y + 6, b - 12, h - 12);
      ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.lineWidth = 1.5;
      for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(x + 10 + i * 14, y + 14 + i * 9); ctx.quadraticCurveTo(x + 16 + i * 14, y + 10 + i * 9, x + 22 + i * 14, y + 14 + i * 9); ctx.stroke(); }
    } else if (!oben && o.a === 'trampolin') {
      ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.arc(x + 19, y + 20, 14, 0, TAU); ctx.fill();
      ctx.fillStyle = '#1565c0'; ctx.beginPath(); ctx.arc(x + 16, y + 16, 14, 0, TAU); ctx.fill();
      ctx.fillStyle = '#212121'; ctx.beginPath(); ctx.arc(x + 16, y + 16, 11, 0, TAU); ctx.fill();
    } else if (!oben && o.a === 'beet') {
      ctx.fillStyle = '#6d4c41'; ctx.fillRect(x + 3, y + 5, b - 6, h - 10);
      for (let i = 0; i < 10; i++) {
        ctx.fillStyle = ['#e53935', '#fdd835', '#ab47bc', '#ffffff', '#43a047'][i % 5];
        ctx.beginPath(); ctx.arc(x + 7 + hash(o.x * 7 + i, o.y) * (b - 14), y + 9 + hash(o.y * 5 + i, o.x) * (h - 18), 2.6, 0, TAU); ctx.fill();
      }
    } else if (!oben && o.a === 'sitzgruppe') {
      ctx.fillStyle = 'rgba(0,0,0,.2)'; ctx.beginPath(); ctx.arc(x + 18, y + 18, 9, 0, TAU); ctx.fill();
      ctx.fillStyle = '#eeeeee'; ctx.beginPath(); ctx.arc(x + 16, y + 16, 8, 0, TAU); ctx.fill();
      ctx.fillStyle = '#8d6e63'; for (const [dx, dy] of [[-12, 0], [12, 0], [0, -12], [0, 12]]) ctx.fillRect(x + 13 + dx, y + 13 + dy, 6, 6);
      ctx.fillStyle = '#ef5350'; ctx.beginPath(); ctx.arc(x + 16, y + 16, 3, 0, TAU); ctx.fill();   // Sonnenschirm-Mitte
    } else if (!oben && (o.a === 'bank' || o.a === 'kuebel' || o.a === 'muell')) {
      ctx.translate(x, y); ctx.rotate(o.w ?? 0);
      if (o.a === 'bank') { ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(-12, -2, 26, 9); ctx.fillStyle = '#8d6e63'; ctx.fillRect(-13, -4, 26, 8); ctx.fillStyle = '#5d4037'; ctx.fillRect(-13, -4, 26, 2); }
      else if (o.a === 'kuebel') { ctx.fillStyle = '#9e9e9e'; ctx.fillRect(-8, -8, 16, 16); ctx.fillStyle = '#388e3c'; ctx.beginPath(); ctx.arc(0, 0, 7, 0, TAU); ctx.fill(); ctx.fillStyle = '#f06292'; ctx.beginPath(); ctx.arc(2, -2, 2, 0, TAU); ctx.fill(); }
      else { ctx.fillStyle = '#37474f'; ctx.beginPath(); ctx.arc(0, 0, 5, 0, TAU); ctx.fill(); ctx.fillStyle = '#607d8b'; ctx.beginPath(); ctx.arc(0, 0, 3, 0, TAU); ctx.fill(); }
    } else if (oben && o.a === 'gartenhaus') {
      ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.fillRect(x + 4, y + 6, b, h);
      ctx.fillStyle = '#8d6e63'; ctx.fillRect(x - 2, y - 2, b + 4, h + 4);
      ctx.fillStyle = '#a1887f'; ctx.fillRect(x - 2, y - 2, (b + 4) / 2, h + 4);
      ctx.strokeStyle = '#5d4037'; ctx.lineWidth = 1; for (let i = 4; i < h; i += 5) { ctx.beginPath(); ctx.moveTo(x - 2, y + i); ctx.lineTo(x + b + 2, y + i); ctx.stroke(); }
    } else if (oben && o.a === 'haltestelle') {
      ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.fillRect(x - 14, y - 4, 32, 14);
      ctx.fillStyle = 'rgba(180,220,240,.75)'; ctx.fillRect(x - 16, y - 7, 32, 12);
      ctx.strokeStyle = '#455a64'; ctx.lineWidth = 2; ctx.strokeRect(x - 16, y - 7, 32, 12);
      ctx.fillStyle = '#fdd835'; ctx.beginPath(); ctx.arc(x + 20, y - 8, 6, 0, TAU); ctx.fill();
      ctx.fillStyle = '#2e7d32'; ctx.font = 'bold 8px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('H', x + 20, y - 8);
    }
    ctx.restore();
  }
}

function bildZeichnen(ctx, bild, x, y, gr, dreh = 0) {
  if (!bild) return;
  ctx.translate(x, y); ctx.rotate(dreh);
  const f = gr / Math.max(bild.width, bild.height);
  ctx.drawImage(bild, -bild.width * f / 2, -bild.height * f / 2, bild.width * f, bild.height * f);
}

// Traktor von oben (Blickrichtung nach rechts): große Hinterräder, kleine Vorderräder, Kabine
function traktorVonOben(ctx, x, y) {
  ctx.translate(x, y);
  ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(-24, -20, 54, 44);
  ctx.fillStyle = '#212121';
  ctx.fillRect(-22, -24, 20, 9); ctx.fillRect(-22, 15, 20, 9);      // Hinterräder
  ctx.fillRect(12, -18, 12, 6); ctx.fillRect(12, 12, 12, 6);         // Vorderräder
  ctx.fillStyle = '#424242'; for (let i = -20; i < 0; i += 4) { ctx.fillRect(i, -24, 2, 9); ctx.fillRect(i, 15, 2, 9); }
  ctx.fillStyle = '#2e7d32'; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(-18, -14, 44, 28, 5) : ctx.rect(-18, -14, 44, 28); ctx.fill();
  ctx.fillStyle = '#43a047'; ctx.fillRect(4, -9, 20, 18);             // Motorhaube
  ctx.fillStyle = '#1b5e20'; for (let i = 8; i < 22; i += 4) ctx.fillRect(i, -8, 1.5, 16);
  ctx.fillStyle = '#e8f5e9'; ctx.fillRect(-16, -12, 18, 24);          // Kabinendach
  ctx.strokeStyle = '#1b5e20'; ctx.lineWidth = 2; ctx.strokeRect(-16, -12, 18, 24);
  ctx.fillStyle = '#616161'; ctx.beginPath(); ctx.arc(8, -11, 2.5, 0, Math.PI * 2); ctx.fill();   // Auspuff
}

// Bus von oben: lang, mit Fensterreihen und Dachaufbauten
export function busVonOben(ctx, x, y, senkrecht, v) {
  ctx.translate(x, y);
  if (senkrecht) ctx.rotate(Math.PI / 2);
  const L = 122, B = 28;
  const farbe = v < 0.5 ? '#c62828' : v < 0.8 ? '#1565c0' : '#f9a825';
  ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.fillRect(-L / 2 + 4, -B / 2 + 5, L, B);
  ctx.fillStyle = farbe; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(-L / 2, -B / 2, L, B, 6) : ctx.rect(-L / 2, -B / 2, L, B); ctx.fill();
  ctx.fillStyle = '#eceff1'; ctx.fillRect(-L / 2 + 6, -B / 2 + 4, L - 12, B - 8);    // helles Dach
  ctx.fillStyle = '#263238';
  for (let i = -L / 2 + 10; i < L / 2 - 14; i += 14) { ctx.fillRect(i, -B / 2 + 1, 10, 3); ctx.fillRect(i, B / 2 - 4, 10, 3); }   // Fenster
  ctx.fillRect(L / 2 - 8, -B / 2 + 4, 5, B - 8);                                     // Frontscheibe
  ctx.fillStyle = '#b0bec5'; ctx.fillRect(-14, -7, 22, 14); ctx.fillRect(-40, -5, 10, 10);   // Klimaanlage, Luke
  ctx.strokeStyle = 'rgba(0,0,0,.4)'; ctx.lineWidth = 1.5; ctx.strokeRect(-L / 2 + 0.75, -B / 2 + 0.75, L - 1.5, B - 1.5);
}

// ---------- Dächer: Häuser aus dem Prototyp, auf unsere Größe skaliert ----------
export const DACH_RAND = 48;   // Platz für Dachüberstand und Schatten rundherum

// Dächer von oben (Gregor: Hausfassaden des Prototyps gefallen nicht) – Walmdach mit Ziegelreihen
export function zeichneDach(ctx, haus, nr) {
  const b = haus.b * KACHEL, h = haus.h * KACHEL;
  const art = haus.safe === 'Sakristei' ? 'kirche' : haus.safe ? 'safe' : 'normal';
  const farben = {
    normal: [['#b5523f', '#9c4030', '#6e2c1f'], ['#a0522d', '#8b4513', '#5d3418']][nr % 2],
    safe: ['#90a4ae', '#78909c', '#455a64'],
    kirche: ['#78858c', '#607078', '#37474f'],
  }[art];
  ctx.save();
  ctx.translate(DACH_RAND, DACH_RAND);
  // Schatten
  ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.fillRect(6, 7, b, h);
  // Dachflächen: oben/unten heller/dunkler, Seiten als Walm
  const f = Math.min(b, h) / 2;
  const flaeche = (pts, farbe) => { ctx.fillStyle = farbe; ctx.beginPath(); ctx.moveTo(...pts[0]); for (const q of pts.slice(1)) ctx.lineTo(...q); ctx.closePath(); ctx.fill(); };
  flaeche([[0, 0], [b, 0], [b - f, f], [f, f]], farbe(0));
  flaeche([[0, h], [b, h], [b - f, h - f], [f, h - f]], farbe(1));
  flaeche([[0, 0], [f, f], [f, h - f], [0, h]], farbe(1));
  flaeche([[b, 0], [b - f, f], [b - f, h - f], [b, h]], farbe(0));
  function farbe(i) { return farben[i]; }
  // Ziegel- bzw. Blechlinien
  ctx.strokeStyle = 'rgba(0,0,0,.18)'; ctx.lineWidth = 1;
  for (let y = 6; y < h; y += 6) {
    const rand = y < h / 2 ? Math.min(y, f) : Math.min(h - y, f);
    ctx.beginPath(); ctx.moveTo(rand, y + 0.5); ctx.lineTo(b - rand, y + 0.5); ctx.stroke();
  }
  // First und Grate
  ctx.strokeStyle = farben[2]; ctx.lineWidth = 3; ctx.beginPath();
  ctx.moveTo(f, f); ctx.lineTo(b - f, f); ctx.lineTo(b - f, h - f); ctx.lineTo(f, h - f); ctx.closePath();
  if (b >= h) { ctx.moveTo(f, h / 2); ctx.lineTo(b - f, h / 2); } else { ctx.moveTo(b / 2, f); ctx.lineTo(b / 2, h - f); }
  ctx.moveTo(0, 0); ctx.lineTo(f, f); ctx.moveTo(b, 0); ctx.lineTo(b - f, f); ctx.moveTo(0, h); ctx.lineTo(f, h - f); ctx.moveTo(b, h); ctx.lineTo(b - f, h - f);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(0,0,0,.45)'; ctx.lineWidth = 1.5; ctx.strokeRect(0.75, 0.75, b - 1.5, h - 1.5);
  if (art === 'kirche') {
    // kleiner Turm mit Zwiebelhaube von oben
    const tx = b - 26, ty = 26;
    ctx.fillStyle = '#efe4d8'; ctx.fillRect(tx - 14, ty - 14, 28, 28);
    ctx.fillStyle = '#2e7d32'; ctx.beginPath(); ctx.arc(tx, ty, 11, 0, TAU); ctx.fill();
    ctx.fillStyle = '#43a047'; ctx.beginPath(); ctx.arc(tx - 3, ty - 3, 5, 0, TAU); ctx.fill();
    ctx.fillStyle = '#ffd54f'; ctx.beginPath(); ctx.arc(tx, ty, 2.5, 0, TAU); ctx.fill();
  } else if (art === 'normal') {
    // Kamin
    const kx = Math.floor(b * (0.25 + hash(nr, 3) * 0.5)), ky = Math.floor(h * 0.3);
    ctx.fillStyle = '#8d6e63'; ctx.fillRect(kx, ky, 10, 10);
    ctx.fillStyle = '#4e342e'; ctx.fillRect(kx + 2, ky + 2, 6, 6);
  }
  // unsere Tür als Vordach
  const tx = (haus.tuer.x - haus.x) * KACHEL, oben = haus.tuer.y === haus.y;
  const ty = oben ? -6 : h - 8;
  ctx.fillStyle = '#3e2723'; ctx.fillRect(tx + 3, ty, KACHEL - 6, 14);
  ctx.fillStyle = '#ffd54f'; ctx.fillRect(tx + 13, oben ? ty : ty + 11, 6, 3);
  ctx.restore();
}

// ---------- Innenräume (Phase B) ----------
const BODEN_FARBEN = {
  flur: ['#cdb38f', 'fliese'], kueche: ['#e0d6c2', 'schach'], bad: ['#9fc3d6', 'fliese'],
  wohnzimmer: ['#a9794d', 'diele'], schlafzimmer: ['#b38559', 'diele'], kinderzimmer: ['#b99062', 'diele'],
  abstellraum: ['#8f8577', 'beton'], kellerraum: ['#7b7b78', 'beton'], heizungsraum: ['#6f6f6c', 'beton'],
  vorratskeller: ['#80786c', 'beton'], dachboden: ['#8a6a48', 'diele'],
};

function zeichneMoebel(ctx, m) {
  const x = m.x * KACHEL, y = m.y * KACHEL, b = m.b * KACHEL, h = m.h * KACHEL;
  const k = (f, rx, ry, rb, rh, r = 3) => { ctx.fillStyle = f; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(rx, ry, rb, rh, r) : ctx.rect(rx, ry, rb, rh); ctx.fill(); };
  const rand = () => { ctx.strokeStyle = 'rgba(0,0,0,.45)'; ctx.lineWidth = 1.5; ctx.strokeRect(x + 2.5, y + 2.5, b - 5, h - 5); };
  ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(x + 5, y + 6, b - 6, h - 6);
  switch (m.art) {
    case 'regal_lang': {
      k('#8d8d8d', x + 3, y + 2, b - 6, h - 4, 2);
      const waren = ['#e53935', '#fdd835', '#43a047', '#1e88e5', '#fb8c00', '#8e24aa'];
      for (let i = 0; i < 9; i++) { ctx.fillStyle = waren[(m.x * 3 + m.y + i) % waren.length]; ctx.fillRect(x + 6 + (i % 2) * ((b - 12) / 2), y + 5 + Math.floor(i / 2) * ((h - 10) / 5), (b - 14) / 2, (h - 10) / 6); }
      break;
    }
    case 'kasse': k('#5d4037', x + 2, y + 6, b - 4, h - 12, 3); k('#263238', x + b - 22, y + 9, 14, 10, 2); ctx.fillStyle = '#80cbc4'; ctx.fillRect(x + b - 20, y + 11, 10, 4); break;
    case 'bett': k('#6d4c41', x + 2, y + 2, b - 4, h - 4); k('#eceff1', x + 5, y + 5, b - 10, 14); k('#5c8fd6', x + 5, y + 22, b - 10, h - 27); break;
    case 'sofa': k('#6a4f9c', x + 2, y + 2, b - 4, h - 4, 6); k('#8064b8', x + 7, y + 9, b - 14, h - 14, 4); break;
    case 'couchtisch': case 'esstisch': k('#8d6e63', x + 4, y + 4, b - 8, h - 8, 4); k('#a1887f', x + 7, y + 7, b - 14, h - 14, 3); break;
    case 'schrank': case 'alter_schrank': case 'kommode': case 'garderobe':
      k(m.art === 'alter_schrank' ? '#5d4037' : '#795548', x + 2, y + 2, b - 4, h - 4); rand();
      ctx.fillStyle = '#ffd54f'; ctx.fillRect(x + b / 2 - 4, y + h / 2 - 1, 3, 3); ctx.fillRect(x + b / 2 + 1, y + h / 2 - 1, 3, 3); break;
    case 'regal': k('#6d4c41', x + 2, y + 2, b - 4, h - 4); for (let i = 1; i < 4; i++) { ctx.fillStyle = ['#c62828', '#1565c0', '#2e7d32'][i % 3]; ctx.fillRect(x + 6, y + i * h / 4 - 3, b - 12, 5); } break;
    case 'kiste': k('#a1887f', x + 4, y + 4, b - 8, h - 8, 2); ctx.strokeStyle = '#6d4c41'; ctx.lineWidth = 2; ctx.strokeRect(x + 5, y + 5, b - 10, h - 10); ctx.beginPath(); ctx.moveTo(x + 5, y + 5); ctx.lineTo(x + b - 5, y + h - 5); ctx.stroke(); break;
    case 'kuehlschrank': k('#eceff1', x + 3, y + 3, b - 6, h - 6); rand(); ctx.fillStyle = '#90a4ae'; ctx.fillRect(x + b - 9, y + 8, 3, h - 16); break;
    case 'herd': k('#cfd8dc', x + 3, y + 3, b - 6, h - 6); ctx.fillStyle = '#37474f'; for (const [a, c] of [[9, 9], [21, 9], [9, 21], [21, 21]]) { ctx.beginPath(); ctx.arc(x + a, y + c, 4, 0, Math.PI * 2); ctx.fill(); } break;
    case 'spuele': case 'waschbecken': k('#eceff1', x + 4, y + 4, b - 8, h - 8, 5); k('#b0bec5', x + 9, y + 9, b - 18, h - 18, 6); break;
    case 'badewanne': k('#fafafa', x + 2, y + 2, b - 4, h - 4, 10); k('#b3e5fc', x + 7, y + 7, b - 14, h - 14, 8); break;
    case 'klo': k('#fafafa', x + 8, y + 4, b - 16, 8, 2); ctx.fillStyle = '#fafafa'; ctx.beginPath(); ctx.ellipse(x + b / 2, y + 20, 8, 9, 0, 0, Math.PI * 2); ctx.fill(); break;
    case 'heizung': k('#b0bec5', x + 2, y + 4, b - 4, h - 8); ctx.fillStyle = '#78909c'; for (let i = 6; i < b - 4; i += 6) ctx.fillRect(x + i, y + 6, 2, h - 12); break;
    default: k('#8d6e63', x + 3, y + 3, b - 6, h - 6); rand();
  }
}

// zeichnet das Innere eines Hauses; Ursprung = obere linke Ecke des Hauses (ox, oy)
export function zeichneInnen(ctx, w) {
  ctx.save();
  ctx.translate(-w.ox * KACHEL, -w.oy * KACHEL);
  const raumAn = (x, y) => w.raeume.find(r => x >= r.x && x < r.x + r.b && y >= r.y && y < r.y + r.h);
  for (let y = w.oy; y < w.oy + w.h; y++) for (let x = w.ox; x < w.ox + w.b; x++) {
    const t = w.hole(x, y), px = x * KACHEL, py = y * KACHEL;
    if (t === T.WAND) {
      ctx.fillStyle = '#4e4038'; ctx.fillRect(px, py, KACHEL, KACHEL);
      ctx.fillStyle = '#6a5a50'; ctx.fillRect(px, py, KACHEL, 5);
      continue;
    }
    const r = raumAn(x, y) ?? raumAn(x, y - 1) ?? raumAn(x - 1, y) ?? { typ: 'flur' };
    const [farbe, muster] = BODEN_FARBEN[r.typ] ?? ['#b08a62', 'diele'];
    ctx.fillStyle = farbe; ctx.fillRect(px, py, KACHEL, KACHEL);
    ctx.strokeStyle = 'rgba(0,0,0,.18)'; ctx.lineWidth = 1;
    if (muster === 'diele') { for (let i = 8; i < KACHEL; i += 8) { ctx.beginPath(); ctx.moveTo(px, py + i + 0.5); ctx.lineTo(px + KACHEL, py + i + 0.5); ctx.stroke(); } }
    else if (muster === 'fliese') ctx.strokeRect(px + 0.5, py + 0.5, KACHEL / 2, KACHEL / 2), ctx.strokeRect(px + KACHEL / 2 + 0.5, py + KACHEL / 2 + 0.5, KACHEL / 2 - 1, KACHEL / 2 - 1);
    else if (muster === 'schach') { ctx.fillStyle = 'rgba(0,0,0,.12)'; if ((x + y) % 2) ctx.fillRect(px, py, KACHEL, KACHEL); }
    else { ctx.fillStyle = 'rgba(0,0,0,.06)'; ctx.fillRect(px + ((x * 7) % 20), py + ((y * 11) % 20), 4, 3); }
    if (t === T.AUSGANG) {
      ctx.fillStyle = '#5d4037'; ctx.fillRect(px + 3, py, KACHEL - 6, KACHEL);
      ctx.fillStyle = '#ffd54f'; ctx.font = 'bold 16px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(y === w.oy ? '⬆' : x === w.ox ? '⬅' : x === w.ox + w.b - 1 ? '➡' : '⬇', px + 16, py + 22);
    } else if (t === T.TREPPE_RUNTER || t === T.TREPPE_HOCH) {
      ctx.fillStyle = '#9e9e9e'; ctx.fillRect(px + 2, py + 2, KACHEL - 4, KACHEL - 4);
      ctx.fillStyle = '#616161'; for (let i = 0; i < 5; i++) ctx.fillRect(px + 2, py + 4 + i * 6, KACHEL - 4, 2);
      ctx.fillStyle = '#fff'; ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(t === T.TREPPE_RUNTER ? '▼' : '▲', px + 16, py + 21);
    }
  }
  for (const m of w.moebel) zeichneMoebel(ctx, m);
  ctx.restore();
}

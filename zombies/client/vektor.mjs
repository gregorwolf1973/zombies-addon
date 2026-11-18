// Echtere Darstellung der OSM-Karte: glatte Straßen mit Gehweg, Flächen und Dächer nach den echten Gebäudeumrissen.
// Nur Aussehen – Kollision und Türen bleiben beim Kachelraster (osmwelt.mjs).
// Kartendaten © OpenStreetMap-Mitwirkende, ODbL 1.0.
import { KACHEL } from './welt.mjs';

const K = KACHEL;

function hash(n) {
  let h = Math.imul(n | 0, 2654435761);
  h = Math.imul(h ^ (h >>> 15), 2246822519);
  return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
}

// Umriss vereinfachen: Punkte auf fast gerader Linie weglassen (sonst Scheingrate im Dach)
function vereinfache(p) {
  let pts = [];
  for (let i = 0; i < p.length; i += 2) pts.push([p[i] * K, p[i + 1] * K]);
  for (let runde = 0; runde < 3; runde++) {
    const neu = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[(i + pts.length - 1) % pts.length], b = pts[i], c = pts[(i + 1) % pts.length];
      const v1x = b[0] - a[0], v1y = b[1] - a[1], v2x = c[0] - b[0], v2y = c[1] - b[1];
      const l1 = Math.hypot(v1x, v1y), l2 = Math.hypot(v2x, v2y);
      if (l1 < 0.5) continue;                                      // doppelter Punkt
      const kreuz = (v1x * v2y - v1y * v2x) / (l1 * l2 || 1), dot = (v1x * v2x + v1y * v2y) / (l1 * l2 || 1);
      if (dot > 0 && Math.abs(kreuz) < 0.17) continue;           // < ~10° Knick
      neu.push(b);
    }
    if (neu.length < 3 || neu.length === pts.length) break;
    pts = neu;
  }
  return pts;
}

function bbox(pts, rand = 0) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return { x0: x0 - rand, y0: y0 - rand, x1: x1 + rand, y1: y1 + rand };
}
const schneidet = (b, r) => b.x1 >= r.x0 && b.x0 <= r.x1 && b.y1 >= r.y0 && b.y0 <= r.y1;
const pixelRect = rect => ({ x0: rect.x0 * K, y0: rect.y0 * K, x1: rect.x1 * K, y1: rect.y1 * K });

// einmal je Welt: Pixelkoordinaten, Begrenzungsrahmen, Stil
function vorbereiten(welt) {
  if (welt._vek) return welt._vek;
  const v = welt.vektor;
  const linien = v.strassen.map(s => {
    const pts = []; for (let i = 0; i < s.p.length; i += 2) pts.push([s.p[i] * K, s.p[i + 1] * K]);
    return { t: s.t, b: s.b * K, pts, box: bbox(pts, (s.b + 2) * K) };
  });
  const flaechen = v.flaechen.map(f => {
    const pts = []; for (let i = 0; i < f.p.length; i += 2) pts.push([f.p[i] * K, f.p[i + 1] * K]);
    return { a: f.a, pts, box: bbox(pts, 4) };
  });
  const FLACH = new Set(['industrial', 'commercial', 'retail', 'supermarket', 'school', 'warehouse', 'garages', 'garage', 'carport', 'shed', 'kindergarten', 'public', 'civic', 'office', 'hospital']);
  const gebaeude = v.gebaeude.map((g, i) => {
    const pts = vereinfache(g.p);
    const flach = FLACH.has(g.typ) || g.flaeche > 260 || (g.typ === 'apartments' && g.flaeche > 160);
    return { pts, box: bbox(pts, 16), flach, safe: g.safe, kx: g.x, ky: g.y,
      // Zeichnen auf das Rastergebäude + 1 Kachel begrenzen (manche OSM-Umrisse ragen über Straßen)
      clip: [(g.x - 1) * K, (g.y - 1) * K, (g.b + 2) * K, (g.h + 2) * K], farbe: flach ? FLACHDACH[Math.floor(hash(i * 7 + 3) * FLACHDACH.length)] : ZIEGEL[Math.floor(hash(i * 13 + 1) * ZIEGEL.length)] };
  }).filter(g => g.pts.length >= 3);
  welt._vek = { linien, flaechen, gebaeude };
  return welt._vek;
}

// ---------- Muster (im Weltraum verankert, damit Kartenstücke nahtlos aneinanderpassen) ----------
let muster = null;
function musterHolen(ctx) {
  if (muster) return muster;
  const mach = (gr, f) => { const c = document.createElement('canvas'); c.width = c.height = gr; f(c.getContext('2d'), gr); return ctx.createPattern(c, 'repeat'); };
  const koerner = (c, gr, basis, n, farben) => {
    c.fillStyle = basis; c.fillRect(0, 0, gr, gr);
    for (let i = 0; i < n; i++) { c.fillStyle = farben[i % farben.length]; c.fillRect(hash(i * 3) * gr, hash(i * 5 + 1) * gr, 1 + hash(i) * 1.5, 1 + hash(i + 9) * 1.5); }
  };
  muster = {
    asphalt: mach(64, (c, g) => koerner(c, g, '#5b5d61', 260, ['rgba(255,255,255,.07)', 'rgba(0,0,0,.18)', 'rgba(255,255,255,.04)'])),
    gehweg: mach(32, (c, g) => {
      koerner(c, g, '#c9c3b6', 40, ['rgba(0,0,0,.06)', 'rgba(255,255,255,.12)']);
      c.fillStyle = 'rgba(90,80,70,.28)'; c.fillRect(0, 0, g, 1); c.fillRect(0, 0, 1, g); c.fillRect(0, g / 2, g, 1); c.fillRect(g / 2, 0, 1, g / 2);
    }),
    kies: mach(48, (c, g) => koerner(c, g, '#bba882', 300, ['rgba(0,0,0,.14)', 'rgba(255,255,255,.18)', 'rgba(120,90,50,.2)'])),
    pflaster: mach(24, (c, g) => {
      koerner(c, g, '#bfb39a', 30, ['rgba(0,0,0,.06)']);
      c.strokeStyle = 'rgba(80,70,50,.3)'; c.lineWidth = 1;
      for (let y = 0; y < g; y += 8) for (let x = (y / 8) % 2 * 6; x < g + 12; x += 12) c.strokeRect(x + 0.5, y + 0.5, 12, 8);
    }),
    waldboden: mach(64, (c, g) => koerner(c, g, '#3d6b2f', 200, ['rgba(80,60,30,.25)', 'rgba(0,0,0,.15)', 'rgba(120,160,70,.2)'])),
    acker: mach(32, (c, g) => { koerner(c, g, '#8a7a4e', 60, ['rgba(0,0,0,.1)']); c.fillStyle = 'rgba(60,45,20,.35)'; for (let y = 0; y < g; y += 8) c.fillRect(0, y, g, 3); }),
  };
  return muster;
}

function pfad(ctx, pts, zu = false) {
  ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  if (zu) ctx.closePath();
}

// ---------- Flächen (unter allem anderen) ----------
export function zeichneFlaechen(ctx, welt, rect) {
  const v = vorbereiten(welt), r = pixelRect(rect), m = musterHolen(ctx);
  const stil = { wald: m.waldboden, gruen: 'rgba(120,180,80,.25)', acker: m.acker, sport: '#5f9e4a', friedhof: 'rgba(40,80,40,.25)', parkplatz: m.asphalt, platz: m.pflaster };
  for (const f of v.flaechen) {
    if (!schneidet(f.box, r) || !stil[f.a]) continue;
    pfad(ctx, f.pts, true); ctx.fillStyle = stil[f.a]; ctx.fill();
    if (f.a === 'parkplatz' || f.a === 'platz') { ctx.strokeStyle = '#9e978a'; ctx.lineWidth = 3; ctx.stroke(); }
    if (f.a === 'sport') { ctx.strokeStyle = 'rgba(255,255,255,.6)'; ctx.lineWidth = 2; ctx.stroke(); }
  }
}

// ---------- Straßen und Wege ----------
const AUTO = new Set(['primary', 'secondary', 'tertiary', 'residential', 'unclassified', 'living_street']);
const MITTELLINIE = new Set(['primary', 'secondary', 'tertiary']);
export function zeichneStrassen(ctx, welt, rect) {
  const v = vorbereiten(welt), r = pixelRect(rect), m = musterHolen(ctx);
  const hier = v.linien.filter(l => schneidet(l.box, r) && l.pts.length > 1);
  ctx.save();
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  // 1. Wege (Kies/Pflaster) ganz unten
  for (const l of hier) {
    if (AUTO.has(l.t) || l.t === 'service' || l.t === 'pedestrian') continue;
    pfad(ctx, l.pts);
    ctx.strokeStyle = 'rgba(70,60,40,.35)'; ctx.lineWidth = (l.t === 'footway' ? 0.75 : 0.9) * K + 3; ctx.stroke();
    ctx.strokeStyle = l.t === 'footway' || l.t === 'cycleway' ? m.pflaster : m.kies; ctx.lineWidth = (l.t === 'footway' ? 0.75 : 0.9) * K; ctx.stroke();
  }
  // 2. Bordstein und Gehwege der Fahrstraßen
  for (const l of hier) {
    if (!AUTO.has(l.t) && l.t !== 'pedestrian') continue;
    pfad(ctx, l.pts);
    ctx.strokeStyle = '#8f8a7f'; ctx.lineWidth = l.b + 1.5 * K; ctx.stroke();
    ctx.strokeStyle = m.gehweg; ctx.lineWidth = l.b + 1.4 * K - 2; ctx.stroke();
  }
  // 3. Fahrbahn (Zufahrten schmal ohne Gehweg)
  for (const l of hier) {
    if (l.t === 'pedestrian') continue;
    if (!AUTO.has(l.t) && l.t !== 'service') continue;
    pfad(ctx, l.pts);
    if (l.t === 'service') { ctx.strokeStyle = 'rgba(40,40,40,.4)'; ctx.lineWidth = l.b + 3; ctx.stroke(); }
    else { ctx.strokeStyle = '#d8d4cc'; ctx.lineWidth = l.b + 4; ctx.stroke(); }   // Bordsteinkante
    ctx.strokeStyle = m.asphalt; ctx.lineWidth = l.b; ctx.stroke();
  }
  for (const l of hier) if (l.t === 'pedestrian') { pfad(ctx, l.pts); ctx.strokeStyle = m.pflaster; ctx.lineWidth = l.b + K; ctx.stroke(); }
  // 4. Markierung: Randlinien und gestrichelte Mittellinie
  for (const l of hier) {
    if (!MITTELLINIE.has(l.t)) continue;
    pfad(ctx, l.pts);
    ctx.setLineDash([22, 26]); ctx.lineCap = 'butt';
    ctx.strokeStyle = 'rgba(240,240,235,.75)'; ctx.lineWidth = 2.5; ctx.stroke();
    ctx.setLineDash([]); ctx.lineCap = 'round';
  }
  ctx.restore();
}

// ---------- Dächer ----------
const ZIEGEL = [[168, 72, 50], [150, 64, 44], [125, 70, 52], [176, 96, 64], [96, 92, 90], [80, 72, 70], [140, 58, 46]];
const FLACHDACH = [[138, 138, 132], [120, 122, 120], [150, 146, 136], [110, 110, 112]];
const LICHT = (() => { const x = -0.55, y = -0.83, l = Math.hypot(x, y); return [x / l, y / l]; })();
const UEBERSTAND = 7;   // Dachüberstand in Pixeln (deckt die Rasterkanten ab)
const AUFL = 2;         // Rechenauflösung: 1 Rechenpunkt je 2×2 Pixel, danach weich vergrößert

// Bild eines Dachs: Walmdach (jede Stelle gehört zur nächstgelegenen Traufe – das ergibt Grate und Kehlen)
// oder Flachdach mit Attika. Rückgabe: { bild, x, y } in Weltpixeln.
export function dachBild(g, farbeOverride) {
  const pts = g.pts, n = pts.length;
  const box = bbox(pts, UEBERSTAND + 2);
  const W = Math.ceil((box.x1 - box.x0) / AUFL), H = Math.ceil((box.y1 - box.y0) / AUFL);
  if (W <= 0 || H <= 0 || W * H > 2_000_000) return null;
  // Kanten mit Außennormale (Umlaufsinn über die Fläche bestimmen)
  let fl = 0; for (let i = 0; i < n; i++) { const a = pts[i], b = pts[(i + 1) % n]; fl += a[0] * b[1] - b[0] * a[1]; }
  const sgn = fl > 0 ? 1 : -1;
  const kanten = [];
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
    const nx = sgn * dy / l, ny = -sgn * dx / l;    // nach außen
    kanten.push({ ax: a[0], ay: a[1], dx, dy, l2: l * l, nx, ny, hell: 1 + 0.28 * (nx * LICHT[0] + ny * LICHT[1]) });
  }
  const farbe = farbeOverride ?? g.farbe;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const cc = c.getContext('2d'), img = cc.createImageData(W, H), d = img.data;
  const xs = [];
  for (let j = 0; j < H; j++) {
    const py = box.y0 + (j + 0.5) * AUFL;
    // Schnittpunkte der Zeile mit dem Umriss → innen/außen
    xs.length = 0;
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % n];
      if ((a[1] > py) !== (b[1] > py)) xs.push(a[0] + (py - a[1]) / (b[1] - a[1]) * (b[0] - a[0]));
    }
    xs.sort((p, q) => p - q);
    let k = 0, drin = false;
    for (let i = 0; i < W; i++) {
      const px = box.x0 + (i + 0.5) * AUFL;
      while (k < xs.length && xs[k] <= px) { drin = !drin; k++; }
      // nächste und zweitnächste Kante
      let d1 = Infinity, d2 = Infinity, e1 = -1, e2 = -1;
      for (let e = 0; e < n; e++) {
        const q = kanten[e];
        let t = ((px - q.ax) * q.dx + (py - q.ay) * q.dy) / q.l2; t = t < 0 ? 0 : t > 1 ? 1 : t;
        const ex = q.ax + t * q.dx - px, ey = q.ay + t * q.dy - py, dd = ex * ex + ey * ey;
        if (dd < d1) { d2 = d1; e2 = e1; d1 = dd; e1 = e; } else if (dd < d2) { d2 = dd; e2 = e; }
      }
      d1 = Math.sqrt(d1); d2 = Math.sqrt(d2);
      if (!drin && d1 > UEBERSTAND) continue;
      const q = kanten[e1];
      let f;
      if (g.flach) {
        // Flachdach: Kies, an der Kante eine hellere Attika mit Schattenfuge
        f = !drin ? 0.62 : d1 < 3 ? 1.12 : d1 < 5 ? 0.78 : 0.94 + (hash(i * 7919 + j * 104729) - 0.5) * 0.08;
      } else {
        f = q.hell;
        const tiefe = drin ? d1 : -d1;
        if (((tiefe + 64) % 8) < 1.6) f *= 0.86;                                  // Ziegelreihen parallel zur Traufe
        const q2 = kanten[e2];
        if (drin && d2 - d1 < 1.6 && q2 && q.nx * q2.nx + q.ny * q2.ny < 0.9) f *= 0.72;   // Grat bzw. Kehle
        if (!drin && d1 > UEBERSTAND - 2) f *= 0.7;                               // Traufkante
        f *= 0.97 + hash(i * 31 + j * 977) * 0.06;
      }
      const o = (j * W + i) * 4;
      d[o] = Math.min(255, farbe[0] * f); d[o + 1] = Math.min(255, farbe[1] * f); d[o + 2] = Math.min(255, farbe[2] * f); d[o + 3] = 255;
    }
  }
  cc.putImageData(img, 0, 0);
  return { bild: c, x: box.x0, y: box.y0, b: W * AUFL, h: H * AUFL };
}

function schatten(ctx, g) {
  ctx.save(); ctx.translate(7, 10);
  pfad(ctx, g.pts, true); ctx.fillStyle = 'rgba(0,0,0,.26)'; ctx.fill();
  ctx.restore();
}

export function zeichneVektorDaecher(ctx, welt, rect) {
  const v = vorbereiten(welt), r = pixelRect(rect);
  const hier = v.gebaeude.filter(g => !g.safe && schneidet({ ...g.box, x1: g.box.x1 + 10, y1: g.box.y1 + 12 }, r));
  const begrenzt = (g, f) => { ctx.save(); ctx.beginPath(); ctx.rect(...g.clip); ctx.clip(); f(); ctx.restore(); };
  for (const g of hier) begrenzt(g, () => schatten(ctx, g));
  ctx.imageSmoothingEnabled = true;
  for (const g of hier) {
    const b = dachBild(g);
    if (b) begrenzt(g, () => ctx.drawImage(b.bild, b.x, b.y, b.b, b.h));
  }
  for (const l of laternen(welt)) if (l.x > r.x0 - 30 && l.x < r.x1 + 30 && l.y > r.y0 - 30 && l.y < r.y1 + 30) laterneZeichnen(ctx, l);
  // Haustüren der betretbaren Häuser (unter dem Dachrand hervor)
  for (const h of welt.haeuser) {
    if (!h.betretbar || !h.tuer) continue;
    const cx = (h.tuer.x + 0.5) * K + h.raus.dx * K * 0.5, cy = (h.tuer.y + 0.5) * K + h.raus.dy * K * 0.5;
    if (cx < r.x0 - K || cx > r.x1 + K || cy < r.y0 - K || cy > r.y1 + K) continue;
    const quer = h.raus.dx !== 0;
    const bw = quer ? 9 : 22, bh = quer ? 22 : 9;
    ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(cx - bw / 2 + 2, cy - bh / 2 + 2, bw, bh);
    ctx.fillStyle = '#9e9e9e'; ctx.fillRect(cx - bw / 2 + h.raus.dx * 5, cy - bh / 2 + h.raus.dy * 5, bw, bh);   // Stufe
    ctx.fillStyle = '#5d4037'; ctx.fillRect(cx - bw / 2, cy - bh / 2, bw, bh);
    ctx.fillStyle = '#ffd54f'; ctx.fillRect(cx + (quer ? 0 : 6) - 1.5, cy + (quer ? 6 : 0) - 1.5, 3, 3);
  }
}

// Dach eines Safe Rooms (eigene Grafik, wird beim Betreten durchsichtig)
export function zeichneVektorSafeDach(ctx, welt, h, rand) {
  const v = vorbereiten(welt);
  const g = v.gebaeude.find(g => g.safe && g.kx === h.x && g.ky === h.y);
  if (!g) return false;
  const b = dachBild({ ...g, flach: false }, [96, 125, 139]);
  if (!b) return false;
  ctx.save(); ctx.translate(rand - h.x * K, rand - h.y * K);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(b.bild, b.x, b.y, b.b, b.h);
  ctx.restore();
  return true;
}

// Straßenlaternen: an Fahrstraßen etwa alle 36 m auf dem Gehweg, abwechselnd links und rechts
export function laternen(welt) {
  if (welt._laternen) return welt._laternen;
  const v = vorbereiten(welt), liste = [], ABSTAND = 9 * K;
  for (const l of v.linien) {
    if (!AUTO.has(l.t)) continue;
    let rest = ABSTAND / 2, seite = 1;
    for (let i = 0; i + 1 < l.pts.length; i++) {
      const [ax, ay] = l.pts[i], [bx, by] = l.pts[i + 1], len = Math.hypot(bx - ax, by - ay);
      if (len < 1) continue;
      const nx = -(by - ay) / len, ny = (bx - ax) / len, off = l.b / 2 + 0.5 * K;
      for (let d = rest; d < len; d += ABSTAND) {
        const x = ax + (bx - ax) * d / len + nx * off * seite, y = ay + (by - ay) * d / len + ny * off * seite;
        if (!liste.some(q => Math.abs(q.x - x) < 4 * K && Math.abs(q.y - y) < 4 * K)) liste.push({ x, y, nx: -nx * seite, ny: -ny * seite });
        seite = -seite;
      }
      rest = (rest - len) % ABSTAND; if (rest < 0) rest += ABSTAND;
    }
  }
  return (welt._laternen = liste);
}

function laterneZeichnen(ctx, l) {
  ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.ellipse(l.x + 6, l.y + 5, 5, 3, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#37474f'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(l.x, l.y); ctx.lineTo(l.x + l.nx * 12, l.y + l.ny * 12); ctx.stroke();
  ctx.fillStyle = '#263238'; ctx.beginPath(); ctx.arc(l.x, l.y, 3.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#fff3c4'; ctx.beginPath(); ctx.ellipse(l.x + l.nx * 13, l.y + l.ny * 13, 4, 3, Math.atan2(l.ny, l.nx), 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#455a64'; ctx.lineWidth = 1; ctx.stroke();
}

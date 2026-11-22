// Echtere Darstellung der OSM-Karte: glatte Straßen mit Gehweg, Flächen und Dächer nach den echten Gebäudeumrissen.
// Nur Aussehen – Kollision und Türen bleiben beim Kachelraster (osmwelt.mjs).
// Kartendaten © OpenStreetMap-Mitwirkende, ODbL 1.0.
import { KACHEL, BREITE, T } from './welt.mjs';
import { kulDaecher, zeichneEchtesDach } from './kulisse.mjs';

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

// Dach nach Luftbild: { farbe: [r,g,b] leicht entsättigt, dachart, w (Firstwinkel, Bogenmaß), hell (+1/-1), vmin, vmax } oder null
function luftbildDach(g, pts) {
  if (!/^#[0-9a-f]{6}$/i.test(g.dach ?? '') || !['sattel', 'walm', 'flach'].includes(g.dachart)) return null;
  const c = [1, 3, 5].map(i => parseInt(g.dach.slice(i, i + 2), 16)), grau = 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2];
  const farbe = c.map(v => Math.max(0, Math.min(255, Math.round((grau + (v - grau) * 1.12) * 0.93))));   // Foto-Dächer wirken im Spiel blass: leicht kräftigere Farbe, etwas dunkler
  const w = (Number(g.first) || 0) * Math.PI / 180, cs = Math.cos(w), sn = Math.sin(w);
  let vmin = Infinity, vmax = -Infinity;
  for (const [x, y] of pts) { const v = -x * sn + y * cs; vmin = Math.min(vmin, v); vmax = Math.max(vmax, v); }
  return { farbe, dachart: g.dachart, w, hell: g.dachhell === -1 ? -1 : 1, vmin, vmax };
}

function bbox(pts, rand = 0) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return { x0: x0 - rand, y0: y0 - rand, x1: x1 + rand, y1: y1 + rand };
}
const schneidet = (b, r) => b.x1 >= r.x0 && b.x0 <= r.x1 && b.y1 >= r.y0 && b.y0 <= r.y1;
const pixelRect = rect => ({ x0: rect.x0 * K, y0: rect.y0 * K, x1: rect.x1 * K, y1: rect.y1 * K });

// Gebäude (Pixel) für die Kulisse-Schatten und -Dächer
export function vektorGebaeude(welt) { return vorbereiten(welt).gebaeude; }

// einmal je Welt: Pixelkoordinaten, Begrenzungsrahmen, Stil
function vorbereiten(welt) {
  if (welt._vek) return welt._vek;
  const v = welt.vektor;
  const linien = v.strassen.map(s => {
    const pts = []; for (let i = 0; i < s.p.length; i += 2) pts.push([s.p[i] * K, s.p[i + 1] * K]);
    return { t: s.t, b: s.b * K, pts, box: bbox(pts, (s.b + 2) * K), n: s.n, ref: s.ref, spuren: Number(s.spuren) || 0, breite: parseFloat(s.breite) || 0, gl: s.gl, gr: s.gr };
  });
  const flaechen = v.flaechen.map(f => {
    const pts = []; for (let i = 0; i < f.p.length; i += 2) pts.push([f.p[i] * K, f.p[i + 1] * K]);
    return { a: f.a, pts, box: bbox(pts, 4) };
  });
  const FLACH = new Set(['industrial', 'commercial', 'retail', 'supermarket', 'school', 'warehouse', 'garages', 'garage', 'carport', 'shed', 'kindergarten', 'public', 'civic', 'office', 'hospital']);
  const gebaeude = v.gebaeude.map((g, i) => {
    const pts = vereinfache(g.p);
    // Flachdach: Gewerbe, große Bauten, Wohnblocks – und etwa jedes fünfte Wohnhaus (moderne Bauweise)
    const flach = FLACH.has(g.typ) || g.flaeche > 260 || (g.typ === 'apartments' && g.flaeche > 160) || hash(i * 17 + 5) < 0.2;
    // Luftbild-Dach (tools/luftbild.py): Farbe, Firstrichtung und Dachart aus dem Foto; fehlen sie, bleibt es bei der bisherigen Darstellung
    const lb = luftbildDach(g, pts);
    return { pts, box: bbox(pts, 16), flach: lb ? lb.dachart === 'flach' : flach, lb, safe: g.safe, kx: g.x, ky: g.y,
      // Zeichnen auf das Rastergebäude + 1 Kachel begrenzen (manche OSM-Umrisse ragen über Straßen)
      clip: [(g.x - 1) * K, (g.y - 1) * K, (g.b + 2) * K, (g.h + 2) * K], farbe: lb ? lb.farbe : flach ? FLACHDACH[Math.floor(hash(i * 7 + 3) * FLACHDACH.length)] : ZIEGEL[Math.floor(hash(i * 13 + 1) * ZIEGEL.length)] };
  }).filter(g => g.pts.length >= 3);
  // Gehweg-Abschnitte: nur dort, wo bebaut ist (Haus im Umkreis von 6 Kacheln der Segmentmitte) – nicht an freier Landstraße
  const GITTER = 8, rost = new Map();
  for (const g of v.gebaeude) { const k = Math.floor((g.x + g.b / 2) / GITTER) + ',' + Math.floor((g.y + g.h / 2) / GITTER); (rost.get(k) ?? rost.set(k, []).get(k)).push([g.x + g.b / 2, g.y + g.h / 2]); }
  const bebaut = (px, py) => {
    const cx = Math.floor(px / K / GITTER), cy = Math.floor(py / K / GITTER);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) for (const [hx, hy] of rost.get((cx + dx) + ',' + (cy + dy)) ?? []) if (Math.hypot(hx - px / K, hy - py / K) <= 6) return true;
    return false;
  };
  for (const l of linien) {
    if (!AUTO.has(l.t)) continue;
    if (l.gl !== undefined || l.gr !== undefined) { l.gehTeile = [l.pts]; continue; }   // amtliche Gehwegbreiten (tools/amtlich.py): ganze Linie, je Seite eigene Breite
    l.gehTeile = []; let teil = null;
    for (let i = 0; i + 1 < l.pts.length; i++) {
      const [ax, ay] = l.pts[i], [bx, by] = l.pts[i + 1];
      if (!bebaut((ax + bx) / 2, (ay + by) / 2)) { teil = null; continue; }
      if (!teil) { teil = [l.pts[i]]; l.gehTeile.push(teil); }
      teil.push(l.pts[i + 1]);
    }
  }
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
    beton: mach(48, (c, g) => { koerner(c, g, '#b4b1a8', 80, ['rgba(0,0,0,.07)', 'rgba(255,255,255,.1)']); c.fillStyle = 'rgba(0,0,0,.1)'; c.fillRect(0, 0, g, 1); c.fillRect(0, 0, 1, g); }),
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
// kleinstes umschließendes Rechteck (Ausrichtung an einer Polygonkante): für Spielfeldlinien und Parkbuchten
// Kleinstes umschließendes gedrehtes Rechteck. Wird auch vom Weltcode benutzt (Parkbuchten) und muss deshalb auf jeder
// JS-Engine Bit für Bit gleich rechnen: nur + − × ÷ und Math.sqrt (IEEE-genau), KEIN atan2/sin/cos für Entscheidungen
// (die weichen zwischen Engines in der letzten Stelle ab). w (Winkel) nur für die Zeichnung.
function orientierteBox(pts) {
  if (pts._box) return pts._box;
  let best = null;
  for (let i = 0; i < pts.length; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % pts.length];
    const dx = bx - ax, dy = by - ay, len = Math.sqrt(dx * dx + dy * dy);
    if (!(len > 0)) continue;
    const c = dx / len, sn = dy / len;
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (const [x, y] of pts) { const u = x * c + y * sn, v = -x * sn + y * c; u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); }
    const fl = (u1 - u0) * (v1 - v0);
    if (!best || fl < best.fl - 1e-6) best = { fl, c, sn, u0, u1, v0, v1 };
  }
  if (!best) return (pts._box = { cx: pts[0]?.[0] ?? 0, cy: pts[0]?.[1] ?? 0, w: 0, c: 1, sn: 0, lang: 0, breit: 0 });
  let { c, sn, u0, u1, v0, v1 } = best;
  if (u1 - u0 < v1 - v0) { [c, sn] = [-sn, c]; [u0, u1, v0, v1] = [v0, v1, -u1, -u0]; }   // lange Seite entlang (c, sn)
  const uc = (u0 + u1) / 2, vc = (v0 + v1) / 2;
  return (pts._box = { cx: uc * c - vc * sn, cy: uc * sn + vc * c, c, sn, w: Math.atan2(sn, c), lang: u1 - u0, breit: v1 - v0 });
}
// im gedrehten Rechteck zeichnen: Ursprung = Mitte, x entlang der langen Seite
function imRechteck(ctx, b, f) { ctx.save(); ctx.translate(b.cx, b.cy); ctx.rotate(b.w); f(b.lang / 2, b.breit / 2); ctx.restore(); }

function fussballfeld(ctx, b) {
  imRechteck(ctx, b, (L, Bt) => {
    const l = L - 6, br = Bt - 6;
    for (let x = -l, i = 0; x < l; x += 20, i++) { ctx.fillStyle = i % 2 ? 'rgba(255,255,255,.06)' : 'rgba(0,0,0,.05)'; ctx.fillRect(x, -br, 20, br * 2); }
    ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 2;
    ctx.strokeRect(-l, -br, l * 2, br * 2);
    ctx.beginPath(); ctx.moveTo(0, -br); ctx.lineTo(0, br); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, Math.min(br * 0.3, 9.15 * METER), 0, Math.PI * 2); ctx.stroke();
    const tiefe = Math.min(l * 0.17, 16.5 * METER), weite = Math.min(br * 0.6, 20 * METER);
    for (const s of [-1, 1]) {
      ctx.strokeRect(s > 0 ? l - tiefe : -l, -weite, tiefe, weite * 2);
      ctx.fillStyle = '#fff'; ctx.fillRect(s > 0 ? l : -l - 4, -3.66 * METER, 4, 7.32 * METER);   // Tor
    }
  });
}
function basketballfeld(ctx, b) {
  imRechteck(ctx, b, (L, Bt) => {
    ctx.fillStyle = '#b8603f'; ctx.fillRect(-L, -Bt, L * 2, Bt * 2);
    const l = L - 4, br = Bt - 4;
    ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 2;
    ctx.strokeRect(-l, -br, l * 2, br * 2);
    ctx.beginPath(); ctx.moveTo(0, -br); ctx.lineTo(0, br); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, Math.min(br * 0.3, 1.8 * METER), 0, Math.PI * 2); ctx.stroke();
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(s * l, 0, Math.min(br * 0.8, 6.75 * METER), s > 0 ? Math.PI / 2 : -Math.PI / 2, s > 0 ? Math.PI * 1.5 : Math.PI / 2); ctx.stroke(); }
  });
}
// Buchtgeometrie eines Parkplatzes (EINE Quelle für Buchtlinien und geparkte Autos). pts = Polygon in Pixeln.
// Reihen quer zur langen Seite des Umschließenden Rechtecks: je Doppelreihe 5 m tiefe Buchten, 6 m Fahrgasse, 5 m tiefe Buchten,
// Buchten 2,5 m breit. Deterministisch (nur Geometrie, kein Zufall). Ergebnis (zwischengespeichert):
// { box, reihen: [{ y0, y1, xs: [Buchtlinien-x] }] (Eigenkoordinaten des Rechtecks: Ursprung = Mitte, x entlang der langen Seite),
//   buchten: [{ x, y, winkel, ecken: [[x, y] ×4] }] (Weltpixel; winkel = Buchtrichtung = Fahrzeug-Längsachse, quer zur Fahrgasse) }
export const PARK_TIEFE = 5 * K / 4, PARK_GASSE = 6 * K / 4, PARK_BREIT = 2.5 * K / 4;   // 5 m, 6 m, 2,5 m
export function parkplatzBuchten(pts) {
  if (pts._buchten) return pts._buchten;
  const b = orientierteBox(pts), L = b.lang / 2, Bt = b.breit / 2;
  // Weltcode: gerundet (1/64 px), damit winzige Engine-Unterschiede nie eine Entscheidung kippen
  const q = z => Math.round(z * 64) / 64;
  const c = b.c, sn = b.sn, welt = (u, v) => [q(b.cx + u * c - v * sn), q(b.cy + u * sn + v * c)];
  const reihen = [], buchten = [], winkel = Math.round((b.w + Math.PI / 2) * 1e4) / 1e4;
  for (let y = -Bt + 2; y + PARK_TIEFE <= Bt; y += PARK_TIEFE * 2 + PARK_GASSE) {
    for (const [y0, y1] of [[y, y + PARK_TIEFE], [y + PARK_TIEFE + PARK_GASSE, y + PARK_TIEFE * 2 + PARK_GASSE]]) {
      if (y1 > Bt) continue;
      const xs = [];
      for (let x = -L + 2; x <= L - 2; x += PARK_BREIT) xs.push(x);
      reihen.push({ y0, y1, xs });
      for (let i = 0; i + 1 < xs.length; i++) {
        const [x0, x1] = [xs[i], xs[i + 1]], [mx, my] = welt((x0 + x1) / 2, (y0 + y1) / 2);
        buchten.push({ x: mx, y: my, winkel, ecken: [welt(x0, y0), welt(x1, y0), welt(x1, y1), welt(x0, y1)] });
      }
    }
  }
  return (pts._buchten = { box: b, reihen, buchten });
}
function parkbuchten(ctx, f) {
  const g = parkplatzBuchten(f.pts);
  imRechteck(ctx, g.box, () => {
    ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 1.5;
    for (const r of g.reihen) for (const x of r.xs) { ctx.beginPath(); ctx.moveTo(x, r.y0); ctx.lineTo(x, r.y1); ctx.stroke(); }
  });
}
function spielplatz(ctx, f, i) {
  const b = orientierteBox(f.pts);
  ctx.fillStyle = '#ddc995'; ctx.fill();
  ctx.fillStyle = 'rgba(120,90,40,.25)';
  for (let k = 0; k < 40; k++) ctx.fillRect(b.cx + (hash(i * 97 + k) - 0.5) * b.lang * 0.8, b.cy + (hash(i * 31 + k * 7) - 0.5) * b.breit * 0.8, 2, 2);
  imRechteck(ctx, b, (L, Bt) => {
    const s = Math.min(1, Math.min(L, Bt) / 40);
    // Schaukel
    ctx.save(); ctx.translate(-L * 0.45, -Bt * 0.3); ctx.scale(s, s);
    ctx.fillStyle = '#6d4c41'; ctx.fillRect(-18, -2, 36, 4); ctx.fillStyle = '#e53935'; ctx.fillRect(-12, 4, 8, 4); ctx.fillRect(4, 4, 8, 4); ctx.restore();
    // Rutsche
    ctx.save(); ctx.translate(L * 0.35, -Bt * 0.25); ctx.scale(s, s);
    ctx.fillStyle = '#1e88e5'; ctx.fillRect(-4, -14, 8, 28); ctx.fillStyle = '#8d6e63'; ctx.fillRect(-7, -18, 14, 7); ctx.restore();
    // Sandkasten
    ctx.save(); ctx.translate(0, Bt * 0.35); ctx.scale(s, s);
    ctx.strokeStyle = '#8d6e63'; ctx.lineWidth = 4; ctx.strokeRect(-14, -10, 28, 20); ctx.fillStyle = '#f0dca4'; ctx.fillRect(-12, -8, 24, 16); ctx.restore();
    // Wippe
    ctx.save(); ctx.translate(L * 0.45, Bt * 0.3); ctx.rotate(0.4); ctx.scale(s, s);
    ctx.fillStyle = '#fbc02d'; ctx.fillRect(-16, -2.5, 32, 5); ctx.fillStyle = '#5d4037'; ctx.fillRect(-3, -4, 6, 8); ctx.restore();
  });
}
function friedhof(ctx, f, i) {
  const b = orientierteBox(f.pts);
  imRechteck(ctx, b, (L, Bt) => {
    for (let y = -Bt + 10; y < Bt - 6; y += 14) for (let x = -L + 8; x < L - 6; x += 11) {
      if (hash(i + x * 13 + y * 7) < 0.25) continue;
      ctx.fillStyle = 'rgba(90,110,70,.5)'; ctx.fillRect(x - 1, y, 8, 9);
      ctx.fillStyle = '#9e9e9e'; ctx.fillRect(x + 1, y - 2, 4, 3);
    }
  });
}

// ---------- Flächen (unter allem anderen) ----------
export function zeichneFlaechen(ctx, welt, rect) {
  const v = vorbereiten(welt), r = pixelRect(rect), m = musterHolen(ctx);
  const stil = { wald: m.waldboden, gruen: 'rgba(130,190,85,.3)', acker: m.acker, sport: '#5a9c45', friedhof: 'rgba(60,100,50,.35)',
    parkplatz: m.asphalt, platz: m.pflaster, laufbahn: '#b0553c', gewerbe: m.beton, spielplatz: '#ddc995' };
  v.flaechen.forEach((f, i) => {
    if (!schneidet(f.box, r) || !stil[f.a]) return;
    ctx.save();
    pfad(ctx, f.pts, true); ctx.fillStyle = stil[f.a]; ctx.fill();
    ctx.clip();
    const b = orientierteBox(f.pts);
    if (f.a === 'sport' && f.s === 'basketball') basketballfeld(ctx, b);
    else if (f.a === 'sport' && (f.s === 'soccer' || !f.s) && b.lang > 30 * METER) fussballfeld(ctx, b);
    else if (f.a === 'parkplatz') parkbuchten(ctx, f);
    else if (f.a === 'spielplatz') spielplatz(ctx, f, i);
    else if (f.a === 'friedhof') friedhof(ctx, f, i);
    else if (f.a === 'laufbahn') imRechteck(ctx, b, (L, Bt) => { ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.lineWidth = 1; for (let k = 1; k < 5; k++) ctx.strokeRect(-L + k * 4, -Bt + k * 4, (L - k * 4) * 2, (Bt - k * 4) * 2); });
    ctx.restore();
    pfad(ctx, f.pts, true);
    if (f.a === 'parkplatz' || f.a === 'platz' || f.a === 'gewerbe') { ctx.strokeStyle = '#8f8a7f'; ctx.lineWidth = 3; ctx.stroke(); }
    else if (f.a === 'sport' || f.a === 'spielplatz') { ctx.strokeStyle = 'rgba(60,60,60,.5)'; ctx.lineWidth = 2; ctx.stroke(); }
  });
  if (welt.vektor.piste) zeichnePiste(ctx, welt.vektor.piste, r, m);
}

// Landebahn mit Rollweg (Karte 'piste', Maße in Metern wie bei echten Pisten): Asphalt, Randlinien, gestrichelte Mittellinie,
// Schwellenstreifen (Zebra), Pistennummern, Zielpunkt- und Aufsetzmarken; gelbe Mittellinie auf dem Rollweg.
function zeichnePiste(ctx, pi, r, m) {
  const [x0, y0, x1, y1] = pi.p, W = pi.b * K, rb = (pi.rb ?? 3) * K, L = Math.hypot(x1 - x0, y1 - y0) * K, M = METER;
  const w = Math.atan2(y1 - y0, x1 - x0), ox = x0 * K, oy = y0 * K, rand = Math.max(W, L) + 40;
  if (Math.max(ox, x1 * K) + rand < r.x0 || Math.min(ox, x1 * K) - rand > r.x1 || Math.max(oy, y1 * K) + rand < r.y0 || Math.min(oy, y1 * K) - rand > r.y1) return;
  ctx.save();
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  // Rollweg zuerst (die Bahn deckt die Einmündung sauber ab)
  const wege = (pi.rollweg ?? []).map(l => { const q = []; for (let i = 0; i + 1 < l.length; i += 2) q.push([l[i] * K, l[i + 1] * K]); return q; });
  for (const q of wege) { pfad(ctx, q); ctx.strokeStyle = '#34363a'; ctx.lineWidth = rb + 5; ctx.stroke(); }
  for (const q of wege) { pfad(ctx, q); ctx.strokeStyle = m.asphalt; ctx.lineWidth = rb; ctx.stroke(); }
  for (const q of wege) { pfad(ctx, q); ctx.strokeStyle = '#e8c21c'; ctx.lineWidth = 2.5; ctx.stroke(); }
  ctx.translate(ox, oy); ctx.rotate(w);
  ctx.fillStyle = '#34363a'; ctx.fillRect(-2.5, -W / 2 - 2.5, L + 5, W + 5);
  ctx.fillStyle = m.asphalt; ctx.fillRect(0, -W / 2, L, W);
  ctx.fillStyle = 'rgba(255,255,255,.05)'; ctx.fillRect(0, -W / 2, L, W);   // etwas heller als Straßenasphalt
  ctx.lineCap = 'butt';
  const weiss = 'rgba(255,255,255,.92)', rl = 0.5 * M;
  // Randlinien
  ctx.fillStyle = weiss;
  for (const sg of [-1, 1]) ctx.fillRect(6 * M, sg * (W / 2 - 1.2 * M) - rl / 2, L - 12 * M, rl);
  // Mittellinie gestrichelt (30 m Strich, 20 m Lücke)
  ctx.strokeStyle = weiss; ctx.lineWidth = 0.9 * M; ctx.setLineDash([30 * M, 20 * M]); ctx.lineDashOffset = -45 * M;
  ctx.beginPath(); ctx.moveTo(45 * M, 0); ctx.lineTo(L - 45 * M, 0); ctx.stroke(); ctx.setLineDash([]); ctx.lineDashOffset = 0;
  // Schwelle (Zebrastreifen), Zielpunkt- und Aufsetzmarken, Nummern – je Ende gespiegelt
  const nummern = pi.nummern ?? [];
  [0, 1].forEach(ende => {
    ctx.save();
    if (ende) { ctx.translate(L, 0); ctx.rotate(Math.PI); }
    const streifen = Math.floor((W - 6 * M) / (3.4 * M));
    for (let i = 0; i < streifen; i++) {
      const v = -(streifen * 3.4 * M) / 2 + i * 3.4 * M + 0.8 * M;
      if (Math.abs(v + 0.9 * M) < 1.4 * M) continue;   // Mitte frei
      ctx.fillRect(4 * M, v, 28 * M, 1.8 * M);
    }
    for (const d of [150, 300, 450]) {   // Aufsetzmarken (Paare); bei 300 m die breiteren Zielpunktbalken
      if (d * M > L / 2 - 10 * M) continue;
      const lang = d === 300 ? 40 * M : 22 * M, br = d === 300 ? 3.6 * M : 2 * M, ab = d === 300 ? 9 * M : 6 * M;
      for (const sg of [-1, 1]) ctx.fillRect(d * M, sg * ab - (sg < 0 ? br : 0), lang, br);
    }
    if (nummern[ende]) {   // Ziffern von der Anflugseite lesbar (Oberkante zur Bahn hin)
      ctx.save(); ctx.translate(44 * M + 5 * M, 0); ctx.rotate(Math.PI / 2);
      ctx.fillStyle = weiss; ctx.font = `bold ${Math.round(13 * M)}px "Arial Black", Arial, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.scale(1, 1.15); ctx.fillText(nummern[ende], 0, 0);
      ctx.restore();
    }
    ctx.restore();
  });
  ctx.restore();
}

// ---------- Straßen und Wege ----------
const AUTO = new Set(['primary', 'secondary', 'tertiary', 'residential', 'unclassified', 'living_street']);
const MITTELLINIE = new Set(['primary', 'secondary', 'tertiary']);
// sichtbare Fahrbahnbreite wie in echt: OSM-Breite, sonst Spurzahl, sonst Straßennummer (B, St, Kreis), sonst Straßenart
const METER = K / 4;   // 4 m je Kachel
const ART_BREITE = { primary: 7.5, secondary: 6.5, tertiary: 6, unclassified: 5, residential: 5, living_street: 4, service: 3, pedestrian: 5 };
function fahrbahn(l) {
  if (l.fb) return l.fb;
  let m;
  if (l.breite >= 2.5) m = Math.min(10, l.breite);
  else if (l.spuren) m = Math.min(4, l.spuren) * (l.t === 'primary' || l.t === 'secondary' ? 3.4 : 3);
  else if (/^B\s?\d/.test(l.ref ?? '')) m = 7.5;
  else if (/^St\s?\d/.test(l.ref ?? '')) m = 6.8;
  else if (/^(K|[A-ZÄÖÜ]{2,3})\s?\d/.test(l.ref ?? '')) m = 6;
  else m = ART_BREITE[l.t] ?? 5;
  return (l.fb = m * METER);
}
// Fahrbahnbreite in Pixeln (für Straßensperren in osmwelt.mjs)
export const fahrbahnBreite = fahrbahn;
// Plätze für geparkte Autos: längs am Fahrbahnrand, nach der Straße ausgerichtet (Kartendaten in Kacheln, Ergebnis in Pixeln).
// Der Wagen steht mit der Innenkante knapp auf dem Asphalt, sonst auf Bordstein und Gehweg – wie in Wohnstraßen üblich.
const PARKEN = new Set(['residential', 'unclassified', 'living_street', 'tertiary']);
export function randParkplaetze(strassen) {
  const liste = [], LANG = 46, LUECKE = 12;
  for (const s of strassen ?? []) {
    if (!PARKEN.has(s.t) || !s.p || s.p.length < 4) continue;
    const fb = fahrbahn({ t: s.t, ref: s.ref, spuren: Number(s.spuren) || 0, breite: parseFloat(s.breite) || 0 });
    const ab = fb / 2 + 9;
    for (let i = 0; i + 3 < s.p.length; i += 2) {
      const ax = s.p[i] * K, ay = s.p[i + 1] * K, bx = s.p[i + 2] * K, by = s.p[i + 3] * K, len = Math.hypot(bx - ax, by - ay);
      if (len < LANG + 30) continue;   // kurze Stücke (Kurven, Kreuzungen) auslassen
      const ux = (bx - ax) / len, uy = (by - ay) / len, w = Math.atan2(uy, ux);
      for (let d = 20 + LANG / 2; d < len - 20 - LANG / 2; d += LANG + LUECKE) {
        for (const seite of [1, -1]) liste.push({ x: ax + ux * d - uy * ab * seite, y: ay + uy * d + ux * ab * seite, winkel: w, ux, uy });
      }
    }
  }
  return liste;
}

// Parkbuchten: Längsbuchten für 2–4 Autos direkt außen an der Fahrbahnkante gerader Straßenstücke (Ergebnis in Pixeln).
// Rechteck längs zur Straße, Mittelpunkt (x, y), Drehung winkel; seite = +1/−1 (Außenkante liegt bei seite·tiefe/2 in Eigenkoordinaten).
// osmwelt.mjs behält nur die, die auf freiem Gelände liegen.
export const BUCHT_TIEFE = 23, BUCHT_PLATZ = 52;
export function strassenBuchten(strassen) {
  const liste = [];
  let zaehler = 0;
  for (const s of strassen ?? []) {
    if (!PARKEN.has(s.t) || !s.p || s.p.length < 4) continue;
    const fb = fahrbahn({ t: s.t, ref: s.ref, spuren: Number(s.spuren) || 0, breite: parseFloat(s.breite) || 0 });
    for (let i = 0; i + 3 < s.p.length; i += 2) {
      const ax = s.p[i] * K, ay = s.p[i + 1] * K, bx = s.p[i + 2] * K, by = s.p[i + 3] * K, len = Math.hypot(bx - ax, by - ay);
      if (len < 2 * BUCHT_PLATZ + 48) continue;   // zu kurz (Kurven, Kreuzungen)
      const ux = (bx - ax) / len, uy = (by - ay) / len, w = Math.atan2(uy, ux);
      for (const seite of [1, -1]) {
        let d = 24 + hash(zaehler++ * 7 + 3) * 30;
        while (true) {
          // 2–4 Plätze; etwa jede dritte Bucht ist 1–2 Plätze länger als nötig (dort bleiben Plätze sichtbar frei)
          const extra = hash(zaehler++ * 17 + 2) < 0.5 ? 1 + Math.floor(hash(zaehler++ * 19 + 4) * 2) : 0;
          const n = 2 + Math.floor(hash(zaehler++ * 13 + 1) * 3) + extra, L = n * BUCHT_PLATZ;
          if (d + L > len - 24) break;
          if (hash(zaehler++ * 11 + 5) > 0.2) {   // etwa jede fünfte Stelle bleibt frei
            const mitte = d + L / 2, ab = fb / 2 + BUCHT_TIEFE / 2;
            const x = ax + ux * mitte - uy * ab * seite, y = ay + uy * mitte + ux * ab * seite;
            const plaetze = [];
            for (let j = 0; j < n; j++) {
              const t = d + BUCHT_PLATZ * (j + 0.5);
              plaetze.push({ x: ax + ux * t - uy * ab * seite, y: ay + uy * t + ux * ab * seite });
            }
            liste.push({ x, y, winkel: w, laenge: L, tiefe: BUCHT_TIEFE, seite, ux, uy, plaetze, extra });
          }
          d += L + 36 + hash(zaehler++ * 3 + 9) * 40;
        }
      }
    }
  }
  return liste;
}

function zeichneBuchten(ctx, welt, r, m) {
  const liste = welt.parkbuchten ?? (welt.parkbuchten = strassenBuchten(welt.vektor.strassen));
  for (const b of liste) {
    const rad = b.laenge / 2 + b.tiefe;
    if (b.x + rad < r.x0 || b.x - rad > r.x1 || b.y + rad < r.y0 || b.y - rad > r.y1) continue;
    ctx.save();
    ctx.translate(b.x, b.y); ctx.rotate(b.winkel);
    const L = b.laenge, T = b.tiefe, y0 = -T / 2;
    // schräge Ein-/Ausfahrten an den Enden (kleine Keile zur Fahrbahn hin)
    const innen = -b.seite * T / 2, aussen = b.seite * T / 2;
    ctx.fillStyle = '#6b6d70';
    ctx.beginPath();
    ctx.moveTo(-L / 2 - 9, innen); ctx.lineTo(-L / 2, aussen); ctx.lineTo(L / 2, aussen); ctx.lineTo(L / 2 + 9, innen);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = m.asphalt; ctx.fillRect(-L / 2, y0, L, T);
    ctx.fillStyle = 'rgba(255,255,255,.14)'; ctx.fillRect(-L / 2, y0, L, T);
    // Trennstriche zwischen den Plätzen und Anfangs-/Endstrich
    ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 1.6; ctx.lineCap = 'butt';
    ctx.beginPath();
    for (let x = -L / 2; x <= L / 2 + 0.1; x += BUCHT_PLATZ) { ctx.moveTo(x, y0 + 1); ctx.lineTo(x, y0 + T - 1); }
    ctx.stroke();
    // Bordsteinkante außen
    ctx.strokeStyle = '#b4b0a4'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(-L / 2, aussen); ctx.lineTo(L / 2, aussen); ctx.stroke();
    ctx.restore();
  }
}

const GEHWEG = 10;   // Breite eines Gehwegs in Pixeln (gut 1 m)
// Linie seitlich versetzt (o > 0: links, linke Normale (−dy, dx) wie die Laternen): Eckpunkte entlang der Winkelhalbierenden, Verlängerung begrenzt
function versetzt(pts, o) {
  const aus = [];
  for (let i = 0; i < pts.length; i++) {
    let nx = 0, ny = 0, n = 0;
    for (const [a, b] of [[pts[i - 1], pts[i]], [pts[i], pts[i + 1]]]) {
      if (!a || !b) continue;
      const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.sqrt(dx * dx + dy * dy) || 1;
      nx += -dy / L; ny += dx / L; n++;
    }
    const L = Math.sqrt(nx * nx + ny * ny) || 1, f = Math.min(2, n / L);   // Gehrung 1 / cos(halber Knickwinkel), höchstens doppelt
    aus.push([pts[i][0] + nx / L * o * f, pts[i][1] + ny / L * o * f]);
  }
  return aus;
}
// Beschneidung auf die Kacheln, auf denen ein Gehweg liegen darf (je Aufruf nur der sichtbare Ausschnitt, Läufe zu Rechtecken verbunden)
function gehwegClip(ctx, welt, r) {
  const kx0 = Math.max(0, Math.floor(r.x0 / K) - 1), kx1 = Math.min(BREITE - 1, Math.ceil(r.x1 / K) + 1);
  const ky0 = Math.max(0, Math.floor(r.y0 / K) - 1), ky1 = Math.ceil(r.y1 / K) + 1;
  const garten = welt.details?.garten;
  const ok = (kx, ky) => {
    const t = welt.hole(kx, ky);
    if (t === T.STRASSE || t === T.PLATZ) return true;
    if (t !== T.WIESE && t !== T.BAUM) return false;
    const g = garten?.[ky * BREITE + kx];
    return !g || g === '.';
  };
  ctx.beginPath();
  for (let ky = ky0; ky <= ky1; ky++) {
    for (let kx = kx0; kx <= kx1; kx++) {
      if (!ok(kx, ky)) continue;
      let ende = kx; while (ende + 1 <= kx1 && ok(ende + 1, ky)) ende++;
      ctx.rect(kx * K, ky * K, (ende - kx + 1) * K, K);
      kx = ende;
    }
  }
  ctx.clip();
}

export function zeichneStrassen(ctx, welt, rect) {
  const v = vorbereiten(welt), r = pixelRect(rect), m = musterHolen(ctx);
  const hier = v.linien.filter(l => schneidet(l.box, r) && l.pts.length > 1);
  ctx.save();
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  // Stil wie im Prototyp: schmale Fahrbahn mit dunkler Kante, Gehweg nur angedeutet, Fußwege als helle Linien
  // 1. Fußwege und Feldwege
  for (const l of hier) {
    if (AUTO.has(l.t) || l.t === 'service' || l.t === 'pedestrian') continue;
    pfad(ctx, l.pts);
    ctx.strokeStyle = 'rgba(60,50,30,.25)'; ctx.lineWidth = 9; ctx.stroke();
    ctx.strokeStyle = l.t === 'track' ? '#c9b98f' : '#d8cfb0'; ctx.lineWidth = 6; ctx.stroke();
  }
  // 2. Gehwege: schmale hellgraue Streifen beidseitig der Fahrstraßen mit feiner Bordsteinlinie.
  // Nur auf freiem Gelände (Straße, Platz, ungezäunte Wiese): nicht über Häusern, Gärten, Zäunen und Wasser.
  const gehwege = hier.filter(l => AUTO.has(l.t));
  // amtliche Gehwegbreiten (gl/gr, tools/amtlich.py): je Seite ein glatter Streifen, ohne Kachelbeschneidung (die Breiten stammen aus der Nutzungsfläche
  // „Straßenverkehr“, liegen also nicht über Häusern; Dächer und Zäune werden später darübergezeichnet)
  for (const l of gehwege) {
    if (l.gl === undefined && l.gr === undefined) continue;
    const fb = fahrbahn(l);
    for (const [seite, g] of [[1, l.gl ?? 0], [-1, l.gr ?? 0]]) {   // Innenkante knapp unter dem Asphalt; 0 = kein Gehweg auf dieser Seite
      if (!(g > 0)) continue;
      const w = g * 8, o = seite * (fb / 2 + w / 2 - 1), pts = versetzt(l.pts, o);
      pfad(ctx, pts); ctx.strokeStyle = 'rgba(112,110,102,.5)'; ctx.lineWidth = w + 2; ctx.stroke();
      pfad(ctx, pts); ctx.strokeStyle = 'rgba(208,206,198,.88)'; ctx.lineWidth = w; ctx.stroke();
    }
  }
  if (gehwege.some(l => l.gl === undefined && l.gr === undefined)) {
    ctx.save();
    gehwegClip(ctx, welt, r);
    for (const l of gehwege) {
      if (l.gl !== undefined || l.gr !== undefined) continue;
      const fb = fahrbahn(l);
      for (const t of l.gehTeile ?? []) {
        pfad(ctx, t); ctx.strokeStyle = 'rgba(112,110,102,.5)'; ctx.lineWidth = fb + 2 * GEHWEG + 2; ctx.stroke();
        pfad(ctx, t); ctx.strokeStyle = 'rgba(208,206,198,.88)'; ctx.lineWidth = fb + 2 * GEHWEG; ctx.stroke();
      }
    }
    ctx.restore();
  }
  for (const l of hier) if (l.t === 'pedestrian') { pfad(ctx, l.pts); ctx.strokeStyle = m.pflaster; ctx.lineWidth = l.b; ctx.stroke(); }
  // 3. dunkle Kanten aller Fahrbahnen zuerst, dann der Asphalt – so bleiben Kreuzungen sauber
  const fahr = hier.filter(l => AUTO.has(l.t) || l.t === 'service');
  for (const l of fahr) { pfad(ctx, l.pts); ctx.strokeStyle = '#34363a'; ctx.lineWidth = fahrbahn(l) + 5; ctx.stroke(); }
  for (const l of fahr) { pfad(ctx, l.pts); ctx.strokeStyle = m.asphalt; ctx.lineWidth = fahrbahn(l); ctx.stroke(); }
  // 3a. Zebrastreifen (amtliche Karte, OSM crossing=zebra/marked): weiße Balken längs zur Fahrbahn, nebeneinander über die ganze Fahrbahnbreite
  for (const z of welt.vektor?.zebra ?? []) {
    if (z.x < r.x0 - 60 || z.x > r.x1 + 60 || z.y < r.y0 - 60 || z.y > r.y1 + 60) continue;
    ctx.save(); ctx.translate(z.x, z.y); ctx.rotate(Math.atan2(z.uy, z.ux));   // x = Fahrtrichtung, y = quer über die Fahrbahn
    ctx.fillStyle = 'rgba(244,244,238,.9)';
    const n = Math.max(2, Math.floor(z.l / 8));
    for (let i = 0; i < n; i++) ctx.fillRect(-12, -z.l / 2 + 2 + i * 8, 24, 4);   // Balken 3 m × 0,5 m, Abstand 0,5 m
    ctx.restore();
  }
  // 3b. Parkbuchten (Autos zeichnet später zeichneBoden)
  if (welt.vektor?.strassen) zeichneBuchten(ctx, welt, r, m);
  // 4. Straßennamen leicht sichtbar auf der Fahrbahn (B 11, St 2369 als Nummer dazu)
  strassenNamen(ctx, v, r);
  // 5. Mittellinie nur auf großen Straßen
  for (const l of hier) {
    if (!MITTELLINIE.has(l.t)) continue;
    pfad(ctx, l.pts);
    ctx.setLineDash([14, 14]); ctx.lineCap = 'butt';
    ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 1.8; ctx.stroke();
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
// Dachbilder merken (ein Haus liegt oft in mehreren Kartenstücken, Stücke werden beim Zurücklaufen neu gebaut);
// höchstens DACH_SPEICHER Stück, das am längsten unbenutzte fliegt raus
const dachSpeicher = new Map(), DACH_SPEICHER = 400;
export function dachBild(g, farbeOverride) {
  if (farbeOverride) return dachBildRechnen(g, farbeOverride);
  let b = dachSpeicher.get(g);
  if (b !== undefined) { dachSpeicher.delete(g); dachSpeicher.set(g, b); return b; }
  b = dachBildRechnen(g);
  dachSpeicher.set(g, b);
  if (dachSpeicher.size > DACH_SPEICHER) dachSpeicher.delete(dachSpeicher.keys().next().value);
  return b;
}

function dachBildRechnen(g, farbeOverride) {
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
      if (g.lb?.dachart === 'sattel' && drin) {
        // Satteldach nach Luftbild: zwei Hälften quer zur Firstrichtung, die eine heller (so wie im Foto), Firstlinie dazwischen
        const lb = g.lb, v = -px * Math.sin(lb.w) + py * Math.cos(lb.w), mitte = (lb.vmin + lb.vmax) / 2, halb = Math.max(1, (lb.vmax - lb.vmin) / 2);
        const seite = v >= mitte ? 1 : -1, rel = Math.abs(v - mitte) / halb;
        f = 1 + 0.17 * seite * lb.hell;
        if (Math.abs(v - mitte) < 1.5) f *= 1.12;                                   // First
        if (d1 < 2.5) f *= 0.86;                                                    // Traufkante
        else if (rel < 0.97 && (((d1 + 64) % 8) < 1.3)) f *= 0.93;         // feine Ziegelreihen
        f *= 0.97 + hash(i * 31 + j * 977) * 0.06;
      } else if (g.flach) {
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

// Lüfter und Solarmodule auf Flachdächern, Solaranlage und Kamin auf geneigten Dächern
function dachDetails(ctx, g) {
  const b = orientierteBox(g.pts), n = Math.round(g.pts[0][0] * 7 + g.pts[0][1] * 13);
  if (b.lang < 3 * K || b.breit < 2 * K) return;
  imRechteck(ctx, b, (L, Bt) => {
    if (g.flach) {
      if (hash(n) < 0.45) {   // Solarfeld
        const w = L * 1.1, h = Bt * 0.9;
        for (let x = -w / 2; x < w / 2 - 6; x += 9) for (let y = -h / 2; y < h / 2 - 5; y += 7) {
          ctx.fillStyle = '#23345a'; ctx.fillRect(x, y, 8, 6); ctx.fillStyle = 'rgba(150,180,255,.25)'; ctx.fillRect(x, y, 8, 1.5);
        }
      }
      for (let k = 0; k < 1 + Math.floor(hash(n + 3) * 3); k++) {   // Lüftungsgeräte
        const x = (hash(n + k * 11) - 0.5) * L * 1.4, y = (hash(n + k * 23) - 0.5) * Bt * 1.4;
        ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.fillRect(x + 2, y + 2, 9, 9);
        ctx.fillStyle = '#c7c7c2'; ctx.fillRect(x, y, 9, 9); ctx.strokeStyle = '#7d7d78'; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, 8, 8);
        ctx.beginPath(); ctx.arc(x + 4.5, y + 4.5, 2.5, 0, Math.PI * 2); ctx.stroke();
      }
    } else {
      const sued = Math.cos(b.w) >= 0 ? 1 : -1;   // Dachseite, die nach Süden (unten) zeigt
      if (hash(n) < 0.3) {
        const w = L * 1.1, h = Bt * 0.55;
        ctx.fillStyle = '#20304f'; ctx.fillRect(-w / 2, sued * Bt * 0.18 - h / 2 + sued * h * 0.1, w, h);
        ctx.strokeStyle = 'rgba(160,190,255,.35)'; ctx.lineWidth = 1;
        for (let x = -w / 2 + 8; x < w / 2; x += 8) { ctx.beginPath(); ctx.moveTo(x, sued * Bt * 0.18 - h / 2 + sued * h * 0.1); ctx.lineTo(x, sued * Bt * 0.18 + h / 2 + sued * h * 0.1); ctx.stroke(); }
      }
      if (hash(n + 7) < 0.55) {   // Kamin
        const x = (hash(n + 9) - 0.5) * L, y = -sued * Bt * 0.15;
        ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(x + 2, y + 3, 7, 7);
        ctx.fillStyle = '#8d6e63'; ctx.fillRect(x, y, 7, 7); ctx.fillStyle = '#3e2723'; ctx.fillRect(x + 2, y + 2, 3, 3);
      }
    }
  });
}

function schatten(ctx, g) {
  ctx.save(); ctx.translate(7, 10);
  pfad(ctx, g.pts, true); ctx.fillStyle = 'rgba(0,0,0,.26)'; ctx.fill();
  ctx.restore();
}

// Haustür im Ursprung (x entlang der Wand, y nach außen): ca. 1,5 m breit (12 px), bündig in der Wand, ragt höchstens ~0,3 m heraus;
// schlanker heller Rahmen, rotbraunes Türblatt mit Füllungen, goldene Klinke, flache Schwelle (keine Stufe)
export function haustuerZeichnen(ctx) {
  ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(-6.5, 1, 13, 2.5);                   // Schatten an der Wand
  ctx.fillStyle = '#fff6dc'; ctx.fillRect(-6, -2.5, 12, 5);                             // schlanker Rahmen (innen halb in der Wand, außen 2,5 px davor)
  ctx.strokeStyle = '#1b0f0a'; ctx.lineWidth = 0.6; ctx.strokeRect(-5.8, -2.3, 11.6, 4.6);
  ctx.fillStyle = '#a63a1a'; ctx.fillRect(-5, -1.6, 10, 3.4);                           // Türblatt (Holzrot)
  ctx.fillStyle = '#6e2410'; ctx.fillRect(-5, -1.6, 10, 0.8); ctx.fillRect(-0.25, -0.8, 0.5, 2.6);   // Oberkante, Mittelfuge
  ctx.fillStyle = '#c4572e'; ctx.fillRect(-4.2, -0.4, 3.4, 1.9); ctx.fillRect(0.8, -0.4, 3.4, 1.9);  // Füllungen
  ctx.fillStyle = '#ffd54f'; ctx.fillRect(2.8, 0.1, 1.4, 1.4);                         // Klinke
  ctx.fillStyle = '#9e9a8c'; ctx.fillRect(-6, 2.5, 12, 0.7);                            // flache Schwelle
}

// Eingangsmarkierung eines Safe Rooms, ÜBER dem Safe-Dach (das Dach großer/unregelmäßiger Gebäude deckt Tür und Vorplatz sonst zu):
// Tür auf der Wand (wie haustuerZeichnen), grüner Leuchtfleck auf dem Vorplatz und ein Schild „SAFE“ mit Pfeil zur Tür. Ursprung = Türmitte, w = Drehwinkel der Tür (+y nach außen).
export function zeichneSafeEingang(ctx, w) {
  const nx = -Math.sin(w), ny = Math.cos(w);   // Richtung nach draußen
  const g = ctx.createRadialGradient(nx * 22, ny * 22, 2, nx * 22, ny * 22, 34);
  g.addColorStop(0, 'rgba(105,240,120,.55)'); g.addColorStop(1, 'rgba(105,240,120,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(nx * 22, ny * 22, 34, 0, Math.PI * 2); ctx.fill();
  ctx.save(); ctx.rotate(w); haustuerZeichnen(ctx); ctx.restore();
  // Schild vor dem Vorplatz der Tür, Pfeil zeigt zur Tür
  const sx = nx * 52, sy = ny * 52;
  ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(sx - 15, sy - 5, 32, 17);
  ctx.fillStyle = '#1b5e20'; ctx.fillRect(sx - 16, sy - 9, 32, 17);
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5; ctx.strokeRect(sx - 15, sy - 8, 30, 15);
  ctx.fillStyle = '#ffffff'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('SAFE', sx, sy);
  const tx = nx * 8, ty = ny * 8;   // Pfeilspitze an der Tür
  ctx.strokeStyle = '#ffffff'; ctx.fillStyle = '#ffffff'; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.moveTo(nx * 35, ny * 35); ctx.lineTo(tx + nx * 6, ty + ny * 6); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(tx + nx * 8 - ny * 5, ty + ny * 8 + nx * 5); ctx.lineTo(tx + nx * 8 + ny * 5, ty + ny * 8 - nx * 5); ctx.closePath(); ctx.fill();
}

export function zeichneVektorDaecher(ctx, welt, rect) {
  const v = vorbereiten(welt), r = pixelRect(rect);
  const hier = v.gebaeude.filter(g => !g.safe && schneidet({ ...g.box, x1: g.box.x1 + 10, y1: g.box.y1 + 12 }, r));
  const begrenzt = (g, f) => { ctx.save(); ctx.beginPath(); ctx.rect(...g.clip); ctx.clip(); f(); ctx.restore(); };
  const echt = kulDaecher();   // Kulisse „Echte Dächer“: LoD2-Dach im OSM-Umriss; Häuser ohne Eintrag behalten die gezeichnete Dachfläche
  for (const g of hier) begrenzt(g, () => schatten(ctx, g));
  ctx.imageSmoothingEnabled = true;
  hier.forEach(g => {
    if (echt && zeichneEchtesDach(ctx, g, g.farbe)) return;
    const b = dachBild(g);
    if (b) begrenzt(g, () => { ctx.drawImage(b.bild, b.x, b.y, b.b, b.h); dachDetails(ctx, g); });
  });
  // Laternenmasten werden nicht mehr gezeichnet (nur der nächtliche Lichtschein bleibt, Positionen: laternen(welt))
  // Haustüren: auf der echten Hauswand, an der Stelle, die der Rastertür am nächsten liegt, entlang der Wand gedreht
  for (const h of welt.haeuser) {
    if (!h.betretbar || !h.tuer) continue;
    const t = tuerAufWand(v, h);
    if (t.x < r.x0 - K || t.x > r.x1 + K || t.y < r.y0 - K || t.y > r.y1 + K) continue;
    ctx.save(); ctx.translate(t.x, t.y); ctx.rotate(t.w);   // x entlang der Wand, y nach außen
    haustuerZeichnen(ctx);
    ctx.restore();
  }
}

// Lage der Haustür auf der echten Hauswand: { wx, wy } = Türmitte an der Wand, w = Drehwinkel (+y zeigt nach draußen, x läuft entlang der Wand)
export function tuerPose(welt, h) { return tuerAufWand(vorbereiten(welt), h); }

// Pose der Haustür: exakt auf der Hauswand (h.tuerPos aus tuerpose.mjs: Nische/Vordach bevorzugt, mind. 1 m von den Ecken); w = Winkel, bei dem +y nach draußen zeigt
function tuerAufWand(v, h) {
  if (h._tuerWand) return h._tuerWand;
  const t = h.tuerPos ?? { x: (h.tuer.x + 0.5 + h.raus.dx * 0.5) * K, y: (h.tuer.y + 0.5 + h.raus.dy * 0.5) * K, nx: h.raus.dx, ny: h.raus.dy };
  return (h._tuerWand = { x: t.x, y: t.y, w: Math.atan2(t.ny, t.nx) - Math.PI / 2, wx: t.x, wy: t.y, nx: t.nx, ny: t.ny });
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
  if (welt.vektor?.laternen?.length) return (welt._laternen = welt.vektor.laternen);   // amtliche Karte: fertige Standorte (Abstand 30–35 m, tools/amtlich.py)
  const v = vorbereiten(welt), liste = [], ABSTAND = 9 * K;
  for (const l of v.linien) {
    if (!AUTO.has(l.t)) continue;
    let rest = ABSTAND / 2, seite = 1;
    for (let i = 0; i + 1 < l.pts.length; i++) {
      const [ax, ay] = l.pts[i], [bx, by] = l.pts[i + 1], len = Math.hypot(bx - ax, by - ay);
      if (len < 1) continue;
      const nx = -(by - ay) / len, ny = (bx - ax) / len, off = fahrbahn(l) / 2 + 0.35 * K;
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

// Namensplätze einmal je Welt: je Straße die längsten geraden Stücke, lange Straßen mehrfach (etwa alle 50 Kacheln)
function namensPlaetze(v) {
  if (v.namen) return v.namen;
  const liste = [];
  const gruppen = new Map();
  for (const l of v.linien) {
    if (!(AUTO.has(l.t) || l.t === 'pedestrian') || !(l.n || l.ref)) continue;
    const text = l.n && l.ref ? `${l.n} · ${l.ref}` : (l.n || l.ref);
    for (let i = 0; i + 1 < l.pts.length; i++) {
      const [ax, ay] = l.pts[i], [bx, by] = l.pts[i + 1], len = Math.hypot(bx - ax, by - ay);
      if (len < 5 * K) continue;
      if (!gruppen.has(text)) gruppen.set(text, []);
      gruppen.get(text).push({ text, ax, ay, bx, by, len, fb: fahrbahn(l) });
    }
  }
  for (const [, stuecke] of gruppen) {
    stuecke.sort((a, b) => b.len - a.len);
    const gewaehlt = [];
    for (const s of stuecke) {
      const mx = (s.ax + s.bx) / 2, my = (s.ay + s.by) / 2;
      if (gewaehlt.some(g => Math.hypot(g.mx - mx, g.my - my) < 50 * K)) continue;
      gewaehlt.push({ ...s, mx, my });
      if (gewaehlt.length >= 4) break;
    }
    liste.push(...gewaehlt);
  }
  return (v.namen = liste);
}

function strassenNamen(ctx, v, r) {
  ctx.save();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const s of namensPlaetze(v)) {
    if (s.mx < r.x0 - 400 || s.mx > r.x1 + 400 || s.my < r.y0 - 400 || s.my > r.y1 + 400) continue;
    const gr = Math.max(10, Math.min(15, s.fb * 0.42));
    ctx.font = `600 ${gr}px sans-serif`;
    if (ctx.measureText(s.text).width > s.len * 0.8) continue;
    let w = Math.atan2(s.by - s.ay, s.bx - s.ax);
    if (w > Math.PI / 2) w -= Math.PI; else if (w < -Math.PI / 2) w += Math.PI;
    ctx.save(); ctx.translate(s.mx, s.my); ctx.rotate(w);
    ctx.fillStyle = 'rgba(255,255,255,.32)'; ctx.fillText(s.text, 0, 0);
    ctx.restore();
  }
  ctx.restore();
}

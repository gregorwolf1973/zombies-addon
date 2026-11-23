// Zustand der Fahrbahn (nur Zeichnung, deterministisch aus Linien-Id/Seed, kein Math.random):
//  - Straßenende: gerade quer abgeschnitten, bröckelnder Teer, Risse, abgeplatzte Stücke, Schotter mit Gras-Inseln (3-8 m)
//  - Flicken (dunkel = frisch, hell = alt), Schlaglöcher mit ausgebrochenem Rand, Staub/Dreck an Rändern und Kreuzungsecken
// Alles in Pixeln (8 px = 1 m). Die Formen werden je Linie einmal berechnet; gezeichnet wird in die Kachel-Zwischenspeicher.
const PX = 8;
const hash = n => { let h = Math.imul(n | 0, 2654435761); h = Math.imul(h ^ (h >>> 15), 2246822519); return ((h ^ (h >>> 13)) >>> 0) / 4294967296; };
// weiches Werterauschen 0…1
function gn(x, wl, sd) {
  const u = x / wl, i = Math.floor(u), t = u - i, w = t * t * (3 - 2 * t);
  const a = hash(sd * 7919 + i), b = hash(sd * 7919 + i + 1);
  return a + (b - a) * w;
}
const sm = t => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

// ---------- Straßenende ----------
export const SCHOTTER_MIN = 3 * PX, SCHOTTER_MAX = 8 * PX;

// Form der Abbruchkante: Tiefe (px, >0 nach innen) an der Querposition u
function abbruchFunktion(sd, W) {
  const kerben = [];
  const nk = 2 + Math.floor(hash(sd + 11) * 3);
  for (let i = 0; i < nk; i++) kerben.push({ u: (hash(sd * 3 + i * 5 + 12) * 2 - 1) * W * 0.9, b: 2.5 + hash(sd * 5 + i * 7 + 13) * 5, t: 3 + hash(sd * 7 + i * 3 + 14) * 7 });
  return u => {
    let b = 3 + 10 * gn(u, 22, sd) + 5 * gn(u, 7, sd + 1) + (hash(sd * 13 + Math.round(u * 0.8)) - 0.5) * 3.2;
    for (const k of kerben) { const q = Math.abs(u - k.u) / k.b; if (q < 1) b += k.t * (1 - q * q) * (1 - q * q) * (q < 0.8 ? 1 : (1 - q) * 5); }
    return Math.max(1, b);
  };
}

// e: { x, y, tx, ty (Einheitsvektor nach außen), hw (halbe Fahrbahnbreite px), kerb, weg (Breite des anschließenden Wegs px, 0 = keiner), seed, service }
export function zeichneStrassenende(ctx, e) {
  const sd = e.seed, hw = e.hw, W = hw + (e.kerb ? 11 : 2.5), Wg = hw + 3;   // W: Breite der Abbruchzone (mit Gehweg), Wg: Breite des Schotters danach
  const L = (SCHOTTER_MIN + (SCHOTTER_MAX - SCHOTTER_MIN) * hash(sd + 1)) * (e.service ? 0.7 : 1);
  const wegHalf = e.weg ? e.weg / 2 + 1.5 : 0;
  const B = abbruchFunktion(sd, W);
  const wA = a => (e.weg ? lerp(Wg, wegHalf, sm(a / L)) : lerp(Wg, Wg * 0.78, sm(a / L))) + (W - Wg) * (1 - sm(a / 9));
  const fray = (a, s2) => (gn(a, 9, sd + s2) - 0.5) * 5 + (hash(sd * 29 + Math.round(a * 0.5) * 3 + s2) - 0.5) * 2.4;
  const far = u => L * (0.78 + 0.22 * gn(u, 10, sd + 3));
  // Umriss des Schotters (a nach außen, u quer), beginnend an der Abbruchkante von links nach rechts
  const inner = []; for (let u = -W; u <= W + 0.01; u += 1.5) inner.push([-B(u), u]);
  const poly = inner.slice();
  const rechts = [], links = [];
  const aEnd = e.weg ? L : L * 0.8;
  for (let a = 0; a <= aEnd + 0.01; a += 3) { const w = wA(a); rechts.push([a, w + fray(a, 4)]); links.push([a, -(w + fray(a, 5))]); }
  for (const p of rechts) poly.push(p);
  if (e.weg) { poly.push([L, wegHalf]); poly.push([L, -wegHalf]); }
  else {
    const w1 = wA(aEnd);
    for (let u = w1; u >= -w1 - 0.01; u -= 2) poly.push([far(u) * (1 - 0.4 * Math.pow(Math.abs(u) / w1, 2)) + (hash(sd * 17 + Math.round(u)) - 0.5) * 2, u]);
  }
  for (let i = links.length - 1; i >= 0; i--) poly.push(links[i]);

  ctx.save();
  ctx.transform(e.tx, e.ty, -e.ty, e.tx, e.x, e.y);
  ctx.lineJoin = 'round';
  const bahn = pts => { ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); };
  // weicher dunkler Saum (Verwitterung) und Schotterfläche
  bahn(poly); ctx.closePath(); ctx.fillStyle = 'rgba(92,84,70,.22)'; ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(92,84,70,.22)'; ctx.stroke(); ctx.fill();
  ctx.fillStyle = '#9b9585'; ctx.fill();
  ctx.save(); bahn(poly); ctx.closePath(); ctx.clip();
  // Schotterbett: zwei unterschiedlich grobe Schichten, gröbere Wolken
  for (let i = 0; i < 26; i++) {
    const a = -12 + hash(sd * 3 + i) * (L + 12), u = (hash(sd * 5 + i + 40) * 2 - 1) * wA(Math.max(0, a)), r = 4 + hash(sd * 7 + i) * 9;
    ctx.fillStyle = i % 2 ? 'rgba(120,110,92,.16)' : 'rgba(210,200,176,.2)';
    ctx.beginPath(); ctx.ellipse(a, u, r * 1.1, r * 0.8, hash(sd + i) * 3, 0, Math.PI * 2); ctx.fill();
  }
  const hell = new Path2D(), dunkel = new Path2D(), beige = new Path2D();
  const area = (L + 12) * 2 * Wg, n = Math.min(900, Math.round(area / 8));
  for (let i = 0; i < n; i++) {
    const a = -16 + hash(sd * 11 + i * 3) * (L + 16), u = (hash(sd * 13 + i * 3 + 1) * 2 - 1) * Math.min(W, wA(Math.max(0, a))), q = hash(sd * 17 + i * 3 + 2), s = 0.9 + hash(sd * 19 + i) * 1.4;
    (q < 0.4 ? hell : q < 0.7 ? dunkel : beige).rect(a, u, s, s * (0.6 + hash(sd * 23 + i) * 0.6));
  }
  ctx.fillStyle = 'rgba(226,220,204,.5)'; ctx.fill(hell); ctx.fillStyle = 'rgba(66,62,54,.5)'; ctx.fill(dunkel); ctx.fillStyle = 'rgba(176,160,126,.5)'; ctx.fill(beige);
  ctx.restore();
  // Teerreste im Schotter nahe der Kante: abgeplatzte Stücke
  for (let i = 0, nn = 5 + Math.floor(hash(sd + 31) * 5); i < nn; i++) {
    const u = (hash(sd * 3 + i * 11 + 50) * 2 - 1) * (hw - 1), a = -B(u) + 1 + hash(sd * 5 + i * 13 + 51) * (6 + 14 * hash(sd * 7 + i));
    const r = 1 + hash(sd * 9 + i * 17 + 52) * 2.2, k = 5 + Math.floor(hash(sd + i * 19) * 3), ph = hash(sd + i * 23 + 53) * 6.28;
    ctx.beginPath();
    for (let m = 0; m < k; m++) { const w = ph + m / k * 6.283, rr = r * (0.6 + hash(sd * 31 + i * 41 + m) * 0.7); ctx.lineTo(a + Math.cos(w) * rr * 1.2, u + Math.sin(w) * rr * 0.85); }
    ctx.closePath(); ctx.fillStyle = '#5a5a58'; ctx.fill(); ctx.strokeStyle = 'rgba(180,176,166,.4)'; ctx.lineWidth = 0.6; ctx.stroke();
  }
  if (e.kerb) for (let i = 0; i < 6; i++) {   // abgebrochene Bordstein-/Gehwegstücke
    const sg = i % 2 ? 1 : -1, u = sg * (hw + 1 + hash(sd * 5 + i + 60) * 8), a = -B(u) + hash(sd * 7 + i + 61) * 12, r = 1.5 + hash(sd * 9 + i + 62) * 2.2;
    ctx.fillStyle = 'rgba(170,168,160,.95)'; ctx.fillRect(a, u, r * 1.6, r);
  }
  // Abbruchkante des Teers: Schatten und Kantenlicht
  bahn(inner.map(p => [p[0] - 1.6, p[1]])); ctx.strokeStyle = 'rgba(15,15,15,.28)'; ctx.lineWidth = 2.6; ctx.stroke();
  bahn(inner.filter(p => Math.abs(p[1]) <= hw + 1)); ctx.strokeStyle = 'rgba(210,205,192,.35)'; ctx.lineWidth = 0.8; ctx.stroke();
  // lose Krümel auf der Teerseite
  const krum = new Path2D();
  for (let i = 0; i < 40; i++) { const u = (hash(sd * 3 + i + 70) * 2 - 1) * (hw - 1), a = -B(u) - hash(sd * 5 + i + 71) * 9; krum.rect(a, u, 1 + hash(sd + i + 72), 1); }
  ctx.fillStyle = 'rgba(22,22,22,.45)'; ctx.fill(krum);
  // Risse: gehen von der Kante in den Teer, verzweigen vereinzelt; dazu zwei Querrisse
  ctx.strokeStyle = 'rgba(14,14,14,.5)'; ctx.lineWidth = 0.7; ctx.lineCap = 'round';
  const riss = (a, u, w, len, tiefe) => {
    ctx.beginPath(); ctx.moveTo(a, u);
    for (let m = 0; m < len; m++) {
      w += (hash(sd * 37 + tiefe * 101 + m * 7 + Math.round(u)) - 0.5) * 0.9; a += Math.cos(w) * 2.2; u += Math.sin(w) * 2.2; ctx.lineTo(a, u);
      if (tiefe < 1 && m > 1 && hash(sd * 41 + m * 13 + Math.round(u * 3)) < 0.14) { ctx.stroke(); riss(a, u, w + (hash(sd + m) > 0.5 ? 0.8 : -0.8), Math.floor(len / 2), tiefe + 1); ctx.beginPath(); ctx.moveTo(a, u); }
    }
    ctx.stroke();
  };
  for (let i = 0, nr = 3 + Math.floor(hash(sd + 80) * 3); i < nr; i++) { const u = (hash(sd * 3 + i + 81) * 2 - 1) * (hw - 2); riss(-B(u), u, Math.PI + (hash(sd + i + 82) - 0.5) * 1.1, 2 + Math.floor(hash(sd * 7 + i + 83) * 6), 0); }
  ctx.lineWidth = 0.6;
  for (let i = 0; i < 2; i++) {
    const u0 = (hash(sd * 3 + i + 90) * 2 - 1) * hw * 0.7, a0 = -B(u0) - 8 - hash(sd + i + 91) * 14, w = (hash(sd + i + 92) - 0.5) * 0.5; riss(a0, u0, Math.PI / 2 + w, 3 + Math.floor(hash(sd + i + 93) * 5), 1);
  }
  // Gras und Unkraut: Inseln im Schotter, Büschel an den Rändern und in der Abbruchkante
  for (let i = 0, nn = 3 + Math.floor(hash(sd + 100) * 4); i < nn; i++) {
    const a = L * (0.22 + 0.7 * hash(sd * 3 + i + 101)), u = (hash(sd * 5 + i + 102) * 2 - 1) * wA(a) * 0.8, r = 1.6 + hash(sd * 7 + i + 103) * 3.4;
    ctx.beginPath();
    for (let m = 0; m < 8; m++) { const w = m / 8 * 6.283, rr = r * (0.65 + hash(sd * 43 + i * 7 + m) * 0.7); ctx.lineTo(a + Math.cos(w) * rr * 1.2, u + Math.sin(w) * rr); }
    ctx.closePath(); ctx.fillStyle = 'rgba(92,126,58,.88)'; ctx.fill();
    ctx.strokeStyle = 'rgba(122,156,78,.9)'; ctx.lineWidth = 0.9;
    for (let m = 0; m < 4; m++) { ctx.beginPath(); ctx.moveTo(a, u); ctx.lineTo(a + (hash(sd * 3 + i * 9 + m) - 0.5) * r * 3, u + (hash(sd * 5 + i * 9 + m) - 0.5) * r * 3); ctx.stroke(); }
  }
  ctx.strokeStyle = 'rgba(86,124,52,.85)'; ctx.lineWidth = 1;
  for (let i = 0; i < 14; i++) {
    const a = hash(sd * 3 + i + 110) * L * 0.95, sg = hash(sd * 5 + i + 111) < 0.5 ? 1 : -1, u = sg * (wA(a) - 1 + (hash(sd * 7 + i + 112) - 0.3) * 2.4);
    ctx.beginPath(); ctx.moveTo(a, u); ctx.lineTo(a + (hash(sd * 9 + i) - 0.5) * 3, u - sg * (1.6 + hash(sd * 11 + i) * 2.4)); ctx.moveTo(a + 1, u); ctx.lineTo(a + 2 + (hash(sd * 13 + i) - 0.5) * 2, u - sg * (1 + hash(sd * 15 + i) * 2)); ctx.stroke();
  }
  for (let i = 0; i < 5; i++) {   // Unkraut aus Rissen der Teerkante
    const u = (hash(sd * 3 + i + 120) * 2 - 1) * (hw - 2), a = -B(u) - 1 - hash(sd * 5 + i + 121) * 4;
    ctx.beginPath(); ctx.moveTo(a, u); ctx.lineTo(a - 2.2, u + 1); ctx.moveTo(a, u); ctx.lineTo(a - 1.8, u - 1.2); ctx.stroke();
  }
  // einzelne Kiesel jenseits des Umrisses
  const kiesel = new Path2D();
  for (let i = 0; i < 30; i++) {
    const a = hash(sd * 3 + i + 130) * L, sg = hash(sd * 5 + i + 131) < 0.5 ? 1 : -1, u = sg * (wA(a) + 1 + hash(sd * 7 + i + 132) * 3.5);
    kiesel.rect(a, u, 1.1, 1.1);
  }
  ctx.fillStyle = 'rgba(176,166,146,.7)'; ctx.fill(kiesel);
  ctx.restore();
}

// ---------- Flicken, Schlaglöcher, Schmutz je Linie ----------
const FLICK_P = { primary: 0.25, secondary: 0.3, tertiary: 0.4, residential: 0.45, unclassified: 0.55, living_street: 0.4, service: 0.6 };
const LOCH_P = { primary: 0.05, secondary: 0.09, tertiary: 0.17, residential: 0.24, unclassified: 0.42, living_street: 0.24, service: 0.5 };
const FACH = 300;   // px (~37 m)

function suche(d, s) { let lo = 0, hi = d.n - 1; while (lo < hi - 1) { const m = (lo + hi) >> 1; if (d.s[m] <= s) lo = m; else hi = m; } return lo; }
function rahmen(d, j) {
  const a = Math.max(0, j - 1), b = Math.min(d.n - 1, j + 1);
  let tx = d.x[b] - d.x[a], ty = d.y[b] - d.y[a]; const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
  return { x: d.x[j], y: d.y[j], tx, ty, nx: -ty, ny: tx };
}
const abw = (f, a, u) => [f.x + f.tx * a + f.nx * u, f.y + f.ty * a + f.ny * u];
function kasten(ps) { let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const p of ps) { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; } return { x0, y0, x1, y1 }; }
const treffer = (b, r) => b.x1 >= r.x0 && b.x0 <= r.x1 && b.y1 >= r.y0 && b.y0 <= r.y1;

function flickPoly(f, a0, a1, u0, u1, sd) {
  // gerade lange Kanten, kurze Enden leicht gezackt
  const pts = [], z = k => (hash(sd * 7 + k) - 0.5) * 2.4;
  const nz = 2 + Math.floor(hash(sd + 3) * 2);
  pts.push(abw(f, a0 + z(1) * 0.3, u0));
  for (let i = 1; i <= nz; i++) pts.push(abw(f, a0 + z(i + 10), u0 + (u1 - u0) * i / (nz + 1)));
  pts.push(abw(f, a0 + z(2) * 0.3, u1));
  pts.push(abw(f, a1 + z(3) * 0.3, u1));
  for (let i = nz; i >= 1; i--) pts.push(abw(f, a1 + z(i + 20), u0 + (u1 - u0) * i / (nz + 1)));
  pts.push(abw(f, a1 + z(4) * 0.3, u0));
  return pts;
}
function blob(f, a, u, ra, ru, sd, n = 8) {
  const pts = [];
  for (let m = 0; m < n; m++) { const w = m / n * 6.283, k = 0.7 + hash(sd * 31 + m * 7) * 0.5; pts.push(abw(f, a + Math.cos(w) * ra * k, u + Math.sin(w) * ru * k)); }
  return pts;
}

// Alle Zustandsformen einer Fahrbahnlinie (gemerkt an l._zust)
export function zustandBerechnen(l, d, fb, kerb) {
  if (l._zust) return l._zust;
  const z = l._zust = { flick: [], loch: [], staub: [], fleck: [], spur: [] };
  const S = d.s[d.n - 1], hw = fb / 2, rand = kerb ? 1.2 : 3.2, id = l.id * 977 + 13;
  const pF = FLICK_P[l.t] ?? 0.4, pL = LOCH_P[l.t] ?? 0.3;
  const frei0 = Math.max(24, fb * 0.9), maxS = S - frei0;
  for (let k = 0; k * FACH < S; k++) {
    for (let t = 0; t < 2; t++) {
      const sd = id * 101 + k * 17 + t * 5;
      if (hash(sd) >= pF * (t ? 0.4 : 1)) continue;
      const art = hash(sd + 1), alt = hash(sd + 2) < 0.4, len0 = FACH * (0.1 + 0.8 * hash(sd + 3));
      let a0, a1, u0, u1;
      if (art < 0.4) {          // Streifen am Rand, 3-6 m lang, 1-1,75 m breit
        const lg = (3 + 3 * hash(sd + 4)) * PX, br = (1 + 0.75 * hash(sd + 5)) * PX, sg = hash(sd + 6) < 0.5 ? 1 : -1;
        a0 = 0; a1 = lg; u1 = sg * (hw - rand); u0 = u1 - sg * br;
      } else if (art < 0.75) {  // Querflicken, 1-2,5 m lang, über eine Spur oder die ganze Breite
        const lg = (1 + 1.5 * hash(sd + 4)) * PX, ganz = hash(sd + 7) < 0.4, sg = hash(sd + 6) < 0.5 ? 1 : -1;
        a0 = 0; a1 = lg;
        if (ganz) { u0 = -(hw - rand); u1 = hw - rand; } else { const br = hw * (0.7 + 0.5 * hash(sd + 5)); u1 = sg * (hw - rand); u0 = u1 - sg * Math.min(br, 2 * hw - 2 * rand); }
      } else {                  // kleiner Flicken, 1-2,5 m
        const lg = (1 + 1.5 * hash(sd + 4)) * PX, br = (1 + 1.5 * hash(sd + 5)) * PX, c = (hash(sd + 6) * 2 - 1) * Math.max(0, hw - rand - br / 2);
        a0 = 0; a1 = lg; u0 = c - br / 2; u1 = c + br / 2;
      }
      const s = k * FACH + len0; if (s > maxS || s < frei0) continue;
      const f = rahmen(d, suche(d, s));
      const lo = Math.min(u0, u1), hi = Math.max(u0, u1);
      const poly = flickPoly(f, a0, a1, lo, hi, sd);
      z.flick.push({ poly, box: kasten(poly), alt });
    }
    for (let t = 0; t < 3; t++) {
      const sd = id * 211 + k * 19 + t * 7;
      if (hash(sd) >= pL) continue;
      const s = k * FACH + FACH * hash(sd + 1); if (s > maxS || s < frei0) continue;
      const f = rahmen(d, suche(d, s)), n = hash(sd + 2) < 0.3 ? 2 + Math.floor(hash(sd + 3) * 2) : 1;
      const rand0 = hash(sd + 4) < 0.55, sg = hash(sd + 5) < 0.5 ? 1 : -1;
      for (let i = 0; i < n; i++) {
        const sdi = sd * 7 + i, dm = (2.4 + 5.6 * hash(sdi + 6) * hash(sdi + 7) ) , r = dm / 2;
        const u = rand0 ? sg * (hw - rand - r - hash(sdi + 8) * 9) : (hash(sdi + 8) * 2 - 1) * (hw - rand - r), a = (hash(sdi + 9) - 0.5) * 14 * (n > 1 ? 1 : 0);
        const rim = blob(f, a, u, r * 1.9, r * 1.6, sdi + 10), loch = blob(f, a, u, r * 1.15, r * 0.9, sdi + 11);
        z.loch.push({ rim, loch, box: kasten(rim) });
      }
    }
  }
  // Staub/Dreck an den Rändern, Blätter- und Sandflecken (dezent), Reifenspuren-Schmutz auf schlechteren Straßen
  const schlecht = l.t === 'unclassified' || l.t === 'service' || l.t === 'living_street' || l.t === 'residential';
  for (let j = 1; j < d.n - 1; j++) {
    const sd = id * 313 + j * 3;
    for (const sg of [1, -1]) {
      const h = hash(sd + (sg > 0 ? 0 : 1));
      if (h < (schlecht ? 0.1 : 0.06) && d.s[j] > 8 && d.s[j] < S - 8) {
        const f = rahmen(d, j), br = 1.6 + 3.2 * hash(sd + 5), la = 5 + 14 * hash(sd + 6);
        const p = blob(f, 0, sg * (hw - 1.2 - br * 0.5), la, br, sd + 7); z.staub.push({ poly: p, box: kasten(p) });
      }
      const h2 = hash(sd + (sg > 0 ? 40 : 41));
      if (h2 < 0.05) {
        const f = rahmen(d, j), u = sg * (hw - 1 - hash(sd + 8) * 9), p = abw(f, hash(sd + 9) * 5, u);
        z.fleck.push({ x: p[0], y: p[1], art: h2 < 0.02 ? 0 : 1, w: 1.6 + hash(sd + 10) * 2.4, box: { x0: p[0] - 4, y0: p[1] - 4, x1: p[0] + 4, y1: p[1] + 4 } });
      }
    }
  }
  if (schlecht) {
    for (let k = 0; k * FACH < S; k++) {
      const sd = id * 421 + k * 23;
      if (hash(sd) > 0.5) continue;
      const s0 = k * FACH + hash(sd + 1) * FACH * 0.5, len = 40 + hash(sd + 2) * 90, j0 = suche(d, s0), j1 = suche(d, Math.min(S, s0 + len));
      for (const sg of [-1, 1]) {
        const pts = [];
        for (let j = j0; j <= j1; j += 2) { const f = rahmen(d, j), u = sg * fb * 0.22 + (gn(d.s[j], 40, sd + (sg > 0 ? 3 : 4)) - 0.5) * 3; pts.push(abw(f, 0, u)); }
        if (pts.length > 2) z.spur.push({ pts, box: kasten(pts) });
      }
    }
  }
  return z;
}

const bahnPoly = (p2, ps) => { p2.moveTo(ps[0][0], ps[0][1]); for (let i = 1; i < ps.length; i++) p2.lineTo(ps[i][0], ps[i][1]); p2.closePath(); };

export function zeichneZustand(ctx, z, r) {
  const sicht = a => a.filter(q => treffer(q.box, r));
  const fl = sicht(z.flick);
  if (fl.length) {
    const neu = new Path2D(), alt = new Path2D();
    for (const q of fl) bahnPoly(q.alt ? alt : neu, q.poly);
    ctx.fillStyle = 'rgba(14,14,16,.32)'; ctx.fill(neu); ctx.fillStyle = 'rgba(180,176,168,.22)'; ctx.fill(alt);
    ctx.lineWidth = 0.9; ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(6,6,6,.4)'; ctx.stroke(neu); ctx.strokeStyle = 'rgba(30,30,30,.3)'; ctx.stroke(alt);
  }
  const lo = sicht(z.loch);
  if (lo.length) {
    const rim = new Path2D(), kern = new Path2D();
    for (const q of lo) { bahnPoly(rim, q.rim); bahnPoly(kern, q.loch); }
    ctx.fillStyle = 'rgba(160,156,146,.42)'; ctx.fill(rim);
    ctx.fillStyle = 'rgba(12,12,13,.82)'; ctx.fill(kern);
    ctx.lineWidth = 0.7; ctx.strokeStyle = 'rgba(190,186,176,.3)'; ctx.stroke(kern);
  }
  const sp = sicht(z.spur);
  if (sp.length) {
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = 2.6; ctx.strokeStyle = 'rgba(96,78,52,.085)';
    const p2 = new Path2D(); for (const q of sp) { p2.moveTo(q.pts[0][0], q.pts[0][1]); for (let i = 1; i < q.pts.length; i++) p2.lineTo(q.pts[i][0], q.pts[i][1]); }
    ctx.stroke(p2);
  }
  const st = sicht(z.staub);
  if (st.length) { const p2 = new Path2D(); for (const q of st) bahnPoly(p2, q.poly); ctx.fillStyle = 'rgba(152,130,96,.11)'; ctx.fill(p2); }
  const fk = sicht(z.fleck);
  if (fk.length) {
    const laub = new Path2D(), sand = new Path2D();
    for (const q of fk) { if (q.art === 0) laub.rect(q.x, q.y, q.w * 0.8, q.w * 0.5); else sand.rect(q.x, q.y, q.w * 1.6, q.w); }
    ctx.fillStyle = 'rgba(112,88,48,.45)'; ctx.fill(laub); ctx.fillStyle = 'rgba(200,182,142,.22)'; ctx.fill(sand);
  }
}

// Staub in Kreuzungsecken (Bogenstück der Ecke e: Mittelpunkt C, Radius r, Winkel aT → aB)
export function zeichneEckenstaub(ctx, e, seed) {
  const TP = Math.PI * 2;
  const da = e.acw ? -((((e.aT - e.aB) % TP) + TP) % TP) : (((e.aB - e.aT) % TP) + TP) % TP;
  ctx.save(); ctx.lineCap = 'butt';
  ctx.beginPath(); ctx.arc(e.Cx, e.Cy, e.r + 2.4, e.aT, e.aT + da, e.acw); ctx.strokeStyle = 'rgba(138,116,82,.10)'; ctx.lineWidth = 4; ctx.stroke();
  const sand = new Path2D(), laub = new Path2D();
  for (let i = 0; i < 9; i++) {
    const w = e.aT + da * hash(seed * 7 + i * 3), rr = e.r + 1.5 + hash(seed * 11 + i * 5) * 7, x = e.Cx + Math.cos(w) * rr, y = e.Cy + Math.sin(w) * rr;
    (i % 3 ? sand : laub).rect(x, y, 2 + hash(seed + i) * 3, 1.3 + hash(seed * 3 + i) * 1.3);
  }
  ctx.fillStyle = 'rgba(196,178,138,.2)'; ctx.fill(sand); ctx.fillStyle = 'rgba(110,86,46,.4)'; ctx.fill(laub);
  ctx.restore();
}

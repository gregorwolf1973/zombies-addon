// Lage einer Haustür auf der echten Hauswand (Weltcode: läuft auf Server und Client gleich, nur + − × ÷ Math.sqrt, keine Zufallswerte).
// Ergebnis (Pixel, 8 px = 1 m): { x, y } = Türmitte exakt auf der Polygonwand, { nx, ny } = Einheitsnormale nach draußen, nische = Tür liegt in
// einer Nische (Rück-/Vorsprung des Umrisses, typischer Eingang bzw. Vordach).
// Reihenfolge: 1. kleine Nische (0,8–4 m tief, 1,5–6 m breit) nahe der Rastertür, mittig auf deren Rückwand;
//              2. sonst die Wand, die zur Rastertür zeigt, mittig am nächsten Punkt, mindestens 1 m von den Ecken.
// Die Rastertür (Kachel + Austrittsrichtung) bleibt unverändert; die Pose liegt höchstens 1,6 Kacheln von ihrer Außenkante entfernt.

const M = 8;                       // Pixel je Meter
const ECKE = 1 * M;                // Mindestabstand zur Hausecke
const NAH = 1.6;                   // Kacheln

const rund = v => Math.round(v * 100) / 100;
const laenge = (x, y) => Math.sqrt(x * x + y * y);

// Nachbargebäude: polys = [{ p: Umriss in Pixel (flach), x0, y0, x1, y1, bx, by, bb, bh }] (bx/by/bb/bh = Kachel-Rahmen des Gebäudes, erkennt das eigene Haus).
export function nachbarPolys(gebaeude, kachel) {
  const out = [];
  for (const g of gebaeude) {
    if (!g.umriss || g.umriss.length < 6) continue;
    const p = g.umriss.map(v => v * kachel);
    let x0 = p[0], x1 = p[0], y0 = p[1], y1 = p[1];
    for (let i = 2; i + 1 < p.length; i += 2) { if (p[i] < x0) x0 = p[i]; if (p[i] > x1) x1 = p[i]; if (p[i + 1] < y0) y0 = p[i + 1]; if (p[i + 1] > y1) y1 = p[i + 1]; }
    out.push({ p, x0, y0, x1, y1, bx: g.x, by: g.y, bb: g.b, bh: g.h });
  }
  return out;
}
const imPoly = (px, py, p) => {
  let d = false;
  for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) if ((p[i + 1] > py) !== (p[j + 1] > py) && px < (p[j] - p[i]) * (py - p[i + 1]) / (p[j + 1] - p[i + 1]) + p[i]) d = !d;
  return d;
};
const abstandKante = (px, py, ax, ay, bx, by) => {
  const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy || 1e-9;
  let t = ((px - ax) * dx + (py - ay) * dy) / L; t = t < 0 ? 0 : t > 1 ? 1 : t;
  const ex = ax + t * dx - px, ey = ay + t * dy - py;
  return Math.sqrt(ex * ex + ey * ey);
};
// Freier Abstand (Meter, 0 … FREI_M) vor einem Wandpunkt (Pixel) in Richtung (nx, ny): 0, wenn der Punkt auf/an (< 0,5 m) einer Nachbarwand liegt (angebaute
// Wand), sonst der Weg bis zum ersten Nachbargebäude (Schritte 0,25 m); FREI_M = frei bis 2,5 m.
export const FREI_M = 2.5;
export function aussenFrei(x, y, nx, ny, polys, selbst) {
  if (!polys) return FREI_M;
  for (const o of polys) {
    if (selbst && o.bx === selbst.x && o.by === selbst.y && o.bb === selbst.b && o.bh === selbst.h) continue;
    const ex = x + nx * FREI_M * M;
    if (Math.max(x, ex) < o.x0 - 0.5 * M || Math.min(x, ex) > o.x1 + 0.5 * M || Math.max(y, y + ny * FREI_M * M) < o.y0 - 0.5 * M || Math.min(y, y + ny * FREI_M * M) > o.y1 + 0.5 * M) continue;
    for (let i = 0, j = o.p.length - 2; i < o.p.length; j = i, i += 2) if (abstandKante(x, y, o.p[j], o.p[j + 1], o.p[i], o.p[i + 1]) < 0.5 * M) return 0;
  }
  let frei = FREI_M;
  for (const o of polys) {
    if (selbst && o.bx === selbst.x && o.by === selbst.y && o.bb === selbst.b && o.bh === selbst.h) continue;
    for (let s = 0.25; s <= FREI_M + 1e-9 && s < frei; s += 0.25) {
      const qx = x + nx * s * M, qy = y + ny * s * M;
      if (qx < o.x0 || qx > o.x1 || qy < o.y0 || qy > o.y1) continue;
      if (imPoly(qx, qy, o.p)) { frei = s - 0.25; break; }
    }
  }
  return frei;
}

export function berechneTuerPose(h, kachel, polys = null) {
  const K = kachel;
  const px = (h.tuer.x + 0.5 + h.raus.dx * 0.5) * K, py = (h.tuer.y + 0.5 + h.raus.dy * 0.5) * K;
  const vorgabe = { x: px, y: py, nx: h.raus.dx, ny: h.raus.dy, nische: false };
  const u = h.umriss;
  if (!u || u.length < 6) return vorgabe;
  const pts = [];
  for (let i = 0; i + 1 < u.length; i += 2) {
    const x = u[i] * K, y = u[i + 1] * K, l = pts[pts.length - 1];
    if (l && Math.abs(l[0] - x) < 0.25 && Math.abs(l[1] - y) < 0.25) continue;   // doppelte Punkte
    pts.push([x, y]);
  }
  while (pts.length > 1 && Math.abs(pts[0][0] - pts[pts.length - 1][0]) < 0.25 && Math.abs(pts[0][1] - pts[pts.length - 1][1]) < 0.25) pts.pop();
  const n = pts.length;
  if (n < 3) return vorgabe;
  let flaeche = 0;
  for (let i = 0; i < n; i++) { const a = pts[i], b = pts[(i + 1) % n]; flaeche += a[0] * b[1] - b[0] * a[1]; }
  if (Math.abs(flaeche) < 1) return vorgabe;
  const vz = flaeche > 0 ? 1 : -1;   // Umlaufsinn: Außennormale einer Kante (dx, dy) ist vz·(dy, −dx)
  const kante = i => {
    const a = pts[i], b = pts[(i + 1) % n], dx = b[0] - a[0], dy = b[1] - a[1], l = laenge(dx, dy);
    return { a, b, dx, dy, l, ex: dx / (l || 1), ey: dy / (l || 1), nx: vz * dy / (l || 1), ny: -vz * dx / (l || 1) };
  };
  const kanten = []; for (let i = 0; i < n; i++) kanten.push(kante(i));
  // Erreichbarkeit: die Pose muss seitlich im Durchgang der Rasterkachel liegen (Kachel ± halbe Kachel − Spielerradius − halbe Türbreite),
  // sonst stünden Wandkacheln davor und niemand käme an die Tür
  const cx = (h.tuer.x + 0.5) * K, cy = (h.tuer.y + 0.5) * K, seitMax = 0.5 * K - 7 + 6 - 1;
  const seitlich = (x, y) => { const l = (x - cx) * -h.raus.dy + (y - cy) * h.raus.dx; return l < 0 ? -l : l; };
  const zeigt = k => k.nx * h.raus.dx + k.ny * h.raus.dy;

  // 1. Nische: drei aufeinanderfolgende Kanten in U-Form (Seitenwand, Rückwand, Seitenwand)
  let best = null;
  for (let i = 0; i < n; i++) {
    const s1 = kanten[i], r = kanten[(i + 1) % n], s2 = kanten[(i + 2) % n];
    if (r.l < 1.5 * M - 0.01 || r.l > 6 * M + 0.01) continue;
    if (s1.l < 0.8 * M - 0.01 || s1.l > 4 * M + 0.01 || s2.l < 0.8 * M - 0.01 || s2.l > 4 * M + 0.01) continue;
    const k1 = s1.ex * r.ey - s1.ey * r.ex, k2 = r.ex * s2.ey - r.ey * s2.ex;
    if (k1 * k2 <= 0 || Math.abs(k1) < 0.8 || Math.abs(k2) < 0.8) continue;    // gleicher Drehsinn, annähernd rechte Winkel
    if (s1.ex * s2.ex + s1.ey * s2.ey > -0.7) continue;                         // Seitenwände laufen gegeneinander
    if (zeigt(r) < 0.5) continue;
    const mx = (r.a[0] + r.b[0]) / 2, my = (r.a[1] + r.b[1]) / 2, d = laenge(mx - px, my - py);
    if (d > NAH * K || seitlich(mx, my) > seitMax) continue;
    if (aussenFrei(mx, my, r.nx, r.ny, polys, h) < FREI_M) continue;
    if (!best || d < best.d - 1e-9) best = { d, x: mx, y: my, nx: r.nx, ny: r.ny };
  }
  if (best) return { x: rund(best.x), y: rund(best.y), nx: rund(best.nx), ny: rund(best.ny), nische: true };

  // 2. nächste passende Wand, mittig genug (mindestens 1 m von den Ecken; zu kurze Wände nur zur Not); nur Wandpunkte mit freier Außenseite
  //    (kein Nachbargebäude < 2,5 m davor, nicht auf einer angebauten Wand); notfalls der Punkt mit dem größten freien Abstand
  let wahl = null, notfall = null;
  for (const lang of [true, false]) {
    for (const k of kanten) {
      if (zeigt(k) < 0.3 || k.l < 1) continue;
      if (lang && k.l < 2 * ECKE + 2) continue;
      const lo = lang ? ECKE : k.l / 2, hi = lang ? k.l - ECKE : k.l / 2;
      let t0 = (px - k.a[0]) * k.ex + (py - k.a[1]) * k.ey;
      t0 = Math.max(lo, Math.min(hi, t0));
      const ts = [t0];
      if (hi > lo) for (let t = lo; t <= hi + 1e-9; t += 4) ts.push(t);
      for (const t of ts) {
        const x = k.a[0] + k.ex * t, y = k.a[1] + k.ey * t, d = laenge(x - px, y - py) + (1 - zeigt(k)) * 4;
        if (!(d < NAH * K && seitlich(x, y) <= seitMax)) continue;
        const fm = aussenFrei(x, y, k.nx, k.ny, polys, h);
        if (fm >= FREI_M) { if (!wahl || d < wahl.d - 1e-9) wahl = { d, x, y, nx: k.nx, ny: k.ny }; }
        else if (!notfall || fm > notfall.fm + 1e-9 || (fm === notfall.fm && d < notfall.d - 1e-9)) notfall = { fm, d, x, y, nx: k.nx, ny: k.ny };
      }
    }
    if (wahl) break;
  }
  if (!wahl && notfall && notfall.fm > 0) wahl = notfall;
  if (wahl) return { x: rund(wahl.x), y: rund(wahl.y), nx: rund(wahl.nx), ny: rund(wahl.ny), nische: false };
  return vorgabe;
}

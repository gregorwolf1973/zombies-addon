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

export function berechneTuerPose(h, kachel) {
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
    if (!best || d < best.d - 1e-9) best = { d, x: mx, y: my, nx: r.nx, ny: r.ny };
  }
  if (best) return { x: rund(best.x), y: rund(best.y), nx: rund(best.nx), ny: rund(best.ny), nische: true };

  // 2. nächste passende Wand, mittig genug (mindestens 1 m von den Ecken; zu kurze Wände nur zur Not)
  let wahl = null;
  for (const lang of [true, false]) {
    for (const k of kanten) {
      if (zeigt(k) < 0.3 || k.l < 1) continue;
      if (lang && k.l < 2 * ECKE + 2) continue;
      const lo = lang ? ECKE : k.l / 2, hi = lang ? k.l - ECKE : k.l / 2;
      let t = (px - k.a[0]) * k.ex + (py - k.a[1]) * k.ey;
      t = Math.max(lo, Math.min(hi, t));
      const x = k.a[0] + k.ex * t, y = k.a[1] + k.ey * t, d = laenge(x - px, y - py) + (1 - zeigt(k)) * 4;
      if (d < NAH * K && seitlich(x, y) <= seitMax && (!wahl || d < wahl.d - 1e-9)) wahl = { d, x, y, nx: k.nx, ny: k.ny };
    }
    if (wahl) break;
  }
  if (wahl) return { x: rund(wahl.x), y: rund(wahl.y), nx: rund(wahl.nx), ny: rund(wahl.ny), nische: false };
  return vorgabe;
}

// Zäune glätten: die Zaunlinien der Karte (karte.zaeune) stammen aus Kachelketten und laufen deshalb als Treppe im 4-m-Raster.
// zaeuneGlaetten() fasst jede Linie mit Douglas-Peucker zu wenigen Geraden zusammen und richtet jede lange Gerade parallel zur
// nächsten Straßenkante bzw. Hauswand aus (wenn die Abweichung klein ist). Rein deterministisch, ohne Zufall; läuft auf Client
// und Server gleich (Weltcode). Zeichnung UND Kollision (feines Raster, osmwelt baueFein) lesen danach dieselben Linien.
const DP_EPS = 0.85;         // Kacheln: Treppenstufen und Zickzack von 1–2 Kacheln verschwinden
const SNAP_GRAD = 18;        // so weit darf eine Gerade zur Straße/Wand gedreht werden
const SNAP_MIN_LAENGE = 1.6; // nur Geraden ab dieser Länge (Kacheln) werden gedreht
const SUCH_STRASSE = 7, SUCH_WAND = 4;   // Suchradius (Kacheln) um die Streckenmitte
const MAX_VERSATZ = 1.1;     // Eckpunkte wandern höchstens so weit (Kacheln)

function dougPeuck(p, eps) {   // p: [[x, y], …]
  const n = p.length;
  if (n <= 2) return p.slice();
  const behalten = new Uint8Array(n); behalten[0] = behalten[n - 1] = 1;
  const stapel = [[0, n - 1]];
  while (stapel.length) {
    const [a, b] = stapel.pop();
    const [ax, ay] = p[a], dx = p[b][0] - ax, dy = p[b][1] - ay, L = Math.hypot(dx, dy) || 1e-9;
    let best = -1, bi = -1;
    for (let i = a + 1; i < b; i++) {
      // bei geschlossenen Linien (a und b gleich) Abstand zum Punkt, sonst zur Geraden
      const d = L < 1e-6 ? Math.hypot(p[i][0] - ax, p[i][1] - ay) : Math.abs((p[i][0] - ax) * dy - (p[i][1] - ay) * dx) / L;
      if (d > best) { best = d; bi = i; }
    }
    if (best > eps) { behalten[bi] = 1; stapel.push([a, bi], [bi, b]); }
  }
  return p.filter((_, i) => behalten[i]);
}

// Richtungswinkel (0..π) aller Straßen- und Wandstücke, grob nach 8-Kacheln-Zellen sortiert
function kantenIndex(karte) {
  const S = 8, zellen = new Map();
  const ein = (x0, y0, x1, y1, art) => {
    const len = Math.hypot(x1 - x0, y1 - y0);
    if (len < 0.8) return;
    const e = { x0, y0, x1, y1, w: ((Math.atan2(y1 - y0, x1 - x0) % Math.PI) + Math.PI) % Math.PI, art };
    const cx0 = Math.floor((Math.min(x0, x1) - SUCH_STRASSE) / S), cx1 = Math.floor((Math.max(x0, x1) + SUCH_STRASSE) / S);
    const cy0 = Math.floor((Math.min(y0, y1) - SUCH_STRASSE) / S), cy1 = Math.floor((Math.max(y0, y1) + SUCH_STRASSE) / S);
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) { const k = cy * 4096 + cx; (zellen.get(k) ?? zellen.set(k, []).get(k)).push(e); }
  };
  for (const s of karte.strassen ?? []) for (let i = 0; i + 3 < s.p.length; i += 2) ein(s.p[i], s.p[i + 1], s.p[i + 2], s.p[i + 3], 'strasse');
  for (const g of karte.gebaeude ?? []) {
    const u = g.umriss;
    if (!u || u.length < 6) continue;
    for (let i = 0; i < u.length; i += 2) { const j = (i + 2) % u.length; ein(u[i], u[i + 1], u[j], u[j + 1], 'wand'); }
  }
  return { S, zellen };
}
function distPunktStrecke(px, py, e) {
  const dx = e.x1 - e.x0, dy = e.y1 - e.y0, t = Math.max(0, Math.min(1, ((px - e.x0) * dx + (py - e.y0) * dy) / (dx * dx + dy * dy || 1e-9)));
  return Math.hypot(e.x0 + t * dx - px, e.y0 + t * dy - py);
}
function winkelDiff(a, b) { const d = Math.abs(a - b) % Math.PI; return Math.min(d, Math.PI - d); }

function naechsteRichtung(idx, mx, my, w) {
  const cx = Math.floor(mx / idx.S), cy = Math.floor(my / idx.S), liste = idx.zellen.get(cy * 4096 + cx);
  if (!liste) return null;
  const max = SNAP_GRAD * Math.PI / 180;
  let best = null, bd = Infinity;
  for (const e of liste) {
    const lim = e.art === 'wand' ? SUCH_WAND : SUCH_STRASSE;
    const d = distPunktStrecke(mx, my, e);
    if (d > lim || winkelDiff(e.w, w) > max) continue;
    if (d < bd - 1e-9 || (Math.abs(d - bd) <= 1e-9 && e.w < best)) { bd = d; best = e.w; }
  }
  return best;
}

export function glaetteLinie(p, idx) {   // p: flache Liste [x, y, x, y, …] → neue flache Liste
  const pts = [];
  for (let i = 0; i + 1 < p.length; i += 2) pts.push([p[i], p[i + 1]]);
  if (pts.length < 3) return p;
  const geschlossen = pts.length > 3 && Math.hypot(pts[0][0] - pts.at(-1)[0], pts[0][1] - pts.at(-1)[1]) < 1e-6;
  const q = dougPeuck(pts, DP_EPS);
  if (q.length < 2) return p;
  // Geraden: Punkt + Richtung
  const m = q.length - 1, ger = [];
  for (let i = 0; i < m; i++) {
    const [ax, ay] = q[i], [bx, by] = q[i + 1], L = Math.hypot(bx - ax, by - ay);
    if (L < 1e-6) { ger.push(null); continue; }
    let w = ((Math.atan2(by - ay, bx - ax) % Math.PI) + Math.PI) % Math.PI;
    const mx = (ax + bx) / 2, my = (ay + by) / 2;
    if (L >= SNAP_MIN_LAENGE && idx) { const r = naechsteRichtung(idx, mx, my, w); if (r !== null) w = r; }
    ger.push({ mx, my, dx: Math.cos(w), dy: Math.sin(w) });
  }
  if (ger.some(g => !g)) return p;
  const proj = (g, x, y) => { const t = (x - g.mx) * g.dx + (y - g.my) * g.dy; return [g.mx + t * g.dx, g.my + t * g.dy]; };
  const aus = [];
  for (let j = 0; j <= m; j++) {
    const [x, y] = q[j];
    const g0 = j > 0 ? ger[j - 1] : (geschlossen ? ger[m - 1] : null), g1 = j < m ? ger[j] : (geschlossen ? ger[0] : null);
    let pt;
    if (g0 && g1) {
      const kreuz = g0.dx * g1.dy - g0.dy * g1.dx;
      const a = proj(g0, x, y), b = proj(g1, x, y);
      if (Math.abs(kreuz) > 0.17) {
        const t = ((g1.mx - g0.mx) * g1.dy - (g1.my - g0.my) * g1.dx) / kreuz;
        const sx = g0.mx + t * g0.dx, sy = g0.my + t * g0.dy;
        pt = Math.hypot(sx - x, sy - y) <= MAX_VERSATZ ? [sx, sy] : [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      } else pt = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    } else if (g1 || g0) pt = proj(g1 ?? g0, x, y);
    else pt = [x, y];
    aus.push(pt);
  }
  if (geschlossen) aus[m] = aus[0].slice();
  const flach = [];
  for (const [x, y] of aus) flach.push(Math.round(x * 100) / 100, Math.round(y * 100) / 100);
  return flach;
}

export function zaeuneGlaetten(karte) {
  if (!karte.zaeune?.length) return karte;
  const idx = kantenIndex(karte);
  return { ...karte, zaeune: karte.zaeune.map(z => ({ ...z, p: glaetteLinie(z.p, idx) })) };
}

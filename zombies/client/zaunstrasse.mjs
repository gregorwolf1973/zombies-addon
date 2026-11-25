// Zäune/Hecken von der gezeichneten Straße (Fahrbahn + Gehweg) fernhalten (amtliche Karten: Zaunvorschläge an Flurstücksgrenzen reichen sonst auf Gehweg/Fahrbahn).
// Weltcode: läuft auf Server und Client gleich, nur + − × ÷ Math.sqrt, kein Zufall.
// strassen: [{ t, p, gl, gr, ref, spuren, breite }] in Kacheln; fahrbahnPx(linie) = gezeichnete Fahrbahnbreite in Pixeln (vektor.mjs, dieselbe Funktion wie die Zeichnung).
// Je Stück (Auflösung ≤ 0,5 m): liegt es innerhalb Fahrbahn + Gehweg (je Seite gl/gr) + 0,3 m + halbe Zaundicke, dann
//   parallel zur Straße (Winkel < 30°) und weniger als 1,5 m tief drin → an die Außenkante verschoben, sonst abgeschnitten.
// Rückgabe { zaeune, verschoben, abgeschnitten } (Anzahl Stücke).

const M = 8;   // Pixel je Meter
const AUTO = new Set(['primary', 'secondary', 'tertiary', 'residential', 'unclassified', 'living_street']);
export const STRASSE_RAND = 0.3 * M;   // Sicherheitsabstand hinter dem Gehweg

// Straßenflächen vorbereiten (Pixel); gleiche Breitenrechnung wie vektor.mjs
export const MIT_ZUFAHRT = new Set([...AUTO, 'service']);   // auch Zufahrten (osmwelt baueFein: Zaunfelder auf der gezeichneten Fläche)
export function strassenFlaechen(strassen, kachel, fahrbahnPx, arten = AUTO) {
  const K = kachel, sl = [];
  for (const s of strassen ?? []) {
    if (!arten.has(s.t) || !s.p || s.p.length < 4) continue;
    const p = []; let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i + 1 < s.p.length; i += 2) { const x = s.p[i] * K, y = s.p[i + 1] * K; p.push(x, y); if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    const fb = fahrbahnPx({ t: s.t, ref: s.ref, spuren: Number(s.spuren) || 0, breite: parseFloat(s.breite) || 0 });
    const gl = (s.gl > 0 ? s.gl : 0) * M, gr = (s.gr > 0 ? s.gr : 0) * M;
    const rmax = fb / 2 + Math.max(gl, gr) + STRASSE_RAND + 6;
    sl.push({ p, fb, gl, gr, x0: x0 - rmax, y0: y0 - rmax, x1: x1 + rmax, y1: y1 + rmax });
  }
  return sl;
}

// Tiefe eines Punktes in der Straßenfläche: null (außerhalb) oder { t (Pixel), nx, ny (weg von der Straße), tx, ty (Straßenrichtung) }
export function strassenTiefe(sl, px, py, dicke = 0) {
  let best = null;
  for (const l of sl) {
    if (px < l.x0 || px > l.x1 || py < l.y0 || py > l.y1) continue;
    for (let i = 0; i + 3 < l.p.length; i += 2) {
      const ax = l.p[i], ay = l.p[i + 1], dx = l.p[i + 2] - ax, dy = l.p[i + 3] - ay, l2 = dx * dx + dy * dy || 1;
      let t = ((px - ax) * dx + (py - ay) * dy) / l2; t = t < 0 ? 0 : t > 1 ? 1 : t;
      const qx = ax + dx * t, qy = ay + dy * t, vx = px - qx, vy = py - qy, d = Math.sqrt(vx * vx + vy * vy);
      const links = vx * -dy + vy * dx >= 0;   // Seite 1 (gl) = linke Normale (−dy, dx), wie versetzt() in vektor.mjs
      const rand = l.fb / 2 + (links ? l.gl : l.gr) + STRASSE_RAND + dicke;
      if (d < rand && (!best || rand - d > best.t)) {
        const ln = Math.sqrt(l2), nx = d > 1e-6 ? vx / d : (links ? -dy : dy) / ln, ny = d > 1e-6 ? vy / d : (links ? dx : -dx) / ln;
        best = { t: rand - d, nx, ny, tx: dx / ln, ty: dy / ln };
      }
    }
  }
  return best;
}

export function zaeuneVonStrassen(zaeune, strassen, kachel, fahrbahnPx) {
  const K = kachel, zaehl = { verschoben: 0, abgeschnitten: 0 };
  const sl = strassenFlaechen(strassen, K, fahrbahnPx);
  if (!sl.length) return { zaeune, ...zaehl };
  const NAH = 1.5 * M;
  const ergebnis = [];
  for (const z of zaeune) {
    const p = z.p, dicke = z.a === 'h' ? 4.5 : 3;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i + 1 < p.length; i += 2) { const x = p[i] * K, y = p[i + 1] * K; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    const such = sl.filter(l => l.x0 <= x1 && l.x1 >= x0 && l.y0 <= y1 && l.y1 >= y0);
    if (!such.length) { ergebnis.push(z); continue; }
    const pts = [[p[0] * K, p[1] * K]];
    for (let i = 0; i + 3 < p.length; i += 2) {
      const ax = p[i] * K, ay = p[i + 1] * K, bx = p[i + 2] * K, by = p[i + 3] * K, L = Math.sqrt((bx - ax) * (bx - ax) + (by - ay) * (by - ay)), n = Math.max(1, Math.ceil(L / (0.5 * M)));
      for (let k = 1; k <= n; k++) pts.push([ax + (bx - ax) * k / n, ay + (by - ay) * k / n]);
    }
    const info = pts.map(q => strassenTiefe(such, q[0], q[1], dicke));
    if (!info.some(Boolean)) { ergebnis.push(z); continue; }
    // verschieben; liegt der neue Punkt (Kreuzung/Ecke) in einer zweiten Straße, erneut herausschieben (höchstens 4 Runden, sonst Stück abschneiden)
    const rest = pts.map(() => false);
    const neu = pts.map((q, i) => {
      let f = info[i]; if (!f || f.t >= NAH) return q;
      let x = q[0], y = q[1];
      for (let r = 0; f && r < 4; r++) { x += f.nx * (f.t + 0.05); y += f.ny * (f.t + 0.05); f = strassenTiefe(such, x, y, dicke); }
      if (f) rest[i] = true;
      return [x, y];
    });
    for (let i = 0; i < pts.length; i++) if (rest[i]) info[i] = { ...info[i], t: NAH };
    let teil = null;
    for (let i = 0; i + 1 < pts.length; i++) {
      const fa = info[i], fb = info[i + 1];
      let behalten = true;
      if (fa || fb) {
        const mf = strassenTiefe(such, (pts[i][0] + pts[i + 1][0]) / 2, (pts[i][1] + pts[i + 1][1]) / 2, dicke);
        const f = mf ?? fa ?? fb;
        const dx = pts[i + 1][0] - pts[i][0], dy = pts[i + 1][1] - pts[i][1], l = Math.sqrt(dx * dx + dy * dy) || 1;
        const kreuz = (dx * f.ty - dy * f.tx) / l;   // Sinus des Winkels zur Straße
        const parallel = kreuz < 0.5 && kreuz > -0.5;
        if (!parallel || (fa && fa.t >= NAH) || (fb && fb.t >= NAH) || (mf && mf.t >= NAH)) { behalten = false; zaehl.abgeschnitten++; }
        else zaehl.verschoben++;
      }
      if (!behalten) { teil = null; continue; }
      const a = neu[i], b = neu[i + 1];
      if (teil) teil.push(b[0] / K, b[1] / K);
      else { teil = [a[0] / K, a[1] / K, b[0] / K, b[1] / K]; ergebnis.push({ ...z, p: teil }); }
    }
  }
  return { zaeune: ergebnis, ...zaehl };
}

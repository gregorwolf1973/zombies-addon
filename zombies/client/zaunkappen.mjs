// Zäune und Hecken vor Haustüren wegschneiden (Weltcode: läuft auf Server und Client gleich, nur + − × ÷ Math.sqrt, kein Zufall, feste Reihenfolge).
// Regeln, angewendet NACH der endgültigen Türplatzierung (osmwelt.mjs):
//   a) näher als 3 m an einer Haustür (Läden: 4 m)  → Stück weg,
//   b) im Korridor von der Tür zum nächsten Straßen-/Wegpunkt (2 m breit, Läden 3 m)  → Stück weg,
//   c) Segmente, die parallel und näher als 1,5 m an einer Hauswand entlanglaufen (meist Grundstücksgrenze direkt an der Wand)  → weg.
// Die Schnitte sind exakt (Schnittpunkte mit Kreis/Rechteck), die Enden bleiben glatt gerade. Unberührte Linien bleiben dasselbe Objekt.

const M = 8;   // Pixel je Meter

// Parameterintervall [t0, t1] (0..1), in dem A + t·(B−A) im Kapselkörper (Strecke S0–S1 mit Radius r) liegt; null = außerhalb
function kapselIntervall(ax, ay, bx, by, s0x, s0y, s1x, s1y, r) {
  const dx = bx - ax, dy = by - ay, a = dx * dx + dy * dy;
  if (a < 1e-12) return null;
  let t0 = Infinity, t1 = -Infinity;
  const scheibe = (cx, cy) => {
    const ex = ax - cx, ey = ay - cy, b = ex * dx + ey * dy, c = ex * ex + ey * ey - r * r, disc = b * b - a * c;
    if (disc < 0) return;
    const w = Math.sqrt(disc), u0 = (-b - w) / a, u1 = (-b + w) / a;
    if (u0 < t0) t0 = u0; if (u1 > t1) t1 = u1;
  };
  scheibe(s0x, s0y);
  if (s1x !== s0x || s1y !== s0y) {
    scheibe(s1x, s1y);
    const sx = s1x - s0x, sy = s1y - s0y, len = Math.sqrt(sx * sx + sy * sy), ux = sx / len, uy = sy / len;
    const u0 = (ax - s0x) * ux + (ay - s0y) * uy, du = dx * ux + dy * uy;
    const v0 = -(ax - s0x) * uy + (ay - s0y) * ux, dv = -dx * uy + dy * ux;
    let lo = -Infinity, hi = Infinity, leer = false;
    const grenze = (c0, c1, mn, mx) => {
      if (c1 < 1e-9 && c1 > -1e-9) { if (c0 < mn || c0 > mx) leer = true; return; }
      let p = (mn - c0) / c1, q = (mx - c0) / c1;
      if (p > q) { const h = p; p = q; q = h; }
      if (p > lo) lo = p; if (q < hi) hi = q;
    };
    grenze(u0, du, 0, len); grenze(v0, dv, -r, r);
    if (!leer && lo <= hi) { if (lo < t0) t0 = lo; if (hi > t1) t1 = hi; }
  }
  if (t0 > t1 || t1 <= 0 || t0 >= 1) return null;
  return [Math.max(0, t0), Math.min(1, t1)];
}

// Abstand eines Punktes zum Polygonrand; liefert auch Kantenrichtung (Einheitsvektor) der nächsten Kante
function randNah(poly, px, py) {
  let m = Infinity, ex = 1, ey = 0;
  for (let i = 0; i < poly.length; i++) {
    const [ax, ay] = poly[i], [bx, by] = poly[(i + 1) % poly.length], dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1;
    let t = ((px - ax) * dx + (py - ay) * dy) / l2; t = t < 0 ? 0 : t > 1 ? 1 : t;
    const qx = ax + dx * t - px, qy = ay + dy * t - py, d = Math.sqrt(qx * qx + qy * qy);
    if (d < m) { m = d; const l = Math.sqrt(l2); ex = dx / l; ey = dy / l; }
  }
  return { d: m, ex, ey };
}

// nächster Punkt auf den Straßen-/Wegelinien (Pixel) zu (px, py); null, wenn weiter als maxD
function naechsteStrasse(linien, px, py, maxD) {
  let best = null, bd = maxD * maxD;
  for (const l of linien) {
    if (l.x0 - maxD > px || l.x1 + maxD < px || l.y0 - maxD > py || l.y1 + maxD < py) continue;
    const p = l.p;
    for (let i = 0; i + 3 < p.length; i += 2) {
      const dx = p[i + 2] - p[i], dy = p[i + 3] - p[i + 1], l2 = dx * dx + dy * dy || 1;
      let t = ((px - p[i]) * dx + (py - p[i + 1]) * dy) / l2; t = t < 0 ? 0 : t > 1 ? 1 : t;
      const qx = p[i] + dx * t, qy = p[i + 1] + dy * t, d2 = (qx - px) * (qx - px) + (qy - py) * (qy - py);
      if (d2 < bd) { bd = d2; best = [qx, qy]; }
    }
  }
  return best;
}

// zaeune: [{ a, p: [x, y, …] }] in Kacheln; haeuser mit tuerPos (Pixel); gebaeude: Umrisse (Kacheln, flach); strassen: [{ p }] in Kacheln
// Rückgabe { zaeune, entfernt: { tuer, korridor, wand } } (Anzahl entfernter Segmentstücke je Regel)
export function zaeuneVorTuerenKappen(zaeune, haeuser, gebaeude, strassen, kachel) {
  const K = kachel;
  const zaehl = { tuer: 0, korridor: 0, wand: 0 };
  if (!zaeune?.length) return { zaeune, entfernt: zaehl };
  // Formen je Tür
  const formen = [];
  const sl = [];
  for (const s of strassen ?? []) {
    const p = []; let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i + 1 < s.p.length; i += 2) { const x = s.p[i] * K, y = s.p[i + 1] * K; p.push(x, y); if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (p.length >= 4) sl.push({ p, x0, y0, x1, y1 });
  }
  for (const h of haeuser) {
    const q = h.tuerPos; if (!q || !h.betretbar) continue;
    const laden = !!h.art;
    const rd = (laden ? 4 : 3) * M, rk = (laden ? 1.5 : 1) * M;
    const f = { tx: q.x, ty: q.y, rd, rk, sx: q.x, sy: q.y, ex: q.x, ey: q.y };
    const vx = q.x + q.nx * 2 * M, vy = q.y + q.ny * 2 * M;
    const s = naechsteStrasse(sl, vx, vy, 60 * M);
    if (s) { f.ex = s[0]; f.ey = s[1]; }
    f.x0 = Math.min(f.tx, f.ex) - rd; f.x1 = Math.max(f.tx, f.ex) + rd; f.y0 = Math.min(f.ty, f.ey) - rd; f.y1 = Math.max(f.ty, f.ey) + rd;
    formen.push(f);
  }
  // Hauswände
  const waende = [];
  for (const u of gebaeude ?? []) {
    if (!u || u.length < 6) continue;
    const poly = []; let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i + 1 < u.length; i += 2) { const x = u[i] * K, y = u[i + 1] * K; poly.push([x, y]); if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    waende.push({ poly, x0: x0 - 1.5 * M, y0: y0 - 1.5 * M, x1: x1 + 1.5 * M, y1: y1 + 1.5 * M });
  }

  const ergebnis = [];
  for (const z of zaeune) {
    const p = z.p;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i + 1 < p.length; i += 2) { const x = p[i] * K, y = p[i + 1] * K; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    const fs = formen.filter(f => f.x0 <= x1 && f.x1 >= x0 && f.y0 <= y1 && f.y1 >= y0);
    const ws = waende.filter(w => w.x0 <= x1 && w.x1 >= x0 && w.y0 <= y1 && w.y1 >= y0);
    if (!fs.length && !ws.length) { ergebnis.push(z); continue; }
    let veraendert = false;
    let segs = [];
    for (let i = 0; i + 3 < p.length; i += 2) segs.push([p[i] * K, p[i + 1] * K, p[i + 2] * K, p[i + 3] * K]);
    // Regel c) parallele Segmente dicht an der Wand
    if (ws.length) {
      segs = segs.filter(s => {
        const mx = (s[0] + s[2]) / 2, my = (s[1] + s[3]) / 2, dx = s[2] - s[0], dy = s[3] - s[1], l = Math.sqrt(dx * dx + dy * dy) || 1;
        for (const w of ws) {
          const m = randNah(w.poly, mx, my);
          if (m.d >= 1.5 * M) continue;
          if (randNah(w.poly, s[0], s[1]).d >= 1.5 * M || randNah(w.poly, s[2], s[3]).d >= 1.5 * M) continue;
          const kreuz = (dx * m.ey - dy * m.ex) / l;
          if (kreuz < 0.26 && kreuz > -0.26) { zaehl.wand++; veraendert = true; return false; }
        }
        return true;
      });
    }
    // Regeln a) und b): Tür-Scheiben und Korridore
    for (const f of fs) {
      const neu = [];
      for (const s of segs) {
        if (s[0] < f.x0 && s[2] < f.x0 || s[0] > f.x1 && s[2] > f.x1 || s[1] < f.y0 && s[3] < f.y0 || s[1] > f.y1 && s[3] > f.y1) { neu.push(s); continue; }
        // Scheibe um die Tür, dann Korridor (Kapsel Tür → Straße)
        let teile = [s];
        for (const [a0x, a0y, a1x, a1y, r, art] of [[f.tx, f.ty, f.tx, f.ty, f.rd, 'tuer'], [f.tx, f.ty, f.ex, f.ey, f.rk, 'korridor']]) {
          const naechste = [];
          for (const t of teile) {
            const iv = kapselIntervall(t[0], t[1], t[2], t[3], a0x, a0y, a1x, a1y, r);
            if (!iv) { naechste.push(t); continue; }
            veraendert = true; zaehl[art]++;
            const dx = t[2] - t[0], dy = t[3] - t[1];
            if (iv[0] > 0) naechste.push([t[0], t[1], t[0] + dx * iv[0], t[1] + dy * iv[0]]);
            if (iv[1] < 1) naechste.push([t[0] + dx * iv[1], t[1] + dy * iv[1], t[2], t[3]]);
          }
          teile = naechste;
        }
        for (const t of teile) neu.push(t);
      }
      segs = neu;
    }
    if (!veraendert) { ergebnis.push(z); continue; }
    // wieder zu Linienzügen verbinden (zusammenhängende Segmente = eine Linie), Reststücke unter 0,5 px verwerfen
    let teil = null;
    for (const s of segs) {
      const dx = s[2] - s[0], dy = s[3] - s[1];
      if (dx * dx + dy * dy < 0.25) continue;
      if (teil && Math.abs(teil[teil.length - 2] - s[0] * 1 / K) < 1e-9 && Math.abs(teil[teil.length - 1] - s[1] / K) < 1e-9) teil.push(s[2] / K, s[3] / K);
      else { teil = [s[0] / K, s[1] / K, s[2] / K, s[3] / K]; ergebnis.push({ ...z, p: teil }); }
    }
  }
  return { zaeune: ergebnis, entfernt: zaehl };
}

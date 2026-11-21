// PROTOTYP „Kulisse“ (nur mit ?kulisse=B1|B2|C1|C2 in der Adresse aktiv, sonst alles wie bisher):
//   B  echtes Orthofoto (Bayern DOP, CC BY 4.0) als Bodentextur, leicht entsättigt/abgedunkelt; Vektor-Straßen halbtransparent (B1) oder weg (B2)
//   C  = B + echte Dachflächen aus dem 3D-Gebäudemodell LoD2 Bayern (CC BY 4.0): je Dachteilfläche Helligkeit nach Sonnenrichtung, Firstlinien,
//      dazu weiche Schlagschatten von Häusern und Bäumen (Sonne Vormittag aus Südosten)
// Daten: karten/<karte>_ortho.webp + _ortho.json (Lage), karten/<karte>_lod2.json (tools/kulisse.py).
import { KACHEL as K } from './welt.mjs';

const MPK = 4;                       // Meter je Kachel
const PXM = K / MPK;                 // Pixel je Meter (8)
const SONNE_AZ = 135, SONNE_EL = 40; // Südost, Vormittag
const sRad = SONNE_AZ * Math.PI / 180, eRad = SONNE_EL * Math.PI / 180;
// Vektor zur Sonne in (Ost, Süd, oben); Schatten fällt in die Gegenrichtung (nach Nordwesten)
const SONNE = [Math.cos(eRad) * Math.sin(sRad), -Math.cos(eRad) * Math.cos(sRad), Math.sin(eRad)];
const SCHATTEN_DIR = [-SONNE[0], -SONNE[1]].map(v => v / Math.hypot(SONNE[0], SONNE[1]));
const SCHATTEN_PRO_M = PXM / Math.tan(eRad);   // Schattenlänge in Pixeln je Meter Höhe

let kul = null;

export function kulisse() { return kul; }

export async function ladeKulisse(karte) {
  const modus = new URLSearchParams(location.search).get('kulisse');
  if (!modus || !/^[BC][12]$/.test(modus)) return null;
  const meta = await (await fetch(`karten/${karte}_ortho.json`)).json();
  const bild = new Image(); bild.src = `karten/${karte}_ortho.webp`; await bild.decode();
  const C = modus[0] === 'C';
  const foto = fotoAufbereiten(bild, C);
  let lod2 = null;
  if (C) { try { lod2 = lod2Vorbereiten((await (await fetch(`karten/${karte}_lod2.json`)).json()).gebaeude); } catch (e) { console.error('LoD2', e); } }
  kul = { modus, meta, foto, lod2, strassenAlpha: modus[1] === '1' ? 0.42 : 0, schatten: C && !!lod2 && !new URLSearchParams(location.search).has('ohneschatten') };
  return kul;
}

// Foto an den Spielstil anpassen: entsättigen, abdunkeln; bei C zusätzlich Fotoschatten aufhellen (die Schatten kommen dort aus dem Modell)
function fotoAufbereiten(bild, schattenAufhellen) {
  const c = document.createElement('canvas'); c.width = bild.naturalWidth; c.height = bild.naturalHeight;
  const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(bild, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height), p = d.data;
  const SAT = 0.80, HELL = 0.90;
  for (let i = 0; i < p.length; i += 4) {
    let r = p[i], gg = p[i + 1], b = p[i + 2];
    const L = (0.299 * r + 0.587 * gg + 0.114 * b) / 255;
    let k = HELL;
    if (schattenAufhellen) { const t = Math.min(1, Math.max(0, (L - 0.08) / 0.34)); k *= 1 + 0.5 * (1 - t * t * (3 - 2 * t)); }
    const gr = L * 255;
    p[i] = Math.min(255, (gr + (r - gr) * SAT) * k); p[i + 1] = Math.min(255, (gr + (gg - gr) * SAT) * k); p[i + 2] = Math.min(255, (gr + (b - gr) * SAT) * k);
  }
  g.putImageData(d, 0, 0);
  return c;
}

// Foto in den Bodenstück-Canvas (ctx steht bereits im Weltraum; rect in Kacheln)
export function zeichneFoto(ctx, rect) {
  const m = kul.meta, s = m.ppt;
  const ax = Math.max(rect.x0, m.x0), ay = Math.max(rect.y0, m.y0), bx = Math.min(rect.x1, m.x1), by = Math.min(rect.y1, m.y1);
  if (bx <= ax || by <= ay) return;
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(kul.foto, (ax - m.x0) * s, (ay - m.y0) * s, (bx - ax) * s, (by - ay) * s, ax * K, ay * K, (bx - ax) * K, (by - ay) * K);
}

// Hilfs-Canvas im Größenrahmen eines Bodenstücks (mit Rand), Weltraum-Transformation wie ctx
function hilfsCanvas(rect, rand = 0) {
  const B = (rect.x1 - rect.x0) * K + 2 * rand, H = (rect.y1 - rect.y0) * K + 2 * rand;
  const c = document.createElement('canvas'); c.width = B; c.height = H;
  const g = c.getContext('2d'); g.translate(rand - rect.x0 * K, rand - rect.y0 * K);
  return { c, g };
}

// Straßen (Vektorzeichnung) halbtransparent über das Foto: erst opak in ein Hilfsbild, dann mit Alpha einblenden
export function strassenHalbtransparent(ctx, rect, zeichne) {
  if (!kul.strassenAlpha) return;
  const { c, g } = hilfsCanvas(rect);
  zeichne(g);
  ctx.save(); ctx.globalAlpha = kul.strassenAlpha; ctx.drawImage(c, rect.x0 * K, rect.y0 * K); ctx.restore();
}

// ---------- LoD2 ----------
function lod2Vorbereiten(liste) {
  return liste.map(b => {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, sx = 0, sy = 0, n = 0;
    const faces = [];
    for (const f of b.f) {
      const P = f.p, pts = [];
      for (let i = 0; i < P.length; i += 3) pts.push([P[i] * K, P[i + 1] * K, P[i + 2]]);
      // Flächennormale (Newell) in Metern: Ost, Süd, oben
      let nx = 0, ny = 0, nz = 0;
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i], c = pts[(i + 1) % pts.length], ax = a[0] / PXM, ay = a[1] / PXM, cx = c[0] / PXM, cy = c[1] / PXM;
        nx += (ay - cy) * (a[2] + c[2]); ny += (a[2] - c[2]) * (ax + cx); nz += (ax - cx) * (ay + cy);
      }
      const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
      if (nz < 0) { nx = -nx; ny = -ny; nz = -nz; }
      if (nz < 0.12) continue;   // (fast) senkrechte Flächen sieht man von oben nicht
      const neig = Math.acos(Math.min(1, nz));
      for (const p of pts) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); sx += p[0]; sy += p[1]; n++; }
      let zmax = -1e9; for (const p of pts) zmax = Math.max(zmax, p[2]);
      const lambert = Math.max(0, nx * SONNE[0] + ny * SONNE[1] + nz * SONNE[2]);
      faces.push({ pts, neig, nz, hell: 0.70 + 0.52 * lambert, zmax, schr: (nx !== 0 || ny !== 0) ? Math.atan2(nx, ny) : 0 });
    }
    return { faces, box: { x0, y0, x1, y1 }, cx: sx / Math.max(1, n), cy: sy / Math.max(1, n), h: b.h };
  }).filter(b => b.faces.length);
}

const imPolygon = (px, py, pts) => {
  let r = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) r = !r;
  }
  return r;
};
const schneidet = (b, r) => b.x1 >= r.x0 && b.x0 <= r.x1 && b.y1 >= r.y0 && b.y0 <= r.y1;
const pxRect = rect => ({ x0: rect.x0 * K, y0: rect.y0 * K, x1: rect.x1 * K, y1: rect.y1 * K });

// Gebäude des Modells in einem Kartenausschnitt: je Gebäude der zugehörige OSM-Umriss (oder null)
function lod2Hier(rect, osm, schattenRand = false) {
  const r = pxRect(rect), erg = [];
  for (const b of kul.lod2) {
    if (!schneidet({ x0: b.box.x0 - 40, y0: b.box.y0 - 40, x1: b.box.x1 + 40, y1: b.box.y1 + 40 }, schattenRand ? { x0: r.x0, y0: r.y0, x1: r.x1 + 300, y1: r.y1 + 300 } : r)) continue;
    if (!b._g) b._g = osm.find(g => imPolygon(b.cx, b.cy, g.pts)) ?? null;
    erg.push(b);
  }
  return erg;
}

// Schlagschatten von Häusern (aus dem Modell) und Bäumen (geschätzte Höhe) auf den Boden; weich und halbtransparent
export function zeichneSchatten(ctx, rect, osm, baeume) {
  if (!kul.schatten) return;
  const RAND = 24, { c, g } = hilfsCanvas(rect, RAND);
  g.fillStyle = '#000'; g.strokeStyle = '#000'; g.lineJoin = 'round';
  const dx = SCHATTEN_DIR[0] * SCHATTEN_PRO_M, dy = SCHATTEN_DIR[1] * SCHATTEN_PRO_M;
  for (const b of lod2Hier(rect, osm, true)) {
    for (const f of b.faces) {
      const P = f.pts, n = P.length;
      g.beginPath(); P.forEach((p, i) => i ? g.lineTo(p[0] + dx * p[2], p[1] + dy * p[2]) : g.moveTo(p[0] + dx * p[2], p[1] + dy * p[2])); g.closePath(); g.fill();
      for (let i = 0; i < n; i++) {   // Wandschatten: Kante vom Boden bis zur projizierten Dachkante
        const a = P[i], e = P[(i + 1) % n];
        g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(e[0], e[1]); g.lineTo(e[0] + dx * e[2], e[1] + dy * e[2]); g.lineTo(a[0] + dx * a[2], a[1] + dy * a[2]); g.closePath(); g.fill();
      }
    }
  }
  // Bäume: Kronenschatten (Ellipse) in Höhe des Kronenmittelpunkts verschoben, dazu Stammschatten
  const ang = Math.atan2(SCHATTEN_DIR[1], SCHATTEN_DIR[0]);
  for (const t of baeume) {
    const Dm = t.gr / PXM, H = Math.min(20, Math.max(6, 1.15 * Dm + 3)), hk = 0.66 * H;
    const cx = t.x + dx * hk, cy = t.y + dy * hk;
    g.beginPath(); g.ellipse(cx, cy, t.gr / 2 * 1.15, t.gr / 2 * 0.95, ang, 0, Math.PI * 2); g.fill();
    g.lineWidth = 3; g.beginPath(); g.moveTo(t.x, t.y); g.lineTo(cx, cy); g.stroke();
  }
  ctx.save();
  ctx.filter = 'blur(2.5px)'; ctx.globalAlpha = 0.32;
  ctx.drawImage(c, rect.x0 * K - RAND, rect.y0 * K - RAND);
  ctx.restore();
}

// Echte Dächer: ersetzt die gezeichneten Dächer der zugehörigen OSM-Gebäude. Gibt die ersetzten OSM-Gebäude zurück.
export function zeichneLod2Daecher(ctx, rect, osm, farbeVon) {
  const ersetzt = new Set(), r = pxRect(rect);
  if (!kul.lod2) return ersetzt;
  ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  for (const b of lod2Hier(rect, osm)) {
    const g = b._g;
    if (g?.safe) continue;            // Safe Rooms haben ihr eigenes Dach
    if (g) ersetzt.add(g);
    const basis = g ? farbeVon(g) : [150, 110, 90];
    // höchste Flächen zuletzt (Dachaufbauten über dem Hauptdach)
    for (const f of [...b.faces].sort((p, q) => p.zmax - q.zmax)) {
      const flach = f.neig < 0.14;
      const fa = flach ? 1.0 : f.hell;
      const col = basis.map(v => Math.max(0, Math.min(255, v * fa)));
      const pf = new Path2D(); f.pts.forEach((p, i) => i ? pf.lineTo(p[0], p[1]) : pf.moveTo(p[0], p[1])); pf.closePath();
      ctx.fillStyle = `rgb(${col[0] | 0},${col[1] | 0},${col[2] | 0})`; ctx.fill(pf);
      if (!flach && !new URLSearchParams(location.search).has('ohnereihen')) {   // Ziegelreihen quer zum Gefälle (Linien entlang der Traufe)
        ctx.save(); ctx.clip(pf);
        // schr = atan2(nx, ny) mit (Ost, Süd): Richtung (sin, cos) = (Ost, Süd) -> Bildrichtung
        const gx = Math.sin(f.schr), gy = Math.cos(f.schr);
        ctx.strokeStyle = 'rgba(0,0,0,.13)'; ctx.lineWidth = 1;
        const bx = f.pts.reduce((s, p) => s + p[0], 0) / f.pts.length, by = f.pts.reduce((s, p) => s + p[1], 0) / f.pts.length;
        ctx.beginPath();
        for (let k = -60; k <= 60; k++) {
          const ox = bx + gx * k * 3.2, oy = by + gy * k * 3.2;
          ctx.moveTo(ox - gy * 400, oy + gx * 400); ctx.lineTo(ox + gy * 400, oy - gx * 400);
        }
        ctx.stroke();
        ctx.restore();
      }
      // Kontur; Firstlinie (oberste Kante einer geneigten Fläche) hell
      ctx.strokeStyle = 'rgba(0,0,0,.34)'; ctx.lineWidth = 1.1; ctx.stroke(pf);
      if (!flach) {
        const zm = f.zmax; ctx.strokeStyle = 'rgba(255,240,220,.55)'; ctx.lineWidth = 1.6;
        const P = f.pts;
        for (let i = 0; i < P.length; i++) {
          const a = P[i], e = P[(i + 1) % P.length];
          if (a[2] > zm - 0.25 && e[2] > zm - 0.25 && Math.hypot(a[0] - e[0], a[1] - e[1]) > 6) { ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(e[0], e[1]); ctx.stroke(); }
        }
      }
    }
  }
  ctx.restore();
  return ersetzt;
}

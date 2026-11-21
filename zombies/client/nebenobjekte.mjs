// Darstellung der Luftbild-Objekte aus dem Weltcode (osmwelt.mjs): Nebengebäude (welt.nebengebaeude) und Schwimmbecken (welt.poolsEcht).
// Beides sind Hindernisse im feinen Raster – hier wird nur gezeichnet, nichts am Spiel verändert.
//   Nebengebäude: Umriss n.p (flache Liste in Spielpixeln), art 'garage' | 'gartenhaus' | 'neben', h in dm, farbe '#rrggbb' aus dem Luftbild,
//   dach = LoD2-Dachflächen. Schalter „Echte Dächer“ AN → diese Flächen (wie bei den Häusern), sonst ein einfaches Flach-/Satteldach in farbe.
//   Immer: kleiner Schlagschatten/Sockel, damit man das Hindernis sieht.
import { kulDaecher, zeichneNebenDach } from './kulisse.mjs';

const RAND = 24;   // Pixel Platz um den Umriss (Schatten, Sockel)
const KACHEL = 32;

export function hexRgb(h, vorgabe = [150, 144, 134]) {
  return /^#[0-9a-f]{6}$/i.test(h ?? '') ? [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)) : vorgabe;
}
const rgb = (c, f = 1) => `rgb(${c.map(v => Math.max(0, Math.min(255, Math.round(v * f)))).join(',')})`;

// Begrenzungsrahmen eines Objekts mit flachem Polygon o.p (gemerkt am Objekt) oder eines flachen Polygons selbst
export function polyBox(o) {
  if (o._box) return o._box;
  const p = Array.isArray(o) ? o : o.p;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i + 1 < p.length; i += 2) { x0 = Math.min(x0, p[i]); x1 = Math.max(x1, p[i]); y0 = Math.min(y0, p[i + 1]); y1 = Math.max(y1, p[i + 1]); }
  const b = { x0, y0, x1, y1 };
  if (!Array.isArray(o)) o._box = b;
  return b;
}
const imRahmen = (b, r, rand) => b.x1 >= r.x0 - rand && b.x0 <= r.x1 + rand && b.y1 >= r.y0 - rand && b.y0 <= r.y1 + rand;
const pixelRect = rect => ({ x0: rect.x0 * KACHEL, y0: rect.y0 * KACHEL, x1: rect.x1 * KACHEL, y1: rect.y1 * KACHEL });

function pfad(ctx, p) {
  ctx.beginPath(); ctx.moveTo(p[0], p[1]);
  for (let i = 2; i + 1 < p.length; i += 2) ctx.lineTo(p[i], p[i + 1]);
  ctx.closePath();
}

// Gerundeter Umriss (Radius r in Pixeln): glatte Ecken für Becken
function rundPfad(ctx, p, r) {
  const n = p.length >> 1, pt = i => [p[2 * ((i + n) % n)], p[2 * ((i + n) % n) + 1]];
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const a = pt(i - 1), b = pt(i), c = pt(i + 1);
    const l1 = Math.hypot(a[0] - b[0], a[1] - b[1]) || 1, l2 = Math.hypot(c[0] - b[0], c[1] - b[1]) || 1, k = Math.min(r, l1 / 2, l2 / 2);
    const s = [b[0] + (a[0] - b[0]) / l1 * k, b[1] + (a[1] - b[1]) / l1 * k], e = [b[0] + (c[0] - b[0]) / l2 * k, b[1] + (c[1] - b[1]) / l2 * k];
    if (i) ctx.lineTo(s[0], s[1]); else ctx.moveTo(s[0], s[1]);
    ctx.quadraticCurveTo(b[0], b[1], e[0], e[1]);
  }
  ctx.closePath();
}

// Hauptrichtung (Winkel der längsten Kante) und Mittelpunkt
function ausrichtung(p) {
  let best = 0, w = 0, cx = 0, cy = 0; const n = p.length >> 1;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n, dx = p[2 * j] - p[2 * i], dy = p[2 * j + 1] - p[2 * i + 1], l = dx * dx + dy * dy;
    if (l > best) { best = l; w = Math.atan2(dy, dx); }
    cx += p[2 * i]; cy += p[2 * i + 1];
  }
  return { w, cx: cx / n, cy: cy / n };
}

// Einfaches Dach in der Luftbildfarbe: Garage = Flachdach (Rand, innere Kante), sonst Satteldach (zwei Dachhälften, First)
function einfachesDach(ctx, n, c) {
  ctx.save(); ctx.lineJoin = 'round';
  pfad(ctx, n.p); ctx.fillStyle = rgb(c); ctx.fill();
  ctx.save(); ctx.clip();
  if (n.art === 'garage') {
    pfad(ctx, n.p); ctx.strokeStyle = rgb(c, 0.78); ctx.lineWidth = 7; ctx.stroke();   // Dachrand innen
    pfad(ctx, n.p); ctx.strokeStyle = 'rgba(255,255,255,.18)'; ctx.lineWidth = 1.2; ctx.stroke();
  } else {
    const { w, cx, cy } = ausrichtung(n.p), L = 400;   // Dachhälften: links/rechts der Firstlinie (durch den Mittelpunkt, entlang der Hauptrichtung)
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(w);
    ctx.fillStyle = rgb(c, 1.14); ctx.fillRect(-L, -L, 2 * L, L);
    ctx.fillStyle = rgb(c, 0.84); ctx.fillRect(-L, 0, 2 * L, L);
    ctx.strokeStyle = 'rgba(255,245,230,.5)'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(-L, 0); ctx.lineTo(L, 0); ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
  pfad(ctx, n.p); ctx.strokeStyle = 'rgba(40,20,10,.55)'; ctx.lineWidth = 1.6; ctx.stroke();   // Traufkante
  ctx.restore();
}

// Nebengebäude eines Kartenstücks (ctx steht im Weltraum). Im Dach-Bild (über den Figuren), wie die Hausdächer. Rückgabe: Anzahl gezeichneter.
export function zeichneNebengebaeude(ctx, welt, rect) {
  const liste = welt.nebengebaeude;
  if (!liste?.length) return 0;
  const r = pixelRect(rect), echt = kulDaecher();
  const hier = liste.filter(n => n.p?.length >= 6 && imRahmen(polyBox(n), r, RAND));
  ctx.save(); ctx.lineJoin = 'round';
  for (const n of hier) {   // Schlagschatten + dunkler Sockel unter dem Dach
    const m = Math.max(2, (n.h || 0) / 10);
    ctx.save(); ctx.translate(2.5 + m * 0.7, 3.5 + m); pfad(ctx, n.p); ctx.fillStyle = 'rgba(0,0,0,.26)'; ctx.fill(); ctx.restore();
    pfad(ctx, n.p); ctx.strokeStyle = 'rgba(58,50,45,.6)'; ctx.lineWidth = 5; ctx.stroke();
  }
  for (const n of hier) {
    const c = hexRgb(n.farbe);
    if (!(echt && zeichneNebenDach(ctx, n, c))) einfachesDach(ctx, n, c);
  }
  ctx.restore();
  return hier.length;
}

// Schwimmbecken (welt.poolsEcht: Liste { p } mit flachen Polygonen in Spielpixeln) in der Bodenebene. Über dem Luftbild halbtransparent
// (das Foto zeigt das Becken), sonst deckend. Heller Beckenrand, türkisblaues Wasser, glatte Ecken.
export function zeichnePools(ctx, welt, rect, foto) {
  const liste = welt.poolsEcht;
  if (!liste?.length) return 0;
  const r = pixelRect(rect);
  let z = 0;
  for (const q of liste) {
    const p = q.p ?? q;
    if (p.length < 6) continue;
    const b = polyBox(q.p ? q : p);
    if (!imRahmen(b, r, RAND)) continue;
    const rad = Math.min(8, Math.min(b.x1 - b.x0, b.y1 - b.y0) * 0.22);
    ctx.save(); ctx.lineJoin = 'round'; ctx.globalAlpha = foto ? 0.5 : 1;
    rundPfad(ctx, p, rad); ctx.fillStyle = '#e9f3f2'; ctx.fill();                // Beckenrand (hell)
    ctx.strokeStyle = 'rgba(120,130,130,.7)'; ctx.lineWidth = 1.2; ctx.stroke();
    rundPfad(ctx, p, rad); ctx.save(); ctx.clip();
    const g = ctx.createLinearGradient(b.x0, b.y0, b.x1, b.y1); g.addColorStop(0, '#35c6d6'); g.addColorStop(1, '#1b9cc0');
    ctx.fillStyle = g; ctx.fillRect(b.x0 - 2, b.y0 - 2, b.x1 - b.x0 + 4, b.y1 - b.y0 + 4);
    ctx.strokeStyle = '#e9f3f2'; ctx.lineWidth = 9; rundPfad(ctx, p, rad); ctx.stroke();   // Rand: nach innen 4,5 px
    ctx.strokeStyle = 'rgba(255,255,255,.28)'; ctx.lineWidth = 1.2;                    // Wellenlinien
    for (let y = b.y0 + 12; y < b.y1 - 8; y += 9) {
      ctx.beginPath(); ctx.moveTo(b.x0, y);
      for (let x = b.x0; x < b.x1; x += 10) { ctx.quadraticCurveTo(x + 2.5, y - 2, x + 5, y); ctx.quadraticCurveTo(x + 7.5, y + 2, x + 10, y); }
      ctx.stroke();
    }
    ctx.restore(); ctx.restore();
    z++;
  }
  return z;
}

// Kulisse „Echt“ (Darstellung, nichts davon verändert die Spielwelt). Drei unabhängige Schalter (Zahnrad-Menü, je Gerät):
//   Luftbild-Boden  amtliches Orthofoto (Bayern DOP, CC BY 4.0) statt gezeichnetem Boden, als 128-m-Bildkacheln nachgeladen (tools/kulisse.py)
//   Echte Dächer    Dachflächen aus dem 3D-Gebäudemodell LoD2 Bayern (CC BY 4.0), auf den OSM-Umriss zugeschnitten
//   Schatten        weiche Schlagschatten von Häusern und Bäumen (Sonne fest Vormittag Südost), nachts und im Nebel ausgeblendet
// Daten je Karte: karten/kulisse/<karte>/index.json (+ <kx>_<ky>.webp, daecher.json). Ohne Daten bleibt alles wie bisher.
import { KACHEL as K } from './welt.mjs';
import { KUL_SCHLUESSEL, schalterLesen, indexLesen, kachelName, kachelnFuerRect, puffer, daecherLesen, flaecheAufbereiten,
  SCHATTEN_JE_M, STANDARD_HAUSHOEHE, baumHoehe } from './kulisse_regeln.mjs';

let kul = null;

export function kulisse() { return kul; }
export const kulisseVorhanden = () => !!kul;
export const kulBoden = () => !!(kul?.index.foto && kul.an.boden);
export const kulDaecher = () => !!(kul?.daecher && kul.an.daecher);
export const kulSchatten = () => !!(kul && kul.an.schatten);
export const kulHatFoto = () => !!kul?.index.foto;
export const kulHatDaecher = () => !!kul?.daecher;

export async function ladeKulisse(karte) {
  kul = null;
  const lies = k => { try { return localStorage.getItem(k); } catch { return null; } };
  const basis = `karten/kulisse/${karte}/`;
  let index = null;
  try { const r = await fetch(basis + 'index.json'); if (r.ok) index = indexLesen(await r.json()); } catch { /* keine Kulisse */ }
  if (!index) return null;
  let daecher = null;
  if (index.daecher) { try { const r = await fetch(basis + 'daecher.json'); if (r.ok) daecher = daecherLesen(await r.json()); } catch { /* ohne Dächer */ } }
  const an = schalterLesen(lies(KUL_SCHLUESSEL.boden), lies(KUL_SCHLUESSEL.daecher), lies(KUL_SCHLUESSEL.schatten));
  const q = new URLSearchParams(location.search);   // zum Prüfen: ?kul=boden,daecher,schatten (nur diese an) oder ?kul=aus
  if (q.has('kul')) { const w = q.get('kul').split(','); an.boden = w.includes('boden'); an.daecher = w.includes('daecher'); an.schatten = w.includes('schatten'); }
  kul = { karte, basis, index, daecher: daecher?.size ? daecher : null, an, kacheln: new Map(), stat: { geladen: 0, bytes: 0, fehler: 0, entladen: 0 } };
  globalThis.__kulisse = kul;
  return kul;
}

// ---------- Luftbild-Kacheln: lazy laden, höchstens PUFFER_MAX im Speicher ----------
const laedt = new Set();
async function kachelLaden(key) {
  const [kx, ky] = key.split('_').map(Number);
  laedt.add(key);
  try {
    const r = await fetch(`${kul.basis}${kachelName(kx, ky)}.${kul.index.format}`);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const blob = await r.blob();
    const bmp = await createImageBitmap(blob);
    kul.stat.geladen++; kul.stat.bytes += blob.size;
    kul.kacheln.set(key, { s: 'da', bmp });
  } catch (e) {
    kul.stat.fehler++; kul.kacheln.set(key, { s: 'fehlt', bmp: null });   // Ersatz: gezeichneter Boden
  } finally { laedt.delete(key); }
}

// 'bereit' (alle Bildkacheln des Ausschnitts da), 'laedt' (noch nicht) oder 'fehlt' (nicht ladbar: gezeichneter Boden als Ersatz)
export function fotoStatus(rect) {
  if (!kulBoden()) return 'fehlt';
  let alle = true;
  for (const [kx, ky] of kachelnFuerRect(kul.index, rect)) {
    const e = kul.kacheln.get(kachelName(kx, ky));
    if (e?.s === 'fehlt') return 'fehlt';
    if (e?.s !== 'da') alle = false;
  }
  return alle ? 'bereit' : 'laedt';
}

// Rechtecke (in Spielkacheln), die bald gebraucht werden, nach Wichtigkeit sortiert → fehlende Bildkacheln anfordern, ungebrauchte entladen
export function fotoWunsch(rects) {
  if (!kulBoden()) return;
  const wunsch = [];
  for (const r of rects) for (const [kx, ky] of kachelnFuerRect(kul.index, r)) {
    const k = kachelName(kx, ky), e = kul.kacheln.get(k);
    if (e?.s === 'fehlt') continue;
    wunsch.push(k);
  }
  const vorhanden = [...kul.kacheln].filter(([, e]) => e.s === 'da').map(([k]) => k);
  const { laden, entladen } = puffer(wunsch, vorhanden, [...laedt]);
  for (const k of entladen) { kul.kacheln.get(k)?.bmp?.close?.(); kul.kacheln.delete(k); kul.stat.entladen++; }
  for (const k of laden) kachelLaden(k);
}

// Luftbild in einen Bodenstück-Canvas (ctx steht im Weltraum, rect in Spielkacheln)
export function zeichneFoto(ctx, rect) {
  const idx = kul.index, k = idx.kachel, ppk = idx.px / k;
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  for (const [kx, ky] of kachelnFuerRect(idx, rect)) {
    const e = kul.kacheln.get(kachelName(kx, ky));
    if (e?.s !== 'da') continue;
    kul.kacheln.delete(kachelName(kx, ky)); kul.kacheln.set(kachelName(kx, ky), e);   // zuletzt benutzt
    const ax = Math.max(rect.x0, kx * k), ay = Math.max(rect.y0, ky * k), bx = Math.min(rect.x1, (kx + 1) * k), by = Math.min(rect.y1, (ky + 1) * k);
    if (bx <= ax || by <= ay) continue;
    ctx.drawImage(e.bmp, (ax - kx * k) * ppk, (ay - ky * k) * ppk, (bx - ax) * ppk, (by - ay) * ppk, ax * K, ay * K, (bx - ax) * K, (by - ay) * K);
  }
}

// ---------- Echte Dächer ----------
// Zeichnet das LoD2-Dach in den OSM-Umriss g.pts (Pixel); false, wenn es für dieses Haus keins gibt (dann bisherige Darstellung)
export function zeichneEchtesDach(ctx, g, farbe) {
  const liste = kul.daecher.get(g.kx + ',' + g.ky);
  if (!liste) return false;
  g._kd ??= liste.flatMap(b => b.f.map(flaecheAufbereiten).filter(Boolean)).sort((p, q) => p.zmax - q.zmax);
  if (!g._kd.length) return false;
  dachFlaechenZeichnen(ctx, g.pts, g._kd, farbe);
  return true;
}

// Nebengebäude (welt.nebengebaeude): LoD2-Dachflächen n.dach ([{ p, n, a, e }]) in den Umriss n.p (Spielpixel, flach [x, y, …]); false, wenn keine Flächen da sind
export function zeichneNebenDach(ctx, n, farbe) {
  n._kd ??= (n.dach ?? []).map(flaecheAufbereiten).filter(Boolean).sort((p, q) => p.zmax - q.zmax);
  if (!n._kd.length) return false;
  const pts = []; for (let i = 0; i + 1 < n.p.length; i += 2) pts.push([n.p[i], n.p[i + 1]]);
  dachFlaechenZeichnen(ctx, pts, n._kd, farbe);
  return true;
}

function dachFlaechenZeichnen(ctx, pts, flaechen, farbe) {
  ctx.save(); ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); ctx.closePath();
  ctx.fillStyle = `rgb(${farbe[0]},${farbe[1]},${farbe[2]})`; ctx.fill();
  ctx.save(); ctx.clip();
  for (const f of flaechen) {
    const c = farbe.map(v => Math.max(0, Math.min(255, (v * f.hell) | 0)));
    ctx.beginPath(); f.pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.closePath();
    ctx.fillStyle = ctx.strokeStyle = `rgb(${c[0]},${c[1]},${c[2]})`; ctx.lineWidth = 0.7; ctx.fill(); ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,.16)'; ctx.lineWidth = 1; ctx.stroke();
    if (f.first.length) {
      ctx.strokeStyle = 'rgba(255,240,220,.5)'; ctx.lineWidth = 1.5; ctx.beginPath();
      for (const [ax, ay, bx, by] of f.first) { ctx.moveTo(ax, ay); ctx.lineTo(bx, by); }
      ctx.stroke();
    }
  }
  ctx.restore();
  ctx.strokeStyle = 'rgba(40,20,10,.5)'; ctx.lineWidth = 1.6;   // Traufkante
  ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); ctx.closePath(); ctx.stroke();
  ctx.restore();
}

// Haushöhe in Metern (Firsthöhe aus LoD2, sonst Schätzwert)
function haushoehe(g) {
  const l = kul?.daecher?.get(g.kx + ',' + g.ky);
  return l ? Math.max(3, ...l.map(b => b.h)) : STANDARD_HAUSHOEHE;
}

// ---------- Schatten ----------
// Schatten von Häusern (g.pts in Pixeln) und Bäumen (t.x, t.y, t.gr) in ein leeres Bodenstück-Bild (ohne Weltraum-Verschiebung; rect in Spielkacheln).
// Deckkraft setzt der Aufrufer am Bild (nachts/Nebel ändern sie); hier wird nur deckend schwarz gezeichnet und weich gerechnet. Gibt zurück, ob etwas gezeichnet wurde.
export function zeichneSchatten(ctx, B, H, rect, haeuser, baeume, neben = []) {
  const ox = rect.x0 * K, oy = rect.y0 * K, RAND = 220;   // Schatten fallen nach Nordwesten: Quellen bis 220 px südöstlich des Stücks zählen
  const hier = (x0, y0, x1, y1) => x1 >= ox - RAND && x0 <= ox + B + 8 && y1 >= oy - RAND && y0 <= oy + H + RAND;
  const h = document.createElement('canvas'); h.width = B; h.height = H;
  const g = h.getContext('2d'); g.translate(-ox, -oy); g.fillStyle = '#000'; g.lineJoin = 'round';
  let n = 0;
  for (const b of haeuser) {
    if (b.safe || !hier(b.box.x0, b.box.y0, b.box.x1, b.box.y1)) continue;
    const m = haushoehe(b), dx = SCHATTEN_JE_M.dx * m, dy = SCHATTEN_JE_M.dy * m, P = b.pts;
    g.beginPath(); P.forEach((p, i) => i ? g.lineTo(p[0] + dx, p[1] + dy) : g.moveTo(p[0] + dx, p[1] + dy)); g.closePath(); g.fill();
    for (let i = 0; i < P.length; i++) {
      const a = P[i], e = P[(i + 1) % P.length];
      g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(e[0], e[1]); g.lineTo(e[0] + dx, e[1] + dy); g.lineTo(a[0] + dx, a[1] + dy); g.closePath(); g.fill();
    }
    n++;
  }
  for (const b of neben) {   // Nebengebäude (Garagen, Gartenhäuser): Umriss b.p flach in Pixeln, Höhe b.h in dm
    if (!b.p || b.p.length < 6) continue;
    if (!b._box) { let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (let i = 0; i < b.p.length; i += 2) { x0 = Math.min(x0, b.p[i]); x1 = Math.max(x1, b.p[i]); y0 = Math.min(y0, b.p[i + 1]); y1 = Math.max(y1, b.p[i + 1]); } b._box = { x0, y0, x1, y1 }; }
    if (!hier(b._box.x0, b._box.y0, b._box.x1, b._box.y1)) continue;
    const m = Math.max(2, (b.h || 0) / 10), dx = SCHATTEN_JE_M.dx * m, dy = SCHATTEN_JE_M.dy * m, P = b.p, N = P.length >> 1;
    g.beginPath(); for (let i = 0; i < N; i++) i ? g.lineTo(P[2 * i] + dx, P[2 * i + 1] + dy) : g.moveTo(P[0] + dx, P[1] + dy); g.closePath(); g.fill();
    for (let i = 0; i < N; i++) {
      const j = (i + 1) % N;
      g.beginPath(); g.moveTo(P[2 * i], P[2 * i + 1]); g.lineTo(P[2 * j], P[2 * j + 1]); g.lineTo(P[2 * j] + dx, P[2 * j + 1] + dy); g.lineTo(P[2 * i] + dx, P[2 * i + 1] + dy); g.closePath(); g.fill();
    }
    n++;
  }
  const ang = Math.atan2(SCHATTEN_JE_M.dy, SCHATTEN_JE_M.dx);
  for (const t of baeume) {
    if (!hier(t.x - t.gr, t.y - t.gr, t.x + t.gr, t.y + t.gr)) continue;
    const hk = 0.66 * baumHoehe(t.gr), cx = t.x + SCHATTEN_JE_M.dx * hk, cy = t.y + SCHATTEN_JE_M.dy * hk;
    g.beginPath(); g.ellipse(cx, cy, t.gr / 2 * 1.1, t.gr / 2 * 0.9, ang, 0, Math.PI * 2); g.fill();
    g.lineWidth = 3; g.strokeStyle = '#000'; g.beginPath(); g.moveTo(t.x, t.y); g.lineTo(cx, cy); g.stroke();
    n++;
  }
  if (!n) return false;
  ctx.save(); ctx.filter = 'blur(2.5px)'; ctx.drawImage(h, 0, 0); ctx.restore();
  return true;
}

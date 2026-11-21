// PROTOTYP: Zeichnung der Feinraster-Innenräume (siehe innen_fein.mjs). Maße in Zellen (INNEN_Z px = 0,25 m);
// die Bildfläche wird mit BILD_SKALA-facher Auflösung gezeichnet, damit dünne Wände und kleine Möbel beim Heranzoomen scharf bleiben.
import { T } from './welt.mjs';
import { INNEN_Z } from './innen_fein.mjs';

export const BILD_SKALA = 4;
export const INNEN_ZOOM_FEIN = 3.4;   // Kamera-Zoom drinnen (8 px = 1 m): ein Haus von 14 m ≈ 380 Bildschirm-px bei Grundzoom 1

const BODEN = {
  flur: ['#cdb38f', 'fliese'], kueche: ['#e0d6c2', 'schach'], bad: ['#9fc3d6', 'fliese'],
  wohnzimmer: ['#a9794d', 'diele'], schlafzimmer: ['#b38559', 'diele'], kinderzimmer: ['#b99062', 'diele'],
  abstellraum: ['#8f8577', 'beton'], kellerraum: ['#7b7b78', 'beton'], heizungsraum: ['#6f6f6c', 'beton'],
  vorratskeller: ['#80786c', 'beton'], dachboden: ['#8a6a48', 'diele'], verkaufsraum: ['#d9d3c4', 'fliese'], lager: ['#8f8a80', 'beton'],
};

function rund(ctx, f, x, y, b, h, r = 0.5) {
  ctx.fillStyle = f; ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, b, h, r); else ctx.rect(x, y, b, h);
  ctx.fill();
}

// Möbel proportional zum Rechteck (Weltpixel); lange Achse waagrecht oder senkrecht
function moebel(ctx, m, opt) {
  const Z = INNEN_Z, x = m.x * Z, y = m.y * Z, b = m.b * Z, h = m.h * Z;
  const quer = b >= h, L = quer ? b : h, S = quer ? h : b;   // L = lange Seite, S = kurze Seite
  // Zeichnung in lokalem System: Ursprung links oben, lange Achse nach rechts; bei senkrechten Möbeln gedreht
  ctx.save();
  ctx.translate(x, y);
  if (!quer) { ctx.translate(b, 0); ctx.rotate(Math.PI / 2); }
  ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.fillRect(0.5, 0.6, L, S);
  const k = (f, rx, ry, rb, rh, r) => rund(ctx, f, rx, ry, rb, rh, r ?? Math.min(0.5, S * 0.15));
  switch (m.art) {
    case 'bett': case 'einzelbett': case 'feldbett':
      k('#6d4c41', 0, 0, L, S);
      k('#e8ecef', S * 0.08, S * 0.08, L - S * 0.16, S - S * 0.16);
      k('#fafafa', S * 0.12, S * 0.14, L * 0.16, S * 0.32); if (m.art === 'bett') k('#fafafa', S * 0.12, S * 0.54, L * 0.16, S * 0.32);
      k(m.art === 'einzelbett' ? '#d8744f' : '#5c8fd6', L * 0.34, S * 0.08, L * 0.62, S - S * 0.16);
      break;
    case 'sofa':
      k('#6a4f9c', 0, 0, L, S, 1); k('#8064b8', L * 0.05, S * 0.3, L * 0.9, S * 0.62, 0.8);
      ctx.fillStyle = 'rgba(0,0,0,.2)'; ctx.fillRect(L * 0.34, S * 0.3, 0.25, S * 0.62); ctx.fillRect(L * 0.66, S * 0.3, 0.25, S * 0.62);
      break;
    case 'couchtisch': case 'esstisch':
      k('#8d6e63', 0, 0, L, S); k('#a1887f', 0.5, 0.5, L - 1, S - 1);
      if (m.art === 'esstisch') { ctx.fillStyle = '#6d4c41'; for (const cx of [L * 0.25, L * 0.65]) { ctx.fillRect(cx, -1.2, 1.6, 1.1); ctx.fillRect(cx, S + 0.1, 1.6, 1.1); } }
      break;
    case 'schrank': case 'alter_schrank': case 'kommode': case 'garderobe':
      k(m.art === 'alter_schrank' ? '#5d4037' : '#795548', 0, 0, L, S, 0.4);
      ctx.strokeStyle = 'rgba(0,0,0,.45)'; ctx.lineWidth = 0.3; ctx.strokeRect(0.3, 0.3, L - 0.6, S - 0.6); ctx.beginPath(); ctx.moveTo(L / 2, 0.3); ctx.lineTo(L / 2, S - 0.3); ctx.stroke();
      ctx.fillStyle = '#ffd54f'; ctx.fillRect(L / 2 - 0.9, S / 2 - 0.3, 0.6, 0.6); ctx.fillRect(L / 2 + 0.3, S / 2 - 0.3, 0.6, 0.6);
      break;
    case 'regal': case 'heizung': {
      if (m.art === 'heizung') { k('#b0bec5', 0, 0, L, S, 0.3); ctx.fillStyle = '#78909c'; for (let i = 0.8; i < L - 0.5; i += 0.9) ctx.fillRect(i, 0.2, 0.35, S - 0.4); break; }
      k('#6d4c41', 0, 0, L, S, 0.3);
      const bunt = ['#c62828', '#1565c0', '#2e7d32', '#f9a825', '#6a1b9a'];
      for (let i = 0; i < Math.floor(L / 0.8); i++) { ctx.fillStyle = bunt[(m.x + m.y + i) % bunt.length]; ctx.fillRect(0.3 + i * 0.8, 0.25, 0.55, S - 0.5); }
      break;
    }
    case 'regal_lang': {
      k('#8d8d8d', 0, 0, L, S, 0.3);
      const waren = ['#e53935', '#fdd835', '#43a047', '#1e88e5', '#fb8c00', '#8e24aa'];
      for (let i = 0; i < 8; i++) { ctx.fillStyle = waren[(m.x * 3 + m.y + i) % waren.length]; ctx.fillRect(0.3 + i * ((L - 0.6) / 8), 0.3, (L - 0.6) / 8 - 0.2, S - 0.6); }
      break;
    }
    case 'kasse':
      k('#5d4037', 0, 0, L, S, 0.4); k('#263238', L * 0.6, S * 0.2, L * 0.28, S * 0.55, 0.3); ctx.fillStyle = '#80cbc4'; ctx.fillRect(L * 0.64, S * 0.3, L * 0.2, S * 0.2);
      break;
    case 'kiste':
      k('#a1887f', 0, 0, L, S, 0.3); ctx.strokeStyle = '#6d4c41'; ctx.lineWidth = 0.35; ctx.strokeRect(0.3, 0.3, L - 0.6, S - 0.6);
      ctx.beginPath(); ctx.moveTo(0.3, 0.3); ctx.lineTo(L - 0.3, S - 0.3); ctx.stroke();
      break;
    case 'kuehlschrank': case 'safe_kuehlschrank':
      k('#eceff1', 0, 0, L, S, 0.4); ctx.strokeStyle = 'rgba(0,0,0,.4)'; ctx.lineWidth = 0.25; ctx.strokeRect(0.25, 0.25, L - 0.5, S - 0.5);
      ctx.fillStyle = '#90a4ae'; ctx.fillRect(L - 0.9, S * 0.2, 0.35, S * 0.6);
      break;
    case 'herd':
      k('#cfd8dc', 0, 0, L, S, 0.3); ctx.fillStyle = '#37474f';
      for (const [a, c] of [[0.27, 0.27], [0.73, 0.27], [0.27, 0.73], [0.73, 0.73]]) { ctx.beginPath(); ctx.arc(L * a, S * c, Math.min(L, S) * 0.17, 0, Math.PI * 2); ctx.fill(); }
      break;
    case 'spuele': case 'waschbecken':
      k('#eceff1', 0, 0, L, S, 0.4); k('#b0bec5', L * 0.12, S * 0.18, L * (m.art === 'spuele' ? 0.38 : 0.76), S * 0.64, 0.6);
      if (m.art === 'spuele') k('#b0bec5', L * 0.54, S * 0.18, L * 0.34, S * 0.64, 0.6);
      break;
    case 'badewanne':
      k('#fafafa', 0, 0, L, S, 1.2); k('#b3e5fc', 0.7, 0.7, L - 1.4, S - 1.4, 1); ctx.fillStyle = '#90a4ae'; ctx.beginPath(); ctx.arc(L - 1, S / 2, 0.4, 0, Math.PI * 2); ctx.fill();
      break;
    case 'klo':
      k('#fafafa', 0, S * 0.0, L * 0.3, S, 0.3); ctx.fillStyle = '#fafafa'; ctx.beginPath(); ctx.ellipse(L * 0.62, S / 2, L * 0.34, S * 0.42, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,.3)'; ctx.lineWidth = 0.2; ctx.stroke();
      break;
    default:
      k('#8d6e63', 0, 0, L, S, 0.3);
  }
  ctx.restore();
}

// Innenraum zeichnen; die Zeichenfläche beginnt bei (0, 0) = Zelle (0, 0) des Rasters
export function zeichneInnenFein(ctx, w) {
  const Z = INNEN_Z;
  ctx.save();
  ctx.scale(BILD_SKALA, BILD_SKALA);
  const raumAn = (x, y) => w.raeume.find(r => x >= r.x && x < r.x + r.b && y >= r.y && y < r.y + r.h);
  const B = w.breite, H = w.hoehe;
  // 1) Boden
  for (let y = 0; y < H; y++) for (let x = 0; x < B; x++) {
    const t = w.hole(x, y);
    if (t === T.LEER || t === T.WAND) continue;
    const r = raumAn(x, y) ?? raumAn(x - 3, y) ?? raumAn(x + 3, y) ?? raumAn(x, y - 3) ?? raumAn(x, y + 3) ?? { typ: 'flur' };
    const [farbe, muster] = BODEN[r.typ] ?? ['#b08a62', 'diele'];
    const px = x * Z, py = y * Z;
    ctx.fillStyle = farbe; ctx.fillRect(px, py, Z + 0.02, Z + 0.02);
    if (muster === 'schach' && ((x >> 1) + (y >> 1)) % 2) { ctx.fillStyle = 'rgba(0,0,0,.10)'; ctx.fillRect(px, py, Z, Z); }
    if (muster === 'fliese' && (x % 4 === 0 || y % 4 === 0)) { ctx.fillStyle = 'rgba(0,0,0,.10)'; ctx.fillRect(px, y % 4 === 0 ? py : py, x % 4 === 0 ? 0.25 : Z, y % 4 === 0 ? 0.25 : Z); }
    if (muster === 'diele' && y % 3 === 0) { ctx.fillStyle = 'rgba(0,0,0,.14)'; ctx.fillRect(px, py, Z, 0.2); }
  }
  // 2) Wände (dünn): dunkle Fläche, an Bodenseiten ein heller Rand und Schatten
  for (let y = 0; y < H; y++) for (let x = 0; x < B; x++) {
    if (w.hole(x, y) !== T.WAND) continue;
    ctx.fillStyle = '#4e4038'; ctx.fillRect(x * Z, y * Z, Z + 0.02, Z + 0.02);
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < B; x++) {
    if (w.hole(x, y) !== T.WAND) continue;
    const bo = (a, c) => { const t = w.hole(a, c); return t !== T.WAND && t !== T.LEER; };
    ctx.fillStyle = '#7a6a60';
    if (bo(x, y + 1)) ctx.fillRect(x * Z, y * Z + Z - 0.45, Z + 0.02, 0.45);
    if (bo(x, y - 1)) ctx.fillRect(x * Z, y * Z, Z + 0.02, 0.45);
    if (bo(x + 1, y)) ctx.fillRect(x * Z + Z - 0.45, y * Z, 0.45, Z + 0.02);
    if (bo(x - 1, y)) ctx.fillRect(x * Z, y * Z, 0.45, Z + 0.02);
  }
  // 3) Türrahmen (offener Durchgang, die Türblätter zeichnet das Spiel), Haustür, Treppen
  for (const t of w.tueren) {
    const zs = t.zellen, x0 = Math.min(...zs.map(c => c[0])), y0 = Math.min(...zs.map(c => c[1])), x1 = Math.max(...zs.map(c => c[0])), y1 = Math.max(...zs.map(c => c[1]));
    ctx.fillStyle = '#c9b79c'; ctx.fillRect(x0 * Z, y0 * Z, (x1 - x0 + 1) * Z, (y1 - y0 + 1) * Z);
    ctx.fillStyle = '#5d4037';
    if (t.senkrecht) { ctx.fillRect(x0 * Z - 0.2, y0 * Z - 0.5, Z + 0.4, 0.5); ctx.fillRect(x0 * Z - 0.2, (y1 + 1) * Z, Z + 0.4, 0.5); }
    else { ctx.fillRect(x0 * Z - 0.5, y0 * Z - 0.2, 0.5, Z + 0.4); ctx.fillRect((x1 + 1) * Z, y0 * Z - 0.2, 0.5, Z + 0.4); }
  }
  if (w.ausgang) {
    const zs = w.ausgang.zellen, x0 = Math.min(...zs.map(c => c[0])), y0 = Math.min(...zs.map(c => c[1])), x1 = Math.max(...zs.map(c => c[0])), y1 = Math.max(...zs.map(c => c[1]));
    ctx.fillStyle = '#5d4037'; ctx.fillRect(x0 * Z, y0 * Z, (x1 - x0 + 1) * Z, (y1 - y0 + 1) * Z);
    ctx.fillStyle = '#ffd54f'; ctx.font = 'bold 5px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const pf = { unten: '⬇', oben: '⬆', links: '⬅', rechts: '➡' }[w.ausgang.seite] ?? '⬇';
    ctx.fillText(pf, (x0 + x1 + 1) * Z / 2, (y0 + y1 + 1) * Z / 2);
  }
  for (const tr of w.treppen) {
    const r = tr.rect, quer = r.b > r.h;
    ctx.fillStyle = '#9e9e9e'; ctx.fillRect(r.x * Z, r.y * Z, r.b * Z, r.h * Z);
    ctx.fillStyle = '#616161';
    const n = Math.round((quer ? r.b : r.h) / 2);
    for (let i = 0; i < n; i++) { if (quer) ctx.fillRect((r.x + i * 2) * Z + 0.7, r.y * Z, 0.3, r.h * Z); else ctx.fillRect(r.x * Z, (r.y + i * 2) * Z + 0.7, r.b * Z, 0.3); }
    ctx.strokeStyle = '#424242'; ctx.lineWidth = 0.3; ctx.strokeRect(r.x * Z, r.y * Z, r.b * Z, r.h * Z);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 5px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(tr.art === 'runter' ? '▼' : '▲', (r.x + r.b / 2) * Z, (r.y + r.h / 2) * Z);
  }
  // 4) Möbel
  for (const m of w.moebel) moebel(ctx, m, {});
  ctx.restore();
}

// Türblatt (Graphics in Weltpixeln): zu = braune Fläche über dem Durchgang (mit Schloss-Symbol), offen = schmales Blatt im Winkel von 90°
export function zeichneTuerFein(g, sp, a, w, t, zustand, zusText) {
  const Z = INNEN_Z, zs = t.zellen;
  const x0 = Math.min(...zs.map(c => c[0])) * Z, y0 = Math.min(...zs.map(c => c[1])) * Z;
  const x1 = (Math.max(...zs.map(c => c[0])) + 1) * Z, y1 = (Math.max(...zs.map(c => c[1])) + 1) * Z;
  if (zustand === 'o') {
    g.fillStyle(0x6d4c41, 1);
    if (t.senkrecht) g.fillRect(x0, y0, zs.length * Z, 0.7); else g.fillRect(x0, y0, 0.7, zs.length * Z);
  } else {
    g.fillStyle(zustand === 'r' || zustand === 's' ? 0x5d4037 : 0x8d6e63, 1).fillRect(x0, y0, x1 - x0, y1 - y0);
    g.lineStyle(0.4, 0x3e2723, 1).strokeRect(x0 + 0.2, y0 + 0.2, x1 - x0 - 0.4, y1 - y0 - 0.4);
    g.fillStyle(0xffd54f, 1).fillCircle(t.senkrecht ? x0 + Z / 2 : x1 - 1.5, t.senkrecht ? y1 - 1.5 : y0 + Z / 2, 0.45);
    if (zustand === 'r' || zustand === 's') a.symbole.add(sp.add.text((x0 + x1) / 2, (y0 + y1) / 2, zustand === 'r' ? '❓' : '🔑', { fontSize: '16px' }).setOrigin(0.5).setScale(0.4));
  }
  const brett = parseInt(zusText) || 0;
  for (let i = 0; i < brett; i++) {
    g.fillStyle(0xa1887f, 1).lineStyle(0.3, 0x4e342e, 1);
    if (t.senkrecht) { g.fillRect(x0 - 0.5, y0 + 1 + i * 2.2, x1 - x0 + 1, 1.2); g.strokeRect(x0 - 0.5, y0 + 1 + i * 2.2, x1 - x0 + 1, 1.2); }
    else { g.fillRect(x0 + 1 + i * 2.2, y0 - 0.5, 1.2, y1 - y0 + 1); g.strokeRect(x0 + 1 + i * 2.2, y0 - 0.5, 1.2, y1 - y0 + 1); }
  }
}

// Aussehen der Welt im Stil des Einzelspieler-Prototyps.
// Die eigentlichen Zeichenfunktionen (Bäume, Häuser, Kühe …) stammen wörtlich aus dem Prototyp
// (proto_grafik.mjs, erzeugt von tools/baue_aussehen.py); hier wird nur unsere Karte darauf abgebildet.
import { KACHEL, BREITE, HOEHE, T } from './welt.mjs';
import { erzeugeZeichner } from './proto_grafik.mjs';
import { zeichneSafeMoebel } from './safe_moebel.mjs';
import { zeichneWasser, zeichneWasserHauch } from './wasser.mjs';
import { zeichneMoebelBild } from './moebel_bilder.mjs';
import { fzPx } from './masse.mjs';
import { zeichneStuetzpunktBoden, zeichneStuetzpunktOben } from './stuetzpunkt.mjs';
import { zeichneEinkaufswagen } from './einkaufswagen.mjs';
import { zeichneFlaechen, zeichneStrassen, zeichneVektorDaecher, zeichneVektorSafeDach, vektorGebaeude } from './vektor.mjs';
import { kulBodenArt, fotoStatus, zeichneFoto, zeichneSchatten } from './kulisse.mjs';
import { imGebiet } from './luftbild.mjs';
import { SCHATTEN_JE_M } from './kulisse_regeln.mjs';
import { zeichneNebengebaeude, zeichnePools } from './nebenobjekte.mjs';

const TAU = Math.PI * 2;

function hash(x, y) {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// weiche Helligkeitswolken über die Wiese (Wertrauschen)
function rauschen(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

// Grundfarbe #4d8c3b mit hellen und dunklen Wolken, je 8×8 Pixel ein Wert; 1 px Rand für weiche Übergänge an Stücknähten
function wiesenWolken(ctx, x0, y0, x1, y1) {
  const F = 8, nx = (x1 - x0) * KACHEL / F, ny = (y1 - y0) * KACHEL / F;
  const c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(nx + 2, ny + 2) : Object.assign(document.createElement('canvas'), { width: nx + 2, height: ny + 2 });
  const g = c.getContext('2d'), bild = g.createImageData(nx + 2, ny + 2), d = bild.data;
  let i = 0;
  for (let j = -1; j <= ny; j++) for (let k = -1; k <= nx; k++, i += 4) {
    const x = x0 * KACHEL + k * F, y = y0 * KACHEL + j * F;
    const n = rauschen(x / 90, y / 90) * 0.7 + rauschen(x / 23, y / 23) * 0.3;
    let r = 77, gr = 140, b = 59;
    if (n > 0.55) { const a = (n - 0.55) * 0.5; r += (110 - r) * a; gr += (170 - gr) * a; b += (80 - b) * a; }
    else if (n < 0.4) { const a = (0.4 - n) * 0.45; r += (20 - r) * a; gr += (50 - gr) * a; b += (15 - b) * a; }
    d[i] = r; d[i + 1] = gr; d[i + 2] = b; d[i + 3] = 255;
  }
  g.putImageData(bild, 0, 0);
  ctx.save(); ctx.imageSmoothingEnabled = true;
  ctx.drawImage(c, 0.5, 0.5, nx + 1, ny + 1, x0 * KACHEL - F / 2, y0 * KACHEL - F / 2, (nx + 1) * F, (ny + 1) * F);
  ctx.restore();
}

const begehbarWiese = t => t === T.WIESE || t === T.BAUM;

// ---------- Bäume: Kronen je Baumgruppe (Kronen in eigener Ebene, Schatten und Stamm im Boden) ----------
// Die Baumkacheln (je 4 m) bleiben, wie sie sind (Kollision, Sicht, Tempo); nur die Darstellung fasst sie zusammen:
//  - Baumkacheln mit 4er-Nachbarschaft bilden eine Gruppe (gezählt bis BAUM_GRUPPE_MAX Kacheln, reicht für „Wald“).
//  - Schachbrett-Regel: auf jeder Kachel mit (kx + ky) gerade steht ein Baum, auf den anderen nur, wenn die Kachel allein steht
//    (keine Baumkachel in 4er-Nachbarschaft). So kommt höchstens ein Baum auf 2 Kacheln (Abstand ≥ 5,7 m), Einzelbäume bleiben Einzelbäume,
//    Wälder bleiben dicht; Versatz ±0,5 m und Größe per Hash (deterministisch, unabhängig vom Kartenstück).
//  - Kronendurchmesser je nach Gruppengröße: Einzelbaum 4–5,5 m, Paar/Dreier 4,5–6,5 m, Gruppe 5–7 m, Wald 5,5–7,5 m (8 px = 1 m).
// Luftbild-Boden: das Foto zeigt die Bäume – dann nur kleine Stamm-/Schattenpunkte je Baumkachel (zeichneBaumMarker), keine Kronen.
const BAUM_RAND = 3;   // Kacheln: so weit ragen Kronen über ihre Kachel (und damit über Stückgrenzen) hinaus
export const BAUM_GRUPPE_MAX = 24;
// Größe der Baumgruppe (4er-Nachbarschaft) von Kachel kx,ky aus, höchstens BAUM_GRUPPE_MAX; je Welt gemerkt
export function baumGruppe(welt, kx, ky) {
  const memo = welt._baumGruppe ??= new Map(), k0 = ky * 100000 + kx;
  const m = memo.get(k0); if (m) return m;
  const besucht = new Set([k0]), q = [[kx, ky]];
  for (let i = 0; i < q.length && besucht.size < BAUM_GRUPPE_MAX; i++) {
    const [x, y] = q[i];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const k = (y + dy) * 100000 + x + dx;
      if (besucht.has(k) || welt.hole(x + dx, y + dy) !== T.BAUM) continue;
      besucht.add(k); q.push([x + dx, y + dy]);
      if (besucht.size >= BAUM_GRUPPE_MAX) break;
    }
  }
  const n = besucht.size;
  if (n < BAUM_GRUPPE_MAX) for (const k of besucht) memo.set(k, n); else memo.set(k0, n);
  return n;
}
// Krone für Kachel kx,ky in einer Gruppe der Größe n (Meter: gr/8)
export function baumVon(kx, ky, n = 1) {
  const h = hash(kx * 31, ky * 17);
  const art = h < 0.62 ? 'baum_gross' : h < 0.82 ? 'baum_klein' : h < 0.93 ? 'baum_herbst' : 'baum_herbst_klein';
  const r = hash(kx * 7 + 3, ky * 11 + 5);
  const [von, spanne] = n <= 1 ? [4, 1.5] : n <= 3 ? [4.5, 2] : n < 12 ? [5, 2] : [5.5, 2];
  const gr = (von + r * spanne) * 8;
  const jx = (hash(kx * 13 + 1, ky * 5 + 7) - 0.5) * 8, jy = (hash(kx * 3 + 11, ky * 19 + 2) - 0.5) * 8;   // ±0,5 m
  return { art, gr, x: kx * KACHEL + KACHEL / 2 + jx, y: ky * KACHEL + KACHEL / 2 + jy, dreh: hash(ky, kx) * Math.PI * 2 };
}
// Einzelbäume aus dem Luftbild (welt.baeumeEcht: { x, y, d (Kronendurchmesser m), art 'laub'|'nadel' }, nur innerhalb der ausgewerteten Fenster
// welt.baeumeFenster): dort genau eine Krone je Eintrag in echter Größe d. Baumkacheln im Fenster, die keine dieser Kronen deckt (z. B. OSM-Bäume),
// und alle Kacheln außerhalb der Fenster bleiben bei der Baumgruppen-Regel.
const ECHT_ZELLE = 96;
function echtIndex(welt) {
  if (welt._echtIdx) return welt._echtIdx;
  const m = new Map();
  for (const b of welt.baeumeEcht) {
    const k = Math.floor(b.x / ECHT_ZELLE) + ',' + Math.floor(b.y / ECHT_ZELLE);
    (m.get(k) ?? m.set(k, []).get(k)).push(b);
  }
  return (welt._echtIdx = m);
}
export function echtGr(b) { return Math.max(16, Math.min(240, b.d * 8)); }
// Deckt eine echte Krone die Mitte der Kachel kx,ky (Kachel liegt im ausgewerteten Fenster)?
function echtDeckt(welt, kx, ky) {
  const x = (kx + 0.5) * KACHEL, y = (ky + 0.5) * KACHEL;
  if (!imGebiet(welt.baeumeFenster, x, y)) return false;
  const m = echtIndex(welt), cx = Math.floor(x / ECHT_ZELLE), cy = Math.floor(y / ECHT_ZELLE);
  for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) for (const b of m.get((cx + i) + ',' + (cy + j)) ?? []) {
    const r = echtGr(b) / 2 + KACHEL / 2;
    if ((b.x - x) ** 2 + (b.y - y) ** 2 <= r * r) return true;
  }
  return false;
}
function echtKrone(b) {
  const kx = Math.floor(b.x / KACHEL), ky = Math.floor(b.y / KACHEL), h = hash(Math.round(b.x) * 7 + 3, Math.round(b.y) * 11 + 5);
  const art = b.art === 'nadel' ? 'nadel' : h < 0.7 ? 'baum_gross' : h < 0.88 ? 'baum_klein' : 'baum_herbst';
  return { art, gr: echtGr(b), x: b.x, y: b.y, dreh: hash(ky + 5, kx + 9) * Math.PI * 2, echt: true };
}
// Alle Kronen im Ausschnitt (auch aus Nachbarstücken, die hineinragen)
export function baumKronen(welt, rect) {
  const l = [];
  const echt = !!welt.baeumeEcht?.length;
  for (let ky = Math.max(0, rect.y0 - BAUM_RAND); ky < Math.min(HOEHE, rect.y1 + BAUM_RAND); ky++) for (let kx = Math.max(0, rect.x0 - BAUM_RAND); kx < Math.min(BREITE, rect.x1 + BAUM_RAND); kx++) {
    if (welt.hole(kx, ky) !== T.BAUM) continue;
    if (echt && echtDeckt(welt, kx, ky)) continue;
    if (((kx + ky) & 1) === 0 || (welt.hole(kx - 1, ky) !== T.BAUM && welt.hole(kx + 1, ky) !== T.BAUM && welt.hole(kx, ky - 1) !== T.BAUM && welt.hole(kx, ky + 1) !== T.BAUM)) l.push(baumVon(kx, ky, baumGruppe(welt, kx, ky)));
  }
  if (echt) {
    const x0 = (rect.x0 - BAUM_RAND) * KACHEL, y0 = (rect.y0 - BAUM_RAND) * KACHEL, x1 = (rect.x1 + BAUM_RAND) * KACHEL, y1 = (rect.y1 + BAUM_RAND) * KACHEL;
    for (const b of welt.baeumeEcht) { const r = echtGr(b) / 2; if (b.x + r >= x0 && b.x - r <= x1 && b.y + r >= y0 && b.y - r <= y1) l.push(echtKrone(b)); }
  }
  return l;
}
// Baumkacheln im Ausschnitt (für Hinweise im Luftbild-Modus): ohne die von echten Kronen gedeckten (die bekommen einen Stammpunkt am echten Stamm)
function baumKachelListe(welt, rect) {
  const l = [], echt = !!welt.baeumeEcht?.length;
  for (let ky = Math.max(0, rect.y0); ky < Math.min(HOEHE, rect.y1); ky++) for (let kx = Math.max(0, rect.x0); kx < Math.min(BREITE, rect.x1); kx++) if (welt.hole(kx, ky) === T.BAUM && !(echt && echtDeckt(welt, kx, ky))) l.push([kx, ky]);
  return l;
}
// Stammpunkte der echten Bäume im Ausschnitt (Luftbild-Modus)
function echtStaemme(welt, rect) {
  if (!welt.baeumeEcht?.length) return [];
  return welt.baeumeEcht.filter(b => b.x >= rect.x0 * KACHEL - 8 && b.x < rect.x1 * KACHEL + 8 && b.y >= rect.y0 * KACHEL - 8 && b.y < rect.y1 * KACHEL + 8);
}
export function hatBaeume(welt, rect) { return baumKronen(welt, rect).length > 0; }
// Kronen eines Kartenstücks; Bild wird später halbtransparent über den Figuren gezeigt
export function zeichneKronen(ctx, welt, bilder, rect) {
  ctx.save();
  ctx.translate(-rect.x0 * KACHEL, -rect.y0 * KACHEL);
  for (const b of baumKronen(welt, rect).sort((a, c) => a.y - c.y)) {
    if (b.art === 'nadel') { nadelKrone(ctx, b); continue; }
    const bild = bilder[b.art];
    if (!bild) continue;
    ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.dreh); ctx.drawImage(bild, -b.gr / 2, -b.gr / 2, b.gr, b.gr); ctx.restore();
  }
  ctx.restore();
}
// Nadelbaum von oben (kein Bild vorhanden): dunkle Krone aus Zackenringen, Spitze in der Mitte
function nadelKrone(ctx, b) {
  const r = b.gr / 2, zacken = 11;
  ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.dreh);
  for (const [f, farbe] of [[1, '#1f4a2a'], [0.74, '#27603a'], [0.48, '#31764a'], [0.22, '#4a9460']]) {
    ctx.fillStyle = farbe; ctx.beginPath();
    for (let i = 0; i < zacken * 2; i++) { const w = i * Math.PI / zacken, rr = r * f * (i % 2 ? 0.72 : 1); ctx.lineTo(Math.cos(w) * rr, Math.sin(w) * rr); }
    ctx.closePath(); ctx.fill();
  }
  ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.beginPath(); ctx.arc(-r * 0.12, -r * 0.12, r * 0.12, 0, TAU); ctx.fill();
  ctx.restore();
}
// Schatten und kleiner Stamm in der Bodenebene
function zeichneBaumSockel(ctx, welt, rect) {
  for (const b of baumKronen(welt, rect)) {
    ctx.fillStyle = 'rgba(0,0,0,.22)'; ctx.beginPath(); ctx.ellipse(b.x + 5, b.y + 6, b.gr / 2, b.gr / 2.3, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#4e342e'; ctx.beginPath(); ctx.arc(b.x, b.y, 3.2, 0, TAU); ctx.fill();
    ctx.fillStyle = '#6d4c41'; ctx.beginPath(); ctx.arc(b.x - 0.8, b.y - 0.8, 1.8, 0, TAU); ctx.fill();
  }
}
// Luftbild-Boden: das Foto zeigt die Bäume; je Baumkachel nur ein dezenter Stamm-/Schattenpunkt, damit man die Baumfläche (langsamer, Sicht verdeckt) erkennt
function zeichneBaumMarker(ctx, welt, rect) {
  for (const [kx, ky] of baumKachelListe(welt, rect)) {
    const x = kx * KACHEL + 8 + hash(kx * 5 + 2, ky * 9 + 1) * 16, y = ky * KACHEL + 8 + hash(kx * 11 + 4, ky * 3 + 8) * 16;
    ctx.fillStyle = 'rgba(0,0,0,.16)'; ctx.beginPath(); ctx.arc(x + 1.2, y + 1.6, 5, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(78,52,46,.7)'; ctx.beginPath(); ctx.arc(x, y, 2.2, 0, TAU); ctx.fill();
  }
  for (const b of echtStaemme(welt, rect)) {   // echte Bäume: ein Stammpunkt je Baum an x, y
    ctx.fillStyle = 'rgba(0,0,0,.16)'; ctx.beginPath(); ctx.arc(b.x + 1.2, b.y + 1.6, 5, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(78,52,46,.7)'; ctx.beginPath(); ctx.arc(b.x, b.y, 2.2, 0, TAU); ctx.fill();
  }
}

// ---------- Bodenebene: alles Flache ----------

export function zeichneBoden(ctx, welt, rect = null) {
  const { x0, y0, x1, y1 } = rect ?? { x0: 0, y0: 0, x1: BREITE, y1: HOEHE };
  ctx.save();
  ctx.translate(-x0 * KACHEL, -y0 * KACHEL);
  // Wiese als Grundfläche mit Farbwolken: ein Pixel je 8×8-Feld rechnen und weich vergrößert zeichnen
  // (früher ein fillRect je Feld – das waren 16.000 Aufrufe je Kartenstück)
  // Kulisse „Luftbild-Boden“: Foto statt Wiese, Flächen, Straßen, Wasser (fehlt die Bildkachel, bleibt der gezeichnete Boden)
  // Kulisse „Gezeichneter Boden“ (gez): Bildkachel aus amtlichen Nutzungsflächen statt Wiese/Flächen; Straßen, Wasser, Bäume zeichnet das Spiel darüber wie bisher
  const art = kulBodenArt(), bereit = !!art && fotoStatus({ x0, y0, x1, y1 }) === 'bereit';
  const foto = bereit && art === 'foto', gez = bereit && art === 'gez';
  if (bereit) zeichneFoto(ctx, { x0, y0, x1, y1 }); else wiesenWolken(ctx, x0, y0, x1, y1);
  const gras = new Path2D(), blumen = [new Path2D(), new Path2D(), new Path2D(), new Path2D()];
  const vek = !!welt.vektor;
  if (vek && !bereit) zeichneFlaechen(ctx, welt, { x0, y0, x1, y1 });
  for (let ky = y0; ky < y1 && !bereit; ky++) for (let kx = x0; kx < x1; kx++) {
    const t = welt.hole(kx, ky), px = kx * KACHEL, py = ky * KACHEL;
    const nb = (dx, dy) => welt.hole(kx + dx, ky + dy);
    if (vek && (t === T.STRASSE || t === T.PLATZ || t === T.WASSER)) continue;   // Wasser kommt als glatte Fläche (wasser.mjs)   // kommen als glatte Linien/Flächen
    // Gebäude zeigt das Dach nach dem echten Umriss (auch Safe Rooms: ihr Inneres ist ein eigener Innenraum)
    if (vek && (t === T.LEER || t === T.WAND || t === T.BODEN || t === T.TUER)) continue;
    if (t === T.LEER) { ctx.fillStyle = '#5d4a40'; ctx.fillRect(px, py, KACHEL, KACHEL); continue; }
    const gart = welt.details?.garten[ky * BREITE + kx];
    if (gart && gart !== '.' && (t === T.WIESE || t === T.BAUM || t === T.ZAUN)) {
      // gepflegter Rasen: etwas heller, ohne Kachelkanten
      ctx.fillStyle = 'rgba(150,210,95,.13)'; ctx.fillRect(px, py, KACHEL, KACHEL);
    }
    if (begehbarWiese(t) || t === T.ZAUN) {
      // Grasbüschel (gesammelt, am Ende ein einziger Strich)
      for (let k = 0; k < 3; k++) {
        const x = px + hash(kx * 13 + k, ky * 7) * KACHEL, y = py + hash(kx * 7, ky * 13 + k) * KACHEL;
        gras.moveTo(x - 3, y); gras.lineTo(x - 1.5, y - 5); gras.moveTo(x, y); gras.lineTo(x + 0.5, y - 6.5); gras.moveTo(x + 3, y); gras.lineTo(x + 4, y - 4);
      }
      if (hash(kx * 3, ky * 5) < 0.06) {   // Wiesenblumen
        const b = blumen[Math.floor(hash(kx, ky * 9) * 4)], bx = px + hash(kx, ky) * 28 + 2, by = py + hash(ky, kx) * 28 + 2;
        b.moveTo(bx + 1.8, by); b.arc(bx, by, 1.8, 0, TAU);
      }
    }
    if (t === T.STRASSE) {
      const n = hash(kx, ky) * 10;
      ctx.fillStyle = `rgb(${86 + n},${88 + n},${92 + n})`; ctx.fillRect(px, py, KACHEL, KACHEL);
      ctx.fillStyle = 'rgba(0,0,0,.12)';
      for (let k = 0; k < 4; k++) ctx.fillRect(px + hash(kx + k, ky) * 30, py + hash(kx, ky + k) * 30, 2, 2);
      // Randlinie und Bordstein zur Nicht-Straße
      ctx.fillStyle = '#d7d2c4';
      if (nb(-1, 0) !== T.STRASSE && nb(-1, 0) !== T.PLATZ) ctx.fillRect(px, py, 3, KACHEL);
      if (nb(1, 0) !== T.STRASSE && nb(1, 0) !== T.PLATZ) ctx.fillRect(px + KACHEL - 3, py, 3, KACHEL);
      if (nb(0, -1) !== T.STRASSE && nb(0, -1) !== T.PLATZ) ctx.fillRect(px, py, KACHEL, 3);
      if (nb(0, 1) !== T.STRASSE && nb(0, 1) !== T.PLATZ) ctx.fillRect(px, py + KACHEL - 3, KACHEL, 3);
    } else if (t === T.PLATZ) {
      ctx.fillStyle = '#b9ae96'; ctx.fillRect(px, py, KACHEL, KACHEL);
      ctx.strokeStyle = 'rgba(90,80,60,.35)'; ctx.lineWidth = 1;
      for (let r = 0; r < 4; r++) for (let s = 0; s < 4; s++) {
        const off = (r % 2) * 4;
        ctx.strokeRect(px + s * 8 + off - 4 + 0.5, py + r * 8 + 0.5, 8, 8);
      }
    } else if (t === T.WASSER) {
      ctx.fillStyle = '#2a7098'; ctx.fillRect(px, py, KACHEL, KACHEL);
      ctx.strokeStyle = 'rgba(255,255,255,.18)'; ctx.lineWidth = 1.5; ctx.beginPath();
      const wy = py + 8 + hash(kx, ky) * 16, wx = px + hash(ky, kx) * 12;
      ctx.moveTo(wx, wy); ctx.quadraticCurveTo(wx + 5, wy - 3, wx + 10, wy); ctx.quadraticCurveTo(wx + 15, wy + 3, wx + 20, wy);
      ctx.stroke();
      // Ufer: Kiesstreifen zur Landseite
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const n = nb(dx, dy);
        if (n === T.WASSER || n === T.ZAUN) continue;
        ctx.fillStyle = '#d3bf8a';
        if (dx === -1) ctx.fillRect(px, py, 6, KACHEL);
        if (dx === 1) ctx.fillRect(px + KACHEL - 6, py, 6, KACHEL);
        if (dy === -1) ctx.fillRect(px, py, KACHEL, 6);
        if (dy === 1) ctx.fillRect(px, py + KACHEL - 6, KACHEL, 6);
      }
    } else if (t === T.BODEN || t === T.TUER) {
      ctx.fillStyle = t === T.TUER ? '#6d4c41' : '#b08a62'; ctx.fillRect(px, py, KACHEL, KACHEL);
      if (t === T.BODEN) {
        ctx.fillStyle = 'rgba(80,50,25,.35)';
        for (let i = 0; i < 4; i++) ctx.fillRect(px, py + i * 8 + 7, KACHEL, 1);
        ctx.fillRect(px + (ky % 2) * 16 + 8, py, 1, KACHEL);
      }
    } else if (t === T.WAND) {
      ctx.fillStyle = '#efe4d8'; ctx.fillRect(px, py, KACHEL, KACHEL);
      ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.fillRect(px, py + KACHEL - 4, KACHEL, 4);
    } else if (t === T.ZAUN && welt.details && kx > 0 && ky > 0 && kx < BREITE - 1 && ky < HOEHE - 1) {
      // Gartenzäune kommen als geglättete Linien (zaunLinien); sonst Feld für Feld
      if (!welt.details.zaeune) zaunTeil(ctx, welt.details.zaunart[ky * BREITE + kx], px, py, nb, kx, ky);
    } else if (t === T.ZAUN) {
      // Holzzaun: Latten zu den Nachbarzäunen, Pfosten in der Mitte
      const m = KACHEL / 2;
      ctx.fillStyle = 'rgba(0,0,0,.22)';
      if (nb(1, 0) === T.ZAUN) ctx.fillRect(px + m, py + m + 3, m, 4);
      if (nb(0, 1) === T.ZAUN) ctx.fillRect(px + m + 3, py + m, 4, m);
      ctx.fillStyle = '#a1887f';
      if (nb(-1, 0) === T.ZAUN) { ctx.fillRect(px, py + m - 5, m, 3); ctx.fillRect(px, py + m + 1, m, 3); }
      if (nb(1, 0) === T.ZAUN) { ctx.fillRect(px + m, py + m - 5, m, 3); ctx.fillRect(px + m, py + m + 1, m, 3); }
      if (nb(0, -1) === T.ZAUN) { ctx.fillRect(px + m - 5, py, 3, m); ctx.fillRect(px + m + 1, py, 3, m); }
      if (nb(0, 1) === T.ZAUN) { ctx.fillRect(px + m - 5, py + m, 3, m); ctx.fillRect(px + m + 1, py + m, 3, m); }
      ctx.fillStyle = '#5d4037'; ctx.fillRect(px + m - 4, py + m - 4, 8, 8);
      ctx.fillStyle = '#8d6e63'; ctx.fillRect(px + m - 3, py + m - 3, 4, 4);
    }
  }
  ctx.strokeStyle = 'rgba(30,70,25,.55)'; ctx.lineWidth = 1; ctx.stroke(gras);
  ['#fff59d', '#f8bbd0', '#ffffff', '#ce93d8'].forEach((f, i) => { ctx.fillStyle = f; ctx.fill(blumen[i]); });
  if (vek && !foto) zeichneWasser(ctx, welt, { x0, y0, x1, y1 });
  if (vek && !foto) zeichneStrassen(ctx, welt, { x0, y0, x1, y1 });
  if (welt.details?.zaeune) zaunLinien(ctx, welt, { x0, y0, x1, y1 });
  zeichneKollisionsSockel(ctx, welt, { x0, y0, x1, y1 }, foto);
  if (welt.details) gartenObjekte(ctx, welt, { x0, y0, x1, y1 }, false);
  zeichneMuell(ctx, welt, { x0, y0, x1, y1 });
  zeichneSperren(ctx, welt, { x0, y0, x1, y1 });
  zeichneStuetzpunktBoden(ctx, welt, { x0, y0, x1, y1 });
  zeichnePools(ctx, welt, { x0, y0, x1, y1 }, foto);   // Schwimmbecken (Hindernis): halbtransparent über dem Luftbild, sonst deckend
  if (foto) zeichneBaumMarker(ctx, welt, { x0, y0, x1, y1 }); else zeichneBaumSockel(ctx, welt, { x0, y0, x1, y1 });
  // geparkte Autos gehören zum Boden (viele – als eigene Objekte wären sie zu teuer)
  for (const b of welt.behaelter ?? []) {
    if (b.art !== 'auto' || b.x < x0 * KACHEL - 40 || b.x > x1 * KACHEL + 40 || b.y < y0 * KACHEL - 40 || b.y > y1 * KACHEL + 40) continue;
    autoVonOben(ctx, b);
  }
  ctx.restore();
}

// Kulisse „Schatten“: Schatten von Häusern und Bäumen eines Kartenstücks in ein leeres Bild (null, wenn nichts zu zeichnen ist)
export function zeichneSchattenStueck(ctx, B, H, welt, rect) {
  return zeichneSchatten(ctx, B, H, rect, vektorGebaeude(welt), baumKronen(welt, { x0: rect.x0 - 2, y0: rect.y0 - 2, x1: rect.x1 + 12, y1: rect.y1 + 12 }), welt.nebengebaeude ?? []);
}

// ---------- obere Ebene: Bäume und Deko aus dem Prototyp ----------
export function zeichneOben(ctx, welt, bilder = {}, rect = null) {
  const { x0, y0, x1, y1 } = rect ?? { x0: 0, y0: 0, x1: BREITE, y1: HOEHE };
  ctx.save();
  ctx.translate(-x0 * KACHEL, -y0 * KACHEL);
  const z = erzeugeZeichner(ctx);
  const ax0 = Math.max(0, x0 - 2), ay0 = Math.max(0, y0 - 2), ax1 = Math.min(BREITE, x1 + 2), ay1 = Math.min(HOEHE, y1 + 2);
  const imAusschnitt = (x, y, rand = 120) => x >= x0 * KACHEL - rand && x <= x1 * KACHEL + rand && y >= y0 * KACHEL - rand && y <= y1 * KACHEL + rand;
  const dinge = [];   // [y, zeichnen] – nach y sortiert, damit hintere zuerst kommen
  const wiese = (kx, ky, r = 1) => {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (welt.hole(kx + dx, ky + dy) !== T.WIESE) return false;
    return true;
  };
  const mitte = (k) => k * KACHEL + KACHEL / 2;

  for (let ky = ay0; ky < ay1; ky++) for (let kx = ax0; kx < ax1; kx++) {
    const t = welt.hole(kx, ky);
    // Bäume (T.BAUM) kommen in die eigene Kronen-Ebene (zeichneKronen) und in den Boden (Schatten, Stamm)
    if (t === T.STRASSE && (kx + ky * 3) % 9 === 0) {
      // Leitpfosten am Straßenrand
      const rand = welt.hole(kx - 1, ky) === T.WIESE ? -1 : welt.hole(kx + 1, ky) === T.WIESE ? 1 : 0;
      if (rand) dinge.push([mitte(ky), () => z.leitpfosten(mitte(kx) + rand * 14, mitte(ky) + 8)]);
    }
  }

  // Hindernisse und Deko: Lage kommt aus der Karte (welt.deko), damit Server und Browser übereinstimmen
  for (const d of welt.deko ?? []) {
    const { x, y } = d, v = d.v ?? 0.5;
    if (!imAusschnitt(x, y)) continue;
    const klein = (k, fn) => { ctx.save(); ctx.translate(x, y); ctx.scale(k, k); ctx.translate(-x, -y); fn(); ctx.restore(); };   // Maßstab 8 px = 1 m: Bild um (x, y) verkleinern
    const f = {
      biertisch: () => klein(0.45, () => z.biertisch(x, y)),   // Garnitur ~2,2 m
      kuh: () => klein(0.4, () => z.kuh(x, y, v)),               // Kuh ~2,4 m
      heu: () => klein(0.45, () => z.heu(x, y, v)),              // Rundballen ~1,5 m
      traktor: () => traktorVonOben(ctx, x, y),
      bus: () => busVonOben(ctx, x, y, d.senkrecht, v),
      vogelscheuche: () => z.vogelscheuche(x, y),
      hochsitz: () => z.hochsitz(x, y),
      fels: () => bildZeichnen(ctx, bilder[v < 0.5 ? 'fels1' : 'fels2'], x, y, 30, v * 6),
      busch: () => bildZeichnen(ctx, bilder[v < 0.75 ? 'busch' : 'busch_herbst'], x, y, 20, v * 6),   // Busch ~2,5 m
    }[d.art];
    if (f) dinge.push([y, f]);
  }

  // Enten auf der Isar
  let enten = 0;
  for (let ky = 3; ky < HOEHE - 3 && enten < 4; ky += 9) for (let kx = BREITE - 5; kx < BREITE - 1; kx++) {
    if (welt.hole(kx, ky) === T.WASSER && welt.hole(kx - 1, ky) === T.WASSER) {
      const x = mitte(kx), y = mitte(ky);
      dinge.push([y, () => z.ente(x, y, hash(kx, ky))]); enten++; break;
    }
  }

  dinge.sort((a, b) => a[0] - b[0]);
  for (const [, f] of dinge) { ctx.save(); f(); ctx.restore(); }
  zeichneStuetzpunktOben(ctx, welt, { x0, y0, x1, y1 });
  ctx.restore();
}

// ---------- Dächer für einen Kartenausschnitt ----------
const DACH_FARBEN = [['#a1442f', '#8a3826', '#6d2a1c'], ['#8b4513', '#74390f', '#4e260a'], ['#6d6d6d', '#5a5a5a', '#3d3d3d'],
  ['#9c5b3c', '#844b30', '#5d3420'], ['#7a3b2e', '#663126', '#45201a']];

// Dachfläche je Kachel (OSM-Karten mit unregelmäßigen Grundrissen): Farbe je Gebäude, dunklere Traufe am Rand
function dachKachel(ctx, welt, kx, ky, farbe, istDach) {
  const px = kx * KACHEL, py = ky * KACHEL;
  ctx.fillStyle = farbe[0]; ctx.fillRect(px, py, KACHEL, KACHEL);
  ctx.fillStyle = 'rgba(0,0,0,.10)'; for (let i = 4; i < KACHEL; i += 6) ctx.fillRect(px, py + i, KACHEL, 1);
  ctx.fillStyle = farbe[2];
  if (!istDach(kx, ky - 1)) ctx.fillRect(px, py, KACHEL, 3);
  if (!istDach(kx, ky + 1)) { ctx.fillRect(px, py + KACHEL - 3, KACHEL, 3); ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(px + 3, py + KACHEL, KACHEL, 5); ctx.fillStyle = farbe[2]; }
  if (!istDach(kx - 1, ky)) ctx.fillRect(px, py, 3, KACHEL);
  if (!istDach(kx + 1, ky)) { ctx.fillRect(px + KACHEL - 3, py, 3, KACHEL); ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(px + KACHEL, py + 4, 5, KACHEL); }
}

// zusammenhängende Dachflächen erkennen: eine Farbe je Dach (OSM-Gebäude bestehen oft aus mehreren Teilen)
function dachIndex(welt) {
  if (welt._dachNr) return welt._dachNr;
  const nr = new Int32Array(BREITE * HOEHE).fill(-1);
  const safe = new Uint8Array(BREITE * HOEHE);
  for (const h of welt.haeuser) if (h.safe) for (let y = h.y; y < h.y + h.h; y++) for (let x = h.x; x < h.x + h.b; x++) {
    if (x >= 0 && y >= 0 && x < BREITE && y < HOEHE) safe[y * BREITE + x] = 1;
  }
  const istDach = (x, y) => { const t = welt.hole(x, y); return t === T.WAND || t === T.LEER || t === T.TUER; };
  let id = 0;
  for (let y = 0; y < HOEHE; y++) for (let x = 0; x < BREITE; x++) {
    const i = y * BREITE + x;
    if (nr[i] !== -1 || !istDach(x, y)) continue;
    const q = [i]; nr[i] = safe[i] ? -2 : id;
    for (let k = 0; k < q.length; k++) {
      const cx = q[k] % BREITE, cy = (q[k] - cx) / BREITE;
      for (const [nx, ny] of [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]]) {
        const j = ny * BREITE + nx;
        if (nx < 0 || ny < 0 || nx >= BREITE || ny >= HOEHE || nr[j] !== -1 || !istDach(nx, ny)) continue;
        nr[j] = safe[j] ? -2 : id; q.push(j);
      }
    }
    id++;
  }
  welt._dachNr = nr;
  return nr;
}

export function zeichneDaecher(ctx, welt, rect) {
  const { x0, y0, x1, y1 } = rect;
  ctx.save();
  ctx.translate(-x0 * KACHEL, -y0 * KACHEL);
  if (welt.vektor) {
    zeichneVektorDaecher(ctx, welt, rect);
    zeichneNebengebaeude(ctx, welt, rect);   // Garagen, Gartenhäuser (Hindernisse aus dem LoD2-Modell)
    if (welt.details) gartenObjekte(ctx, welt, rect, true);   // Gartenhäuser, Haltestellen
  } else if (welt.karte) {
    const nr = dachIndex(welt);
    const istDach = (x, y) => { const t = welt.hole(x, y); return (t === T.WAND || t === T.LEER || t === T.TUER) && nr[y * BREITE + x] !== -2; };
    for (let ky = Math.max(0, y0 - 1); ky < Math.min(HOEHE, y1 + 1); ky++) for (let kx = Math.max(0, x0 - 1); kx < Math.min(BREITE, x1 + 1); kx++) {
      const t = welt.hole(kx, ky);
      if (t !== T.WAND && t !== T.LEER) continue;
      const n = nr[ky * BREITE + kx];
      if (n === -2) continue;   // Safe Rooms haben ein eigenes, ausblendbares Dach
      dachKachel(ctx, welt, kx, ky, DACH_FARBEN[Math.max(0, n) % DACH_FARBEN.length], istDach);
    }
  } else {
    for (const h of welt.haeuser) {
      if (h.safe || h.x + h.b + 1 < x0 || h.x - 1 > x1 || h.y + h.h + 1 < y0 || h.y - 1 > y1) continue;
      ctx.save(); ctx.translate(h.x * KACHEL - DACH_RAND, h.y * KACHEL - DACH_RAND); zeichneDach(ctx, h, h.nr); ctx.restore();
    }
  }
  ctx.restore();
}

// ausblendbares Dach eines Safe Rooms (Ursprung = Hausecke minus DACH_RAND)
export function zeichneSafeDach(ctx, welt, h) {
  if (!welt.karte) return zeichneDach(ctx, h, h.nr);
  if (welt.vektor && zeichneVektorSafeDach(ctx, welt, h, DACH_RAND)) return;
  ctx.save();
  ctx.translate(DACH_RAND - h.x * KACHEL, DACH_RAND - h.y * KACHEL);
  const inBox = (x, y) => x >= h.x && y >= h.y && x < h.x + h.b && y < h.y + h.h;
  const istDach = (x, y) => inBox(x, y) && [T.WAND, T.BODEN, T.TUER].includes(welt.hole(x, y));
  for (let y = h.y; y < h.y + h.h; y++) for (let x = h.x; x < h.x + h.b; x++) if (istDach(x, y)) dachKachel(ctx, welt, x, y, ['#78909c', '#607d8b', '#37474f'], istDach);
  ctx.restore();
}

// Auto von oben: Karosserie mit Glanz, Front- und Heckscheibe, Dach, Scheinwerfer und Rückleuchten
const AUTO_FARBEN = ['#c62828', '#1565c0', '#eeeeee', '#2e7d32', '#424242', '#f9a825', '#6d4c41', '#90a4ae'];
// Bilder-Autos (client/grafik/autos.webp, tools/autos_schneiden.py); ohne Bild (Server, Tests) bleibt die gezeichnete Fassung
let autoBild = null, autoListe = null;
export function setzeAutoBilder(bild, liste) {
  autoBild = bild && liste?.autos?.length ? bild : null; autoListe = autoBild ? liste : null;
}
// Einträge einer Art (ohne Blaulicht-Bilder); leer, solange kein Bogen geladen ist
export function autoEintraege(art) { return autoListe ? autoListe.autos.filter(a => a.art === art && !a.anim) : []; }
// Blaulicht-Bild 1..3 zum Eintrag e (Polizei, Krankenwagen); sonst e selbst
export function autoAnimEintrag(e, anim) { return autoListe?.autos.find(a => a.art === e.art && a.anim === anim && a.laenge === e.laenge) ?? e; }
// Bild-Auto ohne Drehung mittig bei cx, cy zeichnen (Front nach rechts); die Felder liegen zeilenweise im Bogen
// Das Bild wird auf die echten Maße der Fahrzeugart gebracht (client/masse.mjs, 8 px = 1 m): Länge × Breite des Eintrags → Sollmaß
export function autoSollMass(a) { return fzPx(a.art) ?? [a.laenge, a.breite ?? a.laenge / 2]; }
export function zeichneAutoBild(ctx, a, cx, cy) {
  const m = autoListe.mass ?? 2, bw = autoListe.feldB, bh = autoListe.feldH, sp = autoListe.spalten;
  const [sl, sb] = autoSollMass(a), kx = sl / a.laenge, ky = sb / (a.breite ?? a.laenge / 2);
  ctx.save(); ctx.translate(cx, cy); ctx.scale(kx, ky);
  ctx.drawImage(autoBild, (a.nr % sp) * bw, Math.floor(a.nr / sp) * bh, bw, bh, -bw / m / 2, -bh / m / 2, bw / m, bh / m);
  ctx.restore();
}
function hashText(b) {
  const s = String(b.id ?? ''); let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h ? h : Math.abs(Math.round(b.x) * 7 + Math.round(b.y) * 13);
}
// Variante deterministisch nach Id/Ort und Farbe. Geparkt: PKW und Sportwagen, selten Taxi, Kleinbus oder Transporter – nur,
// wenn sie in die Lücke passen (b.platz 'bucht'/'parkplatz': höchstens PKW-Länge, 'rand' etwas länger). Fahrend (b.vorwaerts): PKW/Sport.
// Polizei, Krankenwagen und Laster stehen nie geparkt. Ohne passendes Bild null (gezeichnete Fassung).
function autoVariante(b) {
  if (!autoListe || b.gezeichnet) return null;
  const h = hashText(b), farbe = (b.farbe ?? 0) % AUTO_FARBEN.length;
  const maxLang = b.vorwaerts || b.platz === 'bucht' || b.platz === 'parkplatz' || b.platz === 'foto' ? 46 : 58;
  let art = h % 11 === 0 ? 'sport' : 'pkw';
  if (!b.vorwaerts) {
    const w = Math.floor(h / 11) % 20;
    if (w === 0 && farbe === 5) art = 'taxi';
    else if (w === 1) art = 'kleinbus';
    else if (w === 2 || w === 3) art = 'transporter';
  } else if (farbe === 5 && h % 3 === 0) art = 'taxi';
  let pool = autoEintraege(art).filter(a => a.laenge <= maxLang);
  if (!pool.length) pool = [...autoEintraege('pkw'), ...autoEintraege('sport')].filter(a => a.laenge <= maxLang);
  if (!pool.length) return null;
  const farbige = pool.filter(a => a.farbe === farbe);
  const wahl = farbige.length && h % 3 !== 0 ? farbige : pool;
  return wahl[Math.floor(h / 220) % wahl.length];
}
// Fahrzeugschatten: fällt wie die Kulisse-Schatten der Häuser in dieselbe WELTrichtung (Sonne fest Südost → Schatten nach Nordwesten),
// nicht im gedrehten Fahrzeugsystem. Versatz einer ca. 1 m hohen Karosserie in Pixeln; Deckkraft ~40 % stärker als früher.
export const FZ_SCHATTEN = { dx: SCHATTEN_JE_M.dx * 1.0, dy: SCHATTEN_JE_M.dy * 1.0, alpha: 0.42 };
// Weltversatz (dx, dy) in das Koordinatensystem umrechnen, das um den Winkel ang gedreht und mit (kx, ky) skaliert ist
function weltVersatz(ang, kx = 1, ky = 1, f = 1) {
  const c = Math.cos(ang), s = Math.sin(ang), dx = FZ_SCHATTEN.dx * f, dy = FZ_SCHATTEN.dy * f;
  return [(c * dx + s * dy) / kx, (-s * dx + c * dy) / ky];
}
export function autoVonOben(ctx, b) {
  const lang = 46, breit = 21, f = AUTO_FARBEN[b.farbe % AUTO_FARBEN.length];
  const bildAuto = autoVariante(b);
  ctx.save();
  ctx.translate(b.x, b.y);
  let ang = 0;
  if (Number.isFinite(b.winkel)) ang = b.winkel;   // längs zur Straße
  else if (b.senkrecht) ang = Math.PI / 2;
  if (!b.vorwaerts && (b.farbe + Math.round(b.x)) % 2) ang += Math.PI;   // mal vorwärts, mal rückwärts geparkt
  ctx.rotate(ang);
  const sAlpha = b.ohneSchatten ? 0 : FZ_SCHATTEN.alpha;
  if (bildAuto) {
    const [l, br] = autoSollMass(bildAuto), [sx, sy] = weltVersatz(ang);
    if (sAlpha) { ctx.fillStyle = `rgba(0,0,0,${sAlpha})`; ctx.beginPath(); ctx.roundRect(-l / 2 + sx, -br / 2 + sy, l, br, 7); ctx.fill(); }
    zeichneAutoBild(ctx, bildAuto, 0, 0);
    ctx.restore();
    return;
  }
  const [zl, zb] = fzPx('pkw'); ctx.scale(zl / lang, zb / breit);   // gezeichnete Fassung (ohne Bildbogen) auf PKW-Maß 4,5 × 2 m
  const rund = (x, y, w, h, r) => { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); };
  if (sAlpha) { const [sx, sy] = weltVersatz(ang, zl / lang, zb / breit); ctx.fillStyle = `rgba(0,0,0,${sAlpha})`; rund(-lang / 2 + sx, -breit / 2 + sy, lang, breit, 7); ctx.fill(); }
  const g = ctx.createLinearGradient(0, -breit / 2, 0, breit / 2);
  g.addColorStop(0, f); g.addColorStop(0.5, f); g.addColorStop(1, 'rgba(0,0,0,.35)');
  ctx.fillStyle = f; rund(-lang / 2, -breit / 2, lang, breit, 7); ctx.fill();
  ctx.fillStyle = g; ctx.globalAlpha = 0.5; ctx.fill(); ctx.globalAlpha = 1;
  ctx.fillStyle = 'rgba(255,255,255,.18)'; rund(-lang / 2 + 4, -breit / 2 + 2, lang - 8, 4, 2); ctx.fill();
  ctx.fillStyle = '#1f2a33';
  rund(lang / 2 - 17, -breit / 2 + 2.5, 7, breit - 5, 2); ctx.fill();    // Frontscheibe
  rund(-lang / 2 + 6, -breit / 2 + 3, 5, breit - 6, 2); ctx.fill();      // Heckscheibe
  ctx.fillStyle = 'rgba(255,255,255,.12)'; rund(-lang / 2 + 12, -breit / 2 + 3, 16, breit - 6, 3); ctx.fill();   // Dach
  ctx.fillStyle = '#fff59d'; ctx.fillRect(lang / 2 - 3, -breit / 2 + 2, 2.5, 4); ctx.fillRect(lang / 2 - 3, breit / 2 - 6, 2.5, 4);
  ctx.fillStyle = '#e53935'; ctx.fillRect(-lang / 2 + 0.5, -breit / 2 + 2, 2, 4); ctx.fillRect(-lang / 2 + 0.5, breit / 2 - 6, 2, 4);
  ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.fillRect(lang / 2 - 20, -breit / 2 - 1, 3, 2); ctx.fillRect(lang / 2 - 20, breit / 2 - 1, 3, 2);   // Spiegel
  ctx.restore();
}

// Gartenzäune: Hecke (h), Holz (z), Metall (m), Mauer (w). Verbunden wird auch schräg, damit treppige Grenzen durchgehen.
function zaunTeil(ctx, art, px, py, nb, kx, ky) {
  const m = KACHEL / 2, cx = px + m, cy = py + m;
  const gerade = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => nb(dx, dy) === T.ZAUN);
  const schraeg = [[1, 1], [1, -1], [-1, 1], [-1, -1]].filter(([dx, dy]) => nb(dx, dy) === T.ZAUN && nb(dx, 0) !== T.ZAUN && nb(0, dy) !== T.ZAUN);
  const ziele = [...gerade.map(([dx, dy]) => [cx + dx * m, cy + dy * m]), ...schraeg.map(([dx, dy]) => [cx + dx * m, cy + dy * m])];
  const linien = (farbe, breite, versatz = 0) => {
    ctx.strokeStyle = farbe; ctx.lineWidth = breite; ctx.lineCap = 'round';
    ctx.beginPath();
    if (!ziele.length) { ctx.moveTo(cx - 6 + versatz, cy + versatz); ctx.lineTo(cx + 6 + versatz, cy + versatz); }
    for (const [zx, zy] of ziele) { ctx.moveTo(cx + versatz, cy + versatz); ctx.lineTo(zx + versatz, zy + versatz); }
    ctx.stroke();
  };
  if (art === 'h') {
    linien('rgba(0,0,0,.22)', 18, 3);
    linien('#2f6b2a', 18);
    ctx.fillStyle = '#3f8a37';
    for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(cx - 6 + hash(kx * 9 + i, ky) * 12, cy - 6 + hash(kx, ky * 9 + i) * 12, 4.5, 0, TAU); ctx.fill(); }
  } else if (art === 'm') {
    linien('rgba(0,0,0,.18)', 3, 2);
    linien('#90a4ae', 2);
    ctx.fillStyle = '#455a64'; ctx.fillRect(cx - 2.5, cy - 2.5, 5, 5);
  } else if (art === 'w') {
    linien('rgba(0,0,0,.25)', 10, 3);
    linien('#8a8580', 10);
    linien('#b5b0a8', 5);
  } else {
    // Holzzaun: zwei Latten und Pfosten
    linien('rgba(0,0,0,.22)', 7, 3);
    linien('#a1887f', 6);
    linien('#8d6e63', 2);
    ctx.fillStyle = '#5d4037'; ctx.fillRect(cx - 3.5, cy - 3.5, 7, 7);
  }
}

// Gartenzäune als glatte Linien (tools/osm_karte.py begradigt die Rastertreppen); Kollision bleibt beim Raster
// Alles, was die Spielfigur blockiert, muss man auch sehen (Superuser-Anzeige „Hindernisse zeigen“ deckte Lücken auf):
//  - Hausumriss: das Kollisionsraster (1 m) folgt dem OSM-Umriss; ein dunkler Mauersockel (±0,75 m um den Umriss, unter dem Dach) zeigt die blockierte Kante
//  - Container: blockieren die ganze 4-m-Kachel, das Bild ist nur ca. 1,5–2 m groß → Stellfläche in Kachelgröße
//  - Luftbild-Boden: Wasserkacheln (langsam begehbar) und der Kartenrand (Zaun) fehlen im Foto bzw. liegen auf dem Raster → dezent einfärben
function zeichneKollisionsSockel(ctx, welt, rect, foto) {
  const K = KACHEL, { x0, y0, x1, y1 } = rect;
  if (welt.vektor?.gebaeude) {
    ctx.save(); ctx.lineJoin = 'round'; ctx.strokeStyle = 'rgba(58,50,45,.55)'; ctx.lineWidth = 12;
    for (const g of welt.vektor.gebaeude) {
      if (g.safe || !g.p || g.x + g.b < x0 - 1 || g.x > x1 + 1 || g.y + g.h < y0 - 1 || g.y > y1 + 1) continue;
      ctx.beginPath(); for (let i = 0; i < g.p.length; i += 2) i ? ctx.lineTo(g.p[i] * K, g.p[i + 1] * K) : ctx.moveTo(g.p[i] * K, g.p[i + 1] * K);
      ctx.closePath(); ctx.stroke();
    }
    ctx.restore();
  }
  for (const c of welt.behaelter ?? []) {   // Container blockieren die ganze Kachel (4 × 4 m), das Bild ist viel kleiner: Stellfläche in Kachelgröße
    if (c.art !== 'container') continue;
    const kx = Math.floor(c.x / K), ky = Math.floor(c.y / K);
    if (kx < x0 - 1 || kx > x1 || ky < y0 - 1 || ky > y1 || welt.hole(kx, ky) !== T.DEKO) continue;
    ctx.fillStyle = 'rgba(35,38,42,.42)'; ctx.fillRect(kx * K + 1, ky * K + 1, K - 2, K - 2);
    ctx.strokeStyle = 'rgba(210,210,200,.45)'; ctx.lineWidth = 1.5; ctx.strokeRect(kx * K + 2, ky * K + 2, K - 4, K - 4);
  }
  if (!foto) return;
  zeichneWasserHauch(ctx, welt, rect);   // glatt statt Kachelraster
  for (let ky = Math.max(0, y0); ky < Math.min(HOEHE, y1); ky++) for (let kx = Math.max(0, x0); kx < Math.min(BREITE, x1); kx++) {
    const t = welt.hole(kx, ky);
    if (t === T.ZAUN && (kx === 0 || ky === 0 || kx === BREITE - 1 || ky === HOEHE - 1)) {
      ctx.fillStyle = 'rgba(52,44,38,.72)'; ctx.fillRect(kx * K, ky * K, K, K);
      ctx.fillStyle = 'rgba(161,136,127,.55)'; ctx.fillRect(kx * K, ky * K + K / 2 - 1.5, K, 3);
    }
  }
}

function zaunLinien(ctx, welt, rect) {
  const K = KACHEL, r = { x0: rect.x0 * K - 40, y0: rect.y0 * K - 40, x1: rect.x1 * K + 40, y1: rect.y1 * K + 40 };
  welt._zaunBox ??= welt.details.zaeune.map(z => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < z.p.length; i += 2) { x0 = Math.min(x0, z.p[i]); x1 = Math.max(x1, z.p[i]); y0 = Math.min(y0, z.p[i + 1]); y1 = Math.max(y1, z.p[i + 1]); }
    return { x0: x0 * K, y0: y0 * K, x1: x1 * K, y1: y1 * K };
  });
  ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  welt.details.zaeune.forEach((z, n) => {
    const b = welt._zaunBox[n];
    if (b.x1 < r.x0 || b.x0 > r.x1 || b.y1 < r.y0 || b.y0 > r.y1) return;
    const pfad = (dx = 0, dy = 0) => { ctx.beginPath(); ctx.moveTo(z.p[0] * K + dx, z.p[1] * K + dy); for (let i = 2; i < z.p.length; i += 2) ctx.lineTo(z.p[i] * K + dx, z.p[i + 1] * K + dy); };
    const strich = (farbe, breite, dx = 0, dy = 0) => { pfad(dx, dy); ctx.strokeStyle = farbe; ctx.lineWidth = breite; ctx.stroke(); };
    // Punkte entlang der Linie (für Pfosten und Blattwerk)
    const entlang = (abstand, f) => {
      for (let i = 0; i + 3 < z.p.length; i += 2) {
        const ax = z.p[i] * K, ay = z.p[i + 1] * K, bx = z.p[i + 2] * K, by = z.p[i + 3] * K, L = Math.hypot(bx - ax, by - ay);
        for (let d = 0; d < L; d += abstand) f(ax + (bx - ax) * d / L, ay + (by - ay) * d / L, n * 31 + i * 7 + d);
      }
      f(z.p.at(-2) * K, z.p.at(-1) * K, n);
    };
    if (z.a !== 'h' && z.a !== 'w') strich('rgba(70,62,50,.3)', 12);   // Grundstreifen in der blockierten Breite (Kollision ±6 px), sonst wäre ein Drahtzaun fast unsichtbar
    if (z.a === 'h') {
      // Hecke ~0,9 m breit (7 px, 8 px = 1 m), glatte Linie; Kollision bleibt breiter (Feinraster)
      const sv = FZ_SCHATTEN.dx * 0.5, sw = FZ_SCHATTEN.dy * 0.5;   // niedrige Hecke: halber Schattenversatz, selbe Weltrichtung wie die Häuser
      strich(`rgba(0,0,0,${FZ_SCHATTEN.alpha * 0.7})`, 7, sv, sw); strich('#2f6b2a', 7);
      ctx.fillStyle = '#3f8a37';
      entlang(5, (x, y, s) => { ctx.beginPath(); ctx.arc(x + (hash(s, 1) - 0.5) * 3, y + (hash(1, s) - 0.5) * 3, 2.4, 0, TAU); ctx.fill(); });
    } else if (z.a === 'm') {
      strich('rgba(0,0,0,.25)', 3, FZ_SCHATTEN.dx * 0.3, FZ_SCHATTEN.dy * 0.3); strich('#90a4ae', 2);
      ctx.fillStyle = '#455a64'; entlang(22, (x, y) => ctx.fillRect(x - 2.5, y - 2.5, 5, 5));
    } else if (z.a === 'w') {
      strich('rgba(0,0,0,.35)', 10, FZ_SCHATTEN.dx * 0.5, FZ_SCHATTEN.dy * 0.5); strich('#8a8580', 10); strich('#b5b0a8', 5);
    } else {
      strich('rgba(0,0,0,.31)', 7, FZ_SCHATTEN.dx * 0.4, FZ_SCHATTEN.dy * 0.4); strich('#a1887f', 6); strich('#8d6e63', 2);
      ctx.fillStyle = '#5d4037'; entlang(18, (x, y) => ctx.fillRect(x - 3.5, y - 3.5, 7, 7));
    }
  });
  ctx.restore();
}

// Gartenausstattung, Bänke, Haltestellen. oben = false: flache Dinge (Boden), true: Dächer (Gartenhaus, Haltestelle)
function gartenObjekte(ctx, welt, rect, oben) {
  const K = KACHEL;
  for (const o of welt.details.objekte) {
    const x = o.x * K, y = o.y * K, b = (o.b ?? 1) * K, h = (o.h ?? 1) * K;
    if (x + b < rect.x0 * K - 60 || x > rect.x1 * K + 60 || y + h < rect.y0 * K - 60 || y > rect.y1 * K + 60) continue;
    ctx.save();
    if (!oben && o.a === 'pool') {
      ctx.fillStyle = '#d7d2c8'; ctx.fillRect(x + 2, y + 2, b - 4, h - 4);
      const g = ctx.createLinearGradient(x, y, x + b, y + h); g.addColorStop(0, '#4fc3f7'); g.addColorStop(1, '#0288d1');
      ctx.fillStyle = g; ctx.fillRect(x + 6, y + 6, b - 12, h - 12);
      ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.lineWidth = 1.5;
      for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(x + 10 + i * 14, y + 14 + i * 9); ctx.quadraticCurveTo(x + 16 + i * 14, y + 10 + i * 9, x + 22 + i * 14, y + 14 + i * 9); ctx.stroke(); }
    } else if (!oben && o.a === 'trampolin') {
      ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.arc(x + 19, y + 20, 14, 0, TAU); ctx.fill();
      ctx.fillStyle = '#1565c0'; ctx.beginPath(); ctx.arc(x + 16, y + 16, 14, 0, TAU); ctx.fill();
      ctx.fillStyle = '#212121'; ctx.beginPath(); ctx.arc(x + 16, y + 16, 11, 0, TAU); ctx.fill();
    } else if (!oben && o.a === 'beet') {
      ctx.fillStyle = '#6d4c41'; ctx.fillRect(x + 3, y + 5, b - 6, h - 10);
      for (let i = 0; i < 10; i++) {
        ctx.fillStyle = ['#e53935', '#fdd835', '#ab47bc', '#ffffff', '#43a047'][i % 5];
        ctx.beginPath(); ctx.arc(x + 7 + hash(o.x * 7 + i, o.y) * (b - 14), y + 9 + hash(o.y * 5 + i, o.x) * (h - 18), 2.6, 0, TAU); ctx.fill();
      }
    } else if (!oben && o.a === 'sitzgruppe') {
      ctx.fillStyle = 'rgba(0,0,0,.2)'; ctx.beginPath(); ctx.arc(x + 18, y + 18, 9, 0, TAU); ctx.fill();
      ctx.fillStyle = '#eeeeee'; ctx.beginPath(); ctx.arc(x + 16, y + 16, 8, 0, TAU); ctx.fill();
      ctx.fillStyle = '#8d6e63'; for (const [dx, dy] of [[-12, 0], [12, 0], [0, -12], [0, 12]]) ctx.fillRect(x + 13 + dx, y + 13 + dy, 6, 6);
      ctx.fillStyle = '#ef5350'; ctx.beginPath(); ctx.arc(x + 16, y + 16, 3, 0, TAU); ctx.fill();   // Sonnenschirm-Mitte
    } else if (!oben && (o.a === 'bank' || o.a === 'kuebel' || o.a === 'muell')) {
      ctx.translate(x, y); ctx.rotate(o.w ?? 0);
      ctx.scale(o.a === 'bank' ? 0.55 : o.a === 'kuebel' ? 0.45 : 0.6, o.a === 'bank' ? 0.5 : o.a === 'kuebel' ? 0.45 : 0.6);   // Bank 1,8 × 0,5 m, Kübel ~0,8 m, Papierkorb ~0,4 m
      if (o.a === 'bank') { ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(-12, -2, 26, 9); ctx.fillStyle = '#8d6e63'; ctx.fillRect(-13, -4, 26, 8); ctx.fillStyle = '#5d4037'; ctx.fillRect(-13, -4, 26, 2); }
      else if (o.a === 'kuebel') { ctx.fillStyle = '#9e9e9e'; ctx.fillRect(-8, -8, 16, 16); ctx.fillStyle = '#388e3c'; ctx.beginPath(); ctx.arc(0, 0, 7, 0, TAU); ctx.fill(); ctx.fillStyle = '#f06292'; ctx.beginPath(); ctx.arc(2, -2, 2, 0, TAU); ctx.fill(); }
      else { ctx.fillStyle = '#37474f'; ctx.beginPath(); ctx.arc(0, 0, 5, 0, TAU); ctx.fill(); ctx.fillStyle = '#607d8b'; ctx.beginPath(); ctx.arc(0, 0, 3, 0, TAU); ctx.fill(); }
    } else if (oben && o.a === 'gartenhaus') {
      ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.fillRect(x + 4, y + 6, b, h);
      ctx.fillStyle = '#8d6e63'; ctx.fillRect(x - 2, y - 2, b + 4, h + 4);
      ctx.fillStyle = '#a1887f'; ctx.fillRect(x - 2, y - 2, (b + 4) / 2, h + 4);
      ctx.strokeStyle = '#5d4037'; ctx.lineWidth = 1; for (let i = 4; i < h; i += 5) { ctx.beginPath(); ctx.moveTo(x - 2, y + i); ctx.lineTo(x + b + 2, y + i); ctx.stroke(); }
    } else if (oben && o.a === 'haltestelle') {
      ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.fillRect(x - 14, y - 4, 32, 14);
      ctx.fillStyle = 'rgba(180,220,240,.75)'; ctx.fillRect(x - 16, y - 7, 32, 12);
      ctx.strokeStyle = '#455a64'; ctx.lineWidth = 2; ctx.strokeRect(x - 16, y - 7, 32, 12);
      ctx.fillStyle = '#fdd835'; ctx.beginPath(); ctx.arc(x + 20, y - 8, 6, 0, TAU); ctx.fill();
      ctx.fillStyle = '#2e7d32'; ctx.font = 'bold 8px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('H', x + 20, y - 8);
    }
    ctx.restore();
  }
}

function bildZeichnen(ctx, bild, x, y, gr, dreh = 0) {
  if (!bild) return;
  ctx.translate(x, y); ctx.rotate(dreh);
  const f = gr / Math.max(bild.width, bild.height);
  ctx.drawImage(bild, -bild.width * f / 2, -bild.height * f / 2, bild.width * f, bild.height * f);
}

// Traktor von oben (Blickrichtung nach rechts): große Hinterräder, kleine Vorderräder, Kabine
function traktorVonOben(ctx, x, y) {
  ctx.translate(x, y);
  ctx.scale(0.65, 0.42);   // Traktor 4,5 × 2,5 m
  ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(-24, -20, 54, 44);
  ctx.fillStyle = '#212121';
  ctx.fillRect(-22, -24, 20, 9); ctx.fillRect(-22, 15, 20, 9);      // Hinterräder
  ctx.fillRect(12, -18, 12, 6); ctx.fillRect(12, 12, 12, 6);         // Vorderräder
  ctx.fillStyle = '#424242'; for (let i = -20; i < 0; i += 4) { ctx.fillRect(i, -24, 2, 9); ctx.fillRect(i, 15, 2, 9); }
  ctx.fillStyle = '#2e7d32'; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(-18, -14, 44, 28, 5) : ctx.rect(-18, -14, 44, 28); ctx.fill();
  ctx.fillStyle = '#43a047'; ctx.fillRect(4, -9, 20, 18);             // Motorhaube
  ctx.fillStyle = '#1b5e20'; for (let i = 8; i < 22; i += 4) ctx.fillRect(i, -8, 1.5, 16);
  ctx.fillStyle = '#e8f5e9'; ctx.fillRect(-16, -12, 18, 24);          // Kabinendach
  ctx.strokeStyle = '#1b5e20'; ctx.lineWidth = 2; ctx.strokeRect(-16, -12, 18, 24);
  ctx.fillStyle = '#616161'; ctx.beginPath(); ctx.arc(8, -11, 2.5, 0, Math.PI * 2); ctx.fill();   // Auspuff
}

// Bus von oben: lang, mit Fensterreihen und Dachaufbauten
export function busVonOben(ctx, x, y, senkrecht, v, ohneSchatten = false) {
  ctx.translate(x, y);
  if (senkrecht) ctx.rotate(Math.PI / 2);
  const [L, B] = fzPx('bus');   // 12 × 2,7 m
  const farbe = v < 0.5 ? '#c62828' : v < 0.8 ? '#1565c0' : '#f9a825';
  if (!ohneSchatten) { const [sx, sy] = weltVersatz(senkrecht ? Math.PI / 2 : 0); ctx.fillStyle = `rgba(0,0,0,${FZ_SCHATTEN.alpha})`; ctx.fillRect(-L / 2 + sx, -B / 2 + sy, L, B); }
  ctx.fillStyle = farbe; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(-L / 2, -B / 2, L, B, 6) : ctx.rect(-L / 2, -B / 2, L, B); ctx.fill();
  ctx.fillStyle = '#eceff1'; ctx.fillRect(-L / 2 + 6, -B / 2 + 4, L - 12, B - 8);    // helles Dach
  ctx.fillStyle = '#263238';
  for (let i = -L / 2 + 10; i < L / 2 - 14; i += 14) { ctx.fillRect(i, -B / 2 + 1, 10, 3); ctx.fillRect(i, B / 2 - 4, 10, 3); }   // Fenster
  ctx.fillRect(L / 2 - 8, -B / 2 + 4, 5, B - 8);                                     // Frontscheibe
  ctx.fillStyle = '#b0bec5'; ctx.fillRect(-14, -7, 22, 14); ctx.fillRect(-40, -5, 10, 10);   // Klimaanlage, Luke
  ctx.strokeStyle = 'rgba(0,0,0,.4)'; ctx.lineWidth = 1.5; ctx.strokeRect(-L / 2 + 0.75, -B / 2 + 0.75, L - 1.5, B - 1.5);
}

// ---------- Dächer: Häuser aus dem Prototyp, auf unsere Größe skaliert ----------
export const DACH_RAND = 48;   // Platz für Dachüberstand und Schatten rundherum

// Dächer von oben (Gregor: Hausfassaden des Prototyps gefallen nicht) – Walmdach mit Ziegelreihen
export function zeichneDach(ctx, haus, nr) {
  const b = haus.b * KACHEL, h = haus.h * KACHEL;
  const art = haus.safe === 'Sakristei' ? 'kirche' : haus.safe ? 'safe' : 'normal';
  const farben = {
    normal: [['#b5523f', '#9c4030', '#6e2c1f'], ['#a0522d', '#8b4513', '#5d3418']][nr % 2],
    safe: ['#90a4ae', '#78909c', '#455a64'],
    kirche: ['#78858c', '#607078', '#37474f'],
  }[art];
  ctx.save();
  ctx.translate(DACH_RAND, DACH_RAND);
  // Schatten
  ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.fillRect(6, 7, b, h);
  // Dachflächen: oben/unten heller/dunkler, Seiten als Walm
  const f = Math.min(b, h) / 2;
  const flaeche = (pts, farbe) => { ctx.fillStyle = farbe; ctx.beginPath(); ctx.moveTo(...pts[0]); for (const q of pts.slice(1)) ctx.lineTo(...q); ctx.closePath(); ctx.fill(); };
  flaeche([[0, 0], [b, 0], [b - f, f], [f, f]], farbe(0));
  flaeche([[0, h], [b, h], [b - f, h - f], [f, h - f]], farbe(1));
  flaeche([[0, 0], [f, f], [f, h - f], [0, h]], farbe(1));
  flaeche([[b, 0], [b - f, f], [b - f, h - f], [b, h]], farbe(0));
  function farbe(i) { return farben[i]; }
  // Ziegel- bzw. Blechlinien
  ctx.strokeStyle = 'rgba(0,0,0,.18)'; ctx.lineWidth = 1;
  for (let y = 6; y < h; y += 6) {
    const rand = y < h / 2 ? Math.min(y, f) : Math.min(h - y, f);
    ctx.beginPath(); ctx.moveTo(rand, y + 0.5); ctx.lineTo(b - rand, y + 0.5); ctx.stroke();
  }
  // First und Grate
  ctx.strokeStyle = farben[2]; ctx.lineWidth = 3; ctx.beginPath();
  ctx.moveTo(f, f); ctx.lineTo(b - f, f); ctx.lineTo(b - f, h - f); ctx.lineTo(f, h - f); ctx.closePath();
  if (b >= h) { ctx.moveTo(f, h / 2); ctx.lineTo(b - f, h / 2); } else { ctx.moveTo(b / 2, f); ctx.lineTo(b / 2, h - f); }
  ctx.moveTo(0, 0); ctx.lineTo(f, f); ctx.moveTo(b, 0); ctx.lineTo(b - f, f); ctx.moveTo(0, h); ctx.lineTo(f, h - f); ctx.moveTo(b, h); ctx.lineTo(b - f, h - f);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(0,0,0,.45)'; ctx.lineWidth = 1.5; ctx.strokeRect(0.75, 0.75, b - 1.5, h - 1.5);
  if (art === 'kirche') {
    // kleiner Turm mit Zwiebelhaube von oben
    const tx = b - 26, ty = 26;
    ctx.fillStyle = '#efe4d8'; ctx.fillRect(tx - 14, ty - 14, 28, 28);
    ctx.fillStyle = '#2e7d32'; ctx.beginPath(); ctx.arc(tx, ty, 11, 0, TAU); ctx.fill();
    ctx.fillStyle = '#43a047'; ctx.beginPath(); ctx.arc(tx - 3, ty - 3, 5, 0, TAU); ctx.fill();
    ctx.fillStyle = '#ffd54f'; ctx.beginPath(); ctx.arc(tx, ty, 2.5, 0, TAU); ctx.fill();
  } else if (art === 'normal') {
    // Kamin
    const kx = Math.floor(b * (0.25 + hash(nr, 3) * 0.5)), ky = Math.floor(h * 0.3);
    ctx.fillStyle = '#8d6e63'; ctx.fillRect(kx, ky, 10, 10);
    ctx.fillStyle = '#4e342e'; ctx.fillRect(kx + 2, ky + 2, 6, 6);
  }
  // unsere Tür als Vordach
  const tx = (haus.tuer.x - haus.x) * KACHEL, oben = haus.tuer.y === haus.y;
  const ty = oben ? -6 : h - 8;
  ctx.fillStyle = '#3e2723'; ctx.fillRect(tx + 3, ty, KACHEL - 6, 14);
  ctx.fillStyle = '#ffd54f'; ctx.fillRect(tx + 13, oben ? ty : ty + 11, 6, 3);
  ctx.restore();
}

// ---------- Innenräume (Phase B) ----------
const BODEN_FARBEN = {
  flur: ['#cdb38f', 'fliese'], kueche: ['#e0d6c2', 'schach'], bad: ['#9fc3d6', 'fliese'],
  wohnzimmer: ['#a9794d', 'diele'], schlafzimmer: ['#b38559', 'diele'], kinderzimmer: ['#b99062', 'diele'],
  abstellraum: ['#8f8577', 'beton'], kellerraum: ['#7b7b78', 'beton'], heizungsraum: ['#6f6f6c', 'beton'],
  vorratskeller: ['#80786c', 'beton'], dachboden: ['#8a6a48', 'diele'],
};

function zeichneMoebel(ctx, m, opt = {}) {
  if (zeichneMoebelBild(ctx, m, KACHEL, opt)) return;   // Bild (Gemini), falls Bogen geladen und Größe passt
  if (zeichneSafeMoebel(ctx, m, KACHEL)) return;   // Notlager-Möbel der Safe Rooms
  const x = m.x * KACHEL, y = m.y * KACHEL, b = m.b * KACHEL, h = m.h * KACHEL;
  const k = (f, rx, ry, rb, rh, r = 3) => { ctx.fillStyle = f; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(rx, ry, rb, rh, r) : ctx.rect(rx, ry, rb, rh); ctx.fill(); };
  const rand = () => { ctx.strokeStyle = 'rgba(0,0,0,.45)'; ctx.lineWidth = 1.5; ctx.strokeRect(x + 2.5, y + 2.5, b - 5, h - 5); };
  ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(x + 5, y + 6, b - 6, h - 6);
  switch (m.art) {
    case 'regal_lang': {
      k('#8d8d8d', x + 3, y + 2, b - 6, h - 4, 2);
      const waren = ['#e53935', '#fdd835', '#43a047', '#1e88e5', '#fb8c00', '#8e24aa'];
      for (let i = 0; i < 9; i++) { ctx.fillStyle = waren[(m.x * 3 + m.y + i) % waren.length]; ctx.fillRect(x + 6 + (i % 2) * ((b - 12) / 2), y + 5 + Math.floor(i / 2) * ((h - 10) / 5), (b - 14) / 2, (h - 10) / 6); }
      break;
    }
    case 'kasse': k('#5d4037', x + 2, y + 6, b - 4, h - 12, 3); k('#263238', x + b - 22, y + 9, 14, 10, 2); ctx.fillStyle = '#80cbc4'; ctx.fillRect(x + b - 20, y + 11, 10, 4); break;
    case 'bett': k('#6d4c41', x + 2, y + 2, b - 4, h - 4); k('#eceff1', x + 5, y + 5, b - 10, 14); k('#5c8fd6', x + 5, y + 22, b - 10, h - 27); break;
    case 'sofa': k('#6a4f9c', x + 2, y + 2, b - 4, h - 4, 6); k('#8064b8', x + 7, y + 9, b - 14, h - 14, 4); break;
    case 'couchtisch': case 'esstisch': k('#8d6e63', x + 4, y + 4, b - 8, h - 8, 4); k('#a1887f', x + 7, y + 7, b - 14, h - 14, 3); break;
    case 'schrank': case 'alter_schrank': case 'kommode': case 'garderobe':
      k(m.art === 'alter_schrank' ? '#5d4037' : '#795548', x + 2, y + 2, b - 4, h - 4); rand();
      ctx.fillStyle = '#ffd54f'; ctx.fillRect(x + b / 2 - 4, y + h / 2 - 1, 3, 3); ctx.fillRect(x + b / 2 + 1, y + h / 2 - 1, 3, 3); break;
    case 'regal': k('#6d4c41', x + 2, y + 2, b - 4, h - 4); for (let i = 1; i < 4; i++) { ctx.fillStyle = ['#c62828', '#1565c0', '#2e7d32'][i % 3]; ctx.fillRect(x + 6, y + i * h / 4 - 3, b - 12, 5); } break;
    case 'kiste': k('#a1887f', x + 4, y + 4, b - 8, h - 8, 2); ctx.strokeStyle = '#6d4c41'; ctx.lineWidth = 2; ctx.strokeRect(x + 5, y + 5, b - 10, h - 10); ctx.beginPath(); ctx.moveTo(x + 5, y + 5); ctx.lineTo(x + b - 5, y + h - 5); ctx.stroke(); break;
    case 'kuehlschrank': case 'safe_kuehlschrank': k('#eceff1', x + 3, y + 3, b - 6, h - 6); rand(); ctx.fillStyle = '#90a4ae'; ctx.fillRect(x + b - 9, y + 8, 3, h - 16); break;
    case 'herd': k('#cfd8dc', x + 3, y + 3, b - 6, h - 6); ctx.fillStyle = '#37474f'; for (const [a, c] of [[9, 9], [21, 9], [9, 21], [21, 21]]) { ctx.beginPath(); ctx.arc(x + a, y + c, 4, 0, Math.PI * 2); ctx.fill(); } break;
    case 'spuele': case 'waschbecken': k('#eceff1', x + 4, y + 4, b - 8, h - 8, 5); k('#b0bec5', x + 9, y + 9, b - 18, h - 18, 6); break;
    case 'badewanne': k('#fafafa', x + 2, y + 2, b - 4, h - 4, 10); k('#b3e5fc', x + 7, y + 7, b - 14, h - 14, 8); break;
    case 'klo': k('#fafafa', x + 8, y + 4, b - 16, 8, 2); ctx.fillStyle = '#fafafa'; ctx.beginPath(); ctx.ellipse(x + b / 2, y + 20, 8, 9, 0, 0, Math.PI * 2); ctx.fill(); break;
    case 'heizung': k('#b0bec5', x + 2, y + 4, b - 4, h - 8); ctx.fillStyle = '#78909c'; for (let i = 6; i < b - 4; i += 6) ctx.fillRect(x + i, y + 6, 2, h - 12); break;
    default: k('#8d6e63', x + 3, y + 3, b - 6, h - 6); rand();
  }
}

// zeichnet das Innere eines Hauses; Ursprung = obere linke Ecke des Hauses (ox, oy)
export function zeichneInnen(ctx, w) {
  ctx.save();
  ctx.translate(-w.ox * KACHEL, -w.oy * KACHEL);
  const raumAn = (x, y) => w.raeume.find(r => x >= r.x && x < r.x + r.b && y >= r.y && y < r.y + r.h);
  for (let y = w.oy; y < w.oy + w.h; y++) for (let x = w.ox; x < w.ox + w.b; x++) {
    const t = w.hole(x, y), px = x * KACHEL, py = y * KACHEL;
    if (t === T.WAND) {
      ctx.fillStyle = '#4e4038'; ctx.fillRect(px, py, KACHEL, KACHEL);
      ctx.fillStyle = '#6a5a50'; ctx.fillRect(px, py, KACHEL, 5);
      continue;
    }
    const r = raumAn(x, y) ?? raumAn(x, y - 1) ?? raumAn(x - 1, y) ?? { typ: 'flur' };
    const [farbe, muster] = BODEN_FARBEN[r.typ] ?? ['#b08a62', 'diele'];
    ctx.fillStyle = farbe; ctx.fillRect(px, py, KACHEL, KACHEL);
    ctx.strokeStyle = 'rgba(0,0,0,.18)'; ctx.lineWidth = 1;
    if (muster === 'diele') { for (let i = 8; i < KACHEL; i += 8) { ctx.beginPath(); ctx.moveTo(px, py + i + 0.5); ctx.lineTo(px + KACHEL, py + i + 0.5); ctx.stroke(); } }
    else if (muster === 'fliese') ctx.strokeRect(px + 0.5, py + 0.5, KACHEL / 2, KACHEL / 2), ctx.strokeRect(px + KACHEL / 2 + 0.5, py + KACHEL / 2 + 0.5, KACHEL / 2 - 1, KACHEL / 2 - 1);
    else if (muster === 'schach') { ctx.fillStyle = 'rgba(0,0,0,.12)'; if ((x + y) % 2) ctx.fillRect(px, py, KACHEL, KACHEL); }
    else { ctx.fillStyle = 'rgba(0,0,0,.06)'; ctx.fillRect(px + ((x * 7) % 20), py + ((y * 11) % 20), 4, 3); }
    if (t === T.AUSGANG) {
      ctx.fillStyle = '#5d4037'; ctx.fillRect(px + 3, py, KACHEL - 6, KACHEL);
      ctx.fillStyle = '#ffd54f'; ctx.font = 'bold 16px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(y === w.oy ? '⬆' : x === w.ox ? '⬅' : x === w.ox + w.b - 1 ? '➡' : '⬇', px + 16, py + 22);
    } else if (t === T.TREPPE_RUNTER || t === T.TREPPE_HOCH) {
      ctx.fillStyle = '#9e9e9e'; ctx.fillRect(px + 2, py + 2, KACHEL - 4, KACHEL - 4);
      ctx.fillStyle = '#616161'; for (let i = 0; i < 5; i++) ctx.fillRect(px + 2, py + 4 + i * 6, KACHEL - 4, 2);
      ctx.fillStyle = '#fff'; ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(t === T.TREPPE_RUNTER ? '▼' : '▲', px + 16, py + 21);
    }
  }
  const istWand = (x, y) => { const t = w.hole(x, y); return t === T.WAND || t === undefined; };
  for (const m of w.moebel) {
    const wand = { oben: false, rechts: false, unten: false, links: false };
    for (let i = 0; i < m.b; i++) { wand.oben ||= istWand(m.x + i, m.y - 1); wand.unten ||= istWand(m.x + i, m.y + m.h); }
    for (let j = 0; j < m.h; j++) { wand.links ||= istWand(m.x - 1, m.y + j); wand.rechts ||= istWand(m.x + m.b, m.y + j); }
    zeichneMoebel(ctx, m, { raumTyp: raumAn(m.x, m.y)?.typ, wand });
  }
  ctx.restore();
}

// ---------- Straßendeko: Mülltonnen, Container, Straßensperren (nur Grafik; Lage kommt aus osmwelt.mjs) ----------

// Mülltonnen in Gruppen an Hauswänden (welt.muell.tonnen) und Container (welt.behaelter, art 'container'), von oben
const TONNEN_FARBE = { grau: ['#6a7075', '#868d92'], gelb: ['#e0b400', '#f6cf2a'], gruen: ['#2e7d3a', '#43a354'], braun: ['#5d4128', '#7a5a3a'], blau: ['#2a5fa8', '#4580cc'] };
function tonneVonOben(ctx, u, v, farbe, rund) {
  const [dunkel, hell] = TONNEN_FARBE[farbe] ?? TONNEN_FARBE.grau;
  ctx.fillStyle = 'rgba(0,0,0,.28)';
  if (rund) { ctx.beginPath(); ctx.arc(u + 1.5, v + 2, 5.2, 0, TAU); ctx.fill(); } else ctx.fillRect(u - 4 + 1.5, v - 5 + 2, 9, 11);
  ctx.fillStyle = dunkel;
  if (rund) { ctx.beginPath(); ctx.arc(u, v, 5.2, 0, TAU); ctx.fill(); } else { ctx.beginPath(); ctx.roundRect(u - 4.5, v - 5.5, 9, 11, 1.8); ctx.fill(); }
  ctx.fillStyle = hell;   // Deckel
  if (rund) { ctx.beginPath(); ctx.arc(u, v, 4.1, 0, TAU); ctx.fill(); } else { ctx.beginPath(); ctx.roundRect(u - 3.6, v - 4.6, 7.2, 9.2, 1.2); ctx.fill(); }
  ctx.fillStyle = dunkel; ctx.fillRect(u - 2, v - 4.3, 4, 1.4);   // Griff
}
function zeichneMuell(ctx, welt, rect) {
  const rand = 60;
  const x0 = rect.x0 * KACHEL - rand, x1 = rect.x1 * KACHEL + rand, y0 = rect.y0 * KACHEL - rand, y1 = rect.y1 * KACHEL + rand;
  for (const g of welt.muell?.tonnen ?? []) {
    if (g.x < x0 || g.x > x1 || g.y < y0 || g.y > y1) continue;
    ctx.save(); ctx.translate(g.x, g.y); ctx.rotate(g.winkel);   // u (x) = vom Haus weg, v (y) = entlang der Wand
    ctx.scale(0.5, 0.5);   // Mülltonne ~0,6 × 0,7 m (240 l)
    g.farben.forEach((f, i) => tonneVonOben(ctx, 0, (i - (g.farben.length - 1) / 2) * 12.5, f, g.rund));
    ctx.restore();
  }
  for (const b of welt.behaelter ?? []) {
    if (b.art === 'einkaufswagen' && b.x >= x0 && b.x <= x1 && b.y >= y0 && b.y <= y1) { zeichneEinkaufswagen(ctx, b); continue; }
    if (b.art !== 'container' || b.x < x0 || b.x > x1 || b.y < y0 || b.y > y1) continue;
    ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.winkel ?? 0);
    ctx.scale(b.typ === 'glas' ? 0.55 : b.typ === 'gross' ? 0.4 : 1, b.typ === 'glas' ? 0.55 : b.typ === 'gross' ? 0.45 : 1);   // Iglu Ø ~1,6 m, Großtonne 1,4 × 1,1 m
    if (b.typ === 'glas') {          // Altglas-Iglu: Kuppel mit Einwurfloch
      const f = { gruen: ['#2e7d3a', '#43a354'], weiss: ['#c9ccd0', '#eceff1'], braun: ['#6b4a2f', '#8a6544'] }[b.farbe] ?? ['#2e7d3a', '#43a354'];
      ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.arc(2, 3, 12.5, 0, TAU); ctx.fill();
      ctx.fillStyle = f[0]; ctx.beginPath(); ctx.arc(0, 0, 12, 0, TAU); ctx.fill();
      ctx.fillStyle = f[1]; ctx.beginPath(); ctx.arc(-1.5, -1.5, 8.6, 0, TAU); ctx.fill();
      ctx.fillStyle = '#212121'; ctx.beginPath(); ctx.arc(3, 3, 3, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(0, 0, 11.6, 0, TAU); ctx.stroke();
    } else if (b.typ === 'gross') {    // Großmülltonne auf Rollen (1100 l)
      const f = TONNEN_FARBE[b.farbe] ?? TONNEN_FARBE.grau;
      ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.fillRect(-13 + 2, -9 + 3, 27, 19);
      ctx.fillStyle = f[0]; ctx.beginPath(); ctx.roundRect(-14, -9.5, 28, 19, 2.5); ctx.fill();
      ctx.fillStyle = f[1]; ctx.beginPath(); ctx.roundRect(-12.5, -8, 25, 16, 1.5); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.fillRect(-12.5, -0.6, 25, 1.2);
      ctx.fillStyle = f[0]; ctx.fillRect(-7, -9.5, 14, 2);
    } else {                          // Mulde / Wertstoffcontainer
      const f = TONNEN_FARBE[b.farbe] ?? TONNEN_FARBE.blau;
      ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.fillRect(-18 + 3, -10 + 4, 36, 21);
      ctx.fillStyle = f[0]; ctx.beginPath(); ctx.roundRect(-18, -10.5, 36, 21, 2); ctx.fill();
      ctx.fillStyle = f[1]; ctx.fillRect(-16, -8.5, 32, 17);
      ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 1.2;
      for (let x = -9; x <= 9; x += 9) { ctx.beginPath(); ctx.moveTo(x, -8.5); ctx.lineTo(x, 8.5); ctx.stroke(); }
      ctx.fillStyle = f[0]; ctx.fillRect(-18, -2, 36, 4);   // Mittelholm
      ctx.fillStyle = '#9e9e9e'; ctx.fillRect(-19, -4, 3, 8); ctx.fillRect(16, -4, 3, 8);   // Haken
    }
    ctx.restore();
  }
}

// Polizeisperre quer über die Fahrbahn: Absperrgitter, Sandsäcke, Warnbaken und ein Streifenwagen (welt.sperren)
function zeichneSperren(ctx, welt, rect) {
  const rand = 90;
  const x0 = rect.x0 * KACHEL - rand, x1 = rect.x1 * KACHEL + rand, y0 = rect.y0 * KACHEL - rand, y1 = rect.y1 * KACHEL + rand;
  for (const s of welt.sperren ?? []) {
    if (s.x < x0 || s.x > x1 || s.y < y0 || s.y > y1) continue;
    ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(s.winkel);   // x = Richtung der Straße, y = quer darüber
    const B = s.breite, seite = s.seite ?? 1;
    // Absperrgitter (rot-weiß) nebeneinander quer über die Fahrbahn
    const n = Math.max(2, Math.round(B / 11)), w = B / n;
    for (let i = 0; i < n; i++) {
      const y = -B / 2 + (i + 0.5) * w, l = w - 1;
      ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.fillRect(0.5, y - w / 2 + 2, 3, l);
      ctx.fillStyle = '#f5f5f5'; ctx.fillRect(-1.5, y - w / 2 + 0.5, 3, l);
      ctx.fillStyle = '#d32f2f'; ctx.fillRect(-1.5, y - w / 2 + 0.5, 3, l / 3); ctx.fillRect(-1.5, y - w / 2 + 0.5 + 2 * l / 3, 3, l / 3);
      ctx.fillStyle = '#546e7a'; ctx.fillRect(-4, y - w / 2 + 1, 8, 1.4); ctx.fillRect(-4, y + w / 2 - 2.4, 8, 1.4);   // Füße
    }
    // Sandsäcke an beiden Enden (zwei unten, einer obenauf)
    for (const e of [-1, 1]) for (let j = 0; j < 3; j++) {
      const y = e * (B / 2 + 3), x = j === 1 ? 0 : (j - 1) * 4.5;
      ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.beginPath(); ctx.roundRect(x - 3 + 1, y - 4 + 1.5, 6, 8, 2); ctx.fill();
      ctx.fillStyle = j === 1 ? '#cdb98a' : '#bfa970'; ctx.beginPath(); ctx.roundRect(x - 3, y - 4 - (j === 1 ? 1.5 : 0), 6, 8, 2); ctx.fill();
    }
    // Warnbaken davor
    for (const e of [-0.32, 0.32]) {
      const x = -seite * 15, y = e * B;
      ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.arc(x + 1.5, y + 1.5, 4.2, 0, TAU); ctx.fill();
      ctx.fillStyle = '#ef6c00'; ctx.beginPath(); ctx.arc(x, y, 4.2, 0, TAU); ctx.fill();
      ctx.fillStyle = '#fafafa'; ctx.beginPath(); ctx.arc(x, y, 2.9, 0, TAU); ctx.fill();
      ctx.fillStyle = '#ef6c00'; ctx.beginPath(); ctx.arc(x, y, 1.4, 0, TAU); ctx.fill();
    }
    // Streifenwagen schräg hinter der Sperre
    ctx.translate(seite * 30, -B * 0.16); ctx.rotate(0.3 * seite); ctx.scale(0.78, 0.76);   // Streifenwagen 4,9 × 2 m
    ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.roundRect(-23 + 3, -10.5 + 4, 46, 21, 7); ctx.fill();
    ctx.fillStyle = '#f2f4f5'; ctx.beginPath(); ctx.roundRect(-23, -10.5, 46, 21, 7); ctx.fill();
    ctx.fillStyle = '#1e5aa8'; ctx.fillRect(-14, -10, 26, 3); ctx.fillRect(-14, 7, 26, 3);
    ctx.fillStyle = '#263238'; ctx.beginPath(); ctx.roundRect(-9, -7.5, 9, 15, 2); ctx.fill(); ctx.fillRect(10, -7, 4, 14);
    ctx.fillStyle = '#e53935'; ctx.fillRect(-4, -7, 2.4, 6); ctx.fillStyle = '#1e88e5'; ctx.fillRect(-4, 1, 2.4, 6);
    ctx.restore();
  }
}

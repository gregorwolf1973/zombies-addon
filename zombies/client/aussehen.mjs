// Aussehen der Welt im Stil des Einzelspieler-Prototyps.
// Die eigentlichen Zeichenfunktionen (Bäume, Häuser, Kühe …) stammen wörtlich aus dem Prototyp
// (proto_grafik.mjs, erzeugt von tools/baue_aussehen.py); hier wird nur unsere Karte darauf abgebildet.
import { KACHEL, BREITE, HOEHE, T } from './welt.mjs';
import { erzeugeZeichner } from './proto_grafik.mjs';

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

const begehbarWiese = t => t === T.WIESE || t === T.BAUM;

// ---------- Bodenebene: alles Flache ----------
export function zeichneBoden(ctx, welt) {
  const W = BREITE * KACHEL, H = HOEHE * KACHEL;
  // Wiese als Grundfläche mit Farbwolken
  ctx.fillStyle = '#4d8c3b';
  ctx.fillRect(0, 0, W, H);
  for (let y = 0; y < H; y += 8) for (let x = 0; x < W; x += 8) {
    const n = rauschen(x / 90, y / 90) * 0.7 + rauschen(x / 23, y / 23) * 0.3;
    if (n > 0.55) { ctx.fillStyle = `rgba(110,170,80,${(n - 0.55) * 0.5})`; ctx.fillRect(x, y, 8, 8); }
    else if (n < 0.4) { ctx.fillStyle = `rgba(20,50,15,${(0.4 - n) * 0.45})`; ctx.fillRect(x, y, 8, 8); }
  }
  for (let ky = 0; ky < HOEHE; ky++) for (let kx = 0; kx < BREITE; kx++) {
    const t = welt.hole(kx, ky), px = kx * KACHEL, py = ky * KACHEL;
    const nb = (dx, dy) => welt.hole(kx + dx, ky + dy);
    if (begehbarWiese(t) || t === T.ZAUN) {
      // Grasbüschel
      ctx.strokeStyle = 'rgba(30,70,25,.55)'; ctx.lineWidth = 1; ctx.beginPath();
      for (let k = 0; k < 3; k++) {
        const x = px + hash(kx * 13 + k, ky * 7) * KACHEL, y = py + hash(kx * 7, ky * 13 + k) * KACHEL;
        ctx.moveTo(x - 3, y); ctx.lineTo(x - 1.5, y - 5); ctx.moveTo(x, y); ctx.lineTo(x + 0.5, y - 6.5); ctx.moveTo(x + 3, y); ctx.lineTo(x + 4, y - 4);
      }
      ctx.stroke();
      if (hash(kx * 3, ky * 5) < 0.06) {   // Wiesenblumen
        ctx.fillStyle = ['#fff59d', '#f8bbd0', '#ffffff', '#ce93d8'][Math.floor(hash(kx, ky * 9) * 4)];
        ctx.beginPath(); ctx.arc(px + hash(kx, ky) * 28 + 2, py + hash(ky, kx) * 28 + 2, 1.8, 0, TAU); ctx.fill();
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
    } else if (t === T.ZAUN) {
      ctx.fillStyle = '#6d4c41';
      const senkrecht = nb(0, -1) === T.ZAUN || nb(0, 1) === T.ZAUN;
      if (senkrecht) { ctx.fillRect(px + 13, py, 4, KACHEL); ctx.fillStyle = '#4e342e'; ctx.fillRect(px + 11, py + 12, 8, 8); }
      else { ctx.fillRect(px, py + 13, KACHEL, 4); ctx.fillStyle = '#4e342e'; ctx.fillRect(px + 12, py + 10, 8, 10); }
    }
  }
}

// ---------- obere Ebene: Bäume und Deko aus dem Prototyp ----------
export function zeichneOben(ctx, welt) {
  const z = erzeugeZeichner(ctx);
  const dinge = [];   // [y, zeichnen] – nach y sortiert, damit hintere zuerst kommen
  const wiese = (kx, ky, r = 1) => {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (welt.hole(kx + dx, ky + dy) !== T.WIESE) return false;
    return true;
  };
  const mitte = (k) => k * KACHEL + KACHEL / 2;

  for (let ky = 0; ky < HOEHE; ky++) for (let kx = 0; kx < BREITE; kx++) {
    const t = welt.hole(kx, ky);
    if (t === T.BAUM) {
      const h = hash(kx * 31, ky * 17);
      const x = mitte(kx), y = mitte(ky) - 8;
      if (h < 0.55) dinge.push([y, () => z.fichte(x, y, 0.62, hash(kx, ky))]);
      else if (h < 0.88) dinge.push([y, () => z.laubbaum(x, y, 0.62, hash(ky, kx))]);
      else dinge.push([y, () => z.birke(x, y, 0.7)]);
    } else if (t === T.WASSER && hash(kx * 5, ky * 3) < 0.25) {
      // Schilf am Ufer
      const land = [[-1, 0], [1, 0]].some(([dx]) => { const n = welt.hole(kx + dx, ky); return n !== T.WASSER && n !== T.ZAUN; });
      if (land) dinge.push([mitte(ky), () => z.schilf(mitte(kx), mitte(ky) + 6, 0.8)]);
    } else if (t === T.STRASSE && (kx + ky * 3) % 9 === 0) {
      // Leitpfosten am Straßenrand
      const rand = welt.hole(kx - 1, ky) === T.WIESE ? -1 : welt.hole(kx + 1, ky) === T.WIESE ? 1 : 0;
      if (rand) dinge.push([mitte(ky), () => z.leitpfosten(mitte(kx) + rand * 14, mitte(ky) + 8)]);
    }
  }

  // Maibaum mitten auf dem Marktplatz, Biertische am Rand
  const m = welt.markt;
  const mx = (m.x + m.b / 2) * KACHEL, my = (m.y + m.h / 2) * KACHEL;
  dinge.push([my, () => z.maibaum(mx, my)]);
  dinge.push([(m.y + 1.5) * KACHEL, () => z.biertisch((m.x + 1.5) * KACHEL, (m.y + 1.5) * KACHEL)]);
  dinge.push([(m.y + m.h - 2) * KACHEL, () => z.biertisch((m.x + m.b - 3) * KACHEL, (m.y + m.h - 2) * KACHEL)]);

  // Deko auf größeren Wiesenflächen: Kühe, Heu, Traktor, Vogelscheuche, Hochsitz, Felsen
  const plaetze = [];
  for (let ky = 2; ky < HOEHE - 2; ky++) for (let kx = 2; kx < BREITE - 8; kx++) {
    if (wiese(kx, ky, 1) && hash(kx * 7, ky * 11) < 0.5) plaetze.push([kx, ky]);
  }
  const genommen = [];
  const nimm = () => {
    for (let versuch = 0; versuch < 400 && plaetze.length; versuch++) {
      const i = Math.floor(hash(versuch * 13 + genommen.length, welt.seed % 9973) * plaetze.length);
      const [kx, ky] = plaetze[i];
      if (genommen.some(([a, b]) => Math.abs(a - kx) < 4 && Math.abs(b - ky) < 4)) continue;
      genommen.push([kx, ky]);
      return [mitte(kx), mitte(ky)];
    }
    return null;
  };
  const setze = (n, f) => { for (let i = 0; i < n; i++) { const p = nimm(); if (p) dinge.push([p[1], () => f(p[0], p[1], i)]); } };
  setze(5, (x, y, i) => z.kuh(x, y, hash(i, 3)));
  setze(4, (x, y, i) => z.heu(x, y, hash(i, 5)));
  setze(1, (x, y) => z.traktor(x, y));
  setze(1, (x, y) => z.vogelscheuche(x, y));
  setze(1, (x, y) => z.hochsitz(x, y));
  setze(3, (x, y, i) => z.fels(x, y, 0.6 + hash(i, 7) * 0.4));
  setze(4, (x, y, i) => z.busch(x, y, 0.7, hash(i, 9)));

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
}

// ---------- Dächer: Häuser aus dem Prototyp, auf unsere Größe skaliert ----------
export const DACH_RAND = 24;   // Platz für Dachüberstand und Schatten rundherum

// Dachfarbe des Prototyps hängt am Hash: passenden Schlüssel suchen (0 rot, 1 braun, 2 grau)
function schluesselFuer(farbe, start) {
  for (let k = start; k < start + 500; k++) if (Math.floor(hash(k, 1) * 3) === farbe) return k / 1000 + 0.0000001;
  return start / 1000;
}

export function zeichneDach(ctx, haus, nr) {
  const z = erzeugeZeichner(ctx);
  const b = haus.b * KACHEL, h = haus.h * KACHEL;
  ctx.save();
  ctx.translate(DACH_RAND, DACH_RAND);
  if (haus.safe === 'Sakristei') {
    // Kirche: 150×110 plus Turm (75 nach oben)
    ctx.save(); ctx.scale(b / 150, h / 185); z.kirche(-20, 55, -9999, -9999); ctx.restore();
  } else {
    ctx.save(); ctx.scale(b / 210, h / 142);
    z.house(-12, -6, schluesselFuer(haus.safe ? 2 : nr % 2, 1000 + nr * 37), -9999, -9999);
    ctx.restore();
  }
  // unsere echte Tür als Vordach markieren (die Fassade des Prototyps zeigt immer nach unten)
  const tx = (haus.tuer.x - haus.x) * KACHEL, oben = haus.tuer.y === haus.y;
  const ty = oben ? -6 : h - 8;
  ctx.fillStyle = '#3e2723'; ctx.fillRect(tx + 3, ty, KACHEL - 6, 12);
  ctx.fillStyle = '#ffd54f'; ctx.fillRect(tx + 13, oben ? ty : ty + 9, 6, 3);
  ctx.restore();
}

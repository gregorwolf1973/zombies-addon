// Darstellung der Walz-Spuren (Regeln: client/walze.mjs, Server: server/walze.mjs): Nachricht 'walze' übernehmen (Feinraster, Kacheln,
// umgewalzte Bäume wie auf dem Server), die betroffenen Kartenstücke neu malen (Zaun bekommt eine Lücke, Krone verschwindet) und darüber
// eine eigene Ebene mit plattgedrückten Zaunresten und umgestürzten Bäumen zeichnen.
import { KACHEL, BREITE, FEIN } from './welt.mjs';
import { walzeAnwenden } from './walze.mjs';
import { stueckeNeuMalen } from './pkwdarstellung.mjs';

const offen = [];   // noch nicht angewendete Nachrichten
export function walzeEmpfangen(m) { if (m && (Array.isArray(m.zaun) || Array.isArray(m.baum))) offen.push(m); }

const hashI = n => { let h = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

// je Bild: offene Änderungen anwenden (sobald die Welt steht), Kartenstücke neu malen, Spurenebene neu zeichnen
export function walzeAbgleich(scene, seed) {
  const welt = scene.welt;
  if (welt && offen.length) {
    const fb = BREITE * FEIN, fp = KACHEL / FEIN, orte = [];
    while (offen.length) {
      const m = offen.shift();
      if (m.seed !== undefined && seed !== undefined && m.seed !== seed) continue;
      walzeAnwenden(welt, m);
      for (const i of m.zaun ?? []) { const fx = i % fb; orte.push([fx * fp, (i - fx) / fb * fp, 12]); }
      for (const b of m.baum ?? []) { orte.push([b.x, b.y, 140]); baumEbeneNeu(scene, b.x, b.y); }
    }
    // jedes betroffene Stück nur einmal neu malen
    const gemacht = new Set();
    for (const [x, y, r] of orte) {
      const k = Math.floor(x / (16 * KACHEL)) + ',' + Math.floor(y / (16 * KACHEL)) + ',' + r;
      if (gemacht.has(k)) continue;
      gemacht.add(k); stueckeNeuMalen(scene, x, y, r);
    }
    scene.walzeStand = -1;
  }
  spurenZeichnen(scene);
}

// Kronen-Ebene (und Schatten) der Stücke um einen umgewalzten Baum verwerfen; chunksAktualisieren baut sie neu (ohne den Baum)
function baumEbeneNeu(scene, x, y) {
  for (const st of scene.stuecke?.values() ?? []) {
    const r = st.rect, R = 140;
    if (x + R < r.x0 * KACHEL || x - R > r.x1 * KACHEL || y + R < r.y0 * KACHEL || y - R > r.y1 * KACHEL) continue;
    if (st.baum) { st.baum.destroy(); if (scene.textures.exists('baum-' + st.key)) scene.textures.remove('baum-' + st.key); }
    st.baum = undefined;
    if (st.schatten) {
      st.schatten.destroy(); st.schatten = null;
      if (scene.textures.exists('schatten-' + st.key)) scene.textures.remove('schatten-' + st.key);
      scene.baueStueckSchatten?.(st);
    }
  }
}

// Spurenebene: Zaunreste und umgestürzte Bäume (nur neu zeichnen, wenn sich etwas geändert hat)
function spurenZeichnen(scene) {
  const welt = scene.welt;
  const n = (welt?.zaunPlatt?.size ?? 0) + (welt?.baeumeWeg?.size ?? 0);
  if (!n) { scene.walzeGfx?.setVisible(false); return; }
  const g = (scene.walzeGfx ??= scene.add.graphics().setDepth(1.07));
  g.setVisible(!scene.aktEbene);
  if (scene.walzeStand === n) return;
  scene.walzeStand = n;
  g.clear();
  const fb = BREITE * FEIN, fp = KACHEL / FEIN, za = welt.details?.zaunart ?? '';
  for (const i of welt.zaunPlatt ?? []) {
    const fx = i % fb, fy = (i - fx) / fb, x = fx * fp + fp / 2, y = fy * fp + fp / 2;
    const art = za[Math.floor(fy / FEIN) * BREITE + Math.floor(fx / FEIN)] || 'z';
    const h1 = hashI(i), h2 = hashI(i + 7919), w = h1 * Math.PI;
    if (art === 'h') {   // zerdrückte Hecke: dunkelgrüne Fetzen, Zweige
      g.fillStyle(0x2e5a28, 0.85).fillEllipse(x + (h2 - 0.5) * 3, y, 7, 4);
      g.fillStyle(0x4a7a3a, 0.8).fillCircle(x + (h1 - 0.5) * 5, y + (h2 - 0.5) * 5, 1.6);
      g.lineStyle(1, 0x4e342e, 0.8).lineBetween(x - Math.cos(w) * 3, y - Math.sin(w) * 3, x + Math.cos(w) * 3, y + Math.sin(w) * 3);
    } else if (art === 'm') {   // plattgedrückter Metallzaun: graue Stäbe flach am Boden
      g.lineStyle(1.2, 0x90a4ae, 0.9).lineBetween(x - Math.cos(w) * 4, y - Math.sin(w) * 4, x + Math.cos(w) * 4, y + Math.sin(w) * 4);
      g.lineStyle(0.8, 0x546e7a, 0.8).lineBetween(x - Math.sin(w) * 3, y + Math.cos(w) * 3, x + Math.sin(w) * 3, y - Math.cos(w) * 3);
    } else {   // Holzzaun: gesplitterte Latten
      g.lineStyle(2, 0x8d6e63, 0.9).lineBetween(x - Math.cos(w) * 4, y - Math.sin(w) * 4, x + Math.cos(w) * 4, y + Math.sin(w) * 4);
      g.lineStyle(1.4, 0x5d4037, 0.8).lineBetween(x - Math.cos(w + 1.2) * 3, y - Math.sin(w + 1.2) * 3, x + Math.cos(w + 1.2) * 2, y + Math.sin(w + 1.2) * 2);
    }
  }
  for (const b of welt.baeumeWeg?.values() ?? []) {   // umgestürzter Baum: Stumpf, Stamm in Fahrtrichtung, Laub am Ende
    const L = Math.max(14, (b.gr ?? 40) * 0.45), c = Math.cos(b.w ?? 0), s = Math.sin(b.w ?? 0);
    g.fillStyle(0x000000, 0.25).fillEllipse(b.x + c * L * 0.6 + 2, b.y + s * L * 0.6 + 2, L * 0.9, L * 0.6);
    g.lineStyle(4, 0x5d4037, 1).lineBetween(b.x, b.y, b.x + c * L, b.y + s * L);
    g.lineStyle(1.5, 0x8d6e63, 0.9).lineBetween(b.x, b.y, b.x + c * L, b.y + s * L);
    g.fillStyle(0x3f6f34, 0.95).fillCircle(b.x + c * L, b.y + s * L, L * 0.32);
    g.fillStyle(0x558b2f, 0.9).fillCircle(b.x + c * (L * 0.8) - s * 3, b.y + s * (L * 0.8) + c * 3, L * 0.24);
    g.fillStyle(0x795548, 1).fillCircle(b.x, b.y, 2.6);
  }
}

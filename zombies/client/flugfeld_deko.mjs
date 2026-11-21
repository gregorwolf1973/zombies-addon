// Flugfeld Königsdorf (Karte mit 'piste'): Deko neben der Landebahn – verlassene Puma und Leopard, S-Draht-Rollen und Tote.
// Welt (Server und Client bauen dasselbe, deterministisch aus dem Seed, nach dem Stützpunkt): welt.flugfeld =
//   { fahrzeuge: [{ art: 'puma'|'leopard', x, y, winkel, turm }], draht: [{ x, y, w, d, winkel, b, h }], tote: [{ x, y, richtung, variante }] }
// Fahrzeuge und Rollen stehen im Feinraster fest (Wert 1); die Tote legt der Server als feste Leichen an (server/haengend.mjs),
// in die Rollen hängen dort auch Zombies. Die Piste (Landebahn und Rollweg) bleibt mit Abstand frei.
import { KACHEL, BREITE, HOEHE, FEIN, FEIN_PX, frei, zufall } from './welt.mjs';
import { PUMA_SKALA, PUMA_BILD, zeichneSDrahtRolle } from './stuetzpunkt.mjs';
import { LEOPARD } from './evak.mjs';

const K = KACHEL, TAU = Math.PI * 2;
export const FLUGFELD_PUMA = { laenge: 72, breite: 34 };       // Wanne wie im Lager (gezeichnet 1,6-fach: 115 × 54 px)
export const FLUGFELD_TOTE = 40;
const PUMA_HL = FLUGFELD_PUMA.laenge * PUMA_SKALA / 2, PUMA_HB = FLUGFELD_PUMA.breite * PUMA_SKALA / 2;
const DRAHT_L = 4 * K, DRAHT_D = 13;

// orientiertes Rechteck (Mitte, Winkel, halbe Länge/Breite) im Feinraster auf Wert 1 setzen
function feinRechteck(welt, x, y, winkel, hl, hb) {
  const f = welt.fein, fb = BREITE * FEIN, fh = HOEHE * FEIN, c = Math.cos(winkel), s = Math.sin(winkel), r = Math.hypot(hl, hb) + 2;
  for (let fy = Math.max(0, Math.floor((y - r) / FEIN_PX)); fy <= Math.min(fh - 1, Math.floor((y + r) / FEIN_PX)); fy++) {
    for (let fx = Math.max(0, Math.floor((x - r) / FEIN_PX)); fx <= Math.min(fb - 1, Math.floor((x + r) / FEIN_PX)); fx++) {
      const dx = (fx + 0.5) * FEIN_PX - x, dy = (fy + 0.5) * FEIN_PX - y, u = dx * c + dy * s, v = -dx * s + dy * c;
      if (Math.abs(u) <= hl + 1 && Math.abs(v) <= hb + 1) f[fy * fb + fx] = 1;
    }
  }
}

export function baueFlugfeldDeko(welt, seed) {
  welt.flugfeld = null;
  const pi = welt.piste;
  if (!pi || !welt.fein) return;
  const rnd = zufall((seed ^ 0x5f3d7a1) >>> 0);
  // Abstand (Kacheln) eines Punkts (Pixel) von Landebahn-Mittellinie bzw. Rollweg, abzüglich ihrer halben Breite
  const segAbstand = (px, py, [ax, ay], [bx, by]) => {
    const dx = bx - ax, dy = by - ay, t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
    return Math.hypot(px - ax - t * dx, py - ay - t * dy);
  };
  const pistenAbstand = (x, y) => {
    const px = x / K, py = y / K;
    let m = segAbstand(px, py, [pi.x0, pi.y0], [pi.x1, pi.y1]) - pi.b / 2;
    for (const q of pi.rollweg ?? []) for (let i = 0; i + 1 < q.length; i++) m = Math.min(m, segAbstand(px, py, q[i], q[i + 1]) - pi.rb / 2);
    return m;
  };
  const SPIELRAUM = 2.5;   // Kacheln Abstand zur Piste und zu Türen/Häusern
  const nahHaus = (x, y) => welt.haeuser.some(h => x > (h.x - SPIELRAUM) * K && x < (h.x + h.b + SPIELRAUM) * K && y > (h.y - SPIELRAUM) * K && y < (h.y + h.h + SPIELRAUM) * K);
  const ok = (x, y, r) => frei(welt, x, y, r) && pistenAbstand(x, y) > SPIELRAUM && !nahHaus(x, y);
  // Mitte der Deko: vor dem Hangar (Ende des Rollwegs), weiter weg von der Piste (südlich des Rollwegs, Wiese)
  const rw = pi.rollweg?.[0], ende = rw ? rw[rw.length - 1] : [pi.x0 + (pi.x1 - pi.x0) * 0.5, pi.y0];
  const mx = (ende[0] - 0.5) * K, my = (ende[1] + 17) * K, RX = 15 * K, RY = 6 * K;
  const punkt = () => { const a = rnd() * TAU, d = Math.sqrt(rnd()); return [mx + Math.cos(a) * d * RX, my + Math.sin(a) * d * RY]; };
  const fahrzeuge = [], draht = [], tote = [];
  const abstandZuAllen = (x, y, min) => fahrzeuge.every(q => Math.hypot(q.x - x, q.y - y) > min) && draht.every(q => Math.hypot(q.x - x, q.y - y) > min * 0.7);
  // 1. Fahrzeuge: je zwei Puma und Leopard, Wannen nach der Piste ausgerichtet (± etwas), Türme schräg verdreht
  const pisteW = Math.atan2(pi.y1 - pi.y0, pi.x1 - pi.x0);
  for (const art of ['leopard', 'puma', 'leopard', 'puma']) {
    const hl = art === 'puma' ? PUMA_HL : LEOPARD.laenge / 2, hb = art === 'puma' ? PUMA_HB : LEOPARD.breite / 2;
    for (let versuch = 0; versuch < 400; versuch++) {
      const [x, y] = punkt(), winkel = pisteW + (rnd() - 0.5) * 1.6 + (rnd() < 0.5 ? 0 : Math.PI);
      if (!abstandZuAllen(x, y, 4.5 * K)) continue;
      const c = Math.cos(winkel), s = Math.sin(winkel);
      const pkt = [[hl, hb], [hl, -hb], [-hl, hb], [-hl, -hb], [0, 0]].every(([u, v]) => ok(x + c * u - s * v, y + s * u + c * v, 8));
      if (!pkt) continue;
      fahrzeuge.push({ art, x, y, winkel, turm: winkel + (rnd() < 0.5 ? 1 : -1) * (0.35 + rnd() * 0.7) });
      feinRechteck(welt, x, y, winkel, hl, hb);
      break;
    }
  }
  // 2. vier S-Draht-Rollen (4 Kacheln lang), nahe der Fahrzeuge
  for (let n = 0; n < 4; n++) {
    for (let versuch = 0; versuch < 400; versuch++) {
      const [x, y] = punkt(), winkel = rnd() * Math.PI;
      if (!abstandZuAllen(x, y, 3.5 * K)) continue;
      const c = Math.cos(winkel), s = Math.sin(winkel);
      if (![-0.5, -0.25, 0, 0.25, 0.5].every(a => ok(x + c * a * DRAHT_L, y + s * a * DRAHT_L, 8))) continue;
      const t = { x, y, w: DRAHT_L, d: DRAHT_D, winkel, b: Math.abs(c) * DRAHT_L + Math.abs(s) * DRAHT_D, h: Math.abs(s) * DRAHT_L + Math.abs(c) * DRAHT_D };
      draht.push(t);
      feinRechteck(welt, x, y, winkel, DRAHT_L / 2, DRAHT_D / 2);
      break;
    }
  }
  // 3. Tote in Gruppen: um Fahrzeuge (je 5–6), um den Draht (je 3), der Rest verstreut – nur auf frei begehbaren Stellen
  const lege = (cx, cy, rmin, rmax) => {
    for (let versuch = 0; versuch < 40; versuch++) {
      const a = rnd() * TAU, d = rmin + rnd() * (rmax - rmin), x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d;
      if (!ok(x, y, 9) || tote.some(q => Math.hypot(q.x - x, q.y - y) < 17)) continue;
      tote.push({ x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, richtung: Math.round(rnd() * TAU * 100) / 100, variante: Math.floor(rnd() * 25) });
      return true;
    }
    return false;
  };
  for (const q of fahrzeuge) for (let i = 0; i < 5 + (rnd() < 0.5 ? 1 : 0); i++) lege(q.x, q.y, 52, 105);
  for (const q of draht) for (let i = 0; i < 3; i++) lege(q.x, q.y, 22, 70);
  for (let versuch = 0; tote.length < FLUGFELD_TOTE && versuch < 300; versuch++) { const [x, y] = punkt(); lege(x, y, 0, 40); }
  welt.flugfeld = { fahrzeuge, draht, tote };
}

// ---------- Darstellung (Phaser): Fahrzeuge (dunkler, verdreckt, Turm schräg) und Drahtrollen ----------
export function zeichneFlugfeldDeko(scene) {
  const ff = scene.welt.flugfeld;
  if (!ff) return;
  for (const q of ff.fahrzeuge) {
    if (q.art === 'puma' && scene.textures.exists('puma-wanne-bild')) {
      const m = scene.pumaMasse(FLUGFELD_PUMA.laenge), tb = scene.textures.get('puma-turm').getSourceImage(), k = PUMA_SKALA * m.f;
      const c = Math.cos(q.winkel), s = Math.sin(q.winkel), vx = PUMA_BILD.turmX * k, vy = PUMA_BILD.turmY * k;
      scene.add.image(q.x, q.y, 'puma-wanne').setRotation(q.winkel).setScale(PUMA_SKALA * m.skala).setDepth(4.9).setTint(0x8a8672);
      scene.add.image(q.x + c * vx - s * vy, q.y + s * vx + c * vy, 'puma-turm').setOrigin((PUMA_BILD.turmMx + m.R) / tb.width, (PUMA_BILD.turmMy + m.R) / tb.height)
        .setRotation(q.turm).setScale(PUMA_SKALA * m.skala).setDepth(5).setTint(0x8a8672);
    } else if (q.art === 'leopard' && scene.textures.exists('leopard-wanne')) {
      const c = Math.cos(q.winkel), s = Math.sin(q.winkel);
      scene.add.image(q.x, q.y, 'leopard-wanne').setRotation(q.winkel).setScale(LEOPARD.skala).setDepth(4.9).setTint(0x7f7b66);
      scene.add.image(q.x + c * LEOPARD.turmX, q.y + s * LEOPARD.turmX, 'leopard-turm').setOrigin(LEOPARD.turmOx, LEOPARD.turmOy)
        .setRotation(q.turm).setScale(LEOPARD.skala).setDepth(5).setTint(0x7f7b66);
    }
  }
  ff.draht.forEach((t, i) => {
    const schluessel = 'ff-draht-' + i, B = Math.ceil(t.w + 20), H = Math.ceil(t.d + 24);
    if (!scene.textures.exists(schluessel)) {
      const tex = scene.textures.createCanvas(schluessel, B, H), ctx = tex.getContext();
      ctx.translate(B / 2, H / 2); zeichneSDrahtRolle(ctx, t.w, t.d); tex.refresh();
    }
    scene.add.image(t.x, t.y, schluessel).setRotation(t.winkel).setDepth(4.8);
  });
}

// Rauch, Staub und Feuerball der Leopard-Hauptkanone (nur Darstellung, 8 px = 1 m).
// Alle Partikel liegen in einer festen Liste (Pool, höchstens RAUCH_MAX gleichzeitig, kein neues Objekt pro Frame);
// ist sie voll, wird das älteste Teilchen überschrieben. Mehrere Schüsse kurz nacheinander verdichten den Rauch (Deckkraft steigt mit der Menge).
// Die Logik (Streuen, Bewegen) ist von Phaser getrennt und einzeln testbar; `RauchZeichner` hängt sie an eine Phaser-Szene.
import { weichTextur, weichSkala, WEICH_SCHLUESSEL } from './weichkreis.mjs';
export const RAUCH_MAX = 170;   // mehr, dafür kleinere und weichere Teilchen (0.89)
const PX = 8;
const FEIN = 0.55;              // Teilchen-Radien gegenüber früher

export class RauchPool {
  constructor(max = RAUCH_MAX, zufall = Math.random) {
    this.zufall = zufall;
    this.p = Array.from({ length: max }, () => ({ an: false, art: 0, x: 0, y: 0, vx: 0, vy: 0, d: 0, r0: 0, r1: 0, a0: 0, t: 0, T: 1, bremse: 0 }));
  }
  aktiv() { let n = 0; for (const q of this.p) if (q.an) n++; return n; }
  // freien Platz nehmen, sonst das Teilchen mit der längsten Laufzeit überschreiben
  neu(art, x, y, vx, vy, r0, r1, a0, T, bremse) {
    let w = null, alt = this.p[0];
    for (const q of this.p) { if (!q.an) { w = q; break; } if (q.t / q.T > alt.t / alt.T) alt = q; }
    w ??= alt;
    Object.assign(w, { an: true, art, x, y, vx, vy, r0, r1, a0, t: 0, T, bremse });
    return w;
  }
  // art: 0 Rauch (grau), 1 Staub (braun), 2 Feuer (additiv, kurz)
  schuss(x, y, w, cx, cy) {
    const z = this.zufall, c = Math.cos(w), s = Math.sin(w);
    const dicht = Math.min(0.2, this.aktiv() * 0.002);   // schon viel Rauch in der Luft: dichter (Obergrenze)
    const frei = Math.max(0, this.p.length - this.aktiv());
    const lim = n => Math.max(6, Math.min(n, Math.ceil(n * Math.min(1, frei / 60 + 0.4))));   // knapper Pool: weniger Neue
    // Feuerball an der Mündung: ~1,5–2 m, kurz
    for (let i = 0; i < 3; i++) this.neu(2, x + c * i * 5, y + s * i * 5, c * 40, s * 40, 0.55 * PX * FEIN, (1 + i * 0.25) * PX * FEIN, 0.8, 0.16 + i * 0.03, 4);
    // Rauchkegel nach vorn: schießt 15–25 m, verbreitert und verlangsamt sich (Bremse), treibt dann leicht ab, 3–5 s
    for (let i = 0, n = lim(52); i < n; i++) {
      const a = w + (z() - 0.5) * 0.42, ziel = (14 + z() * 12) * PX, bremse = 1.5 + z() * 0.5, v = ziel * bremse;
      this.neu(0, x + c * z() * 12, y + s * z() * 12, Math.cos(a) * v, Math.sin(a) * v, (0.8 * PX + z() * PX * 0.5) * FEIN, (2.2 + z() * 1.8) * PX * FEIN, 0.4 + dicht + z() * 0.12, 3 + z() * 2, bremse);
    }
    // aus dem Rohr quillt Rauch seitlich und hinten heraus
    for (let i = 0, n = lim(12); i < n; i++) {
      const a = w + Math.PI * (0.55 + z() * 0.9) * (z() < 0.5 ? 1 : -1), v = (2 + z() * 4) * PX;
      this.neu(0, x - c * z() * 10, y - s * z() * 10, Math.cos(a) * v, Math.sin(a) * v, 0.6 * PX * FEIN, (1.5 + z() * 1.2) * PX * FEIN, 0.34 + dicht, 2.5 + z() * 1.5, 1.6);
    }
    // Staubring um den Panzer
    for (let i = 0, n = lim(22); i < n; i++) {
      const a = (i / 22) * Math.PI * 2 + z() * 0.3, v = (5 + z() * 4) * PX;
      this.neu(1, cx + Math.cos(a) * 4.5 * PX, cy + Math.sin(a) * 4.5 * PX, Math.cos(a) * v, Math.sin(a) * v, 0.5 * PX * FEIN, (1.4 + z() * 1.2) * PX * FEIN, 0.3, 1.8 + z() * 1.2, 2.2);
    }
    // Staub entlang der ersten Meter der Schussbahn
    for (let i = 0, n = lim(16); i < n; i++) {
      const d = (1 + z() * 6) * PX, a = w + (z() - 0.5) * 0.9, v = (2 + z() * 3) * PX;
      this.neu(1, x + c * d, y + s * d, Math.cos(a) * v, Math.sin(a) * v, 0.5 * PX * FEIN, (1.2 + z()) * PX * FEIN, 0.32, 1.5 + z() * 1.5, 2);
    }
  }
  // Zeit dt (s) weiter; Wind driftet den Rauch leicht ab
  schritt(dt, windX = 5, windY = -2) {
    for (const q of this.p) {
      if (!q.an) continue;
      q.t += dt;
      if (q.t >= q.T) { q.an = false; continue; }
      const f = Math.exp(-q.bremse * dt);
      q.vx *= f; q.vy *= f;
      q.x += (q.vx + (q.art === 2 ? 0 : windX)) * dt; q.y += (q.vy + (q.art === 2 ? 0 : windY)) * dt;
    }
  }
  static radius(q) { const u = q.t / q.T; return q.r0 + (q.r1 - q.r0) * Math.sqrt(u); }
  static alpha(q) { const u = q.t / q.T; return q.a0 * (1 - u) * (1 - u * 0.3) * Math.min(1, u * 12 + 0.15); }
}

const FARBE = [0xb7b7b7, 0x9c8a6c, 0xffb347];

// hängt den Pool an eine Phaser-Szene: feste Kreisobjekte (einmal angelegt), pro Frame nur umgesetzt
export class RauchZeichner {
  constructor(scene, max = RAUCH_MAX) {
    this.scene = scene; this.pool = new RauchPool(max);
    weichTextur(scene);
    this.kreise = Array.from({ length: max }, () => scene.add.image(0, 0, WEICH_SCHLUESSEL).setAlpha(0).setVisible(false).setDepth(6.5));
    this.fn = (zeit, ms) => this.zeichne(Math.min(0.1, ms / 1000));
    scene.events.on('update', this.fn);
    scene.events.once('shutdown', () => { scene.events.off('update', this.fn); });
  }
  schuss(x, y, w, cx, cy) { this.pool.schuss(x, y, w, cx, cy); }
  zeichne(dt) {
    this.pool.schritt(dt);
    this.pool.p.forEach((q, i) => {
      const k = this.kreise[i];
      if (!q.an) { if (k.visible) k.setVisible(false); return; }
      k.setVisible(true).setPosition(q.x, q.y).setScale(weichSkala(RauchPool.radius(q))).setTint(FARBE[q.art]).setAlpha(RauchPool.alpha(q));
      k.setBlendMode(q.art === 2 ? 'ADD' : 'NORMAL').setDepth(q.art === 1 ? 6.2 : q.art === 2 ? 7 : 6.5);
    });
  }
}

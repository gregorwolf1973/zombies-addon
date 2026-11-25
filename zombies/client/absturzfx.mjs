// Feuer, Rauch, Funken und Staub der A400M-Bruchlandung (Königsdorf, nur Darstellung, 8 px = 1 m).
// Alle Teilchen liegen in Weltkoordinaten in einer festen Liste (Pool, höchstens FX_MAX × Grafikstufe gleichzeitig, kein neues Objekt pro Frame);
// ist sie voll, wird das älteste Teilchen überschrieben. Flammen wehen deshalb hinter der schlitternden Maschine her, die Rauchsäule
// steigt (in der Draufsicht: nach oben im Bild) hoch auf und zieht mit dem Wind ab. Logik ohne Phaser (testbar), `AbsturzFx` zeichnet sie.
import { weichTextur, weichSkala, WEICH_SCHLUESSEL } from './weichkreis.mjs';
import { GRAFIK as GFS } from './grafikstufe.mjs';

export const FX_MAX = 420;
export const RAUCH = 0, STAUB = 1, FLAMME = 2, FUNKE = 3, GLUT = 4;
export const WIND = { x: 30, y: -6 };          // px/s: der Rauch zieht nach rechts ab (je höher, desto stärker)

export class FxPool {
  constructor(max = FX_MAX, zufall = Math.random) {
    this.zufall = zufall;
    this.p = Array.from({ length: max }, () => ({ an: false, art: 0, x: 0, y: 0, vx: 0, vy: 0, r0: 0, r1: 0, a0: 0, t: 0, T: 1, bremse: 0, wind: 0, farbe: 0 }));
    this.frei = max;
  }
  aktiv() { return this.p.length - this.frei; }
  // freien Platz nehmen, sonst das Teilchen mit dem größten Laufzeitanteil überschreiben
  neu(art, x, y, vx, vy, r0, r1, a0, T, bremse = 0, wind = 0, farbe = 0) {
    let w = null, alt = this.p[0];
    for (const q of this.p) { if (!q.an) { w = q; break; } if (q.t / q.T > alt.t / alt.T) alt = q; }
    if (w) this.frei--; else w = alt;
    w.an = true; w.art = art; w.x = x; w.y = y; w.vx = vx; w.vy = vy; w.r0 = r0; w.r1 = r1; w.a0 = a0; w.t = 0; w.T = T; w.bremse = bremse; w.wind = wind; w.farbe = farbe;
    return w;
  }
  // Rauch eines Brandherds: dicker schwarzer Qualm, steigt hoch auf, wird breiter und zieht mit dem Wind ab (staerke 0–1)
  rauch(x, y, staerke = 1) {
    const z = this.zufall;
    return this.neu(RAUCH, x + (z() - 0.5) * 16, y + (z() - 0.5) * 10, (z() - 0.5) * 14, -(55 + z() * 35), 12 + z() * 8, (70 + z() * 50) * (0.6 + 0.4 * staerke),
      0.5 + z() * 0.2, 9 + z() * 4, 0.09, 1, Math.floor(z() * 3));
  }
  // Flammenzunge (additiv, kurz); vx/vy = Bewegung der Maschine (die Flammen bleiben dahinter zurück)
  flamme(x, y, r, staerke = 1) {
    const z = this.zufall, rr = r * (0.35 + z() * 0.3) * (0.6 + 0.4 * staerke);
    return this.neu(FLAMME, x + (z() - 0.5) * r * 0.7, y + (z() - 0.5) * r * 0.45, (z() - 0.5) * 20, -(30 + z() * 50), rr * 0.8, rr * 0.25, 0.9, 0.35 + z() * 0.4, 1.2);
  }
  // Glutfunken, die aus dem Feuer aufsteigen
  glut(x, y) {
    const z = this.zufall;
    this.neu(GLUT, x + (z() - 0.5) * 30, y + (z() - 0.5) * 16, (z() - 0.5) * 50, -(50 + z() * 90), 1.6 + z() * 1.2, 0.6, 1, 1 + z() * 1.2, 0.6, 0.6);
  }
  // Funkenflug beim Schlittern / Aufprall: w = Richtung (vx, vy als Einheitsvektor ux/uy), spritzen nach hinten und zur Seite
  funken(x, y, ux, uy, n = 1, tempo = 1) {
    const z = this.zufall;
    for (let i = 0; i < n; i++) {
      const quer = (z() - 0.5) * 1.6, v = (90 + z() * 220) * tempo;
      this.neu(FUNKE, x + (z() - 0.5) * 14, y + (z() - 0.5) * 14, (-ux + -uy * quer) * v, (-uy + ux * quer) * v, 1.3 + z() * 1.1, 0.5, 1, 0.25 + z() * 0.45, 2.2);
    }
  }
  // Staub: Ring beim Aufprall (n Teilchen) bzw. einzelne Fahnen hinter der schlitternden Maschine
  staub(x, y, n = 1, weite = 1) {
    const z = this.zufall;
    for (let i = 0; i < n; i++) {
      const a = z() * 6.2832, v = (25 + z() * 70) * weite, cc = Math.cos(a), ss = Math.sin(a);   // nur Darstellung
      this.neu(STAUB, x + cc * 10, y + ss * 10, cc * v, ss * v * 0.7, 8 + z() * 6, (26 + z() * 22) * weite, 0.42, 1.6 + z() * 1.4, 1.4, 0.4, Math.floor(z() * 2));
    }
  }
  schritt(dt) {
    for (const q of this.p) {
      if (!q.an) continue;
      q.t += dt;
      if (q.t >= q.T) { q.an = false; this.frei++; continue; }
      const f = q.bremse ? 1 / (1 + q.bremse * dt) : 1, u = q.t / q.T;
      q.vx *= f; q.vy *= f;
      if (q.art === FUNKE) q.vy += 40 * dt;   // fallen leicht zurück
      q.x += (q.vx + WIND.x * q.wind * (0.3 + u)) * dt; q.y += (q.vy + WIND.y * q.wind * (0.3 + u)) * dt;
    }
  }
  static radius(q) { const u = q.t / q.T; return q.r0 + (q.r1 - q.r0) * Math.sqrt(u); }
  static alpha(q) {
    const u = q.t / q.T;
    if (q.art === RAUCH) return q.a0 * Math.min(1, u * 8) * (1 - u) ** 1.3;
    if (q.art === FLAMME) return q.a0 * (1 - u) * Math.min(1, u * 10 + 0.3);
    return q.a0 * (1 - u);
  }
}

const RAUCH_FARBE = [0x141210, 0x24201c, 0x3a3531], STAUB_FARBE = [0x8d7b63, 0x6f6355];
const flammeFarbe = u => (u < 0.18 ? 0xfff3b0 : u < 0.4 ? 0xffb22e : u < 0.7 ? 0xff6a13 : 0xc8301b);

// hängt den Pool an eine Phaser-Szene: feste Bilder (einmal angelegt), pro Frame nur umgesetzt
export class AbsturzFx {
  constructor(scene, max = Math.round(FX_MAX * GFS.partikel)) {
    this.scene = scene; this.pool = new FxPool(max); this.sichtbar = true;
    weichTextur(scene);
    this.bilder = Array.from({ length: max }, () => scene.add.image(0, 0, WEICH_SCHLUESSEL).setAlpha(0).setVisible(false));
  }
  get anteil() { return GFS.partikel; }
  zeichne(dt, sichtbar) {
    this.pool.schritt(dt);
    const zunge = this.scene.textures.exists('zunge');
    this.pool.p.forEach((q, i) => {
      const b = this.bilder[i];
      if (!q.an || !sichtbar) { if (b.visible) b.setVisible(false); return; }
      const r = FxPool.radius(q), u = q.t / q.T;
      if (!b.visible) b.setVisible(true);
      if (q.art === FLAMME && zunge) {
        if (b.texture.key !== 'zunge') b.setTexture('zunge');
        b.setScale(r / 12, r / 12 * 1.2);
      } else {
        if (b.texture.key !== WEICH_SCHLUESSEL) b.setTexture(WEICH_SCHLUESSEL);
        b.setScale(weichSkala(r));
      }
      const farbe = q.art === RAUCH ? RAUCH_FARBE[q.farbe] : q.art === STAUB ? STAUB_FARBE[q.farbe] : q.art === FLAMME ? flammeFarbe(u) : q.art === GLUT ? 0xffa040 : 0xffe9a0;
      b.setPosition(q.x, q.y).setTint(farbe).setAlpha(FxPool.alpha(q));
      const add = q.art === FLAMME || q.art === FUNKE || q.art === GLUT;
      if (b.blendMode !== (add ? 1 : 0)) b.setBlendMode(add ? 'ADD' : 'NORMAL');
      b.setDepth(q.art === RAUCH ? 7.8 : q.art === STAUB ? 6.2 : q.art === FLAMME ? 7.0 : 7.1);
    });
  }
  zerstoeren() { for (const b of this.bilder) b.destroy(); this.bilder = []; }
}

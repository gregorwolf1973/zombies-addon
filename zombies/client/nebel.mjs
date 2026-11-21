// Nebel als Wetterlage (Darstellung): zwei langsam ziehende Schwadenebenen, eine Sichtgrenze um die eigene Figur
// (klar innen, nach außen dichter, außerhalb ganz zu) und ein diffuser Schein im Lichtkegel der Taschenlampe.
// Die Dichte (0..1) kommt vom Server (state.nebel, server/nebel.mjs), die Sichtweite in m bei voller Dichte aus state.nebelSicht.
// Wenige große Texturen, keine Shader: läuft auch mit dem Canvas-Renderer (Handy/Tablet).

const PIXEL_JE_METER = 8;
const NEBEL_FARBE = 0xc9d1d6;   // helles Grau; nachts dunkelt die Nachtebene (Tiefe 8) darüber ab, der Lichtkegel macht es wieder hell
const TIEFE = 7.95;             // über Figuren, Zombies und Dingen (≤ 7), unter der Nachtdunkelheit (8)

// Sichtradius in Pixeln: bei schwacher Dichte weit, bei voller Dichte die eingestellte Sichtweite
export function nebelRadius(dichte, sichtMeter = 20) {
  const d = Math.max(0, Math.min(1, dichte));
  return sichtMeter * PIXEL_JE_METER * (1 + (1 - d) * 3) * 1.15;
}

// Deckkraft der Nebelebenen aus der Dichte (voll = 1: außerhalb der Sicht ist alles verschluckt)
export const nebelDeckkraft = dichte => Math.max(0, Math.min(1, dichte * 1.02));

// Nahtlos kachelbares Wertrauschen (mehrere Oktaven) als Werte 0..255; groesse = Kantenlänge (Potenz von 2)
export function rauschen(groesse = 256, samen = 1, oktaven = 4) {
  let z = samen >>> 0 || 1;
  const zufall = () => { z ^= z << 13; z >>>= 0; z ^= z >>> 17; z ^= z << 5; z >>>= 0; return z / 4294967296; };
  const aus = new Float32Array(groesse * groesse);
  let summe = 0, gew = 1;
  for (let o = 0; o < oktaven; o++) {
    const n = 4 << o;   // Gitterpunkte je Kante (4, 8, 16, 32)
    const gitter = new Float32Array(n * n);
    for (let i = 0; i < gitter.length; i++) gitter[i] = zufall();
    const sch = groesse / n;
    for (let y = 0; y < groesse; y++) {
      const fy = y / sch, y0 = Math.floor(fy), ty = fy - y0, sy = ty * ty * (3 - 2 * ty), y1 = (y0 + 1) % n;
      for (let x = 0; x < groesse; x++) {
        const fx = x / sch, x0 = Math.floor(fx), tx = fx - x0, sx = tx * tx * (3 - 2 * tx), x1 = (x0 + 1) % n;
        const a = gitter[y0 * n + x0] + (gitter[y0 * n + x1] - gitter[y0 * n + x0]) * sx;
        const b = gitter[y1 * n + x0] + (gitter[y1 * n + x1] - gitter[y1 * n + x0]) * sx;
        aus[y * groesse + x] += (a + (b - a) * sy) * gew;
      }
    }
    summe += gew; gew *= 0.5;
  }
  const r = new Uint8Array(groesse * groesse);
  for (let i = 0; i < r.length; i++) r[i] = Math.max(0, Math.min(255, Math.round(aus[i] / summe * 255)));
  return r;
}

export class NebelEbene {
  constructor(szene) {
    this.s = szene;
    this.bereit = false;
    this.t = 0;
  }

  // Texturen und Objekte einmalig anlegen
  bauen() {
    const s = this.s;
    const schwaden = (key, samen) => {
      if (s.textures.exists(key)) return;
      const tex = s.textures.createCanvas(key, 256, 256), c = tex.getContext(), bild = c.createImageData(256, 256), w = rauschen(256, samen);
      // Rauschen → weiche Wolken: nur die hellere Hälfte trägt, Rand läuft sanft aus (Alpha 0 … 0,55)
      for (let i = 0; i < w.length; i++) {
        const k = Math.max(0, (w[i] - 105) / 150), a = Math.min(1, k * k * (3 - 2 * Math.min(1, k)));
        bild.data[i * 4] = 235; bild.data[i * 4 + 1] = 240; bild.data[i * 4 + 2] = 244; bild.data[i * 4 + 3] = Math.round(a * 200);
      }
      c.putImageData(bild, 0, 0); tex.refresh();
    };
    schwaden('nebel_a', 7); schwaden('nebel_b', 1234567);
    if (!s.textures.exists('nebel_sicht')) {
      const tex = s.textures.createCanvas('nebel_sicht', 512, 512), c = tex.getContext();
      const g = c.createRadialGradient(256, 256, 0, 256, 256, 256);
      [[0, 0], [0.5, 0], [0.62, 0.12], [0.75, 0.42], [0.88, 0.8], [1, 1]].forEach(([p, a]) => g.addColorStop(p, `rgba(201,209,214,${a})`));
      c.fillStyle = g; c.fillRect(0, 0, 512, 512); tex.refresh();
    }
    this.ebenen = [
      { bild: s.add.tileSprite(0, 0, 512, 512, 'nebel_a').setOrigin(0).setDepth(TIEFE + 0.01), skala: 3.2, par: 0.82, vx: 5, vy: 2, a: 0.9 },
      { bild: s.add.tileSprite(0, 0, 512, 512, 'nebel_b').setOrigin(0).setDepth(TIEFE + 0.02), skala: 5.5, par: 0.7, vx: -3, vy: 4, a: 0.75 },
    ];
    for (const e of this.ebenen) e.bild.setTileScale(e.skala);
    this.sicht = s.add.image(0, 0, 'nebel_sicht').setDepth(TIEFE);
    this.rand = [0, 1, 2, 3].map(() => s.add.rectangle(0, 0, 1, 1, NEBEL_FARBE).setOrigin(0).setDepth(TIEFE));
    // Schein der Taschenlampe im Nebel: liegt unter der Nachtdunkelheit, sichtbar nur im ausgeschnittenen Kegel
    this.schein = s.textures.exists('lampe') ? s.add.image(0, 0, 'lampe').setOrigin(0, 0.5).setDepth(TIEFE + 0.03).setBlendMode('ADD').setTint(0xfff1cf) : null;
    this.bereit = true;
  }

  verstecken() {
    if (!this.bereit) return;
    for (const e of this.ebenen) e.bild.setVisible(false);
    this.sicht.setVisible(false); this.rand.forEach(r => r.setVisible(false)); this.schein?.setVisible(false);
  }

  // v = sichtbarer Weltausschnitt (cameras.main.worldView), (px, py) = eigene Figur, dunkel 0..1 (Nacht), lampe = Winkel (Bogenmaß) oder null, dt in Sekunden
  aktualisiere(v, px, py, dichte, sichtMeter, dunkel, lampe, dt, innen) {
    if (dichte < 0.02 || innen) { this.verstecken(); return; }
    if (!this.bereit) this.bauen();
    this.t += dt;
    const alpha = nebelDeckkraft(dichte), R = nebelRadius(dichte, sichtMeter);
    // Schwaden: Größe auf 128 gerundet (kein Neuaufbau bei jedem Zoomschritt), folgen der Kamera mit leichter Parallaxe
    const pad = 64, B = Math.ceil((v.width + 2 * pad) / 128) * 128, H = Math.ceil((v.height + 2 * pad) / 128) * 128;
    for (const e of this.ebenen) {
      const b = e.bild;
      if (b.width !== B || b.height !== H) b.setSize(B, H);
      b.setPosition(v.x - pad, v.y - pad).setVisible(true).setAlpha(e.a * alpha * (0.35 + 0.65 * Math.min(1, dichte * 1.5)));
      b.tilePositionX = ((v.x - pad) * e.par + this.t * e.vx) / e.skala;
      b.tilePositionY = ((v.y - pad) * e.par + this.t * e.vy) / e.skala;
    }
    // Sichtgrenze: Verlauf um die Figur, außerhalb vier Flächen in derselben Farbe
    this.sicht.setPosition(px, py).setDisplaySize(2 * R, 2 * R).setAlpha(alpha).setVisible(true);
    const x0 = v.x - pad, y0 = v.y - pad, x1 = v.right + pad, y1 = v.bottom + pad, l = px - R, r = px + R, o = py - R, u = py + R;
    const flaechen = [[x0, y0, x1 - x0, o - y0], [x0, u, x1 - x0, y1 - u], [x0, o, l - x0, u - o], [r, o, x1 - r, u - o]];
    flaechen.forEach(([x, y, w, h], i) => {
      const f = this.rand[i];
      if (w <= 0 || h <= 0) { f.setVisible(false); return; }
      f.setPosition(x, y).setSize(w, h).setFillStyle(NEBEL_FARBE, alpha).setVisible(true);
    });
    // Lampenschein: im Dunkeln deutlich, am Tag kaum
    if (this.schein) {
      if (lampe === null || lampe === undefined) this.schein.setVisible(false);
      else this.schein.setPosition(px, py).setRotation(lampe).setScale(1.25).setAlpha(Math.min(1, dichte) * (0.12 + 0.55 * dunkel)).setVisible(true);
    }
  }
}

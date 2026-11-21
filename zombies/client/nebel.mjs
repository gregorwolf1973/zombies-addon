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
  return sichtMeter * PIXEL_JE_METER * (1 + (1 - d) * 3) * 1.5;   // Radius, an dem der Rand erreicht ist; der Verlauf beginnt schon bei 30 % davon
}

// Deckkraft der Nebelebenen aus der Dichte (voll = 1: außerhalb der Sicht ist alles verschluckt)
export const nebelDeckkraft = dichte => Math.max(0, Math.min(1, dichte * 1.02));   // 0..1; die Ebene malt davon höchstens NEBEL_MAX

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

// Alle Nebel-Deckkräfte sind auf diesen Höchstwert begrenzt (früher 1: außerhalb der Sicht ganz zu; jetzt ~28 % lichter)
export const NEBEL_MAX = 0.72;
// Im Lampenkegel bleibt nur dieser Rest des Nebels als leichter Schleier (Kegel „schneidet“ den Nebel auf)
export const LAMPE_NEBEL_REST = 0.15;

// Verlauf der Sichtgrenze von 0 (innen, klar) bis 1 (Rand): weiches Smoothstep ab 30 % des Radius statt eines „Fensters“
export function sichtVerlauf(t) {
  const k = Math.max(0, Math.min(1, (t - 0.3) / 0.7));
  return k * k * (3 - 2 * k);
}

export class NebelEbene {
  constructor(szene) {
    this.s = szene;
    this.bereit = false;
    this.t = 0;
  }

  // Texturen und Objekte einmalig anlegen. Die Nebelteile werden nicht direkt gezeigt, sondern je Bild in eine RenderTexture gemalt;
  // dort schneiden die Lampenkegel (eigene und fremde, gleicher Pinsel) den Nebel auf.
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
      for (let i = 0; i <= 20; i++) g.addColorStop(i / 20, `rgba(201,209,214,${sichtVerlauf(i / 20)})`);
      c.fillStyle = g; c.fillRect(0, 0, 512, 512); tex.refresh();
    }
    const kachel = (key, skala, par, vx, vy, a) => {
      const bild = s.make.tileSprite({ x: 0, y: 0, width: 512, height: 512, key, add: false }).setOrigin(0);
      bild.setTileScale(skala);
      return { bild, skala, par, vx, vy, a };
    };
    this.ebenen = [kachel('nebel_a', 3.2, 0.82, 5, 2, 0.9), kachel('nebel_b', 5.5, 0.7, -3, 4, 0.75)];
    this.sicht = s.make.image({ key: 'nebel_sicht', add: false });
    this.rand = [0, 1, 2, 3].map(() => new Phaser.GameObjects.Rectangle(s, 0, 0, 1, 1, NEBEL_FARBE).setOrigin(0));
    this.bereit = true;
  }

  verstecken() {
    this.rt?.setVisible(false);
  }

  // v = sichtbarer Weltausschnitt (cameras.main.worldView), (px, py) = eigene Figur, dunkel 0..1 (Nacht), dt in Sekunden,
  // lampen = [{ x, y, winkel }] aller leuchtenden Taschenlampen (eigene und fremde), lampenZeichner(ziel, ox, oy, lampe, alpha) malt den Kegel (gleiche Funktion wie bei der Nachtdunkelheit)
  aktualisiere(v, px, py, dichte, sichtMeter, dunkel, lampen, dt, innen, abdunkeln = 0, lampenZeichner = null) {
    if (dichte < 0.02 || innen) { this.verstecken(); return; }
    if (!this.bereit) this.bauen();
    this.t += dt;
    // Nachts folgt der Nebel der Dunkelheit: eigene Farbe wird dunkelgrau-blau, sonst leuchtet er in Lichtlöchern (Laternen) weiß
    const k = Math.max(0, Math.min(1, abdunkeln)), mix = (a, b) => Math.round(a + (b - a) * k);
    const farbe = (mix(0xc9, 0x2a) << 16) | (mix(0xd1, 0x31) << 8) | mix(0xd6, 0x3d);
    const tm = (d, h) => Math.round(255 + (255 * d / h - 255) * k), toenung = (tm(0x2a, 0xc9) << 16) | (tm(0x31, 0xd1) << 8) | tm(0x3d, 0xd6);   // Texturen sind tagfarben: Tönung = Verhältnis zur Nachtfarbe
    const alpha = nebelDeckkraft(dichte) * NEBEL_MAX, R = nebelRadius(dichte, sichtMeter);
    // Zielfläche: Weltausschnitt mit Rand, Größe auf 128 gerundet (kein Neuaufbau bei jedem Zoomschritt)
    const pad = 64, B = Math.ceil((v.width + 2 * pad) / 128) * 128, H = Math.ceil((v.height + 2 * pad) / 128) * 128;
    const s = this.s;
    // neu anlegen statt resize() – nach resize() wirkt erase() in Phaser 3.90 nicht mehr
    if (!this.rt || this.rt.width !== B || this.rt.height !== H) { this.rt?.destroy(); this.rt = s.add.renderTexture(0, 0, B, H).setOrigin(0).setDepth(TIEFE); }
    const rt = this.rt, ox = v.x - pad, oy = v.y - pad;
    rt.setPosition(ox, oy).setVisible(true).clear();
    // Schwaden folgen der Kamera mit leichter Parallaxe
    for (const e of this.ebenen) {
      const b = e.bild;
      if (b.width !== B || b.height !== H) b.setSize(B, H);
      b.setTint(toenung).setPosition(0, 0).setAlpha(e.a * alpha * (0.35 + 0.65 * Math.min(1, dichte * 1.5)));
      b.tilePositionX = (ox * e.par + this.t * e.vx) / e.skala;
      b.tilePositionY = (oy * e.par + this.t * e.vy) / e.skala;
      rt.draw(b, 0, 0);
    }
    // Sichtgrenze: Verlauf um die Figur, außerhalb vier Flächen in derselben Farbe
    this.sicht.setTint(toenung).setPosition(px - ox, py - oy).setDisplaySize(2 * R, 2 * R).setAlpha(alpha);
    rt.draw(this.sicht);
    const l = px - ox - R, r = px - ox + R, o = py - oy - R, u = py - oy + R;
    const flaechen = [[0, 0, B, o], [0, u, B, H - u], [0, o, l, u - o], [r, o, B - r, u - o]];
    flaechen.forEach(([x, y, w, h], i) => {
      if (w <= 0 || h <= 0) return;
      const f = this.rand[i];
      f.setPosition(x, y).setSize(w, h).setFillStyle(farbe, alpha);
      rt.draw(f);
    });
    // Lampenkegel schneiden den Nebel auf (nur ein leichter Schleier bleibt)
    if (lampenZeichner) for (const lp of lampen ?? []) lampenZeichner(rt, ox, oy, lp, 1 - LAMPE_NEBEL_REST);
  }
}

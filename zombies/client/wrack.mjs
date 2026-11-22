// Ausgebrannte Autos: stabiles Aussehen (Hash der Fahrzeug-Id), schwaches Dauerqualmen, flackernde Glut, Rußfleck am Boden.
// Nur Darstellung; alle Clients sehen dasselbe Wrack, weil nichts aus Math.random stammt (außer dem Zeitpunkt einzelner Rauchwölkchen).
import { fzPx } from './masse.mjs';

export const WRACK_NAEHE = 600;      // nur Wracks näher als 600 px an der Figur werden animiert
const hashS = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); h = Math.imul(h ^ (h >>> 15), 2246822519); return ((h ^ (h >>> 13)) >>> 0); };
const z = (basis, k) => { let h = Math.imul((basis + k * 374761393) | 0, 2654435761); h = Math.imul(h ^ (h >>> 15), 2246822519); return ((h ^ (h >>> 13)) >>> 0) / 4294967296; };

// Gleichbleibendes Muster eines Wracks: Glutstellen (im Fahrzeugkoordinatensystem, Länge l × Breite b) und Rußflecken (Weltpixel relativ zur Mitte)
export function wrackMuster(id, l = 62, b = 26) {
  const h = hashS(String(id));
  const glut = [];
  const n = 3 + Math.floor(z(h, 1) * 3);                                  // 3-5 Stellen
  for (let i = 0; i < n; i++) glut.push({ x: (z(h, 10 + i) - 0.5) * l * 0.7, y: (z(h, 20 + i) - 0.5) * b * 0.55, r: 1.6 + z(h, 30 + i) * 1.8, ph: z(h, 40 + i) * 6.28, v: 1.5 + z(h, 50 + i) * 2.5 });
  const russ = [];
  for (let i = 0; i < 5; i++) russ.push({ x: (z(h, 60 + i) - 0.5) * l * 0.9, y: (z(h, 70 + i) - 0.5) * b * 0.9, rx: l * (0.45 + z(h, 80 + i) * 0.25), ry: b * (0.7 + z(h, 90 + i) * 0.5), w: z(h, 100 + i) * 3.14 });
  return { glut, russ, qualm: 0.9 + z(h, 110) * 1.1, wind: z(h, 111) };
}

// Pro Frame für ein Fahrzeug-Objekt o (aus spiel.mjs busObj) mit Server-Fahrzeug f aufrufen.
export function wrackAnimieren(scene, o, id, f, dt, lokal, aktEbene) {
  if (f.art !== 'wrack') {
    if (o.russ) { o.russ.destroy(); o.russ = null; }
    return;
  }
  const [l, b] = fzPx('auto');
  o.muster ??= wrackMuster(id, l, b);
  const nah = !aktEbene && lokal && Math.hypot(o.x - lokal.x, o.y - lokal.y) < WRACK_NAEHE;
  // Rußfleck am Boden (einmal gezeichnet, neu bei Verschieben)
  if (nah && (!o.russ || Math.hypot(o.russX - o.x, o.russY - o.y) > 6)) {
    o.russ ??= scene.add.graphics().setDepth(4.4);
    const g = o.russ.clear(), c = Math.cos(o.r), s = Math.sin(o.r);
    for (const r of o.muster.russ) {
      g.fillStyle(0x0c0906, 0.1);
      g.fillEllipse(o.x + r.x * c - r.y * s, o.y + r.x * s + r.y * c, r.rx * 1.2, r.ry * 1.2);
    }
    g.fillStyle(0x0c0906, 0.14).fillEllipse(o.x, o.y, l * 1.25, b * 1.5);
    o.russX = o.x; o.russY = o.y;
  }
  o.russ?.setVisible(!aktEbene);
  if (!nah) { o.licht.clear(); return; }
  // Glut: additiv, Alpha flackert
  if (!o.glutModus) { o.licht.setBlendMode(1); o.glutModus = true; }
  const t = scene.time.now / 1000;
  for (const gl of o.muster.glut) {
    const fl = 0.5 + 0.5 * Math.sin(t * gl.v + gl.ph) * Math.sin(t * gl.v * 2.3 + gl.ph * 1.7);
    o.licht.fillStyle(0xff3d00, 0.05 + 0.1 * fl).fillCircle(gl.x, gl.y, gl.r * 2.6);
    o.licht.fillStyle(0xff8f1f, 0.12 + 0.28 * fl).fillCircle(gl.x, gl.y, gl.r);
  }
  // Schwacher Dauerqualm (nur wenn der Unfall-Rauch nicht ohnehin läuft)
  if (!f.rauch) {
    o.qualmUhr = (o.qualmUhr ?? Math.random()) - dt;
    if (o.qualmUhr <= 0) {
      o.qualmUhr = o.muster.qualm + Math.random() * 1.2;
      const gl = o.muster.glut[Math.floor(Math.random() * o.muster.glut.length)], c = Math.cos(o.r), s = Math.sin(o.r);
      const x = o.x + gl.x * c - gl.y * s, y = o.y + gl.x * s + gl.y * c, q = scene.add.circle(x, y, 2 + Math.random() * 1.5, 0x4a4a4a, 0.28).setDepth(7.6);
      scene.tweens.add({ targets: q, y: y - 22 - Math.random() * 14, x: x + 6 + o.muster.wind * 10, alpha: 0, scale: 2.4, duration: 2200 + Math.random() * 900, onComplete: () => q.destroy() });
    }
  }
}

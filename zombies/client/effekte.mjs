// Effekte rund um den Bundeswehr-Stützpunkt, in spiel.mjs nur kurz eingehängt:
//  - fetzen(): „Fetzen fliegen“ bei Treffern auf Zombies (Blutspritzer, Fleischbrocken, Fleck am Boden) – wenige Teilchen aus einem Pool
//  - BwLicht: nachts Scheinwerfer (schwenken sanft zu Zombie-Häufungen) und Lampen im Lager, schneiden aus der Nachtdecke aus
import { rahmen, SP_BREITE } from './stuetzpunkt.mjs';

const BLUT = [0x8b0000, 0xb71c1c, 0x6a0b0b, 0xa31515], FLEISCH = [0xc2574f, 0x9b3b3b, 0x7a2b2b, 0xb86a5e];
const MAX_AKTIV = 60;          // gleichzeitig fliegende Teilchen (Handy)
const zufall = (a, b) => a + Math.random() * (b - a);

// ---------------------------------------------------------------------------------------------------------------------
// Fetzen
// ---------------------------------------------------------------------------------------------------------------------
function nimm(scene) {
  const st = scene.fetzenStand ??= { pool: [], aktiv: 0 };
  let o = st.pool.pop();
  if (!o || !o.scene) o = scene.add.circle(0, 0, 1.2, 0x8b0000);
  st.aktiv++;
  return o.setActive(true).setVisible(true).setAlpha(1).setScale(1);
}
function gib(scene, o) {
  const st = scene.fetzenStand;
  st.aktiv = Math.max(0, st.aktiv - 1);
  o.setActive(false).setVisible(false);
  st.pool.push(o);
}

// Fetzen an Position x, y; w = Flugrichtung (Bogenmaß) oder null (alle Richtungen); menge: 1 = Gewehrtreffer, größer = Granate/Kanone
export function fetzen(scene, x, y, w = null, menge = 1, ebene = '') {
  if ((ebene ?? '') !== (scene.aktEbene ?? '')) return;
  const v = scene.cameras.main.worldView;
  if (x < v.x - 80 || x > v.right + 80 || y < v.y - 80 || y > v.bottom + 80) return;
  const st = scene.fetzenStand ??= { pool: [], aktiv: 0 };
  const weit = Math.sqrt(menge);
  const nBlut = Math.min(MAX_AKTIV - st.aktiv, Math.round(5 * menge)), nStueck = Math.min(MAX_AKTIV - st.aktiv - nBlut, Math.round(3 * menge));
  const richtung = () => (w === null || Math.random() < 0.25 ? Math.random() * Math.PI * 2 : w + zufall(-0.8, 0.8));
  for (let i = 0; i < nBlut; i++) {
    const o = nimm(scene), a = richtung(), d = zufall(7, 22) * weit;
    o.setPosition(x, y).setFillStyle(BLUT[i % BLUT.length]).setScale(zufall(0.5, 1)).setDepth(7.2);
    scene.tweens.add({ targets: o, x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, alpha: 0, scale: o.scale * 0.5, duration: zufall(350, 650), ease: 'Cubic.easeOut', onComplete: () => gib(scene, o) });
  }
  for (let i = 0; i < nStueck; i++) {
    const o = nimm(scene), a = richtung(), d = zufall(5, 17) * weit;
    o.setPosition(x, y).setFillStyle(FLEISCH[i % FLEISCH.length]).setScale(zufall(0.8, 1.4)).setDepth(7.2);
    scene.tweens.add({ targets: o, x: x + Math.cos(a) * d, y: y + Math.sin(a) * d + 6, alpha: 0.2, scale: o.scale * 0.8, duration: zufall(500, 900), ease: 'Quad.easeOut', onComplete: () => gib(scene, o) });
  }
  if (st.aktiv < MAX_AKTIV) {   // Fleck am Boden, verblasst langsam
    const f = nimm(scene), a = richtung(), d = zufall(0, 5) * weit;
    f.setPosition(x + Math.cos(a) * d, y + Math.sin(a) * d).setFillStyle(0x5a0808).setScale(zufall(1.7, 2.5) * weit).setAlpha(0.55).setDepth(0.7);
    scene.tweens.add({ targets: f, alpha: 0, duration: 2500, delay: 400, onComplete: () => gib(scene, f) });
  }
}

// Schuss eines Spielers: trifft die Linie (x2, y2) einen Zombie, fliegen Fetzen (nur Fernwaffen; Schrot kommt als mehrere Linien)
export function fetzenBeiSchuss(scene, zombies, m) {
  if (m.art === 'schlaeger' || m.art === 'messer') return;
  // Zombie-Anzeige läuft dem Server hinterher → großzügiger Radius; Ebene egal (die Ebene des Schützen gilt)
  let best = null, bd = 40;
  for (const z of zombies) { const d = Math.hypot(z.x - m.x2, z.y - m.y2); if (d < bd) { bd = d; best = z; } }
  if (best) fetzen(scene, best.x, best.y, Math.atan2(m.y2 - m.y1, m.x2 - m.x1), m.art === 'schrotflinte' ? 0.6 : 0.8, best.ebene ?? '');
}

// Explosion (Granate, Kanone): jeder Zombie im Radius verliert Fetzen, höchstens 4 Stellen
export function fetzenBeiExplosion(scene, zombies, x, y, r) {
  let n = 0;
  for (const z of zombies) {
    if ((z.ebene ?? '') !== '' || Math.hypot(z.x - x, z.y - y) > r) continue;
    fetzen(scene, z.x, z.y, Math.atan2(z.y - y, z.x - x), 1.6, '');
    if (++n >= 4) return;
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Licht im Lager
// ---------------------------------------------------------------------------------------------------------------------
const SCHWENK = 150;          // Pixel/s, mit denen der Lichtfleck zum Ziel wandert
const ZELLE = 96, SUCHRADIUS = 520;

export class BwLicht {
  constructor(scene, sp) {
    this.scene = scene; this.sp = sp;
    const r = this.r = rahmen(sp.x, sp.y, sp.b, sp.h, sp.richtung);
    const [mx, my] = r.ort(SP_BREITE / 2, 6);
    this.mitte = { x: mx, y: my };
    // zwei Scheinwerfer an den Ecken der Front (hinter der Pumabahn), jeder mit Lichtfleck (zx, zy), der zu Zombies schwenkt
    this.scheinwerfer = [[1.6, 5.8], [SP_BREITE - 1.6, 5.8]].map(([u, v], i) => {
      const [x, y] = r.ort(u, v), [zx, zy] = r.ort(i ? 20 : 10, -4);
      this.mast(x, y, 6, 0xfff3c0);
      return { x, y, zx, zy, ziel: null, phase: i * 2.4 };
    });
    // Lampen: Pfosten vor dem Draht, Zeltmitten, Container
    this.lampen = [];
    for (const u of [4.5, 9.5, 20.5, 25.5]) { const [x, y] = r.ort(u, 0.8); this.lampen.push({ x, y, r: 0.55 }); this.mast(x, y, 3, 0xffe9a8); }
    for (const t of sp.teile) if (t.art === 'sanizelt' || t.art === 'zelt' || t.art === 'funkzelt' || t.art === 'container') this.lampen.push({ x: t.x, y: t.y, r: t.art === 'container' ? 0.5 : 0.7 });
    this.heiss = [];
    this.heissBis = 0;
  }

  mast(x, y, rad, farbe) {
    const s = this.scene;
    s.add.circle(x, y, rad, 0x37474f).setStrokeStyle(1.5, 0x1c262b).setDepth(5.2);
    s.add.circle(x, y, rad * 0.5, farbe).setDepth(5.3);
  }

  // Häufungen von Zombies nahe dem Lager (Raster mit Zellen ZELLE): die beiden stärksten, jeweils Mittelpunkt der Zellenzombies
  hotspots(zombies) {
    const zellen = new Map();
    for (const z of zombies) {
      if ((z.ebene ?? '') !== '' || z.hp <= 0) continue;
      const d = Math.hypot(z.x - this.mitte.x, z.y - this.mitte.y);
      if (d > SUCHRADIUS) continue;
      const k = Math.floor(z.x / ZELLE) + ',' + Math.floor(z.y / ZELLE);
      const c = zellen.get(k) ?? { n: 0, x: 0, y: 0, d: 0 };
      c.n++; c.x += z.x; c.y += z.y; c.d += d; zellen.set(k, c);
    }
    const l = [...zellen.values()].map(c => ({ x: c.x / c.n, y: c.y / c.n, wert: c.n - c.d / c.n / 400 }));
    l.sort((a, b) => b.wert - a.wert);
    return l.slice(0, 2);
  }

  // Ziele den Scheinwerfern zuordnen (der näher liegende Fleck zuerst, damit sie nicht kreuzen und hin- und herspringen)
  zuordnen(h) {
    const [a, b] = this.scheinwerfer;
    if (!h.length) { a.ziel = b.ziel = null; return; }
    if (h.length === 1) { const naeher = Math.hypot(h[0].x - a.zx, h[0].y - a.zy) <= Math.hypot(h[0].x - b.zx, h[0].y - b.zy) ? a : b; naeher.ziel = h[0]; (naeher === a ? b : a).ziel = h[0]; return; }
    const direkt = Math.hypot(h[0].x - a.zx, h[0].y - a.zy) + Math.hypot(h[1].x - b.zx, h[1].y - b.zy), kreuz = Math.hypot(h[1].x - a.zx, h[1].y - a.zy) + Math.hypot(h[0].x - b.zx, h[0].y - b.zy);
    if (direkt <= kreuz) { a.ziel = h[0]; b.ziel = h[1]; } else { a.ziel = h[1]; b.ziel = h[0]; }
  }

  // aus der Nachtdecke ausschneiden; rt = Nacht-Textur, P = weicher Schein, L = Lichtkegel (Ursprung links), (ox, oy) = Ursprung der Textur
  zeichne(rt, P, L, ox, oy, sicht, dunkel, zombies, dt) {
    const jetzt = this.scene.time.now;
    if (jetzt > this.heissBis) { this.heissBis = jetzt + 300; this.zuordnen(this.hotspots(zombies)); }
    for (const l of this.lampen) if (sicht(l.x, l.y, 160)) { P.setScale(l.r).setAlpha(0.7 * dunkel); rt.erase(P, l.x - ox, l.y - oy); }
    this.scheinwerfer.forEach((sw, i) => {
      let tx, ty;
      if (sw.ziel) { tx = sw.ziel.x; ty = sw.ziel.y; }
      else {   // keine Angreifer: langsam die Front entlang streichen
        const u = SP_BREITE / 2 + Math.sin(jetzt / 4200 + sw.phase) * 13, [px, py] = this.r.ort(u, -4);
        tx = px; ty = py;
      }
      const dx = tx - sw.zx, dy = ty - sw.zy, dist = Math.hypot(dx, dy), schritt = Math.min(dist, SCHWENK * dt);
      if (dist > 0.01) { sw.zx += dx / dist * schritt; sw.zy += dy / dist * schritt; }
      const lx = sw.zx - sw.x, ly = sw.zy - sw.y, laenge = Math.hypot(lx, ly) || 1;
      if (!sicht(sw.x, sw.y, 520) && !sicht(sw.zx, sw.zy, 200)) return;
      L.setRotation(Math.atan2(ly, lx)).setScale(Math.min(1.1, Math.max(0.45, laenge / 420))).setAlpha(0.95);
      rt.erase(L, sw.x - ox, sw.y - oy);
      P.setScale(0.9).setAlpha(0.85 * dunkel); rt.erase(P, sw.zx - ox, sw.zy - oy);
      P.setScale(0.4).setAlpha(0.6 * dunkel); rt.erase(P, sw.x - ox, sw.y - oy);
    });
  }
}

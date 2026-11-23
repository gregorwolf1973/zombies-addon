// Darstellung der fahrbaren Kampffahrzeuge Puma und Leopard (Superuser-Testmenü, Schießstand): Wanne als Fahrzeugbild, Turm mit Rohr als eigenes
// Bild, das dem Server-Turmwinkel folgt; Ketten-Spur und -Rasseln beim Fahren. Der Boxer hat seine eigene Darstellung (boxerdarstellung.mjs),
// hier wird nach Art verteilt. Logik und Zahlen: server/fahrbar.mjs, client/fahrbar.mjs.
import { FAHRBAR, FAHRBAR_ARTEN } from './fahrbar.mjs';
import { LEOPARD } from './evak.mjs';
import { PUMA_SKALA, PUMA_BILD } from './stuetzpunkt.mjs';
import { boxerBild, boxerFahrzeug } from './boxerdarstellung.mjs';
import { kettenSpur } from './ketten.mjs';
import { fetzen } from './effekte.mjs';
import * as ton from './ton.mjs';

const winkelDiff = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
export const istFahrbar = art => FAHRBAR_ARTEN.includes(art);

// Bild des Fahrzeugs (Textur-Schlüssel) oder null, wenn die Bilder fehlen
export function fahrbarBild(scene, art) {
  if (art === 'boxer') return boxerBild(scene);
  if (art === 'puma') { if (!scene.textures.exists('puma-wanne-bild')) return null; scene.pumaMasse(FAHRBAR.puma.laenge); return scene.textures.exists('puma-wanne') ? 'puma-wanne' : null; }
  if (art === 'leopard') return scene.textures.exists('leopard-wanne') ? 'leopard-wanne' : null;
  return null;
}

// Zusatzteile und Skalierung (Container o: box, bild, sch; Rotation des Containers = Fahrtrichtung); pro Bild für jedes fahrbare Fahrzeug
export function fahrbarFahrzeug(scene, o, f, dt, lokal, aktEbene) {
  if (f.art === 'boxer') return boxerFahrzeug(scene, o, f, dt);
  const puma = f.art === 'puma', m = FAHRBAR[f.art], turmKey = puma ? 'puma-turm' : 'leopard-turm';
  let skala = LEOPARD.skala, ursprung = { x: LEOPARD.turmOx, y: LEOPARD.turmOy };
  if (puma) {
    if (!scene.textures.exists('puma-wanne-bild')) return;
    const mm = scene.pumaMasse(m.laenge), tb = scene.textures.exists('puma-turm') ? scene.textures.get('puma-turm').getSourceImage() : null;
    skala = PUMA_SKALA * mm.skala;
    if (tb) ursprung = { x: (PUMA_BILD.turmMx + mm.R) / tb.width, y: (PUMA_BILD.turmMy + mm.R) / tb.height };
  }
  o.bild.setScale(skala); o.sch?.setScale(skala);   // Schatten ist die Silhouette derselben Textur: gleich skalieren
  if (scene.textures.exists(turmKey)) {
    if (!o.turm) {
      o.turm = scene.add.image(m.turmX, m.turmY, turmKey).setOrigin(ursprung.x, ursprung.y).setScale(skala);
      o.box.addAt(o.turm, 1); o.turmW = Number.isFinite(f.turm) ? f.turm : o.r;
    }
    // Turmwinkel kommt vom Server (dreht dort mit begrenztem Tempo); hier wird nur geglättet. Lokaler Winkel = Welt − Wanne
    o.turmW += winkelDiff(o.turmW, Number.isFinite(f.turm) ? f.turm : o.r) * Math.min(1, dt * 12);
    const loc = o.turmW - o.r, lc = Math.cos(loc), ls = Math.sin(loc);
    o.rueck = Math.max(0, (o.rueck ?? 0) - dt * 2.2);                       // Rückstoß der Kanone (Leopard): Turm rutscht zurück und kehrt wieder
    const rueck = o.rueck * 4;
    o.turm.setRotation(loc).setPosition(m.turmX - lc * rueck, m.turmY - ls * rueck);
  }
  // Ketten: Abdrücke auf dem Boden und Rasseln, solange das Fahrzeug rollt (draußen, in Hörweite)
  const bewegt = o.letztPos !== undefined && Math.hypot(o.x - o.letztPos[0], o.y - o.letztPos[1]) > 0.05;
  o.letztPos = [o.x, o.y];
  if (bewegt && !aktEbene) kettenSpur(scene, 'fahrbar', o.x, o.y, o.r, m.breite);
  o.faehrtT = bewegt ? 0.6 : Math.max(0, (o.faehrtT ?? 0) - dt);
  const hoerbar = lokal && !aktEbene && Math.hypot(o.x - lokal.x, o.y - lokal.y) < 700;
  if (hoerbar && o.faehrtT > 0 && !o.kette) o.kette = ton.schleifeStarten('panzerFaehrt');
  if (o.kette) ton.sireneLage(o.kette, o.x, o.y, 0, 700, !(hoerbar && o.faehrtT > 0));
}

// Rückstoß der Hauptkanone am nächsten fahrbaren Leopard (Server schickt 'leopardkanone'): Fahrzeugobjekt in der Nähe der Mündung
export function fahrbarRueckstoss(scene, s, x, y) {
  for (const [id, v] of s?.fahrzeuge?.entries() ?? []) {
    if (v.art !== 'leopard' || Math.hypot(v.x - x, v.y - y) > 120) continue;
    const o = scene.busObj.get(id); if (o) o.rueck = 1;
  }
}

// Schuss der 30-mm-Kanone des fahrbaren Pumas: Leuchtspur und Mündungsblitz am Rohrende, Pulverrauch, Einschlag, Knall (Server schickt Mündung und Ziel)
export function pumaFahrbarSchuss(scene, m) {
  const w = Math.atan2(m.y2 - m.y1, m.x2 - m.x1), c = Math.cos(w), sn = Math.sin(w), mx = m.x1, my = m.y1;
  const g = scene.add.graphics().setDepth(7), l1 = Math.min(1, 70 / Math.max(1, Math.hypot(m.x2 - mx, m.y2 - my)));
  g.lineStyle(1.5, 0xffcc80, 1).lineBetween(mx, my, mx + (m.x2 - mx) * l1, my + (m.y2 - my) * l1);
  g.lineStyle(0.6, 0xffffff, 0.9).lineBetween(mx, my, mx + (m.x2 - mx) * l1, my + (m.y2 - my) * l1);
  scene.tweens.add({ targets: g, x: (m.x2 - mx) * (1 - l1), y: (m.y2 - my) * (1 - l1), alpha: 0.2, duration: 110, onComplete: () => g.destroy() });
  scene.muendungsLicht(mx, my, '', 'puma');
  const blitz = scene.add.image(mx, my, 'figuren2', scene.figurBild2('muendungsblitz')).setOrigin(0.5).setBlendMode('ADD').setRotation(m.w ?? w).setScale(0.6).setDepth(7);
  scene.tweens.add({ targets: blitz, alpha: 0, duration: 100, onComplete: () => blitz.destroy() });
  for (let i = 0; i < 6; i++) {
    const r = scene.add.circle(mx + (Math.random() - 0.5) * 5, my + (Math.random() - 0.5) * 5, 2.5 + Math.random() * 2.5, 0xbdbdbd, 0.55).setDepth(6.5);
    scene.tweens.add({ targets: r, x: r.x + c * (5 + Math.random() * 12) + (Math.random() - 0.5) * 8, y: r.y + sn * (5 + Math.random() * 12) + (Math.random() - 0.5) * 8, alpha: 0, scale: 2.2, duration: 700, onComplete: () => r.destroy() });
  }
  scene.explosion(m.x2, m.y2, 24, 0.45);
  if (m.t) fetzen(scene, m.x2, m.y2, w, 2);
  ton.kanone(m.x1, m.y1);
}

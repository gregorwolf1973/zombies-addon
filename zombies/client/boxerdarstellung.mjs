// Darstellung des Radpanzers Boxer (Level Königsdorf): Wanne als Fahrzeugbild, Turm mit Rohr als eigenes Bild, das dem Server-Turmwinkel
// folgt; Mündungsfeuer und MG-Ton beim Dauerfeuer. Logik und Zahlen: server/boxer.mjs, client/boxer.mjs.
import { BOXER } from './boxer.mjs';
import { fetzen } from './effekte.mjs';
import * as ton from './ton.mjs';

const winkelDiff = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));

export function boxerLaden(scene) {
  scene.load.image('boxer-wanne', 'grafik/boxer_wanne.webp');   // Draufsichten aus dem 3D-Modell (Bug rechts), siehe grafik/LIZENZ.txt
  scene.load.image('boxer-turm', 'grafik/boxer_turm.webp');
}

// Bild des Fahrzeugs (Textur-Schlüssel) oder null, wenn die Bilder fehlen
export const boxerBild = scene => scene.textures.exists('boxer-wanne') ? 'boxer-wanne' : null;

// Zusatzteile und Skalierung des Boxers (Container o: box, bild, sch; Rotation des Containers = Fahrtrichtung)
export function boxerFahrzeug(scene, o, f, dt) {
  o.bild.setScale(BOXER.skala, BOXER.skalaQuer);
  o.sch?.setScale(BOXER.skala, BOXER.skalaQuer);   // Schattenbild = Silhouette derselben Textur: immer wie die Wanne skalieren (auch ohne Turmbild)
  if (!scene.textures.exists('boxer-turm')) return;
  if (!o.turm) {
    o.turm = scene.add.image(BOXER.turmX, BOXER.turmY, 'boxer-turm').setOrigin(BOXER.turmOx, BOXER.turmOy).setScale(BOXER.skala, BOXER.skalaQuer);
    o.box.addAt(o.turm, 1); o.turmW = Number.isFinite(f.turm) ? f.turm : o.r;
  }
  // Turmwinkel kommt vom Server (dreht dort mit begrenztem Tempo); hier wird nur geglättet. Der Turm hängt im Container der Wanne: lokaler Winkel = Welt − Wanne
  o.turmW += winkelDiff(o.turmW, Number.isFinite(f.turm) ? f.turm : o.r) * Math.min(1, dt * 14);
  o.turm.setRotation(o.turmW - o.r);
}

// Schuss des Turms: Leuchtspur und Mündungsblitz am Rohrende, Ton wie bei den MG-Nestern (Server schickt Mündung und Ziel)
export function boxerSchuss(scene, m) {
  const w = Math.atan2(m.y2 - m.y1, m.x2 - m.x1), mx = m.x1 + Math.cos(w) * 2, my = m.y1 + Math.sin(w) * 2;
  const g = scene.add.graphics().setDepth(7), l1 = Math.min(1, 70 / Math.max(1, Math.hypot(m.x2 - mx, m.y2 - my)));
  g.lineStyle(2, 0xffee58, 1).lineBetween(mx, my, mx + (m.x2 - mx) * l1, my + (m.y2 - my) * l1);
  g.lineStyle(1, 0xffffff, 0.9).lineBetween(mx, my, mx + (m.x2 - mx) * l1, my + (m.y2 - my) * l1);
  scene.tweens.add({ targets: g, x: (m.x2 - mx) * (1 - l1), y: (m.y2 - my) * (1 - l1), alpha: 0.2, duration: 110, onComplete: () => g.destroy() });
  scene.muendungsLicht(mx, my, '', 'mg');
  const blitz = scene.add.image(mx, my, 'figuren2', scene.figurBild2('muendungsblitz')).setOrigin(0.5).setBlendMode('ADD').setRotation(w).setScale(0.34).setDepth(7);
  scene.tweens.add({ targets: blitz, alpha: 0, duration: 60, onComplete: () => blitz.destroy() });
  if (m.t) fetzen(scene, m.x2, m.y2, w, 0.8);
  const jetzt = performance.now();
  if (jetzt - (scene.letzterBoxerKnall ?? 0) > 70) { scene.letzterBoxerKnall = jetzt; ton.schuss(m.x1, m.y1, 1.4, 'mg'); }
}

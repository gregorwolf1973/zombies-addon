// Kettenspuren: rollende Panzer (Puma, Leopard an der B 11, Evakuierungs-Leopard in den Isarauen) hinterlassen Abdrücke auf dem Boden.
// Reiner Client-Effekt: ein fester Pool von Bildern (Ringpuffer, ältester wird wiederverwendet), jeder Abdruck verblasst über ~2,5 Minuten.
// Aufruf: kettenSpur(scene, id, x, y, winkel, breite) bei jeder Bewegung des Fahrzeugs, kettenAnimieren(scene) einmal je Bild.
const POOL = 600, LEBEN_MS = 150000, ABSTAND = 12, LAENGE = 14, ANFANG = 0.5;

// Textur eines Abdrucks für ein Fahrzeug der Breite b: zwei Ketten mit Querrippen (Bug nach rechts)
function textur(scene, b) {
  const key = 'kettenspur-' + b;
  if (scene.textures.exists(key)) return key;
  const kb = Math.max(4, Math.round(b * 0.26)), t = scene.textures.createCanvas(key, LAENGE, b), c = t.getContext();
  for (const y0 of [1, b - kb - 1]) {
    c.fillStyle = 'rgba(20,16,12,1)'; c.fillRect(0, y0, LAENGE, kb);
    c.fillStyle = 'rgba(0,0,0,0.55)';
    for (let x = 1; x < LAENGE; x += 4) c.fillRect(x, y0, 2, kb);   // Stollen
  }
  t.refresh();
  return key;
}

export function kettenSpur(scene, id, x, y, w, breite) {
  const k = scene.ketten ??= { pool: [], n: 0, letzte: new Map(), t: 0, ebene: null };
  const l = k.letzte.get(id);
  if (l && Math.hypot(x - l.x, y - l.y) < ABSTAND) return;
  k.letzte.set(id, { x, y });
  if (!l) return;   // erster Aufruf nur Startpunkt merken
  const b = Math.round(breite), key = textur(scene, b);
  let o = k.pool[k.n % POOL];
  if (!o) { o = scene.add.image(0, 0, key).setDepth(1.07); k.pool[k.n % POOL] = o; }
  k.n++;
  o.setTexture(key).setPosition(x, y).setRotation(w).setAlpha(ANFANG).setVisible(!scene.aktEbene);
  o.geboren = scene.time.now;
}

// Abdrücke verblassen lassen (nur alle 0,5 s) und im Innenraum ausblenden
export function kettenAnimieren(scene) {
  const k = scene.ketten;
  if (!k) return;
  const jetzt = scene.time.now;
  if (jetzt - k.t < 500 && k.ebene === scene.aktEbene) return;
  k.t = jetzt; k.ebene = scene.aktEbene;
  for (const o of k.pool) {
    if (!o || o.geboren === undefined) continue;
    const alter = jetzt - o.geboren;
    if (alter >= LEBEN_MS) { o.setVisible(false); o.geboren = undefined; continue; }
    o.setAlpha(ANFANG * (1 - alter / LEBEN_MS)).setVisible(!scene.aktEbene);
  }
}

// Gemeinsame Zielwahl für Steilfeuer und Kanonen (Panzermörser, Leopard-Hauptkanone): Zombiehaufen finden, Sicherheitsradius prüfen.
// Maße in Spielpixeln (8 px = 1 m). Es wird nie auf einen Punkt geschossen, in dessen Sicherheitsradius ein Spieler oder Mensch steht.
export const PX = 8;

// Wer im Sicherheitsradius R (px) um (x, y) steht: Spieler (auch Bots, draußen) und Menschen
export function gefaehrdet(s, x, y, R) {
  for (const p of s.spieler.values()) if (!p.ebene && p.sichtbar !== false && Math.hypot(p.x - x, p.y - y) < R) return true;
  for (const m of s.menschen?.values?.() ?? []) if (!m.ebene && Math.hypot(m.x - x, m.y - y) < R) return true;
  return false;
}

// bester Einschlagpunkt: Schwerpunkt des Zombies mit den meisten Nachbarn im Haufenradius R (px), mindestens `min` Zombies,
// Entfernung vom Punkt `von` zwischen rmin und rmax (px), Sicherheitsradius `sicher` (px) frei; sonst null. Ergebnis { x, y, n, d }
export function haufenZiel(s, von, { rmin, rmax, R, min, sicher }) {
  const liste = [];
  for (const z of s.zombies.values()) if (!z.ebene && z.hp > 0) liste.push(z);
  let best = null;
  for (const z of liste) {
    const d = Math.hypot(z.x - von.x, z.y - von.y);
    if (d < rmin || d > rmax) continue;
    let n = 0, sx = 0, sy = 0;
    for (const q of liste) if (Math.hypot(q.x - z.x, q.y - z.y) <= R) { n++; sx += q.x; sy += q.y; }
    if (n < min) continue;
    const x = sx / n, y = sy / n, dd = Math.hypot(x - von.x, y - von.y);
    if (dd < rmin || dd > rmax || gefaehrdet(s, x, y, sicher)) continue;
    if (!best || n > best.n || (n === best.n && dd < best.d)) best = { x, y, n, d: dd };
  }
  return best;
}

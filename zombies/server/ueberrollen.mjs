// Fahrzeuge überrollen Zombies (gemeinsam für den Evakuierungspanzer Leopard, server/aufgaben.mjs, und den Puma im Lager,
// server/stuetzpunkt.mjs): Zombies im Fußabdruck der Wanne sterben auf der Stelle (kein Kriechen), Blut und Leiche wie üblich.
// Sie zählen nicht für die Aufgaben der Spieler (state.besiegt bleibt). Spieler überrollt nie jemand: die Fahrzeuge bremsen vor ihnen.
import { imFussabdruck } from '../client/evak.mjs';

export const UEBERROLLEN_PAUSE = 0.1;   // so oft (s) wird der Fußabdruck auf Zombies geprüft

// f = { x, y, richtung } (Wannenmitte, Fahrtrichtung), hl/hb = halbe Länge/Breite der Wanne (px), von = „Schütze“ für raum.schaden
// ({ name, x, y, besiegt }); liefert die Zahl der überrollten Zombies
export function ueberrolleZombies(raum, f, hl, hb, von) {
  const s = raum.state;
  let n = 0;
  for (const [id, z] of [...s.zombies]) {
    if (z.ebene || !(z.hp > 0) || Math.abs(z.x - f.x) > hl + 12 || Math.abs(z.y - f.y) > hl + 12) continue;
    if (!imFussabdruck(f, z.x, z.y, hl, hb, 6)) continue;
    const vorher = s.besiegt;
    von.x = f.x; von.y = f.y;
    z.kriecht = true;                         // nicht ganz tot: gibt es nicht, die Ketten erledigen ihn
    raum.schaden(id, z, z.hp + 1, von);
    s.besiegt = vorher;                       // zählt nicht für die Aufgaben der Spieler
    raum.broadcast('ueberrollt', { x: z.x, y: z.y });
    n++;
  }
  return n;
}

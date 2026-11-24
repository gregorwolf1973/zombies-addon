// Schießstand / Tutorial: kleine, erzeugte Übungswelt (freie Wiese, Bundeswehr-Standort im Norden, Entfernungsmarken im Süden).
// Server (server/schiessstand.mjs) und Client (spiel.mjs, tutorial.mjs) bauen dieselbe Welt aus diesen Maßen.
// Die Übungsfläche ist immer SS_B × SS_H Kacheln groß und liegt links oben; ist die Kartengröße (BREITE × HOEHE) größer
// – der Server rechnet mit der Größe der Hauptwelt –, ist alles außerhalb der Fläche gesperrt.
import { KACHEL, BREITE, HOEHE, T, FEIN } from './welt.mjs';
import { baueStuetzpunkt, SP_KB, SP_KT } from './stuetzpunkt.mjs';

export const SS_B = 64, SS_H = 48;                    // Übungsfläche in Kacheln (2048 × 1536 px = 256 × 192 m)
export const SS_LAGER = { x0: 32 - SP_KB / 2, y0: 24 - SP_KT, b: SP_KB, h: SP_KT, richtung: 's' };   // Stützpunkt im Norden, Front nach Süden (Front bei y 24, mittig über dem Spieler)
export const SS_START = { x: 32 * KACHEL, y: 25 * KACHEL };               // hier steht der Spieler (0-m-Linie)
export const SS_MARKEN = [10, 25, 50, 75];            // Meter ab dem Spieler nach Süden (8 px = 1 m)
export const SS_ZOMBIE_Y = SS_START.y + 75 * 8 + 44;  // Zombies starten hinter der 75-m-Marke
export const PX_PRO_METER = 8;

export function baueSchiessstandWelt() {
  const k = new Uint8Array(BREITE * HOEHE).fill(T.ZAUN);
  const hole = (x, y) => (x >= 0 && y >= 0 && x < BREITE && y < HOEHE) ? k[y * BREITE + x] : T.ZAUN;
  const w = Math.min(SS_B, BREITE), h = Math.min(SS_H, HOEHE);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) k[y * BREITE + x] = T.WIESE;
  // Feinraster (1 m): Zaun und alles außerhalb der Fläche sind fest
  const fb = BREITE * FEIN, fh = HOEHE * FEIN, fein = new Uint8Array(fb * fh).fill(1);
  for (let y = FEIN; y < (h - 1) * FEIN; y++) for (let x = FEIN; x < (w - 1) * FEIN; x++) fein[y * fb + x] = 0;
  const start = { x: SS_START.x, y: SS_START.y };
  const welt = {
    seed: 4242, kacheln: k, hole, haeuser: [], markt: { x: 0, y: 0, b: 0, h: 0 }, tor: { x: w - 2, y: h - 2 }, start, safeRooms: [],
    behaelter: [], deko: [], fein, sperren: [], parkbuchten: [],
  };
  baueStuetzpunkt(welt, welt.seed, (x, y, v) => { if (x >= 0 && y >= 0 && x < BREITE && y < HOEHE) k[y * BREITE + x] = v; }, SS_LAGER);
  return welt;
}

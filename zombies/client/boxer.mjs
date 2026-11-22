// Radpanzer „Boxer“ (Level Königsdorf): Maße und Einstiegsprüfung, gemeinsam für Server (server/boxer.mjs) und Client.
// Bilder: grafik/boxer_wanne.webp und boxer_turm.webp (Draufsicht aus dem 3D-Modell, Bug nach rechts, tools/boxer_bilder.py).
// Maße in Spielpixeln (8 px = 1 m): Wanne 7,9 m = 63,2 px lang, 3,0 m = 24 px breit (Fußabdruck mit Rädern); das Bild ist 2,6 m breit.
import { imFussabdruck } from './evak.mjs';

export const BOXER = {
  laenge: 63.2, breite: 24, skala: 0.2941,                 // Wannenbild: Spielpixel je Bildpunkt
  turmX: -2.72, turmY: 0.01, turmOx: 0.2753, turmOy: 0.5774,   // Turmdrehpunkt (vorn/rechts von der Wannenmitte) und Drehpunkt im Turmbild (Anteile)
  muendung: 26.7,                                          // Rohrende: so weit vor dem Turmdrehpunkt
};
export const BOXER_EINSTIEG = 22;   // Spielpixel (2,75 m) Abstand zur Wanne, aus dem man einsteigen kann

// Steht der Punkt (px, py) nah genug am Boxer f (x, y, richtung) zum Einsteigen?
export function boxerNah(f, px, py) {
  return imFussabdruck(f, px, py, BOXER.laenge / 2, BOXER.breite / 2, BOXER_EINSTIEG);
}

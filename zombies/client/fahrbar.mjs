// Fahrbare Kampffahrzeuge (Boxer, Puma, Leopard): Maße, Turmlage und Einstiegsprüfung, gemeinsam für Server (server/fahrbar.mjs) und Client.
// Der Boxer steht am Flugfeld Königsdorf (client/boxer.mjs), Puma und Leopard setzt ein Superuser oder der Schießstand. Maße in Spielpixeln (8 px = 1 m).
import { BOXER, BOXER_EINSTIEG } from './boxer.mjs';
import { LEOPARD, imFussabdruck } from './evak.mjs';
import { fzPx } from './masse.mjs';
import { PUMA_SKALA, PUMA_BILD } from './stuetzpunkt.mjs';

const [PUMA_L, PUMA_B] = fzPx('puma');
const PUMA_K = PUMA_SKALA * PUMA_L / PUMA_BILD.laenge;   // Spielpixel je Modellmeter (wie in der Darstellung des Lager-Pumas)

// je Art: Anzeigename, Wannenmaße und Turmdrehpunkt im Wannen-Rahmen (vorn, rechts); muendung = Rohrende vor dem Turmdrehpunkt
export const FAHRBAR = {
  boxer: { name: 'Boxer', laenge: BOXER.laenge, breite: BOXER.breite, turmX: BOXER.turmX, turmY: BOXER.turmY, muendung: BOXER.muendung },
  puma: { name: 'Puma', laenge: PUMA_L, breite: PUMA_B, turmX: PUMA_BILD.turmX * PUMA_K, turmY: PUMA_BILD.turmY * PUMA_K, muendung: PUMA_BILD.muendung * PUMA_K, k: PUMA_K },
  leopard: { name: 'Leopard', laenge: LEOPARD.laenge, breite: LEOPARD.breite, turmX: LEOPARD.turmX, turmY: LEOPARD.turmY, muendung: LEOPARD.muendung },
};
export const FAHRBAR_ARTEN = Object.keys(FAHRBAR);
export const FAHRBAR_EINSTIEG = BOXER_EINSTIEG;   // Spielpixel Abstand zur Wanne, aus dem man einsteigen kann
export const FAHRBAR_PLAETZE = 4;

// Steht der Punkt (px, py) nah genug am Fahrzeug f (x, y, richtung) der Art `art` zum Einsteigen?
export function fahrbarNah(art, f, px, py) {
  const m = FAHRBAR[art];
  return !!m && imFussabdruck(f, px, py, m.laenge / 2, m.breite / 2, FAHRBAR_EINSTIEG);
}

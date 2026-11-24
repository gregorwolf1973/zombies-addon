// Werte für Explosions-Effekte (spiel.mjs explosion): Puma-Einschlag (staerke < 0.5) ist klein und kurz – etwas Staub, Funken, kein
// langer Brandfleck. Granaten/Leopard-Kanone (staerke ≥ 0.5) behalten die großen Werte (fein = false, dort gilt der alte Code).
export const EINSCHLAG_FEIN_AB = 0.5;
export function einschlagWerte(r = 40, staerke = 1) {
  if (!(staerke < EINSCHLAG_FEIN_AB)) return { fein: false };
  return {
    fein: true,
    blitzR: r * 0.3,                 // kurzer Mündungs-/Einschlagblitz
    ring: false,                     // keine Druckwelle
    funkenWeite: [r * 0.3, r * 0.8], // Funken fliegen höchstens ~20 px
    staub: { n: Math.round(14 * staerke) + 2, r: [1, 2], alpha: 0.28, farbe: 0xb3a68a, wachs: 1.8, dauer: [350, 600], weite: [r * 0.1, r * 0.45], steig: [2, 6] },
    brand: null,                     // kein Fleck am Boden
  };
}

// Laufstick (Touch/Maus-Ziehen): Die ersten STICK_TOT px (≈ 2 mm) sind die Drehzone – dort drehen Figur und Taschenlampe
// in die Zugrichtung, ohne zu laufen. Erst danach läuft die Figur; volle Auslenkung nach weiteren STICK_WEG px
// (Schleichen bis 55 % wie bisher, also gleich breit wie vor der Drehzone).
export const STICK_TOT = 12;
export const STICK_WEG = 60;
const STICK_RUHE = 4;   // kleiner als das: Zittern beim Aufsetzen, noch keine Richtung

// dx, dy: Fingerweg seit dem Aufsetzen (Bildschirm-px) → { vx, vy (Laufeingabe 0..1), kx, ky (Knopf-Versatz), winkel, dreht, laeuft }
export function stickWert(dx, dy) {
  const d = Math.hypot(dx, dy);
  if (d < STICK_RUHE) return { vx: 0, vy: 0, kx: dx, ky: dy, winkel: null, dreht: false, laeuft: false };
  const ex = dx / d, ey = dy / d, winkel = Math.atan2(dy, dx);
  const k = Math.min(d, STICK_TOT + STICK_WEG);
  if (d <= STICK_TOT) return { vx: 0, vy: 0, kx: ex * k, ky: ey * k, winkel, dreht: true, laeuft: false };
  const l = Math.min(1, (d - STICK_TOT) / STICK_WEG);
  return { vx: ex * l, vy: ey * l, kx: ex * k, ky: ey * k, winkel, dreht: false, laeuft: true };
}

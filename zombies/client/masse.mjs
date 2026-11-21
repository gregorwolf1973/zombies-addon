// Maßstab des Spiels: KACHEL = 32 px = 4 m, also 8 px = 1 m (Server und Client).
// Hier stehen die echten Maße (Meter) der Fahrzeuge, die als Bild gezeichnet werden; Darstellung und Abstandswerte
// (server/verkehr.mjs LAENGE, client/evak.mjs) leiten sich daraus ab. Breite = inklusive Außenspiegel (von oben sichtbar).
export const PX_M = 8;

// Länge × Breite in Metern
export const FZ_M = {
  pkw: [4.5, 2.0], sport: [4.4, 2.0], taxi: [4.8, 2.0], transporter: [5.5, 2.1], kleinbus: [5.2, 2.1],
  laster: [9, 2.9], polizei: [4.9, 2.0], krankenwagen: [5.9, 2.3], feuerwehr: [9.5, 2.7], bus: [12, 2.7], evakuierung: [12, 2.7],
  puma: [7.3, 3.7], leopard: [7.7, 3.75], m113: [4.9, 2.7],
};
// Pixel (Länge, Breite) einer Fahrzeugart; null, wenn unbekannt
export const fzPx = art => { const m = FZ_M[art]; return m ? [m[0] * PX_M, m[1] * PX_M] : null; };

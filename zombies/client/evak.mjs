// Evakuierungsarten (Server und Client): Bus, Panzer (Leopard 2A7) und Flugzeug (A400M, danach Hubschrauber).
// Maße in Spielpixeln (8 px = 1 m). Gemeinsam genutzt von server/aufgaben.mjs und client/evakdarstellung.mjs.
export const EVAK_KARTEN = { isarauen: 'panzer' };            // Evakuierungsart je Karte (nicht aufgeführt = Bus)
export const evakArtFuer = karte => EVAK_KARTEN[karte] ?? 'bus';

// Leopard 2A7: Wanne 113 px lang (Bild: tools/leopard_bilder.py, 14,59 Spielpixel je Modellmeter), Turmdrehpunkt 14,9 px vor der Wannenmitte,
// Lader-MG (Knoten Axe_Canon_02) im Turm-Rahmen (nach vorn, nach rechts) = (−7,6 | −13,7)
export const LEOPARD = {
  laenge: 113, breite: 56, skala: 0.5527,                  // Wannenbild: Spielpixel je Bildpunkt
  turmX: 14.9, turmY: 0, turmOx: 0.392, turmOy: 0.490,     // Drehpunkt im Turmbild (Anteile)
  mgX: -7.6, mgY: -13.7,
};

// A400M: 45 m lang, 42 m Spannweite (Bild: tools/a400m_bilder.py, 800 Spielpixel je Modelleinheit, Rumpfbild 544×506 px)
export const A400M = {
  laenge: 369, breite: 343, skala: 0.6816,
  naben: [[77.3, -103.5], [90.6, -56.1], [90.6, 54.8], [77.3, 102.2]],   // Propellernaben (nach vorn, nach rechts), von links nach rechts
  heck: 204,                                                              // Heckrampe: so weit hinter der Rumpfmitte (Einstiegspunkt)
  landeStrecke: 720, landeBreite: 170, rollweg: 320,                      // freie Fläche (Länge × Breite) und Weg der Landerolle
};

// Liegt der Punkt im Fußabdruck eines Fahrzeugs (Mitte f.x/f.y, Richtung f.richtung, halbe Länge hl, halbe Breite hb, Zuschlag zu)?
export function imFussabdruck(f, x, y, hl, hb, zu = 0) {
  const dx = x - f.x, dy = y - f.y, c = Math.cos(f.richtung), s = Math.sin(f.richtung);
  const u = dx * c + dy * s, v = -dx * s + dy * c;
  return Math.abs(u) <= hl + zu && Math.abs(v) <= hb + zu;
}

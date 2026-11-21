// Evakuierungsarten (Server und Client): Bus, Panzer (Leopard 2A7) und Flugzeug (A400M, danach Hubschrauber).
// Maße in Spielpixeln (8 px = 1 m). Gemeinsam genutzt von server/aufgaben.mjs und client/evakdarstellung.mjs.
export const EVAK_KARTEN = { isarauen: 'panzer', koenigsdorf: 'absturz', kochel: 'heli', andermatt: 'bunker' };            // Evakuierungsart je Karte (nicht aufgeführt = Bus)
export const evakArtFuer = karte => EVAK_KARTEN[karte] ?? 'bus';

// Leopard 2A7: Wanne 7,7 m = 61,6 px lang, 3,75 m = 30 px breit (Bild: tools/leopard_bilder.py, 8 px je Meter -> 7,95 Spielpixel je Modellmeter;
// früher 1,83-fach zu groß mit 113 px), Turmdrehpunkt 8,1 px vor der Wannenmitte, Lader-MG (Knoten Axe_Canon_02) im Turm-Rahmen (nach vorn, nach rechts)
export const LEOPARD = {
  laenge: 61.6, breite: 30, skala: 0.3013,                 // Wannenbild: Spielpixel je Bildpunkt
  turmX: 8.1, turmY: 0, turmOx: 0.392, turmOy: 0.490,      // Drehpunkt im Turmbild (Anteile)
  mgX: -4.1, mgY: -7.5,
  kommandantX: -0.5, kommandantY: 6,                       // Lukenplätze im Turm-Rahmen: Kommandant rechts hinten, Ladeschütze (mit MG) links
  muendung: 48.5,                                          // Rohrende: so weit vor dem Turmdrehpunkt (Rohr ragt gut 3 m über die Wanne, gesamt ~10,9 m)
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

// Hubschrauber NH90 (tools/fahrzeug_bilder.py): Rumpf 16,96 m inkl. Heckrotor, Hauptrotor 16 m. Spielmaßstab 8 px je Meter, Bilder mit 12 Bildpunkten je Meter -> skala 0.667.
// Container-Ursprung = Rotornabe; der Rumpf sitzt dort um (rumpfX | rumpfY) versetzt (Bug nach rechts)
export const HELI = { skala: 0.6667, rumpfX: -23.0, rumpfY: 3.65, rotorRadius: 64 };

// Tanklaster als Kulisse neben der Nase des gelandeten A400M (Container-Rahmen des Flugzeugs: nach vorn / nach rechts), 100 px lang
export const TANKLASTER = { skala: 0.6667, x: 178, y: 72 };


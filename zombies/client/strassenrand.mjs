// Ausbeulungen am Straßen-/Wegrand: etwa alle 20-30 m weicht eine Seite um 0,3-0,8 m nach außen ab
// (weich ein- und auslaufend). Nur Zeichnung; deterministisch aus dem Seed, damit alle Clients gleich zeichnen.
const PX = 8;                     // 8 px = 1 m
export const BEULE_ABSTAND = 25 * PX;   // Fachlänge (mittlerer Abstand der Beulen ~20-35 m)
export const BEULE_MIN = 0.3 * PX, BEULE_MAX = 0.8 * PX;
const hash = n => { let h = Math.imul(n | 0, 2654435761); h = Math.imul(h ^ (h >>> 15), 2246822519); return ((h ^ (h >>> 13)) >>> 0) / 4294967296; };

// Rückgabe: Funktion s (Bogenlänge px) -> Verschiebung nach außen in px, vorzeichenrichtig für `seite` (+1/-1), Betrag <= BEULE_MAX.
export function ausbeulung(seed, seite = 1) {
  const L = BEULE_ABSTAND, sg = seite > 0 ? 1 : -1;
  const fach = k => {
    if (hash(seed * 131 + k * 7 + 1) < 0.25) return null;              // nicht jedes Fach hat eine Beule
    return {
      mitte: (k + 0.3 + 0.4 * hash(seed * 97 + k * 13 + 2)) * L,
      halb: (3.5 + 3.5 * hash(seed * 53 + k * 29 + 3)) * PX,
      a: BEULE_MIN + (BEULE_MAX - BEULE_MIN) * hash(seed * 71 + k * 17 + 4),
    };
  };
  return s => {
    const k0 = Math.floor(s / L); let r = 0;
    for (let k = k0 - 1; k <= k0 + 1; k++) {
      const b = fach(k); if (!b) continue;
      const t = Math.abs(s - b.mitte) / b.halb; if (t >= 1) continue;
      r = Math.max(r, b.a * (0.5 + 0.5 * Math.cos(Math.PI * t)));      // Glocke, Ränder mit Steigung 0
    }
    return r * sg;
  };
}

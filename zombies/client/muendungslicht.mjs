// Mündungsfeuer erhellt die Umgebung (nur Darstellung): jeder Schuss erzeugt einen ~80 ms langen warmen Lichtblitz,
// der die nächtliche Abdunklung (draußen und in dunklen Innenräumen) kurz aufhebt. Die Blitze liegen in einer festen Liste
// (kein neues Objekt pro Frame, höchstens MAX gleichzeitig; bei Dauerfeuer wird der älteste überschrieben, das Licht flackert).
export const MUENDUNG_MAX = 12;
export const MUENDUNG_DAUER = 80;      // ms
export const PX_JE_METER = 8;          // 8 px = 1 m (draußen und im Feinraster)
export const WEICH_RADIUS = 128;       // Radius der Textur „lichtweich“ in px bei Maßstab 1

// Radius des Lichtblitzes in Metern je Schussart (art der Schuss-Nachricht bzw. Fahrzeug-/Szenenschuss)
const RADIUS_M = {
  pistole: 5, mp: 6, gewehr: 7, mg: 7, scharfschuetze: 7, soldat: 7, schrotflinte: 8,
  puma: 15, kanone: 18, leopard: 20,
};
export const radiusMeter = art => RADIUS_M[art] ?? 5;

export class Blitzliste {
  constructor(max = MUENDUNG_MAX) {
    this.blitze = Array.from({ length: max }, () => ({ x: 0, y: 0, ebene: '', r: 0, t0: -1e9 }));
  }
  // legt einen Blitz an: freien/abgelaufenen Platz nehmen, sonst den ältesten überschreiben
  neu(x, y, ebene, art, jetzt) {
    let wahl = this.blitze[0];
    for (const b of this.blitze) {
      if (jetzt - b.t0 >= MUENDUNG_DAUER) { wahl = b; break; }
      if (b.t0 < wahl.t0) wahl = b;
    }
    wahl.x = x; wahl.y = y; wahl.ebene = ebene ?? ''; wahl.r = radiusMeter(art) * PX_JE_METER; wahl.t0 = jetzt;
    return wahl;
  }
  // Stärke 1 → 0 über die Dauer, schnell abklingend (quadratisch); 0 = abgelaufen
  static staerke(b, jetzt) {
    const a = (jetzt - b.t0) / MUENDUNG_DAUER;
    return a < 0 || a >= 1 ? 0 : (1 - a) * (1 - a);
  }
  // ruft fn(blitz, staerke) für jeden aktiven Blitz auf der Ebene auf (keine Zuteilung)
  jeder(jetzt, ebene, fn) {
    for (const b of this.blitze) {
      const s = Blitzliste.staerke(b, jetzt);
      if (s > 0 && b.ebene === (ebene ?? '')) fn(b, s);
    }
  }
}

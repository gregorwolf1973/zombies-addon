// Autoradio im selbst gefahrenen Auto (pkw und Streifenwagen): Knopf „📻 Radio“ / Taste R schaltet das Live-Radio (Einstellung radioStream) nur für
// den eigenen Spieler ein und aus; beim Aussteigen geht es von selbst aus; bei Sirene (Streifenwagen) spielt es leiser. Hier nur die Regeln
// (reine Funktionen, getestet in tests/pkw_radio.test.mjs); der Ton selbst steckt in client/ton.mjs (autoradioInnen).
export const RADIO_LEISE = 0.3;   // Lautstärkefaktor bei eingeschalteter Sirene

// Knopf gedrückt: im Auto umschalten, außerhalb nie einschalten
export const radioUmschalten = (an, imAuto) => (imAuto ? !an : false);
// Soll das Radio gerade spielen? Aussteigen schaltet es aus (beim nächsten Einsteigen ist es wieder aus)
export const radioSoll = (an, imAuto) => !!an && !!imAuto;
// Lautstärkefaktor im Auto
export const radioFaktor = sirene => (sirene ? RADIO_LEISE : 1);
// Beschriftung des Knopfes
export const radioText = an => (an ? '📻 Radio aus' : '📻 Radio');

// Zustand je Bild: { an, spielt } → neuer Zustand + was zu tun ist ('start' | 'stopp' | null)
export function radioAbgleich(an, imAuto, spielt) {
  const soll = radioSoll(an, imAuto);
  return { an: soll, spielt: soll, tun: soll && !spielt ? 'start' : !soll && spielt ? 'stopp' : null };
}

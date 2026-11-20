// Schwierigkeit je Level und Spieltag (Tabelle von DeepSeek, geprüft); Regler leicht/normal/schwer multipliziert
// Schwierigkeitsberechnung für ein Koop-Zombiespiel
// Reines ES-Modul ohne Importe.

// Level-Tabelle: Index 0 = Level 1 ... Index 4 = Level 5
export const LEVEL_TABELLE = [
  { dichte: 1.0,  horde: 1.0,  abstand: 1.0,  schnell: 0.0,  beute: 1.0,  munition: 1.0,  nacht: 1.0 },
  { dichte: 1.1875, horde: 1.25, abstand: 0.9,  schnell: 0.095, beute: 0.925, munition: 0.9, nacht: 1.1 },
  { dichte: 1.375,  horde: 1.5,  abstand: 0.8,  schnell: 0.19, beute: 0.85,  munition: 0.8, nacht: 1.2 },
  { dichte: 1.5625, horde: 1.75, abstand: 0.7,  schnell: 0.285, beute: 0.775, munition: 0.7, nacht: 1.3 },
  { dichte: 1.75,  horde: 2.0,  abstand: 0.6,  schnell: 0.38, beute: 0.7,   munition: 0.6, nacht: 1.4 }
];

// Reglerfaktoren für die gewählte Schwierigkeit
export const REGLER = { leicht: 0.75, normal: 1, schwer: 1.3 };

// Tagesbonus: +8 % pro Spieltag, gedeckelt bei +60 %
export const TAG_BONUS = 0.08;
export const TAG_MAX = 0.6;

// Hilfsfunktion: auf 3 Nachkommastellen runden
function runde3(n) {
  return Math.round(n * 1000) / 1000;
}

// Hauptfunktion: berechnet alle Schwierigkeitswerte
export function schwierigkeit({ level, tage, regler = 'normal' } = {}) {
  // Level validieren: ganze Zahl >= 1, über 5 wie 5 behandeln
  let lvl = Number(level);
  if (!Number.isFinite(lvl) || !Number.isInteger(lvl) || lvl < 1) lvl = 1;
  if (lvl > 5) lvl = 5;
  const tab = LEVEL_TABELLE[lvl - 1];

  // Tage validieren: ungültig oder negativ = 0
  let t = Number(tage);
  if (!Number.isFinite(t) || t < 0) t = 0;
  t = Math.floor(t);

  // Regler bestimmen
  let r;
  if (typeof regler === 'number') {
    if (!Number.isFinite(regler)) {
      r = 1;
    } else {
      r = Math.min(2, Math.max(0.5, regler));
    }
  } else if (typeof regler === 'string') {
    r = REGLER[regler] !== undefined ? REGLER[regler] : REGLER.normal;
  } else {
    r = REGLER.normal;
  }

  // Tagesbonus berechnen
  const bonus = Math.min(TAG_MAX, t * TAG_BONUS);

  // Einzelne Werte berechnen
  const dichte = tab.dichte * (1 + bonus) * r;
  const horde = tab.horde * (1 + bonus) * r;
  let abstand = tab.abstand / ((1 + bonus) * r);
  if (abstand < 0.25) abstand = 0.25;
  const schnell = Math.min(0.7, (tab.schnell + bonus * 0.25) * r);
  const beute = Math.max(0.35, tab.beute / ((1 + bonus / 2) * r));
  const munition = Math.max(0.35, tab.munition / ((1 + bonus / 2) * r));
  const nacht = Math.min(1.8, tab.nacht * (1 + bonus / 2) * r);

  // Ergebnis mit Rundung zurückgeben
  return {
    dichte: runde3(dichte),
    horde: runde3(horde),
    abstand: runde3(abstand),
    schnell: runde3(schnell),
    beute: runde3(beute),
    munition: runde3(munition),
    nacht: runde3(nacht),
    bonus: runde3(bonus),
    regler: runde3(r)
  };
}

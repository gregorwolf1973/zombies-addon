// Schwierigkeit je Level und Spieltag (Tabelle von DeepSeek, geprüft); Regler leicht/normal/schwer multipliziert
// Schwierigkeitsberechnung für ein Koop-Zombiespiel
// Reines ES-Modul ohne Importe.

// Level-Tabelle: Index 0 = Level 1 ... Index 4 = Level 5
export const LEVEL_TABELLE = [
  { schnell: 0.0,  beute: 1.0,  munition: 1.0,  nacht: 1.0 },
  { schnell: 0.095, beute: 0.925, munition: 0.9, nacht: 1.1 },
  { schnell: 0.19, beute: 0.85,  munition: 0.8, nacht: 1.2 },
  { schnell: 0.285, beute: 0.775, munition: 0.7, nacht: 1.3 },
  { schnell: 0.38, beute: 0.7,   munition: 0.6, nacht: 1.4 }
];

// Zombies und Horden je Level (Vorgabe der Einstellung zombies.level, im Backend änderbar); Index 0 = Level 1
//   grund/jeSpieler: Zombies draußen = grund + jeSpieler × Spielerzahl (echte Spieler + 0,5 × Bots)
//   horde: Hordengröße je Spieler; dauer: Minuten, die eine Horde zusammenbleibt; pause: Minuten bis zur nächsten Horde
//   gleichzeitig: so viele Horden höchstens zugleich (0 = keine Horden); haeuser: schlafende Zombies je Zombieplatz in Häusern (10 = 1)
export const LEVEL_VORGABE = [
  { grund: 8,  jeSpieler: 5,  horde: 12, dauer: 10, pause: 5, gleichzeitig: 1, haeuser: 10 },
  { grund: 10, jeSpieler: 6,  horde: 15, dauer: 12, pause: 4, gleichzeitig: 1, haeuser: 11 },
  { grund: 12, jeSpieler: 7,  horde: 20, dauer: 12, pause: 3, gleichzeitig: 2, haeuser: 12 },
  { grund: 14, jeSpieler: 8,  horde: 25, dauer: 15, pause: 2, gleichzeitig: 2, haeuser: 14 },
  { grund: 16, jeSpieler: 10, horde: 30, dauer: 15, pause: 1, gleichzeitig: 2, haeuser: 16 },
];
// Empfohlene Spanne (die Verwaltung zeigt sie an) – eingebbar ist mehr, siehe LEVEL_SICHER
export const LEVEL_GRENZEN = { grund: [0, 200], jeSpieler: [0, 100], horde: [0, 200], dauer: [1, 60], pause: [0.5, 60], gleichzeitig: [0, 5], haeuser: [0, 50] };
// technische Obergrenzen (Server/Speicher): Zombies draußen/Horde/Häuser und Horden gleichzeitig; Zeiten bleiben bei der allgemeinen Sicherheitsgrenze
export const LEVEL_SICHER = { grund: 5000, jeSpieler: 1000, horde: 2000, dauer: 1e5, pause: 1e5, gleichzeitig: 50, haeuser: 1000 };

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
  // Tag-Bonus × Regler: gilt für Zombies draußen und Hordengröße (die Level-Grundwerte stehen in LEVEL_VORGABE / den Einstellungen)
  const dichte = (1 + bonus) * r;
  const horde = dichte;
  const schnell = Math.min(0.7, (tab.schnell + bonus * 0.25) * r);
  const beute = Math.max(0.35, tab.beute / ((1 + bonus / 2) * r));
  const munition = Math.max(0.35, tab.munition / ((1 + bonus / 2) * r));
  const nacht = Math.min(1.8, tab.nacht * (1 + bonus / 2) * r);

  // Ergebnis mit Rundung zurückgeben
  return {
    dichte: runde3(dichte),
    horde: runde3(horde),
    schnell: runde3(schnell),
    beute: runde3(beute),
    munition: runde3(munition),
    nacht: runde3(nacht),
    bonus: runde3(bonus),
    regler: runde3(r)
  };
}

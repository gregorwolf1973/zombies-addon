// Erfahrung, Level und Fähigkeiten (rein, ohne Raum – testbar). Der Raum hängt sich nur ein (raum.mjs).
// Stand je Spieler: { xp, s: { zielen: 0..5, tempo: …, … } }; Level folgt aus den Erfahrungspunkten,
// je Levelaufstieg gibt es 1 Fähigkeitspunkt. Der Stand bleibt beim Tod erhalten (gespeichert mit den Spielerdaten).

export const MAX_STUFE = 5;
export const MAX_LEVEL = 50;

export const FAEHIGKEITEN = [
  { id: 'zielen', name: 'Zielen', symbol: '🎯', text: 'Chance je Stufe, beim Schießen keine Munition zu verbrauchen' },
  { id: 'tempo', name: 'Tempo', symbol: '🏃', text: 'Lauftempo +4 % je Stufe' },
  { id: 'leben', name: 'Lebensenergie', symbol: '❤️', text: 'Du hältst je Stufe ca. 10 % mehr aus (Bisse wirken schwächer)' },
  { id: 'ausdauer', name: 'Ausdauer', symbol: '🥫', text: 'Durst und Hunger sinken je Stufe 10 % langsamer' },
  { id: 'leise', name: 'Leise', symbol: '🤫', text: 'Zombies hören dich je Stufe 8 % weniger weit' },
  { id: 'sanitaeter', name: 'Sanitäter', symbol: '🩺', text: 'Aufhelfen und Verbandszeug wirken je Stufe 15 % besser' },
  { id: 'tragen', name: 'Tragen', symbol: '🎒', text: '+1 Rucksackplatz bei Stufe 3 und noch einer bei Stufe 5' },
];
const IDS = new Set(FAEHIGKEITEN.map(f => f.id));

// Erfahrungspunkte für verschiedene Ereignisse (vor dem Verwaltungs-Faktor)
export const XP = { zombie: 10, aufgabe: 60, raetsel: 25, wiederbelebt: 40, mensch: 50, rettung: 60, evakuierung: 150 };

// Erfahrung, die von Level L zu L+1 nötig ist
export const xpFuerAufstieg = level => Math.round(100 * Math.pow(Math.max(1, level), 1.5));

// Startwahl vor Level 1: 5 zusätzliche Punkte (bonus), die über die normalen Level-Punkte hinausgehen
export const START_PUNKTE = 5;
export const START_GEGENSTAENDE = ['waffe', 'lampe', 'brecheisen', 'wasser'];   // 'wasser' ist vorgewählt
export const START_BOT = { zielen: 2, leben: 2, tempo: 1 };   // sinnvolle Verteilung für Bots

export function neuerStand() { return { xp: 0, bonus: 0, s: Object.fromEntries(FAEHIGKEITEN.map(f => [f.id, 0])) }; }

// gespeicherte Daten prüfen; mehr Stufen als Punkte gibt es nicht
export function normiere(roh) {
  const st = neuerStand();
  st.xp = Math.max(0, Math.min(1e9, Math.floor(Number(roh?.xp) || 0)));
  st.bonus = Number(roh?.bonus) === START_PUNKTE ? START_PUNKTE : 0;
  for (const id of IDS) st.s[id] = Math.max(0, Math.min(MAX_STUFE, Math.floor(Number(roh?.s?.[id]) || 0)));
  const frei = levelAus(st.xp) - 1 + st.bonus;
  let ueber = Object.values(st.s).reduce((a, b) => a + b, 0) - frei;
  for (const f of [...FAEHIGKEITEN].reverse()) { while (ueber > 0 && st.s[f.id] > 0) { st.s[f.id]--; ueber--; } }
  return st;
}

export function levelAus(xp) {
  let level = 1, rest = Math.max(0, xp);
  while (level < MAX_LEVEL && rest >= xpFuerAufstieg(level)) { rest -= xpFuerAufstieg(level); level++; }
  return level;
}

// Erfahrung innerhalb des aktuellen Levels: { level, im, bis } (bis = 0 auf der Höchststufe)
export function fortschritt(xp) {
  let level = 1, rest = Math.max(0, xp);
  while (level < MAX_LEVEL && rest >= xpFuerAufstieg(level)) { rest -= xpFuerAufstieg(level); level++; }
  return { level, im: rest, bis: level >= MAX_LEVEL ? 0 : xpFuerAufstieg(level) };
}

export const punkteVerteilt = st => Object.values(st.s).reduce((a, b) => a + b, 0);
export const freiePunkte = st => Math.max(0, levelAus(st.xp) - 1 + (st.bonus || 0) - punkteVerteilt(st));

// Erfahrung gutschreiben; Rückgabe: Anzahl neuer Level (0 = keiner)
export function gebeXp(st, menge, faktor = 1) {
  const m = Math.round(Math.max(0, Number(menge) || 0) * Math.max(0, Number(faktor) || 0));
  if (m <= 0) return 0;
  const vorher = levelAus(st.xp);
  st.xp = Math.min(1e9, st.xp + m);
  return levelAus(st.xp) - vorher;
}

// Startwahl: genau START_PUNKTE Punkte auf bekannte Fähigkeiten verteilen (je höchstens MAX_STUFE), nur einmal je Stand.
// verteilung: { id: anzahl }. true bei Erfolg, sonst bleibt der Stand unverändert.
export function startVergabe(st, verteilung) {
  if (!st || st.bonus || !verteilung || typeof verteilung !== 'object') return false;
  let summe = 0;
  for (const [id, n] of Object.entries(verteilung)) {
    if (!IDS.has(id) || !Number.isInteger(n) || n < 0 || st.s[id] + n > MAX_STUFE) return false;
    summe += n;
  }
  if (summe !== START_PUNKTE) return false;
  for (const [id, n] of Object.entries(verteilung)) st.s[id] += n;
  st.bonus = START_PUNKTE;
  return true;
}

// Punkt einsetzen; true, wenn es geklappt hat (der Server prüft alles selbst)
export function investiere(st, id) {
  if (!IDS.has(id) || st.s[id] >= MAX_STUFE || freiePunkte(st) < 1) return false;
  st.s[id]++;
  return true;
}

// ---------- Wirkungen (Stufe 0 = heutiges Verhalten) ----------
const stufe = (st, id) => Math.max(0, Math.min(MAX_STUFE, st?.s?.[id] | 0));
export const wirkung = {
  schussFrei: st => 0.08 * stufe(st, 'zielen'),                 // Chance, keine Munition zu verbrauchen
  tempo: st => 1 + 0.04 * stufe(st, 'tempo'),                   // Faktor aufs Lauftempo
  schadenFaktor: st => 1 / (1 + 0.1 * stufe(st, 'leben')),      // Faktor auf erlittenen Schaden (≈ +10 % Leben je Stufe)
  verbrauch: st => 1 - 0.1 * stufe(st, 'ausdauer'),             // Faktor auf Durst/Hunger-Verbrauch
  hoerweite: st => 1 - 0.08 * stufe(st, 'leise'),               // Faktor auf die Hörweite von Zombies
  heilen: st => 1 + 0.15 * stufe(st, 'sanitaeter'),             // Faktor auf Aufhelf-Tempo und Heilmenge
  rucksack: st => (stufe(st, 'tragen') >= 5 ? 2 : stufe(st, 'tragen') >= 3 ? 1 : 0),   // zusätzliche Plätze
};

// was der Client braucht
export function fuerClient(st, an = true) {
  const f = fortschritt(st.xp);
  return { an, xp: st.xp, level: f.level, im: f.im, bis: f.bis, frei: freiePunkte(st), s: { ...st.s } };
}

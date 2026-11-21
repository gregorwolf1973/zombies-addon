// Hintergrundmusik: reine Auswahl-Logik (ohne Audio).
// Priorität: Finale > Horde > Lager > Safe > Level-Hauptlied. Gibt es für die gewünschte Kategorie keine Datei,
// gilt die nächstniedrigere; ganz unten ist Stille. Entprellung: eine neue Situation muss 4 s anstehen, Horde-Musik bleibt 10 s nach Ende.

export const MUSIK_KATEGORIEN = ['musikLevel1', 'musikLevel2', 'musikLevel3', 'musikLevel4', 'musikLevel5', 'musikLager', 'musikHorde', 'musikSafe', 'musikFinale'];
export const ANSTEHEN_MS = 4000;
export const HORDE_NACH_MS = 10000;

export const levelKategorie = level => 'musikLevel' + Math.max(1, Math.min(5, Math.round(Number(level)) || 1));

// lage: { finale, horde, lager, safe, level }; hat(kategorie) → true, wenn mindestens eine Datei zugeordnet ist
// Ergebnis: Kategorie oder null (Stille)
export function musikWahl(lage, hat) {
  const reihe = [
    lage?.finale && 'musikFinale',
    lage?.horde && 'musikHorde',
    lage?.lager && 'musikLager',
    lage?.safe && 'musikSafe',
    levelKategorie(lage?.level),
  ].filter(Boolean);
  return reihe.find(k => hat(k)) ?? null;
}

// ein Schritt (z. B. jede Sekunde); st = { aktuell, kandidat, seit, hordeBis } (undefined = Anfang)
// Beim allerersten Mal gilt der Wunsch sofort (sonst 4 s Stille am Spielbeginn).
export function musikSchritt(alt, lage, hat, jetzt) {
  const st = { aktuell: undefined, kandidat: null, seit: 0, hordeBis: -1, ...(alt ?? {}) };
  if (lage?.horde) st.hordeBis = jetzt + HORDE_NACH_MS;
  const wunsch = musikWahl({ ...lage, horde: !!lage?.horde || jetzt < st.hordeBis }, hat);
  if (st.aktuell === undefined) { st.aktuell = wunsch; st.kandidat = null; return st; }
  if (wunsch === st.aktuell) { st.kandidat = null; return st; }
  if (st.kandidat !== wunsch) { st.kandidat = wunsch; st.seit = jetzt; return st; }
  if (jetzt - st.seit >= ANSTEHEN_MS) { st.aktuell = wunsch; st.kandidat = null; }
  return st;
}

// nächstes Stück einer Kategorie: abwechselnd, nie dasselbe zweimal hintereinander (bei mehreren Dateien)
export function naechstesStueck(dateien, letztes, zufall = Math.random()) {
  if (!dateien?.length) return null;
  if (dateien.length === 1) return dateien[0];
  const rest = dateien.filter(d => d !== letztes);
  return rest[Math.min(rest.length - 1, Math.floor(zufall * rest.length))];
}

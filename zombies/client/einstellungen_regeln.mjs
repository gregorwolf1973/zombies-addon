// Spieler-Einstellungen, die der Server je Spieler-ID merkt (Client und Server nutzen dieselben Regeln).
// Schlüssel = Name im localStorage des Browsers, Wert = erlaubte Form (alles Text, nichts anderes kommt durch).
export const EINSTELLUNG_MUSTER = {
  zob_aussehen: /^[mwshf],[0-5],[0-7]$/,          // Figur: Geschlecht/Held, Haar, Kleidung
  zob_liste: /^[01]$/,                            // Spielerliste zu/auf
  zob_kartealpha: /^(0\.35|0\.6|1)$/,             // Transparenz der Eckkarte
  zob_zoom: /^\d(\.\d{1,2})?$/,                   // Zoomstufe
  aufgabenZu: /^[01]$/,                           // Aufgabenliste eingeklappt
  zombies_lautstaerke: /^(1|0\.5|0\.25|0)$/,      // Tonstufe
  zombies_ton: /^(an|aus)$/,
  zob_stimme: /^(durstMann|durstFrau)$/,          // Stimme des Durst-Tons
  zob_mikro: /^(an|aus)$/,                        // Sprachchat-Mikrofon
  zob_sprache_hinweis: /^1$/,                     // Sprach-Hinweis schon gezeigt
};
export const EINSTELLUNG_MAX_BYTES = 4096;

// Nur bekannte Schlüssel mit passendem Wert behalten, Gesamtgröße begrenzen; liefert ein neues, sauberes Objekt
export function einstellungenBereinigen(roh) {
  const aus = {};
  if (!roh || typeof roh !== 'object' || Array.isArray(roh)) return aus;
  for (const k of Object.keys(EINSTELLUNG_MUSTER)) {
    const v = roh[k];
    if (typeof v !== 'string' || v.length > 32 || !EINSTELLUNG_MUSTER[k].test(v)) continue;
    aus[k] = v;
  }
  return JSON.stringify(aus).length <= EINSTELLUNG_MAX_BYTES ? aus : {};
}

// ---------- Geräte-Einstellungen (nur im localStorage dieses Geräts, nicht beim Server) ----------
export const GERAET_SCHLUESSEL = {
  stimmen: 'zob_stimmen',          // Stimmen der Mitspieler, Prozent 0–200 (Standard 100)
  zombieTon: 'zob_zombieton',      // Zombiegeräusche an/aus (Standard an)
  musik: 'zob_musik',              // Musik an/aus (Standard an)
  schiessen: 'zob_schiessen',      // 'auto' (Standard) oder 'knopf'
};

// Text → Faktor 0–2 (ungültig/leer = 1); gerundet auf ganze Prozent
export function stimmenFaktorLesen(roh) {
  if (roh == null || String(roh).trim() === '') return 1;
  const n = Number(roh);
  if (!Number.isFinite(n)) return 1;
  return Math.round(Math.max(0, Math.min(200, n))) / 100;
}
// Text → true/false; nur ein ausdrückliches 'aus' schaltet ab
export function anAusLesen(roh) { return roh !== 'aus'; }
// Text → 'auto' | 'knopf'
export function schiessModusLesen(roh) { return roh === 'knopf' ? 'knopf' : 'auto'; }
// Darf der Server auf Ziele schießen? Automatisch: immer; per Knopf: nur solange der Knopf gehalten wird
export function feuerErlaubt(modus, gehalten) { return modus !== 'knopf' || !!gehalten; }

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

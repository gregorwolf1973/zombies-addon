// Reine Stimmenverwaltung (ohne Web Audio), damit sie testbar ist.
// stimmen: Liste laufender Töne { ende, v, zombie, quelle }. Rückgabe: { ok, verdraengt: [Stimmen] }.
// prio (Schüsse, Zombie-Tod): wird nie verworfen, verdrängt notfalls die leiseste Stimme.
// Dauerfeuer: Hat dieselbe Quelle schon maxQuelle Töne laufen, löst der neue den ältesten eigenen ab (wird nie verworfen).
export function stimmeZuweisen(stimmen, { jetzt, zombie, v, quelle = null, prio = false }, { max = 10, maxZombie = 5, maxQuelle = 3 } = {}) {
  for (let i = stimmen.length - 1; i >= 0; i--) if (stimmen[i].ende <= jetzt) stimmen.splice(i, 1);
  const verdraengt = [];
  const raus = q => { stimmen.splice(stimmen.indexOf(q), 1); verdraengt.push(q); };
  if (quelle != null) {
    const eigene = stimmen.filter(q => q.quelle === quelle);
    while (eigene.length >= maxQuelle) raus(eigene.shift());   // Liste ist nach Startzeit sortiert: erstes = ältestes
  }
  const leisest = liste => liste.reduce((m, q) => !m || q.v < m.v ? q : m, null);
  for (const [liste, grenze] of [[() => stimmen, max], [() => stimmen.filter(q => q.zombie), maxZombie]]) {
    const l0 = liste();
    if (l0 !== stimmen && !zombie) continue;
    if (l0.length < grenze) continue;
    const l = leisest(l0);
    if (!l || (!prio && l.v >= v)) return { ok: false, verdraengt };
    raus(l);
  }
  return { ok: true, verdraengt };
}

// Sprachvarianten der Tondateien (Ansagen, Radio-Eilmeldung): Wer nicht Deutsch spielt, hört „name_en.mp3“ statt „name.mp3“,
// sofern es diese Datei im Tonordner gibt (Liste vom Server: /info toeneEn). Zuordnung in den Einstellungen bleibt unverändert.
export function sprachVariante(datei, sprache, vorhanden) {
  if (!sprache || sprache === 'de' || !vorhanden?.size || typeof datei !== 'string') return datei;
  const v = datei.replace(/(\.[a-z0-9]+)$/i, `_${sprache}$1`);
  return v !== datei && vorhanden.has(v) ? v : datei;
}
export function zuordnungInSprache(zuordnung, sprache, vorhanden) {
  if (!zuordnung || typeof zuordnung !== 'object') return {};
  return Object.fromEntries(Object.entries(zuordnung).map(([id, t]) => [id, Array.isArray(t?.dateien)
    ? { ...t, dateien: t.dateien.map(d => sprachVariante(d, sprache, vorhanden)) } : t]));
}

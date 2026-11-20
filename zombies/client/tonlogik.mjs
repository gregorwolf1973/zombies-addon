// Reine Stimmenverwaltung (ohne Web Audio), damit sie testbar ist.
// stimmen: Liste laufender Töne { ende, v, zombie, quelle }. Rückgabe: { ok, verdraengt: [Stimmen] }.
// Dauerfeuer: Hat dieselbe Quelle schon maxQuelle Töne laufen, löst der neue den ältesten eigenen ab (wird nie verworfen).
export function stimmeZuweisen(stimmen, { jetzt, zombie, v, quelle = null }, { max = 10, maxZombie = 5, maxQuelle = 3 } = {}) {
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
    if (!l || l.v >= v) return { ok: false, verdraengt };
    raus(l);
  }
  return { ok: true, verdraengt };
}

// Welche Orts-Nachrichten des Servers (schuss, weg, stoss …) hört dieser Spieler, und wo? Rein logisch, ohne Browser (tests/ton_regeln.test.mjs).
// Eigene Schüsse/Kills sind immer hörbar und kommen aus dem eigenen Helden (Ort null): die Ebene im Patch kann dem Server um bis zu 100 ms
// hinterherhinken (Betreten und Schuss im selben Tick), Koordinaten fremder Ebenen gelten dagegen nicht für diesen Hörer.
export const istEigen = (m, meineId) => !!meineId && m?.von === meineId;
export const hoertEbene = (m, hoerEbene) => m?.ebene === undefined || (m.ebene ?? '') === (hoerEbene ?? '');
// → { spielen, x, y } : Ort null = am eigenen Helden
export function ortFuer(m, meineId, hoerEbene, x, y) {
  if (istEigen(m, meineId)) return { spielen: true, x: null, y: null };
  return { spielen: hoertEbene(m, hoerEbene), x, y };
}

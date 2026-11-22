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

// Welche fahrenden Autos ein Radio haben: jedes dritte (nach der letzten Ziffer der Fahrzeug-Id). Server und Client brauchen dieselbe Regel:
// der Server schickt solche Autos weiter als den Bildausschnitt (bis ~60 m), damit man das Radio schon von weitem hört.
export const fahrzeugHatRadio = (id, art) => art === 'auto' && typeof id === 'string' && id.length > 0 && id.charCodeAt(id.length - 1) % 3 === 0;

// Geparkte Autos (Weltobjekte, Behälter-Id wie 'b123'): etwa jedes zehnte spielt leise Radio (deterministisch, gemischte Id-Zahl)
export function parktAutoHatRadio(id) {
  const n = parseInt(String(id).replace(/\D/g, ''), 10);
  if (!Number.isFinite(n)) return false;
  return ((Math.imul(n + 1, 2654435761) >>> 0) >>> 16) % 10 === 0;
}

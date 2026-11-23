// Lokale Variablen dürfen importierte Modul-Namensräume (import * as x) in client/spiel.mjs nicht überdecken:
// 0.86.0 hing beim Laden, weil „const ton = …“ in figurDarstellen das Ton-Modul verdeckte (ReferenceError vor der Initialisierung).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('spiel.mjs: keine lokale Variable mit dem Namen eines importierten Modul-Namensraums', () => {
  const src = readFileSync(new URL('../client/spiel.mjs', import.meta.url), 'utf8');
  const namen = [...src.matchAll(/^import \* as (\w+) from/gm)].map(m => m[1]);
  assert.ok(namen.includes('ton'), 'Ton-Modul wird nicht mehr als Namensraum importiert – Test anpassen');
  for (const n of namen) {
    const treffer = [...src.matchAll(new RegExp(`\\b(?:const|let|var)\\s+${n}\\b|\\(\\s*${n}\\s*[,)]\\s*=>|\\b${n}\\s*=>`, 'g'))];
    assert.equal(treffer.length, 0, `„${n}“ wird lokal überdeckt: ${treffer.map(t => t[0]).join(', ')}`);
  }
});

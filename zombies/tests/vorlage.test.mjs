import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mitVorlage, grundwerte, bereinige } from '../server/einstellungen.mjs';

test('Vorlage: Backend-Werte überschreiben die Grundwerte, ohne Geheimnisse', () => {
  const v = mitVorlage(), g = grundwerte();
  assert.equal(v.zugangscode, '');
  assert.equal(v.superuserHash, '');
  assert.deepEqual(v.test, g.test);
  assert.notDeepEqual(v, g);
  const b = bereinige(v, g);   // alle Vorlage-Werte überstehen die Bereinigung
  for (const k of ['karte', 'menschen', 'innenMassstab']) assert.deepEqual(b[k], v[k], k);
  assert.equal(b.radioStream.name, v.radioStream.name);
});

test('Vorlage: Geretsried 1 und 2 eigene Level – Tabelle mit 6 Zeilen, Geretsried 2 erbt die Geretsried-Werte', () => {
  const v = mitVorlage();
  assert.equal(v.zombies.level.length, 6);
  assert.deepEqual(v.zombies.level[1], v.zombies.level[0]);
  assert.equal(v.bissSpielerLevel.geretsried2, v.bissSpielerLevel.geretsried);
  assert.deepEqual(bereinige(v, grundwerte()).zombies.level, v.zombies.level, 'Vorlage-Tabelle wird nicht noch einmal verschoben');
});

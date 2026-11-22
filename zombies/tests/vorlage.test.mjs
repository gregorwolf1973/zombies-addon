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

// Spieler-Einstellungen je Spieler-ID: Regeln (Validierung, Größe) und Speicher (Speichern/Laden)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { einstellungenBereinigen, EINSTELLUNG_MAX_BYTES } from '../client/einstellungen_regeln.mjs';
import { Speicher } from '../server/speicher.mjs';

test('Bereinigen: nur bekannte Schlüssel mit passendem Wert', () => {
  const s = einstellungenBereinigen({ zob_aussehen: 'f,2,3', zob_zoom: '1.25', zombies_lautstaerke: '0.5', zob_liste: '7', fremd: 'x', zob_stimme: '<b>', aufgabenZu: 1 });
  assert.deepEqual(s, { zob_aussehen: 'f,2,3', zob_zoom: '1.25', zombies_lautstaerke: '0.5' });
});

test('Bereinigen: Unsinn und Riesenwerte ergeben nichts', () => {
  assert.deepEqual(einstellungenBereinigen(null), {});
  assert.deepEqual(einstellungenBereinigen([1, 2]), {});
  assert.deepEqual(einstellungenBereinigen({ zob_aussehen: 'x'.repeat(100000) }), {});
  assert.ok(EINSTELLUNG_MAX_BYTES <= 4096);
});

test('Speichern und Laden je Spieler-ID, getrennt vom Spielstand', () => {
  const sp = new Speicher(':memory:');
  assert.deepEqual(sp.ladeEinstellungen('a'.repeat(32)), {});
  sp.speichereEinstellungen('a'.repeat(32), { zob_aussehen: 'h,1,0', zob_zoom: '0.8' });
  sp.speichereEinstellungen('b'.repeat(32), { zob_aussehen: 'w,0,1' });
  assert.deepEqual(sp.ladeEinstellungen('a'.repeat(32)), { zob_aussehen: 'h,1,0', zob_zoom: '0.8' });
  assert.deepEqual(sp.ladeEinstellungen('b'.repeat(32)), { zob_aussehen: 'w,0,1' });
  sp.speichereEinstellungen('a'.repeat(32), { zob_zoom: '1' });   // ersetzt
  assert.deepEqual(sp.ladeEinstellungen('a'.repeat(32)), { zob_zoom: '1' });
  sp.loescheSpieler();
  assert.deepEqual(sp.ladeEinstellungen('b'.repeat(32)), { zob_aussehen: 'w,0,1' });
  sp.schliessen();
});

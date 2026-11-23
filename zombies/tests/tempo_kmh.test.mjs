// Held-/Zombietempo in km/h (8 px = 1 m): Vorgaben, Einstellungen, gemeinsame Spielwerte
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WERTE as W, tempoWerteSetzen } from '../client/welt.mjs';
import { bereinige, vorgaben } from '../server/einstellungen.mjs';

test('Vorgaben: 20 / 9 km/h Held, 15 / 4 km/h Zombie', () => {
  assert.ok(Math.abs(W.tempoGehen - 20 / 3.6 * 8) < 1e-9);
  assert.ok(Math.abs(W.tempoSchleichen - 9 / 3.6 * 8) < 1e-9);
  assert.ok(Math.abs(W.zombieTempoJagen - 15 / 3.6 * 8) < 1e-9);
  assert.ok(Math.abs(W.zombieTempoWandern - 4 / 3.6 * 8) < 1e-9);
});

test('tempoWerteSetzen übernimmt Einstellungen und fängt Unsinn ab', () => {
  const w = {};
  tempoWerteSetzen(w, { gehen: 36, schleichen: 18, jagen: 18, wandern: 9 });
  assert.equal(w.tempoGehen, 80); assert.equal(w.tempoSchleichen, 40); assert.equal(w.zombieTempoJagen, 40); assert.equal(w.zombieTempoWandern, 20);
  tempoWerteSetzen(w, { gehen: 'x' });
  assert.ok(Math.abs(w.tempoGehen - 20 / 3.6 * 8) < 1e-9);
});

test('Einstellungen: Vorgabe und Grenzen', () => {
  const v = vorgaben();
  assert.deepEqual([v.tempoHeldGehen, v.tempoHeldSchleichen, v.tempoZombieJagen, v.tempoZombieWandern], [20, 9, 15, 4]);
  assert.equal(bereinige({ tempoHeldGehen: 999 }, v).tempoHeldGehen, 999);
});

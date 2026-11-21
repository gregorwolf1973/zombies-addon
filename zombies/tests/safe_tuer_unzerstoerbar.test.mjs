// Safehouse-Türen: geschlossen/verbarrikadiert kommen Zombies nie hinein, Tür-HP und Barrikade bleiben heil.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SpielRaum } from '../server/raum.mjs';

function raum(safeNr) {
  const r = Object.create(SpielRaum.prototype);
  const tueren = new Map(), safes = new Map([['s1', { barrikade: 50 }]]);
  Object.defineProperty(r, 'state', { value: { tueren, safes, spieler: new Map() }, writable: true });
  Object.defineProperty(r, 'clients', { value: [], writable: true });
  r.welt = { safeRooms: [{ id: 's1', haus: { nr: safeNr }, name: 'Test' }] };
  r.laerm = () => {};
  r.setzeTuer = () => { throw new Error('Tür darf nicht zerbrechen'); };
  return r;
}

test('Safehouse: Haustür und Innentür nehmen keinen Schaden, normale Häuser schon', () => {
  const r = raum(7);
  const z = { x: 0, y: 0, ebene: '' };
  for (const key of ['haus:7', 'h7eg:3,4']) {
    r.state.tueren.set(key, { offen: false, verschlossen: false, barrikade: 0, hp: 100, kaputt: false });
    assert.ok(r.tuerImSafe(key), key);
    for (let i = 0; i < 400; i++) r.tuerSchlag(key, 0.05, z);
    assert.equal(r.state.tueren.get(key).hp, 100);
    assert.equal(r.state.tueren.get(key).kaputt, false);
  }
  assert.equal(r.state.safes.get('s1').barrikade, 50, 'Barrikade unversehrt');
  assert.ok(!r.tuerImSafe('haus:8') && !r.tuerImSafe('h8eg:1,1'));
  r.state.tueren.set('h8eg:1,1', { offen: false, verschlossen: false, barrikade: 0, hp: 100, kaputt: false });
  r.setzeTuer = () => {};
  r.tuerSchlag('h8eg:1,1', 1, z);
  assert.ok(r.state.tueren.get('h8eg:1,1').hp < 100, 'normale Tür nimmt Schaden');
});

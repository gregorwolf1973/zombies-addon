// Autos lenken ruhiger: Vorgabe 60 °/s, im Backend einstellbar (auto.lenkung), Werte werden bereinigt
import test from 'node:test';
import assert from 'node:assert/strict';
import { PKW_VORGABE } from '../client/pkw.mjs';
import { bereinigeAuto } from '../server/einstellungen.mjs';

test('Lenkung: Vorgabe 60 °/s, Eingabe wird übernommen, Unsinn fällt auf die Vorgabe', () => {
  assert.equal(PKW_VORGABE.lenkung, 60);
  assert.equal(bereinigeAuto({}).lenkung, 60);
  assert.equal(bereinigeAuto({ lenkung: 45 }).lenkung, 45);
  assert.equal(bereinigeAuto({ lenkung: 'x' }).lenkung, 60);
  assert.ok(bereinigeAuto({ lenkung: 1 }).lenkung >= 5);
});

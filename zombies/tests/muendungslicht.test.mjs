// Mündungslicht (client/muendungslicht.mjs): Radius je Waffe, Abklingen, Obergrenze, Ebenen
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Blitzliste, radiusMeter, MUENDUNG_MAX, MUENDUNG_DAUER } from '../client/muendungslicht.mjs';

test('Radius je Waffe in Metern', () => {
  assert.equal(radiusMeter('pistole'), 5);
  assert.equal(radiusMeter('gewehr'), 7);
  assert.equal(radiusMeter('mg'), 7);
  assert.equal(radiusMeter('schrotflinte'), 8);
  assert.ok(radiusMeter('puma') >= 15 && radiusMeter('leopard') <= 20 && radiusMeter('kanone') >= 15);
  assert.equal(radiusMeter('unbekannt'), 5);
});

test('Blitz klingt in ~80 ms ab, Radius in Pixeln (8 px = 1 m)', () => {
  const l = new Blitzliste(), b = l.neu(10, 20, '', 'schrotflinte', 1000);
  assert.equal(b.r, 64);
  assert.equal(Blitzliste.staerke(b, 1000), 1);
  const mitte = Blitzliste.staerke(b, 1000 + MUENDUNG_DAUER / 2);
  assert.ok(mitte > 0 && mitte < 0.5);
  assert.equal(Blitzliste.staerke(b, 1000 + MUENDUNG_DAUER), 0);
});

test('höchstens MAX gleichzeitig, ältester wird überschrieben', () => {
  const l = new Blitzliste();
  for (let i = 0; i < MUENDUNG_MAX + 5; i++) l.neu(i, 0, '', 'gewehr', 1000 + i);
  let n = 0; l.jeder(1000 + MUENDUNG_MAX + 5, '', () => n++);
  assert.equal(n, MUENDUNG_MAX);
  assert.equal(l.blitze.length, MUENDUNG_MAX);
  assert.ok(!l.blitze.some(b => b.x === 0));   // der älteste (x=0) wurde verdrängt
});

test('nur Blitze der gleichen Ebene, abgelaufene zählen nicht', () => {
  const l = new Blitzliste();
  l.neu(0, 0, '', 'pistole', 0); l.neu(0, 0, 'h1', 'pistole', 0);
  let n = 0; l.jeder(10, '', () => n++); assert.equal(n, 1);
  n = 0; l.jeder(500, '', () => n++); assert.equal(n, 0);
});

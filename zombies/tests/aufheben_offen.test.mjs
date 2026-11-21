import { test } from 'node:test';
import assert from 'node:assert/strict';

// minimales DOM
const mk = () => ({ children: [], className: '', id: '', innerHTML: '', classList: { add() {} }, style: {},
  append(...k) { this.children.push(...k); }, appendChild(k) { this.children.push(k); }, addEventListener() {},
  remove() { this.entfernt = true; if (this.eltern) this.eltern.children = this.eltern.children.filter(c => c !== this); } });
const tasten = new Set();
globalThis.document = {
  createElement: () => mk(),
  body: { children: [], appendChild(k) { k.eltern = this; this.children.push(k); } },
  addEventListener: (t, f) => tasten.add(f), removeEventListener: (t, f) => tasten.delete(f),
};
const { auswahlAuf, auswahlPruefen, auswahlOffen, auswahlZu } = await import('../client/aufheben.mjs');

const ich = { x: 0, y: 0, ebene: '', rucksack: [], plaetze: 6, waffe: 'pistole', lampe: 1, kleidung: 1 };
const gesendet = [];
const raum = { send: (...a) => gesendet.push(a) };

test('Aufheben-Fenster bleibt nach Aufheben offen, aktualisiert sich und schließt erst wenn nichts mehr da ist', () => {
  const boden = new Map([['a', { x: 5, y: 0, ding: 'wasser', ebene: '' }], ['b', { x: 8, y: 0, ding: 'essen', ebene: '' }]]);
  auswahlAuf(raum, ich, [{ id: 'a', ding: 'wasser', d: 5 }, { id: 'b', ding: 'essen', d: 8 }]);
  assert.ok(auswahlOffen());
  // erster Gegenstand wird aufgehoben (Klick auf ersten Knopf)
  const reihe = document.body.children.at(-1).children[1];
  reihe.children[0].onclick({ stopPropagation() {} });
  assert.deepEqual(gesendet.at(-1), ['aufheben_wahl', { id: 'a' }]);
  assert.ok(auswahlOffen(), 'schließt nach dem Aufheben');
  boden.delete('a');
  auswahlPruefen(boden, ich, { x: 0, y: 0 });
  assert.ok(auswahlOffen(), 'schließt bei Zustandsänderung');
  assert.equal(document.body.children.at(-1).children[1].children.length, 2, 'Liste: ein Gegenstand + Abbrechen');
  boden.delete('b');
  auswahlPruefen(boden, ich, { x: 0, y: 0 });
  assert.ok(!auswahlOffen(), 'bleibt offen trotz leerer Liste');
});

test('Aufheben-Fenster schließt bei Entfernen (außer Reichweite), nicht bei Bewegung in Reichweite', () => {
  const boden = new Map([['a', { x: 5, y: 0, ding: 'wasser', ebene: '' }]]);
  auswahlAuf(raum, ich, [{ id: 'a', ding: 'wasser', d: 5 }]);
  auswahlPruefen(boden, ich, { x: 10, y: 0 });
  assert.ok(auswahlOffen());
  auswahlPruefen(boden, ich, { x: 500, y: 0 });
  assert.ok(!auswahlOffen());
  auswahlAuf(raum, ich, [{ id: 'a', ding: 'wasser', d: 5 }]);
  tasten.forEach(f => f({ key: 'Escape' }));
  assert.ok(!auswahlOffen(), 'Esc schließt nicht');
  auswahlZu();
});

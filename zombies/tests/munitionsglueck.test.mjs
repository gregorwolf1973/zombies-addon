import test from 'node:test';
import assert from 'node:assert/strict';
import { munitionsFaktor, naechsteSerie, mitMunitionsglueck, munitionsDinge } from '../server/munitionsglueck.mjs';
import { ziehe } from '../client/welt.mjs';

const nahe = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≠ ${b}`);
const gesund = { hp: 100, durst: 100, hunger: 100, rucksack: [] };

test('Faktor: +20 % je Pechdurchsuchung multiplikativ, höchstens ×3', () => {
  nahe(munitionsFaktor(gesund, 0), 1);
  nahe(munitionsFaktor(gesund, 1), 1.2);
  nahe(munitionsFaktor(gesund, 3), 1.728);
  nahe(munitionsFaktor(gesund, 50), 3);
  nahe(munitionsFaktor(gesund, 2, { schritt: 50 }), 2.25);
});

test('Faktor: Leben unter 30 % ×1,5, Durst oder Hunger unter 25 % ×1,3, beides multipliziert', () => {
  nahe(munitionsFaktor({ ...gesund, hp: 29 }, 0), 1.5);
  nahe(munitionsFaktor({ ...gesund, hp: 30 }, 0), 1);
  nahe(munitionsFaktor({ ...gesund, durst: 24 }, 0), 1.3);
  nahe(munitionsFaktor({ ...gesund, hunger: 10 }, 0), 1.3);
  nahe(munitionsFaktor({ hp: 10, durst: 5, hunger: 5 }, 2), 1.44 * 1.5 * 1.3);
});

test('Serie: Fund setzt zurück, Pech zählt', () => {
  assert.equal(naechsteSerie(0, false), 1);
  assert.equal(naechsteSerie(4, false), 5);
  assert.equal(naechsteSerie(4, true), 0);
});

test('befuelle: Pechserie zählt beim ersten Öffnen und wird bei Munitionsfund zurückgesetzt', async () => {
  const { SpielRaum } = await import('../server/raum.mjs');
  const alt = SpielRaum.einstellungen;
  SpielRaum.einstellungen = { ...alt, munitionsglueck: { schritt: 20, max: 300, lebenUnter: 30, lebenFaktor: 150, notUnter: 25, notFaktor: 130 } };
  try {
    const r = Object.create(SpielRaum.prototype);
    let gespeichert = null;
    Object.assign(r, { inhalte: new Map(), rnd: () => 0.999, fundFaktoren: () => ({}), setzeInhalt: (id, i) => { gespeichert = i; r.inhalte.set(id, i); } });
    const x = { munSerie: 0 }, p = { ...gesund };
    r.befuelle({ id: 'a', art: 'schrank' }, p, x);
    assert.equal(x.munSerie, 1, 'rnd nahe 1 zieht den letzten Eintrag (null): keine Munition');
    r.befuelle({ id: 'b', art: 'schrank' }, p, x);
    assert.equal(x.munSerie, 2);
    r.rnd = () => 0.01; r.befuelle({ id: 'c', art: 'bw_container' }, p, x);   // erster Eintrag: munition
    assert.deepEqual(gespeichert.includes('munition'), true);
    assert.equal(x.munSerie, 0, 'Munitionsfund setzt zurück');
    r.befuelle({ id: 'c', art: 'schrank' }, p, x);   // schon gefüllt: unverändert
    const b = { munSerie: 0, bot: true };
    r.rnd = () => 0.999; r.befuelle({ id: 'd', art: 'schrank' }, p, b);
    assert.equal(b.munSerie, 0, 'Bots ohne Glück');
  } finally { SpielRaum.einstellungen = alt; }
});

test('Einstellungen: Vorgabe, Grenzen, alte Dateien ohne Abschnitt', async () => {
  const { bereinige, vorgaben } = await import('../server/einstellungen.mjs');
  assert.deepEqual(vorgaben().munitionsglueck, { schritt: 20, max: 300, lebenUnter: 30, lebenFaktor: 150, notUnter: 25, notFaktor: 130 });
  const k = bereinige({ munitionsglueck: { schritt: 999, max: 1, lebenUnter: -3, lebenFaktor: 'x', notFaktor: 5000 } });
  assert.deepEqual(k.munitionsglueck, { schritt: 999, max: 1, lebenUnter: 0, lebenFaktor: 150, notUnter: 25, notFaktor: 5000 });
  assert.deepEqual(bereinige({ sprache: { an: true } }).munitionsglueck, vorgaben().munitionsglueck);
});

test('Fundfaktoren: nur Munition (je nach Waffe) wird angehoben, Original bleibt', () => {
  const f = { munition: 10, munitionskiste: 10, pfeil: 10, verband: 10 };
  const m = mitMunitionsglueck(f, gesund, 2);
  nahe(m.munition, 14.4); nahe(m.munitionskiste, 14.4);
  assert.equal(m.pfeil, 10); assert.equal(m.verband, 10); assert.equal(f.munition, 10);
  assert.deepEqual(munitionsDinge({ rucksack: ['armbrust'] }), ['munition', 'munitionskiste', 'pfeil']);
  assert.equal(mitMunitionsglueck(f, gesund, 0), f);
  // Wirkung auf die Ziehung: mit Faktor ×3 mehr Munition
  const tab = ['munition', 'verband', 'verband', null];
  const zaehle = fa => { let n = 0, s = 1; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647; for (let i = 0; i < 4000; i++) if (ziehe(tab, fa, rnd) === 'munition') n++; return n; };
  assert.ok(zaehle(mitMunitionsglueck({}, gesund, 50)) > zaehle({}) * 1.5);
});

// Warten am Abholpunkt rafft die Uhr (server/aufgaben.mjs warteRaffer) – nur wenn alle Lebenden dort sind
import { textAus } from '../server/texte.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Aufgaben } from '../server/aufgaben.mjs';
import { KACHEL } from '../client/welt.mjs';

function aufbau() {
  const tor = { x: 0, y: 40 }, ax = (tor.x + 1) * KACHEL, ay = (tor.y + 1) * KACHEL;
  const meldungen = [];
  const spieler = new Map([
    ['a', { x: ax + 100, y: ay, zombie: 0 }],
    ['b', { x: ax, y: ay + 300, zombie: 0, unten: true }],
    ['z', { x: 9999, y: 9999, zombie: 1 }],           // Zombie zählt nicht
    ['g', { x: 9999, y: 9999, zombie: 0, verbunden: false }],   // getrennt zählt nicht
  ]);
  const raum = {
    state: { funk: true, busDa: false, spieler, aufgaben: new Map([['m', { pflicht: true, erledigt: true }]]) },
    welt: { tor, name: 'geretsried' }, karte: 'geretsried',
    einstellungen: () => ({ aufgaben: { an: true, warteRaffer: 5 } }),
    broadcast: (_, m) => meldungen.push(textAus(m)),
  };
  const a = Object.create(Aufgaben.prototype); a.raum = raum;
  return { a, raum, spieler, meldungen, ax, ay };
}

test('alle Lebenden am Abholpunkt → Uhr läuft schneller, Meldung einmal', () => {
  const { a, meldungen } = aufbau();
  assert.equal(a.warteRaffer(), 5);
  assert.equal(a.warteRaffer(), 5);
  assert.equal(meldungen.length, 1);
});

test('einer fehlt, Bus schon da oder Pflichtaufgabe offen → normal', () => {
  const { a, raum, spieler, ax, ay } = aufbau();
  spieler.get('a').x = ax + 900;
  assert.equal(a.warteRaffer(), 1);
  spieler.get('a').x = ax; spieler.get('a').ebene = 'h3eg';
  assert.equal(a.warteRaffer(), 1);
  delete spieler.get('a').ebene;
  assert.equal(a.warteRaffer(), 5);
  raum.state.busDa = true;
  assert.equal(a.warteRaffer(), 1);
  raum.state.busDa = false; raum.state.aufgaben.get('m').erledigt = false;
  assert.equal(a.warteRaffer(), 1);
});

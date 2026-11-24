// Kleinkram: Schussreichweite bei Nacht/Nebel, Innen-Tempo-Vorgabe, Kollisionsfläche geparkter Busse
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { schussFaktor, dunkelAnteil, beleuchtet, lichtquellen, imKegel, LAMPE_LAENGE, FEUER_SAUM } from '../server/schussdunkel.mjs';
import { bereinige, vorgaben } from '../server/einstellungen.mjs';
import { KACHEL, setzeKartengroesse, feinWert, frei, T } from '../client/welt.mjs';
import { baueWeltAusKarte, busUmriss } from '../client/osmwelt.mjs';
import { fzPx } from '../client/masse.mjs';
import crypto from 'node:crypto';
import { matchMaker } from '@colyseus/core';
import { Client } from '@colyseus/sdk';
import { starte } from '../server/index.mjs';
import { freierPort } from './hilfe.mjs';

const MITTAG = 12 * 60, NACHT = 0;
const leer = { lampen: [], autos: [], feuer: [] };

test('Reichweite: Tag unverändert, Nacht -30 %, Nebel nach Dichte, Einstellung wirkt', () => {
  assert.equal(schussFaktor(MITTAG, 0), 1);
  assert.equal(schussFaktor(NACHT, 0), 0.7);
  assert.equal(schussFaktor(MITTAG, 1), 0.7);
  assert.ok(Math.abs(schussFaktor(MITTAG, 0.5) - 0.85) < 1e-9);
  assert.equal(schussFaktor(NACHT, 1), 0.7, 'Nacht und Nebel stapeln sich nicht');
  assert.equal(schussFaktor(NACHT, 0, 0), 1);
  assert.ok(Math.abs(schussFaktor(NACHT, 0, 50) - 0.5) < 1e-9);
  assert.equal(dunkelAnteil(MITTAG, 0), 0);
});

test('Backend-Wert schussDunkel: Vorgabe 30, frei einstellbar, Faktor nie unter 10 %', () => {
  assert.equal(vorgaben().schussDunkel, 30);
  assert.equal(bereinige({ schussDunkel: 50 }).schussDunkel, 50);
  assert.ok(Math.abs(schussFaktor(NACHT, 0, 999) - 0.1) < 1e-9);
  assert.equal(bereinige({}).schussDunkel, 30);
});

test('Beleuchtet: Taschenlampenkegel, Scheinwerfer eines gefahrenen Autos, Feuer', () => {
  const lampe = { ...leer, lampen: [{ x: 0, y: 0, richtung: 0 }] };
  assert.equal(beleuchtet(lampe, 150, 10), true, 'im Kegel');
  assert.equal(beleuchtet(lampe, -50, 0), false, 'hinter dem Schützen');
  assert.equal(beleuchtet(lampe, 100, 100), false, 'seitlich');
  assert.equal(beleuchtet(lampe, LAMPE_LAENGE + 40, 0), false, 'zu weit');
  const auto = { ...leer, autos: [{ x: 0, y: 0, richtung: Math.PI / 2 }] };
  assert.equal(beleuchtet(auto, 0, 150), true, 'Scheinwerfer nach unten (+y)');
  assert.equal(beleuchtet(auto, 0, -150), false, 'hinter dem Auto');
  const feuer = { ...leer, feuer: [{ x: 500, y: 500, r: 30 }] };
  assert.equal(beleuchtet(feuer, 500 + 30 + FEUER_SAUM - 1, 500), true);
  assert.equal(beleuchtet(feuer, 500 + 30 + FEUER_SAUM + 20, 500), false);
  assert.equal(imKegel(0, 0, 1, 0, 100, 0.9, 3, 4), true, 'ganz nah immer');
});

test('Lichtquellen aus dem Raumzustand: Lampe nur mit p.lampe, Auto nur mit Fahrer, nur draußen', () => {
  const state = {
    spieler: new Map([
      ['a', { x: 0, y: 0, richtung: 0, lampe: 100, ebene: '' }],
      ['b', { x: 10, y: 10, richtung: 0, lampe: 0, ebene: '' }],
      ['c', { x: 500, y: 500, richtung: 0, lampe: 50, ebene: 'h1' }],
      ['d', { x: 900, y: 900, richtung: 0, lampe: 0, ebene: '', imBoxer: true }],
    ]),
    fahrzeuge: new Map([['f1', { art: 'pkw', x: 905, y: 900, richtung: 1, leben: 100 }], ['f2', { art: 'pkw', x: 100, y: 100, richtung: 1, leben: 100 }], ['f3', { art: 'wrack', x: 900, y: 900, richtung: 0, leben: 0 }]]),
    feuer: new Map([['x', { x: 1, y: 2, r: 20, staerke: 0.5 }], ['y', { x: 3, y: 4, r: 20, staerke: 0 }]]),
  };
  const q = lichtquellen(state, '');
  assert.equal(q.lampen.length, 1);
  assert.deepEqual(q.autos.map(a => a.x), [905]);
  assert.equal(q.feuer.length, 1);
  assert.equal(lichtquellen(state, 'h1').lampen.length, 0, 'drinnen keine Einbuße (eigene Regeln)');
});

test('innenTempo: Vorgabe 50 %, im Backend frei einstellbar', () => {
  assert.equal(vorgaben().innenTempo, 50);
  assert.equal(bereinige({}).innenTempo, 50);
  assert.equal(bereinige({ innenTempo: 60 }).innenTempo, 60);
  assert.equal(bereinige({ innenTempo: 40 }).innenTempo, 40);
});

test('geparkter Bus: Kollision im Feinraster folgt dem gezeichneten Umriss (12 × 2,7 m), nicht den 4 Kacheln', () => {
  const karte = JSON.parse(fs.readFileSync(new URL('../client/karten/geretsried2.json', import.meta.url)));
  setzeKartengroesse(karte.breite, karte.hoehe);
  const welt = baueWeltAusKarte(karte, 12345);
  const busse = welt.deko.filter(d => d.art === 'bus');
  assert.ok(busse.length > 0, 'die Karte hat geparkte Busse');
  const [L, B] = fzPx('bus');
  for (const d of busse) {
    const [x0, y0, x1, y1] = busUmriss(d);
    assert.ok(Math.abs((x1 - x0) - (d.senkrecht ? B : L)) < 1e-6);
    let zellen = 0;
    for (let y = d.ky * KACHEL; y < (d.ky + d.h) * KACHEL; y += 2) for (let x = d.kx * KACHEL; x < (d.kx + d.b) * KACHEL; x += 2) if (feinWert(welt, x, y)) zellen++;
    const flaecheM2 = zellen * 4 / 64;   // 2-px-Raster → m²
    assert.ok(flaecheM2 <= 12 * 2.7 + 4, `gesperrt ${flaecheM2} m² (die 4 Kacheln wären 64 m², gezeichnet 32,4 m²)`);
    assert.ok(flaecheM2 >= 12 * 2.7 * 0.5, 'Bus sperrt weiterhin');
    // Mitte gesperrt, Kachelrand vor/hinter dem Bus (außerhalb des Umrisses) frei
    assert.equal(feinWert(welt, d.x, d.y) !== 0, true);
    const ende = d.senkrecht ? [d.x, y1 + 4] : [x1 + 4, d.y];
    assert.equal(feinWert(welt, ende[0], ende[1]), 0);
  }
  setzeKartengroesse(64, 48);
});

test('Raum: nachts fällt ein unbeleuchtetes fernes Ziel aus der Reichweite, beleuchtet bleibt es', async () => {
  const PORT = await freierPort();
  const server = await starte({ port: PORT, optionen: { karte: 'geretsried' }, leise: true, datenbank: ':memory:' });
  try {
    const c = await new Client(`ws://127.0.0.1:${PORT}`).joinOrCreate('zombies', { name: 'Dunkel', spielerId: crypto.randomBytes(16).toString('hex') });
    const raum = matchMaker.getLocalRoomById(c.roomId);
    for (const z of [...raum.state.zombies.keys()]) { raum.state.zombies.delete(z); raum.zombieInfo.delete(z); }
    const p = raum.state.spieler.get(c.sessionId);
    p.ebene = ''; p.lampe = 0; p.richtung = 0;
    const R = 200;   // Waffenreichweite in px
    raum.state.uhr = 12 * 60;
    assert.equal(raum.schussDunkel(p, R), null, 'tagsüber keine Einbuße');
    raum.state.uhr = 0;
    const d = raum.schussDunkel(p, R);
    assert.ok(Math.abs(d.reduziert - 140) < 1e-9);
    const z = { x: p.x + 170, y: p.y };   // 170 px: weiter als 140, näher als 200
    assert.equal(d.beleuchtet(z), false);
    p.lampe = 100; p.zombie = 0; p.unten = false;
    const d2 = raum.schussDunkel(p, R);
    assert.equal(d2.beleuchtet(z), true, 'im Lampenkegel des Schützen');
    p.lampe = 0;
    raum.state.uhr = 12 * 60; raum.state.nebel = 1;
    assert.ok(Math.abs(raum.schussDunkel(p, R).reduziert - 140) < 1e-9, 'Nebel wirkt wie Nacht');
    raum.state.nebel = 0;
    p.ebene = 'h1';
    raum.state.uhr = 0;
    assert.equal(raum.schussDunkel(p, R), null, 'drinnen keine Einbuße');
  } finally { await server.gracefullyShutdown(false); setzeKartengroesse(64, 48); }
});

// Auto-Bogen (autos.json/autos.webp), Laster im Verkehr, Polizisten unter den Bewohnern
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import crypto from 'node:crypto';
import { matchMaker } from '@colyseus/core';
import { Client } from '@colyseus/sdk';
import { starte } from '../server/index.mjs';
import { setzeKartengroesse } from '../client/welt.mjs';
import { LAENGE, LASTER_ANTEIL } from '../server/verkehr.mjs';
import { setzeAutoBilder, autoVonOben } from '../client/aussehen.mjs';

let server;
const PORT = 27900 + Math.floor(Math.random() * 90);
before(async () => { server = await starte({ port: PORT, optionen: { karte: 'geretsried' }, leise: true, datenbank: ':memory:' }); });
after(async () => { await server.gracefullyShutdown(false); setzeKartengroesse(64, 48); });

test('autos.json: PKW-Varianten vorhanden, Bogen höchstens 4096 px, Felder passen', () => {
  const j = JSON.parse(readFileSync(new URL('../client/grafik/autos.json', import.meta.url)));
  const pkw = j.autos.filter(a => a.art === 'pkw');
  assert.ok(pkw.length >= 4, 'zu wenige PKW-Varianten');
  for (const a of j.autos) {
    assert.ok(['pkw', 'kombi', 'kleinbus', 'taxi', 'polizei', 'krankenwagen', 'laster'].includes(a.art), 'unbekannte Art ' + a.art);
    assert.ok(a.laenge > 20 && a.laenge < 200, 'Länge');
  }
  const webp = readFileSync(new URL('../client/grafik/autos.webp', import.meta.url));
  assert.equal(webp.toString('ascii', 8, 12), 'WEBP');
  const breite = webp.readUIntLE(24, 3) + 1, hoehe = webp.readUIntLE(27, 3) + 1;
  assert.ok(breite <= 4096 && hoehe <= 4096, 'Autobogen zu groß für Handys');
  assert.equal(breite, j.feldB * j.spalten);
  assert.equal(hoehe, j.feldH);
  assert.ok(Math.max(...j.autos.map(a => a.nr)) < j.spalten);
});

test('autoVonOben: mit Bild-Autos und ohne läuft ohne Fehler, Bild wird gezeichnet', () => {
  const aufrufe = [];
  const ctx = new Proxy({}, { get: (_, k) => k === 'drawImage' ? (...a) => aufrufe.push(a) : k === 'createLinearGradient' ? () => ({ addColorStop() {} }) : () => {}, set: () => true });
  for (let i = 0; i < 20; i++) autoVonOben(ctx, { x: 100 + i * 13, y: 50 + i * 7, farbe: i % 8, senkrecht: i % 2 === 0 });
  assert.equal(aufrufe.length, 0, 'ohne Bild darf nichts gezeichnet werden');
  const j = JSON.parse(readFileSync(new URL('../client/grafik/autos.json', import.meta.url)));
  setzeAutoBilder({}, j);
  try {
    for (let i = 0; i < 40; i++) autoVonOben(ctx, { x: 100 + i * 13, y: 50 + i * 7, farbe: i % 8, senkrecht: i % 2 === 0 });
    assert.ok(aufrufe.length > 5 && aufrufe.length < 35, 'Anteil Bild-Autos: ' + aufrufe.length);
    const n = aufrufe.length;
    autoVonOben(ctx, { x: 1, y: 1, farbe: 0, gezeichnet: true });
    assert.equal(aufrufe.length, n, 'gezeichnet: true erzwingt die gezeichnete Fassung');
  } finally { setzeAutoBilder(null, null); }
});

test('Verkehr: etwa 10 % Laster, mit Länge und Tempo', async () => {
  const c = await new Client(`ws://127.0.0.1:${PORT}`).joinOrCreate('zombies', { name: 'Fernfahrer', spielerId: crypto.randomBytes(16).toString('hex') });
  try {
    const raum = matchMaker.getLocalRoomById(c.roomId), s = raum.state;
    for (const id of [...s.fahrzeuge.keys()]) { s.fahrzeuge.delete(id); raum.verkehr.info.delete(id); }
    raum.verkehr.start([], 400);
    const liste = [...s.fahrzeuge.values()];
    const laster = liste.filter(f => f.art === 'laster').length;
    assert.equal(liste.length, 400);
    assert.ok(laster > 400 * LASTER_ANTEIL * 0.5 && laster < 400 * LASTER_ANTEIL * 1.6, 'Lasteranteil: ' + laster);
    assert.ok(LAENGE.laster > LAENGE.auto, 'Laster länger als Auto');
    const ls = [...s.fahrzeuge.values()].filter(f => f.art === 'laster'), v0 = ls.map(f => [f.x, f.y]);
    for (let t = 0; t < 100; t++) raum.verkehr.schritt(0.05);
    assert.ok(ls.some((f, i) => Math.hypot(f.x - v0[i][0], f.y - v0[i][1]) > 5), 'kein Laster bewegt sich');
  } finally { await c.leave(); }
});

test('Bewohner: etwa 6 % Polizisten (Kennung p)', async () => {
  const c = await new Client(`ws://127.0.0.1:${PORT}`).joinOrCreate('zombies', { name: 'Streife', spielerId: crypto.randomBytes(16).toString('hex') });
  try {
    const raum = matchMaker.getLocalRoomById(c.roomId), s = raum.state;
    for (const id of [...s.menschen.keys()]) { s.menschen.delete(id); raum.stadt.info.delete(id); }
    raum.stadt.start(600, 0);
    const alle = [...s.menschen.values()], pol = alle.filter(m => m.aussehen.startsWith('p')).length;
    assert.equal(alle.length, 600);
    assert.ok(pol > 600 * 0.06 * 0.5 && pol < 600 * 0.06 * 1.6, 'Polizisten: ' + pol);
  } finally { await c.leave(); }
});

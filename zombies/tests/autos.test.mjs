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
import { fzPx } from '../client/masse.mjs';

let server;
const PORT = 27900 + Math.floor(Math.random() * 90);
before(async () => { server = await starte({ port: PORT, optionen: { karte: 'geretsried' }, leise: true, datenbank: ':memory:' }); });
after(async () => { await server.gracefullyShutdown(false); setzeKartengroesse(64, 48); });

test('autos.json: PKW-Varianten vorhanden, Bogen höchstens 4096 px, Felder passen', () => {
  const j = JSON.parse(readFileSync(new URL('../client/grafik/autos.json', import.meta.url)));
  const mind = { pkw: 8, sport: 2, taxi: 1, kleinbus: 1, transporter: 1, laster: 2, polizei: 1, krankenwagen: 1 };
  for (const [art, n] of Object.entries(mind)) assert.ok(j.autos.filter(a => a.art === art && !a.anim).length >= n, 'zu wenige Varianten: ' + art);
  for (const art of ['polizei', 'krankenwagen']) assert.deepEqual(j.autos.filter(a => a.art === art && a.anim).map(a => a.anim).sort(), [1, 2, 3], 'Blaulichtbilder ' + art);
  for (const a of j.autos) {
    assert.ok(Object.keys(mind).includes(a.art), 'unbekannte Art ' + a.art);
    assert.ok(a.laenge > 20 && a.laenge <= 90 && a.breite > 10 && a.breite <= 44, 'Größe');
    assert.ok(a.anim === undefined || [1, 2, 3].includes(a.anim));
  }
  // Maßstab 8 px = 1 m: Abstandswerte im Verkehr (LAENGE) = echte Fahrzeuglänge (client/masse.mjs); Sprites werden beim Zeichnen darauf gebracht
  for (const [art, fz] of [['auto', 'pkw'], ['laster', 'laster'], ['bus', 'bus'], ['evakuierung', 'evakuierung'], ['polizei', 'polizei'], ['feuerwehr', 'feuerwehr']]) {
    assert.ok(Math.abs(LAENGE[art] - fzPx(fz)[0]) <= 4, `LAENGE.${art} = ${LAENGE[art]} px, echt ${fzPx(fz)[0]} px`);
  }
  assert.equal(fzPx('pkw')[0], 36, 'PKW 4,5 m = 36 px');
  const webp = readFileSync(new URL('../client/grafik/autos.webp', import.meta.url));
  assert.equal(webp.toString('ascii', 8, 12), 'WEBP');
  const breite = webp.readUIntLE(24, 3) + 1, hoehe = webp.readUIntLE(27, 3) + 1;
  assert.ok(breite <= 4096 && hoehe <= 4096, 'Autobogen zu groß für Handys');
  assert.equal(breite, j.feldB * j.spalten);
  assert.equal(hoehe, j.feldH * j.zeilen);
  assert.ok(Math.max(...j.autos.map(a => a.nr)) < j.spalten * j.zeilen);
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
    assert.ok(aufrufe.length >= 38, 'fast alle Autos als Bild: ' + aufrufe.length);
    // geparkt in Lücke/Parkplatz: nur PKW-Länge; Rand darf länger sein; Ausschnitt liegt im Bogen
    aufrufe.length = 0;
    for (let i = 0; i < 200; i++) autoVonOben(ctx, { id: 'b' + i, x: 10 + i, y: 5 + i * 3, farbe: i % 6, platz: 'bucht', winkel: 0 });
    assert.equal(aufrufe.length, 200);
    for (const a of aufrufe) assert.ok(a[3] > 0 && a[1] + a[3] <= j.feldB * j.spalten + 1 && a[2] + a[4] <= j.feldH * j.zeilen + 1, 'Ausschnitt im Bogen');
    const arten = new Set(); const nr2art = n => j.autos.find(a => a.nr === n);
    aufrufe.length = 0;
    for (let i = 0; i < 300; i++) autoVonOben(ctx, { id: 'b' + i, x: 10 + i, y: 5 + i * 3, farbe: i % 6, platz: 'rand', winkel: 0 });
    for (const a of aufrufe) { const e = nr2art(Math.round(a[2] / j.feldH) * j.spalten + Math.round(a[1] / j.feldB)); arten.add(e.art); assert.ok(!['polizei', 'krankenwagen', 'laster'].includes(e.art), 'geparkt: ' + e.art); }
    assert.ok(arten.has('pkw') && arten.has('sport') && (arten.has('kleinbus') || arten.has('transporter')), 'Varianten am Rand: ' + [...arten]);
    aufrufe.length = 0;
    for (let i = 0; i < 300; i++) autoVonOben(ctx, { id: 'b' + i, x: 10 + i, y: 5 + i * 3, farbe: i % 6, platz: 'parkplatz', winkel: 0 });
    for (const a of aufrufe) assert.ok(nr2art(Math.round(a[2] / j.feldH) * j.spalten + Math.round(a[1] / j.feldB)).laenge <= 46, 'Parkplatz: nur PKW-Länge');
    aufrufe.length = 0; autoVonOben(ctx, { x: 1, y: 1, farbe: 0, gezeichnet: true }); aufrufe.length = 0;
    for (let i = 0; i < 40; i++) autoVonOben(ctx, { x: 100 + i * 13, y: 50 + i * 7, farbe: i % 8, senkrecht: i % 2 === 0 });
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

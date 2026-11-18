// Verwaltungsseite: nur über Ingress (bzw. lokal mit Testschalter), Werte gelten sofort und werden gespeichert
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { starte } from '../server/index.mjs';
import { SpielRaum } from '../server/raum.mjs';
import { bereinige } from '../server/einstellungen.mjs';

const PORT = 25790;
const ordner = fs.mkdtempSync(path.join(os.tmpdir(), 'zombies-verwaltung-'));
let server;
before(async () => {
  server = await starte({ port: PORT, optionen: { karte: 'dorf', zombies: 10 }, leise: true,
    datenbank: path.join(ordner, 'z.db'), einstellungsDatei: path.join(ordner, 'einstellungen.json') });
});
after(async () => { await server.gracefullyShutdown(false); delete process.env.ZOMBIES_VERWALTUNG_LOKAL; fs.rmSync(ordner, { recursive: true, force: true }); });

test('Verwaltung: ohne Seitenleiste gesperrt', async () => {
  delete process.env.ZOMBIES_VERWALTUNG_LOKAL;
  const r = await fetch(`http://127.0.0.1:${PORT}/verwaltung/api`);
  assert.equal(r.status, 403);
  const r2 = await fetch(`http://127.0.0.1:${PORT}/verwaltung/api`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-ingress-path': '/x' }, body: '{"bots":5}' });
  assert.equal(r2.status, 403, 'gefälschter Ingress-Kopf von außen muss scheitern');
});

test('Verwaltung: ändern gilt sofort und wird gespeichert', async () => {
  process.env.ZOMBIES_VERWALTUNG_LOKAL = '1';
  const r = await fetch(`http://127.0.0.1:${PORT}/verwaltung/api`, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ zombies: { dichte: 25, tempo: 999 }, test: { zeitraffer: 10, unsterblich: ['Gregor', 'gregor', ''] }, funde: { wasser: 0, gibtsnicht: 5 } }) });
  assert.equal(r.status, 200);
  const d = await r.json();
  assert.equal(d.einstellungen.zombies.dichte, 25);
  assert.equal(d.einstellungen.zombies.tempo, 150, 'Tempo begrenzt');
  assert.equal(d.einstellungen.funde.wasser, 0);
  assert.ok(!('gibtsnicht' in d.einstellungen.funde));
  assert.equal(SpielRaum.einstellungen.zombieFaktor, 2.5);
  assert.equal(SpielRaum.einstellungen.zeitraffer, 10);
  assert.ok(SpielRaum.einstellungen.unsterblich.has('gregor'));
  const datei = JSON.parse(fs.readFileSync(path.join(ordner, 'einstellungen.json'), 'utf8'));
  assert.equal(datei.zombies.dichte, 25);
  // Seitenleiste zeigt die Verwaltung, ?spielen das Spiel
  const seite = await (await fetch(`http://127.0.0.1:${PORT}/verwaltung.html`)).text();
  assert.match(seite, /verwaltung\/api/);
});

test('Einstellungen bereinigen: Unsinn wird zu gültigen Werten', () => {
  const e = bereinige({ karte: 'mond', bots: -3, zombies: { dichte: 'viel' }, test: { zeitraffer: 7, unsterblich: 'x' } });
  assert.equal(e.karte, 'geretsried'); assert.equal(e.bots, 0); assert.equal(e.zombies.dichte, 10);
  assert.equal(e.test.zeitraffer, 1); assert.deepEqual(e.test.unsterblich, []);
});

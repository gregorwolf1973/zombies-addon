// Impressum/Datenschutz: leer → 404 und kein Link in /info; gesetzt → Seite mit escaptem Text, Einstellungen speichern die Felder.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { starte } from '../server/index.mjs';
import { freierPort } from './hilfe.mjs';
import { rechtstextHtml } from '../server/rechtstext.mjs';

const ordner = fs.mkdtempSync(path.join(os.tmpdir(), 'impressum-'));
const PORT = await freierPort();
let server;
before(async () => {
  process.env.ZOMBIES_VERWALTUNG_LOKAL = '1';
  server = await starte({ port: PORT, optionen: { karte: 'dorf', zombies: 10 }, leise: true,
    datenbank: path.join(ordner, 'z.db'), einstellungsDatei: path.join(ordner, 'einstellungen.json') });
});
after(async () => { await server.gracefullyShutdown(false); delete process.env.ZOMBIES_VERWALTUNG_LOKAL; fs.rmSync(ordner, { recursive: true, force: true }); });
const url = p => `http://127.0.0.1:${PORT}${p}`;
const post = (p, k) => fetch(url(p), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(k) });

test('leer: 404 und kein Link in /info', async () => {
  assert.equal((await fetch(url('/impressum'))).status, 404);
  assert.equal((await fetch(url('/datenschutz'))).status, 404);
  const i = await (await fetch(url('/info'))).json();
  assert.equal(i.impressum, false); assert.equal(i.datenschutz, false);
});

test('gesetzt: Seite enthält Text, HTML wird escaped, Links nur http(s)', async () => {
  const r = await post('/verwaltung/api', { impressum: '# Anbieter\n\nMax **Muster** <script>alert(1)</script>\n[Mail](mailto:a@b.de) [Böse](javascript:alert(1))', datenschutz: 'Keine Daten.' });
  assert.ok(r.ok, 'Einstellungen gespeichert: ' + r.status);
  const res = await fetch(url('/impressum'));
  assert.equal(res.status, 200);
  const t = await res.text();
  assert.match(t, /<h2>Anbieter<\/h2>/);
  assert.match(t, /<strong>Muster<\/strong>/);
  assert.ok(!t.includes('<script>alert'), 'Skript escaped');
  assert.match(t, /&lt;script&gt;/);
  assert.match(t, /href="mailto:a@b\.de"/);
  assert.ok(!/href="javascript/i.test(t));
  assert.match(await (await fetch(url('/datenschutz'))).text(), /Keine Daten\./);
  const i = await (await fetch(url('/info'))).json();
  assert.equal(i.impressum, true); assert.equal(i.datenschutz, true);
  assert.ok(Array.isArray(i.kulissen) && i.kulissen.includes('geretsried2') && !i.kulissen.includes('geretsried'));
});

test('rechtstextHtml: Anführungszeichen im Link-Text brechen nicht aus', () => {
  const h = rechtstextHtml('[a" onclick="x](https://e.de/"onmouseover=1)');
  assert.match(h, /^<p><a href="[^"]*" rel="noopener noreferrer">[^<"]*<\/a><\/p>$/, h);   // kein rohes Anführungszeichen im Tag
});

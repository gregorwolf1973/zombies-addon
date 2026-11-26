// Auslieferung des Clients: unveränderlich unter v/<version>/, komprimiert, index.html no-cache, Ingress-Präfix bleibt relativ
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import zlib from 'node:zlib';
import { starte } from '../server/index.mjs';
import { freierPort } from './hilfe.mjs';

const PORT = await freierPort();
const ordner = fs.mkdtempSync(path.join(os.tmpdir(), 'zombies-ausl-'));
let server, v;

function hole(pfad, headers = {}) {
  return new Promise((ok, fehl) => {
    http.get({ host: '127.0.0.1', port: PORT, path: pfad, headers: { 'accept-encoding': 'identity', ...headers } }, res => {
      const teile = []; res.on('data', d => teile.push(d)); res.on('end', () => ok({ status: res.statusCode, h: res.headers, body: Buffer.concat(teile) }));
    }).on('error', fehl);
  });
}

before(async () => {
  server = await starte({ port: PORT, optionen: { karte: 'dorf' }, leise: true, datenbank: path.join(ordner, 'spiel.db') });
  const index = (await hole('/')).body.toString();
  v = index.match(/src="v\/([^/"]+)\/spiel\.mjs"/)?.[1];
});
after(async () => { await server.gracefullyShutdown(false); fs.rmSync(ordner, { recursive: true, force: true }); });

test('index.html: no-cache, relative versionierte Pfade (Ingress-Präfix bleibt erhalten)', async () => {
  assert.ok(v, 'Version im Skriptpfad');
  const r = await hole('/');
  assert.equal(r.status, 200);
  assert.equal(r.h['cache-control'], 'no-cache');
  const t = r.body.toString();
  assert.match(t, new RegExp(`href="v/${v}/stil\\.css"`));
  assert.match(t, new RegExp(`src="v/${v}/vendor/phaser\\.min\\.js"`));
  assert.match(t, new RegExp(`src="v/${v}/vendor/colyseus\\.js"`));
  assert.doesNotMatch(t, /(src|href)="\//, 'keine absoluten Pfade');
  // über Ingress-Präfix mit ?spielen: dieselbe Seite, weiter nur relative Pfade
  const r2 = await hole('/?spielen', { 'x-ingress-path': '/api/hassio_ingress/abc' });
  assert.equal(r2.status, 200);
  assert.match(r2.body.toString(), new RegExp(`src="v/${v}/spiel\\.mjs"`));
});

test('v/<version>/: immutable, Module und Vendor erreichbar, falsche Version 404', async () => {
  for (const p of ['spiel.mjs', 'basis.mjs', 'stil.css', 'karten/geretsried.json', 'grafik/figuren.json', 'vendor/phaser.min.js', 'vendor/colyseus.js', 'grafik/hund.webp']) {
    const r = await hole(`/v/${v}/${p}`);
    assert.equal(r.status, 200, p);
    assert.match(r.h['cache-control'], /max-age=31536000/, p);
    assert.match(r.h['cache-control'], /immutable/, p);
  }
  assert.equal((await hole('/v/0.0.0-xxxx/spiel.mjs')).status, 404);
  assert.notEqual((await hole(`/v/${v}/../server/index.mjs`)).status, 200);
});

test('gzip/br für Text mit Vary, nicht für Bilder; 304 mit ETag', async () => {
  const roh = (await hole(`/v/${v}/karten/geretsried.json`)).body;
  const g = await hole(`/v/${v}/karten/geretsried.json`, { 'accept-encoding': 'gzip' });
  assert.equal(g.h['content-encoding'], 'gzip');
  assert.match(g.h.vary, /Accept-Encoding/i);
  assert.ok(g.body.length < roh.length / 2);
  assert.deepEqual(zlib.gunzipSync(g.body), roh);
  const b = await hole(`/v/${v}/spiel.mjs`, { 'accept-encoding': 'gzip, deflate, br' });
  assert.equal(b.h['content-encoding'], 'br');
  assert.equal(zlib.brotliDecompressSync(b.body).toString(), (await hole(`/v/${v}/spiel.mjs`)).body.toString());
  const n = await hole(`/v/${v}/spiel.mjs`, { 'accept-encoding': 'br', 'if-none-match': b.h.etag });
  assert.equal(n.status, 304);
  const bild = await hole(`/v/${v}/grafik/hund.webp`, { 'accept-encoding': 'gzip, br' });
  assert.equal(bild.h['content-encoding'], undefined);
  const ph = await hole(`/v/${v}/vendor/phaser.min.js`, { 'accept-encoding': 'gzip' });
  assert.equal(ph.h['content-encoding'], 'gzip');
});

test('alte Wurzelpfade: no-cache, Verwaltung und APIs nicht zwischengespeichert', async () => {
  for (const p of ['/spiel.mjs', '/stil.css', '/vendor/phaser.min.js', '/sw.js', '/manifest.json']) {
    const r = await hole(p);
    assert.equal(r.status, 200, p);
    assert.equal(r.h['cache-control'], 'no-cache', p);
  }
  const verw = await hole('/', { 'x-ingress-path': '/api/hassio_ingress/abc' });
  assert.equal(verw.h['cache-control'], 'no-cache');
  // Ingress-Kopfzeile von 127.0.0.1 entfernt der Server (entferneFremdenIngress) → es kommt die Spielseite; früher passte /erwaltung/ nur zufällig auf „Vermessungsverwaltung“ im Nachweis
  assert.match(verw.body.toString(), /<html[\s\S]*id="start"/);
  const info = await hole('/info');
  assert.doesNotMatch(info.h['cache-control'] ?? '', /immutable|max-age=\d{4,}/);
});

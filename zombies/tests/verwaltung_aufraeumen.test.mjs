// Verwaltungsseite aufräumen: Umbau der Seite verliert keine Felder, Fehler beim Laden sind sichtbar,
// Vorlagen-API (sichern/laden/export ohne Geheimnisse), gzip der API, ein gemeinsamer Abruf.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import http from 'node:http';
import { starte } from '../server/index.mjs';

const html = fs.readFileSync(new URL('../client/verwaltung.html', import.meta.url), 'utf8');
const skripte = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);

// ---------- statische Prüfungen der Seite ----------
test('Seite: alle in zeige() benutzten ids der Sammelkarte #tagNachtKarte überleben den Umbau', () => {
  const umbau = skripte.find(s => s.includes('function ausKarte'));
  assert.ok(umbau, 'Umbau-Skript gefunden');
  const vorUmbauEnde = umbau.slice(0, umbau.indexOf('tn.remove()'));
  // Markup der Sammelkarte
  const start = html.indexOf('id="tagNachtKarte"');
  const ende = html.indexOf('</section>', start);
  const karte = html.slice(start, ende);
  const idsKarte = [...karte.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
  // alle ids, die Skripte per $('…') / feld('…') / regler('…') ansprechen
  const benutzt = new Set();
  for (const s of skripte) for (const m of s.matchAll(/(?:\$|feld|regler)\(\s*'([A-Za-z0-9_]+)'/g)) benutzt.add(m[1]);
  // Elemente, die der Umbau über Klassen oder als Ganzes verschiebt
  const ueberKlasse = new Set(['tnUhr', 'tnPhase', 'tnStatus']);
  const imGroessenBlock = id => /^(tnMGroesse|tnZGroesse|tnGGroesse|gr[A-Z])/.test(id) || /Wert$/.test(id);
  const fehlend = idsKarte.filter(id => benutzt.has(id) && !ueberKlasse.has(id) && !imGroessenBlock(id) && !vorUmbauEnde.includes("'" + id + "'"));
  assert.deepEqual(fehlend, [], 'ids in zeige() ohne Platz nach dem Umbau (zeile/schalter/rein fehlt): ' + fehlend.join(', '));
  // und die Sammelkarte selbst wird nicht vor dem Verschieben entfernt
  assert.ok(umbau.indexOf('tn.remove()') > umbau.indexOf("'tnBaumTempo'"));
});

test('Seite: CSS-Selektoren der Karten Geräusche/Sprache/Fähigkeiten finden ihre ids nach dem Umbau wieder', () => {
  const umbau = skripte.find(s => s.includes('function ausKarte'));
  assert.match(umbau, /u\.id = alteId/, 'ausKarte überträgt die id aufs details');
  assert.match(skripte.join('\n'), /tw\.id = 'toeneKarte'/, 'Ton-Wrapper behält #toeneKarte');
  for (const id of ['toeneKarte', 'spracheKarte', 'fkKarte']) assert.ok(html.includes('#' + id + ' '), 'CSS für #' + id);
});

test('Seite: laden() schluckt Fehler nicht stumm, es gibt eine sichtbare Statuszeile', () => {
  const laden = [...html.matchAll(/function laden\(\)[^\n]*/g)].map(m => m[0]);
  assert.ok(laden.length >= 6, 'alle laden()-Funktionen gefunden: ' + laden.length);
  for (const l of laden) assert.ok(!/catch\(function \(\) \{\s*(\/\*[^*]*\*\/)?\s*\}\)/.test(l) && /zFehler/.test(l), 'laden() meldet Fehler: ' + l.slice(0, 80));
  assert.match(skripte[0], /window\.zFehler = /);
  assert.match(skripte[0], /id = 'speicherZeile'/);
  assert.match(html, /Keine Verbindung zum Spielserver/);
});

test('Seite: gemeinsamer 5-s-Abruf pausiert bei versteckter Seite, Rückgängig 5 s', () => {
  const kopf = skripte[0];
  assert.match(kopf, /document\.hidden/);
  assert.match(kopf, /ms === 5000/);
  assert.match(kopf, /rueckTimer = setTimeout\([\s\S]*?5000\)/);
});

test('Seite: Sprungleiste mit sechs Gruppen und Suchfeld', () => {
  const l = skripte.find(s => s.includes('GRUPPEN'));
  for (const g of ['Runde', 'Gegner', 'Welt', 'Ausrüstung', 'Ton', 'Zugang & Test']) assert.ok(l.includes("'" + g + "'"), g);
  assert.match(l, /seitenSuche/);
  assert.match(l, /Jetzt neu starten/);
  assert.match(l, /vorlageSichern/);
});

// ---------- Server ----------
const PORT = 25791;
const ordner = fs.mkdtempSync(path.join(os.tmpdir(), 'zombies-aufraeumen-'));
let server;
before(async () => {
  process.env.ZOMBIES_VERWALTUNG_LOKAL = '1';
  server = await starte({ port: PORT, optionen: { karte: 'dorf', zombies: 10 }, leise: true,
    datenbank: path.join(ordner, 'z.db'), einstellungsDatei: path.join(ordner, 'einstellungen.json') });
});
after(async () => { await server.gracefullyShutdown(false); delete process.env.ZOMBIES_VERWALTUNG_LOKAL; fs.rmSync(ordner, { recursive: true, force: true }); });

const url = p => `http://127.0.0.1:${PORT}${p}`;
const post = (p, k) => fetch(url(p), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(k) });

test('API: GET /verwaltung/api ist gzip-komprimiert, wenn der Client es kann', async () => {
  const roh = await new Promise((ok, fail) => {
    http.get(url('/verwaltung/api'), { headers: { 'accept-encoding': 'gzip' } }, res => {
      const teile = []; res.on('data', d => teile.push(d)); res.on('end', () => ok({ res, body: Buffer.concat(teile) }));
    }).on('error', fail);
  });
  assert.equal(roh.res.headers['content-encoding'], 'gzip');
  const d = JSON.parse(zlib.gunzipSync(roh.body).toString());
  assert.ok(d.einstellungen && d.vorgaben);
  assert.ok(roh.body.length < JSON.stringify(d).length / 2, 'deutlich kleiner');
  const ohne = await fetch(url('/verwaltung/api'), { headers: { 'accept-encoding': 'identity' } });
  assert.equal(ohne.headers.get('content-encoding'), null);
  assert.ok((await ohne.json()).einstellungen);
});

test('Vorlagen: sichern, laden (eigen/mitgeliefert), Export – ohne Geheimnisse; gesperrt ohne Ingress', async () => {
  await post('/verwaltung/api', { zugangscode: 'geheim123', superuserPasswort: 'supergeheim99', bots: 4, autos: 33 });
  let r = await post('/verwaltung/vorlage', { aktion: 'sichern' });
  assert.equal(r.status, 200);
  assert.equal((await r.json()).eigeneVorlage, true);
  const gespeichert = fs.readFileSync(path.join(ordner, 'vorlage_eigen.json'), 'utf8');
  assert.ok(!/geheim123|supergeheim|superuserHash|zugangscode|"test"/.test(gespeichert), 'keine Geheimnisse in der Vorlagendatei');
  assert.equal(JSON.parse(gespeichert).bots, 4);

  const ex = await fetch(url('/verwaltung/export'));
  assert.equal(ex.status, 200);
  assert.match(ex.headers.get('content-disposition'), /attachment/);
  const exText = await ex.text();
  assert.ok(!/geheim123|supergeheim|superuserHash|zugangscode/.test(exText), 'Export ohne Geheimnisse');
  assert.equal(JSON.parse(exText).autos, 33);

  await post('/verwaltung/api', { bots: 1, autos: 5 });
  r = await post('/verwaltung/vorlage', { aktion: 'laden', quelle: 'eigen' });
  assert.equal(r.status, 200);
  const d = await r.json();
  assert.equal(d.einstellungen.bots, 4); assert.equal(d.einstellungen.autos, 33);
  assert.equal(d.einstellungen.zugangscode, 'geheim123', 'Zugangscode bleibt beim Laden unverändert');
  assert.equal(d.einstellungen.superuserGesetzt, true);

  r = await post('/verwaltung/vorlage', { aktion: 'laden', quelle: 'mitgeliefert' });
  assert.equal(r.status, 200);
  assert.equal((await r.json()).einstellungen.zugangscode, 'geheim123');
  assert.equal((await post('/verwaltung/vorlage', { aktion: 'quatsch' })).status, 400);

  delete process.env.ZOMBIES_VERWALTUNG_LOKAL;
  assert.equal((await post('/verwaltung/vorlage', { aktion: 'sichern' })).status, 403);
  assert.equal((await fetch(url('/verwaltung/export'))).status, 403);
  process.env.ZOMBIES_VERWALTUNG_LOKAL = '1';
});

test('Vorlagen: „eigen“ laden ohne gesicherte Vorlage ergibt 404', async () => {
  fs.rmSync(path.join(ordner, 'vorlage_eigen.json'), { force: true });
  const r = await post('/verwaltung/vorlage', { aktion: 'laden', quelle: 'eigen' });
  assert.equal(r.status, 404);
});

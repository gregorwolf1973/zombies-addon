// Verwaltungsseite: nur über Ingress (bzw. lokal mit Testschalter), Werte gelten sofort und werden gespeichert
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { starte } from '../server/index.mjs';
import { SpielRaum } from '../server/raum.mjs';
import { bereinige, EREIGNISSE, TON_GRUPPEN, tonKategorien } from '../server/einstellungen.mjs';

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

test('Einstellungen bereinigen: Zombie- und Leichengröße (50–200 %, Vorgabe 100)', () => {
  assert.equal(bereinige({}).zombieGroesse, 100); assert.equal(bereinige({}).leichenGroesse, 100);
  const e = bereinige({ zombieGroesse: 500, leichenGroesse: 10 });
  assert.equal(e.zombieGroesse, 200); assert.equal(e.leichenGroesse, 50);
});

test('Einstellungen bereinigen: Gesamtgröße (50–150 %) und Zombie-Leben (20–500, Vorgabe 100)', () => {
  assert.equal(bereinige({}).groesseGesamt, 100); assert.equal(bereinige({}).zombieLeben, 100);
  const e = bereinige({ groesseGesamt: 10, zombieLeben: 9999 });
  assert.equal(e.groesseGesamt, 50); assert.equal(e.zombieLeben, 500);
  assert.equal(bereinige({ groesseGesamt: 400, zombieLeben: 1 }).groesseGesamt, 150);
  assert.equal(bereinige({ zombieLeben: 1 }).zombieLeben, 20);
  assert.equal(bereinige({ zombieLeben: 250 }, bereinige({ groesseGesamt: 80 })).groesseGesamt, 80);
});

test('Verwaltungsseite: Überraschungsfaktoren im Schadenshinweis stimmen mit WAFFEN überein', async () => {
  const { WAFFEN } = await import('../client/welt.mjs');
  const html = fs.readFileSync(new URL('../client/verwaltung.html', import.meta.url), 'utf8');
  const m = /var UEB = \{([^}]*)\};/.exec(html);
  assert.ok(m, 'UEB fehlt');
  for (const [k, w] of Object.entries(WAFFEN)) {
    const g = new RegExp('\\b' + k + ': ([0-9.]+)').exec(m[1]);
    assert.ok(g, k + ' fehlt in UEB'); assert.equal(Number(g[1]), w.ueberraschung, k);
  }
});

test('Töne: Ereignisse und Zuordnung werden bereinigt', () => {
  const e = bereinige({ toene: { zombieTod: { dateien: ['ok.mp3', '../böse.mp3', 'x.exe', 'ok.mp3'], laut: 300 }, unbekannt: { dateien: ['a.mp3'] } } });
  assert.deepEqual(e.toene.zombieTod, { dateien: ['ok.mp3'], laut: 100 });
  assert.ok(!('unbekannt' in e.toene));
  assert.deepEqual(e.toene.stadt.dateien, []);
});

test('Sprache: Einstellungen werden bereinigt, gespeichert und an den Raum übergeben', async () => {
  const v = bereinige({});
  assert.deepEqual(v.sprache, { an: true, hoerweite: 40, stockwerk: 35, drinnenDraussen: 10, funk: 70, redenLockt: false });
  const e = bereinige({ sprache: { an: 'ja', hoerweite: 500, stockwerk: -5, drinnenDraussen: 99, funk: 'laut', redenLockt: true } });
  assert.equal(e.sprache.an, true, 'kein Wahrheitswert → Vorgabe');
  assert.equal(e.sprache.hoerweite, 100); assert.equal(e.sprache.stockwerk, 0);
  assert.equal(e.sprache.drinnenDraussen, 50); assert.equal(e.sprache.funk, 70); assert.equal(e.sprache.redenLockt, true);
  assert.equal(bereinige({ sprache: { hoerweite: 3 } }).sprache.hoerweite, 10);
  // Teiländerung lässt die übrigen Werte stehen
  assert.equal(bereinige({ sprache: { funk: 20 } }, e).sprache.hoerweite, 100);

  process.env.ZOMBIES_VERWALTUNG_LOKAL = '1';
  const r = await fetch(`http://127.0.0.1:${PORT}/verwaltung/api`, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sprache: { an: false, hoerweite: 60, stockwerk: 50, redenLockt: true } }) });
  const d = await r.json();
  assert.equal(d.einstellungen.sprache.hoerweite, 60);
  assert.equal(SpielRaum.einstellungen.sprache.an, false);
  assert.equal(SpielRaum.einstellungen.sprache.hoerweite, 60);
  assert.equal(SpielRaum.einstellungen.sprache.stockwerk, 0.5);
  assert.equal(SpielRaum.einstellungen.sprache.redenLockt, true);
  const datei = JSON.parse(fs.readFileSync(path.join(ordner, 'einstellungen.json'), 'utf8'));
  assert.equal(datei.sprache.hoerweite, 60);
  await fetch(`http://127.0.0.1:${PORT}/verwaltung/api`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sprache: { an: true, redenLockt: false } }) });
});

test('ICE-Server aus den Add-on-Optionen', async () => {
  const { iceServer } = await import('../server/index.mjs');
  assert.deepEqual(iceServer({}), [{ urls: 'stun:stun.l.google.com:19302' }]);
  assert.deepEqual(iceServer({ stun_server: 'aus' }), []);
  assert.deepEqual(iceServer({ stun_server: 'aus', turn_server: 'turn:t.example:3478', turn_username: 'u', turn_password: 'p' }),
    [{ urls: 'turn:t.example:3478', username: 'u', credential: 'p' }]);
});

test('Töne: jedes Ereignis hat Gruppe und Kategorien, Dateien werden nach Stichwörtern einsortiert', () => {
  const gruppen = new Set(TON_GRUPPEN.map(g => g.id));
  for (const ev of EREIGNISSE) {
    assert.ok(gruppen.has(ev.gruppe), `${ev.id}: Gruppe`);
    assert.ok(ev.kategorien?.length, `${ev.id}: Kategorien`);
  }
  assert.deepEqual(tonKategorien('zombie_scream_01.mp3'), ['zombies']);
  assert.deepEqual(tonKategorien('Pistol-Shot.ogg'), ['waffen']);
  assert.deepEqual(tonKategorien('chill-hip-hop.mp3'), ['musik']);
  assert.deepEqual(tonKategorien('irgendwas.mp3'), ['sonstiges']);
});

test('Einstellungen bereinigen: Türanteile (0–100 %, Vorgabe 50/25/25, nie alles 0)', async () => {
  const { bereinige, vorgaben } = await import('../server/einstellungen.mjs');
  assert.deepEqual(vorgaben().tueren, { frei: 50, raetsel: 25, schluessel: 25 });
  assert.deepEqual(bereinige({ tueren: { frei: 500, raetsel: -3, schluessel: 'x' } }).tueren, { frei: 100, raetsel: 0, schluessel: 25 });
  assert.deepEqual(bereinige({ tueren: { frei: 0, raetsel: 0, schluessel: 0 } }).tueren, { frei: 100, raetsel: 0, schluessel: 0 });
});

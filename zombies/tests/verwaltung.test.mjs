// Verwaltungsseite: nur über Ingress (bzw. lokal mit Testschalter), Werte gelten sofort und werden gespeichert
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { starte } from '../server/index.mjs';
import { SpielRaum } from '../server/raum.mjs';
import { bereinige, EREIGNISSE, TON_GRUPPEN, tonKategorien } from '../server/einstellungen.mjs';
import { freierPort } from './hilfe.mjs';

const PORT = await freierPort();
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
    body: JSON.stringify({ zombies: { level: [{ grund: 20, horde: 7 }], tempo: 999 }, test: { zeitraffer: 10, unsterblich: ['Gregor', 'gregor', ''] }, funde: { wasser: 0, gibtsnicht: 5 } }) });
  assert.equal(r.status, 200);
  const d = await r.json();
  assert.equal(d.einstellungen.zombies.level[0].grund, 20); assert.equal(d.einstellungen.zombies.level[0].jeSpieler, 5);
  assert.equal(d.einstellungen.zombies.tempo, 999, 'Tempo nicht mehr gedeckelt (empfohlen 50–150)');
  assert.equal(d.einstellungen.funde.wasser, 0);
  assert.ok(!('gibtsnicht' in d.einstellungen.funde));
  assert.equal(SpielRaum.einstellungen.zombiesLevel[0].grund, 20); assert.equal(SpielRaum.einstellungen.zombiesLevel[0].horde, 7);
  assert.equal(SpielRaum.einstellungen.zeitraffer, 10);
  assert.ok(SpielRaum.einstellungen.unsterblich.has('gregor'));
  const datei = JSON.parse(fs.readFileSync(path.join(ordner, 'einstellungen.json'), 'utf8'));
  assert.equal(datei.zombies.level[0].grund, 20);
  // Seitenleiste zeigt die Verwaltung, ?spielen das Spiel
  const seite = await (await fetch(`http://127.0.0.1:${PORT}/verwaltung.html`)).text();
  assert.match(seite, /verwaltung\/api/);
});

test('Einstellungen bereinigen: Unsinn wird zu gültigen Werten', () => {
  const e = bereinige({ karte: 'mond', bots: -3, zombies: { level: [{ grund: 'viel' }] }, test: { zeitraffer: 7, unsterblich: 'x' } });
  assert.equal(e.karte, 'geretsried'); assert.equal(e.bots, 0); assert.equal(e.zombies.level[0].grund, 8);
  assert.equal(e.test.zeitraffer, 1); assert.deepEqual(e.test.unsterblich, []);
});

test('Einstellungen bereinigen: Menschen- und Zombiegröße (empfohlen 50–200 %, Vorgabe 100, frei eingebbar), alte Helden-/Soldaten-/Leichenwerte entfallen', () => {
  assert.equal(bereinige({}).menschenGroesse, 100); assert.equal(bereinige({}).zombieGroesse, 100);
  const e = bereinige({ menschenGroesse: 10, zombieGroesse: 500, leichenGroesse: 10, heldenGroesse: 90, soldatenGroesse: 90 });
  assert.equal(e.menschenGroesse, 10); assert.equal(e.zombieGroesse, 500);
  for (const k of ['leichenGroesse', 'heldenGroesse', 'soldatenGroesse']) assert.equal(k in e, false);
});

test('Einstellungen bereinigen: Gesamtgröße (empfohlen 50–150 %, Vorgabe 70) und Zombie-Leben (empfohlen 20–500, Vorgabe 100), frei eingebbar', () => {
  assert.equal(bereinige({}).groesseGesamt, 70); assert.equal(bereinige({}).zombieLeben, 100);
  const e = bereinige({ groesseGesamt: 10, zombieLeben: 9999 });
  assert.equal(e.groesseGesamt, 10); assert.equal(e.zombieLeben, 9999);
  assert.equal(bereinige({ groesseGesamt: 400, zombieLeben: 1 }).groesseGesamt, 400);
  assert.equal(bereinige({ zombieLeben: 1 }).zombieLeben, 1);
  assert.equal(bereinige({ zombieLeben: -5 }).zombieLeben, 1, 'technische Untergrenze');
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
  assert.equal(e.sprache.hoerweite, 500); assert.equal(e.sprache.stockwerk, 0);
  assert.equal(e.sprache.drinnenDraussen, 50); assert.equal(e.sprache.funk, 70); assert.equal(e.sprache.redenLockt, true);
  assert.equal(bereinige({ sprache: { hoerweite: 3 } }).sprache.hoerweite, 3);
  // Teiländerung lässt die übrigen Werte stehen
  assert.equal(bereinige({ sprache: { funk: 20 } }, e).sprache.hoerweite, 500);

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

test('Hordengeräusch- und Musik-Einstellungen: Vorgaben und Klammern', async () => {
  const { bereinige, vorgaben, EREIGNISSE } = await import('../server/einstellungen.mjs');
  const v = bereinige({});
  assert.deepEqual(v.toeneHorde, { ab: 8, nurHorde: 20, voll: 40, aus: 5, hoerweite: 30 });
  assert.deepEqual(v.musik, { laut: 35, blende: 3 });
  assert.deepEqual(vorgaben().toeneHorde, v.toeneHorde);
  const k = bereinige({ toeneHorde: { ab: 999, aus: -4, hoerweite: 5, voll: 'x' }, musik: { laut: 500, blende: 0.1 } });
  assert.deepEqual(k.toeneHorde, { ab: 999, nurHorde: 20, voll: 40, aus: 0, hoerweite: 5 });
  assert.deepEqual(k.musik, { laut: 100, blende: 1 });
  // Werte bleiben bei Teil-Änderungen erhalten
  assert.equal(bereinige({ toeneHorde: { ab: 12 } }, k).toeneHorde.hoerweite, 5);
  for (const id of ['horde', 'hordeAkzent', 'musikLevel1', 'musikLevel5', 'musikLager', 'musikHorde', 'musikSafe', 'musikFinale']) assert.ok(EREIGNISSE.some(e => e.id === id), id);
  assert.equal(v.toene.musikLevel1.laut, 100);
  assert.deepEqual(v.toene.horde.dateien, []);
});

test('Tonnamen: bereinigen (trimmen, 60 Zeichen, leer entfernt, nur zulässige Dateinamen, Teiländerung)', async () => {
  const { bereinige, vorgaben } = await import('../server/einstellungen.mjs');
  assert.deepEqual(vorgaben().toeneNamen, {});
  assert.deepEqual(bereinige({}).toeneNamen, {});
  const a = bereinige({ toeneNamen: { 'a.mp3': '  Hundebellen  ', 'b.ogg': '   ', '../x.mp3': 'böse', 'c.txt': 'nein', 'd.wav': 'x'.repeat(100), 'e.mp3': 42 } });
  assert.deepEqual(Object.keys(a.toeneNamen).sort(), ['a.mp3', 'd.wav']);
  assert.equal(a.toeneNamen['a.mp3'], 'Hundebellen');
  assert.equal(a.toeneNamen['d.wav'].length, 60);
  const b = bereinige({ toeneNamen: { 'f.mp3': 'Frau' } }, a);   // Teiländerung behält die übrigen
  assert.equal(b.toeneNamen['a.mp3'], 'Hundebellen'); assert.equal(b.toeneNamen['f.mp3'], 'Frau');
  assert.ok(!('a.mp3' in bereinige({ toeneNamen: { 'a.mp3': '' } }, b).toeneNamen), 'leer = Name entfernen');
  assert.deepEqual(bereinige({ toeneNamen: 'quatsch' }, b).toeneNamen, b.toeneNamen);
});

test('Tonnamen: API setzen, beim Hochladen mitgeben, beim Löschen entfernen', async () => {
  process.env.ZOMBIES_VERWALTUNG_LOKAL = '1';
  const url = `http://127.0.0.1:${PORT}/verwaltung`;
  const hoch = await fetch(`${url}/ton`, { method: 'POST', headers: { 'x-dateiname': 'hund-bellt-01.mp3', 'x-anzeigename': encodeURIComponent('  Hund bellt ') }, body: Buffer.from('xx') });
  assert.equal(hoch.status, 200);
  assert.equal((await hoch.json()).einstellungen.toeneNamen['hund-bellt-01.mp3'], 'Hund bellt');
  const r = await fetch(`${url}/api`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ toeneNamen: { 'hund-bellt-01.mp3': 'Laut bellender Hund', 'nix.txt': 'x' } }) });
  const d = await r.json();
  assert.deepEqual(d.einstellungen.toeneNamen, { 'hund-bellt-01.mp3': 'Laut bellender Hund' });
  assert.equal(JSON.parse(fs.readFileSync(path.join(ordner, 'einstellungen.json'), 'utf8')).toeneNamen['hund-bellt-01.mp3'], 'Laut bellender Hund');
  const del = await fetch(`${url}/ton/hund-bellt-01.mp3`, { method: 'DELETE' });
  assert.equal(del.status, 200);
  assert.deepEqual((await del.json()).einstellungen.toeneNamen, {});
});

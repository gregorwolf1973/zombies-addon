// Superuser-Testmenü: Anmeldung per Testzugang, Befehle nur für den Superuser, Passwort nie ausgeliefert
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Client } from '@colyseus/sdk';
import { starte } from '../server/index.mjs';
import { SpielRaum } from '../server/raum.mjs';
import { begrenzungZuruecksetzen, hashe, pruefe } from '../server/superuser.mjs';
import { imLager } from '../client/stuetzpunkt.mjs';
import { MUNITION_MAX } from '../client/welt.mjs';
import { freierPort } from './hilfe.mjs';

const PORT = await freierPort();
const URL_ = `http://127.0.0.1:${PORT}`;
const TESTPW = 'Nur-Ein-Testwert-42';   // nur für diesen Test
const ordner = fs.mkdtempSync(path.join(os.tmpdir(), 'zombies-su-'));
const warte = ms => new Promise(r => setTimeout(r, ms));
const verbunden = [];
let server;
async function bis(f, ms = 4000) { const e = Date.now() + ms; while (Date.now() < e) { if (f()) return true; await warte(20); } return f(); }
const beitreten = async (name, pw) => {
  const c = await new Client(URL_).joinOrCreate('zombies', { name, ...(pw ? { testzugang: pw } : {}) });
  verbunden.push(c);
  await bis(() => c.state.spieler?.get(c.sessionId));
  return c;
};
const raum = () => SpielRaum.aktiv;
const ich = c => raum().state.spieler.get(c.sessionId);
const ex = c => raum().extra.get(c.sessionId);
const su = async (c, m) => { c.send('su', m); await warte(150); };
const verwaltung = (body, methode = 'POST') => fetch(`${URL_}/verwaltung/api`, { method: methode, headers: { 'content-type': 'application/json' }, ...(methode === 'POST' ? { body: JSON.stringify(body) } : {}) });

before(async () => {
  process.env.ZOMBIES_VERWALTUNG_LOKAL = '1';
  server = await starte({ port: PORT, optionen: { karte: 'geretsried', bots: 2 }, leise: true,
    datenbank: path.join(ordner, 'z.db'), einstellungsDatei: path.join(ordner, 'einstellungen.json') });
});
after(async () => {
  for (const c of verbunden) { try { await c.leave(); } catch { /* weg */ } }
  await server.gracefullyShutdown(false); delete process.env.ZOMBIES_VERWALTUNG_LOKAL; fs.rmSync(ordner, { recursive: true, force: true });
});

test('Hash: richtiges Passwort passt, falsches und leeres nicht, zwei Hashes sind verschieden', () => {
  const h = hashe(TESTPW);
  assert.match(h, /^scrypt\$[0-9a-f]{32}\$[0-9a-f]{64}$/);
  assert.ok(!h.includes(TESTPW));
  assert.ok(pruefe(TESTPW, h)); assert.ok(!pruefe('falsch', h)); assert.ok(!pruefe('', h)); assert.ok(!pruefe(TESTPW, '')); assert.ok(!pruefe(TESTPW, 'abc'));
  assert.notEqual(h, hashe(TESTPW));
});

test('ohne Passwort-Einstellung gibt es keinen Superuser, Befehle wirken nicht', async () => {
  begrenzungZuruecksetzen();
  const a = await beitreten('Sepp', TESTPW);
  assert.equal(ich(a).su, false); assert.ok(!ex(a).superuser);
  raum().state.uhr = 500;
  await su(a, { befehl: 'zeit', stunde: 12 });
  assert.ok(Math.abs(raum().state.uhr - 500) < 5);
  await a.leave();
});

test('Verwaltung: Passwort setzen liefert weder Passwort noch Hash aus', async () => {
  const kurz = await (await verwaltung({ superuserPasswort: 'kurz' })).json();
  assert.equal(kurz.einstellungen.superuserGesetzt, false, 'zu kurz wird ignoriert');
  const r = await verwaltung({ superuserPasswort: TESTPW });
  const text = await r.text();
  assert.ok(!text.includes(TESTPW) && !text.includes('scrypt$') && !text.includes('superuserHash'));
  assert.equal(JSON.parse(text).einstellungen.superuserGesetzt, true);
  const get = await (await verwaltung(null, 'GET')).text();
  assert.ok(!get.includes(TESTPW) && !get.includes('scrypt$') && !get.includes('superuserHash'));
  const datei = JSON.parse(fs.readFileSync(path.join(ordner, 'einstellungen.json'), 'utf8'));
  assert.match(datei.superuserHash, /^scrypt\$/);
  assert.ok(!fs.readFileSync(path.join(ordner, 'einstellungen.json'), 'utf8').includes(TESTPW));
  // ein Hash von außen wird nicht angenommen
  const fremd = hashe('anderes-Passwort');
  await verwaltung({ superuserHash: fremd, bots: 2 });
  assert.equal(JSON.parse(fs.readFileSync(path.join(ordner, 'einstellungen.json'), 'utf8')).superuserHash, datei.superuserHash);
});

test('falsches Passwort: kein Superuser; mehr als 5 Fehlversuche je Minute sperren auch das richtige', async () => {
  begrenzungZuruecksetzen();
  const a = await beitreten('Vroni', 'falsches-Passwort');
  assert.equal(ich(a).su, false); assert.ok(!ex(a).superuser);
  raum().state.uhr = 500;
  await su(a, { befehl: 'zeit', stunde: 23 });
  assert.ok(Math.abs(raum().state.uhr - 500) < 5);
  await a.leave();
  for (let i = 0; i < 5; i++) { const c = await beitreten('Nix' + i, 'falsch' + i); await c.leave(); }
  const gesperrt = await beitreten('Sepp', TESTPW);
  assert.equal(ich(gesperrt).su, false, 'gesperrt');
  await gesperrt.leave();
  begrenzungZuruecksetzen();
});

test('richtiges Passwort: Superuser mit ⭐, normaler Spieler daneben kann nichts', async () => {
  begrenzungZuruecksetzen();
  const boss = await beitreten('Gregor', TESTPW);
  const normal = await beitreten('Hias');
  assert.equal(ich(boss).su, true); assert.ok(ex(boss).superuser);
  assert.equal(ich(normal).su, false);
  assert.ok(await bis(() => normal.state.spieler.get(boss.sessionId)?.su === true), 'andere sehen das ⭐-Flag');
  // normaler Spieler: alle Befehle wirkungslos
  const hp0 = ich(normal).x;
  raum().state.uhr = 500;
  for (const befehl of ['zeit', 'auffuellen', 'bw', 'evak', 'bots', 'horde', 'lager', 'unsterblich', 'evakrufen', 'zeitraffer']) await su(normal, { befehl, stunde: 12, groesse: 50, zustand: 'gefallen', faktor: 10 });
  assert.equal(SpielRaum.einstellungen.zeitraffer, 1, 'normaler Spieler stellt Zeitraffer um');
  assert.ok(Math.abs(raum().state.uhr - 500) < 5);
  assert.equal(ich(normal).x, hp0);
  assert.ok(!raum().welle.aktiv); assert.equal(raum().state.stuetzpunkt, 'steht'); assert.ok(!ex(normal).suUnsterblich);

  // Zeit
  await su(boss, { befehl: 'zeit', stunde: 12 }); assert.ok(Math.abs(raum().state.uhr - 720) < 5);
  await su(boss, { befehl: 'zeit', stunde: 23 }); assert.ok(Math.abs(raum().state.uhr - 1380) < 5);

  // Zeitraffer: wird wie in der Verwaltung gespeichert (Verwaltung zeigt ihn, Räume übernehmen ihn); ungültige Werte → 1×
  await su(boss, { befehl: 'zeitraffer', faktor: 10 });
  assert.equal(SpielRaum.einstellungen.zeitraffer, 10);
  assert.equal((await (await verwaltung(null, 'GET')).json()).einstellungen.test.zeitraffer, 10, 'Verwaltung zeigt den Wert nicht');
  assert.equal(raum().zeitraffer(), 10);
  await su(boss, { befehl: 'zeitraffer', faktor: 7 });
  assert.equal(SpielRaum.einstellungen.zeitraffer, 1);

  // Sprung zur Bundeswehr
  const sp = raum().welt.stuetzpunkt; assert.ok(sp, 'Karte hat Lager');
  await su(boss, { befehl: 'bw' });
  assert.ok(imLager(sp, ich(boss).x, ich(boss).y), 'im Lager'); assert.equal(ich(boss).ebene, '');

  // Sprung zum Evakuierungspunkt (kein Fahrzeug: Tor)
  const tor = raum().welt.tor;
  await su(boss, { befehl: 'evak' });
  assert.ok(Math.hypot(ich(boss).x - (tor.x + 1) * 32, ich(boss).y - (tor.y + 1) * 32) < 200, 'am Tor');

  // Auffüllen
  const p = ich(boss); p.munition = 0; p.handgranaten = 0; p.hp = 10; p.durst = 5; p.hunger = 5; p.infektion = 50;
  await su(boss, { befehl: 'auffuellen' });
  assert.equal(p.munition, MUNITION_MAX); assert.ok(p.hp > 99); assert.ok(p.durst > 99); assert.ok(p.hunger > 99); assert.equal(p.infektion, 0);
  if (p.waffe && p.magmax) assert.equal(p.magazin, p.magmax);

  // Bots zu mir: tot/liegend/krank → heil, neben mir
  const bots = [...raum().extra.entries()].filter(([, x]) => x.bot).map(([sid]) => raum().state.spieler.get(sid));
  assert.ok(bots.length >= 1, 'Bots vorhanden');
  for (const b of bots) { b.hp = 0; b.unten = true; b.infektion = 30; b.hunger = 3; b.x = 40; b.y = 40; }
  await su(boss, { befehl: 'bots' });
  for (const b of bots) {
    assert.ok(b.hp > 99); assert.ok(!b.unten); assert.equal(b.infektion, 0); assert.ok(b.hunger > 99);
    assert.ok(Math.hypot(b.x - p.x, b.y - p.y) < 150, 'neben dem Superuser');
  }

  // Horde: ohne Horde → Meldung, kein Sprung; starten; hinspringen
  const vorher = { x: p.x, y: p.y };
  await su(boss, { befehl: 'horde_hin' });
  assert.deepEqual({ x: p.x, y: p.y }, vorher, 'keine Horde: kein Sprung');
  await su(boss, { befehl: 'horde', groesse: 50 });
  assert.ok(raum().welle.aktiv, 'Horde läuft'); assert.ok(raum().welle.aktiv.ids.size >= 20, 'Horde hat Zombies: ' + raum().welle.aktiv.ids.size);
  await su(boss, { befehl: 'horde_hin' });
  const m = raum().welle.aktiv.mitte;
  assert.ok(Math.hypot(p.x - m.x, p.y - m.y) < 700, 'vor der Horde: ' + Math.round(Math.hypot(p.x - m.x, p.y - m.y)));

  // Unsterblich nur für sich
  assert.ok(ex(boss).suUnsterblich, 'Superuser ist beim Einloggen unsterblich'); assert.ok(!ex(normal).suUnsterblich);
  p.hp = 20; await warte(200); assert.ok(p.hp > 99);
  await su(boss, { befehl: 'unsterblich' }); assert.ok(!ex(boss).suUnsterblich, 'abschaltbar');
  await su(boss, { befehl: 'unsterblich' }); assert.ok(ex(boss).suUnsterblich);
  await su(boss, { befehl: 'unsterblich' }); assert.ok(!ex(boss).suUnsterblich);

  // Lager fallen / aufbauen
  await su(boss, { befehl: 'lager', zustand: 'gefallen' }); assert.equal(raum().state.stuetzpunkt, 'gefallen');
  const zVorher = raum().state.zombies.size;
  await su(boss, { befehl: 'lager', zustand: 'steht' }); assert.equal(raum().state.stuetzpunkt, 'steht');
  assert.ok(raum().state.zombies.size < zVorher, 'Zombies des Falls weg');
  assert.ok(raum().stuetzpunkt.keinZeitFall);

  // Evakuierung rufen: Funkspruch erledigt, Fahrzeug kommt, übrige Aufgaben bleiben offen
  assert.ok(!raum().state.busDa);
  await su(boss, { befehl: 'evakrufen' });
  assert.ok(raum().state.busDa, 'Fahrzeug da'); assert.ok(raum().state.funk);
  assert.ok(raum().aufgaben.erledigtZahl() < raum().aufgaben.noetig(), 'übrige Aufgaben bleiben offen');

  // unbekannter Befehl und Datenmüll schaden nicht
  await su(boss, { befehl: 'rm -rf' }); await su(boss, null); await su(boss, 'x');
  assert.ok(raum().state.spieler.get(boss.sessionId));
});

test('Statusanzeige: Server schickt den Zustand der Umschalter (nur an Superuser) nach jedem Befehl und auf Anfrage', async () => {
  begrenzungZuruecksetzen();
  const boss = await beitreten('Gregor', TESTPW);
  const normal = await beitreten('Hias');
  let st = null, stNormal = null;
  boss.onMessage('suStatus', m => { st = m; });
  normal.onMessage('suStatus', m => { stNormal = m; });
  await su(boss, { befehl: 'status' });
  assert.ok(st, 'Status auf Anfrage');
  assert.equal(st.unsterblich, true); assert.equal(st.zeitraffer, 1);
  await su(boss, { befehl: 'unsterblich' });
  assert.equal(st.unsterblich, false); assert.equal(ex(boss).suUnsterblich, false);
  await su(boss, { befehl: 'unsterblich' });
  assert.equal(st.unsterblich, true);
  await su(boss, { befehl: 'unsterblich' });
  assert.equal(st.unsterblich, false);
  const nebelVorher = st.nebel;
  await su(boss, { befehl: 'nebel' });
  assert.equal(st.nebel, !nebelVorher);
  await su(boss, { befehl: 'nebel' });
  assert.equal(st.nebel, nebelVorher);
  await su(boss, { befehl: 'zeitraffer', faktor: 5 });
  assert.equal(st.zeitraffer, 5);
  await su(boss, { befehl: 'zeitraffer', faktor: 1 });
  assert.equal(st.zeitraffer, 1);
  const h0 = st.hordeanzeige;
  await su(boss, { befehl: 'hordeanzeige' });
  assert.equal(st.hordeanzeige, !h0);
  await su(normal, { befehl: 'status' }); await su(normal, { befehl: 'unsterblich' });
  assert.equal(stNormal, null, 'normaler Spieler bekommt keinen Status');
  await boss.leave(); await normal.leave();
});

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
import { KACHEL, MUNITION_MAX } from '../client/welt.mjs';
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


test('Leerzeichen am Ende des Passworts (Handy) stört nicht', async () => {
  await verwaltung({ superuserPasswort: TESTPW });
  begrenzungZuruecksetzen();
  const c = await beitreten('Gregor', TESTPW + ' ');
  assert.equal(ich(c).su, true);
});

test('Alle Aufgaben erledigt: Evakuierung kann gerufen werden und die Fahrt gelingt; Hierhin springen', async () => {
  begrenzungZuruecksetzen();
  const boss = await beitreten('Gregor2', TESTPW);
  assert.ok(ex(boss).superuser);
  const a = raum().aufgaben;
  assert.ok(!a.fahrtGelingt(), 'vorher offen');
  await su(boss, { befehl: 'alleaufgaben' });
  assert.ok(raum().state.funk);
  assert.ok(a.missionFertig());
  assert.ok([...raum().state.aufgaben.values()].every(q => q.erledigt));
  assert.ok(a.fahrtGelingt());
  await su(boss, { befehl: 'evakrufen' });
  assert.ok(raum().state.busDa);

  // Hierhin springen: auf den Ort (nächster freier Punkt), draußen
  const p = ich(boss); p.ebene = '';
  const ziel = { x: 20 * KACHEL, y: 20 * KACHEL };
  await su(boss, { befehl: 'hin', x: ziel.x, y: ziel.y });
  assert.ok(Math.hypot(p.x - ziel.x, p.y - ziel.y) < 11 * KACHEL, 'nahe am Ziel');
  assert.equal(p.ebene, '');
  const x1 = p.x; await su(boss, { befehl: 'hin', x: 'abc', y: null }); assert.equal(p.x, x1);
  const normal = await beitreten('Hias2');
  const x2 = ich(normal).x; await su(normal, { befehl: 'hin', x: ziel.x, y: ziel.y }); assert.equal(ich(normal).x, x2);
});

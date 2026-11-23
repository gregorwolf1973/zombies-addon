// Helden-Auswahl: aussehen-Kodierung (neue Kennbuchstaben, alte Spielstände gültig), Server-Prüfung (abgeschaltete Helden), Bots, /info, Verwaltung und Startwahl-Oberfläche
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { matchMaker } from '@colyseus/core';
import { Client } from '@colyseus/sdk';
import { starte } from '../server/index.mjs';
import { SpielRaum } from '../server/raum.mjs';
import { aussehenLesen, aussehenMigriert, aussehenText, aussehenGueltig, istHeld, AUSSEHEN_MUSTER } from '../client/figurbild.mjs';
import { EINSTELLUNG_MUSTER } from '../client/einstellungen_regeln.mjs';
import { HF_LISTE, HF_BUCHSTABEN, hfFigurenEinst } from '../client/heldenfiguren.mjs';
import { oeffentlich, vorgaben } from '../server/einstellungen.mjs';
import { freierPort } from './hilfe.mjs';

const PORT = await freierPort();
const URL_ = `http://127.0.0.1:${PORT}`;
let server;
before(async () => { server = await starte({ port: PORT, optionen: { karte: 'dorf' }, leise: true, datenbank: ':memory:' }); });
after(async () => { await server.gracefullyShutdown(false); });
const lies = p => fs.readFileSync(new URL(p, import.meta.url), 'utf8');

test('aussehen-Kodierung: alle Helden-Buchstaben gültig, alte Werte (h, f, m, w, s) bleiben gültig, Unsinn nicht', () => {
  for (const f of HF_LISTE) for (const w of [`${f.g},0,0`, `${f.g},5,7`]) { assert.ok(aussehenGueltig(w), w); assert.ok(AUSSEHEN_MUSTER.test(w)); assert.ok(EINSTELLUNG_MUSTER.zob_aussehen.test(w)); assert.equal(aussehenLesen(w).g, f.g); assert.equal(aussehenText(aussehenLesen(w)), w); assert.ok(istHeld(f.g)); }
  for (const alt of ['h,1,0', 'f,3,4', 'm,0,0', 'w,5,7', 's,0,0']) assert.ok(aussehenGueltig(alt), alt);
  for (const schlecht of ['x,0,0', 'h,6,0', 'h,0,8', 'hh,0,0', 'h,0', '', null, undefined, 'p,0,0', 'H,0,0']) assert.ok(!aussehenGueltig(schlecht), String(schlecht));
  assert.equal(aussehenMigriert('m,1,2'), 'h,1,2'); assert.equal(aussehenMigriert('w,1,2'), 'f,1,2');
  assert.equal(aussehenMigriert('r,1,2'), 'r,1,2', 'neue Helden bleiben unverändert');
  assert.deepEqual(aussehenLesen('kaputt'), { g: 'h', haar: 1, kleid: 0 });
  assert.ok(!istHeld('s') && !istHeld('m') && !istHeld('hf') && !istHeld(undefined));
  assert.equal(new Set(HF_BUCHSTABEN).size, HF_LISTE.length);
});

test('Server: gewählter neuer Held bleibt, abgeschalteter wird durch einen aktiven ersetzt (Haar/Kleidung bleiben), Survivor immer erlaubt', async () => {
  const alt = SpielRaum.einstellungen, c = [];
  try {
    const beitritt = async (name, aussehen) => { const k = await new Client(URL_).joinOrCreate('zombies', { name, aussehen, spielerId: (name + 'x'.repeat(32)).replace(/[^a-f0-9]/g, 'a').slice(0, 32).padEnd(32, 'b') }); c.push(k); return matchMaker.getLocalRoomById(k.roomId).state.spieler.get(k.sessionId).aussehen; };
    assert.equal(await beitritt('Rem', 'r,2,3'), 'r,2,3');
    assert.equal(await beitritt('Bru', 'b,0,0'), 'b,0,0');
    // nur Remy aktiv: Brute wird ersetzt
    SpielRaum.einstellungen = { ...alt, helden: { figuren: hfFigurenEinst(Object.fromEntries(HF_LISTE.map(f => [f.id, { an: f.id === 'remy' }]))) } };
    assert.equal(await beitritt('Bru2', 'b,4,5'), 'r,4,5');
    assert.equal(await beitritt('Sur', 's,1,1'), 's,1,1');
    // Rückfall auf die alten Heldenbilder: nur h/f, neue Helden werden zu h oder f
    SpielRaum.einstellungen = { ...alt, heldenFigurenNeu: false };
    const a = await beitritt('Ale', 'a,1,1'); assert.match(a, /^[hf],1,1$/);
    assert.equal(await beitritt('Jen', 'f,0,0'), 'f,0,0');
  } finally { SpielRaum.einstellungen = alt; for (const k of c) await k.leave().catch(() => {}); }
});

test('Bots und zufällige Aussehen: nur aktive Helden (oder Survivor)', async () => {
  const alt = SpielRaum.einstellungen;
  const k = await new Client(URL_).joinOrCreate('zombies', { name: 'Zufall' });
  const raum = matchMaker.getLocalRoomById(k.roomId);
  try {
    const gesehen = new Set(); for (let i = 0; i < 300; i++) { const a = raum.zufallsAussehen(); assert.ok(aussehenGueltig(a), a); gesehen.add(a[0]); }
    for (const g of HF_BUCHSTABEN) assert.ok(gesehen.has(g), 'alle aktiven Helden kommen vor: ' + g);
    assert.ok(gesehen.has('s'));
    SpielRaum.einstellungen = { ...alt, helden: { figuren: hfFigurenEinst(Object.fromEntries(HF_LISTE.map(f => [f.id, { an: f.id === 'brute' || f.id === 'jody' }]))) } };
    const g2 = new Set(); for (let i = 0; i < 200; i++) g2.add(raum.zufallsAussehen()[0]);
    assert.deepEqual([...g2].filter(g => g !== 's').sort(), ['b', 'j']);
    SpielRaum.einstellungen = { ...alt, heldenFigurenNeu: false };
    const g3 = new Set(); for (let i = 0; i < 100; i++) g3.add(raum.zufallsAussehen()[0]);
    assert.deepEqual([...g3].filter(g => g !== 's').sort(), ['f', 'h']);
  } finally { SpielRaum.einstellungen = alt; await k.leave().catch(() => {}); }
});

test('Schießstand nimmt die neuen Helden-Buchstaben an', async () => {
  const k = await new Client(URL_).create('schiessstand', { name: 'Ziel', aussehen: 't,0,0' });
  try { assert.equal(matchMaker.getLocalRoomById(k.roomId).state.spieler.get(k.sessionId).aussehen, 't,0,0'); } finally { await k.leave().catch(() => {}); }
});

test('Einstellung helden.figuren: für jeden Helden der Liste, Teiländerung je Held, mindestens einer an; /info nennt die aktiven', async () => {
  const o = oeffentlich(vorgaben());
  assert.deepEqual(Object.keys(o.helden.figuren), HF_LISTE.map(f => f.id));
  assert.ok(Object.values(o.helden.figuren).every(q => q.an === true));
  const info = await (await fetch(URL_ + '/info')).json();
  assert.equal(info.helden.neu, true);
  assert.deepEqual(info.helden.aktive, [...HF_BUCHSTABEN]);
});

test('Oberfläche: Startwahl mit Kacheln aus der Helden-Liste, Vorschaubild, Verwaltung mit Häkchenliste', () => {
  const html = lies('../client/index.html'), spiel = lies('../client/spiel.mjs'), vw = lies('../client/verwaltung.html');
  for (const id of ['heldenwahl', 'heldentafeln', 'heldenname', 'figurvorschau']) assert.ok(html.includes(`id="${id}"`), id);
  assert.match(spiel, /heldenwahlEinrichten\(i\.helden\)/);
  assert.match(spiel, /grafik\/helden_vorschau\.webp/);
  assert.match(spiel, /HF_LISTE/);
  for (const id of ['hfBlock', 'hfListe']) assert.ok(vw.includes(`id="${id}"`), id);
  assert.match(vw, /import\('\.\/heldenfiguren\.mjs'\)/);
  assert.match(vw, /helden: \{ figuren: t \}/);
  assert.ok(fs.statSync(new URL('../client/grafik/helden_vorschau.webp', import.meta.url)).size > 5000);
});

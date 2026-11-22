// Sprache über den Server (Ausweichweg): Server-Weiterleitung der Binärpakete
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { matchMaker } from '@colyseus/core';
import { Client } from '@colyseus/sdk';
import { starte } from '../server/index.mjs';
import { SpielRaum } from '../server/raum.mjs';
import { paketBauen, paketLesen, FORMAT_MULAW, FORMAT_OPUS } from '../client/sprache_kodierung.mjs';
import { freierPort } from './hilfe.mjs';

const PORT = await freierPort();
const URL_ = `http://127.0.0.1:${PORT}`;
let server;
const warte = ms => new Promise(r => setTimeout(r, ms));
async function bis(bedingung, ms = 3000) {
  const ende = Date.now() + ms;
  while (Date.now() < ende) { if (bedingung()) return true; await warte(20); }
  return bedingung();
}
function lausche(c) {
  const s = { daten: [], weg: [], format: [] };
  c.onMessage('sprachDaten', b => s.daten.push(Uint8Array.from(b)));
  c.onMessage('sprachWeg', m => s.weg.push(m));
  c.onMessage('sprachFormat', m => s.format.push(m));
  return s;
}
const nutz = n => Uint8Array.from({ length: n }, (_, i) => i & 255);
const stelle = (raum, c, x, y) => { const p = raum.state.spieler.get(c.sessionId); p.x = x; p.y = y; p.ebene = ''; };

before(async () => { server = await starte({ port: PORT, optionen: { karte: 'dorf' }, leise: true, datenbank: ':memory:' }); });
after(async () => { await server.gracefullyShutdown(false); });

test('Sprache über Server: Weiterleitung nach Paar, Entfernung, Größe, Rate, Bots', async () => {
  SpielRaum.einstellungen = { ...SpielRaum.einstellungen, bots: 3 };
  const a = await new Client(URL_).joinOrCreate('zombies', { name: 'Sepp' });
  const b = await new Client(URL_).joinOrCreate('zombies', { name: 'Vroni' });
  const c = await new Client(URL_).joinOrCreate('zombies', { name: 'Hias' });
  const sa = lausche(a), sb = lausche(b), sc = lausche(c);
  try {
    const raum = matchMaker.getLocalRoomById(a.roomId);
    raum.botsAnpassen();
    for (const k of [a, b, c]) k.send('sprachBereit');
    await warte(100);
    stelle(raum, a, 3000, 3000); stelle(raum, b, 3040, 3000); stelle(raum, c, 3040, 3040);

    // Bots und Unbekannte kommen nicht in ein Server-Paar
    const botId = [...raum.extra.entries()].find(([, x]) => x.bot)[0];
    a.send('sprachWeg', { mit: botId, server: true });
    a.send('sprachWeg', { mit: 'gibtsnicht', server: true });
    a.send('sprachWeg', { mit: a.sessionId, server: true });
    await warte(150);
    assert.equal(raum.extra.get(a.sessionId).serverPartner?.size ?? 0, 0);

    // Paar A–B auf Server-Weg: beide erfahren es (mit Absender-Nr.), Format μ-law solange keiner Opus meldet
    a.send('sprachWeg', { mit: b.sessionId, server: true });
    assert.ok(await bis(() => sa.weg.length === 1 && sb.weg.length === 1), 'sprachWeg fehlt');
    assert.equal(sa.weg[0].mit, b.sessionId); assert.equal(sb.weg[0].mit, a.sessionId);
    const nrA = sb.weg[0].nr;
    assert.ok(Number.isInteger(nrA) && nrA > 0 && nrA < 256);
    assert.equal(sc.weg.length, 0);
    assert.ok(await bis(() => sa.format.at(-1)?.format === 1 && sb.format.at(-1)?.format === 1), 'Format μ-law');

    // Opus nur, wenn alle Beteiligten es können
    a.send('sprachKann', { opus: true });
    await warte(150);
    assert.equal(sa.format.at(-1).format, 1);
    b.send('sprachKann', { opus: true });
    assert.ok(await bis(() => sa.format.at(-1).format === 0 && sb.format.at(-1).format === 0), 'Format Opus');
    c.send('sprachKann', { opus: false });
    await warte(100);
    assert.equal(sa.format.at(-1).format, 0, 'C ist kein Partner');

    // Paket A → B kommt an, mit Absender-Nr. vorn; C (kein Server-Paar) nichts; Absender nichts
    const paket = paketBauen(FORMAT_OPUS, 513, nutz(40));
    a.sendBytes('sprachDaten', paket);
    assert.ok(await bis(() => sb.daten.length === 1), 'Paket kam nicht an');
    assert.equal(sb.daten[0][0], nrA);
    assert.deepEqual([...sb.daten[0].subarray(1)], [...paket]);
    const gelesen = paketLesen(sb.daten[0], 1);
    assert.equal(gelesen.format, FORMAT_OPUS); assert.equal(gelesen.nr, 513);
    await warte(150);
    assert.equal(sc.daten.length, 0); assert.equal(sa.daten.length, 0);

    // zu weit weg: nichts
    stelle(raum, b, 3000 + 8 * 200, 3000);   // 200 m
    await warte(50);
    a.sendBytes('sprachDaten', paket);
    await warte(200);
    assert.equal(sb.daten.length, 1, 'zu große Entfernung');
    // mit Funkgeräten bei beiden trotzdem
    raum.state.spieler.get(a.sessionId).rucksack.push('funkgeraet');
    raum.state.spieler.get(b.sessionId).rucksack.push('funkgeraet');
    a.sendBytes('sprachDaten', paket);
    assert.ok(await bis(() => sb.daten.length === 2), 'Funk');
    raum.state.spieler.get(a.sessionId).rucksack.clear();
    raum.state.spieler.get(b.sessionId).rucksack.clear();
    stelle(raum, b, 3040, 3000);

    // Größenbegrenzung: > 2 kB fällt weg, 2 kB geht
    const vorher = sb.daten.length;
    a.sendBytes('sprachDaten', nutz(2049));
    await warte(150);
    assert.equal(sb.daten.length, vorher, 'zu großes Paket');
    a.sendBytes('sprachDaten', Uint8Array.from([FORMAT_MULAW, 0, 1, ...nutz(2040)]));
    assert.ok(await bis(() => sb.daten.length === vorher + 1), '2-kB-Paket');
    // unbekanntes Format wird verworfen
    a.sendBytes('sprachDaten', Uint8Array.from([7, 0, 1, 1, 2]));
    await warte(150);
    assert.equal(sb.daten.length, vorher + 1);

    // Ratenbegrenzung: 300 Pakete auf einmal → höchstens Eimer (30) plus Nachfüllung
    await warte(700);   // Eimer füllen
    const v2 = sb.daten.length;
    for (let i = 0; i < 300; i++) a.sendBytes('sprachDaten', paketBauen(FORMAT_MULAW, i, nutz(10)));
    await warte(600);
    const bekommen = sb.daten.length - v2;
    assert.ok(bekommen >= 20 && bekommen <= 80, 'Rate: ' + bekommen);

    // Sprache aus: nichts mehr
    SpielRaum.einstellungen = { ...SpielRaum.einstellungen, sprache: { an: false } };
    raum.einstellungenGeaendert();
    await warte(800);
    const v3 = sb.daten.length;
    a.sendBytes('sprachDaten', paket);
    await warte(200);
    assert.equal(sb.daten.length, v3);
    SpielRaum.einstellungen = { ...SpielRaum.einstellungen, sprache: undefined };
    raum.einstellungenGeaendert();

    // erneuter Beitritt (sprachBereit) von B löst das Paar, A erfährt es
    b.send('sprachBereit');
    assert.ok(await bis(() => sa.weg.at(-1)?.server === false && sa.weg.at(-1).mit === b.sessionId), 'Paar nicht gelöst');
    assert.equal(raum.extra.get(a.sessionId).serverPartner.size, 0);
  } finally { await a.leave(); await b.leave(); await c.leave(); SpielRaum.einstellungen = { ...SpielRaum.einstellungen, bots: 0, sprache: undefined }; }
});

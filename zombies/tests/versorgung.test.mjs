// Bundeswehr-Versorgung über die Munitionskisten (server/versorgung.mjs), Funk-Ansage, Faust-Feld
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { matchMaker } from '@colyseus/core';
import { Client } from '@colyseus/sdk';
import { starte } from '../server/index.mjs';
import { SpielRaum } from '../server/raum.mjs';
import { Versorgung, VERSORGUNG_WAFFEN } from '../server/versorgung.mjs';
import { bereinige, EREIGNISSE, TON_STANDARD } from '../server/einstellungen.mjs';
import { setzeKartengroesse, HANDEL, WAFFEN } from '../client/welt.mjs';
import { flach } from '../client/stapel.mjs';
import { freierPort, altesTempo } from './hilfe.mjs';
altesTempo(SpielRaum);

const PORT = await freierPort();
const URL_ = `http://127.0.0.1:${PORT}`;
let server;
const warte = ms => new Promise(r => setTimeout(r, ms));
async function bis(bedingung, ms = 3000) {
  const ende = Date.now() + ms;
  while (Date.now() < ende) { if (bedingung()) return true; await warte(20); }
  return bedingung();
}
const neueId = () => crypto.randomBytes(16).toString('hex');
before(async () => { server = await starte({ port: PORT, optionen: { karte: 'geretsried' }, leise: true, datenbank: ':memory:' }); });
after(async () => { await server.gracefullyShutdown(false); setzeKartengroesse(64, 48); });

async function beitreten(name = 'Sepp', spielerId = neueId()) {
  const c = await new Client(URL_).joinOrCreate('zombies', { name, spielerId, seed: 7 });
  const raum = matchMaker.getLocalRoomById(c.roomId);
  raum.zombieFaktor = 0; raum.state.zombies.clear(); raum.zombieInfo.clear();
  raum.welle.schritt = () => {};
  const p = raum.state.spieler.get(c.sessionId);
  p.waffe = ''; p.munition = 0; p.magazin = 0; p.rucksack.splice(0, p.rucksack.length);
  raum.extra.get(c.sessionId).pause = 1e6;
  return { c, raum, p, spielerId };
}
async function frisch() {
  if (!await bis(() => !SpielRaum.aktiv, 3000)) {
    const alt = SpielRaum.aktiv;
    try { for (const k of [...(alt?.clients ?? [])]) k.leave?.(); await alt?.disconnect?.(); } catch { /* egal */ }
    assert.ok(await bis(() => !SpielRaum.aktiv, 5000), 'alter Raum lebt noch');
  }
  SpielRaum.speicher.loescheWelt();
}
async function beenden(...clients) { for (const c of clients) await c.leave(); await bis(() => !SpielRaum.aktiv, 3000); }
// ein Durchsuchen der ersten Munitionskiste, wie es der Server bei „aktion“ aufruft
function kisteDurchsuchen(raum, c, p) {
  const b = raum.welt.behaelter.find(q => q.art === 'bw_kiste');
  const antwort = [];
  raum.durchsucht({ sessionId: c.sessionId, send: (typ, m) => antwort.push([typ, m]) }, p, b);
  return { b, antwort };
}

test('Einstellungen: Versorgung unter bundeswehr mit Vorgaben und Grenzen; Munitionstausch beim Soldaten nur noch 30', () => {
  const b = bereinige({}).bundeswehr;
  assert.deepEqual([b.versorgungTage, b.versorgungMunition, b.versorgungVerband, b.versorgungSpritze, b.versorgungWaffe], [2, 50, 3, 1, true]);
  const k = bereinige({ bundeswehr: { versorgungTage: 0, versorgungMunition: 99999, versorgungWaffe: 'ja' } }).bundeswehr;
  assert.equal(k.versorgungTage, 1); assert.equal(k.versorgungMunition, 500); assert.equal(k.versorgungWaffe, true);
  assert.equal(bereinige({ bundeswehr: { versorgungWaffe: false } }).bundeswehr.versorgungWaffe, false);
  assert.equal(HANDEL.soldat.angebote.find(a => a.id === 'munition').menge, 30);
  for (const w of VERSORGUNG_WAFFEN) assert.ok(WAFFEN[w]?.fern, w + ' ist eine Feuerwaffe');
  assert.ok(!VERSORGUNG_WAFFEN.some(w => ['mg', 'scharfschuetze', 'granatwerfer', 'mp'].includes(w)));
});

test('Versorgung: neuer Spieler holt sofort sein Paket, danach alle 2 Spieltage ein neues – Bots nicht', async () => {
  await frisch();
  const { c, raum, p, spielerId } = await beitreten('Versorgt');
  const v = raum.versorgung;
  assert.ok(v.bereit(spielerId), 'Erstpaket fehlt');
  const { antwort } = kisteDurchsuchen(raum, c, p);
  assert.equal(p.munition, 50);
  const dinge = [p.waffe, ...flach(p.rucksack)];
  assert.ok(VERSORGUNG_WAFFEN.includes(p.waffe), 'Waffe: ' + p.waffe);
  assert.equal(dinge.filter(d => d === 'verband').length, 3);
  assert.equal(dinge.filter(d => d === 'spritze').length, 1);
  assert.equal(antwort.at(-1)[0], 'gefunden');
  assert.equal(v.bereit(spielerId), false);
  // zweites Durchsuchen: nichts mehr
  p.munition = 0;
  const z = kisteDurchsuchen(raum, c, p);
  assert.equal(p.munition, 0); assert.equal(z.antwort.at(-1)[1].rest, 0);
  // Tag 2: noch nicht fällig; Tag 3: fällig; Tag 4: nicht; Tag 5: fällig
  const meldungen = []; const alt = raum.broadcast.bind(raum);
  raum.broadcast = (typ, m) => { meldungen.push(typ); return alt(typ, m); };
  raum.state.tag = 2; assert.equal(v.tagWechsel(), false); assert.equal(v.bereit(spielerId), false);
  raum.state.tag = 3; assert.equal(v.tagWechsel(), true); assert.equal(v.bereit(spielerId), true);
  assert.ok(meldungen.includes('meldung') && meldungen.includes('versorgung'), 'Meldung an die Spieler fehlt');
  raum.state.tag = 4; assert.equal(v.tagWechsel(), false);
  raum.state.tag = 5; assert.equal(v.tagWechsel(), true);
  assert.equal(v.offen.get(spielerId), 2, 'ungeholte Pakete summieren sich');
  assert.ok(!raum.versorgung.offen.has('bot'), 'kein Bot-Eintrag');
  // Abstand per Einstellung
  const e = SpielRaum.einstellungen, eAlt = e.bundeswehr;
  try {
    e.bundeswehr = { versorgungTage: 1, versorgungMunition: 20, versorgungVerband: 0, versorgungSpritze: 0, versorgungWaffe: false };
    raum.state.tag = 6; assert.equal(v.tagWechsel(), true);
    p.munition = 0; p.rucksack.splice(0, p.rucksack.length); v.offen.set(spielerId, 1);
    kisteDurchsuchen(raum, c, p);
    assert.equal(p.munition, 20);
  } finally { e.bundeswehr = eAlt; }
  await beenden(c);
});

test('Versorgung: Stand überlebt den Neustart (nichts doppelt), gefallene Bundeswehr liefert nichts mehr', async () => {
  await frisch();
  const id = neueId();
  let { c, raum, p } = await beitreten('Neustart', id);
  kisteDurchsuchen(raum, c, p);
  raum.state.tag = 3; raum.versorgung.tagWechsel();
  kisteDurchsuchen(raum, c, p);   // Paket vom Tag 3 geholt, Kiste leer
  assert.equal(raum.versorgung.bereit(id), false);
  raum.speichereWelt();
  const stand = SpielRaum.speicher.ladeWelt();
  assert.equal(stand.versorgung.tag, 3);
  assert.equal(stand.versorgung.offen[id], 0);
  await beenden(c);
  ({ c, raum, p } = await beitreten('Neustart', id));
  assert.equal(raum.versorgung.letzterTag, 3);
  assert.equal(raum.versorgung.bereit(id), false, 'nach Neustart wieder ein Paket');
  // gefallen: keine neue Versorgung
  raum.state.stuetzpunkt = 'gefallen';
  raum.state.tag = 9; assert.equal(raum.versorgung.tagWechsel(), false);
  assert.equal(raum.versorgung.bereit(id), false);
  // Rohe Klasse: ein unbekannter Stand wird ignoriert
  const v = new Versorgung(raum); v.start({ versorgung: { tag: 'x', offen: { a: -4, b: 99, c: 'z' } } }, true);
  assert.equal(v.letzterTag, null); assert.deepEqual([...v.offen], [['b', 3]]);
  await beenden(c);
});

test('Funk-Ansage: Ereignis registriert, vorbelegt mit funk_abholung.mp3, Server sendet funkAnsage an alle nach dem Funkspruch', async () => {
  assert.ok(EREIGNISSE.some(e => e.id === 'funkAnsage' && e.gruppe === 'bundeswehr'));
  assert.deepEqual(TON_STANDARD.funkAnsage.dateien, ['funk_abholung.mp3']);
  await frisch();
  const a = await beitreten('Funker'), b = await beitreten('Zuhörer');
  const erhalten = { a: 0, b: 0 }, texte = [];
  a.c.onMessage('funkAnsage', () => erhalten.a++); b.c.onMessage('funkAnsage', () => erhalten.b++);
  a.c.onMessage('meldung', m => texte.push(m.text));
  try {
    a.raum.aufgaben.funkAbsetzen(a.p, a.raum.welt.safeRooms[0]);
    assert.ok(await bis(() => erhalten.a === 1 && erhalten.b === 1), 'funkAnsage nicht bei allen');
    assert.ok(texte.some(t => /Funkspruch abgesetzt/.test(t) && /\d:\d\d|\d\d:\d\d/.test(t)), 'Textmeldung mit Uhrzeit bleibt');
    a.raum.aufgaben.funkAbsetzen(a.p, a.raum.welt.safeRooms[0]);   // zweiter Versuch: kein zweites Mal
    await warte(150);
    assert.equal(erhalten.a, 1);
  } finally { await beenden(a.c, b.c); }
});

test('Client: Faust-Feld ersetzt die Textzeile „Waffe“; Antippen sendet faust, Anzeige hängt an ich.faust', () => {
  const js = fs.readFileSync(new URL('../client/spiel.mjs', import.meta.url), 'utf8');
  assert.ok(/fb\.id = 'faustfeld'/.test(js) && /raum\.send\('faust'\)/.test(js));
  assert.ok(/fb\.className = 'faust' \+ \(ich\.faust \? ' aktiv' : ''\)/.test(js));
  assert.ok(/fb\.addEventListener\('pointerdown', e => e\.stopPropagation\(\)\)/.test(js));
  assert.ok(!/Unbewaffnet – stoßen/.test(js), 'alte dritte Waffenanzeige noch da');
  assert.ok(/raum\.onMessage\('funkAnsage', \(\) => \{ ton\.ereignis\('funkAnsage'\)/.test(js));
  assert.ok(/id="granatenfeld"/.test(fs.readFileSync(new URL('../client/index.html', import.meta.url), 'utf8')), 'Granatenfeld bleibt');
});

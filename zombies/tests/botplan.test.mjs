// Team-Planer der Bots (server/botplan.mjs): Rollen, Sammeln, Funkspruch, Chat-Befehle, Bus, Kiste
import { zaehle } from '../client/stapel.mjs';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { matchMaker } from '@colyseus/core';
import { Client } from '@colyseus/sdk';
import { starte } from '../server/index.mjs';
import { SpielRaum } from '../server/raum.mjs';
import { BOT_NAMEN } from '../server/bots.mjs';
import { BUS_ABSTAND } from '../client/welt.mjs';

const PORT = 27700 + Math.floor(Math.random() * 200);
const URL_ = `http://127.0.0.1:${PORT}`;
const ordner = fs.mkdtempSync(path.join(os.tmpdir(), 'zombies-botplan-'));
const DB = path.join(ordner, 'spiel.db');
let server;
const warte = ms => new Promise(r => setTimeout(r, ms));
async function bis(bedingung, ms = 3000) {
  const ende = Date.now() + ms;
  while (Date.now() < ende) { if (bedingung()) return true; await warte(20); }
  return bedingung();
}
const neueId = () => crypto.randomBytes(16).toString('hex');

before(async () => { server = await starte({ port: PORT, optionen: { karte: 'dorf' }, leise: true, datenbank: DB }); });
after(async () => { await server.gracefullyShutdown(false); fs.rmSync(ordner, { recursive: true, force: true }); });

async function beitreten(name, spielerId = neueId()) {
  const c = await new Client(URL_).joinOrCreate('zombies', { name, spielerId });
  const raum = matchMaker.getLocalRoomById(c.roomId);
  raum.zombieFaktor = 0; raum.state.zombies.clear(); raum.zombieInfo.clear();
  return { c, raum, p: raum.state.spieler.get(c.sessionId), spielerId };
}
async function frisch() {
  assert.ok(await bis(() => !SpielRaum.aktiv, 3000), 'alter Raum lebt noch');
  SpielRaum.speicher.loescheWelt();
}
async function beenden(...clients) {
  for (const c of clients) await c.leave();
  SpielRaum.einstellungen = { ...SpielRaum.einstellungen, bots: 0 };
  await bis(() => !SpielRaum.aktiv, 3000);
}
function setzeAufgaben(raum, ids) {
  raum.state.aufgaben.clear();
  for (const id of ids) raum.aufgaben.neu(id, false);
  raum.aufgaben.aktualisieren(false);
}
// Welt mit n Bots und einem Menschen; Tageszeit vorgeben
async function aufbau(nBots, uhr = 11 * 60) {
  SpielRaum.einstellungen = { ...SpielRaum.einstellungen, bots: nBots };
  await frisch();
  const m = await beitreten('Mensch');
  m.raum.state.uhr = uhr;
  m.bots = [...m.raum.extra.entries()].filter(([, x]) => x.bot).map(([sid]) => [sid, m.raum.state.spieler.get(sid), m.raum.extra.get(sid)]);
  assert.equal(m.bots.length, nBots);
  return m;
}
// Figur in den Innenraum eines Safe Rooms setzen
function hinein(raum, p, s, n = 0) {
  const w = raum.wv(s.ebene), pos = raum.freierPlatz(w.start, n, s.ebene);
  p.ebene = s.ebene; p.x = pos.x; p.y = pos.y;
  return w;
}
const rolle = b => b[2].bot.plan?.rolle;

test('Rollen: je Mensch ein Begleiter, der Rest sammelt; bei Nacht kehren alle um', async () => {
  const { c, raum, p, bots } = await aufbau(3);
  try {
    const s = raum.welt.safeRooms[0];
    hinein(raum, p, s);
    bots.forEach(([, bp], i) => hinein(raum, bp, s, i + 1));
    assert.ok(await bis(() => bots.every(b => rolle(b)), 4000), 'keine Rollen verteilt');
    assert.equal(bots.filter(b => rolle(b) === 'begleiter').length, 1);
    assert.equal(bots.filter(b => rolle(b) === 'sammler').length, 2);
    // Nacht: alle Begleiter
    raum.state.uhr = 23 * 60;
    assert.ok(await bis(() => bots.every(b => rolle(b) === 'begleiter'), 5000), 'Sammler kehren nachts nicht um');
  } finally { await beenden(c); }
});

test('Einzelner Bot: draußen Begleiter, bei Tag im Haus darf er sammeln', async () => {
  const { c, raum, p, bots } = await aufbau(1);
  try {
    assert.equal(p.ebene, '');
    assert.ok(await bis(() => rolle(bots[0]), 4000));
    assert.equal(rolle(bots[0]), 'begleiter');
    hinein(raum, p, raum.welt.safeRooms[0]);
    assert.ok(await bis(() => rolle(bots[0]) === 'sammler', 5000), 'darf nicht sammeln, obwohl der Mensch im Safe Room ist');
  } finally { await beenden(c); }
});

test('Begleiter bleibt beim Menschen, auch wenn der Sammler losgeht', async () => {
  const { c, raum, p, bots } = await aufbau(2);
  try {
    const s = raum.welt.safeRooms[0];
    hinein(raum, p, s);
    bots.forEach(([, bp], i) => hinein(raum, bp, s, i + 1));
    assert.ok(await bis(() => bots.every(b => rolle(b)), 4000));
    const begl = bots.find(b => rolle(b) === 'begleiter');
    await warte(8000);
    assert.equal(begl[1].ebene, p.ebene, 'Begleiter hat den Safe Room verlassen');
    assert.ok(Math.hypot(begl[1].x - p.x, begl[1].y - p.y) < 200, 'Begleiter ist zu weit weg');
  } finally { await beenden(c); }
});

test('Sammler holt Wasser aus einem Behälter und legt es in die Safe-Room-Kiste (Vorräte-Fortschritt steigt)', async () => {
  const { c, raum, p, bots } = await aufbau(2);
  try {
    setzeAufgaben(raum, ['vorraete', 'medizin', 'tor']);
    const s = raum.welt.safeRooms[0], w = hinein(raum, p, s);
    bots.forEach(([, bp], i) => hinein(raum, bp, s, i + 1));
    const kiste = raum.state.safes.get(s.id).kiste;
    for (let i = 0; i < 5; i++) kiste.push('essen');   // Essen ist genug da, es fehlt Wasser
    // genau ein Behälter im Raum enthält Wasser
    for (const bh of w.behaelter) raum.setzeInhalt(bh.id, []);
    raum.setzeInhalt(w.behaelter[0].id, ['wasser', 'wasser']);
    raum.aufgaben.aktualisieren(false);
    const vorher = raum.state.aufgaben.get('vorraete').fortschritt;
    const wasser = () => zaehle(kiste, 'wasser');
    assert.ok(await bis(() => wasser() >= 2, 45000), `kein Wasser in der Kiste (Rollen ${bots.map(rolle)}, Aufträge ${bots.map(b => JSON.stringify(b[2].bot.plan?.auftrag?.art + ':' + b[2].bot.plan?.auftrag?.was))})`);
    assert.ok(await bis(() => raum.state.aufgaben.get('vorraete').fortschritt > vorher, 3000), 'Fortschritt steigt nicht');
    assert.equal(raum.state.behaelter.get(w.behaelter[0].id).rest, 0);
  } finally { await beenden(c); }
});

test('Sammler setzt den Funkspruch ab, wenn ihn niemand hat – und meldet es im Chat', async () => {
  const { c, raum, p, bots } = await aufbau(2);
  try {
    setzeAufgaben(raum, ['funk', 'vorraete']);
    const s = raum.welt.safeRooms.find(q => raum.wv(q.ebene).moebel?.some(m => m.art === 'funktisch'));
    assert.ok(s, 'kein Safe Room mit Funktisch');
    hinein(raum, p, s);
    bots.forEach(([, bp], i) => hinein(raum, bp, s, i + 1));
    const chat = [];
    c.onMessage('chat', m => chat.push(m));
    assert.equal(raum.state.funk, false);
    assert.ok(await bis(() => raum.state.funk === true, 45000), `Funkspruch nicht abgesetzt (Aufträge ${bots.map(b => b[2].bot.plan?.auftrag?.art)})`);
    assert.ok(raum.state.aufgaben.get('funk').erledigt);
    assert.ok(await bis(() => chat.some(m => /Funkspruch ist raus/.test(m.text) && /🤖/.test(m.name)), 3000), 'keine Chat-Meldung: ' + JSON.stringify(chat.map(m => m.text)));
  } finally { await beenden(c); }
});

test('Chat-Befehle: „Resi, hol wasser“ ändert den Auftrag und wird bestätigt; bleib hier, frei', async () => {
  const { c, raum, p, bots } = await aufbau(2);
  try {
    const s = raum.welt.safeRooms[0];
    hinein(raum, p, s);
    bots.forEach(([, bp], i) => hinein(raum, bp, s, i + 1));
    const resi = bots.find(b => b[1].name === BOT_NAMEN[0] + ' 🤖'), vroni = bots.find(b => b[1].name === BOT_NAMEN[1] + ' 🤖');
    assert.ok(resi && vroni);
    const chat = [];
    c.onMessage('chat', m => chat.push(m));
    c.send('chat', { text: `${BOT_NAMEN[0]}, hol wasser` });
    assert.ok(await bis(() => resi[2].bot.plan?.auftrag?.art === 'holen' && resi[2].bot.plan.auftrag.was === 'wasser', 3000), 'Auftrag nicht geändert');
    assert.ok(await bis(() => chat.some(m => m.name === resi[1].name && /Wasser/.test(m.text)), 3000), 'keine Bestätigung: ' + JSON.stringify(chat.map(m => m.name + ': ' + m.text)));
    assert.equal(vroni[2].bot.befehl, undefined, 'falscher Bot angesprochen');
    c.send('chat', { text: `${BOT_NAMEN[1].toUpperCase()} bleib hier` });
    assert.ok(await bis(() => vroni[2].bot.plan?.auftrag?.art === 'wache', 3000));
    c.send('chat', { text: `${BOT_NAMEN[1]}, frei` });
    assert.ok(await bis(() => !vroni[2].bot.befehl && vroni[2].bot.plan.auftrag?.art !== 'wache', 3000));
    c.send('chat', { text: 'folgt mir' });
    assert.ok(await bis(() => bots.every(b => b[2].bot.befehl?.art === 'komm'), 3000));
    assert.ok(await bis(() => bots.every(b => rolle(b) === 'begleiter'), 5000));
  } finally { await beenden(c); }
});

test('Bots gehen zum Bus, sobald er da ist, und bleiben dort', async () => {
  const { c, raum, p, bots } = await aufbau(2);
  try {
    setzeAufgaben(raum, ['funk', 'tor', 'zombies', 'lampen']);
    raum.state.funk = true;
    raum.state.uhr = 18 * 60 + 0.1;
    const busVon = () => [...raum.state.fahrzeuge.entries()].find(([, f]) => f.art === 'evakuierung');
    assert.ok(await bis(() => busVon(), 5000), 'kein Bus erschienen');
    const [, bus] = busVon();
    bots.forEach(([, bp], i) => { const pos = raum.freierPlatz({ x: bus.x + 400, y: bus.y + i * 40 }, 0, ''); bp.ebene = ''; bp.x = pos.x; bp.y = pos.y; });
    const da = () => bots.every(([, bp]) => Math.hypot(bp.x - bus.x, bp.y - bus.y) < BUS_ABSTAND);
    assert.ok(await bis(da, 40000), 'Bots stehen nicht am Bus: ' + bots.map(([, bp]) => Math.round(Math.hypot(bp.x - bus.x, bp.y - bus.y))));
    assert.ok(await bis(() => raum.state.busBord >= 2, 3000));
    await warte(2000);
    assert.ok(da(), 'Bots sind wieder weggegangen');
  } finally { await beenden(c); }
});

test('Bots nehmen Aufgaben-Vorräte nicht aus der Kiste, Überschuss nur bei Bedarf', async () => {
  const { c, raum, p, bots } = await aufbau(1, 23 * 60);   // Nacht: der Bot bleibt Begleiter und im Safe Room
  try {
    setzeAufgaben(raum, ['vorraete', 'medizin', 'tor']);
    const s = raum.welt.safeRooms[0], w = hinein(raum, p, s), bot = bots[0][1];
    hinein(raum, bot, s, 1);
    bot.x = w.kiste.x; bot.y = w.kiste.y + 12;
    bot.rucksack.clear(); bot.rucksack.push('wasser');
    const kiste = raum.state.safes.get(s.id).kiste;
    const n = raum.state.spieler.size;   // Mensch + Bot → je 4 Wasser und Essen für die Aufgabe
    for (let i = 0; i < 2 + n; i++) { kiste.push('wasser'); kiste.push('essen'); }
    const wasser = () => zaehle(kiste, 'wasser');
    await warte(4000);
    assert.equal(wasser(), 2 + n, 'Bot hat Aufgaben-Wasser herausgenommen');
    // (sein Rucksack kann trotzdem wachsen: im Safe Room stehen durchsuchbare Vorratsregale)
    kiste.push('wasser');   // ein Stück zu viel: nicht durstig → er lässt es trotzdem liegen (nimmt nur, was er dringend braucht)
    await warte(2500);
    assert.equal(wasser(), 3 + n, 'nicht durstiger Bot nimmt Wasser aus der Kiste');
    bot.rucksack.clear(); bot.durst = 20;   // durstig und ohne eigenes Wasser: den Überschuss darf er nehmen, die Aufgaben-Vorräte nicht
    assert.ok(await bis(() => wasser() === 2 + n, 12000), 'Überschuss wird trotz Durst nicht genommen: ' + JSON.stringify({ durst: Math.round(bot.durst), rs: [...bot.rucksack], ebene: bot.ebene, x: Math.round(bot.x), y: Math.round(bot.y), kiste: w.kiste, aktion: bot.aktion, auftrag: bots[0][2].bot.plan?.auftrag?.art, befehl: bots[0][2].bot.befehl?.art, k: [...kiste] }));
    await warte(1500);
    assert.ok(wasser() >= 2 + n, 'Bot hat Aufgaben-Wasser herausgenommen');
  } finally { await beenden(c); }
});

test('Leistung: 4 Bots, Planer und Ausführung bleiben billig', async () => {
  const { c, raum, p, bots } = await aufbau(4);
  try {
    setzeAufgaben(raum, ['funk', 'vorraete', 'medizin', 'lampen']);
    await warte(12000);
    const st = raum.botplan?.stat;
    assert.ok(st && st.n > 0, 'Planer lief nie');
    const mittel = st.summe / st.n;
    console.log(`botplan: ${st.n} Aufrufe, Mittel ${mittel.toFixed(3)} ms, Spitze ${st.max.toFixed(1)} ms; Takt gesamt: ${JSON.stringify(raum.leistung?.teile?.takt ?? null)}; Rollen ${bots.map(b => rolle(b) + ':' + (b[2].bot.plan?.auftrag?.art ?? '-'))}`);
    assert.ok(mittel < 15, `zu langsam: ${mittel} ms`);
    assert.equal(bots.filter(b => rolle(b) === 'begleiter').length, 1);
  } finally { await beenden(c); }
});

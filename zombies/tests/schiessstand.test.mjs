// Schießstand / Tutorial: eigener Raum je Spieler, unsterblich, Zombie-Start, Auswertung, Hauptwelt bleibt unberührt
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { matchMaker } from '@colyseus/core';
import { Client } from '@colyseus/sdk';
import { starte } from '../server/index.mjs';
import { SpielRaum } from '../server/raum.mjs';
import { SS_START } from '../client/schiessstand_welt.mjs';
import { WAFFEN, MUNITION_MAX } from '../client/welt.mjs';

const PORT = 27170 + Math.floor(Math.random() * 200);
const URL_ = `http://127.0.0.1:${PORT}`;
let server;
const warte = ms => new Promise(r => setTimeout(r, ms));
async function bis(bedingung, ms = 4000) {
  const ende = Date.now() + ms;
  while (Date.now() < ende) { if (bedingung()) return true; await warte(20); }
  return bedingung();
}
before(async () => { server = await starte({ port: PORT, optionen: { karte: 'dorf' }, leise: true, datenbank: ':memory:' }); });
after(async () => { await server.gracefullyShutdown(false); });

const beitreten = async (name = 'Uebung') => {
  const c = await new Client(URL_).create('schiessstand', { name });
  const raum = matchMaker.getLocalRoomById(c.roomId);
  raum.kriecherChance = 0;
  return { c, raum, p: raum.state.spieler.get(c.sessionId), x: raum.extra.get(c.sessionId) };
};

test('Raum startet mit Spieler, Bundeswehr-Standort und Übungsplatz, Hauptwelt bleibt die aktive', async () => {
  const haupt = await new Client(URL_).joinOrCreate('zombies', { name: 'Haupt' });
  const hauptRaum = matchMaker.getLocalRoomById(haupt.roomId);
  const aktivVorher = SpielRaum.aktiv;
  assert.equal(aktivVorher, hauptRaum);
  const { c, raum, p } = await beitreten();
  try {
    assert.ok(p, 'Spieler fehlt');
    assert.equal(Math.round(p.x), SS_START.x); assert.equal(Math.round(p.y), SS_START.y);
    assert.equal(raum.state.stuetzpunkt, 'steht');
    assert.ok(raum.welt.stuetzpunkt.teile.some(t => t.art === 'puma'));
    assert.equal(raum.state.zombies.size, 0);
    assert.notEqual(raum.roomId, hauptRaum.roomId);
    // zweiter Spieler bekommt einen EIGENEN Raum
    const c2 = await new Client(URL_).create('schiessstand', { name: 'Zweiter' });
    assert.notEqual(c2.roomId, c.roomId);
    await c2.leave();
    // Hauptwelt: weiter derselbe Raum, nichts vom Schießstand gespeichert, keine Fremden im Spielerverzeichnis
    assert.equal(SpielRaum.aktiv, hauptRaum);
    assert.equal(hauptRaum.state.spieler.size, 1);
    assert.equal(hauptRaum.state.zombies.has('z1') && hauptRaum.state.zombies.get('z1') === raum.state.zombies.get('z1'), false);
    assert.equal(SpielRaum.speicher.ladeSpieler('schiessstand'), null);
    assert.equal(raum.speicher, null);
  } finally { await c.leave(); await haupt.leave(); }
});

test('Spieler ist unsterblich: Bisse, kein Hunger und Durst', async () => {
  const { c, raum, p } = await beitreten();
  try {
    raum.zombiesStarten(5);
    assert.ok(await bis(() => raum.state.zombies.size === 5), 'Zombies kamen nicht');
    for (const z of raum.state.zombies.values()) { z.x = p.x + 6; z.y = p.y; }   // alle auf den Spieler
    p.durst = 3; p.hunger = 3;
    await warte(1200);
    assert.equal(p.hp, 100); assert.equal(p.unten, false); assert.equal(p.infektion, 0); assert.equal(p.zombie, 0);
    assert.equal(p.durst, 100); assert.equal(p.hunger, 100);
  } finally { await c.leave(); }
});

test('Zombie-Start: Anzahl, gemischte Typen, aus dem Süden, Zurücksetzen', async () => {
  const { c, raum, p } = await beitreten();
  try {
    c.send('ss_zombies', { n: 20 });
    assert.ok(await bis(() => raum.state.zombies.size === 20), 'nicht alle 20: ' + raum.state.zombies.size);
    const typen = new Set([...raum.state.zombies.values()].map(z => z.variante));
    assert.ok(typen.size >= 5, 'Typen nicht gemischt: ' + typen.size);
    assert.ok([...raum.state.zombies.values()].every(z => z.y > p.y + 200), 'Zombies kommen nicht aus dem Süden');
    c.send('ss_reset');
    assert.ok(await bis(() => raum.state.zombies.size === 0), 'Zurücksetzen räumt nicht');
    assert.equal(Math.round(p.x), SS_START.x);
  } finally { await c.leave(); }
});

test('Auswertung: Schüsse, Treffer, Abschüsse und Munition je Waffe, echte Werte aus den Einstellungen', async () => {
  const { c, raum, p } = await beitreten();
  const nachrichten = [];
  c.onMessage('ss_stat', m => nachrichten.push(m));
  try {
    c.send('ss_waffe', { name: 'gewehr' });
    assert.ok(await bis(() => p.waffe === 'gewehr'));
    raum.zombiesStarten(1); assert.ok(await bis(() => raum.state.zombies.size === 1));
    const [id, z] = [...raum.state.zombies.entries()][0];
    z.x = p.x; z.y = p.y + 150;
    raum.zombieInfo.get(id).uebung = false; raum.zombieInfo.get(id).ziel = null; raum.zombieInfo.get(id).steht = true; raum.zombieInfo.get(id).wechsel = 99;   // bleibt stehen
    assert.ok(await bis(() => raum.state.zombies.size === 0, 8000), 'Zombie nicht erledigt');
    const st = raum.stat.gewehr;
    assert.ok(st.schuesse >= 1, 'keine Schüsse gezählt');
    assert.ok(st.treffer >= 1 && st.treffer <= st.schuesse, 'Treffer ' + st.treffer);
    assert.equal(st.kills, 1);
    assert.equal(st.munition, st.schuesse);
    await bis(() => nachrichten.some(m => m.stat.gewehr.kills === 1));
    const m = nachrichten.at(-1);
    assert.equal(m.werte.gewehr.schaden, WAFFEN.gewehr.schaden);   // ohne Verwaltungswerte die Vorgabe
    assert.equal(m.zombieLeben, 100);
    assert.equal(raum.stat.pistole.schuesse, 0);
    // unbegrenzter Vorrat
    assert.equal(p.munition, MUNITION_MAX);
  } finally { await c.leave(); }
});

test('Nahkampf zählt Schläge ohne Munition; Handgranate zählt Wurf und Treffer', async () => {
  const { c, raum, p } = await beitreten();
  try {
    c.send('ss_waffe', { name: 'messer' });
    assert.ok(await bis(() => p.waffe === 'messer'));
    raum.zombiesStarten(1); assert.ok(await bis(() => raum.state.zombies.size === 1));
    const [id, z] = [...raum.state.zombies.entries()][0];
    const info = raum.zombieInfo.get(id); info.uebung = false; info.ziel = null; info.steht = true; info.wechsel = 99;
    z.x = p.x + 20; z.y = p.y;
    assert.ok(await bis(() => raum.stat.messer.schuesse >= 1), 'kein Schlag');
    assert.equal(raum.stat.messer.munition, 0);
    assert.ok(await bis(() => raum.state.zombies.size === 0, 6000));
    assert.equal(raum.stat.messer.kills, 1);
    // Handgranate: auf einen Zombie in 100 px
    raum.zombiesStarten(1); assert.ok(await bis(() => raum.state.zombies.size === 1));
    const [id2, z2] = [...raum.state.zombies.entries()][0];
    const i2 = raum.zombieInfo.get(id2); i2.uebung = false; i2.ziel = null; i2.steht = true; i2.wechsel = 99; i2.tempo = 0;   // bleibt stehen
    z2.x = p.x; z2.y = p.y + 110;
    c.send('ss_waffe', { name: 'faust' });
    c.send('wurf');
    assert.ok(await bis(() => raum.stat.handgranate.treffer >= 1, 4000), 'Granate traf nicht');
    assert.equal(raum.stat.handgranate.schuesse, 1);
    assert.ok(raum.stat.handgranate.kills >= 1);
    assert.equal(p.hp, 100);
  } finally { await c.leave(); }
});

test('Panzer: nur an schießt der Puma, Abschüsse zählen für den Panzer', async () => {
  const { c, raum, p } = await beitreten();
  try {
    c.send('ss_waffe', { name: 'faust' });
    raum.zombiesStarten(1); assert.ok(await bis(() => raum.state.zombies.size === 1));
    const [id, z] = [...raum.state.zombies.entries()][0];
    const info = raum.zombieInfo.get(id); info.uebung = false; info.ziel = null; info.steht = true; info.wechsel = 99;
    info.tempo = 0;   // bleibt stehen, außerhalb der Reichweite des Spielers (Faust), aber in der des Panzers
    z.x = p.x + 280; z.y = p.y;
    await warte(2500);
    assert.equal(raum.state.zombies.size, 1, 'Panzer aus: nichts darf schießen');
    c.send('ss_panzer', { an: true });
    assert.ok(await bis(() => raum.state.zombies.size === 0, 15000), 'Panzer schießt nicht');
    assert.ok(raum.panzerKills >= 1);
    assert.equal(Object.values(raum.stat).reduce((a, s) => a + s.kills, 0), 0, 'Panzerabschuss ist kein Spielerabschuss');
  } finally { await c.leave(); }
});

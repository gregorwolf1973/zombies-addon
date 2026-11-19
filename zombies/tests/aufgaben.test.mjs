// Gemeinsame Aufgaben, Funkspruch und Evakuierungsbus (server/aufgaben.mjs)
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
import { Aufgaben } from '../server/aufgaben.mjs';
import { KACHEL, WELT_VERSION } from '../client/welt.mjs';

// Figur in den Innenraum eines Safe Rooms setzen (neben die Eingangstür oder an einen Punkt darin)
function inDenSafeRoom(raum, p, s, wo = 'tuer') {
  const w = raum.wv(s.ebene);
  const ort = wo === 'kiste' ? w.kiste : wo === 'mitte' ? w.start : raum.nebenKachel(w, w.ausgang);
  p.ebene = s.ebene; p.x = ort.x; p.y = ort.y;
  return w;
}

const PORT = 27300 + Math.floor(Math.random() * 200);
const URL_ = `http://127.0.0.1:${PORT}`;
const ordner = fs.mkdtempSync(path.join(os.tmpdir(), 'zombies-aufgaben-'));
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

// frische Welt (die vorige Runde ist beendet, ihr Stand wird verworfen)
async function frisch() {
  assert.ok(await bis(() => !SpielRaum.aktiv, 3000), 'alter Raum lebt noch');
  SpielRaum.speicher.loescheWelt();
}
async function beenden(...clients) {
  for (const c of clients) await c.leave();
  await bis(() => !SpielRaum.aktiv, 3000);
}

// feste Aufgaben vorgeben statt der gezogenen
function setzeAufgaben(raum, ids) {
  raum.state.aufgaben.clear();
  for (const id of ids) raum.aufgaben.neu(id, false);
  raum.aufgaben.aktualisieren(false);
}

const busVon = raum => [...raum.state.fahrzeuge.entries()].find(([, f]) => f.art === 'evakuierung');

test('Aufgaben: vier gezogen, Funkspruch immer Pflicht, deterministisch aus Seed und Level', async () => {
  const stub = (seed, level, anzahl = 4) => {
    const raum = { state: { seed, level, besiegt: 0, aufgaben: new Map(), spieler: new Map() }, einstellungen: () => ({ aufgaben: { an: true, anzahl } }) };
    const a = new Aufgaben(raum); a.ziehen();
    return [...raum.state.aufgaben.values()];
  };
  const a1 = stub(4711, 1), a2 = stub(4711, 1);
  assert.equal(a1.length, 4);
  assert.deepEqual(a1.map(a => a.id), a2.map(a => a.id));
  assert.equal(new Set(a1.map(a => a.id)).size, 4, 'Aufgabe doppelt');
  assert.equal(a1[0].id, 'funk');
  assert.ok(a1[0].pflicht);
  assert.ok(a1.slice(1).every(a => !a.pflicht));
  assert.equal(stub(1, 1, 6).length, 6);
  assert.equal(stub(1, 1, 3).length, 3);

  await frisch();
  const { c, raum } = await beitreten('Zieher');
  try {
    assert.equal(raum.state.aufgaben.size, 4);
    assert.equal(raum.state.level, 1);
    assert.equal(raum.state.aufgaben.get('funk')?.pflicht, true);
    assert.ok(await bis(() => c.state.aufgaben?.size === 4), 'Client sieht die Aufgaben nicht');
  } finally { await beenden(c); }
});

test('Funkspruch am Funktisch: Aktion dauert, ist laut und setzt die Aufgabe auf erledigt', async () => {
  await frisch();
  const { c, raum, p } = await beitreten('Funker');
  try {
    const s = raum.welt.safeRooms[0];
    const w = inDenSafeRoom(raum, p, s);
    const m = w.moebel.find(q => q.art === 'funktisch');
    assert.ok(m, 'kein Funktisch im Safe Room');
    p.x = (m.x + m.b / 2) * KACHEL; p.y = (m.y + m.h) * KACHEL + 14;
    const meldungen = [];
    c.onMessage('meldung', x => meldungen.push(x.text));
    assert.equal(raum.kontext(p)?.art, 'funk');
    // weit weg vom Tisch: keine Funk-Aktion
    const x0 = p.x; p.x = w.start.x; p.y = w.start.y;
    if (Math.hypot(p.x - (m.x + m.b / 2) * KACHEL, p.y - (m.y + m.h / 2) * KACHEL) > 90) assert.notEqual(raum.kontext(p)?.art, 'funk');
    p.x = x0; p.y = (m.y + m.h) * KACHEL + 14;
    let laerm = 0;
    const alt = raum.laerm.bind(raum); raum.laerm = (...a) => { laerm = Math.max(laerm, a[2]); return alt(...a); };
    c.send('aktion');
    assert.ok(await bis(() => p.aktion === 'funk'), 'Aktion startet nicht');
    assert.equal(raum.state.funk, false);
    assert.ok(await bis(() => raum.state.funk === true, 6000), 'Funkspruch nicht abgesetzt');
    assert.ok(laerm >= 400, 'Funkspruch war nicht laut');
    const a = raum.state.aufgaben.get('funk');
    assert.equal(a.erledigt, true);
    assert.equal(raum.state.busAnkunft, 18 * 60);
    assert.ok(await bis(() => meldungen.some(t => t.includes('Evakuierungsbus kommt um 18:00'))), 'keine Funkmeldung: ' + meldungen.join(' | '));
    assert.notEqual(raum.kontext(p)?.art, 'funk', 'Funkspruch lässt sich zweimal absetzen');
    assert.ok(await bis(() => c.state.funk === true));
  } finally { await beenden(c); }
});

test('Vorräte, Medizin, Zombies, Tor, Lampen, Bretter zählen live und bleiben erledigt', async () => {
  await frisch();
  const { c, raum, p } = await beitreten('Zaehler');
  try {
    setzeAufgaben(raum, ['funk', 'vorraete', 'medizin', 'zombies', 'tor', 'lampen', 'bretter']);
    const g = id => raum.state.aufgaben.get(id), aktu = () => raum.aufgaben.aktualisieren(false);
    const [s1, s2] = [raum.welt.safeRooms[0], raum.welt.safeRooms[1]];
    // Vorräte: N = 2 + 1 Spieler = 3 Wasser + 3 Essen, alle Kisten zusammen
    assert.equal(g('vorraete').ziel, 6);
    for (const d of ['wasser', 'wasser']) raum.state.safes.get(s1.id).kiste.push(d);
    raum.state.safes.get(s2.id).kiste.push('essen');
    aktu();
    assert.equal(g('vorraete').fortschritt, 3);
    assert.equal(g('vorraete').erledigt, false);
    raum.state.safes.get(s2.id).kiste.push('wasser', 'essen', 'essen');
    aktu();
    assert.equal(g('vorraete').erledigt, true);
    // erledigt bleibt, auch wenn die Kiste leer geräumt wird
    raum.state.safes.get(s1.id).kiste.clear(); raum.state.safes.get(s2.id).kiste.clear();
    aktu();
    assert.equal(g('vorraete').erledigt, true);

    // Medizin: Spritze in der Kiste ...
    assert.equal(g('medizin').erledigt, false);
    raum.state.safes.get(s1.id).kiste.push('spritze');
    aktu();
    assert.equal(g('medizin').erledigt, true);
    // ... oder Fund aus der Apotheke
    raum.state.aufgaben.delete('medizin'); raum.aufgaben.neu('medizin', false);
    raum.aufgaben.gefunden({ art: 'laden_kaufhaus' }, ['spritze']);
    assert.equal(g('medizin').erledigt, false, 'Fund aus anderem Laden zählt nicht');
    raum.state.safes.get(s1.id).kiste.clear();
    raum.aufgaben.gefunden({ art: 'laden_apotheke' }, ['spritze']);
    assert.equal(g('medizin').erledigt, true);

    // Zombies seit Aufgabenbeginn: 15 bei einer Person
    assert.equal(g('zombies').ziel, 15);
    raum.state.besiegt += 14; aktu();
    assert.equal(g('zombies').fortschritt, 14);
    assert.equal(g('zombies').erledigt, false);
    raum.state.besiegt += 1; aktu();
    assert.equal(g('zombies').erledigt, true);

    // Tor
    raum.state.torGeloest = 2; aktu();
    assert.equal(g('tor').fortschritt, 2);
    assert.equal(g('tor').erledigt, false);
    raum.state.torGeloest = 3; aktu();
    assert.equal(g('tor').erledigt, true);

    // Taschenlampen: jede Person hat eine
    p.lampe = 0; p.rucksack.clear(); aktu();
    assert.equal(g('lampen').fortschritt, 0);
    p.rucksack.push('taschenlampe'); aktu();
    assert.equal(g('lampen').erledigt, true);

    // Bretter: der Safe Room des Funkspruchs zu 100 %
    assert.equal(g('bretter').fortschritt, 0);
    raum.aufgaben.funkAbsetzen(p, s2);
    raum.state.safes.get(s1.id).barrikade = 100; aktu();
    assert.equal(g('bretter').erledigt, false, 'falscher Safe Room zählt');
    raum.state.safes.get(s2.id).barrikade = 70; aktu();
    assert.equal(g('bretter').fortschritt, 70);
    raum.state.safes.get(s2.id).barrikade = 100; aktu();
    assert.equal(g('bretter').erledigt, true);
    assert.equal(g('funk').erledigt, true);
    assert.ok(await bis(() => c.state.aufgaben?.get('bretter')?.erledigt === true), 'Client sieht den Stand nicht');
  } finally { await beenden(c); }
});

test('Evakuierungsbus: nur mit Funkspruch, wartet, wer nahe steht ist an Bord', async () => {
  await frisch();
  const a = await beitreten('Eins'), b = await beitreten('Zwei');
  const { raum } = a;
  try {
    setzeAufgaben(raum, ['funk', 'tor', 'zombies', 'lampen']);
    const meldungen = [];
    a.c.onMessage('meldung', x => meldungen.push(x.text));
    // Warnung 30 Spielminuten vorher – nur mit Funkspruch
    raum.state.uhr = 17 * 60 + 40;
    await warte(300);
    assert.ok(!meldungen.some(t => t.includes('kommt um 18:00')), 'Warnung ohne Funkspruch');
    // zur Ankunftszeit ohne Funkspruch kein Bus
    raum.state.uhr = 18 * 60 + 0.1;
    await warte(300);
    assert.equal(busVon(raum), undefined, 'Bus ohne Funkspruch');
    assert.equal(raum.state.busDa, false);

    // Funkspruch, aber vor der Ankunftszeit: Warnung, noch kein Bus
    raum.state.uhr = 17 * 60 + 40;
    raum.aufgaben.funkAbsetzen(a.p, raum.welt.safeRooms[0]);
    raum.aufgaben.ankGemeldet = false;
    assert.ok(await bis(() => meldungen.some(t => t.includes('🚌 Der Evakuierungsbus kommt um 18:00 zum Ortsausgang!'))), 'keine Warnung: ' + meldungen.join(' | '));
    assert.equal(busVon(raum), undefined);

    // zur Ankunftszeit steht der Bus am Tor
    raum.state.uhr = 18 * 60 + 0.1;
    assert.ok(await bis(() => busVon(raum)), 'kein Bus erschienen');
    assert.equal(raum.state.busDa, true);
    assert.ok(await bis(() => raum.state.busSteht && raum.aufgaben.busRest > 500 && raum.aufgaben.busRest <= 600), 'Wartezeit nicht 10 echte Minuten: ' + raum.aufgaben.busRest);
    assert.ok(raum.state.busAb >= 0 && raum.state.busAb < 1440);
    const [, bus] = busVon(raum);
    assert.equal(bus.haelt, true);
    const tor = raum.welt.tor;
    assert.ok(Math.hypot(bus.x - (tor.x + 1) * KACHEL, bus.y - (tor.y + 1) * KACHEL) < 400, 'Bus steht nicht am Ortsausgang');
    assert.ok(await bis(() => [...a.c.state.fahrzeuge.values()].some(f => f.art === 'evakuierung')), 'Client sieht den Bus nicht');

    // Eins steht am Bus, Zwei weit weg: 1 von 2 an Bord, der Bus wartet
    a.p.ebene = ''; a.p.x = bus.x + 20; a.p.y = bus.y;
    b.p.ebene = ''; b.p.x = bus.x + 600; b.p.y = bus.y;
    assert.ok(await bis(() => raum.state.busBord === 1 && raum.state.busGesamt === 2), `Bord ${raum.state.busBord}/${raum.state.busGesamt}`);
    await warte(300);
    assert.equal(raum.state.busDa, true, 'Bus fuhr los, obwohl Zwei fehlt');
    // jetzt steigt auch Zwei zu: alle an Bord, aber die Aufgaben fehlen → er fährt nicht sofort, sondern erst nach Ablauf der Wartezeit
    b.p.x = bus.x - 20;
    await warte(500);
    assert.equal(raum.state.busDa, true, 'Bus fuhr ohne geschaffte Aufgaben sofort los');
    raum.aufgaben.busRest = 0;
    assert.ok(await bis(() => raum.state.busDa === false), 'Bus fährt nicht, obwohl alle an Bord sind');
    assert.ok(meldungen.some(t => t.includes('ohne euch abgefahren')), 'keine Meldung: ' + meldungen.join(' | '));
    assert.equal(busVon(raum), undefined, 'Bus bleibt stehen');
    assert.equal(raum.state.level, 1, 'Level gewechselt');
    assert.equal(raum.state.aufgaben.size, 4, 'Aufgaben verschwunden');
    assert.equal(raum.state.funk, true);
    // am selben Tag kommt kein zweiter Bus
    await warte(300);
    assert.equal(busVon(raum), undefined);
    // nach Ablauf des Zeitfensters (Mitternacht) und am nächsten Tag wieder
    raum.state.uhr = 20 * 60; await warte(200);
    raum.state.uhr = 18 * 60 + 0.1;
    assert.ok(await bis(() => busVon(raum)), 'am nächsten Tag kommt kein neuer Bus');
    // Aufgaben geschafft: wer nah genug ist, steigt dauerhaft ein und fährt mit (auch wenn er sich wegbewegen will)
    for (const x of raum.state.aufgaben.values()) x.erledigt = true;
    const [, bus2] = busVon(raum);
    a.p.ebene = ''; a.p.x = bus2.x + 100; a.p.y = bus2.y;
    assert.ok(await bis(() => raum.aufgaben.eingestiegen.size >= 1 || raum.state.busDa === false), 'Einsteigen auf Abstand 100 klappt nicht');
    // Wartezeit um, niemand an Bord: Bus fährt ohne die Gruppe
    a.p.x = bus.x + 900; b.p.x = bus.x + 900;
    raum.aufgaben.busRest = 0;
    assert.ok(await bis(() => raum.state.busDa === false), 'Bus wartet ewig');
  } finally { await beenden(a.c, b.c); }
});

test('Speichern und Laden: Aufgabenstand, Funkspruch und Level bleiben mit der Welt', async () => {
  await frisch();
  const id = neueId();
  let { c, raum, p } = await beitreten('Sicherer', id);
  const ids = [...raum.state.aufgaben.keys()];
  const s = raum.welt.safeRooms[1];
  raum.state.torGeloest = 3; raum.state.besiegt = 5;
  raum.aufgaben.basis = 2;
  raum.aufgaben.funkAbsetzen(p, s);
  raum.aufgaben.aktualisieren(false);
  raum.speichereWelt();
  const stand = SpielRaum.speicher.ladeWelt();
  assert.equal(stand.aufgaben.funk, true);
  assert.equal(stand.aufgaben.funkSafe, s.id);
  assert.equal(stand.aufgaben.basis, 2);
  assert.deepEqual(stand.aufgaben.ids, ids);
  assert.equal(stand.aufgaben.erledigt.funk, true);
  assert.equal(stand.level, 1);
  const erledigt = [...raum.state.aufgaben.values()].filter(a => a.erledigt).map(a => a.id).sort();
  await beenden(c);

  ({ c, raum, p } = await beitreten('Sicherer2', id));
  try {
    assert.deepEqual([...raum.state.aufgaben.keys()], ids);
    assert.equal(raum.state.funk, true);
    assert.equal(raum.state.busAnkunft, 18 * 60);
    assert.equal(raum.aufgaben.funkSafe, s.id);
    assert.equal(raum.aufgaben.basis, 2);
    assert.deepEqual([...raum.state.aufgaben.values()].filter(a => a.erledigt).map(a => a.id).sort(), erledigt);
    assert.equal(raum.state.level, 1);
  } finally { await beenden(c); }
});

test('Levelwechsel: mit erfüllten Aufgaben fährt der Bus los, die Karte wechselt, Rucksack und Level bleiben', async () => {
  await frisch();
  const id = neueId();
  const a = await beitreten('Fahrgast', id), b = await beitreten('Nachzügler');
  const { raum } = a;
  let neu = null;
  try {
    setzeAufgaben(raum, ['funk', 'tor', 'zombies', 'lampen']);
    raum.aufgaben.wechselVerzoegerung = 100;
    const meldungen = [];
    a.c.onMessage('meldung', x => meldungen.push(x.text));
    a.p.rucksack.clear(); a.p.rucksack.push('verband', 'wasser');
    raum.aufgaben.funkAbsetzen(a.p, raum.welt.safeRooms[0]);
    // drei von vier plus Pflicht reichen (Tor-Aufgabe fehlt)
    for (const k of ['funk', 'zombies', 'lampen']) { const g = raum.state.aufgaben.get(k); g.erledigt = true; g.fortschritt = g.ziel; }
    assert.equal(raum.state.aufgaben.get('tor').erledigt, false);
    raum.state.uhr = 18 * 60 + 0.1;
    assert.ok(await bis(() => busVon(raum)), 'kein Bus');
    const [, bus] = busVon(raum);
    a.p.ebene = ''; a.p.x = bus.x + 20; a.p.y = bus.y;
    b.p.ebene = ''; b.p.x = bus.x + 700; b.p.y = bus.y;   // Nachzügler nicht an Bord
    assert.ok(await bis(() => raum.state.busBord === 1));
    const neustart = new Promise(r => a.c.onMessage('neustart', r));
    raum.aufgaben.busRest = 0;
    const m = await Promise.race([neustart, warte(5000).then(() => null)]);
    assert.ok(m, 'kein Levelwechsel');
    assert.equal(m.level, 2);
    assert.ok(meldungen.some(t => t.includes('🎉 Geschafft! Weiter nach Level 2')), 'keine Erfolgsmeldung: ' + meldungen.join(' | '));
    assert.ok(meldungen.some(t => t.includes('trotzdem mit')), 'keine Mitkommen-Meldung');
    const stand = SpielRaum.speicher.ladeWelt();
    assert.equal(stand.level, 2);
    assert.equal(stand.karte, 'geretsried');
    assert.equal(SpielRaum.einstellungen.karte?.name, 'geretsried');
    assert.ok(SpielRaum.speicher.ladeSpieler(a.spielerId).rucksack.includes('wasser'), 'Rucksack nicht gespeichert');
    assert.equal(SpielRaum.speicher.ladeSpieler(a.spielerId).x, null, 'Platz wird in der neuen Welt neu bestimmt');
  } finally { await beenden(a.c, b.c); }

  neu = await beitreten('Fahrgast2', id);
  try {
    assert.equal(neu.raum.state.karte, 'geretsried');
    assert.equal(neu.raum.state.level, 2);
    assert.equal(neu.raum.state.aufgaben.size, 4);
    assert.equal(neu.raum.state.funk, false, 'Funkspruch gilt nur je Level');
    assert.equal(neu.raum.state.busDa, false);
    assert.ok(neu.p.rucksack.includes('wasser') && neu.p.rucksack.includes('verband'), 'Rucksack weg');
  } finally { await beenden(neu.c); }
});

test('Einstellungen: Aufgaben und Evakuierung werden begrenzt, Vorgaben stimmen', async () => {
  const { bereinige, vorgaben } = await import('../server/einstellungen.mjs');
  assert.deepEqual(vorgaben().aufgaben, { an: true, stunde: 18, wartezeit: 60, wartenEchtMin: 10, anzahl: 4 });
  const e = bereinige({ aufgaben: { an: false, stunde: 3, wartezeit: 999, wartenEchtMin: 999, anzahl: 9 } });
  assert.deepEqual(e.aufgaben, { an: false, stunde: 6, wartezeit: 180, wartenEchtMin: 60, anzahl: 6 });
  const f = bereinige({ aufgaben: { stunde: 99, wartezeit: 1, wartenEchtMin: 0, anzahl: 0 } }, e);
  assert.deepEqual(f.aufgaben, { an: false, stunde: 23, wartezeit: 10, wartenEchtMin: 1, anzahl: 3 });
  assert.equal(bereinige({ bundeswehr: { pumaPause: 0.01 } }).bundeswehr.pumaPause, 0.1);
  assert.equal(bereinige({}).aufgaben.stunde, 18);
});

test('Evakuierungsbus und -panzer schießen auf Zombies in der Nähe, nie auf Spieler, nach der Abfahrt nicht mehr', async () => {
  await frisch();
  const a = await beitreten('Schuetze');
  const { raum } = a;
  try {
    setzeAufgaben(raum, ['funk', 'tor', 'zombies', 'lampen']);
    const schuesse = [];
    a.c.onMessage('bwschuss', m => schuesse.push(m));
    raum.aufgaben.funkAbsetzen(a.p, raum.welt.safeRooms[0]);
    raum.aufgaben.evakTrefferChance = 1;
    raum.state.uhr = 18 * 60 + 0.1;
    assert.ok(await bis(() => busVon(raum)), 'kein Bus');
    const [, bus] = busVon(raum);
    // Spieler draußen neben dem Bus: bekommt nie Schaden durch den Bus
    a.p.ebene = ''; a.p.x = bus.x + 60; a.p.y = bus.y + 60; const hp = a.p.hp;
    // Zombie in Reichweite (zu weit: kein Schuss)
    const zid = raum.setzeZombie(bus.x + 150, bus.y, '');
    const z = raum.state.zombies.get(zid); raum.zombieInfo.get(zid).steht = true; z.hp = 100;
    const fern = raum.setzeZombie(bus.x + 900, bus.y, ''); raum.zombieInfo.get(fern).steht = true;
    assert.ok(await bis(() => !raum.state.zombies.has(zid) || z.hp < 100), 'Bus schießt nicht');
    assert.ok(schuesse.length > 0 && schuesse.every(m => m.art === 'mg'), 'Schussdarstellung fehlt');
    assert.ok(raum.state.zombies.has(fern), 'Zombie außer Reichweite getroffen');
    assert.equal(a.p.hp, hp, 'Spieler getroffen');
    // Panzer in Level 2 (Isarauen): Turm-MG aus der Fahrzeugmitte
    raum.state.karte = 'isarauen'; schuesse.length = 0;
    const z2 = raum.setzeZombie(bus.x - 120, bus.y, ''); raum.zombieInfo.get(z2).steht = true;
    assert.ok(await bis(() => schuesse.some(m => Math.hypot(m.x1 - bus.x, m.y1 - bus.y) < 1)), 'Panzer schießt nicht aus der Mitte');
    // Abfahrt: Schluss mit Schießen
    raum.aufgaben.busWeg();
    await warte(100); schuesse.length = 0;
    raum.setzeZombie(bus.x + 100, bus.y, '');
    await warte(700);
    assert.equal(schuesse.length, 0, 'schießt nach der Abfahrt');
  } finally { await beenden(a.c); }
});

test('Neues Level: alle Spieler und Bots erscheinen im selben Safe House', async () => {
  await frisch();
  const alt = SpielRaum.einstellungen;
  const id1 = neueId(), id2 = neueId();
  const a = await beitreten('Eins', id1), b = await beitreten('Zwei', id2);
  try {
    a.raum.weltNeuStarten(false, { version: WELT_VERSION, karte: 'geretsried', seed: 4242, zeit: 0, uhr: 480, besiegt: 0, level: 2, chat: [] });
    await bis(() => !SpielRaum.aktiv, 3000);
    SpielRaum.einstellungen = { ...alt, bots: 4 };
    const c1 = await beitreten('Eins', id1);
    const c2 = await beitreten('Zwei', id2);
    const c3 = await beitreten('Neu');   // ohne gespeicherten Stand
    try {
      const raum = c1.raum;
      assert.equal(raum.state.level, 2);
      const ps = [...raum.state.spieler.values()];
      assert.ok(ps.length >= 5, 'Bots fehlen: ' + ps.length);
      const ebenen = new Set(ps.map(p => p.ebene));
      assert.equal(ebenen.size, 1, 'verschiedene Orte: ' + [...ebenen].join(','));
      const e = [...ebenen][0];
      assert.ok(e && raum.welt.safeRooms.some(s => s.ebene === e), 'nicht in einem Safe House: ' + e);
      assert.equal(e, raum.startSafe().ebene);
    } finally { await beenden(c1.c, c2.c, c3.c); }
  } finally { SpielRaum.einstellungen = alt; }
});

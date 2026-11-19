import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { matchMaker } from '@colyseus/core';
import { Client } from '@colyseus/sdk';
import { starte } from '../server/index.mjs';
import { WAFFEN, DINGE, BEUTE, ziehe, aktiveWaffe, ladenArt } from '../client/welt.mjs';
import * as FK from '../server/faehigkeiten.mjs';

const PORT = 26170 + Math.floor(Math.random() * 200);
const URL_ = `http://127.0.0.1:${PORT}`;
let server;
const warte = ms => new Promise(r => setTimeout(r, ms));
async function bis(bedingung, ms = 3000) {
  const ende = Date.now() + ms;
  while (Date.now() < ende) { if (bedingung()) return true; await warte(20); }
  return bedingung();
}
before(async () => { server = await starte({ port: PORT, optionen: { karte: 'dorf' }, leise: true, datenbank: ':memory:' }); });
after(async () => { await server.gracefullyShutdown(false); });

test('Werte: Armbrust leise, Scharfschützengewehr mit größter Reichweite und hohem Schaden', () => {
  assert.ok(WAFFEN.armbrust.laut < 0.1, 'Armbrust fast ohne Lärm');
  assert.ok(WAFFEN.armbrust.pfeil && WAFFEN.armbrust.fern);
  assert.ok(WAFFEN.armbrust.pause > WAFFEN.gewehr.pause, 'langsames Nachladen');
  for (const [k, w] of Object.entries(WAFFEN)) if (k !== 'scharfschuetze') assert.ok(WAFFEN.scharfschuetze.reichweite > w.reichweite, 'Reichweite größer als ' + k);
  assert.ok(WAFFEN.scharfschuetze.schaden > WAFFEN.gewehr.schaden && WAFFEN.scharfschuetze.pause > WAFFEN.gewehr.pause && WAFFEN.scharfschuetze.laut > WAFFEN.gewehr.laut);
  for (const d of ['armbrust', 'pfeil', 'scharfschuetze']) assert.ok(DINGE[d]?.zeichen && DINGE[d].name, d);
  // Armbrust braucht Pfeile, nicht Munition
  assert.equal(aktiveWaffe({ waffe: 'armbrust', munition: 50, pfeile: 0 })[0], 'faust');
  assert.equal(aktiveWaffe({ waffe: 'armbrust', munition: 0, pfeile: 2 })[0], 'armbrust');
  assert.equal(aktiveWaffe({ waffe: 'scharfschuetze', munition: 1, pfeile: 0 })[0], 'scharfschuetze');
});

test('Maschinengewehr ist in Polizei- und Bundeswehr-Behältern möglich, Polizei zählt als Laden', () => {
  for (const art of ['bw_container', 'laden_polizei']) assert.ok(BEUTE[art].includes('mg'), art);
  assert.equal(ladenArt({ art: 'police' }), 'polizei');
  // Wahrscheinlichkeit, in 40 Durchsuchungen eines Containers oder Waffenschranks (je ~1,45 Funde) mindestens ein MG zu finden
  for (const art of ['bw_container', 'laden_polizei']) {
    const p = BEUTE[art].filter(d => d === 'mg').length / BEUTE[art].length;
    assert.ok(1 - Math.pow(1 - p, 40 * 1.45) > 0.9, art + ' zu selten');
  }
  // deterministisch
  let n = 0; const rnd = () => ((n = (n * 1103515245 + 12345) % 2147483648) / 2147483648);
  const funde = new Set(); for (let i = 0; i < 400; i++) funde.add(ziehe(BEUTE.laden_polizei, {}, rnd));
  assert.ok(funde.has('mg') && funde.has('scharfschuetze'));
});

test('Armbrust: leiser Schuss, Pfeil verbraucht, Pfeil liegt danach am Boden und ist aufhebbar', async () => {
  const a = await new Client(URL_).joinOrCreate('zombies', { name: 'Armbrust' });
  try {
    const raum = matchMaker.getLocalRoomById(a.roomId);
    raum.zombieFaktor = 0; raum.kriecherChance = 0;
    raum.state.zombies.clear(); raum.zombieInfo.clear();
    const p = raum.state.spieler.get(a.sessionId);
    p.waffe = 'armbrust'; p.pfeile = 5; p.munition = 0;
    const laerme = []; const alt = raum.laerm.bind(raum);
    raum.laerm = (x, y, weite, ...r) => { laerme.push(weite); return alt(x, y, weite, ...r); };
    raum.neuerZombie(0);
    const [id, z] = [...raum.state.zombies.entries()][0];
    z.x = p.x + 100; z.y = p.y;
    raum.zombieInfo.get(id).steht = true; raum.zombieInfo.get(id).wechsel = 99;
    assert.ok(await bis(() => p.pfeile < 5, 4000), 'kein Schuss');
    assert.ok(await bis(() => [...raum.state.boden.values()].some(b => b.ding === 'pfeil')), 'Pfeil liegt nicht am Boden');
    assert.equal(p.munition, 0);
    const schussLaerm = Math.min(...laerme.filter(w => w < 100));
    assert.ok(schussLaerm < 40, 'Schusslärm sehr klein: ' + schussLaerm);
    // aufheben: ein Pfeil zurück
    const [bid, b] = [...raum.state.boden.entries()].find(([, d]) => d.ding === 'pfeil');
    const vor = p.pfeile;
    raum.nimmAuf(null, p, bid, b);
    assert.equal(p.pfeile, vor + 1);
    assert.ok(!raum.state.boden.has(bid));
    // Behälterfund: Pfeile als Vorrat statt Rucksackplatz
    const inhalt = ['pfeil']; const platz = p.rucksack.length;
    raum.einpacken(p, inhalt);
    assert.equal(p.rucksack.length, platz); assert.equal(inhalt.length, 0); assert.ok(p.pfeile >= vor + 7);
  } finally { await a.leave(); }
});

test('Bundeswehr-Kiste liefert selten ein Maschinengewehr', async () => {
  const a = await new Client(URL_).joinOrCreate('zombies', { name: 'Kiste' });
  try {
    const raum = matchMaker.getLocalRoomById(a.roomId);
    const p = raum.state.spieler.get(a.sessionId);
    p.waffe = '';
    raum.rnd = () => 0.05;
    raum.durchsucht({ sessionId: a.sessionId, send() {} }, p, { id: 'kistetest', art: 'bw_kiste' });
    assert.equal(p.waffe, 'mg');
  } finally { await a.leave(); }
});

test('Startwahl: genau einmal, genau 5 Punkte, ein Startgegenstand', async () => {
  const a = await new Client(URL_).joinOrCreate('zombies', { name: 'Starter' });
  try {
    const raum = matchMaker.getLocalRoomById(a.roomId);
    const p = raum.state.spieler.get(a.sessionId), x = raum.extra.get(a.sessionId);
    assert.equal(raum.state.level, 1);
    assert.equal(x.startOffen, true);
    let angebot = null; a.onMessage('startwahl', m => { angebot = m; }); a.onMessage('startwahl_ok', () => {});
    a.send('startwahl', {});
    assert.ok(await bis(() => angebot), 'Angebot kam nicht');
    assert.equal(angebot.punkte, 5);
    assert.deepEqual(angebot.gegenstaende, ['waffe', 'lampe', 'brecheisen', 'wasser']);
    const wasser0 = p.rucksack.filter(d => d === 'wasser').length;
    // ungültig: 4 Punkte, 6 Punkte, unbekannte Fähigkeit, Stufe über 5, unbekannter Gegenstand
    for (const punkte of [{ zielen: 4 }, { zielen: 5, tempo: 1 }, { gibtsnicht: 5 }, { zielen: 6 }, { zielen: -1, tempo: 6 }]) {
      a.send('startwahl', { punkte, item: 'wasser' }); await warte(60);
      assert.equal(x.startOffen, true, JSON.stringify(punkte));
    }
    a.send('startwahl', { punkte: { zielen: 5 }, item: 'pistole' }); await warte(60);
    assert.equal(x.startOffen, true, 'unbekannter Gegenstand');
    // gültig
    a.send('startwahl', { punkte: { zielen: 3, tempo: 2 }, item: 'wasser' });
    assert.ok(await bis(() => x.startOffen === false), 'Wahl nicht angenommen');
    assert.equal(x.fk.s.zielen, 3); assert.equal(x.fk.s.tempo, 2); assert.equal(x.fk.bonus, 5);
    assert.equal(p.rucksack.filter(d => d === 'wasser').length, wasser0 + 1);
    assert.equal(FK.freiePunkte(x.fk), 0, 'Startpunkte sind verbraucht, keine Zusatzpunkte');
    // zweiter Versuch wirkt nicht
    a.send('startwahl', { punkte: { leben: 5 }, item: 'waffe' }); await warte(100);
    assert.equal(x.fk.s.leben, 0); assert.equal(x.fk.bonus, 5);
    // der Stand übersteht das Normieren (Speichern/Laden)
    assert.equal(FK.normiere(JSON.parse(JSON.stringify(x.fk))).s.zielen, 3);
  } finally { await a.leave(); }
});

test('Startwahl: Gegenstände Waffe, Lampe, Brecheisen; Bots bekommen automatisch Punkte', async () => {
  const a = await new Client(URL_).joinOrCreate('zombies', { name: 'Gegenstand' });
  try {
    const raum = matchMaker.getLocalRoomById(a.roomId);
    const p = raum.state.spieler.get(a.sessionId);
    p.waffe = ''; p.munition = 0; p.lampe = 0; p.rucksack.splice(0);
    raum.startGegenstand(p, 'waffe'); assert.equal(p.waffe, 'pistole'); assert.equal(p.munition, 12);
    raum.startGegenstand(p, 'lampe'); assert.ok(p.lampe > 0);
    raum.startGegenstand(p, 'brecheisen'); assert.ok(p.rucksack.includes('brechstange'));
    const bots = [...raum.extra.entries()].filter(([, x]) => x.bot);
    for (const [, x] of bots) { assert.equal(FK.punkteVerteilt(x.fk), 5); assert.equal(x.fk.bonus, 5); }
  } finally { await a.leave(); }
});

test('Fähigkeiten: Startpunkte über den Level-Grenzen, normiere behält sie', () => {
  const st = FK.neuerStand();
  assert.equal(FK.startVergabe(st, { zielen: 5 }), true);
  assert.equal(FK.startVergabe(st, { tempo: 5 }), false, 'nur einmal');
  assert.equal(FK.normiere(st).s.zielen, 5);
  assert.equal(FK.freiePunkte(st), 0);
  FK.gebeXp(st, 100); assert.equal(FK.freiePunkte(st), 1);
});

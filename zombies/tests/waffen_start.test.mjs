import { SpielRaum } from '../server/raum.mjs';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { matchMaker } from '@colyseus/core';
import { Client } from '@colyseus/sdk';
import { starte } from '../server/index.mjs';
import { WAFFEN, DINGE, BEUTE, ziehe, aktiveWaffe, ladenArt } from '../client/welt.mjs';
import * as FK from '../server/faehigkeiten.mjs';
import * as WP from '../server/waffenplaetze.mjs';
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

test('Bundeswehr-Kiste: nie Zufalls-MG, nur die Versorgung (Pistole/Jagdgewehr/Schrotflinte)', async () => {
  const a = await new Client(URL_).joinOrCreate('zombies', { name: 'Kiste' });
  try {
    const raum = matchMaker.getLocalRoomById(a.roomId);
    const p = raum.state.spieler.get(a.sessionId);
    p.waffe = ''; p.munition = 0;
    raum.rnd = () => 0.05;
    const bwAlt = SpielRaum.einstellungen.bundeswehr;
    SpielRaum.einstellungen.bundeswehr = { ...bwAlt, kistenMunChance: 0, kistenVerbandChance: 0, kistenGranateChance: 0 };   // Zufallsbeute aus: nur die Versorgung
    raum.durchsucht({ sessionId: a.sessionId, send() {} }, p, { id: 'kistetest', art: 'bw_kiste' });
    assert.ok(['pistole', 'gewehr', 'schrotflinte'].includes(p.waffe), 'Waffe: ' + p.waffe);
    assert.equal(p.munition, 50);
    SpielRaum.einstellungen.bundeswehr = bwAlt;
  } finally { await a.leave(); }
});

test('Maschinengewehr aus der Kiste: kommt sofort in die Hand (Pistole in den Rucksack), schießt und verletzt Zombies', async () => {
  const a = await new Client(URL_).joinOrCreate('zombies', { name: 'MG-Schütze' });
  try {
    const raum = matchMaker.getLocalRoomById(a.roomId);
    const p = raum.state.spieler.get(a.sessionId), x = raum.extra.get(a.sessionId);
    raum.state.zombies.clear(); raum.zombieInfo.clear(); raum.zombieFaktor = 0;
    p.waffe = 'pistole'; p.munition = 0; p.rucksack.splice(0, p.rucksack.length);
    raum.munitionNehmen(p, 100); raum.einpacken(p, ['mg']);   // MG als Fund (z. B. Bundeswehr-Container)
    assert.equal(p.waffe, 'mg', 'MG nicht in der Hand');
    assert.ok(p.rucksack.includes('pistole'), 'Pistole nicht im Rucksack');
    assert.ok(p.munition >= 100, 'keine Munition');
    assert.equal(aktiveWaffe(p)[0], 'mg');
    // schießt: Zombie 100 px entfernt verliert Leben, Munition sinkt, 'schuss'-Nachricht kommt
    const schuesse = []; a.onMessage('schuss', m => schuesse.push(m));
    const ort = raum.welt.start;
    p.x = ort.x; p.y = ort.y; p.ebene = ''; p.unten = false;
    const id = raum.setzeZombie(ort.x + 100, ort.y, '');
    const info = raum.zombieInfo.get(id), z = raum.state.zombies.get(id);
    info.steht = true; info.schlaeft = false; info.ziel = null;
    const hp0 = z.hp, mun0 = p.munition;
    x.pause = 0; x.aktion = null; p.aktion = null;
    raum.spielerSchritt(a.sessionId, p, x, 0.05);
    assert.ok(raum.state.zombies.get(id)?.hp < hp0 || !raum.state.zombies.has(id), 'MG verletzt den Zombie nicht');
    assert.equal(p.munition + p.magazin, mun0 - 1);   // Magazin + Vorrat
    assert.ok(await bis(() => schuesse.some(m => m.art === 'mg')), 'keine Schussmeldung');
    // MG schlägt Waffe: auch ein zweites MG-Aufnehmen vom Boden ändert nichts, und eine volle Tasche lässt die Waffe liegen
    p.waffe = 'gewehr'; p.rucksack.splice(0, p.rucksack.length, ...Array(p.plaetze).fill('wasser'));
    raum.nimmAuf(null, p, 'gibtsnicht', { ding: 'mg' });
    assert.equal(p.waffe, 'gewehr', 'bei vollem Rucksack bleibt die Hand unverändert');
  } finally { await a.leave(); }
});

test('Startwahl: genau einmal, genau 5 Punkte, genau 2 verschiedene Gegenstände + Zufall', async () => {
  const a = await new Client(URL_).joinOrCreate('zombies', { name: 'Starter' });
  try {
    const raum = matchMaker.getLocalRoomById(a.roomId);
    const p = raum.state.spieler.get(a.sessionId), x = raum.extra.get(a.sessionId);
    assert.equal(raum.state.level, 1);
    assert.equal(x.startOffen, true);
    let angebot = null, ok = null; a.onMessage('startwahl', m => { angebot = m; }); a.onMessage('startwahl_ok', m => { ok = m; }); a.onMessage('meldung', () => {});
    a.send('startwahl', {});
    assert.ok(await bis(() => angebot), 'Angebot kam nicht');
    assert.equal(angebot.punkte, 5); assert.equal(angebot.anzahl, 2);
    assert.deepEqual(angebot.gegenstaende, ['messer', 'funkgeraet', 'taschenlampe', 'armbrust', 'schlaeger', 'radio', 'schluessel', 'spritze']);
    for (const d of angebot.gegenstaende) assert.ok(DINGE[d], d);
    p.waffe = ''; p.pfeile = 0; p.rucksack.splice(0); p.lampe = 0;
    // ungültig: Punkte (4, 6, unbekannt, Stufe über 5) und Gegenstände (1, 3, doppelt, unbekannt, keine Liste, nicht in der Liste)
    for (const punkte of [{ zielen: 4 }, { zielen: 5, tempo: 1 }, { gibtsnicht: 5 }, { zielen: 6 }, { zielen: -1, tempo: 6 }]) {
      a.send('startwahl', { punkte, items: ['messer', 'radio'] }); await warte(60);
      assert.equal(x.startOffen, true, JSON.stringify(punkte));
    }
    for (const items of [['messer'], ['messer', 'radio', 'spritze'], ['messer', 'messer'], ['messer', 'pistole'], 'messer', [], undefined, ['messer', 'brechstange']]) {
      a.send('startwahl', { punkte: { zielen: 5 }, items }); await warte(60);
      assert.equal(x.startOffen, true, 'Gegenstände ' + JSON.stringify(items));
    }
    // gültig: Messer (Waffe -> Platz) + Radio (Rucksack) + 1 Zufall
    raum.rnd = () => 0;   // erster Pool-Eintrag: Verband
    a.send('startwahl', { punkte: { zielen: 3, tempo: 2 }, items: ['messer', 'radio'] });
    assert.ok(await bis(() => x.startOffen === false), 'Wahl nicht angenommen');
    assert.ok(await bis(() => ok), 'keine Bestätigung');
    assert.equal(ok.zufall, 'verband');
    assert.equal(x.fk.s.zielen, 3); assert.equal(x.fk.s.tempo, 2); assert.equal(x.fk.bonus, 5);
    assert.equal(p.waffe, 'messer');
    assert.deepEqual([...p.rucksack], ['radio', 'verband']);
    assert.equal(FK.freiePunkte(x.fk), 0, 'Startpunkte sind verbraucht, keine Zusatzpunkte');
    // zweiter Versuch wirkt nicht
    a.send('startwahl', { punkte: { leben: 5 }, items: ['spritze', 'schluessel'] }); await warte(100);
    assert.equal(x.fk.s.leben, 0); assert.equal(x.fk.bonus, 5); assert.ok(!p.rucksack.includes('spritze'));
    assert.equal(FK.normiere(JSON.parse(JSON.stringify(x.fk))).s.zielen, 3);
  } finally { await a.leave(); }
});

test('Startausrüstung: Waffen in freie Waffenplätze, Armbrust mit 6 Pfeilen, Rest in den Rucksack, bei vollem Rucksack auf den Boden; Zufallspool ohne Missions-/Bundeswehr-Dinge', async () => {
  const a = await new Client(URL_).joinOrCreate('zombies', { name: 'Ausruestung' });
  try {
    const raum = matchMaker.getLocalRoomById(a.roomId);
    const p = raum.state.spieler.get(a.sessionId), x = raum.extra.get(a.sessionId);
    for (const d of FK.START_ZUFALL) assert.ok(DINGE[d] && !DINGE[d].mission && !d.startsWith('m_') && !['mg', 'gewehr', 'scharfschuetze'].includes(d), d);
    p.waffe = ''; p.munition = 0; p.pfeile = 0; p.lampe = 0; p.rucksack.splice(0); WP.leeren(p, x);
    raum.startGegenstand(p, 'schlaeger', x); assert.equal(p.waffe, 'schlaeger');
    raum.startGegenstand(p, 'armbrust', x);
    assert.equal(p.pfeile, 6);
    assert.ok([p.wp0, p.wp1].includes('armbrust') || p.waffe === 'armbrust', 'Armbrust nicht in einem Waffenplatz');
    assert.equal(p.rucksack.includes('armbrust'), false);
    raum.startGegenstand(p, 'taschenlampe', x); assert.ok(p.lampe > 0);
    raum.startGegenstand(p, 'spritze', x); assert.ok(p.rucksack.includes('spritze'));
    // voller Rucksack: Gegenstand liegt am Boden
    p.rucksack.splice(0, p.rucksack.length, ...Array(p.plaetze).fill('wasser'));
    const vor = raum.state.boden.size;
    raum.startGegenstand(p, 'radio', x);
    assert.equal(p.rucksack.length, p.plaetze); assert.equal(raum.state.boden.size, vor + 1);
    // Bots: zwei sinnvolle Gegenstände automatisch
    const bots = [...raum.extra.entries()].filter(([, e]) => e.bot);
    for (const [, e] of bots) { assert.equal(FK.punkteVerteilt(e.fk), 5); assert.equal(e.fk.bonus, 5); }
    assert.ok(FK.startItemsOk(FK.START_BOT_ITEMS));
  } finally { await a.leave(); }
});

test('Rucksack umsortieren: Tausch, Verschieben ans Ende, Grenzen', async () => {
  const a = await new Client(URL_).joinOrCreate('zombies', { name: 'Sortierer' });
  try {
    const raum = matchMaker.getLocalRoomById(a.roomId);
    const p = raum.state.spieler.get(a.sessionId);
    const setze = () => { p.rucksack.splice(0, p.rucksack.length, 'wasser', 'essen', 'verband', 'radio'); };
    const sende = async m => { a.send('rucksack_tausch', m); await warte(60); };
    setze(); await sende({ von: 0, nach: 2 }); assert.deepEqual([...p.rucksack], ['verband', 'essen', 'wasser', 'radio']);
    setze(); await sende({ von: 1, nach: 0 }); assert.deepEqual([...p.rucksack], ['essen', 'wasser', 'verband', 'radio']);
    setze(); await sende({ von: 0, nach: 6 }); assert.deepEqual([...p.rucksack], ['essen', 'verband', 'radio', 'wasser'], 'leeres Ziel: ans Ende');
    // ungültig: nichts ändert sich
    for (const m of [{ von: 4, nach: 0 }, { von: -1, nach: 0 }, { von: 0, nach: -1 }, { von: 0, nach: p.plaetze }, { von: 0, nach: 99 }, { von: 1.5, nach: 0 }, { von: '0', nach: 1 }, { von: 2, nach: 2 }, {}, { von: null, nach: 0 }]) {
      setze(); await sende(m); assert.deepEqual([...p.rucksack], ['wasser', 'essen', 'verband', 'radio'], JSON.stringify(m));
    }
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

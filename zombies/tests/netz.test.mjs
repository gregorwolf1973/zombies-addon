// Netz-Umbau 0.58: Eingaben mit Nummer und Dauer (kein Zurückziehen nach Hängern), Zombies/Bewohner nur im Bildausschnitt,
// kompakte Felder, Glättung im Client (client/netzpuffer.mjs)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { matchMaker } from '@colyseus/core';
import { Client } from '@colyseus/sdk';
import { starte } from '../server/index.mjs';
import { NetzPuffer, nachSeq, ausStufe } from '../client/netzpuffer.mjs';
import { frei, WERTE as W } from '../client/welt.mjs';
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

// freie, gerade Strecke nach rechts suchen (damit Wände die Wegmessung nicht verfälschen)
function freieStrecke(raum, laenge) {
  const welt = raum.welt;
  for (let y = 200; y < 1400; y += 24) for (let x = 200; x < 1400; x += 24) {
    let ok = true;
    for (let d = 0; d <= laenge && ok; d += 4) ok = frei(welt, x + d, y, W.spielerRadius + 2);
    if (ok) return { x, y };
  }
  return null;
}

test('Eingabe-Stücke: Server läuft genau die gemeldete Dauer, bestätigt die Nummer und holt Hänger nach', async () => {
  const a = await new Client(URL_).joinOrCreate('zombies', { name: 'Netz' });
  a.onMessage('*', () => {});
  try {
    const raum = matchMaker.getLocalRoomById(a.roomId);
    assert.ok(await bis(() => raum.state.spieler.get(a.sessionId)));
    const p = raum.state.spieler.get(a.sessionId);
    const ort = freieStrecke(raum, 260);
    assert.ok(ort, 'keine freie Strecke');
    raum.state.zombies.clear(); raum.zombieInfo.clear();
    p.x = ort.x; p.y = ort.y; p.ebene = ''; p.infektion = 0; p.zombie = 0; p.unten = false; p.waffe = ''; p.rucksack.clear();
    await warte(150);
    const x0 = p.x;
    // 10 Stücke à 0,05 s auf einmal (wie nach einem Netz-Hänger): alles wird nachgeholt
    for (let n = 1; n <= 10; n++) a.send('eingabe', { dx: 1, dy: 0, s: false, n, d: 0.05 });
    assert.ok(await bis(() => p.seq === 10, 3000), 'Nummer nicht bestätigt: ' + p.seq);
    const weg = p.x - x0;
    const soll = W.tempoGehen * 0.5 * (raum.fkWert?.(p, 'tempo') ?? 1);
    assert.ok(Math.abs(weg - soll) < soll * 0.08, `Weg ${weg.toFixed(1)} statt ${soll.toFixed(1)}`);
    // danach steht die Figur (keine Eingabe = kein Weiterlaufen)
    const x1 = p.x; await warte(300);
    assert.ok(Math.abs(p.x - x1) < 0.5, 'Figur läuft ohne Eingabe weiter');
    // Schummeln: viel mehr Dauer als vergangene Zeit wird höchstens mit Echtzeit (Guthaben) abgearbeitet
    p.x = ort.x;
    const t0 = Date.now();
    for (let n = 11; n <= 60; n++) a.send('eingabe', { dx: 1, dy: 0, s: false, n, d: 0.25 });   // 12,5 s „gelaufen“
    await warte(400);
    const vergangen = (Date.now() - t0) / 1000 + 1.6;   // + höchstens EINGABE_GUTHABEN_MAX aus der Wartezeit davor
    assert.ok(p.x - ort.x <= W.tempoGehen * vergangen * (raum.fkWert?.(p, 'tempo') ?? 1) + 2, 'schneller als erlaubt');
    // alte Form ohne n/d gilt weiter (Tests, Bots, ältere Clients)
    raum.extra.get(a.sessionId).warte = null;
    const x2 = p.x;
    a.send('eingabe', { dx: -1, dy: 0, s: false });
    assert.ok(await bis(() => p.x < x2 - 15), 'alte Eingabe bewegt nicht');
    a.send('eingabe', { dx: 0, dy: 0, s: false });
  } finally { await a.leave(); }
});

test('Am Boden werden wartende Eingaben verworfen und bestätigt (kein Losrennen beim Aufstehen)', async () => {
  const a = await new Client(URL_).joinOrCreate('zombies', { name: 'Liegt' });
  a.onMessage('*', () => {});
  try {
    const raum = matchMaker.getLocalRoomById(a.roomId);
    assert.ok(await bis(() => raum.state.spieler.get(a.sessionId)));
    const p = raum.state.spieler.get(a.sessionId);
    p.unten = true;
    for (let n = 1; n <= 5; n++) a.send('eingabe', { dx: 1, dy: 0, s: false, n, d: 0.2 });
    assert.ok(await bis(() => p.seq === 5), 'nicht bestätigt');
    assert.equal(raum.extra.get(a.sessionId).warte.length, 0);
    p.unten = false; p.hp = 100;
  } finally { await a.leave(); }
});

test('Zombies und Bewohner: der Client bekommt nur die in seinem Ausschnitt, die Gesamtzahl kommt extra', async () => {
  const a = await new Client(URL_).joinOrCreate('zombies', { name: 'Sicht' });
  a.onMessage('*', () => {});
  try {
    const raum = matchMaker.getLocalRoomById(a.roomId);
    assert.ok(await bis(() => raum.state.spieler.get(a.sessionId)));
    const p = raum.state.spieler.get(a.sessionId);
    p.x = 600; p.y = 600; p.ebene = '';
    a.send('sicht', { w: 400, h: 300 });
    await warte(150);
    raum.state.zombies.clear(); raum.zombieInfo.clear();
    raum.zombiesAuffuellen = () => {};   // keine neuen Zombies dazwischen
    const nah = raum.setzeZombie(700, 650, ''), fern = raum.setzeZombie(600 + 400 + 260 + 400, 600, ''), drinnen = raum.setzeZombie(620, 610, 'h1eg');
    for (const id of [nah, fern, drinnen]) { const i = raum.zombieInfo.get(id); if (i) { i.schlaeft = true; i.steht = true; } }
    assert.ok(await bis(() => a.state.zombies.has(nah)), 'naher Zombie fehlt');
    await warte(300);
    assert.ok(!a.state.zombies.has(fern), 'ferner Zombie wurde geschickt');
    assert.ok(!a.state.zombies.has(drinnen), 'Zombie auf anderer Ebene wurde geschickt');
    assert.ok(await bis(() => a.state.zombieZahl === raum.state.zombies.size), 'Gesamtzahl fehlt');
    // Richtung kommt in 256 Stufen
    const z = raum.state.zombies.get(nah); z.richtung = Math.PI / 2;
    raum.netzAbgleich();
    assert.ok(Math.abs(z.rq - 64) <= 1, "Richtung in Stufen " + z.rq);
    assert.ok(Math.abs(ausStufe(z.rq) - Math.PI / 2) < 0.03);
    assert.ok(await bis(() => a.state.zombies.get(nah)?.rq === raum.state.zombies.get(nah).rq), 'Richtung kommt nicht an');
    // Spieler geht hin: der ferne Zombie kommt dazu, der nahe fällt (mit Abstand) weg
    p.x = 600 + 400 + 260 + 400;
    assert.ok(await bis(() => a.state.zombies.has(fern) && !a.state.zombies.has(nah)), 'Sicht folgt dem Spieler nicht');
    // Positionen ganzzahlig, Server rechnet genau weiter
    raum.state.zombies.get(fern).x = 1660.7;
    assert.ok(await bis(() => a.state.zombies.get(fern)?.x === 1660));
    assert.equal(raum.state.zombies.get(fern).x, 1660.7);
  } finally { await a.leave(); }
});

test('Leichen: Alter bleibt auf dem Server, übertragen wird nur die Ausblendstufe', async () => {
  const a = await new Client(URL_).joinOrCreate('zombies', { name: 'Blass' });
  a.onMessage('*', () => {});
  try {
    const raum = matchMaker.getLocalRoomById(a.roomId);
    assert.ok(await bis(() => raum.state.spieler.get(a.sessionId) && a.state?.leichen), 'Zustand fehlt');
    const vorher = new Set(raum.state.leichen.keys());
    raum.neueLeiche({ x: 300, y: 300, richtung: 0, variante: 0, ebene: '' });
    const lid = [...raum.state.leichen.keys()].find(k => !vorher.has(k)), l = raum.state.leichen.get(lid);
    assert.ok(l, 'keine Leiche');
    assert.equal(l.blass, 0);
    l.alter = 175;   // noch 5 s
    raum.leichenAltern(0.05);
    assert.ok(l.blass >= 7, 'Ausblendstufe ' + l.blass);
    assert.ok(await bis(() => a.state.leichen.get(lid)?.blass === l.blass));
    assert.equal(a.state.leichen.get(lid).alter, undefined, 'Alter wird übertragen');
  } finally { await a.leave(); }
});

test('NetzPuffer: gleichmäßig zwischen Ständen, kurz weiterrechnen, Sprünge nicht gleiten', () => {
  const pf = new NetzPuffer(), z = { x: 0, y: 0 };
  // Stände alle 100 ms, sauber angekommen
  for (let i = 0; i <= 5; i++) { pf.patch(1000 + i * 100, 50000 + i * 100); pf.merke('a', i * 10, 0, 1000 + i * 100); }
  const rt = pf.zeit(50500);
  assert.ok(rt < 1500 && rt > 1500 - 500, 'Anzeigezeit ' + rt);
  assert.ok(pf.pos('a', 1250, z)); assert.equal(Math.round(z.x), 25);
  // über den letzten Stand hinaus: weich auslaufend, höchstens ca. 125 ms Wegstrecke
  pf.pos('a', 1500 + 1000, z); assert.ok(z.x > 50 && z.x <= 50 + 12.6, 'weitergerechnet ' + z.x);
  // Sprung (Ebenenwechsel): nicht gleiten
  pf.merke('b', 0, 0, 1000); pf.merke('b', 900, 0, 1100);
  pf.pos('b', 1050, z); assert.equal(z.x, 900);
  // unbekannt
  assert.equal(pf.pos('x', 1200, z), false);
  // verspätete Pakete vergrößern die Verzögerung
  const v0 = pf.verz;
  for (let i = 6; i < 30; i++) pf.patch(1000 + i * 100, 50000 + i * 100 + (i % 3 === 0 ? 300 : 0));
  assert.ok(pf.verz > v0 + 40, `Verzögerung passt sich nicht an (${v0} → ${pf.verz})`);
});

test('Simulation läuft in Echtzeit (Patch-Takt bremst die Zeitschritte nicht)', async () => {
  const a = await new Client(URL_).joinOrCreate('zombies', { name: 'Uhr' });
  a.onMessage('*', () => {});
  try {
    const raum = matchMaker.getLocalRoomById(a.roomId);
    // Gemessen ab dem ersten Schritt im Fenster: dessen dt enthält noch Zeit davor (auf langsamen Rechnern, z. B. GitHub-Runnern
    // mit 2 Kernen, nach Beitritt/Weltaufbau leicht 250 ms und mehr) und wird deshalb nicht mitgezählt.
    let summe = 0, erster = null, letzter = null, schritte = 0; const alt = raum.schritt.bind(raum);
    raum.schritt = dt => {
      const jetzt = performance.now();
      if (erster === null) erster = jetzt; else { summe += dt; schritte++; }
      letzter = jetzt;
      return alt(dt);
    };
    await warte(1500);
    raum.schritt = alt;
    const echt = (letzter - erster) / 1000;
    assert.ok(schritte >= 10 && echt > 0.9, `zu wenige Simulationsschritte: ${schritte} in ${echt.toFixed(2)} s`);
    assert.ok(summe > echt * 0.9 && summe < echt * 1.1, `Simulationszeit ${summe.toFixed(2)} s in ${echt.toFixed(2)} s`);
    // und etwa 10 Zustände je Sekunde
    let n = 0; const takt0 = a.state.takt; a.onStateChange(() => n++);
    await warte(1000);
    assert.ok(n >= 7 && n <= 13, n + ' Zustände je Sekunde');
    assert.ok(a.state.takt > takt0);
  } finally { await a.leave(); }
});

test('nachSeq rechnet mit Überlauf', () => {
  assert.equal(nachSeq(5, 4), true);
  assert.equal(nachSeq(4, 4), false);
  assert.equal(nachSeq(3, 4), false);
  assert.equal(nachSeq(1, 65535), true);
  assert.equal(nachSeq(65535, 1), false);
});

test('Eingabe-Rückstand: nach AFK verworfen, allgemein höchstens ~2 s (kein Zeitversatz bei Treffern)', async () => {
  const a = await new Client(URL_).joinOrCreate('zombies', { name: 'Rueck' });
  a.onMessage('*', () => {});
  try {
    const raum = matchMaker.getLocalRoomById(a.roomId);
    assert.ok(await bis(() => raum.state.spieler.get(a.sessionId)));
    const p = raum.state.spieler.get(a.sessionId), x = raum.extra.get(a.sessionId);
    // AFK-Bot übernimmt: Stand-Stücke laufen auf, bei der Rückkehr wird verworfen
    x.afkBot = { nr: 0, afk: true, plan: { rolle: 'begleiter', auftrag: null, pause: 0 } }; p.afk = true;
    for (let n = 1; n <= 60; n++) a.send('eingabe', { dx: 0, dy: 0, s: false, n, d: 0.25 });
    await warte(300);
    assert.ok((x.warte?.length ?? 0) > 20, 'Stücke sollten während AFK liegen bleiben: ' + x.warte?.length);
    a.send('eingabe', { dx: 1, dy: 0, s: false, n: 61, d: 0.05 });   // bewegt → ruehrt → AFK vorbei
    assert.ok(await bis(() => !x.afkBot && p.seq >= 60), 'AFK-Rückstand nicht verworfen, seq ' + p.seq);
    // allgemein: 6 s Schwall auf einmal → nach kurzer Zeit höchstens ~2 s offen
    for (let n = 62; n <= 181; n++) a.send('eingabe', { dx: 0, dy: 0, s: false, n, d: 0.05 });
    await warte(400);
    let rest = 0; for (const w of x.warte ?? []) rest += w.d;
    assert.ok(rest <= 2.05, `Rückstand ${rest.toFixed(2)} s`);
  } finally { await a.leave(); }
});

// Einsteigen in Evakuierungsfahrzeuge: wer an Bord ist, sitzt im Fahrzeug (Position folgt, Zombies lassen ihn in Ruhe), Meldung was fehlt,
// Aussteigen mit Meldung bei Abfahrt ohne Erfolg, Mitfahren bis zum Levelwechsel; Bots ebenso (server/aufgaben.mjs)
import { textAus } from '../server/texte.mjs';
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
import { BUS_ABSTAND, frei } from '../client/welt.mjs';
import { freierPort } from './hilfe.mjs';

const PORT = await freierPort();
const ordner = fs.mkdtempSync(path.join(os.tmpdir(), 'zombies-einsteigen-'));
let server;
const warte = ms => new Promise(r => setTimeout(r, ms));
async function bis(bedingung, ms = 4000) {
  const ende = Date.now() + ms;
  while (Date.now() < ende) { if (bedingung()) return true; await warte(20); }
  return bedingung();
}
before(async () => { server = await starte({ port: PORT, optionen: { karte: 'dorf' }, leise: true, datenbank: path.join(ordner, 'spiel.db') }); });
after(async () => { await server.gracefullyShutdown(false); fs.rmSync(ordner, { recursive: true, force: true }); });

// freier Punkt im Abstand d vom Fahrzeug (draußen, nicht im Haus)
const weitWeg = (raum, bus, d) => { for (let k = 0; k < 72; k++) { const w = k * Math.PI / 36, x = bus.x + Math.cos(w) * d, y = bus.y + Math.sin(w) * d; if (frei(raum.wv(''), x, y, 14)) return { x, y }; } throw new Error('kein freier Punkt'); };
const busVon = raum => [...raum.state.fahrzeuge.entries()].find(([, f]) => f.art === 'evakuierung');
// Raum mit gerufenem Evakuierungsbus; fn bekommt { c, raum, p, bus, id, meldungen, ag }
const mitBus = (aufgaben, fn, extra = {}) => async () => {
  assert.ok(await bis(() => !SpielRaum.aktiv, 3000), 'alter Raum lebt noch');
  SpielRaum.speicher.loescheWelt();
  const alt = SpielRaum.einstellungen;
  SpielRaum.einstellungen = { ...alt, ...extra };
  const c = await new Client(`http://127.0.0.1:${PORT}`).joinOrCreate('zombies', { name: 'Fahrgast', spielerId: crypto.randomBytes(16).toString('hex') });
  const raum = matchMaker.getLocalRoomById(c.roomId);
  try {
    raum.zombieFaktor = 0; raum.state.zombies.clear(); raum.zombieInfo.clear();
    const meldungen = []; c.onMessage('meldung', m => meldungen.push(textAus(m)));
    const ag = raum.aufgaben; ag.alleBordSek = 0.3;   // sonst 10 s Restwartezeit, wenn alle an Bord sind
    raum.state.aufgaben.clear(); for (const id of aufgaben) ag.neu(id, false); ag.aktualisieren(false);
    const p = raum.state.spieler.get(c.sessionId);
    ag.funkAbsetzen(p, raum.welt.safeRooms[0]);
    raum.state.uhr = 18 * 60 + 0.1;
    assert.ok(await bis(() => busVon(raum)), 'kein Bus');
    const [id, bus] = busVon(raum);
    assert.ok(await bis(() => raum.state.busSteht, 8000), 'Bus steht nicht');
    await fn({ c, raum, p, bus, id, meldungen, ag });
  } finally { await c.leave(); await bis(() => !SpielRaum.aktiv, 3000); SpielRaum.einstellungen = alt; }
};

test('Einsteigen mit offenen Aufgaben: sitzt im Fahrzeug, Meldung nennt, was fehlt, Zombies und Eingabe ändern nichts', mitBus(['funk', 'tor', 'zombies', 'lampen'], async ({ raum, p, bus, meldungen, ag }) => {
  assert.equal(ag.fahrtGelingt(), false);
  p.ebene = ''; p.x = bus.x + BUS_ABSTAND - 10; p.y = bus.y;
  assert.ok(await bis(() => p.anBord), 'steigt nicht ein');
  assert.ok(await bis(() => meldungen.some(m => m.includes('an Bord') && m.includes('es fehlt'))), 'Meldung „was fehlt“ fehlt: ' + meldungen.join(' | '));
  assert.ok(Math.hypot(p.x - bus.x, p.y - bus.y) < 1, 'Position folgt dem Fahrzeug nicht');
  assert.equal(raum.state.busBord, 1);
  // das Fahrzeug bewegt sich: der Fahrgast bleibt drin, auch ohne dass die Fahrt gelingt
  bus.x += 40; bus.y += 10;
  await warte(200);
  assert.ok(p.anBord && Math.hypot(p.x - bus.x, p.y - bus.y) < 1, 'folgt dem bewegten Fahrzeug nicht');
  // Eingabe wird ignoriert
  raum.extra.get([...raum.state.spieler.keys()][0]).eingabe = { dx: 1, dy: 0, s: false };
  await warte(300);
  assert.ok(Math.hypot(p.x - bus.x, p.y - bus.y) < 1, 'läuft aus dem Fahrzeug');
  // Zombies lassen ihn in Ruhe
  ag.evakTrefferChance = 0;   // der Bus schießt sonst den Zombie ab
  const hp = p.hp, zid = raum.setzeZombie(bus.x + 6, bus.y, ''); raum.zombieInfo.get(zid).steht = false;
  await warte(1500);
  assert.equal(p.hp, hp, 'Zombie beißt Fahrgast');
  assert.equal(raum.zombieInfo.get(zid).ziel, null, 'Zombie jagt Fahrgast');
}));

test('Abfahrt ohne Erfolg: Fahrgäste steigen mit Meldung aus (nichts wird still verworfen)', mitBus(['funk', 'tor', 'zombies', 'lampen'], async ({ raum, p, bus, meldungen, ag }) => {
  p.ebene = ''; p.x = bus.x; p.y = bus.y;
  assert.ok(await bis(() => p.anBord));
  ag.busRest = 0.05;
  assert.ok(await bis(() => !p.anBord, 3000), 'steigt nicht aus');
  assert.ok(await bis(() => meldungen.some(m => m.includes('steigt') && m.includes('fehlte'))), 'Aussteig-Meldung fehlt: ' + meldungen.join(' | '));
  assert.ok(Math.hypot(p.x - bus.x, p.y - bus.y) < 150, 'steht nicht neben dem Fahrzeug');
}));

test('Abfahrt mit Erfolg: Fahrgast fährt mit dem abfahrenden Fahrzeug bis zum Levelwechsel, danach nicht mehr an Bord', mitBus(['funk'], async ({ raum, p, bus, id, ag }) => {
  assert.equal(ag.fahrtGelingt(), true);
  let gewechselt = false;
  p.ebene = ''; p.x = bus.x; p.y = bus.y;
  raum.weltNeuStarten = () => { gewechselt = true; };
  ag.wechselVerzoegerung = 200;
  assert.ok(await bis(() => p.anBord || ag.wechselLaeuft, 2000));
  assert.ok(await bis(() => ag.wechselLaeuft, 4000), 'keine Abfahrt');
  assert.ok(p.anBord, 'nicht mehr an Bord nach der Abfahrt');
  assert.ok(await bis(() => gewechselt, 3000), 'kein Levelwechsel');
  assert.equal(p.anBord, false, 'anBord nach dem Levelwechsel nicht zurückgesetzt');
}));

test('Einsteigen nach der Abfahrt: der Bus rollt langsam, wer ihn noch erreicht, fährt mit', mitBus(['funk'], async ({ raum, p, bus, ag }) => {
  assert.equal(ag.fahrtGelingt(), true);
  raum.weltNeuStarten = () => {};
  ag.wechselVerzoegerung = 4000;
  raum.verkehr.evakuierungAb = id => { raum.verkehr.info.get(id).abfahrt = true; raum.state.fahrzeuge.get(id).haelt = false; };   // Testkarte ohne Straßennetz: Bus bleibt als „abfahrend“ stehen
  p.ebene = ''; p.x = bus.x; p.y = bus.y;   // ein Mitfahrer sorgt für die erfolgreiche Abfahrt ...
  assert.ok(await bis(() => p.anBord, 2000));
  ag.busRest = 0.05;
  assert.ok(await bis(() => ag.wechselLaeuft, 4000), 'keine Abfahrt');
  // ... der Nachzügler (hier derselbe Spieler, nachträglich ausgebucht) war bei der Abfahrt nicht an Bord
  ag.eingestiegen.delete(p.id ?? [...raum.state.spieler.keys()][0]); p.anBord = false;
  { const w = weitWeg(raum, bus, 300); p.x = w.x; p.y = w.y; }
  await new Promise(r => setTimeout(r, 300));
  assert.equal(p.anBord, false);
  const f = raum.state.fahrzeuge.get(ag.folgenId);
  assert.ok(f, 'Bus nach der Abfahrt weg');
  p.x = f.x + 20; p.y = f.y;
  assert.ok(await bis(() => p.anBord, 2000), 'Aufspringen nach der Abfahrt klappt nicht');
  assert.ok(Math.hypot(p.x - f.x, p.y - f.y) < 1, 'fährt nicht mit');
}));

test('Bots steigen ebenso ein und sitzen still', mitBus(['funk', 'tor', 'zombies', 'lampen'], async ({ raum, p, bus }) => {
  const bots = [...raum.state.spieler.entries()].filter(([sid]) => raum.extra.get(sid)?.bot);
  assert.ok(bots.length >= 1, 'keine Bots im Raum');
  const [, b] = bots[0];
  b.ebene = ''; b.x = bus.x + 20; b.y = bus.y;
  assert.ok(await bis(() => b.anBord), 'Bot steigt nicht ein');
  await warte(600);
  assert.ok(b.anBord && Math.hypot(b.x - bus.x, b.y - bus.y) < 1, 'Bot sitzt nicht still im Fahrzeug');
}, { bots: 2 }));

test('Aussteigen jederzeit, solange das Fahrzeug steht: Knopf und Aktionstaste, Platz daneben, Schonzeit, kein sofortiges Wiedereinsteigen', mitBus(['funk', 'tor', 'zombies', 'lampen'], async ({ c, raum, p, bus, ag, meldungen }) => {
  p.ebene = ''; p.x = bus.x; p.y = bus.y;
  assert.ok(await bis(() => p.anBord), 'steigt nicht ein');
  c.send('aussteigen'); await warte(300);
  assert.equal(p.anBord, true, 'Fehlbedienung: sofortiges Aussteigen wirft raus');
  ag.einstiegT.clear(); c.send('aussteigen');
  assert.ok(await bis(() => !p.anBord), 'Knopf „Aussteigen“ wirkt nicht');
  const d = Math.hypot(p.x - bus.x, p.y - bus.y);
  assert.ok(d > 20 && d < BUS_ABSTAND + 150, 'Ausstieg nicht neben dem Fahrzeug: ' + d);   // freie Stelle in der Nähe (Hindernisse verschieben sie)
  assert.ok(raum.extra.get([...raum.state.spieler.keys()][0]).schonT > 0, 'keine Schonzeit gegen Zombies');
  await warte(600);
  assert.equal(p.anBord, false, 'steigt sofort wieder ein');
  assert.ok(meldungen.some(m => m.includes('ausgestiegen')));
  // weg und wieder hin: darf wieder einsteigen; Aktionstaste steigt ebenfalls aus
  { const w = weitWeg(raum, bus, 250); p.x = w.x; p.y = w.y; }
  await warte(500);
  assert.ok(await bis(() => { p.ebene = ''; p.x = bus.x; p.y = bus.y; return p.anBord; }, 8000), 'steigt nicht wieder ein');
  ag.einstiegT.clear(); c.send('aktion');
  assert.ok(await bis(() => !p.anBord), 'Aktionstaste steigt nicht aus');
  // fährt das Fahrzeug (nicht stehend), geht Aussteigen nicht
  { const w = weitWeg(raum, bus, 250); p.x = w.x; p.y = w.y; }
  await warte(500);
  assert.ok(await bis(() => { p.ebene = ''; p.x = bus.x; p.y = bus.y; return p.anBord; }, 8000));
  raum.state.busSteht = false; ag.eingestiegen.add([...raum.state.spieler.keys()][0]);
  ag.einstiegT.clear(); c.send('aussteigen'); await warte(300);
  assert.equal(p.anBord, true, 'ausgestiegen während der Fahrt');
}));

test('Tote/liegende Bots blockieren die Abfahrt nie: Spieler an Bord, alles erledigt → Abfahrt sofort; sonst nach der Wartezeit mit Aussteigen', mitBus(['funk'], async ({ raum, p, bus, ag }) => {
  for (const [sid, q] of raum.state.spieler) if (raum.extra.get(sid)?.bot) { q.unten = true; q.hp = 0; q.x = bus.x + 900; q.y = bus.y; }
  let gewechselt = false; raum.weltNeuStarten = () => { gewechselt = true; }; ag.wechselVerzoegerung = 100;
  p.ebene = ''; p.x = bus.x; p.y = bus.y;
  assert.ok(await bis(() => ag.wechselLaeuft, 4000), 'liegende Bots halten die Abfahrt auf');
  assert.ok(await bis(() => gewechselt, 3000));
}, { bots: 3 }));

test('Gregors Fall: Spieler an Bord, Aufgaben offen, Bots tot → wartet, nach Ablauf der Wartezeit fährt er ab und setzt alle ab', mitBus(['funk', 'tor', 'zombies', 'lampen'], async ({ raum, p, bus, ag, meldungen }) => {
  for (const [sid, q] of raum.state.spieler) if (raum.extra.get(sid)?.bot) { q.unten = true; q.hp = 0; q.x = bus.x + 900; q.y = bus.y; }
  p.ebene = ''; p.x = bus.x; p.y = bus.y;
  assert.ok(await bis(() => p.anBord));
  await warte(800);
  assert.ok(p.anBord && raum.state.busDa, 'fährt vorzeitig ab');
  assert.equal(raum.state.busBord, 1);
  ag.busRest = 0.05;
  assert.ok(await bis(() => !raum.state.busDa && !p.anBord, 3000), 'fährt nach Ablauf der Wartezeit nicht ab / setzt nicht ab');
  assert.ok(await bis(() => meldungen.some(m => m.includes('fehlte'))));
}, { bots: 3 }));

test('Alle an Bord und Aufgaben geschafft (Vorgabe alleBordSek = 0): Abfahrt sofort, Meldung „Abfahrt!“ statt Countdown', mitBus(['funk'], async ({ raum, p, bus, ag, meldungen }) => {
  ag.alleBordSek = 0;
  assert.equal(new ag.constructor(raum).alleBordSek, 0, 'Vorgabe nicht 0');
  for (const [sid, q] of raum.state.spieler) if (raum.extra.get(sid)?.bot) { q.unten = true; q.hp = 0; q.x = bus.x + 900; q.y = bus.y; }
  assert.ok(ag.busRest > 30, 'Wartezeit schon kurz: ' + ag.busRest);
  let gewechselt = false; raum.weltNeuStarten = () => { gewechselt = true; }; ag.wechselVerzoegerung = 100;
  p.ebene = ''; p.x = bus.x; p.y = bus.y;
  assert.ok(await bis(() => p.anBord), 'steigt nicht ein');
  assert.ok(await bis(() => ag.wechselLaeuft, 3000), 'fährt nicht sofort los, Rest ' + ag.busRest);
  assert.ok(await bis(() => meldungen.some(m => m.includes('Alle an Bord – Abfahrt!'))), 'Meldung fehlt: ' + meldungen.join(' | '));
  assert.ok(!meldungen.some(m => m.includes(' in 0 s') || m.includes(' in 1 s')), 'Countdown-Meldung');
}, { bots: 2 }));

test('Alle an Bord und Aufgaben geschafft: Wartezeit läuft auf höchstens 10 s herunter, Meldung an alle, dann fährt er sofort', mitBus(['funk'], async ({ raum, p, bus, ag, meldungen }) => {
  ag.alleBordSek = 10;
  for (const [sid, q] of raum.state.spieler) if (raum.extra.get(sid)?.bot) { q.unten = true; q.hp = 0; q.x = bus.x + 900; q.y = bus.y; }
  assert.ok(ag.busRest > 30, 'Wartezeit schon kurz: ' + ag.busRest);
  assert.equal(ag.fahrtGelingt(), true);
  let gewechselt = false; raum.weltNeuStarten = () => { gewechselt = true; }; ag.wechselVerzoegerung = 100;
  p.ebene = ''; p.x = bus.x; p.y = bus.y;
  assert.ok(await bis(() => p.anBord), 'steigt nicht ein');
  assert.ok(await bis(() => meldungen.some(m => m.includes('Alle an Bord – Abfahrt in 10 s'))), 'Meldung fehlt: ' + meldungen.join(' | '));
  assert.ok(ag.busRest <= 10, 'Wartezeit nicht gekürzt: ' + ag.busRest);
  assert.equal(raum.state.busDa, true, 'fährt ohne die 10 s los');
  ag.busRest = 0.05;   // die 10 s „abgelaufen“
  assert.ok(await bis(() => ag.wechselLaeuft, 3000), 'fährt nach Ablauf nicht los');
  assert.equal(meldungen.filter(m => m.includes('Alle an Bord')).length, 1, 'Meldung mehrfach');
}, { bots: 2 }));

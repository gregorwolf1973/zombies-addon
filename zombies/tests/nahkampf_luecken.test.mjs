import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { matchMaker } from '@colyseus/core';
import { Client } from '@colyseus/sdk';
import { starte } from '../server/index.mjs';
import { freierPort } from './hilfe.mjs';

const PORT = await freierPort();
const URL_ = `http://127.0.0.1:${PORT}`;
let server;
before(async () => { server = await starte({ port: PORT, optionen: { karte: 'dorf' }, leise: true, datenbank: ':memory:' }); });
after(async () => { await server.gracefullyShutdown(false); });

// Raum mit einem Spieler und genau einem ruhig stehenden Zombie im Abstand d
async function aufbau(name, d, mod) {
  const a = await new Client(URL_).joinOrCreate('zombies', { name });
  const raum = matchMaker.getLocalRoomById(a.roomId);
  raum.zombieFaktor = 0; raum.kriecherChance = 0;
  raum.state.zombies.clear(); raum.zombieInfo.clear();
  const p = raum.state.spieler.get(a.sessionId), x = raum.extra.get(a.sessionId);
  p.ebene = ''; p.aktion = ''; p.sicher = ''; x.pause = 0; x.feuerAus = false;
  p.waffe = 'pistole'; p.wp0 = 'pistole'; p.wp1 = ''; p.wplatz = 0; p.faust = false; p.munition = 100; p.magazin = 10; p.nachladen = 0; x.mag = [{ waffe: 'pistole', n: 10 }, null]; x.nRest = 0;
  raum.neuerZombie(0);
  const [zid, z] = [...raum.state.zombies.entries()][0];
  z.x = p.x + d; z.y = p.y; z.hp = 1000;
  const info = raum.zombieInfo.get(zid); info.steht = true; info.wechsel = 99;
  raum.rnd = () => 0;
  mod?.(raum, p, x, z, zid, info);
  const schritt = (dt = 0.02) => raum.waffeSchritt(a.sessionId, p, x, dt, raum.wv(p.ebene), false);
  return { a, raum, p, x, z, zid, info, schritt };
}

test('1: leeres Magazin / Nachladen: Zombie in 1,5 m wird gestoßen statt nichts zu tun', async () => {
  const t = await aufbau('Nachladen', 12, (r, p) => { p.magazin = 0; p.nachladen = 0.3; });
  try {
    t.p.munition = 20; t.p.magazin = 0; t.x.mag[0].n = 0; t.p.nachladen = 0.3; t.x.nRest = 2; t.x.nDauer = 4;
    t.z.x = t.p.x + 100;
    t.schritt(); assert.equal(t.z.hp, 1000, 'zu weit weg: kein Stoß');
    t.z.x = t.p.x + 12; t.z.hp = 1000;
    const hp0 = t.z.hp; t.schritt();
    assert.ok(t.z.hp < hp0, 'Faust-Stoß beim Nachladen');
    assert.ok(t.p.nachladen > 0, 'Nachladen läuft weiter');
  } finally { await t.a.leave(); }
});

test('1b: automatisch nachladen im ruhigen Moment (Magazin < 50 %), nicht bei jagendem Zombie', async () => {
  const t = await aufbau('Auto', 400);
  try {
    t.p.magazin = 3; t.x.mag[0].n = 3; t.p.nachladen = 0; t.p.munition = 50;
    t.schritt(); assert.ok(t.p.nachladen > 0, 'ruhig: lädt von selbst nach');
    t.p.nachladen = 0; t.x.nRest = 0; t.p.magazin = 3; t.x.mag[0].n = 3;
    t.z.x = t.p.x + 60; t.z.jagt = true;
    t.schritt(); assert.equal(t.p.nachladen, 0, 'jagender Zombie < 15 m: nicht nachladen');
  } finally { await t.a.leave(); }
});

test('2: Durchsuchen + naher Zombie: Aktion abgebrochen, geschossen', async () => {
  const t = await aufbau('Durchsuchen', 14);
  try {
    t.p.aktion = 'durchsuchen'; t.p.fortschritt = 0.4; t.x.aktionZiel = { art: 'durchsuchen' };
    const hp0 = t.z.hp, mag0 = t.p.magazin;
    t.schritt();
    assert.equal(t.p.aktion, ''); assert.equal(t.x.aktionZiel, null);
    assert.ok(t.z.hp < hp0 && t.p.magazin < mag0, 'schießt nach dem Abbruch');
  } finally { await t.a.leave(); }
});

test('2b: Zombie weit weg und nicht jagend: Durchsuchen läuft weiter', async () => {
  const t = await aufbau('Ruhe', 300);
  try {
    t.p.aktion = 'durchsuchen'; t.x.aktionZiel = { art: 'durchsuchen' };
    t.schritt(); assert.equal(t.p.aktion, 'durchsuchen');
  } finally { await t.a.leave(); }
});

test('3: Pause nach Schuss auf fernes Ziel wird bei nahem Zombie auf 0,5 s gekappt', async () => {
  const t = await aufbau('Pause', 14);
  try {
    t.x.pause = 2.8; t.x.pauseFern = true;
    t.schritt(0.02);
    assert.ok(t.x.pause <= 0.5, 'Restpause gekappt: ' + t.x.pause);
    t.x.pause = 2.8; t.x.pauseFern = false; t.schritt(0.02);
    assert.ok(t.x.pause > 2, 'nach Schuss auf nahes Ziel keine Kappung');
  } finally { await t.a.leave(); }
});

test('3b: Zielwahl: nahe Zombie (< 3 m) vor fernerem', async () => {
  const t = await aufbau('Prio', 100);
  try {
    raumNeu(t, 14);
    const hpFern = t.z.hp, hpNah = t.nah.hp;
    t.schritt();
    assert.ok(t.nah.hp < hpNah && t.z.hp === hpFern, 'nächster Zombie getroffen');
  } finally { await t.a.leave(); }
});
function raumNeu(t, d) {
  const r0 = t.raum.rnd; t.raum.rnd = Math.random;
  t.raum.neuerZombie(0);
  const [zid, z] = [...t.raum.state.zombies.entries()].find(([k]) => k !== t.zid);
  z.x = t.p.x + d; z.y = t.p.y; z.hp = 1000;
  const info = t.raum.zombieInfo.get(zid); info.steht = true; info.wechsel = 99;
  t.nah = z; t.raum.rnd = r0;
}

test('4: Handgranate in der Hand: Zombie nah -> Faust-Stoß; anderer Platz mit Pistole wird gewählt', async () => {
  const t = await aufbau('Granate', 14);
  try {
    t.p.waffe = 'handgranate'; t.p.wp0 = 'handgranate'; t.x.mag[0] = { waffe: 'handgranate', n: 1 }; t.p.magazin = 1;
    t.schritt();
    assert.ok(t.z.hp < 1000, 'Stoß mit der Faust');
    // Zombie in 5 m, jagt: andere Waffe nehmen
    t.x.pause = 0; t.z.hp = 1000; t.z.x = t.p.x + 40; t.z.jagt = true; t.info.ziel = t.a.sessionId;
    t.p.wp1 = 'pistole'; t.x.mag[1] = { waffe: 'pistole', n: 8 }; t.p.munition = 50;
    t.schritt();
    assert.equal(t.p.wplatz, 1, 'auf den anderen Waffenplatz gewechselt');
  } finally { await t.a.leave(); }
});

test('5: Feuerknopf: kurzer Tipper zwischen zwei Ticks zählt als ein Schuss', async () => {
  const t = await aufbau('Tipper', 14);
  try {
    const cl = { sessionId: t.a.sessionId };
    t.raum.eingabeEmpfangen(cl, { dx: 0, dy: 0, f: false });
    t.schritt(); assert.equal(t.z.hp, 1000, 'Knopf nicht gedrückt: kein Schuss');
    t.raum.eingabeEmpfangen(cl, { dx: 0, dy: 0, f: true });
    t.raum.eingabeEmpfangen(cl, { dx: 0, dy: 0, f: false });   // schon wieder los
    t.schritt(); assert.ok(t.z.hp < 1000, 'Tipper löst einen Schuss aus');
    t.x.pause = 0; const hp = t.z.hp; t.schritt(); assert.equal(t.z.hp, hp, 'nur ein Schuss');
  } finally { await t.a.leave(); }
});

test('6: Zaunsprung: Schuss auch während des Sprungs', async () => {
  const t = await aufbau('Sprung', 14);
  try {
    t.x.sprungT = 0.3;
    t.raum.spielerSchritt(t.a.sessionId, t.p, t.x, 0.02);
    assert.ok(t.z.hp < 1000 || t.p.magazin < 10, 'schießt im Sprung');
  } finally { await t.a.leave(); }
});

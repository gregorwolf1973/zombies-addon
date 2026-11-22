// Backend-Einstellung zombieSicht: Validierung, Grundwerte = altes Verhalten, Wirkung im Raum, Nachtfaktor
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { matchMaker } from '@colyseus/core';
import { Client } from '@colyseus/sdk';
import { starte } from '../server/index.mjs';
import { SpielRaum } from '../server/raum.mjs';
import { bereinige } from '../server/einstellungen.mjs';
import { WERTE as W, KACHEL, setzeKartengroesse, frei, sichtGuete } from '../client/welt.mjs';
import { sichtPx, SICHT_VORGABE } from '../client/zombiesicht.mjs';
import { freierPort } from './hilfe.mjs';

test('Grundwerte entsprechen exakt dem alten festen Verhalten', () => {
  const s = sichtPx(undefined, 720);
  assert.equal(s.gehen, W.sichtWeite); assert.equal(s.schleichen, W.sichtWeiteSchleichen);
  assert.equal(s.verfolgen, W.sichtWeite * 1.6); assert.equal(s.aufgeben, W.sichtWeite * 3); assert.equal(s.winkel, W.sichtWinkel);
  assert.deepEqual(sichtPx(SICHT_VORGABE, 0), sichtPx(undefined, 720), 'Nachtfaktor 100 % ändert nichts');
});

test('Validierung: Grenzen, Standard, Teilangaben verschmelzen', () => {
  assert.deepEqual(bereinige({}).zombieSicht, SICHT_VORGABE);
  const e = bereinige({ zombieSicht: { gehen: 999, schleichen: 'x', kegel: 1, nacht: 50 } });
  assert.equal(e.zombieSicht.gehen, 80); assert.equal(e.zombieSicht.schleichen, 12); assert.equal(e.zombieSicht.kegel, 20); assert.equal(e.zombieSicht.nacht, 50);
  assert.equal(bereinige({ zombieSicht: { gehen: 15 } }, e).zombieSicht.nacht, 50, 'alte Werte bleiben');
});

test('Nachtfaktor skaliert mit der Dunkelheit', () => {
  const ein = { ...SICHT_VORGABE, nacht: 50 };
  assert.equal(sichtPx(ein, 720).gehen, W.sichtWeite);                 // Tag: unverändert
  assert.equal(sichtPx(ein, 0).gehen, W.sichtWeite * 0.5);             // tiefe Nacht: halbiert
  assert.equal(sichtPx(ein, 0).verfolgen, W.sichtWeite * 1.6 * 0.5);
  assert.equal(sichtPx(ein, 0).aufgeben, W.sichtWeite * 3, 'Aufgeben bleibt');
});

const PORT = await freierPort();
let server;
before(async () => { server = await starte({ port: PORT, optionen: { karte: 'geretsried' }, leise: true, datenbank: ':memory:' }); });
after(async () => { SpielRaum.einstellungen.zombieSicht = undefined; await server.gracefullyShutdown(false); setzeKartengroesse(64, 48); });

async function bemerkt(einst, abstandM, uhr) {
  SpielRaum.speicher.loescheWelt();
  const c = await new Client(`http://127.0.0.1:${PORT}`).joinOrCreate('zombies', { name: 'Sicht', spielerId: crypto.randomBytes(16).toString('hex'), seed: 7 });
  try {
    const raum = matchMaker.getLocalRoomById(c.roomId);
    raum.zombieFaktor = 0; raum.state.zombies.clear(); raum.zombieInfo.clear();
    raum.welle.schritt = () => {};
    raum.extra.get(c.sessionId).pause = 1e6;
    SpielRaum.einstellungen.zombieSicht = einst;
    raum.state.uhr = uhr;
    const p = raum.state.spieler.get(c.sessionId), d = abstandM * 8;
    // freie, gerade Strecke nach rechts mit voller Sicht suchen
    let s = null;
    for (let y = 8 * KACHEL; y < 40 * KACHEL && !s; y += KACHEL) for (let x = 8 * KACHEL; x < 40 * KACHEL && !s; x += KACHEL) {
      if (frei(raum.welt, x, y, 11) && frei(raum.welt, x + d, y, 11) && sichtGuete(raum.welt, x, y, x + d, y) === 1) s = { x, y };
    }
    assert.ok(s, 'freie Strecke gefunden');
    p.x = s.x + d; p.y = s.y;
    const id = raum.setzeZombie(s.x, s.y, ''), z = raum.state.zombies.get(id), info = raum.zombieInfo.get(id);
    info.schlaeft = false; info.steht = false; info.ziel = null; info.punkt = null; info.wechsel = 50; info.bleibt = true;
    z.richtung = 0;
    raum.zombieSchritt(id, z, 0.05);
    return !!info.ziel;
  } finally { await c.leave(); }
}

test('Gehen 15 m: Spieler bei 18 m wird nicht entdeckt, bei Grundwert 21 m schon', async () => {
  assert.equal(await bemerkt({ ...SICHT_VORGABE, gehen: 15 }, 18, 720), false);
  assert.equal(await bemerkt(undefined, 18, 720), true);
  assert.equal(await bemerkt({ ...SICHT_VORGABE, gehen: 25 }, 23, 720), true);
});

test('Nachtfaktor wirkt im Raum: 50 % nachts → 18 m nicht mehr, tagsüber schon', async () => {
  const ein = { ...SICHT_VORGABE, nacht: 50 };
  assert.equal(await bemerkt(ein, 18, 0), false);
  assert.equal(await bemerkt(ein, 18, 720), true);
});

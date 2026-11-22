// Innenhof (BGZ, Geretsried 2): Das Wegefeld der Zombies muss auch durch schmale Zugänge führen, die nur im Feinraster offen sind
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { matchMaker } from '@colyseus/core';
import { Client } from '@colyseus/sdk';
import { starte } from '../server/index.mjs';
import { SpielRaum } from '../server/raum.mjs';
import { KACHEL, setzeKartengroesse, frei } from '../client/welt.mjs';
import { freierPort } from './hilfe.mjs';

const PORT = await freierPort();
let server;
before(async () => { server = await starte({ port: PORT, optionen: { karte: 'geretsried2' }, leise: true, datenbank: ':memory:' }); });
after(async () => { await server.gracefullyShutdown(false); setzeKartengroesse(64, 48); });

const HOF = { x: 145.5 * KACHEL, y: 326.5 * KACHEL };   // Innenhof des BGZ (nur durch einen schmalen Eingang erreichbar)

test('Zombies finden in den Innenhof des BGZ', async () => {
  SpielRaum.speicher.loescheWelt();
  const c = await new Client(`http://127.0.0.1:${PORT}`).joinOrCreate('zombies', { name: 'Hof', spielerId: crypto.randomBytes(16).toString('hex'), seed: 7 });
  try {
    const raum = matchMaker.getLocalRoomById(c.roomId), w = raum.welt;
    raum.zombieFaktor = 0; raum.state.zombies.clear(); raum.zombieInfo.clear();
    raum.welle.schritt = () => {};
    raum.zombiesAuffuellen = () => {};
    raum.extra.get(c.sessionId).pause = 1e6;
    const p = raum.state.spieler.get(c.sessionId);
    assert.ok(frei(w, HOF.x, HOF.y, 11), 'Hof nicht frei');
    p.x = HOF.x; p.y = HOF.y; p.ebene = ''; p.hp = 1e9;
    raum.baueFeld('');
    const fd = raum.felder.get('');
    // Das Wegefeld führt durch den schmalen, schrägen Eingang (nur im Feinraster offen) bis in den Hof
    assert.ok(fd[Math.floor(HOF.y / KACHEL) * 340 + Math.floor(HOF.x / KACHEL)] === 0);
    assert.ok(fd[337 * 340 + 148] > 0, 'Wegefeld erreicht den Platz vor dem Eingang nicht');
    const starts = [];   // draußen, 200–450 px vom Spieler (innerhalb der Verfolgungsweite), an das Wegefeld angeschlossen
    for (let ky = 322; ky <= 350; ky += 2) for (let kx = 128; kx <= 166; kx += 2) {
      const x = (kx + 0.5) * KACHEL, y = (ky + 0.5) * KACHEL, d = Math.hypot(x - HOF.x, y - HOF.y);
      if (frei(w, x, y, 11) && d > 200 && d < 450 && fd[ky * 340 + kx] > 0) starts.push({ x, y });
    }
    const ids = starts.map(s => raum.setzeZombie(s.x, s.y, ''));
    for (const id of ids) { const i = raum.zombieInfo.get(id); i.schlaeft = false; i.steht = false; i.wechsel = 1e6; i.ziel = [...raum.state.spieler.keys()][0]; i.verloren = 0; }
    assert.ok(starts.length >= 10, 'zu wenige Startpunkte: ' + starts.length);
    for (let t = 0; t < 25 * 20; t++) {
      for (const id of ids) { const i = raum.zombieInfo.get(id); if (i && !i.ziel) i.ziel = c.sessionId; }
      raum.schritt(0.05);
    }
    const nah = ids.filter(id => { const z = raum.state.zombies.get(id); return z && Math.hypot(z.x - HOF.x, z.y - HOF.y) < 60; });
    assert.ok(nah.length >= Math.ceil(ids.length * 0.9), `nur ${nah.length} von ${ids.length} Zombies im Hof`);
  } finally { await c.leave(); }
});

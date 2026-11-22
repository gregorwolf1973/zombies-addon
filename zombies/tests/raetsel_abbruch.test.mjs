// Rätsel weggeklickt (raetsel_abbruch): offene Frage verfällt, der nächste Versuch bringt eine NEUE Frage
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { matchMaker } from '@colyseus/core';
import { Client } from '@colyseus/sdk';
import { starte } from '../server/index.mjs';
import { SpielRaum } from '../server/raum.mjs';
import { setzeKartengroesse } from '../client/welt.mjs';

const PORT = 28800 + Math.floor(Math.random() * 90);
let server;
before(async () => { server = await starte({ port: PORT, optionen: { karte: 'geretsried' }, leise: true, datenbank: ':memory:' }); });
after(async () => { await server.gracefullyShutdown(false); setzeKartengroesse(64, 48); });

test('Abbruch ohne Antwort verwirft die Frage, nächste Frage ist neu', async () => {
  SpielRaum.speicher.loescheWelt();
  const c = await new Client(`http://127.0.0.1:${PORT}`).joinOrCreate('zombies', { name: 'Raetsler', spielerId: crypto.randomBytes(16).toString('hex'), seed: 7 });
  try {
    const raum = matchMaker.getLocalRoomById(c.roomId);
    raum.zombieFaktor = 0; raum.state.zombies.clear(); raum.zombieInfo.clear();
    const cl = raum.clients.find(q => q.sessionId === c.sessionId);
    const nachr = [];
    const sendOrig = cl.send.bind(cl);
    cl.send = (t, m, ...r) => { nachr.push([t, m]); return sendOrig(t, m, ...r); };
    raum.stelleRaetsel(cl, { art: 'tuer', key: 'x', ebene: '' });
    const a = raum.offeneRaetsel.get(c.sessionId);
    assert.ok(a);
    raum.stelleRaetsel(cl, { art: 'tuer', key: 'x', ebene: '' });
    assert.equal(nachr.filter(n => n[0] === 'raetsel').length, 1, 'zweite Frage trotz offener');
    raum.raetselAbbruch(cl, { id: 'falsch' });
    assert.ok(raum.offeneRaetsel.get(c.sessionId), 'fremde Id darf nicht löschen');
    raum.raetselAbbruch(cl, { id: a.id });
    assert.equal(raum.offeneRaetsel.get(c.sessionId), undefined);
    raum.stelleRaetsel(cl, { art: 'tuer', key: 'x', ebene: '' });
    const b = raum.offeneRaetsel.get(c.sessionId);
    assert.ok(b && b.id !== a.id, 'dieselbe Frage nach Abbruch');
  } finally { await c.leave(); }
});

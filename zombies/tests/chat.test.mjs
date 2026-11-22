import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@colyseus/sdk';
import { starte } from '../server/index.mjs';
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

test('Chat: Nachrichten, Kürzung, leer, Flutbremse, Verlauf', async () => {
  const a = await new Client(URL_).joinOrCreate('zombies', { name: 'Sepp' });
  const b = await new Client(URL_).joinOrCreate('zombies', { name: 'Vroni' });
  const c = [];
  const verlaufB = [];   // Verlauf beim eigenen Beitritt (kommt evtl. vor dem Handler)
  b.onMessage('chat', m => c.push(m));
  b.onMessage('chatVerlauf', m => verlaufB.push(m));
  const aChat = [];
  a.onMessage('chat', m => aChat.push(m));
  try {
    // normale Nachricht
    a.send('chat', { text: '  Hallo Vroni  ' });
    assert.ok(await bis(() => c.length === 1), 'Chat kam nicht an');
    assert.equal(c[0].name, 'Sepp');
    assert.equal(c[0].text, 'Hallo Vroni');
    assert.equal(c[0].ort, 'draußen');
    assert.ok(Number.isInteger(c[0].id) && c[0].zeit > 0 && Number.isInteger(c[0].farbe));
    assert.ok(await bis(() => aChat.length === 1), 'Absender bekommt seine Nachricht auch');

    // zu lang: auf 300 Zeichen gekürzt
    a.send('chat', { text: 'x'.repeat(500) });
    assert.ok(await bis(() => c.length === 2));
    assert.equal(c[1].text.length, 300);

    // leer und Müll werden abgelehnt
    a.send('chat', { text: '   ' });
    a.send('chat', {});
    await warte(200);
    assert.equal(c.length, 2);

    // Flutbremse: höchstens 5 je 10 s (2 sind schon verbraucht)
    for (let i = 0; i < 6; i++) a.send('chat', { text: 'flut ' + i });
    await warte(500);
    assert.equal(c.length, 5);

    // neuer Spieler bekommt den Verlauf (alle fünf Nachrichten, nur er)
    const d = await new Client(URL_).joinOrCreate('zombies', { name: 'Hias' });
    try {
      let verlauf = null;
      d.onMessage('chatVerlauf', m => { verlauf = m; });
      assert.ok(await bis(() => verlauf, 1500), 'kein chatVerlauf');
      assert.equal(verlauf.nachrichten.length, 5);
      assert.equal(verlauf.nachrichten[0].text, 'Hallo Vroni');
      assert.equal(verlaufB.length, 1, 'nur der neue Client bekommt den Verlauf');
    } finally { await d.leave(); }
  } finally { await a.leave(); await b.leave(); }
});

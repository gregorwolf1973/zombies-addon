// Fundorte: Behälter-Positionen werden je Raum gemerkt (kein Hausneubau je Sekunde), Cache fällt bei Welt-/Innenmodus-Wechsel weg – server/fundorte.mjs
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
import { innenraumFuer } from '../client/innen.mjs';
import { fundorteListe, behaelterPosition } from '../server/fundorte.mjs';
import { freierPort } from './hilfe.mjs';

process.env.ZOMBIES_INNEN1M = '1';
const PORT = await freierPort();
const ordner = fs.mkdtempSync(path.join(os.tmpdir(), 'zombies-fcache-'));
let server;
before(async () => { server = await starte({ port: PORT, optionen: { karte: 'geretsried2', bots: 0 }, leise: true, datenbank: path.join(ordner, 'spiel.db') }); });
after(async () => { await server.gracefullyShutdown(false); fs.rmSync(ordner, { recursive: true, force: true }); });

test('Behälter-Positionen: gleiches Ergebnis, zweiter Durchlauf aus dem Cache, Leerung bei Innenmodus-Wechsel', async () => {
  const c = await new Client(`http://127.0.0.1:${PORT}`).joinOrCreate('zombies', { name: 'Cache', spielerId: crypto.randomBytes(16).toString('hex') });
  const raum = matchMaker.getLocalRoomById(c.roomId);
  try {
    const ids = [];
    for (const h of raum.welt.haeuser) {
      const w = innenraumFuer(raum.state.seed, raum.welt, `h${h.nr ?? raum.welt.haeuser.indexOf(h)}eg`);
      for (const b of w?.behaelter ?? []) if (!b.tuer && ids.length < 10) { ids.push(b.id); break; }
      if (ids.length >= 10) break;
    }
    assert.ok(ids.length >= 5, 'zu wenige Behälter gefunden');
    raum.aufgaben.fundePlan = ids.map(behaelter => ({ ding: 'wasser', behaelter }));
    const gesucht = new Set(['wasser']);
    raum.behaelterPosCache = null;
    let t = performance.now();
    const erst = fundorteListe(raum, gesucht);
    const tErst = performance.now() - t;
    t = performance.now();
    const zweit = fundorteListe(raum, gesucht);
    const tZweit = performance.now() - t;
    console.log(`MESSUNG ${ids.length} Plan-Funde: erster Aufruf ${tErst.toFixed(1)} ms, zweiter ${tZweit.toFixed(1)} ms`);
    assert.ok(erst.length > 0);
    assert.deepEqual(zweit, erst);
    assert.equal(raum.behaelterPosCache.map.size, ids.length, 'Positionen nicht gemerkt');
    const p0 = behaelterPosition(raum, ids[0]);
    assert.equal(behaelterPosition(raum, ids[0]), p0, 'nicht aus dem Cache');
    assert.ok(tZweit < Math.max(5, tErst / 5), `zweiter Aufruf nicht schneller (${tErst} / ${tZweit})`);
    // Innenmodus wechseln: Cache wird geleert, Ergebnisse stimmen im alten Maßstab weiter
    const alt = SpielRaum.einstellungen.innenMassstab;
    try {
      process.env.ZOMBIES_INNEN1M = ''; SpielRaum.einstellungen.innenMassstab = false;
      raum.einstellungenGeaendert();
      assert.equal(raum.behaelterPosCache ?? null, null, 'Cache nach innenUmschalten nicht geleert');
      assert.ok(Array.isArray(fundorteListe(raum, gesucht)));
    } finally { process.env.ZOMBIES_INNEN1M = '1'; SpielRaum.einstellungen.innenMassstab = alt; raum.einstellungenGeaendert(); }
    // Weltwechsel: neuer Cache
    const alterCache = raum.behaelterPosCache;
    const welt = raum.welt; raum.welt = { ...welt };
    behaelterPosition(raum, ids[0]);
    assert.notEqual(raum.behaelterPosCache, alterCache);
    raum.welt = welt;
  } finally { await c.leave(); }
});

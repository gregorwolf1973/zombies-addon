// Lager: vier Vorratskisten nebeneinander (Server nimmt die nächste) sowie Container/Sanitätskisten durchsuchbar und danach leer
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { matchMaker } from '@colyseus/core';
import { Client } from '@colyseus/sdk';
import { starte } from '../server/index.mjs';
import { SpielRaum } from '../server/raum.mjs';
import { setzeKartengroesse } from '../client/welt.mjs';

test('Lager: Vorratskiste = nächste, Container/Sanikiste durchsuchbar und danach leer', async () => {
  const port = 29100 + Math.floor(Math.random() * 300);
  const server = await starte({ port, optionen: { karte: 'geretsried' }, leise: true, datenbank: ':memory:' });
  try {
    SpielRaum.speicher.loescheWelt();
    const c = await new Client(`http://127.0.0.1:${port}`).joinOrCreate('zombies', { name: 'Sepp', spielerId: crypto.randomBytes(16).toString('hex'), seed: 7 });
    const raum = matchMaker.getLocalRoomById(c.roomId);
    raum.zombieFaktor = 0; raum.state.zombies.clear(); raum.zombieInfo.clear(); raum.welle.schritt = () => {};
    const p = raum.state.spieler.get(c.sessionId), x = raum.extra.get(c.sessionId);
    x.pause = 1e6; p.ebene = ''; p.rucksack.length = 0; p.plaetze = 8;
    const cl = raum.clients.find(q => q.sessionId === c.sessionId);
    const vk = raum.welt.stuetzpunkt.teile.filter(t => t.art === 'vorratskiste');
    assert.equal(vk.length, 4);
    for (const t of vk) { p.x = t.x; p.y = t.y + 6; assert.equal(raum.lagerKisteNah(p).id, t.id); }
    p.x = vk[1].x; p.y = vk[1].y; p.rucksack.push('verband');
    raum.kiste(cl, { richtung: 'rein', platz: 0 });
    assert.equal(raum.state.safes.get('lager1').kiste.length, 1);
    assert.equal(raum.state.safes.get('lager0').kiste.length, 0);
    for (const art of ['bw_container', 'sanikiste']) {
      const b = raum.welt.behaelter.find(q => q.art === art);
      p.x = b.x; p.y = b.y + 10; p.aktion = ''; p.rucksack.length = 0; p.plaetze = 16;
      const k = raum.kontext(p, x);
      assert.equal(k?.art, 'durchsuchen'); assert.equal(k.behaelter.id, b.id);
      raum.starteAktion(cl);
      assert.equal(p.aktion, 'durchsuchen');
      for (let i = 0; i < 80 && p.aktion; i++) raum.aktionSchritt(c.sessionId, p, x, 0.05);
      assert.equal(p.aktion, '', art + ' hängt');
      for (let i = 0; i < 5 && raum.kontext(p, x)?.behaelter?.id === b.id; i++) raum.durchsucht(cl, p, b);
      assert.notEqual(raum.kontext(p, x)?.behaelter?.id, b.id, art + ' bleibt anwählbar, obwohl leer');
    }
  } finally { await server.gracefullyShutdown(false); setzeKartengroesse(64, 48); }
});

// Bundeswehr-Lager: Munitionskiste durchsuchen (alte Eingabe `eingabe` und neue `e`, mit und ohne Zombie in der Nähe)
import { textAus } from '../server/texte.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { matchMaker } from '@colyseus/core';
import { Client } from '@colyseus/sdk';
import { starte } from '../server/index.mjs';
import { SpielRaum } from '../server/raum.mjs';
import { setzeKartengroesse } from '../client/welt.mjs';

const BASIS = 28800 + Math.floor(Math.random() * 60) * 4;
const warte = ms => new Promise(r => setTimeout(r, ms));
let n = 0;

for (const karte of ['geretsried', 'geretsried2']) {
  for (const form of ['eingabe', 'e']) for (const zombie of [0, 1, 2]) {
    // zombie: 0 = keiner, 1 = ruhig in ca. 5 m (darf nichts abbrechen), 2 = in 1 m (im Lager ist man sicher: kein Abbruch)
    test(`Lager ${karte}: Munitionskiste durchsuchen (${form}, Zombie ${['keiner', '5 m ruhig', '1 m'][zombie]})`, async () => {
      const port = BASIS + (n++ % 4) + 10000;
      const server = await starte({ port, optionen: { karte }, leise: true, datenbank: ':memory:' });
      try {
        SpielRaum.speicher.loescheWelt();
        const c = await new Client(`http://127.0.0.1:${port}`).joinOrCreate('zombies', { name: 'Sepp', spielerId: crypto.randomBytes(16).toString('hex'), seed: 7 });
        const raum = matchMaker.getLocalRoomById(c.roomId);
        raum.zombieFaktor = 0; raum.kriecherChance = 0; raum.state.zombies.clear(); raum.zombieInfo.clear();
        raum.welle.schritt = () => {};
        const p = raum.state.spieler.get(c.sessionId), x = raum.extra.get(c.sessionId);
        x.pause = 1e6;
        const b = raum.welt.behaelter.find(q => q.art === 'bw_kiste');
        assert.ok(raum.welt.stuetzpunkt && b, 'kein Lager/keine Kiste');
        p.ebene = ''; p.x = b.x; p.y = b.y + 10; p.rucksack.length = 0; p.plaetze = 4;
        SpielRaum.einstellungen.ueberraschung = 0;
        if (zombie) {
          raum.neuerZombie(0);
          const [zid, z] = [...raum.state.zombies.entries()][0];
          z.x = p.x + (zombie === 1 ? 40 : 8); z.y = p.y; z.hp = 1000;
          const info = raum.zombieInfo.get(zid); info.steht = true; info.wechsel = 99;
        }
        const cl = raum.clients.find(q => q.sessionId === c.sessionId);
        const nachr = [], so = cl.send.bind(cl);
        cl.send = (t, m, ...r) => { nachr.push([t, m]); return so(t, m, ...r); };
        const sende = () => form === 'eingabe' ? c.send('eingabe', { dx: 0, dy: 0, s: false, f: false, n: 1, d: 0.05 }) : c.send('e', [1, 0, 0, 0, 50]);
        raum.starteAktion(cl);
        assert.equal(p.aktion, 'durchsuchen', 'Aktion nicht gestartet');
        for (let i = 0; i < 20 && (p.aktion || !nachr.some(q => q[0] === 'gefunden')); i++) { sende(); await warte(80); }
        const log = JSON.stringify(nachr.map(q => (q[1]?.text || q[1]?.k ? textAus(q[1]?.text ?? q[1]) : q[0])));
        { assert.ok(nachr.some(q => q[0] === 'gefunden'), 'hängt, p.aktion=' + p.aktion + ' fortschritt=' + p.fortschritt + ' ' + log); assert.equal(p.aktion, ''); }
      } finally { await server.gracefullyShutdown(false); setzeKartengroesse(64, 48); }
    });
  }
}

// Fehler: zwei Munitionskisten stehen ~20 px nebeneinander; war die nähere für den Spieler leer, suchte der Server sie weiter durch,
// während der Client (blendet leere aus) die zweite anbot – „das Durchsuchen hängt“.
test('Lager: leere Munitionskiste bleibt durchsuchbar (nächste Lieferung per Meldung), wird nicht übersprungen', async () => {
  const port = BASIS + 3 + 10000;
  const server = await starte({ port, optionen: { karte: 'geretsried' }, leise: true, datenbank: ':memory:' });
  try {
    SpielRaum.speicher.loescheWelt();
    const c = await new Client(`http://127.0.0.1:${port}`).joinOrCreate('zombies', { name: 'Sepp', spielerId: crypto.randomBytes(16).toString('hex'), seed: 7 });
    const raum = matchMaker.getLocalRoomById(c.roomId);
    raum.zombieFaktor = 0; raum.state.zombies.clear(); raum.zombieInfo.clear(); raum.welle.schritt = () => {};
    const p = raum.state.spieler.get(c.sessionId), x = raum.extra.get(c.sessionId);
    x.pause = 1e6; p.ebene = ''; p.rucksack.length = 0; p.plaetze = 8;
    SpielRaum.einstellungen.bundeswehr = { ...SpielRaum.einstellungen.bundeswehr, kistenMunChance: 0, kistenVerbandChance: 0, kistenGranateChance: 0 };
    const kisten = raum.welt.behaelter.filter(q => q.art === 'bw_kiste');
    const a = kisten.find(q => kisten.some(r => r !== q && Math.hypot(r.x - q.x, r.y - q.y) < 30));
    const b = kisten.find(r => r !== a && Math.hypot(r.x - a.x, r.y - a.y) < 30);
    const cl = raum.clients.find(q => q.sessionId === c.sessionId);
    const kiste = [], so = cl.send.bind(cl);
    cl.send = (t, m, ...r) => { if (t === 'gefunden') kiste.push(m.kiste); return so(t, m, ...r); };
    const mitte = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    p.x = a.x + (mitte.x - a.x) * 0.3; p.y = a.y + (mitte.y - a.y) * 0.3;   // näher an a
    for (let i = 0; i < 6; i++) raum.durchsucht(cl, p, a);   // a leer machen (bis alles genommen oder Rucksack voll)
    p.rucksack.length = 0;
    assert.equal(raum.inhalte.get(a.id + '@' + x.spielerId).length, 0);
    assert.equal(raum.kontext(p, x)?.behaelter?.id, a.id, 'leere Kiste bleibt die nächste durchsuchbare');
  } finally { await server.gracefullyShutdown(false); setzeKartengroesse(64, 48); }
});

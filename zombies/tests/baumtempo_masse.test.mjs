// Tempo unter Bäumen (Spieler, Zombie, Mensch; Einstellung baumTempo, Vorgabe 25 %), kein Maibaum, Panzer in echten Maßen
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
import { baueWelt, baumFaktor, KACHEL, T, BREITE, HOEHE, frei, WELT_VERSION, setzeKartengroesse } from '../client/welt.mjs';
import { baueWeltAusKarte } from '../client/osmwelt.mjs';
import { bereinige, vorgaben } from '../server/einstellungen.mjs';
import { fzPx } from '../client/masse.mjs';
import { FLUGFELD_PUMA } from '../client/flugfeld_deko.mjs';
import { PUMA_SKALA } from '../client/stuetzpunkt.mjs';

const PORT = 27100 + Math.floor(Math.random() * 100);
const ordner = fs.mkdtempSync(path.join(os.tmpdir(), 'zombies-test-'));
let server;
before(async () => { server = await starte({ port: PORT, optionen: { karte: 'geretsried' }, leise: true, datenbank: path.join(ordner, 'spiel.db') }); });
after(async () => { await server.gracefullyShutdown(false); fs.rmSync(ordner, { recursive: true, force: true }); });

async function beitreten() {
  const c = await new Client(`http://127.0.0.1:${PORT}`).joinOrCreate('zombies', { name: 'Baumtest', spielerId: crypto.randomBytes(16).toString('hex') });
  const raum = matchMaker.getLocalRoomById(c.roomId);
  raum.zombieFaktor = 0; raum.state.zombies.clear(); raum.zombieInfo.clear();
  return { c, raum, p: raum.state.spieler.get(c.sessionId), x: raum.extra.get(c.sessionId) };
}
// freie Wiesenreihe (14 Kacheln) suchen
function reihe(w) {
  for (let ky = 3; ky < HOEHE - 3; ky++) for (let kx = 2; kx < BREITE - 16; kx++) {
    let gut = true;
    for (let i = 0; i < 14 && gut; i++) if (w.hole(kx + i, ky) !== T.WIESE || !frei(w, (kx + i + 0.5) * KACHEL, (ky + 0.5) * KACHEL, 12)) gut = false;
    if (gut) return { kx, ky };
  }
  throw new Error('keine freie Reihe');
}

test('baumFaktor: nur auf Baumkacheln draußen', () => {
  const w = { ebene: '', hole: (x) => (x === 5 ? T.BAUM : T.WIESE) };
  assert.equal(baumFaktor(w, 5.5 * KACHEL, 10), 0.25);
  assert.equal(baumFaktor(w, 4.5 * KACHEL, 10), 1);
  assert.equal(baumFaktor(w, 5.5 * KACHEL, 10, 100), 1, '100 % = kein Unterschied');
  assert.equal(baumFaktor({ ...w, ebene: 'haus:1' }, 5.5 * KACHEL, 10), 1, 'drinnen nie');
});

test('Einstellung baumTempo: Vorgabe 25, begrenzt auf 5–100', () => {
  assert.equal(vorgaben().baumTempo, 25);
  assert.equal(bereinige({ baumTempo: 1 }, {}).baumTempo, 5);
  assert.equal(bereinige({ baumTempo: 500 }, {}).baumTempo, 100);
  assert.equal(bereinige({ baumTempo: 40 }, {}).baumTempo, 40);
});

test('Zombie, Spieler und Mensch laufen unter Bäumen mit 25 % Tempo', async () => {
  const { c, raum, p, x } = await beitreten();
  const w = raum.welt, K = w.kacheln, kopie = K.slice();
  try {
    const { kx, ky } = reihe(w), y = (ky + 0.5) * KACHEL, x0 = (kx + 1) * KACHEL;
    const baum = (an) => { for (let i = 0; i < 14; i++) K[ky * BREITE + kx + i] = an ? T.BAUM : T.WIESE; };
    const messeZombie = () => { const z = { x: x0, y, ebene: '', jagt: true }; for (let i = 0; i < 20; i++) raum.zombieGehen(z, 0, 4, 0.05); return z.x - x0; };
    const messeSpieler = () => {
      p.x = x0; p.y = y; p.ebene = ''; p.unten = false; p.zombie = 0; p.sicher = '';
      x.warte = null; x.eingabe = { dx: 1, dy: 0, s: false };
      for (let i = 0; i < 10; i++) raum.spielerSchritt(c.sessionId, p, x, 0.05);
      return p.x - x0;
    };
    const messeMensch = () => {
      const m = { x: x0, y, ebene: '', richtung: 0 }, ziel = { x: (kx + 13) * KACHEL, y };
      raum.stadt.gehePfad(w, m, { weg: [ziel] }, ziel, 4, 0.05);
      return m.x - x0;
    };
    baum(false);
    const frei1 = [messeZombie(), messeSpieler(), messeMensch()];
    baum(true);
    SpielRaum.einstellungen = { ...SpielRaum.einstellungen, baumTempo: 25 };
    const baum1 = [messeZombie(), messeSpieler(), messeMensch()];
    for (let i = 0; i < 3; i++) {
      assert.ok(frei1[i] > 3, 'Grundlauf ' + i + ': ' + frei1[i]);
      assert.ok(Math.abs(baum1[i] / frei1[i] - 0.25) < 0.03, `Figur ${i}: ${baum1[i]} statt ${frei1[i] * 0.25}`);
    }
    SpielRaum.einstellungen = { ...SpielRaum.einstellungen, baumTempo: 100 };
    assert.ok(Math.abs(messeZombie() - frei1[0]) < 0.5, '100 % = normal');
  } finally { K.set(kopie); SpielRaum.einstellungen = { ...SpielRaum.einstellungen, baumTempo: 25 }; await c.leave(); }
});

test('kein Maibaum mehr in den Karten (Dorf und OSM)', () => {
  const b0 = BREITE, h0 = HOEHE;
  try {
    setzeKartengroesse(64, 48);
    assert.ok(!baueWelt(12345).deko.some(d => d.art === 'maibaum'));
    const karte = JSON.parse(fs.readFileSync(new URL('../client/karten/geretsried.json', import.meta.url), 'utf8'));
    setzeKartengroesse(karte.breite, karte.hoehe);
    assert.ok(!baueWeltAusKarte(karte, 7).deko.some(d => d.art === 'maibaum'));
  } finally { setzeKartengroesse(b0, h0); }
  assert.ok(WELT_VERSION >= 26);
});

test('Puma im Flugfeld und im Lager hat echte Maße wie auf der B 11 (7,3 × 3,7 m)', () => {
  const [L, B] = fzPx('puma');
  assert.equal(PUMA_SKALA, 1);
  assert.equal(FLUGFELD_PUMA.laenge, L);
  assert.equal(FLUGFELD_PUMA.breite, B);
  assert.ok(Math.abs(L - 58.4) < 0.01);
});

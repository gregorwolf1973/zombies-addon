// Welt-Zwischenspeicher: serialisierte/kopierte Welt muss mit der frisch gebauten identisch sein (Fingerabdruck, Abfragen, Verweise),
// Server-Cache (Worker-Thread) liefert dieselbe Welt, unabhängige Kopien, höchstens 2 Welten im Speicher.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { setzeKartengroesse, weltFingerabdruck, frei, BREITE, HOEHE, T } from '../client/welt.mjs';
import { baueWeltAusKarte } from '../client/osmwelt.mjs';
import { weltZerlegen, weltAktivieren, weltKopieren, weltSchluessel } from '../client/weltkopie.mjs';
import { weltBeschaffen, weltVorbereiten, weltcacheBeenden, weltcacheStand } from '../server/weltcache.mjs';

const lade = n => ({ ...JSON.parse(fs.readFileSync(new URL(`../client/karten/${n}.json`, import.meta.url))), name: n });
after(() => weltcacheBeenden());

function gleich(a, b) {
  assert.equal(weltFingerabdruck(a), weltFingerabdruck(b));
  const { hole: h1, ...r1 } = a, { hole: h2, ...r2 } = b;
  assert.deepStrictEqual(r1, r2);   // Typed Arrays, Häuser, Behälter, Safe Rooms, Fein-Raster, Vektor … alles
  for (let y = -2; y < HOEHE + 2; y++) for (let x = -2; x < BREITE + 2; x++) if (h1(x, y) !== h2(x, y)) assert.fail(`hole(${x},${y}) weicht ab`);
  // Spielabfragen: freie Wege, Häuser, Behälter
  for (let i = 0; i < 400; i++) {
    const px = (i * 7919) % (BREITE * 32), py = (i * 104729) % (HOEHE * 32);
    assert.equal(frei(a, px, py, 11), frei(b, px, py, 11));
  }
  assert.equal(b.haeuser.length, a.haeuser.length);
  assert.equal(b.behaelter.length, a.behaelter.length);
  for (const s of b.safeRooms) assert.ok(b.haeuser.includes(s.haus), 'Safe Room zeigt auf dasselbe Haus-Objekt');   // geteilte Verweise bleiben
}

for (const [name, seed, autos] of [['geretsried', 4711, 1], ['kochel', 99, 1.5], ['isarauen', 7, 0.5], ['koenigsdorf', 31337, 1]]) {
  test(`Welt ${name}: Kopie (structuredClone) = frisch gebaut`, () => {
    const karte = lade(name);
    setzeKartengroesse(karte.breite, karte.hoehe);
    const frisch = baueWeltAusKarte(karte, seed, { autos });
    assert.equal(typeof frisch.hole, 'function');
    const zerlegt = weltZerlegen(frisch);
    assert.ok(!('hole' in zerlegt));
    structuredClone(zerlegt);   // darf nicht werfen (Worker/IndexedDB)
    gleich(frisch, weltKopieren(frisch));
    gleich(frisch, weltAktivieren(structuredClone(zerlegt)));
  });
}

test('Server-Cache: Worker-Welt = frisch gebaute Welt, jede Abholung eine eigene Kopie, höchstens 2 im Speicher', async () => {
  const karte = lade('geretsried');
  setzeKartengroesse(karte.breite, karte.hoehe);
  const frisch = baueWeltAusKarte(karte, 555, { autos: 1 });
  weltVorbereiten(karte, 555, 1);
  const a = await weltBeschaffen(karte, 555, 1);
  gleich(frisch, a);
  const b = await weltBeschaffen(karte, 555, 1);
  assert.notEqual(a, b);
  assert.notEqual(a.kacheln, b.kacheln);
  a.kacheln[5] = 9; a.haeuser[0].x += 1;   // das Spiel verändert seine Welt – Cache und andere Kopie bleiben unberührt
  const c = await weltBeschaffen(karte, 555, 1);
  gleich(frisch, c);
  await weltBeschaffen(karte, 556, 1); await weltBeschaffen(karte, 557, 1);
  assert.ok(weltcacheStand().eintraege <= 2);
});

test('Schlüssel: Seed, Autos, Karte gehen ein', () => {
  const k = lade('geretsried');
  assert.notEqual(weltSchluessel(k, 1, 1), weltSchluessel(k, 2, 1));
  assert.notEqual(weltSchluessel(k, 1, 1), weltSchluessel(k, 1, 1.1));
  assert.notEqual(weltSchluessel(k, 1, 1), weltSchluessel({ ...k, kacheln: k.kacheln.slice(0, -1) + '0' }, 1, 1));
  assert.equal(weltSchluessel(k, 1, 1), weltSchluessel({ ...k }, 1, 1));
});

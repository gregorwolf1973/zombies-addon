// Alle Level: jedes betretbare Gebäude (auch Safe Rooms, Läden, große Hallen, verwinkelte Umrisse) bekommt maßstäbliche Innenräume
// (kachel 2, Feinraster) – kein Gebäude fällt auf das alte grobe Raster zurück. Stockwerke nur, wenn die Treppe sie vorsieht.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { setzeKartengroesse, setzeInnenFein, T, frei, WERTE as W } from '../client/welt.mjs';
import { baueWeltAusKarte } from '../client/osmwelt.mjs';
import { innenraumFuer } from '../client/innen.mjs';

setzeInnenFein(true);
for (const name of ['geretsried', 'geretsried2', 'isarauen', 'koenigsdorf', 'kochel', 'andermatt']) {
  test(`Karte ${name}: alle betretbaren Gebäude maßstäblich`, () => {
    const karte = JSON.parse(fs.readFileSync(new URL(`../client/karten/${name}.json`, import.meta.url)));
    setzeKartengroesse(karte.breite, karte.hoehe);
    const welt = baueWeltAusKarte(karte, 12345);
    const haeuser = welt.haeuser.filter(h => h.betretbar && h.tuer);
    assert.ok(haeuser.length > 20);
    for (const h of haeuser) {
      const eg = innenraumFuer(3, welt, `h${h.nr}eg`), info = `${name} h${h.nr} ${h.name || h.art || 'Wohnhaus'}${h.safe ? ' (Safe)' : ''}`;
      assert.equal(eg.kachel, 2, info + ': Erdgeschoss im groben Raster');
      assert.ok(frei(eg, eg.start.x, eg.start.y, W.spielerRadius), info + ': Start nicht frei');
      for (const [st, hat] of [['keller', eg.hatKeller], ['dach', eg.hatDach]]) if (hat) {
        const w = innenraumFuer(3, welt, `h${h.nr}${st}`);
        assert.equal(w.kachel, 2, `${info}: ${st} im groben Raster`);
        assert.ok(w.treppen.length > 0, `${info}: ${st} ohne Treppe`);
      }
    }
  });
}

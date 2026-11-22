// Fensterlicht nachts (client/fensterlicht.mjs): Lichtseite zeigt zur nächsten Laterne, Flecken liegen innen vor den Fenstern dieser Seite.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { setzeKartengroesse, setzeInnenFein, KACHEL, T } from '../client/welt.mjs';
import { baueWeltAusKarte } from '../client/osmwelt.mjs';
import { innenraumFuer } from '../client/innen.mjs';
import { laternen } from '../client/vektor.mjs';
import { lichtRichtungWelt, lichtSeite, fensterFlecken } from '../client/fensterlicht.mjs';
import { fensterPositionen } from '../client/innen_fein_bild.mjs';
import { INNEN_Z } from '../client/innen_fein.mjs';

const karte = JSON.parse(fs.readFileSync(new URL('../client/karten/geretsried2.json', import.meta.url)));
setzeKartengroesse(karte.breite, karte.hoehe);
const welt = baueWeltAusKarte(karte, 12345);
setzeInnenFein(true);
const lat = laternen(welt);

test('Lichtseite: Richtung der Laterne im gedrehten Raster, Flecken nur vor Fenstern dieser Seite', () => {
  let geprueft = 0, mitFlecken = 0;
  for (const h of welt.haeuser.filter(q => q.betretbar && !q.safe && q.flaeche >= 14).slice(0, 40)) {
    const w = innenraumFuer(3, welt, `h${h.nr}eg`);
    if (!w.kachel) continue;
    const r = lichtRichtungWelt(h, lat, welt, KACHEL, T.STRASSE);
    if (!r) continue;
    const seite = lichtSeite(w, r);
    assert.ok(['n', 's', 'w', 'o'].includes(seite));
    geprueft++;
    const fl = fensterFlecken(w, seite), fen = fensterPositionen(w).filter(f => f.richtung === seite);
    assert.equal(fl.length, fen.length * 3, 'drei Pinsel je Fenster');
    if (fl.length) mitFlecken++;
    for (const f of fl) {
      assert.ok(f.x > 0 && f.y > 0 && f.x < w.breite * INNEN_Z && f.y < w.hoehe * INNEN_Z, 'Fleck im Bild');
      assert.ok(f.sx > 0 && f.sy > 0);
    }
    assert.deepEqual(fl, fensterFlecken(w, seite), 'deterministisch');
  }
  assert.ok(geprueft >= 10 && mitFlecken >= 3, `geprüft ${geprueft}, mit Flecken ${mitFlecken}`);
});

test('Lichtseite gegen die Raster-Achsen: Laterne rechts/unten im Raster ergibt o/s', () => {
  const w = { zuKarte: (x, y) => [x, y] };   // ungedrehtes Raster
  assert.equal(lichtSeite(w, [100, 10]), 'o');
  assert.equal(lichtSeite(w, [-100, 10]), 'w');
  assert.equal(lichtSeite(w, [10, 100]), 's');
  assert.equal(lichtSeite(w, [10, -100]), 'n');
  assert.equal(lichtSeite(w, null), null);
  assert.deepEqual(fensterFlecken({ kachel: 2 }, null), []);
});

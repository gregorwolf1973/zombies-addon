// Zäune und Hecken (amtliche Karte geretsried2) liegen nie auf Fahrbahn oder Gehweg der gezeichneten Straßen
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { KACHEL, setzeKartengroesse } from '../client/welt.mjs';
import { fahrbahnBreite } from '../client/vektor.mjs';
import { baueWeltAusKarte } from '../client/osmwelt.mjs';
import { strassenFlaechen, strassenTiefe, zaeuneVonStrassen } from '../client/zaunstrasse.mjs';

test('geretsried2: kein Zaun-/Heckenpunkt innerhalb Fahrbahn + Gehweg, Zäune bleiben erhalten', () => {
  const karte = JSON.parse(fs.readFileSync(new URL('../client/karten/geretsried2.json', import.meta.url)));
  setzeKartengroesse(karte.breite, karte.hoehe);
  try {
    const sl = strassenFlaechen(karte.strassen, KACHEL, fahrbahnBreite);
    const innen = zz => { let n = 0; for (const z of zz) for (let i = 0; i + 1 < z.p.length; i += 2) if (strassenTiefe(sl, z.p[i] * KACHEL, z.p[i + 1] * KACHEL, 0)) n++; return n; };
    const vorher = innen(karte.zaeune);
    assert.ok(vorher > 500, 'Rohdaten sollten viele Punkte auf der Straße haben: ' + vorher);
    const w = baueWeltAusKarte(karte, 7);
    const z = w.details.zaeune;
    assert.equal(innen(z), 0);
    assert.ok(z.length >= karte.zaeune.length * 0.9, 'zu viele Zäune verloren');
    assert.ok(z.some(l => l.a === 'h'), 'Hecken fehlen');
  } finally { setzeKartengroesse(64, 48); }
});

test('Zaunstück parallel zur Straße wandert an die Außenkante, quer verlaufendes wird abgeschnitten', () => {
  const K = KACHEL, strassen = [{ t: 'residential', p: [0, 10, 40, 10], gl: 2, gr: 2 }];
  const fb = fahrbahnBreite({ t: 'residential', spuren: 0, breite: 0 }), rand = fb / 2 + 16 + 2.4 + 3;
  const par = zaeuneVonStrassen([{ a: 'z', p: [5, 10 + 32 / K, 15, 10 + 32 / K] }], strassen, K, fahrbahnBreite);
  assert.ok(par.verschoben > 0 && par.zaeune.length === 1);
  for (let i = 1; i < par.zaeune[0].p.length; i += 2) assert.ok(Math.abs(par.zaeune[0].p[i] * K - 10 * K) >= rand - 0.2, 'nicht an der Außenkante');
  const quer = zaeuneVonStrassen([{ a: 'z', p: [20, 5, 20, 15] }], strassen, K, fahrbahnBreite);
  assert.ok(quer.abgeschnitten > 0 && quer.zaeune.length === 2, 'Querzaun nicht geteilt: ' + quer.zaeune.length);
});

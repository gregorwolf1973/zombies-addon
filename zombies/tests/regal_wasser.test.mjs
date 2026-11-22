// Regale: aneinanderstoßende Ladenmodule sind ein Behälter (durchsuchbar entlang des ganzen Regals);
// Wasser: kein Hindernis mehr, Tempo 10 % wie im Pool; Platzwahl (frei) meidet es weiterhin
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { setzeKartengroesse, setzeInnenFein, KACHEL, T, BLOCKIERT, frei, bewege, baumFaktor, poolFaktor, POOL_TEMPO, abstandBehaelter, WERTE as W, reichVon } from '../client/welt.mjs';
import { baueWeltAusKarte } from '../client/osmwelt.mjs';
import { innenraumFuer } from '../client/innen.mjs';

after(() => { setzeInnenFein(false); setzeKartengroesse(64, 48); });

test('Wasser: nicht in BLOCKIERT, Bewegung mit 10 % Tempo, frei() meidet es', () => {
  const karte = JSON.parse(fs.readFileSync(new URL('../client/karten/isarauen.json', import.meta.url)));
  setzeKartengroesse(karte.breite, karte.hoehe);
  const w = baueWeltAusKarte(karte, 4711);
  assert.ok(!BLOCKIERT.has(T.WASSER));
  let wk = null;
  for (let y = 2; y < karte.hoehe - 2 && !wk; y++) for (let x = 2; x < karte.breite - 2; x++) {
    let ok = true;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (w.hole(x + dx, y + dy) !== T.WASSER) ok = false;
    if (ok) { wk = { x, y }; break; }
  }
  assert.ok(wk, 'Gewässer vorhanden');
  const px = (wk.x + 0.5) * KACHEL, py = (wk.y + 0.5) * KACHEL;
  assert.equal(poolFaktor(w, px, py), POOL_TEMPO);
  assert.equal(baumFaktor(w, px, py, 100), POOL_TEMPO);
  assert.ok(!frei(w, px, py, W.spielerRadius), 'frei() (Spawns, Platzwahl) schließt Wasser aus');
  const held = { x: px, y: py };
  bewege(w, held, 6, 0, W.spielerRadius);
  assert.equal(held.x, px + 6, 'Held kommt durch Wasser (nicht blockiert)');
  const h2 = { x: px, y: py };
  for (let i = 0; i < 100; i++) bewege(w, h2, baumFaktor(w, h2.x, h2.y, 25), 0, W.spielerRadius);
  assert.ok(h2.x - px > 9.9 && h2.x - px < 10.1, 'langsam: ' + (h2.x - px));
});

test('Ladenregal: ein Behälter je Regalsegment, an jedem Punkt entlang durchsuchbar', () => {
  const karte = JSON.parse(fs.readFileSync(new URL('../client/karten/geretsried.json', import.meta.url)));
  setzeKartengroesse(karte.breite, karte.hoehe);
  const welt = baueWeltAusKarte(karte, 12345);
  setzeInnenFein(true);
  const laeden = welt.haeuser.filter(h => h.betretbar && !h.safe && h.art && h.name).slice(0, 12);
  let gepr = 0, lang = 0;
  for (const h of laeden) {
    const w = innenraumFuer(3, welt, `h${h.nr}eg`);
    if (!w?.kachel) continue;
    const bh = w.behaelter.filter(b => /^laden/.test(b.art));
    const module = w.moebel.filter(m => m.art === 'regal_lang');
    if (!module.length) continue;
    for (const m of module) {
      const K = w.kachel;
      const b = bh.find(q => abstandBehaelter(q, (m.x + m.b / 2) * K, (m.y + m.h / 2) * K) === 0);
      assert.ok(b, 'Regalmodul ohne Behälter');
      for (let t = 0; t <= 1; t += 0.25) {
        const x = m.x * K + t * m.b * K, y = m.y * K + t * m.h * K;
        assert.ok(abstandBehaelter(b, x, y) < reichVon(w, 40), 'Punkt am Regal erreichbar');
        gepr++;
      }
    }
    if (bh.some(b => (b.teile ?? 1) > 1)) lang++;
  }
  assert.ok(gepr > 0, 'Läden mit Regalen geprüft');
  assert.ok(lang > 0, 'mindestens ein langes Regal aus mehreren Modulen');
});

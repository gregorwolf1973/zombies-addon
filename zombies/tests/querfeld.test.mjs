// Evakuierungspanzer fährt querfeldein zum Abholpunkt (server/querfeld.mjs); Bus: Abholpunkt wandert zur nächsten Straße
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { KACHEL, setzeKartengroesse, frei } from '../client/welt.mjs';
import { baueWeltAusKarte } from '../client/osmwelt.mjs';
import { querfeldPlan, befahrbarNahe } from '../server/querfeld.mjs';

const karte = n => JSON.parse(fs.readFileSync(new URL(`../client/karten/${n}.json`, import.meta.url)));
const tor = w => ({ x: (w.tor.x + 1) * KACHEL, y: (w.tor.y + 1) * KACHEL });

for (const name of ['isarauen', 'geretsried', 'geretsried2']) {
  test(`Querfeld ${name}: Panzer erreicht den Abholpunkt für mehrere Seeds, Weg nur über befahrbaren Boden`, () => {
    const k = karte(name);
    setzeKartengroesse(k.breite, k.hoehe);
    try {
      for (const seed of [1, 7, 42]) {
        const w = baueWeltAusKarte(k, seed), t = tor(w);
        const plan = querfeldPlan(w, t);
        assert.ok(plan, `${name}/${seed}: kein Plan`);
        assert.ok(plan.weg.length >= 2 && plan.rueck.length === plan.weg.length);
        const z = plan.weg[plan.weg.length - 1];
        assert.ok(Math.hypot(z.x - plan.ziel.x, z.y - plan.ziel.y) < 1, 'Weg endet nicht am Ziel');
        assert.ok(frei(w, plan.ziel.x, plan.ziel.y, plan.rad), 'Ziel nicht befahrbar');
        // Rückfallebene: ist der Ortsausgang nicht befahrbar, liegt das Ziel auf der nächsten befahrbaren Stelle
        if (!frei(w, t.x, t.y, 14)) assert.ok(plan.verschoben, 'Ziel nicht verschoben');
        assert.ok(Math.hypot(plan.ziel.x - t.x, plan.ziel.y - t.y) < 900, 'Ziel zu weit vom Ortsausgang');
        // jeder Wegabschnitt ist auf freiem Boden befahrbar (alle 12 px, Wannenbreite)
        for (let i = 0; i < plan.weg.length - 1; i++) {
          const a = plan.weg[i], b = plan.weg[i + 1], n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 12);
          for (let j = 0; j <= n; j++) assert.ok(frei(w, a.x + (b.x - a.x) * j / n, a.y + (b.y - a.y) * j / n, plan.rad), `${name}/${seed}: Weg durch Hindernis bei Abschnitt ${i}`);
        }
        let laenge = 0; for (let i = 0; i < plan.weg.length - 1; i++) laenge += Math.hypot(plan.weg[i + 1].x - plan.weg[i].x, plan.weg[i + 1].y - plan.weg[i].y);
        assert.ok(laenge > 150, 'Fahrt zu kurz: ' + laenge);
        assert.equal(querfeldPlan(w, t), plan, 'nicht zwischengespeichert');
      }
    } finally { setzeKartengroesse(64, 48); }
  });
}

test('befahrbarNahe: gesperrter Punkt wird auf die nächste freie Stelle verschoben', () => {
  const k = karte('isarauen');
  setzeKartengroesse(k.breite, k.hoehe);
  try {
    const w = baueWeltAusKarte(k, 7), t = tor(w);
    const p = befahrbarNahe(w, t.x, t.y, 28);
    assert.ok(p && frei(w, p.x, p.y, 28));
  } finally { setzeKartengroesse(64, 48); }
});

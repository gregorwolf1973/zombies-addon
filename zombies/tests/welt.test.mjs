import { test } from 'node:test';
import assert from 'node:assert/strict';
import { baueWelt, frei, KACHEL, BREITE, HOEHE, T, WERTE, bewaffnetSoll, zombieSoll } from '../client/welt.mjs';

const BEGEHBAR = new Set([T.WIESE, T.STRASSE, T.BODEN, T.TUER, T.PLATZ]);

function erreichbar(welt, sx, sy) {
  const gesehen = new Uint8Array(BREITE * HOEHE);
  const q = [[sx, sy]]; gesehen[sy * BREITE + sx] = 1;
  for (let i = 0; i < q.length; i++) {
    const [x, y] = q[i];
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      if (nx < 0 || ny < 0 || nx >= BREITE || ny >= HOEHE || gesehen[ny * BREITE + nx]) continue;
      if (!BEGEHBAR.has(welt.hole(nx, ny))) continue;
      gesehen[ny * BREITE + nx] = 1; q.push([nx, ny]);
    }
  }
  return gesehen;
}

test('gleicher Seed ergibt gleiche Karte', () => {
  const a = baueWelt(1234), b = baueWelt(1234), c = baueWelt(999);
  assert.deepEqual(a.kacheln, b.kacheln);
  assert.notDeepEqual(a.kacheln, c.kacheln);
});

for (const seed of [1, 42, 1234, 77777, 2 ** 30 + 5]) {
  test(`Karte ${seed}: Start frei, Tor und alle Häuser erreichbar`, () => {
    const w = baueWelt(seed);
    assert.ok(frei(w, w.start.x, w.start.y, WERTE.spielerRadius), 'Startpunkt blockiert');
    assert.ok(w.haeuser.length >= 12, `zu wenige Häuser: ${w.haeuser.length}`);
    const sx = Math.floor(w.start.x / KACHEL), sy = Math.floor(w.start.y / KACHEL);
    const ok = erreichbar(w, sx, sy);
    // Tor: die Kachel östlich davon muss erreichbar sein
    assert.ok(ok[w.tor.y * BREITE + w.tor.x + 1], 'Ortsausgang nicht erreichbar');
    for (const h of w.haeuser) {
      assert.equal(w.hole(h.tuer.x, h.tuer.y), T.TUER);
      assert.ok(ok[h.tuer.y * BREITE + h.tuer.x], `Haus bei ${h.x},${h.y} nicht erreichbar`);
    }
  });
}

test('Bewaffnete und Zombies nach Spielerzahl wie im Konzept', () => {
  assert.deepEqual([2, 5, 7, 10].map(bewaffnetSoll), [1, 2, 3, 4]);
  const z = [2, 5, 7, 10].map(zombieSoll);
  assert.ok(z[0] < z[1] && z[1] < z[2] && z[2] < z[3]);
  assert.equal(z[3], 45);
  assert.ok(Math.abs(z[0] / 45 - 0.3) < 0.05 && Math.abs(z[1] / 45 - 0.55) < 0.05 && Math.abs(z[2] / 45 - 0.75) < 0.05);
});

test('Ecken-Hilfe: knapp neben der Tür gegen die Wand laufen führt hinein', async () => {
  const { bewege } = await import('../client/welt.mjs');
  for (const seed of [1, 42, 1234]) {
    const w = baueWelt(seed);
    let geschafft = 0;
    for (const h of w.haeuser) {
      const oben = h.tuer.y === h.y;
      const richtung = oben ? 1 : -1;            // von der Straße aus ins Haus
      for (const versatz of [-12, 12]) {
        const p = { x: (h.tuer.x + 0.5) * KACHEL + versatz, y: (h.tuer.y + 0.5 - richtung * 1.2) * KACHEL };
        if (!frei(w, p.x, p.y, WERTE.spielerRadius)) continue;
        for (let i = 0; i < 60; i++) bewege(w, p, 0, richtung * 150 / 20, WERTE.spielerRadius);
        const ky = Math.floor(p.y / KACHEL);
        if (ky > h.y && ky < h.y + h.h - 1) geschafft++;
        else assert.fail(`Seed ${seed}, Haus ${h.x},${h.y}: bei Versatz ${versatz} nicht hineingekommen`);
      }
    }
    assert.ok(geschafft > 10);
  }
});

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
      // alle Häuser haben einen eigenen Innenraum: man muss auf die Türkachel kommen (dort wechselt man hinein)
      const oben = h.tuer.y === h.y;
      const richtung = oben ? 1 : -1;            // von der Straße aus zum Haus
      for (const versatz of [-12, 12]) {
        const p = { x: (h.tuer.x + 0.5) * KACHEL + versatz, y: (h.tuer.y + 0.5 - richtung * 1.2) * KACHEL };
        if (!frei(w, p.x, p.y, WERTE.spielerRadius)) continue;
        let drauf = false;
        for (let i = 0; i < 60 && !drauf; i++) {
          bewege(w, p, 0, richtung * 150 / 20, WERTE.spielerRadius);
          drauf = Math.floor(p.x / KACHEL) === h.tuer.x && Math.floor(p.y / KACHEL) === h.tuer.y;
        }
        if (drauf) geschafft++;
        else assert.fail(`Seed ${seed}, Haus ${h.x},${h.y}: bei Versatz ${versatz} nicht auf die Tür gekommen`);
      }
    }
    assert.ok(geschafft >= 3, "nur " + geschafft);
  }
});

test('Safe Rooms und Behälter: vier verschiedene, erreichbar, nicht in Wänden', async () => {
  const { safeRoomVon, blockiert } = await import('../client/welt.mjs');
  const { innenraumFuer } = await import('../client/innen.mjs');
  for (const seed of [1, 42, 1234, 77777]) {
    const w = baueWelt(seed);
    assert.equal(w.safeRooms.length, 4, `Seed ${seed}`);
    assert.equal(new Set(w.safeRooms.map(s => s.haus)).size, 4);
    assert.deepEqual(w.safeRooms.map(s => s.name), ['Feuerwehrhaus', 'Sakristei', 'Lagerraum', 'Keller']);
    const sx = Math.floor(w.start.x / KACHEL), sy = Math.floor(w.start.y / KACHEL);
    const ok = erreichbar(w, sx, sy);
    for (const s of w.safeRooms) {
      // Safe Rooms sind Innenräume: betretbar, Tür von draußen erreichbar, drinnen Kiste, keine Zombies, keine Treppen
      assert.ok(s.haus.betretbar, `${s.name}: nicht betretbar`);
      assert.equal(s.ebene, `h${s.haus.nr}eg`);
      assert.ok(ok[s.haus.tuer.y * BREITE + s.haus.tuer.x], `${s.name}: Tür nicht erreichbar`);
      const innen = innenraumFuer(seed, w, s.ebene);
      assert.equal(innen.safe, s.id);
      assert.equal(innen.zombiePlaetze.length, 0, `${s.name}: Zombies drin`);
      assert.equal(innen.treppen.length, 0, `${s.name}: Treppen`);
      assert.ok(innen.tueren.every(t => !t.verschlossen && t.offen), `${s.name}: Türen zu`);
      assert.equal(innen.hole(Math.floor(innen.kiste.x / KACHEL), Math.floor(innen.kiste.y / KACHEL)), T.BODEN, `${s.name}: Kiste nicht auf dem Boden`);
      assert.equal(safeRoomVon(w, { ebene: s.ebene }), s);
    }
    assert.equal(safeRoomVon(w, { ebene: '' }), null);
    assert.ok(w.behaelter.length >= 8, `zu wenige Behälter: ${w.behaelter.length}`);   // draußen nur Autos
    assert.ok(w.behaelter.filter(b => b.art === 'auto').length >= 8, 'zu wenige Autos');
    for (const b of w.behaelter) {
      const bx = Math.floor(b.x / KACHEL), by = Math.floor(b.y / KACHEL);
      if (b.art === 'bus') {   // Bus ist ein Hindernis – durchsucht wird von der Seite
        assert.ok([[0, 1], [0, -1], [1, 0], [-1, 0]].some(([dx, dy]) => ok[(by + dy) * BREITE + bx + dx]), `${b.id} von keiner Seite erreichbar`);
        continue;
      }
      assert.ok(!blockiert(w, b.x, b.y), `${b.id} steht in einer Wand`);
      assert.ok(ok[by * BREITE + bx], `${b.id} nicht erreichbar`);
    }
    assert.equal(new Set(w.behaelter.map(b => b.id)).size, w.behaelter.length);
  }
});

test('Fundhäufigkeit: 0 = nie, 20 = etwa doppelt so oft, 10 = wie bisher', async () => {
  const { ziehe, zufall } = await import('../client/welt.mjs');
  const tab = ['a', 'b', null, null];
  const zaehle = (f) => { const r = zufall(7), z = { a: 0, b: 0, null: 0 }; for (let i = 0; i < 20000; i++) z[ziehe(tab, f, r)]++; return z; };
  const normal = zaehle({});
  assert.ok(Math.abs(normal.a / 20000 - 0.25) < 0.02);
  assert.equal(zaehle({ a: 0 }).a, 0);
  const doppelt = zaehle({ a: 20 });
  assert.ok(Math.abs(doppelt.a / 20000 - 0.4) < 0.02, 'a bei 20: ' + doppelt.a);   // 2/(2+1+1+1)
});

test('Tag/Nacht-Zeiten einstellbar: Helligkeit folgt tagAb/nachtAb, Vorgabe 7:00/21:30', async () => {
  const { helligkeit, istNacht, setzeTageszeiten } = await import('../client/welt.mjs');
  try {
    assert.equal(helligkeit(12 * 60), 1); assert.equal(helligkeit(23 * 60), 0); assert.equal(helligkeit(6.5 * 60), 0.5);
    setzeTageszeiten(9 * 60, 20 * 60);                    // Tag ab 9:00, Nacht ab 20:00
    assert.equal(helligkeit(8.5 * 60), 0.5);              // Morgendämmerung 8–9
    assert.equal(helligkeit(19.5 * 60), 0.5);             // Abenddämmerung 19–20
    assert.ok(istNacht(20 * 60 + 1) && !istNacht(12 * 60));
    setzeTageszeiten(600, 690);                           // zu kurz für zwei Dämmerungen: wird ignoriert
    assert.equal(helligkeit(8.5 * 60), 0.5);
  } finally { setzeTageszeiten(420, 1290); }
  const { bereinige } = await import('../server/einstellungen.mjs');
  const w = bereinige({ tagAb: 9999, nachtAb: 1300 }, {});
  assert.equal(w.tagAb, 660); assert.equal(w.nachtAb, 1305);
});

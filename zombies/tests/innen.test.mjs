// Abnahmetests für den Innenraum-Generator (client/innen.mjs)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KACHEL, BREITE, HOEHE, T } from '../client/welt.mjs';
import { baueInnenraum, MOEBEL_NAMEN } from '../client/innen.mjs';

const GEHBAR = new Set([T.BODEN, T.TUER_OFFEN, T.INNENTUER, T.AUSGANG, T.TREPPE_RUNTER, T.TREPPE_HOCH]);
const kachel = p => [Math.floor(p.x / KACHEL), Math.floor(p.y / KACHEL)];

function pruefe(r, info) {
  const { kacheln, hole } = r;
  assert.equal(kacheln.length, BREITE * HOEHE, info);
  assert.ok(r.ox + r.b <= BREITE && r.oy + r.h <= HOEHE, info + ' passt nicht ins Raster');
  // Außenwand geschlossen (außer Ausgang)
  for (let x = r.ox; x < r.ox + r.b; x++) for (const y of [r.oy, r.oy + r.h - 1]) {
    assert.ok([T.WAND, T.AUSGANG].includes(hole(x, y)), `${info}: Außenwand offen bei ${x},${y}`);
  }
  for (let y = r.oy; y < r.oy + r.h; y++) for (const x of [r.ox, r.ox + r.b - 1]) {
    assert.ok([T.WAND, T.AUSGANG].includes(hole(x, y)), `${info}: Außenwand offen bei ${x},${y}`);
  }
  // alle begehbaren Kacheln vom Start erreichbar (Türen gelten als offen)
  const [sx, sy] = kachel(r.start);
  assert.ok(GEHBAR.has(hole(sx, sy)), `${info}: Start nicht begehbar`);
  const gesehen = new Set([sy * BREITE + sx]), q = [[sx, sy]];
  for (let i = 0; i < q.length; i++) {
    const [x, y] = q[i];
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      const k = ny * BREITE + nx;
      if (gesehen.has(k) || !GEHBAR.has(hole(nx, ny))) continue;
      gesehen.add(k); q.push([nx, ny]);
    }
  }
  let gesamt = 0;
  for (let y = 0; y < HOEHE; y++) for (let x = 0; x < BREITE; x++) if (GEHBAR.has(hole(x, y))) gesamt++;
  assert.equal(gesehen.size, gesamt, `${info}: ${gesamt - gesehen.size} Kacheln nicht erreichbar`);
  // Türen
  for (const t of r.tueren) assert.equal(hole(t.x, t.y), T.INNENTUER, info + ' Tür falsch');
  // keine Möbel neben Türen, Ausgang, Treppen
  const frei = [...r.tueren, ...r.treppen, ...(r.ausgang ? [r.ausgang] : [])];
  for (const f of frei) for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    if (!(Math.abs(dx) <= 1 && Math.abs(dy) <= 1) && dx !== 0 && dy !== 0) continue;
    assert.notEqual(hole(f.x + dx, f.y + dy), T.MOEBEL, `${info}: Möbel zu nah an ${f.x},${f.y}`);
  }
  for (const m of r.moebel) {
    assert.ok(MOEBEL_NAMEN[m.art], `${info}: Möbel ohne Namen ${m.art}`);
    for (let dy = 0; dy < m.h; dy++) for (let dx = 0; dx < m.b; dx++) assert.equal(hole(m.x + dx, m.y + dy), T.MOEBEL, `${info}: Möbelfläche`);
  }
  for (const b of r.behaelter) {
    const [bx, by] = kachel(b);
    assert.equal(hole(bx, by), T.MOEBEL, `${info}: Behälter ${b.id} nicht an einem Möbel`);
    assert.ok(['schrank', 'kuehlschrank', 'spind', 'bad', 'herd', 'spuele'].includes(b.art), `${info}: Behälterart ${b.art}`);
    assert.ok([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => GEHBAR.has(hole(bx + dx, by + dy))), `${info}: Behälter ${b.id} unerreichbar`);
  }
  for (const z of r.zombiePlaetze) assert.equal(hole(...kachel(z)), T.BODEN, info + ' Zombieplatz');
}

for (const seed of [1, 42, 1234]) {
  test(`Innenräume für Karte ${seed}`, () => {
    let keller = 0, dach = 0, verschlossen = 0, tueren = 0;
    for (let nr = 0; nr < 10; nr++) {
      const seite = ['unten', 'oben', 'links', 'rechts'][nr % 4];
      const eg = baueInnenraum(seed, nr, 'eg', seite);
      pruefe(eg, `eg ${seed}/${nr}`);
      assert.ok(eg.ausgang && eg.hole(eg.ausgang.x, eg.ausgang.y) === T.AUSGANG, 'Ausgang');
      const richtig = { oben: eg.ausgang.y === eg.oy, unten: eg.ausgang.y === eg.oy + eg.h - 1,
        links: eg.ausgang.x === eg.ox, rechts: eg.ausgang.x === eg.ox + eg.b - 1 }[seite];
      assert.ok(richtig, `Ausgang auf der falschen Seite (${seite})`);
      assert.ok(eg.raeume.length >= 4, `eg ${seed}/${nr}: nur ${eg.raeume.length} Zimmer`);
      assert.ok(eg.moebel.length >= 6 && eg.behaelter.length >= 2, `eg ${seed}/${nr}: zu wenig Möbel/Behälter`);
      assert.equal(eg.treppen.some(t => t.ziel === 'keller'), eg.hatKeller);
      assert.equal(eg.treppen.some(t => t.ziel === 'dach'), eg.hatDach);
      tueren += eg.tueren.length; verschlossen += eg.tueren.filter(t => t.verschlossen).length;
      if (eg.hatKeller) {
        keller++;
        const k = baueInnenraum(seed, nr, 'keller');
        pruefe(k, `keller ${seed}/${nr}`);
        assert.ok(k.treppen.some(t => t.ziel === 'eg'));
      }
      if (eg.hatDach) {
        dach++;
        const d = baueInnenraum(seed, nr, 'dach');
        pruefe(d, `dach ${seed}/${nr}`);
        assert.ok(d.treppen.some(t => t.ziel === 'eg'));
      }
      assert.deepEqual(baueInnenraum(seed, nr, 'eg', seite).kacheln, eg.kacheln, 'nicht deterministisch');
    }
    assert.ok(keller >= 2 && dach >= 1, `Keller ${keller}, Dach ${dach}`);
    assert.ok(verschlossen >= 3 && verschlossen < tueren * 0.5, `verschlossen ${verschlossen}/${tueren}`);
  });
}

test('Läden: Verkaufsraum mit Regalreihen und Kasse, Regale durchsuchbar', () => {
  let regale = 0;
  for (let nr = 0; nr < 8; nr++) {
    const r = baueInnenraum(5, nr, 'eg', ['unten', 'oben', 'links', 'rechts'][nr % 4], true);
    assert.ok(r.raeume.some(x => x.typ === 'verkaufsraum'), 'kein Verkaufsraum');
    assert.ok(r.moebel.some(m => m.art === 'kasse') || r.moebel.filter(m => m.art === 'regal_lang').length >= 2, 'keine Ladeneinrichtung');
    regale += r.behaelter.filter(b => b.art === 'laden').length;
    // alle Bodenkacheln erreichbar (gleiche Prüfung wie bei Wohnhäusern, ohne Behälterart-Prüfung)
    const GEH = new Set([T.BODEN, T.TUER_OFFEN, T.INNENTUER, T.AUSGANG, T.TREPPE_RUNTER, T.TREPPE_HOCH]);
    const sx = Math.floor(r.start.x / KACHEL), sy = Math.floor(r.start.y / KACHEL);
    const seen = new Set([sy * BREITE + sx]), q = [[sx, sy]];
    for (let i = 0; i < q.length; i++) { const [x, y] = q[i]; for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) { const k = ny * BREITE + nx; if (!seen.has(k) && GEH.has(r.hole(nx, ny))) { seen.add(k); q.push([nx, ny]); } } }
    let ges = 0; for (let y = 0; y < HOEHE; y++) for (let x = 0; x < BREITE; x++) if (GEH.has(r.hole(x, y))) ges++;
    assert.equal(seen.size, ges, `Laden ${nr}: ${ges - seen.size} Kacheln nicht erreichbar`);
  }
  assert.ok(regale >= 12, `nur ${regale} Regale in 8 Läden`);
});

test('Möbel berühren sich nie nur über Eck (man kommt immer vorbei)', () => {
  for (const seed of [1, 7, 42, 99, 1234]) for (let nr = 0; nr < 12; nr++) for (const stock of ['eg', 'keller']) {
    const r = baueInnenraum(seed, nr, stock, ['unten', 'oben', 'links', 'rechts'][nr % 4]);
    const m = (x, y) => r.hole(x, y) === T.MOEBEL;
    for (let y = r.oy; y < r.oy + r.h - 1; y++) for (let x = r.ox; x < r.ox + r.b - 1; x++) {
      if (m(x, y) && m(x + 1, y + 1) && !m(x + 1, y) && !m(x, y + 1)) assert.fail(`${stock} ${seed}/${nr}: Eck-Berührung bei ${x},${y}`);
      if (m(x + 1, y) && m(x, y + 1) && !m(x, y) && !m(x + 1, y + 1)) assert.fail(`${stock} ${seed}/${nr}: Eck-Berührung bei ${x + 1},${y}`);
    }
  }
});

// PROTOTYP Innenräume im Feinraster (client/innen_fein.mjs, Schalter INNEN_FEIN): Aufbau deterministisch, Wände dünn,
// Türen/Treppen/Behälter/Ausgang für die echte Spielerfigur (frei() mit Innenradius) erreichbar.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { setzeKartengroesse, setzeInnenFein, setzeTuerKacheln, INNEN_FEIN, T, frei, WERTE as W, kachelVon, weltFingerabdruck } from '../client/welt.mjs';
import { baueWeltAusKarte } from '../client/osmwelt.mjs';
import { innenraumFuer } from '../client/innen.mjs';

const standardAus = INNEN_FEIN;   // vor dem Einschalten unten
test('Schalter ist standardmäßig aus', () => assert.equal(standardAus, false));

const karte = JSON.parse(fs.readFileSync(new URL('../client/karten/geretsried.json', import.meta.url)));
setzeKartengroesse(karte.breite, karte.hoehe);
const welt = baueWeltAusKarte(karte, 12345);
const fpAus = weltFingerabdruck(welt);
setzeInnenFein(true);

test('Fingerabdruck der Außenwelt ändert sich nur im Schalter-Modus', () => assert.notEqual(weltFingerabdruck(welt), fpAus));

const haeuser = welt.haeuser.filter(h => h.betretbar && !h.safe);
const laeden = haeuser.filter(h => h.art && h.name).slice(0, 12);
const wohn = haeuser.filter(h => !h.art).slice(0, 25);

function erreichbar(w) {   // Zellen, auf denen die Spielerfigur (echte Kollision) stehen kann und die vom Start aus erreichbar sind (Zimmertüren gelten als offen)
  for (const t of w.tueren) setzeTuerKacheln(w, t, true);
  const B = w.breite, H = w.hoehe, K = w.kachel, s = new Uint8Array(B * H);
  const sx = Math.floor(w.start.x / K), sy = Math.floor(w.start.y / K), q = [sy * B + sx];
  assert.ok(frei(w, w.start.x, w.start.y, W.spielerRadius), 'Start nicht frei');
  s[q[0]] = 1;
  for (let a = 0; a < q.length; a++) {
    const i = q[a], x = i % B, y = (i - x) / B;
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      if (nx < 0 || ny < 0 || nx >= B || ny >= H || s[ny * B + nx]) continue;
      if (!frei(w, (nx + 0.5) * K, (ny + 0.5) * K, W.spielerRadius)) continue;
      s[ny * B + nx] = 1; q.push(ny * B + nx);
    }
  }
  return s;
}
const nahe = (s, B, x, y, r = 1) => { for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (s[(y + dy) * B + x + dx]) return true; return false; };

for (const [name, liste] of [['Wohnhäuser', wohn], ['Läden', laeden]]) {
  test(`Feinraster ${name}: Aufbau, Wände, Erreichbarkeit`, () => {
    assert.ok(liste.length > 3);
    for (const h of liste) for (const stock of ['eg', 'keller', 'dach']) {
      const ebene = `h${h.nr}${stock}`, info = `${ebene} (${h.name || h.art || 'Wohnhaus'})`;
      const w = innenraumFuer(3, welt, ebene), w2 = innenraumFuer(3, welt, ebene);
      assert.equal(w.kachel, 2, info);
      assert.deepEqual(w.kacheln, w2.kacheln, info + ' nicht deterministisch');
      assert.deepEqual(w.moebel, w2.moebel);
      for (const t of w.tueren) assert.ok(t.zellen.length >= 4 && t.zellen.every(([x, y]) => w.hole(x, y) === T.INNENTUER), info + ' Tür');
      const s = erreichbar(w), B = w.breite;
      for (const t of w.tueren) assert.ok(t.zellen.some(([x, y]) => nahe(s, B, x, y, 3)), `${info}: Tür ${t.x},${t.y} unerreichbar`);
      for (const t of w.treppen) assert.ok(t.zellen.some(([x, y]) => nahe(s, B, x, y, 3)), `${info}: Treppe unerreichbar`);
      if (stock === 'eg') {
        assert.ok(w.ausgang, info + ' ohne Haustür');
        assert.ok(w.ausgang.zellen.some(([x, y]) => nahe(s, B, x, y, 3)), info + ' Haustür unerreichbar');
        assert.ok(w.ausgang.zellen.every(([x, y]) => w.hole(x, y) === T.AUSGANG));
      }
      for (const b of w.behaelter) {
        const cx = Math.floor(b.x / w.kachel), cy = Math.floor(b.y / w.kachel);
        assert.equal(w.hole(cx, cy), T.MOEBEL, `${info}: Behälter ${b.id} nicht auf Möbel`);
        assert.ok(nahe(s, B, cx, cy, 6), `${info}: Behälter ${b.id} unerreichbar`);
      }
      for (const z of w.zombiePlaetze) assert.ok(frei(w, z.x, z.y, W.zombieRadius), info + ' Zombieplatz');
      // Wanddicke: nirgends ein Wandblock von 4 × 4 Zellen (1 m); innere Wände 1 Zelle, Außenwand 2 Zellen
      for (let y = 0; y < w.hoehe - 3; y++) for (let x = 0; x < B - 3; x++) {
        let voll = true;
        for (let dy = 0; dy < 4 && voll; dy++) for (let dx = 0; dx < 4; dx++) if (w.hole(x + dx, y + dy) !== T.WAND) { voll = false; break; }
        assert.ok(!voll, `${info}: Wandblock 1 m x 1 m bei ${x},${y}`);
      }
    }
  });
}

test('Grundriss entspricht dem OSM-Umriss (Innenmaß ≈ Umrissfläche abzüglich Wände)', () => {
  for (const h of wohn.slice(0, 15)) {
    const w = innenraumFuer(1, welt, `h${h.nr}eg`), p = h.umriss;
    let a = 0; for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) a += p[j] * p[i + 1] - p[i] * p[j + 1];
    const flaecheUmriss = Math.abs(a) / 2 * 16;   // m² (4 m je Kachel)
    let boden = 0; for (let i = 0; i < w.kacheln.length; i++) if (w.kacheln[i] !== T.LEER) boden++;
    const gesamt = boden / 16;
    assert.ok(Math.abs(gesamt - flaecheUmriss) / flaecheUmriss < 0.08, `Haus ${h.nr}: ${gesamt.toFixed(0)} m² statt ${flaecheUmriss.toFixed(0)} m²`);
    assert.equal(kachelVon(w), 2);
  }
});

test('Safe Rooms im Feinraster: Vorratskiste, Kühlschrank, Funktisch, Feldbetten, alles offen, keine Treppen; Kiste und Kühlschrank erreichbar', () => {
  const safes = welt.haeuser.filter(h => h.betretbar && h.safe);
  assert.ok(safes.length >= 3);
  for (const h of safes) {
    const w = innenraumFuer(3, welt, `h${h.nr}eg`), info = `${h.safe} (h${h.nr})`;
    assert.equal(w.kachel, 2, info);
    assert.equal(w.safe, h.safeId); assert.equal(w.safeName, h.safe);
    assert.ok(w.kiste && w.kuehlschrank, info + ': Kiste/Kühlschrank');
    for (const art of ['funktisch', 'vorratskiste', 'safe_kuehlschrank', 'erstehilfe', 'generator']) assert.ok(w.moebel.some(m => m.art === art), `${info}: ${art} fehlt`);
    assert.ok(w.moebel.filter(m => m.art === 'feldbett').length >= 2, info + ': Feldbetten');
    assert.equal(w.treppen.length, 0); assert.equal(w.hatKeller, false); assert.equal(w.hatDach, false);
    assert.ok(w.tueren.every(t => !t.verschlossen && t.offen === true));
    assert.equal(w.zombiePlaetze.length, 0);
    const s = erreichbar(w), B = w.breite;
    for (const ziel of [w.kiste, w.kuehlschrank]) assert.ok(nahe(s, B, Math.floor(ziel.x / 2), Math.floor(ziel.y / 2), 6), info + ': nicht erreichbar');
    assert.ok(w.ausgang.zellen.some(([x, y]) => nahe(s, B, x, y, 3)));
    for (const b of w.behaelter) assert.ok(['vorratsregal', 'erstehilfe'].includes(b.art), info + ': Behälterart ' + b.art);
  }
});

test('Missionsort auf der Karte: Behälter liegt exakt im Gebäudeumriss (Umkehrung der Ausrichtung)', async () => {
  const { behaelterAufKarte } = await import('../server/mission.mjs');
  let geprueft = 0;
  for (const h of wohn.concat(laeden).slice(0, 40)) {
    const w = innenraumFuer(5, welt, `h${h.nr}eg`);
    if (!w.behaelter.length || !h.umriss) continue;
    for (const b of w.behaelter.slice(0, 4)) {
      const [px, py] = behaelterAufKarte(5, welt, h.nr, b), x = px / 32, y = py / 32, p = h.umriss;
      let drin = false;
      for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) if ((p[i + 1] > y) !== (p[j + 1] > y) && x < (p[j] - p[i]) * (y - p[i + 1]) / (p[j + 1] - p[i + 1]) + p[i]) drin = !drin;
      assert.ok(drin, `Haus ${h.nr}: Behälter ${b.id} bei ${x.toFixed(1)},${y.toFixed(1)} liegt außerhalb des Umrisses`);
      geprueft++;
    }
  }
  assert.ok(geprueft > 30);
});

test('Plausibilitätsprüfung: fast alle Häuser maßstäblich, der Rest (zu groß/verwinkelt) im groben Raster; Stockwerke eines Hauses gleich', () => {
  let fein = 0, gesamt = 0;
  for (const h of welt.haeuser.filter(h => h.betretbar)) {
    const eg = innenraumFuer(2, welt, `h${h.nr}eg`);
    gesamt++;
    if (eg.kachel) fein++;
    for (const st of ['keller', 'dach']) {
      if (st === 'keller' ? !eg.hatKeller : !eg.hatDach) continue;
      const w = innenraumFuer(2, welt, `h${h.nr}${st}`);
      assert.equal(!!w.kachel, !!eg.kachel, `Haus ${h.nr}: ${st} im anderen Raster als das Erdgeschoss`);
      assert.ok(w.treppen.length >= 1, `Haus ${h.nr}: ${st} ohne Treppe zurück`);
    }
  }
  assert.ok(fein / gesamt > 0.95, `nur ${fein}/${gesamt} maßstäblich`);
});

test('Außerhalb des Schalters bleibt alles beim Alten: ohne Schalter kein kachel-Feld, Fingerabdruck wie ohne Innenräume', () => {
  setzeInnenFein(false);
  try {
    const h = welt.haeuser.find(h => h.betretbar && !h.safe);
    const w = innenraumFuer(3, welt, `h${h.nr}eg`);
    assert.equal(w.kachel, undefined); assert.equal(w.tempo, undefined); assert.equal(w.reich, undefined);
    assert.equal(weltFingerabdruck(welt), fpAus);
  } finally { setzeInnenFein(true); }
});

// Bundeswehr-Stützpunkt (Teil 1): Lage, Teile, Kollision, Erreichbarkeit, Behälter – auf beiden OSM-Karten
import { test as testNode } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { KACHEL, T, BEUTE, BEHAELTER_NAME, setzeKartengroesse, frei, findeWeg, feinWert } from '../client/welt.mjs';
import { baueWeltAusKarte } from '../client/osmwelt.mjs';
import { zeichneStuetzpunktBoden, zeichneStuetzpunktOben, zeichnePumaTurm, zeichnePumaWanne, SP_KB, SP_KT, SP_PK } from '../client/stuetzpunkt.mjs';

function scheinCanvas() {
  let aufrufe = 0;
  const schein = new Proxy(function () {}, {
    get: (t, k) => k === 'aufrufe' ? aufrufe : k === 'measureText' ? () => ({ width: 10 }) : schein,
    set: () => true,
    apply: () => { aufrufe++; return schein; },
  });
  return schein;
}

for (const name of ['geretsried', 'geretsried2', 'isarauen']) {
  const karte = JSON.parse(fs.readFileSync(new URL(`../client/karten/${name}.json`, import.meta.url)));
  const baue = seed => { setzeKartengroesse(karte.breite, karte.hoehe); return baueWeltAusKarte(karte, seed); };
  const w = baue(7);
  const sp = w.stuetzpunkt;
  const test = (titel, fn) => testNode(titel, () => { setzeKartengroesse(karte.breite, karte.hoehe); fn(); });   // Kartengröße ist global

  test(`Stützpunkt ${name}: genau einer, im Rahmen, nicht auf Häusern/Wasser/Start, deterministisch`, () => {
    assert.ok(sp, 'kein Stützpunkt');
    assert.ok(['n', 's', 'o', 'w'].includes(sp.richtung));
    assert.ok(sp.x >= 1 && sp.y >= 1 && sp.x + sp.b < karte.breite && sp.y + sp.h < karte.hoehe);
    assert.ok(Math.max(sp.b, sp.h) === SP_KB && Math.min(sp.b, sp.h) === SP_KT);
    assert.ok(SP_KB * 4 <= 80 && SP_KT * 4 <= 60, 'Lagerfläche höchstens 80 × 60 m (echte Maße)');
    for (let y = sp.y; y < sp.y + sp.h; y++) for (let x = sp.x; x < sp.x + sp.b; x++) {
      assert.ok([T.WIESE, T.PLATZ, T.BAUM].includes(w.hole(x, y)), `Kachel ${x},${y} ist ${w.hole(x, y)}`);
      assert.notEqual(w.hole(x, y), T.BAUM, 'Bäume im Baufeld müssen weg sein');
    }
    const inBox = (px, py) => px >= sp.x * KACHEL && px < (sp.x + sp.b) * KACHEL && py >= sp.y * KACHEL && py < (sp.y + sp.h) * KACHEL;
    assert.ok(!inBox(w.start.x, w.start.y), 'Start im Stützpunkt');
    for (const s of w.safeRooms) assert.ok(!inBox((s.haus.x + 0.5) * KACHEL, (s.haus.y + 0.5) * KACHEL), 'Safe Room im Stützpunkt');
    for (const h of w.haeuser) assert.ok(!inBox((h.x + h.b / 2) * KACHEL, (h.y + h.h / 2) * KACHEL), 'Haus im Stützpunkt');
    assert.equal(w.stuetzpunkt, sp);
    const w2 = baue(7);
    assert.deepEqual(w2.stuetzpunkt, sp, 'nicht deterministisch');
    assert.equal(w2.behaelter.length, w.behaelter.length);
  });

  test(`Stützpunkt ${name}: Teile vollständig und innerhalb, Durchfahrt 7,2 m`, () => {
    const arten = a => sp.teile.filter(t => t.art === a);
    assert.equal(arten('puma').length, 1);
    assert.ok(arten('puma')[0].turm.x === arten('puma')[0].x && Number.isFinite(arten('puma')[0].turm.winkel));
    assert.ok(arten('sdraht').length >= 2);
    assert.equal(arten('durchfahrt').length, 1);
    assert.ok(Math.abs(Math.max(arten('durchfahrt')[0].b, arten('durchfahrt')[0].h) - 3 * SP_PK) < 1e-6, 'Durchfahrt 3 Bauplan-Einheiten (7,2 m)');
    assert.ok(arten('sandsack').length >= 2 && arten('mgnest').length >= 2 && arten('mgnest').length <= 3);
    assert.ok(arten('mgnest').every(n => Number.isFinite(n.blick)));
    assert.equal(arten('sanizelt').length, 1); assert.equal(arten('funkzelt').length, 1); assert.ok(arten('zelt').length >= 2);
    assert.ok(arten('feldbett').length >= 4 && arten('lkw').length === 1 && arten('container').length === 1 && arten('antenne').length === 1);
    const posten = r => sp.teile.filter(t => t.art === 'posten' && t.rolle === r);
    assert.equal(posten('arzt').length, 2);
    assert.ok(posten('verwundet').length >= 3 && posten('soldat').length >= 6);
    const rand = 24;   // Zeltwände und Leinen ragen etwas über die Teile hinaus
    for (const t of sp.teile) {
      const hb = (t.b ?? 0) / 2, hh = (t.h ?? 0) / 2;
      assert.ok(t.x - hb >= sp.x * KACHEL - rand && t.x + hb <= (sp.x + sp.b) * KACHEL + rand && t.y - hh >= sp.y * KACHEL - rand && t.y + hh <= (sp.y + sp.h) * KACHEL + rand, `${t.art} außerhalb`);
    }
    for (const s of sp.sperren) {
      const [a0, a1, b0, b1] = s.r ? [s.x - s.r, s.x + s.r, s.y - s.r, s.y + s.r] : [s.x0, s.x1, s.y0, s.y1];
      assert.ok(a0 >= sp.x * KACHEL - rand && a1 <= (sp.x + sp.b) * KACHEL + rand && b0 >= sp.y * KACHEL - rand && b1 <= (sp.y + sp.h) * KACHEL + rand, 'Sperre außerhalb');
    }
  });

  test(`Stützpunkt ${name}: Hindernisse im Feinraster, Durchfahrt frei, Zelte betretbar`, () => {
    const d = sp.teile.find(t => t.art === 'durchfahrt');
    assert.ok(frei(w, d.x, d.y, 11), 'Durchfahrt blockiert');
    const draht = sp.teile.find(t => t.art === 'sdraht');
    assert.equal(feinWert(w, draht.x, draht.y), 1);
    for (const t of sp.teile.filter(t => ['lkw', 'container', 'kiste', 'funktisch'].includes(t.art))) assert.equal(feinWert(w, t.x, t.y), 1, `${t.art} nicht fest`);
    for (const n of sp.teile.filter(t => t.art === 'mgnest')) assert.equal(feinWert(w, n.x, n.y), 1);
    for (const z of sp.teile.filter(t => ['sanizelt', 'funkzelt', 'zelt'].includes(t.art))) {
      assert.ok(frei(w, z.eingang.mitte[0], z.eingang.mitte[1], 11), `Eingang ${z.art} blockiert`);
      assert.ok(frei(w, z.eingang.aussen[0], z.eingang.aussen[1], 11), `vor ${z.art} blockiert`);
      assert.ok(frei(w, z.eingang.innen[0], z.eingang.innen[1], 11), `in ${z.art} blockiert`);
    }
  });

  test(`Stützpunkt ${name}: Durchfahrt, Sani-Zelt, Funkzelt, Lager und Kisten von welt.start erreichbar`, () => {
    const wege = (x, y) => findeWeg(w, w.start.x, w.start.y, x, y, 11, 400000);
    const d = sp.teile.find(t => t.art === 'durchfahrt');
    assert.ok(wege(...d.aussen), 'vor der Durchfahrt');
    assert.ok(wege(...d.innen), 'hinter der Durchfahrt');
    for (const z of sp.teile.filter(t => ['sanizelt', 'funkzelt', 'zelt'].includes(t.art))) {
      assert.ok(wege(...z.eingang.aussen), `Eingang ${z.art}`);
      assert.ok(wege(...z.eingang.innen), `Inneres ${z.art}`);
    }
    const funk = sp.teile.find(t => t.art === 'funkzelt');
    assert.ok(wege(...funk.funkpunkt), 'Funkpunkt');
    // jeder Behälter: ein freier, erreichbarer Standort in Reichweite (40 px)
    assert.ok(sp.behaelter.length >= 8);
    for (const id of sp.behaelter) {
      const b = w.behaelter.find(q => q.id === id);
      assert.ok(b, 'Behälter fehlt in welt.behaelter: ' + id);
      let ok = false;
      for (let a = 0; a < 16 && !ok; a++) for (const r of [26, 32, 36]) {
        const x = b.x + Math.cos(a / 16 * Math.PI * 2) * r, y = b.y + Math.sin(a / 16 * Math.PI * 2) * r;
        if (frei(w, x, y, 11) && wege(x, y)) { ok = true; break; }
      }
      assert.ok(ok, `${id} (${b.art}) nicht erreichbar`);
    }
  });

  test(`Stützpunkt ${name}: Behälter durchsuchbar (Beutetabellen, Namen, eindeutige Kennungen)`, () => {
    const ids = new Set();
    for (const id of sp.behaelter) {
      const b = w.behaelter.find(q => q.id === id);
      assert.ok(!ids.has(id)); ids.add(id);
      assert.ok(['bw_kiste', 'bw_container', 'sanikiste'].includes(b.art));
      if (b.art !== 'bw_kiste') assert.ok(BEUTE[b.art]?.some(Boolean), 'keine Beute für ' + b.art);   // Munitionskiste: Versorgung statt Beute
      assert.ok(BEHAELTER_NAME[b.art], 'kein Name für ' + b.art);
    }
    assert.equal(new Set(w.behaelter.map(b => b.id)).size, w.behaelter.length, 'doppelte Behälter-Kennung');
    assert.ok(sp.teile.some(t => t.art === 'kiste') && w.behaelter.some(b => b.art === 'sanikiste'));
  });

  test(`Stützpunkt ${name}: Zeichnen läuft durch (Boden, oben, Turm)`, () => {
    const rect = { x0: sp.x - 2, y0: sp.y - 2, x1: sp.x + sp.b + 2, y1: sp.y + sp.h + 2 };
    const boden = scheinCanvas(), oben = scheinCanvas(), turm = scheinCanvas(), wanne = scheinCanvas();
    zeichneStuetzpunktBoden(boden, w, rect); zeichneStuetzpunktOben(oben, w, rect); zeichnePumaTurm(turm); zeichnePumaWanne(wanne);
    assert.ok(boden.aufrufe > 500 && oben.aufrufe > 500 && turm.aufrufe > 20 && wanne.aufrufe > 20);
    const fern = scheinCanvas();
    zeichneStuetzpunktOben(fern, w, { x0: 0, y0: 0, x1: 2, y1: 2 });
    assert.equal(fern.aufrufe, 0, 'zeichnet außerhalb des Ausschnitts');
  });
}

testNode('Stützpunkt: Teile in echten Maßen (8 px = 1 m)', () => {
  const karte = JSON.parse(fs.readFileSync(new URL('../client/karten/geretsried2.json', import.meta.url)));
  setzeKartengroesse(karte.breite, karte.hoehe);
  const sp = baueWeltAusKarte(karte, 7).stuetzpunkt, m = px => px / 8;
  const arten = a => sp.teile.filter(t => t.art === a);
  const masse = t => [m(Math.max(t.w, t.d)), m(Math.min(t.w, t.d))];
  for (const t of arten('feldbett')) { const [l, b] = masse(t); assert.ok(l <= 2.2 && b <= 0.9, `Feldbett ${l} × ${b} m`); }
  for (const t of arten('kiste')) { const [l, b] = masse(t); assert.ok(l <= 1.5 && b <= 1, `Kiste ${l} × ${b} m`); }
  for (const t of arten('vorratskiste')) { const [l, b] = masse(t); assert.ok(l <= 1.5 && b <= 1, `Vorratskiste ${l} × ${b} m`); }
  for (const t of arten('container')) { const [l, b] = masse(t); assert.ok(l <= 6.2 && b <= 2.5, `Container ${l} × ${b} m`); }
  for (const t of arten('funktisch')) { const [l, b] = masse(t); assert.ok(l <= 2 && b <= 1, `Funktisch ${l} × ${b} m`); }
  for (const t of arten('sandsack')) { const [l, b] = masse(t); assert.ok(l <= 4 && b <= 3, `Sandsackstellung ${l} × ${b} m`); }
  for (const t of arten('mgnest')) assert.ok(m(2 * t.r) <= 4, 'MG-Nest Ø ' + m(2 * t.r));
  for (const t of arten('lkw')) assert.ok(m(t.laenge) <= 8.5 && m(t.breite) <= 2.6, 'LKW');
  for (const t of [...arten('zelt'), ...arten('funkzelt'), ...arten('sanizelt')]) { const [l, b] = masse(t); assert.ok(l <= 22 && b <= 15, `Zelt ${t.art} ${l} × ${b} m`); }
});

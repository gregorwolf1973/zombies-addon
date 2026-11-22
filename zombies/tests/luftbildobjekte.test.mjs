// Luftbild-Objekte (Bäume einzeln, Hecken, Pools, Schuppen, Beläge) im Weltaufbau – mit künstlichen Listen auf geretsried2
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { KACHEL, T, FEIN, setzeKartengroesse, weltFingerabdruck } from '../client/welt.mjs';
import { baueWeltAusKarte } from '../client/osmwelt.mjs';

after(() => setzeKartengroesse(64, 48));
const basis = JSON.parse(fs.readFileSync(new URL('../client/karten/geretsried2.json', import.meta.url)));
const echt = structuredClone(basis);
for (const f of ['autosLuftbild', 'autosLuftbildFenster', 'baeumeLuftbild', 'baeumeLuftbildFenster', 'poolsLuftbild', 'nebengebaeude']) delete basis[f];
const bauen = (k, seed = 4711) => { setzeKartengroesse(k.breite, k.hoehe); return baueWeltAusKarte(k, seed); };
const ohne = bauen(structuredClone(basis));

// freie Wiesenkacheln weit weg vom Start suchen
const wiesen = [];
for (let y = 60; y < basis.hoehe - 20 && wiesen.length < 400; y += 3) for (let x = 60; x < basis.breite - 20; x += 3) {
  let ok = true;
  for (let dy = -2; dy <= 2 && ok; dy++) for (let dx = -2; dx <= 2; dx++) if (ohne.hole(x + dx, y + dy) !== T.WIESE) { ok = false; break; }
  if (ok) wiesen.push([x, y]);
}

test('baeumeLuftbild: Stammkachel wird Baum, Krone ≥ 50 % mit, Liste baeumeEcht in echter Größe', () => {
  assert.ok(wiesen.length > 40);
  const k = structuredClone(basis);
  k.baeumeLuftbild = wiesen.slice(0, 40).map(([x, y]) => ({ x: (x + 0.5) * KACHEL, y: (y + 0.5) * KACHEL, d: 12, art: 'nadel' }));
  const w = bauen(k);
  assert.ok(w.baeumeEcht.length >= 10, `${w.baeumeEcht.length} angenommen`);   // der Rest liegt auf Flächen mit Freihalteregeln
  let mitKrone = 0;
  for (const b of w.baeumeEcht) {
    const x = Math.floor(b.x / KACHEL), y = Math.floor(b.y / KACHEL);
    assert.equal(w.hole(x, y), T.BAUM);
    assert.equal(b.d, 12); assert.equal(b.art, 'nadel');
    let n = 0; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (w.hole(x + dx, y + dy) === T.BAUM) n++;
    if (n >= 5) mitKrone++;
  }
  assert.ok(mitKrone >= 5, 'Kronenkacheln kommen dazu');
  assert.equal(ohne.baeumeEcht, undefined);
});

test('Bäume nicht auf Hauswänden, Straßen und nie ohne Stamm in baeumeEcht', () => {
  const k = structuredClone(basis); const h = ohne.haeuser[0];
  k.baeumeLuftbild = [{ x: (h.x + 0.5) * KACHEL, y: (h.y + 0.5) * KACHEL, d: 6, art: 'laub' }];
  const w = bauen(k);
  assert.equal(w.baeumeEcht.length, 0);
  assert.notEqual(w.hole(h.x, h.y), T.BAUM);
});

test('Hecken aus dem Luftbild: Zaun-Hecke, feines Raster blockiert, Zeichenlinie vorhanden', () => {
  const [x, y] = wiesen[20];
  const k = structuredClone(basis); k.heckenLuftbild = [{ p: [x * KACHEL, (y + 0.5) * KACHEL, (x + 3) * KACHEL, (y + 0.5) * KACHEL], b: 1.2 }];
  const w = bauen(k);
  assert.ok(w.details.zaeune.some(z => z.a === 'h' && z.p.some(v => Math.abs(v - (y + 0.5)) < 0.01)));
  const f = w.fein, fb = w.hole && k.breite * FEIN;
  let n = 0; for (let fx = x * FEIN; fx < (x + 3) * FEIN; fx++) if (f[(y * FEIN + 2) * fb + fx]) n++;
  assert.ok(n >= 4, `${n} Feinfelder`);
});

test('Pools (begehbar, Tempo 10 %), Schuppen (Hindernis), Beläge nur Darstellung', () => {
  const [x, y] = wiesen[30];
  const k = structuredClone(basis);
  const q = (a, b, c, d) => [a, b, c, b, c, d, a, d].map(v => v * KACHEL);
  k.poolsLuftbild = [{ p: q(x, y, x + 2, y + 2) }];
  k.schuppenLuftbild = [{ p: q(x + 8, y, x + 10, y + 1) }];
  k.belaegeLuftbild = [{ p: q(x, y + 6, x + 4, y + 8) }];
  const w = bauen(k), fb = k.breite * FEIN;
  const voll = (x0, y0, x1, y1) => { let n = 0; for (let fy = y0 * FEIN; fy < y1 * FEIN; fy++) for (let fx = x0 * FEIN; fx < x1 * FEIN; fx++) if (w.fein[fy * fb + fx]) n++; return n; };
  assert.equal(voll(x, y, x + 2, y + 2), 0, 'Pool ist kein Hindernis');
  assert.ok(voll(x + 8, y, x + 10, y + 1) >= 28);
  assert.equal(voll(x, y + 6, x + 4, y + 8), 0, 'Belag ist begehbar');
  assert.equal(w.poolsEcht.length, 1); assert.equal(w.schuppenEcht.length, 1); assert.equal(w.belaege.length, 1);
  assert.equal(ohne.belaege.length, 0);
});

test('Fingerabdruck stabil, Welt hängt von den Luftbild-Objekten ab', () => {
  const mk = () => { const k = structuredClone(basis); k.baeumeLuftbild = wiesen.slice(0, 40).map(([x, y]) => ({ x: (x + 0.5) * KACHEL, y: (y + 0.5) * KACHEL, d: 8, art: 'laub' })); return k; };
  const a = bauen(mk()), b = bauen(mk());
  assert.equal(weltFingerabdruck(a), weltFingerabdruck(b));
  assert.deepEqual(Array.from(a.kacheln), Array.from(b.kacheln));
  assert.notDeepEqual(Array.from(a.kacheln), Array.from(ohne.kacheln));
});

test('Echte Karte geretsried2: Nebengebäude als Hindernisse, keine Tür eingesperrt, Foto-Autos nie auf Hindernissen', async () => {
  const { tuerenOhneWeg } = await import('../client/osmwelt.mjs');
  const w = bauen(structuredClone(echt));
  assert.ok(echt.nebengebaeude.length > 900);
  assert.ok(w.nebengebaeude.length > 450, `${w.nebengebaeude.length} Nebengebäude gesetzt`);
  assert.ok(w.nebengebaeude.every(n => n.p.length >= 6 && ['garage', 'gartenhaus', 'carport', 'neben'].includes(n.art)));
  const ohneNeben = bauen(Object.assign(structuredClone(echt), { nebengebaeude: [] }));
  const vorher = new Set(tuerenOhneWeg(ohneNeben).map(h => h.x + ',' + h.y));
  const neu = tuerenOhneWeg(w).filter(h => !vorher.has(h.x + ',' + h.y));
  assert.equal(neu.length, 0, 'Nebengebäude sperren kein Haus ein');
  assert.ok(w.baeumeEcht.length > 100 && w.poolsEcht.length >= 5, `${w.baeumeEcht.length} Bäume`);
  assert.equal(weltFingerabdruck(w), weltFingerabdruck(bauen(structuredClone(echt))));
});

test('Weltcode der Luftbild-Objekte ohne Winkelfunktionen und Zufall', () => {
  for (const f of ['luftbildobjekte.mjs', 'luftbild.mjs']) {
    const q = fs.readFileSync(new URL('../client/' + f, import.meta.url), 'utf8').replace(/\/\/.*$/gm, '');
    assert.ok(!/Math\.(sin|cos|tan|atan2?|random)/.test(q), f);
  }
});

test('Gelesene Gebiete: Foto-Autos ersetzen die zufälligen nur im Fenster, Bäume dort aus der Liste, sonst Kachel-Klassifikation', () => {
  const k = structuredClone(basis);
  const hx = basis.breite * KACHEL / 2, hy = basis.hoehe * KACHEL / 2;
  k.autosLuftbild = [{ x: 100 * KACHEL, y: 100 * KACHEL, winkel: 0, farbe: 1 }];
  k.autosLuftbildFenster = [[0, 0, hx, hy]];
  const w = bauen(k);
  const zufall = w.behaelter.filter(b => b.art === 'auto' && (b.platz === 'parkplatz' || b.platz === 'bucht'));
  assert.ok(zufall.length > 0, 'außerhalb des Fensters bleiben zufällige Parkplatz-/Buchtautos');
  assert.ok(zufall.every(b => !(b.x < hx && b.y < hy)), 'im Fenster keine zufälligen');
  const ganz = bauen(Object.assign(structuredClone(basis), { autosLuftbild: k.autosLuftbild }));
  assert.equal(ganz.behaelter.filter(b => b.art === 'auto' && (b.platz === 'parkplatz' || b.platz === 'bucht')).length, 0, 'ohne Fensterliste gilt die ganze Karte');
  // Bäume: mit Fenster bleiben außerhalb die Klassifikations-Bäume, ohne Fenster nur die Liste
  const kb = structuredClone(basis); kb.baeumeLuftbild = [{ x: 90 * KACHEL, y: 90 * KACHEL, d: 8, art: 'laub' }];
  const alle = bauen(structuredClone(kb));
  kb.baeumeLuftbildFenster = [[0, 0, 10 * KACHEL, 10 * KACHEL]];
  const teil = bauen(kb);
  const zaehle = w2 => { let n = 0; for (let y = 0; y < basis.hoehe; y++) for (let x = 0; x < basis.breite; x++) if (w2.hole(x, y) === T.BAUM) n++; return n; };
  assert.ok(zaehle(teil) > zaehle(alle) + 200, `${zaehle(teil)} gegen ${zaehle(alle)}`);
});

// Kulisse „Echt“: Schalter, Kachelwahl, Speichergrenze, Index/Dachdaten lesen, Schatten – und Autos aus dem Luftbild (autosLuftbild) im Weltaufbau
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { KACHEL, T, setzeKartengroesse, weltFingerabdruck } from '../client/welt.mjs';
import { baueWeltAusKarte } from '../client/osmwelt.mjs';
import { parkplatzBuchten } from '../client/vektor.mjs';
import { KUL_SCHLUESSEL, schalterLesen, indexLesen, kachelnFuerRect, puffer, PUFFER_MAX, daecherLesen, flaecheAufbereiten,
  schattenFaktor, SCHATTEN_JE_M, SONNE, bodenArt } from '../client/kulisse_regeln.mjs';

after(() => setzeKartengroesse(64, 48));
const lade = n => JSON.parse(fs.readFileSync(new URL(`../client/karten/${n}.json`, import.meta.url)));

test('Schalter: Standard alle an, nur ein ausdrückliches „aus“ schaltet ab, jede Kombination möglich', () => {
  assert.deepEqual(schalterLesen(null, undefined, ''), { boden: true, daecher: true, schatten: true, gezeichnet: true });
  for (let m = 0; m < 16; m++) {
    const w = [m & 1, m & 2, m & 4, m & 8].map(b => (b ? 'an' : 'aus'));
    assert.deepEqual(schalterLesen(...w), { boden: !!(m & 1), daecher: !!(m & 2), schatten: !!(m & 4), gezeichnet: !!(m & 8) });
  }
  assert.equal(new Set(Object.values(KUL_SCHLUESSEL)).size, 4);
});

test('Bodenart: Luftbild hat Vorrang vor dem gezeichneten Boden, einzeln schaltbar, ohne Daten nichts', () => {
  const an = (boden, gezeichnet) => ({ boden, gezeichnet, daecher: true, schatten: true });
  assert.equal(bodenArt(an(true, true), true, true), 'foto');      // beide an: Luftbild gewinnt
  assert.equal(bodenArt(an(false, true), true, true), 'gez');      // nur gezeichnet
  assert.equal(bodenArt(an(true, false), true, true), 'foto');
  assert.equal(bodenArt(an(false, false), true, true), null);
  assert.equal(bodenArt(an(true, true), false, true), 'gez');      // kein Luftbild in den Daten
  assert.equal(bodenArt(an(true, true), true, false), 'foto');
  assert.equal(bodenArt(an(true, true), false, false), null);
});

test('Index: gültig, ohne Foto/Dächer unbrauchbar', () => {
  assert.equal(indexLesen(null), null);
  assert.equal(indexLesen({ kachel: 32 }), null);
  const i = indexLesen({ kachel: 32, px: 512, nx: 11, ny: 14, foto: true, daecher: true, quelle: 'Q', format: 'webp' });
  assert.deepEqual([i.kachel, i.nx, i.ny, i.foto, i.daecher, i.quelle], [32, 11, 14, true, true, 'Q']);
  assert.equal(indexLesen({ daecher: true }).foto, false);   // nur Dächer: kein Luftbild-Boden
  assert.equal(indexLesen({ daecher: true, boden: true }).boden, true); assert.equal(i.boden, false);   // Hinweis auf boden/index.json
});

test('Kachelwahl für einen Sichtbereich', () => {
  const idx = indexLesen({ kachel: 32, nx: 11, ny: 14, foto: true });
  assert.deepEqual(kachelnFuerRect(idx, { x0: 0, y0: 0, x1: 16, y1: 16 }), [[0, 0]]);                       // Stück liegt in einer Bildkachel
  assert.deepEqual(kachelnFuerRect(idx, { x0: 16, y0: 16, x1: 32, y1: 32 }), [[0, 0]]);
  assert.deepEqual(kachelnFuerRect(idx, { x0: 30, y0: 30, x1: 34, y1: 34 }), [[0, 0], [1, 0], [0, 1], [1, 1]]);
  assert.deepEqual(kachelnFuerRect(idx, { x0: 336, y0: 416, x1: 352, y1: 432 }), [[10, 13]]);               // Rand der Karte
  assert.deepEqual(kachelnFuerRect(idx, { x0: 400, y0: 0, x1: 416, y1: 16 }), []);                          // außerhalb
  assert.deepEqual(kachelnFuerRect(indexLesen({ daecher: true }), { x0: 0, y0: 0, x1: 16, y1: 16 }), []);
});

test('Speichergrenze: nie mehr als 12 Kacheln, Gewünschtes bleibt, Ältestes geht zuerst', () => {
  const vorh = Array.from({ length: 12 }, (_, i) => 'v' + i);    // v0 am längsten unbenutzt
  let r = puffer(['n1', 'n2', 'v5'], vorh, []);
  assert.equal(r.laden.length, 2, 'beide neuen können geladen werden');
  assert.deepEqual(r.entladen, ['v0', 'v1']);
  assert.ok(!r.entladen.includes('v5'));
  // laufende Ladevorgänge zählen mit; höchstens 3 gleichzeitig
  r = puffer(['a', 'b', 'c', 'd', 'e'], [], []);
  assert.deepEqual(r.laden, ['a', 'b', 'c']);
  r = puffer(['a', 'b', 'c', 'd'], [], ['a', 'b']);
  assert.deepEqual(r.laden, ['c']);
  // Wunsch über dem Limit wird gekappt
  const viele = Array.from({ length: 30 }, (_, i) => 'k' + i);
  let da = [], laedt = [];
  for (let i = 0; i < 40; i++) {
    r = puffer(viele, da, laedt);
    da = da.filter(k => !r.entladen.includes(k)).concat(r.laden);    // geladen = sofort da
    assert.ok(da.length + laedt.length <= PUFFER_MAX);
  }
  assert.equal(da.length, PUFFER_MAX);
  assert.deepEqual(da, viele.slice(0, PUFFER_MAX));
});

test('Dachdaten lesen und aufbereiten', () => {
  const m = daecherLesen({ g: [
    { k: [10, 20], h: 95, t: 60, f: [{ p: [0, 0, 80, 0, 80, 40, 0, 40], n: 30, a: 90, e: 60 }] },
    { k: [10, 20], h: 30, t: 30, f: [] },
    { k: [1, 2], h: 70, t: 70, f: [{ p: [0, 0, 8, 0, 8, 8], n: 0, a: -1, e: 70 }] },
    { kaputt: true },
  ] });
  assert.equal(m.size, 2);
  assert.equal(m.get('10,20').length, 2);
  assert.equal(m.get('10,20')[0].h, 9.5);
  assert.equal(daecherLesen(null).size, 0);
  // Satteldach: Fläche fällt nach Osten (a = 90): Westkante ist die höchste, Ostkante die Traufe (e)
  const f = flaecheAufbereiten(m.get('10,20')[0].f[0]);
  const z = Object.fromEntries(f.pts.map(p => [p[0] + ',' + p[1], p[2]]));
  assert.ok(Math.abs(z['80,0'] - 6) < 1e-9 && z['0,0'] > 6 + 9 * Math.tan(30 * Math.PI / 180) * 0.99 && z['0,0'] > z['80,0']);
  assert.equal(f.first.length, 1, 'Firstlinie = obere Kante');
  assert.ok(f.hell > 0.7 && f.hell < 1.3);
  // Flachdach: keine Firstlinie, volle Helligkeit
  const fl = flaecheAufbereiten(m.get('1,2')[0].f[0]);
  assert.equal(fl.flach, true); assert.equal(fl.first.length, 0); assert.equal(fl.hell, 1);
  assert.equal(flaecheAufbereiten({ p: [0, 0, 1, 1], n: 0, a: 0, e: 0 }), null);
});

test('Sonne und Schatten: Südost-Sonne wirft nach Nordwesten; nachts und im Nebel schwächer', () => {
  assert.ok(SONNE[0] > 0 && SONNE[1] > 0 && SONNE[2] > 0);
  assert.ok(SCHATTEN_JE_M.dx < 0 && SCHATTEN_JE_M.dy < 0);
  assert.equal(schattenFaktor(0, 0), 1);
  assert.ok(schattenFaktor(0.5, 0) < 0.6 && schattenFaktor(1, 0) === 0);
  assert.ok(schattenFaktor(0, 1) < 0.2 && schattenFaktor(0, 0.5) < 1);
});

// ---------- Autos aus dem Luftbild (autosLuftbild) ----------
// Die Liste kommt aus tools/kulisse.py --autos; hier eine künstliche Liste aus Stellplätzen des Spiels plus absichtlich unbrauchbarer Einträge.
const bauen = (k, seed, opt) => { setzeKartengroesse(k.breite, k.hoehe); return baueWeltAusKarte(k, seed, opt); };
const polygon = f => { const p = []; for (let i = 0; i < f.p.length; i += 2) p.push([f.p[i] * KACHEL, f.p[i + 1] * KACHEL]); return p; };
const basis = lade('geretsried2');
for (const f of ['autosLuftbild', 'autosLuftbildFenster', 'baeumeLuftbild', 'baeumeLuftbildFenster', 'poolsLuftbild', 'nebengebaeude']) delete basis[f];   // echte Luftbild-Listen der Karte hier ausblenden: die Tests setzen künstliche
const gute = [];
for (const f of basis.flaechen.filter(f => f.a === 'parkplatz').slice(0, 12)) for (const b of parkplatzBuchten(polygon(f)).buchten) gute.push({ x: b.x, y: b.y, winkel: b.winkel, farbe: gute.length % 8 });
const ohne = bauen(structuredClone(basis), 4711);
// unbrauchbare Einträge: auf einer Hauswand, im Wasser (Isar), zwei übereinander, ohne Winkel
const wand = ohne.haeuser[0], hx = (wand.x + 0.5) * KACHEL, hy = (wand.y + 0.5) * KACHEL;
let wasser = null;
for (let y = 5; y < basis.hoehe && !wasser; y++) for (let x = 5; x < basis.breite && !wasser; x++) if (ohne.hole(x, y) === T.WASSER) wasser = { x: (x + 0.5) * KACHEL, y: (y + 0.5) * KACHEL };
const schlecht = [{ x: hx, y: hy, winkel: 0, farbe: 1 }, { x: gute[0].x + 3, y: gute[0].y + 2, winkel: 0.5, farbe: 2 }, { x: 5000, y: 5000, winkel: NaN, farbe: 3 }];
if (wasser) schlecht.push({ ...wasser, winkel: 1, farbe: 4 });
const kFoto = () => { const k = structuredClone(basis); k.autosLuftbild = [...gute, ...schlecht]; return k; };
const fotoWelt = bauen(kFoto(), 4711);
const fotoAutos = fotoWelt.behaelter.filter(b => b.art === 'auto' && b.platz === 'foto');

test('Foto-Autos werden durchsuchbare Behälter mit Winkel und Farbe; unbrauchbare Einträge fallen weg', () => {
  assert.ok(gute.length > 50);
  assert.ok(fotoAutos.length > gute.length * 0.6, `${fotoAutos.length} von ${gute.length}`);
  assert.ok(fotoAutos.length <= gute.length, 'nichts dazuerfunden');
  for (const a of fotoAutos) {
    assert.ok(Number.isFinite(a.x) && Number.isFinite(a.y) && Number.isFinite(a.winkel));
    assert.ok(a.farbe >= 0 && a.farbe < 8);
    assert.equal(typeof a.id, 'string');
  }
  assert.ok(!fotoAutos.some(a => a.x === hx && a.y === hy), 'nicht auf der Hauswand');
  assert.ok(!fotoAutos.some(a => a.x === 5000), 'ohne Winkel verworfen');
  if (wasser) assert.ok(!fotoAutos.some(a => a.x === wasser.x && a.y === wasser.y), 'nicht im Wasser');
  // Zufalls-Autos auf Parkplätzen/Buchten gibt es nur noch ohne Foto-Autos
  assert.equal(fotoWelt.behaelter.filter(b => b.art === 'auto' && (b.platz === 'parkplatz' || b.platz === 'bucht')).length, 0);
});

test('Foto-Autos: nie übereinander, nicht auf gesperrten Kacheln', () => {
  const gesperrt = new Set([T.WAND, T.LEER, T.TUER, T.WASSER, T.BAUM, T.ZAUN, T.TOR, T.DEKO]);
  for (const a of fotoAutos) assert.ok(!gesperrt.has(fotoWelt.hole(Math.floor(a.x / KACHEL), Math.floor(a.y / KACHEL))));
  for (let i = 0; i < fotoAutos.length; i++) for (let j = i + 1; j < fotoAutos.length; j++) {
    const dx = fotoAutos[i].x - fotoAutos[j].x, dy = fotoAutos[i].y - fotoAutos[j].y;
    if (Math.abs(dx) < 13 && Math.abs(dy) < 13) assert.ok(dx * dx + dy * dy >= 13 * 13);
  }
});

test('Foto-Autos: deterministisch (gleicher Fingerabdruck bei gleicher Liste und Seed, anderer bei anderem Seed oder anderer Liste)', () => {
  const a = weltFingerabdruck(fotoWelt);
  assert.equal(weltFingerabdruck(bauen(kFoto(), 4711)), a);
  assert.notEqual(weltFingerabdruck(bauen(kFoto(), 99)), a);
  const k2 = kFoto(); k2.autosLuftbild = k2.autosLuftbild.slice(0, 40);
  assert.notEqual(weltFingerabdruck(bauen(k2, 4711)), a);
});

test('Karten ohne autosLuftbild bleiben bei der zufälligen Verteilung', () => {
  assert.equal(ohne.behaelter.filter(b => b.art === 'auto' && b.platz === 'foto').length, 0);
  assert.ok(ohne.behaelter.filter(b => b.art === 'auto' && b.platz === 'parkplatz').length > 0);
});

test('Mit Foto-Liste und autos=0 gibt es keine Autos', () => {
  const w = bauen(kFoto(), 4711, { autos: 0 });
  assert.equal(w.behaelter.filter(b => b.art === 'auto').length, 0);
});

test('Weltcode ohne Winkelfunktionen für die Foto-Autos', () => {
  const q = fs.readFileSync(new URL('../client/osmwelt.mjs', import.meta.url), 'utf8');
  const a = q.lastIndexOf('if (fotoAutos) {'), b = q.indexOf('const autos = Math.round');
  assert.ok(a > 0 && b > a);
  assert.ok(!/Math\.(sin|cos|tan|atan2?|hypot|asin|acos|pow)\b/.test(q.slice(a, b)));
});

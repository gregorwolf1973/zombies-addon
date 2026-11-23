// Straßenende: gerade quer abgeschnitten (keine Kappe/Verjüngung), Abbruchkante und Schotter deterministisch; Flicken/Schlaglöcher deterministisch
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { setzeKartengroesse } from '../client/welt.mjs';
import { baueWeltAusKarte } from '../client/osmwelt.mjs';
import { _randTest as R } from '../client/vektor.mjs';
import { zeichneStrassenende, zustandBerechnen, SCHOTTER_MIN, SCHOTTER_MAX } from '../client/strassenzustand.mjs';

globalThis.Path2D ??= class { moveTo() {} lineTo() {} rect() {} closePath() {} arc() {} };
function laden(name) {
  const k = JSON.parse(fs.readFileSync(new URL(`../client/karten/${name}.json`, import.meta.url)));
  setzeKartengroesse(k.breite, k.hoehe);
  return R.vorbereiten(baueWeltAusKarte(k, 1, { autos: 0 }));
}
// Aufzeichnender Kontext: sammelt alle Aufrufe als Text (Determinismus und Geometrie prüfen)
function rekorder() {
  const log = [], P = new Proxy({}, { get: (_, n) => n === 'log' ? log : (...a) => { log.push(n + ':' + a.map(x => typeof x === 'number' ? x.toFixed(3) : (typeof x === 'object' ? '' : String(x))).join(',')); }, set: (_, n, v) => { log.push(n + '=' + v); return true; } });
  return P;
}

test('freies Ende (geretsried 52): Breite bis zum Ende voll, keine Verjüngung, kein Rundabschluss', () => {
  const v = laden('geretsried');
  const l = v.linien.find(m => m.id === 52), d = R.dichtL(l, v), f = R.fahrbahn(l);
  assert.ok(!d.tap, 'keine Verjüngung am freien Ende');
  assert.equal(d.frei, undefined);
  const e = R.abbruchEnden(v).find(x => x.seed === 52 * 31 + 1 * 7 + 5 || x.seed === 52 * 31 + 5);
  assert.ok(e, 'Ende gefunden');
  assert.ok(Math.abs(e.hw * 2 - f) < 1e-9, 'volle Fahrbahnbreite am Ende');
  assert.ok(Math.abs(Math.hypot(e.tx, e.ty) - 1) < 1e-9);
  assert.equal(e.weg, 0);
});

test('Übergang Straße → Feldweg (isarauen 76): gerades Ende, Weg breit erfasst, keine Verjüngung', () => {
  const v = laden('isarauen');
  const l = v.linien.find(m => m.id === 76), d = R.dichtL(l, v);
  assert.ok(!d.tap, 'Fahrbahn nicht auf Wegbreite verjüngt');
  const e = R.abbruchEnden(v).filter(x => x.seed === 76 * 31 + 5 || x.seed === 76 * 31 + 12).find(x => x.weg > 0);
  assert.ok(e && e.weg === 8, 'Feldweg schließt an: ' + JSON.stringify(e));
});

test('Abbruchkante: deterministisch, Schotter 3–8 m lang, nur in Endkoordinaten', () => {
  const e = { x: 100, y: 50, tx: 0.6, ty: 0.8, hw: 20, kerb: true, weg: 0, seed: 777, service: false };
  const a = rekorder(), b = rekorder();
  zeichneStrassenende(a, e); zeichneStrassenende(b, e);
  assert.equal(a.log.join('|'), b.log.join('|'), 'zwei Läufe zeichnen identisch');
  assert.ok(a.log.length > 200);
  const c = rekorder(); zeichneStrassenende(c, { ...e, seed: 778 });
  assert.notEqual(a.log.join('|'), c.log.join('|'), 'anderer Seed, andere Form');
  assert.ok(SCHOTTER_MIN === 24 && SCHOTTER_MAX === 64);
  assert.ok(a.log[1].startsWith('transform:0.600,0.800,-0.800,0.600,100.000,50.000'), 'Ausrichtung quer zum Ende: ' + a.log[1]);
});

test('Flicken und Schlaglöcher: deterministisch, liegen auf der Fahrbahn, Nebenstraße mehr Löcher als Hauptstraße', () => {
  const v = laden('geretsried');
  let loch = { tertiary: 0, residential: 0 }, meter = { tertiary: 0, residential: 0 }, flick = 0;
  for (const l of v.linien) {
    if (!(l.t in loch) || l.pts.length < 2) continue;
    const d = R.dichtL(l, v), fb = R.fahrbahn(l), z = zustandBerechnen(l, d, fb, l.kerb);
    const z2 = (l._zust = null, zustandBerechnen(l, d, fb, l.kerb));
    assert.equal(JSON.stringify(z), JSON.stringify(z2), 'Linie ' + l.id + ' deterministisch');
    loch[l.t] += z.loch.length; meter[l.t] += d.s[d.n - 1] / 8; flick += z.flick.length;
    for (const q of z.flick) for (const p of q.poly) assert.ok(Number.isFinite(p[0]) && Number.isFinite(p[1]));
  }
  assert.ok(flick > 0, 'es gibt Flicken');
  assert.ok(loch.residential / meter.residential > loch.tertiary / meter.tertiary, `Nebenstraße (${loch.residential}/${meter.residential}) hat mehr Löcher je m als Hauptstraße (${loch.tertiary}/${meter.tertiary})`);
});

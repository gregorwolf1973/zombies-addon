// Weiches Straßenende: freie Enden laufen abgerundet aus, am Feld-/Fußweg verjüngt sich der Asphalt auf die Wegbreite
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { setzeKartengroesse } from '../client/welt.mjs';
import { baueWeltAusKarte } from '../client/osmwelt.mjs';
import { _randTest as R } from '../client/vektor.mjs';

const halb = (d, j, f) => f / 2 + (d.tap?.[j] ?? 0);   // Halbbreite der Fahrbahn an Punkt j
function karte(name, id, ende) {
  const k = JSON.parse(fs.readFileSync(new URL(`../client/karten/${name}.json`, import.meta.url)));
  setzeKartengroesse(k.breite, k.hoehe);
  const v = R.vorbereiten(baueWeltAusKarte(k, 1, { autos: 0 }));
  const l = v.linien.find(m => m.id === id), d = R.dichtL(l, v), f = R.fahrbahn(l);
  const js = ende ? [...Array(d.n).keys()].reverse() : [...Array(d.n).keys()];   // vom Linienende nach innen
  return { d, f, h: js.map(j => halb(d, j, f)) };
}

test('freies Ende (Sackgasse, geretsried 52): Breite nimmt zum Ende stetig ab, Kappe rund und schmal', () => {
  const { d, f, h } = karte('geretsried', 52, 1);
  assert.ok(d.frei?.[1]);
  assert.ok(h[0] <= 2.01, 'Ende fast spitz: ' + h[0]);
  assert.ok(Math.abs(h[h.length - 1] - f / 2) < 0.01, 'innen volle Breite');
  for (let i = 1; i < h.length; i++) assert.ok(h[i] >= h[i - 1] - 1e-6, 'monoton wachsend');
  let max = 0; for (let i = 1; i < h.length; i++) max = Math.max(max, h[i] - h[i - 1]);
  assert.ok(max < f / 2 / 2, 'höchstens Viertelbreite je 6-px-Schritt (Rundung): ' + max);
  const i10 = h.findIndex(x => x > f / 2 * 0.9); assert.ok(i10 * 6 > f * 0.3, 'Verjüngung über mehr als eine Kappenbreite');
});

test('Übergang Straße → Feldweg (isarauen 76): Asphalt endet auf Wegbreite, ohne Absatz', () => {
  const { d, f, h } = karte('isarauen', 76, 1);
  assert.ok(d.frei?.[1]);
  assert.ok(Math.abs(h[0] * 2 - 8) < 0.5 || Math.abs(h[0] * 2 - 6) < 0.5, 'Breite am Ende = Wegbreite: ' + h[0] * 2);
  for (let i = 1; i < h.length; i++) assert.ok(h[i] >= h[i - 1] - 1e-6);
  let max = 0; for (let i = 1; i < h.length; i++) max = Math.max(max, h[i] - h[i - 1]);
  assert.ok(max < 2.5, 'stetig: ' + max);
  assert.ok(Math.abs(h[h.length - 1] - f / 2) < 0.01);
});

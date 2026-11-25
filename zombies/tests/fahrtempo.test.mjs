// Fahrtempo-Stufen: Stufe 30/50/Höchsttempo deckelt die Geschwindigkeit (Tempomat), Umschalt = 30 km/h, Panzer nie über sein Höchsttempo
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BREITE, HOEHE, FEIN, kmhZuPx } from '../client/welt.mjs';
import { FahrbarPkw } from '../server/pkw.mjs';
import { FahrbarBoxer, FahrbarPuma } from '../server/fahrbar.mjs';
import { PKW_VORGABE } from '../client/pkw.mjs';
import { tempoNaechste, tempoStufe, tempoDeckelKmh, TEMPO_STUFE_MAX } from '../client/fahrtempo.mjs';

const DT = 0.05;
function raum() {
  return {
    welt: { fein: new Uint8Array(BREITE * FEIN * HOEHE * FEIN), behaelter: [] }, extra: new Map(), clients: [], gesendet: [],
    state: { spieler: new Map(), fahrzeuge: new Map(), zombies: new Map(), behaelter: new Map(), phase: 'spiel', besiegt: 0, seed: 7 },
    einstellungen: () => ({ zombieLeben: 100, funde: {}, auto: { ...PKW_VORGABE }, bundeswehr: {} }),
    rnd: () => 0.5, broadcast() {}, laerm() {}, schaden() {}, unsterblich: () => false, liegtAmBoden() {}, verkehr: { unfaelle: { liste: new Map() } }, fahrbare: { liste: [] },
  };
}
// fährt 15 s mit vollem Stick geradeaus und gibt das größte Tempo (km/h) zurück
function hoechst(fz, e) {
  let m = 0;
  for (let i = 0; i < 300; i++) { fz.f.x = 800; fz.f.y = 800; fz.fahren({ dx: 1, dy: 0, ...e }, DT); m = Math.max(m, fz.v); }
  return m / 8 * 3.6;
}
const neu = (K, ...a) => { const fz = new K(raum(), ...a); fz.aufstellen(800, 800, 0); fz.andere = []; return fz; };

test('Stufen: reihum 30 → 50 → max, Unsinn = max', () => {
  assert.equal(tempoNaechste(0), 1); assert.equal(tempoNaechste(1), 2); assert.equal(tempoNaechste(2), 0);
  assert.equal(tempoStufe('x'), TEMPO_STUFE_MAX); assert.equal(tempoStufe(9), 2);
  assert.equal(tempoDeckelKmh(2, true), 30); assert.equal(tempoDeckelKmh(1, true), 30); assert.equal(tempoDeckelKmh(2, false), Infinity);
});

test('Auto: Stufe 30/50 deckelt bei vollem Stick, ohne Stufe volles Tempo, Umschalt = 30', () => {
  const frei = hoechst(neu(FahrbarPkw, 'b1'), {}), v = kmh => Math.abs(hoechst(neu(FahrbarPkw, 'b1'), kmh) - kmh) < 0.6;
  assert.ok(frei > 60, `frei ${frei}`);
  assert.ok(v({ stufe: 0 }) || Math.abs(hoechst(neu(FahrbarPkw, 'b1'), { stufe: 0 }) - 30) < 0.6);
  assert.ok(Math.abs(hoechst(neu(FahrbarPkw, 'b1'), { stufe: 1 }) - 50) < 0.6);
  assert.ok(hoechst(neu(FahrbarPkw, 'b1'), { stufe: 2 }) > 60);
  assert.ok(Math.abs(hoechst(neu(FahrbarPkw, 'b1'), { s: true }) - 30) < 0.6);
  assert.ok(Math.abs(hoechst(neu(FahrbarPkw, 'b1'), { stufe: 2, s: true }) - 30) < 0.6);
});

test('Panzer: Stufen nie über sein Höchsttempo', () => {
  const b = neu(FahrbarBoxer), p = neu(FahrbarPuma);
  const bmax = b.fahrwerk().vmax / 8 * 3.6, pmax = p.fahrwerk().vmax / 8 * 3.6;
  for (const [fz, mx] of [[b, bmax], [p, pmax]]) {
    assert.ok(Math.abs(hoechst(fz, { stufe: 0 }) - Math.min(30, mx)) < 0.6);
    assert.ok(hoechst(fz, { stufe: 1 }) <= Math.min(50, mx) + 0.6);
    assert.ok(hoechst(fz, { stufe: 2 }) <= mx + 0.6);
  }
});

test('Server: fahrerEingabe übernimmt Umschalt und die Stufe des Fahrers', () => {
  const fz = neu(FahrbarBoxer), r = fz.raum;
  fz.insassen = ['a']; r.extra.set('a', { tempoStufe: 1 });
  fz.fahrerEingabe('a', { dx: 1, dy: 0, s: true });
  assert.deepEqual(fz.letzteEingabe, { dx: 1, dy: 0, s: true, stufe: 1 });
  r.extra.set('a', {}); fz.fahrerEingabe('a', { dx: 0, dy: 1 });
  assert.equal(fz.letzteEingabe.stufe, TEMPO_STUFE_MAX);
});

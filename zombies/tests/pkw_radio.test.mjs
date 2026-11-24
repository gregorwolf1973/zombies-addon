// Autoradio im Auto: Knopf-Logik (client/pkwradio.mjs): an/aus nur im Auto, aus beim Aussteigen, leiser bei Sirene; Streifenwagen-Einstieg ohne Schlüssel (pkwKontext).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { radioUmschalten, radioSoll, radioFaktor, radioAbgleich, radioText, RADIO_LEISE } from '../client/pkwradio.mjs';
import { pkwKontext, streifePose, streifeBei, streifeBid, istStreife, fahrberechtigt, parkAutoWeg } from '../client/pkw.mjs';

test('Radio-Knopf: im Auto umschalten, außerhalb nie an', () => {
  assert.equal(radioUmschalten(false, true), true);
  assert.equal(radioUmschalten(true, true), false);
  assert.equal(radioUmschalten(false, false), false);
  assert.equal(radioUmschalten(true, false), false);
  assert.equal(radioText(false), '📻 Radio'); assert.equal(radioText(true), '📻 Radio aus');
});

test('Radio geht beim Aussteigen aus und ist beim nächsten Einsteigen wieder aus', () => {
  let z = { an: true, spielt: false };
  z = radioAbgleich(z.an, true, z.spielt); assert.deepEqual(z, { an: true, spielt: true, tun: 'start' });
  z = radioAbgleich(z.an, true, z.spielt); assert.equal(z.tun, null, 'läuft schon');
  z = radioAbgleich(z.an, false, z.spielt); assert.deepEqual(z, { an: false, spielt: false, tun: 'stopp' });   // ausgestiegen
  z = radioAbgleich(z.an, true, z.spielt); assert.deepEqual(z, { an: false, spielt: false, tun: null });      // wieder drin: bleibt aus
  assert.equal(radioSoll(true, false), false); assert.equal(radioSoll(true, true), true);
});

test('Radio bei Sirene leiser', () => {
  assert.equal(radioFaktor(false), 1); assert.equal(radioFaktor(true), RADIO_LEISE); assert.ok(RADIO_LEISE < 0.5);
});

test('Streifenwagen: ohne Autoschlüssel fahrbar (Knopf), nach dem Wegfahren nicht mehr', () => {
  const welt = { sperren: [{ x: 500, y: 500, winkel: 0, breite: 40, seite: 1 }] };
  const q = streifePose(welt.sperren[0]);
  const ich = { ebene: '', anBord: false, imBoxer: false, rucksack: [] };
  const k = pkwKontext(welt, { fahrzeuge: new Map(), spieler: new Map() }, ich, q.x, q.y + 14, () => 0);
  assert.equal(k?.art, 'einsteigen'); assert.match(k.text, /Streifenwagen/);
  assert.equal(streifeBei(welt, q.x + 300, q.y), null, 'zu weit weg');
  assert.ok(parkAutoWeg(welt, streifeBid(0)), 'als weg markiert');
  assert.equal(streifeBei(welt, q.x, q.y + 14), null, 'weggefahren');
  assert.ok(istStreife('streife0') && !istStreife('b123'));
  assert.ok(fahrberechtigt('streife0', { rucksack: [] }) && !fahrberechtigt('b123', { rucksack: [] }));
});

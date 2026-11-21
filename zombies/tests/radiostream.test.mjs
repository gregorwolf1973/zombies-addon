import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bereinigeRadioStream, RADIO_STREAM_VORGABE } from '../server/einstellungen.mjs';

test('Live-Radio: Vorgabe aus, Antenne Bayern, nur https-Adressen, Lautstärke begrenzt', () => {
  assert.deepEqual(bereinigeRadioStream({}), { ...RADIO_STREAM_VORGABE });
  assert.equal(RADIO_STREAM_VORGABE.an, false);
  assert.match(RADIO_STREAM_VORGABE.url, /^https:\/\/stream\.antenne\.de\//);
  assert.equal(bereinigeRadioStream({ an: true }).an, true);
  assert.equal(bereinigeRadioStream({ an: 'ja' }).an, false);
  assert.equal(bereinigeRadioStream({ url: 'http://unsicher.example/x' }).url, RADIO_STREAM_VORGABE.url);
  assert.equal(bereinigeRadioStream({ url: 'javascript:alert(1)' }).url, RADIO_STREAM_VORGABE.url);
  assert.equal(bereinigeRadioStream({ url: 'https://stream.example.org/live"><x' }).url, RADIO_STREAM_VORGABE.url);
  assert.equal(bereinigeRadioStream({ url: 'https://stream.example.org/live.mp3' }).url, 'https://stream.example.org/live.mp3');
  assert.equal(bereinigeRadioStream({ laut: 250 }).laut, 100);
  assert.equal(bereinigeRadioStream({ name: '  ' }).name, RADIO_STREAM_VORGABE.name);
});

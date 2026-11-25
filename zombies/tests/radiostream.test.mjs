import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bereinigeRadioStream, RADIO_STREAM_VORGABE } from '../server/einstellungen.mjs';

test('Live-Radio: Vorgabe aus und leer, nur https-Adressen, Lautstärke begrenzt', () => {
  assert.deepEqual(bereinigeRadioStream({}), { ...RADIO_STREAM_VORGABE });
  assert.equal(RADIO_STREAM_VORGABE.an, false);
  assert.equal(RADIO_STREAM_VORGABE.url, '');
  assert.equal(bereinigeRadioStream({ an: true }).an, true);
  assert.equal(bereinigeRadioStream({ an: 'ja' }).an, false);
  assert.equal(bereinigeRadioStream({ url: 'http://unsicher.example/x' }).url, RADIO_STREAM_VORGABE.url);
  assert.equal(bereinigeRadioStream({ url: 'javascript:alert(1)' }).url, RADIO_STREAM_VORGABE.url);
  assert.equal(bereinigeRadioStream({ url: 'https://stream.example.org/live"><x' }).url, RADIO_STREAM_VORGABE.url);
  assert.equal(bereinigeRadioStream({ url: 'https://stream.example.org/live.mp3' }).url, 'https://stream.example.org/live.mp3');
  assert.equal(bereinigeRadioStream({ laut: 250 }).laut, 100);
  assert.equal(bereinigeRadioStream({ name: '  ' }).name, RADIO_STREAM_VORGABE.name);
  assert.equal(bereinigeRadioStream({}).vorlauf, 30);
  assert.equal(bereinigeRadioStream({ vorlauf: 500 }).vorlauf, 500);
  assert.equal(bereinigeRadioStream({ url: 'https://stream.example.org/andere/live' }).url, 'https://stream.example.org/andere/live');
});

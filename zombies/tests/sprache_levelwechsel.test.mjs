// Sprache beim Levelwechsel: der Server schließt den Raum ('neustart', dann disconnect), die Seite lädt erst später neu.
// Die direkten WebRTC-Verbindungen müssen bis dahin weiterlaufen (sprache.uebergang()); bei einem echten Verlassen werden sie geschlossen.
import { test } from 'node:test';
import assert from 'node:assert/strict';

// minimale Browser-Attrappen (nur was starte() beim Anlegen braucht)
const geschlossen = [];
class FakePC {
  constructor() { this.connectionState = 'new'; this.signalingState = 'stable'; this.id = geschlossen.length + FakePC.n++; }
  getTransceivers() { return []; }
  close() { geschlossen.push(this.id); }
  addTransceiver() {}
}
FakePC.n = 0;
const knoten = () => ({ style: {}, classList: { toggle() {} }, setAttribute() {}, appendChild() {}, remove() {} });
globalThis.window = globalThis;
globalThis.RTCPeerConnection = FakePC;
globalThis.isSecureContext = false;   // kein Mikrofon: „du hörst die anderen trotzdem“
globalThis.document = { getElementById: () => null, createElement: knoten, body: knoten(), addEventListener() {} };
globalThis.location = { search: '' };
const store = new Map();
globalThis.localStorage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)) };
// Zeitgeber der Sprache sollen den Testlauf nicht festhalten
const si = globalThis.setInterval; globalThis.setInterval = (...a) => { const t = si(...a); t.unref?.(); return t; };
const sprache = await import('../client/sprache.mjs');

// Raum-Attrappe: Nachrichten-Handler, onLeave, gesendete Nachrichten
function fakeRaum() {
  const h = new Map(), leave = [], gesendet = [];
  return {
    state: { spieler: new Map([['ich', { x: 0, y: 0 }], ['a', { name: 'Anna', x: 0, y: 0 }], ['b', { name: 'Berta', x: 0, y: 0 }]]) },
    onMessage: (t, f) => h.set(t, f), onLeave: f => leave.push(f),
    send: (t, m) => gesendet.push([t, m]), sendBytes() {},
    an: (t, m) => h.get(t)?.(m), geh: () => leave.forEach(f => f()), gesendet,
  };
}
function starten() {
  const raum = fakeRaum();
  sprache.starte({ raum, meineId: 'ich', welt: () => null, meldung() {} });
  raum.an('sprachStart', { ice: [], einst: { an: true } });
  raum.an('sprachPartner', { ids: ['ich', 'a', 'b'] });
  return raum;
}

test('Sprache: bei normalem Verlassen werden die Verbindungen geschlossen', () => {
  geschlossen.length = 0;
  const raum = starten();
  assert.equal(geschlossen.length, 0);
  raum.geh();
  assert.equal(geschlossen.length, 2, 'beide Mitspieler getrennt');
});

test('Sprache: im Levelwechsel (Übergang) bleiben die Verbindungen bis zum Neuladen offen', () => {
  geschlossen.length = 0;
  const raum = starten();
  assert.ok(raum.gesendet.some(([t]) => t === 'sprachBereit'), 'meldet sich beim Server');
  sprache.uebergang();
  assert.equal(sprache.imUebergang(), true);
  raum.geh();   // Server schließt den Raum
  assert.equal(geschlossen.length, 0, 'Peers bleiben');
});

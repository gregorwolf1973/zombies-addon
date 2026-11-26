// Zweisprachigkeit: de/en vollständig und gleich aufgebaut, Platzhalter passen, Sprachwahl nach Browser,
// keine deutschen Oberflächentexte mehr im Client (Heuristik tools/i18n_pruefen.mjs, Phase 1) und keine deutschen Servertexte an Clients (Phase 2).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import de from '../client/i18n/de.mjs';
import en from '../client/i18n/en.mjs';
import { flach, spracheAus, einsetzen, t, tIn, textAus, sprache, setzeSprache, beiSprachwechsel } from '../client/i18n.mjs';
import { pruefeClient, pruefeServer, pruefeQuelle, jsLiterale } from '../tools/i18n_pruefen.mjs';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DINGE, BEHAELTER_NAME, HANDEL, ZAUN_NAME } from '../client/welt.mjs';
import { HF_LISTE } from '../client/heldenfiguren.mjs';

const D = flach(de), E = flach(en);
// Platzhalternamen: {name} und {n|eins|mehr} → name bzw. n
const platzhalter = s => [...new Set([...String(s).matchAll(/\{(\w+)(?:\|[^}]*)?\}/g)].map(m => m[1]))].sort();

test('de und en haben exakt dieselben Schlüssel', () => {
  const nurDe = Object.keys(D).filter(k => !(k in E)), nurEn = Object.keys(E).filter(k => !(k in D));
  assert.deepEqual(nurDe, [], 'fehlt in en.mjs');
  assert.deepEqual(nurEn, [], 'fehlt in de.mjs');
  assert.ok(Object.keys(D).length > 400, 'Phase 1 hat einige hundert Schlüssel');
});

test('keine leeren Werte, nur Zeichenketten', () => {
  for (const [n, tab] of [['de', D], ['en', E]]) for (const [k, v] of Object.entries(tab)) {
    assert.equal(typeof v, 'string', `${n}:${k}`);
    assert.ok(v.trim().length > 0, `${n}:${k} ist leer`);
  }
});

test('Platzhalter stimmen in beiden Sprachen überein, Mehrzahl-Form gültig', () => {
  for (const k of Object.keys(D)) {
    assert.deepEqual(platzhalter(E[k]), platzhalter(D[k]), k);
    for (const v of [D[k], E[k]]) for (const m of v.matchAll(/\{(\w+)\|([^}]*)\}/g)) assert.equal(m[2].split('|').length, 2, `${k}: Mehrzahl {n|eins|mehr}`);
  }
});

test('HTML-Tags in beiden Sprachen gleich', () => {
  const tags = s => [...String(s).matchAll(/<\/?([a-z0-9]+)/gi)].map(m => m[1].toLowerCase()).sort().join(',');
  for (const k of Object.keys(D)) assert.equal(tags(E[k]), tags(D[k]), k);
});

test('Englisch: kein Umlaut/ß übrig (außer Eigennamen)', () => {
  const erlaubt = /Thorsten Müller|Bayerische Vermessungsverwaltung|Oberbayern|Königsdorf|Geretsried|Sprache|Deutsch/;
  for (const [k, v] of Object.entries(E)) if (/[äöüÄÖÜß]/.test(v.replace(erlaubt, ''))) assert.fail(`${k}: ${v}`);
});

test('Sprachwahl nach Browser: beginnt mit „de“ → Deutsch, sonst Englisch', () => {
  assert.equal(spracheAus(['de-AT', 'en']), 'de');
  assert.equal(spracheAus(['de-DE']), 'de');
  assert.equal(spracheAus(['de']), 'de');
  assert.equal(spracheAus(['de_CH']), 'de');
  assert.equal(spracheAus(['en-US', 'de']), 'en');
  assert.equal(spracheAus(['fr']), 'en');
  assert.equal(spracheAus(['fr-FR', 'de-DE']), 'en');
  assert.equal(spracheAus('de-AT'), 'de');
  assert.equal(spracheAus([]), 'en');
  assert.equal(spracheAus(undefined), 'en');
  assert.equal(spracheAus(['dev']), 'en');
});

test('t(): Platzhalter, Mehrzahl, Rückfall', () => {
  assert.equal(einsetzen('Hallo {name}', { name: 'Sepp' }), 'Hallo Sepp');
  assert.equal(einsetzen('{n} {n|Zombie|Zombies}', { n: 1 }), '1 Zombie');
  assert.equal(einsetzen('{n} {n|Zombie|Zombies}', { n: 3 }), '3 Zombies');
  assert.equal(einsetzen('{fehlt}', {}), '{fehlt}');
  assert.equal(t('gibt.es.nicht'), 'gibt.es.nicht');
  assert.equal(sprache(), 'de', 'Node/Server: Deutsch');
  assert.equal(t('start.los'), 'Mitspielen');
  assert.equal(tIn('en', 'start.los'), 'Play');
  assert.equal(tIn('en', 'hud.listeTitel', { n: 1 }), '1 player – tap for the list');
  assert.equal(tIn('en', 'hud.listeTitel', { n: 4 }), '4 players – tap for the list');
  assert.equal(tIn('xx', 'start.los'), 'Mitspielen');
});

test('textAus(): Servernachricht als Schlüssel oder fertiger Text (Phase 2)', () => {
  assert.equal(textAus({ text: 'fertig' }), 'fertig');
  assert.equal(textAus('roh'), 'roh');
  assert.equal(textAus({ k: 'fund.gefunden', w: { liste: 'x' } }), 'Gefunden: x');
  assert.equal(textAus({ k: 'aktion.aufheben', w: { ding: { k: 'ding.wasser' } } }), 'Wasser aufheben');
});

test('Namen in welt.mjs/heldenfiguren.mjs folgen der Sprache, Schlüssel bleiben deutsch', () => {
  assert.equal(DINGE.wasser.name, 'Wasser');
  assert.equal(BEHAELTER_NAME.kuehlschrank, 'Kühlschrank');
  assert.equal(HANDEL.arzt.name, 'Arzt');
  assert.equal(ZAUN_NAME.h, 'die Hecke');
  const aufruf = [];
  const ab = beiSprachwechsel(s => aufruf.push(s));
  try {
    setzeSprache('en', { merken: false });
    assert.equal(sprache(), 'en');
    assert.deepEqual(aufruf, ['en']);
    assert.equal(DINGE.wasser.name, 'Water');
    assert.equal(DINGE.schlaeger.name, 'Baseball bat');
    assert.equal(BEHAELTER_NAME.kuehlschrank, 'Fridge');
    assert.equal(HF_LISTE[0].name, 'Responder');
    assert.equal(ZAUN_NAME.z, 'the fence');
    assert.ok(Object.keys(DINGE).every(k => DINGE[k].name && !DINGE[k].name.startsWith('ding.')), 'jedes Ding hat einen Namen');
    assert.ok(Object.keys(BEHAELTER_NAME).every(k => !BEHAELTER_NAME[k].startsWith('behaelter.')));
    assert.equal(setzeSprache('xx', { merken: false }), false);
  } finally { setzeSprache('de', { merken: false }); ab(); }
  assert.equal(DINGE.wasser.name, 'Wasser');
  assert.ok('name' in DINGE.wasser && JSON.parse(JSON.stringify(DINGE.wasser)).name === 'Wasser', 'name bleibt aufzählbar (Server /info)');
});

test('Prüfwerkzeug erkennt deutsche Oberflächentexte und lässt Ausnahmen durch', () => {
  const q = [
    "el.textContent = 'Rucksack voll – nichts passt';",
    "const k = 'kuehlschrank'; // Schlüssel",
    "// Kommentar mit Tür und Schlüssel",
    "x.title = `Über ${a} steigen`;",
    "y = 'Geretsried';",
    "console.warn('Mikrofon nicht verfügbar:', e);",
    "z = 'Ausnahme mit Marker für Tür'; // i18n-ok",
    "b.textContent = 'Abbrechen';",
  ].join('\n');
  const treffer = pruefeQuelle(q, 'x.mjs').map(t => t.zeile);
  assert.deepEqual(treffer, [1, 4, 8]);
  assert.deepEqual(pruefeQuelle('<p>Hallo du da</p><p data-x="1">OK</p><input placeholder="Dein Name">', 'x.html').map(t => t.wert), ['Hallo du da', 'Dein Name']);
});

test('Phase 1: keine deutschen Oberflächentexte mehr in client/*.mjs und index.html', () => {
  const treffer = pruefeClient();
  assert.deepEqual(treffer.map(t => `${t.datei}:${t.zeile}: ${t.wert}`), []);
});

// ---------- Phase 2: Servertexte als Schlüssel ----------
test('Phase 2: keine deutschen Texte an Clients mehr in server/*.mjs (Logs, Verwaltung und i18n-ok ausgenommen)', () => {
  const treffer = pruefeServer();
  assert.deepEqual(treffer.map(t => `${t.datei}:${t.zeile}: ${t.wert}`), []);
});

test('Phase 2: jeder Schlüssel, den der Server schickt, steht in de und en (srv.*)', () => {
  const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'server');
  const gruppen = new Set(Object.keys(D).filter(k => k.startsWith('srv.')).map(k => k.split('.')[1]));
  const fehlt = [];
  for (const f of readdirSync(dir).filter(f => f.endsWith('.mjs'))) {
    for (const { wert } of jsLiterale(readFileSync(join(dir, f), 'utf8'))) {
      if (!/^[a-z]+\.[\w.]*$/i.test(wert) || !gruppen.has(wert.split('.')[0])) continue;
      const k = 'srv.' + wert;
      const ok = /[._]$/.test(wert) ? Object.keys(D).some(x => x.startsWith(k)) : k in D;   // 'himmel.' + w: Vorsilbe
      if (!ok) fehlt.push(`${f}: ${wert}`);
    }
  }
  assert.deepEqual(fehlt, []);
});

test('Phase 2: Servernachrichten in beiden Sprachen (Listen, verschachtelte Schlüssel, Schemafelder)', async () => {
  const { M, D: Ding, ortK, alsFeld, feldText, nachricht } = await import('../server/texte.mjs');
  assert.deepEqual(M('tuer.blockiert'), { k: 'srv.tuer.blockiert' });
  assert.equal(textAus(M('tuer.blockiert')), '🚪 Tür blockiert');
  assert.equal(textAus(M('inv.inHand', { ding: Ding('pistole') })), 'Pistole in der Hand');
  assert.equal(textAus(M('alle.tueren', { n: 1 })), '🔓 1 Tür geöffnet');
  assert.equal(textAus(M('alle.tueren', { n: 3 })), '🔓 3 Türen geöffnet');
  assert.equal(textAus(M('auf.funkFehlt', { fehlt: [Ding('m_batterie'), Ding('m_antenne')] })), '📻 Der Funkspruch geht noch nicht – es fehlt: Batterie, Antenne (in die Safe-Room-Kiste legen)');
  assert.equal(textAus(M('auf.warnung', { z: '🚌', n: 15, fz: M('fz.bus.der'), fehlt: { s: ' · ', l: ['a', { s: ' ', l: ['📻', M('auf.t.funk')] }] } })),
    '⏳ 🚌 Noch 15 s, dann fährt der Evakuierungsbus OHNE Erfolg ab und setzt alle ab. Es fehlt: a · 📻 Funkspruch absetzen (Funktisch im Safe Room)');
  assert.equal(textAus(M('sp.erwacht', { grund: M('sp.verwandlungNach'), name: 'Sepp', ort: ortK('Feuerwehrhaus') })), 'Die Verwandlung lässt nach: Sepp wacht im Feuerwehrhaus wieder als Mensch auf');
  assert.equal(ortK('Kirche Maria Hilf'), 'Kirche Maria Hilf', 'Eigennamen bleiben');
  assert.equal(ortK('Unbekannt'), 'Unbekannt');
  assert.equal(Ding('gibtsnicht'), 'gibtsnicht');
  assert.equal(feldText(alsFeld(M('auf.t.zombies', { n: 15 }))), 'Zombies erledigen: zusammen 15');
  assert.equal(feldText('alter Text'), 'alter Text', 'alte Stände ohne Schlüssel');
  assert.deepEqual(nachricht('roh', { lang: true }), { text: 'roh', lang: true });
  assert.deepEqual(nachricht(M('tuer.blockiert'), { lang: true }), { k: 'srv.tuer.blockiert', lang: true });
  try {
    setzeSprache('en', { merken: false });
    assert.equal(textAus(M('inv.inHand', { ding: Ding('pistole') })), 'Pistol in hand');
    assert.equal(textAus(M('sp.erwacht', { grund: M('sp.verwandlungNach'), name: 'Sepp', ort: ortK('Feuerwehrhaus') })), 'The transformation wears off: Sepp wakes up human again (fire station)');
    assert.equal(textAus(M('alle.tueren', { n: 3 })), '🔓 3 doors opened');
    assert.equal(textAus(M('auf.kommtUm', { z: '🚌', fz: M('fz.bus.Der'), zeit: '18:00' })), '🚌 The evacuation bus will reach the town exit at 18:00!');
    assert.equal(textAus({ text: 'alt' }), 'alt', 'alte Form geht weiter');
  } finally { setzeSprache('de', { merken: false }); }
});

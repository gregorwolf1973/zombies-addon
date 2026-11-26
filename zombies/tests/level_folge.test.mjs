// Level-Reihenfolge einstellbar (Verwaltung): Karten verschieben, Level an/aus; Position = Levelnummer (Schwierigkeit, Tabelle je Level),
// Karten-Besonderheiten (Biss, Mission, Evakuierung, Musik/Durchsage) hängen an der Karte.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { starte } from '../server/index.mjs';
import { SpielRaum } from '../server/raum.mjs';
import { bereinige, grundwerte, LEVEL_WELTEN, KARTEN } from '../server/einstellungen.mjs';
import { Aufgaben, LEVEL_KARTEN } from '../server/aufgaben.mjs';
import { Finale } from '../server/finale.mjs';
import { SU_BEFEHLE } from '../server/superuser.mjs';
import { LEVEL_KATALOG, bereinigeFolge, aktiveFolge, naechsterEintrag, kartenNr, levelSchluessel, eintragVon, folgeVorgabe } from '../client/levelkatalog.mjs';
import { evakArtFuer } from '../client/evak.mjs';
import { freierPort } from './hilfe.mjs';

const ids = f => f.map(x => x.karte);
const mitFolge = (folge, karte = 'geretsried', extra = {}) => ({ raum: { state: { karte, level: 1, ...extra }, constructor: { einstellungen: { levelFolge: folge } } } });
const naechste = (folge, karte) => Aufgaben.prototype.naechsteKarte.call(mitFolge(folge, karte));

test('Katalog: Geretsried 1 und 2 eigene Level, Tabellen je Karte folgen dem Katalog', () => {
  assert.deepEqual(LEVEL_KARTEN, ['geretsried', 'geretsried2', 'isarauen', 'koenigsdorf', 'kochel', 'andermatt']);
  assert.deepEqual(LEVEL_WELTEN, LEVEL_KARTEN);
  assert.deepEqual(ids(folgeVorgabe()), LEVEL_KARTEN);
  assert.deepEqual(bereinige({}).levelFolge, folgeVorgabe());
  assert.deepEqual(grundwerte().levelFolge, folgeVorgabe());
  for (const k of LEVEL_KATALOG) assert.ok(KARTEN.includes(k.id), k.id);
  assert.ok(!KARTEN.includes('level1'), 'keine Zufallswahl mehr');
  assert.equal(levelSchluessel('geretsried2'), 'geretsried2'); assert.equal(eintragVon('dorf'), null);
  assert.deepEqual(LEVEL_KATALOG.map(k => k.name).slice(0, 2), ['Geretsried 1', 'Geretsried 2']);
});

test('Folge bereinigen: unbekannte/doppelte fallen weg, fehlende kommen hinten dazu, mindestens ein Level aktiv', () => {
  assert.deepEqual(ids(bereinigeFolge([{ karte: 'kochel' }, { karte: 'mond' }, { karte: 'kochel' }, 'isarauen', null])), ['kochel', 'isarauen', 'geretsried', 'geretsried2', 'koenigsdorf', 'andermatt']);
  assert.deepEqual(bereinigeFolge([{ karte: 'kochel', aktiv: false }]).map(x => x.aktiv), [false, true, true, true, true, true]);
  assert.equal(bereinigeFolge(LEVEL_KARTEN.map(k => ({ karte: k, aktiv: false }))).filter(x => x.aktiv).length, 1, 'nicht alles aus');
  assert.deepEqual(bereinigeFolge('Unsinn', [{ karte: 'andermatt' }]).map(x => x.karte)[0], 'andermatt', 'Unsinn → bisherige Liste');
  const e = bereinige({ levelFolge: [{ karte: 'andermatt', aktiv: true }, { karte: 'geretsried2', aktiv: false }, { karte: 'geretsried', aktiv: true }] });
  assert.deepEqual(ids(e.levelFolge), ['andermatt', 'geretsried2', 'geretsried', 'isarauen', 'koenigsdorf', 'kochel'], 'Geretsried 2 frei verschiebbar');
  assert.equal(bereinige({ bots: 3 }, e).levelFolge[1].aktiv, false, 'Teiländerung lässt die Folge stehen');
  assert.deepEqual(aktiveFolge(e.levelFolge), ['andermatt', 'geretsried', 'isarauen', 'koenigsdorf', 'kochel'], 'Geretsried 2 einzeln abschaltbar');
});

test('nächstes Level folgt der Reihenfolge, überspringt abgeschaltete und beginnt am Ende von vorn', () => {
  const folge = bereinigeFolge([{ karte: 'kochel' }, { karte: 'geretsried' }, { karte: 'geretsried2' }, { karte: 'isarauen', aktiv: false }, { karte: 'andermatt' }, { karte: 'koenigsdorf' }]);
  assert.deepEqual(aktiveFolge(folge), ['kochel', 'geretsried', 'geretsried2', 'andermatt', 'koenigsdorf']);
  assert.equal(naechste(folge, 'kochel'), 'geretsried');
  assert.equal(naechste(folge, 'geretsried'), 'geretsried2', 'Geretsried 1 → Geretsried 2 (eigene Level)');
  assert.equal(naechste(folge, 'geretsried2'), 'andermatt');
  assert.equal(naechste(folge, 'koenigsdorf'), 'kochel', 'Ende → wieder Level 1');
  assert.equal(naechste(folge, 'isarauen'), 'kochel', 'abgeschaltete Karte → erstes aktives Level');
  assert.equal(naechste(folge, 'dorf'), 'kochel');
  assert.equal(naechsterEintrag(undefined, 'isarauen'), 'koenigsdorf', 'ohne Einstellung: Standard');
  assert.equal(Aufgaben.prototype.erstesLevel.call(mitFolge(folge)), 'kochel');
  assert.equal(Aufgaben.prototype.levelNr.call(mitFolge(folge), 'andermatt'), 4);
  assert.equal(Aufgaben.prototype.levelNr.call(mitFolge(folge), 'geretsried2'), 3);
  assert.equal(Aufgaben.prototype.levelNr.call(mitFolge(folge), 'isarauen'), 0);
});

test('kein Zufall mehr: Levelwechsel und erstes Level liefern immer dieselbe Karte', () => {
  const folge = folgeVorgabe();
  for (let i = 0; i < 20; i++) {
    assert.equal(naechste(folge, 'andermatt'), 'geretsried');
    assert.equal(naechste(folge, 'geretsried'), 'geretsried2');
    assert.equal(Aufgaben.prototype.erstesLevel.call(mitFolge(folge)), 'geretsried');
  }
  const ohne1 = bereinigeFolge([{ karte: 'geretsried', aktiv: false }, { karte: 'geretsried2' }]);
  assert.equal(Aufgaben.prototype.erstesLevel.call(mitFolge(ohne1)), 'geretsried2', 'Geretsried 1 aus → Level 1 = Geretsried 2');
  assert.equal(naechste(ohne1, 'andermatt'), 'geretsried2');
});

test('Levelwechsel: Karte folgt der Reihenfolge, die Levelnummer (Schwierigkeit) zählt weiter nach Position', () => {
  const aufrufe = [];
  const folge = bereinigeFolge([{ karte: 'andermatt' }, { karte: 'kochel' }]);
  const fake = Object.create(Aufgaben.prototype);
  fake.raum = { state: { karte: 'andermatt', level: 1, spieler: new Map(), besiegt: 7 }, chatVerlauf: [], constructor: { einstellungen: { levelFolge: folge }, kartenWechsel: k => aufrufe.push(['karte', k]) },
    weltNeuStarten: (l, st) => aufrufe.push(['neu', st]) };
  fake.eingestiegen = new Set(); fake.plan = null;
  fake.levelWechsel();
  assert.deepEqual(aufrufe[0], ['karte', 'kochel']);
  assert.equal(aufrufe[1][1].karte, 'kochel'); assert.equal(aufrufe[1][1].level, 2);
  // fehlende Karten stehen hinten (aktiv) in Katalogreihenfolge: nach Kochel Geretsried 1, danach Geretsried 2
  fake.raum.state.karte = 'kochel'; aufrufe.length = 0;
  fake.levelWechsel();
  assert.deepEqual(aufrufe[0], ['karte', 'geretsried'], 'nach Kochel folgt der angehängte Rest (Geretsried 1)');
  fake.raum.state.karte = 'geretsried'; aufrufe.length = 0;
  fake.levelWechsel();
  assert.deepEqual(aufrufe[0], ['karte', 'geretsried2']);
});

test('Finale: Sieg → erstes aktives Level (Level 1), Niederlage → Andermatt mit seiner Position', () => {
  const folge = bereinigeFolge([{ karte: 'kochel' }, { karte: 'isarauen', aktiv: false }, { karte: 'andermatt' }]);
  const gewechselt = [];
  const a = Object.create(Aufgaben.prototype);
  a.raum = { state: { karte: 'andermatt', level: 2 }, constructor: { einstellungen: { levelFolge: folge } } };
  a.levelWechsel = ziel => gewechselt.push(ziel);
  const f = Object.create(Finale.prototype); f.raum = { aufgaben: a, state: { level: 2 } };
  f.neustart(true); f.neustart(false);
  assert.deepEqual(gewechselt[0], { karte: 'kochel', level: 1, frisch: true });
  assert.deepEqual(gewechselt[1], { karte: 'andermatt', level: 2 }, 'Position unter den aktiven Leveln (kochel, andermatt, …; isarauen ist aus)');
});

test('Karten-Besonderheiten hängen an der Karte, nicht an der Position', () => {
  assert.equal(evakArtFuer('kochel'), 'heli'); assert.equal(evakArtFuer('andermatt'), 'bunker');
  assert.equal(kartenNr('andermatt', 1), 5); assert.equal(kartenNr('geretsried2', 9), 1, 'Geretsried 2 teilt Musik/Durchsage mit Geretsried 1'); assert.equal(kartenNr('dorf', 3), 3, 'unbekannte Karte → Rückfall');
  const e = bereinige({ bissSpielerLevel: { kochel: 33 } });
  assert.equal(e.bissSpielerLevel.kochel, 33, 'Biss je Karte (Schlüssel = Karte)');
  assert.ok(SU_BEFEHLE.includes('level'));
});

let server; const PORT = await freierPort();
const ordner = fs.mkdtempSync(path.join(os.tmpdir(), 'zombies-folge-'));
before(async () => { server = await starte({ port: PORT, optionen: { karte: 'dorf' }, leise: true, datenbank: path.join(ordner, 'z.db'), einstellungsDatei: path.join(ordner, 'einstellungen.json') }); });
after(async () => { await server.gracefullyShutdown(false); delete process.env.ZOMBIES_VERWALTUNG_LOKAL; fs.rmSync(ordner, { recursive: true, force: true }); });

test('Verwaltung-API: Reihenfolge speichern, im Raum-Einstellungsobjekt, Katalog in der Antwort', async () => {
  process.env.ZOMBIES_VERWALTUNG_LOKAL = '1';
  const post = body => fetch(`http://127.0.0.1:${PORT}/verwaltung/api`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json());
  const d = await post({ levelFolge: [{ karte: 'kochel', aktiv: true }, { karte: 'geretsried', aktiv: false }] });
  assert.deepEqual(ids(d.einstellungen.levelFolge), ['kochel', 'geretsried', 'geretsried2', 'isarauen', 'koenigsdorf', 'andermatt'], 'alte Liste ohne Geretsried 2: kommt hinter Geretsried, gleicher Schalter');
  assert.equal(d.einstellungen.levelFolge[1].aktiv, false); assert.equal(d.einstellungen.levelFolge[2].aktiv, false);
  assert.ok(Array.isArray(d.levelKatalog) && d.levelKatalog.length === LEVEL_KATALOG.length && d.levelKatalog[1].name === 'Geretsried 2');
  assert.deepEqual(aktiveFolge(SpielRaum.einstellungen.levelFolge), ['kochel', 'isarauen', 'koenigsdorf', 'andermatt']);
  const datei = JSON.parse(fs.readFileSync(path.join(ordner, 'einstellungen.json'), 'utf8'));
  assert.equal(datei.levelFolge[0].karte, 'kochel');
  // zurücksetzen: Standard
  const z = await post({ levelFolge: folgeVorgabe() });
  assert.deepEqual(z.einstellungen.levelFolge, folgeVorgabe());
});

test('Verwaltungsseite: Karte „Level-Reihenfolge“ mit Hoch/Runter und aktiv, Spaltenköpfe der Level-Tabelle folgen der Position', () => {
  const html = fs.readFileSync(new URL('../client/verwaltung.html', import.meta.url), 'utf8');
  assert.match(html, /karte\('Level-Reihenfolge', 'folgeKarte'\)/);
  assert.match(html, /levelFolge: folge/);
  assert.match(html, /nach oben/); assert.match(html, /nach unten/);
  assert.match(html, /function namenSetzen\(\)/);
});

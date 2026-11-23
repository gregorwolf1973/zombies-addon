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
import { LEVEL_KATALOG, bereinigeFolge, aktiveFolge, naechsterEintrag, karteAufloesen, kartenNr, levelSchluessel, eintragVon, folgeVorgabe } from '../client/levelkatalog.mjs';
import { evakArtFuer } from '../client/evak.mjs';
import { freierPort } from './hilfe.mjs';

const ids = f => f.map(x => x.karte);
const mitFolge = (folge, karte = 'geretsried', extra = {}) => ({ raum: { state: { karte, level: 1, ...extra }, constructor: { einstellungen: { levelFolge: folge } } } });
const naechste = (folge, karte) => Aufgaben.prototype.naechsteKarte.call(mitFolge(folge, karte));

test('Katalog: Standardreihenfolge wie bisher, Tabellen je Karte folgen dem Katalog', () => {
  assert.deepEqual(LEVEL_KARTEN, ['geretsried', 'isarauen', 'koenigsdorf', 'kochel', 'andermatt']);
  assert.deepEqual(LEVEL_WELTEN, LEVEL_KARTEN);
  assert.deepEqual(ids(folgeVorgabe()), LEVEL_KARTEN);
  assert.deepEqual(bereinige({}).levelFolge, folgeVorgabe());
  assert.deepEqual(grundwerte().levelFolge, folgeVorgabe());
  for (const k of LEVEL_KATALOG) for (const m of k.karten) assert.ok(KARTEN.includes(m), m);
  assert.equal(levelSchluessel('geretsried2'), 'geretsried'); assert.equal(eintragVon('dorf'), null);
  assert.equal(LEVEL_KATALOG[0].name, 'Geretsried (zufällig 1 oder 2)');
});

test('Folge bereinigen: unbekannte/doppelte fallen weg, fehlende kommen hinten dazu, mindestens ein Level aktiv', () => {
  assert.deepEqual(ids(bereinigeFolge([{ karte: 'kochel' }, { karte: 'mond' }, { karte: 'kochel' }, 'isarauen', null])), ['kochel', 'isarauen', 'geretsried', 'koenigsdorf', 'andermatt']);
  assert.deepEqual(bereinigeFolge([{ karte: 'kochel', aktiv: false }]).map(x => x.aktiv), [false, true, true, true, true]);
  assert.equal(bereinigeFolge(LEVEL_KARTEN.map(k => ({ karte: k, aktiv: false }))).filter(x => x.aktiv).length, 1, 'nicht alles aus');
  assert.deepEqual(bereinigeFolge('Unsinn', [{ karte: 'andermatt' }]).map(x => x.karte)[0], 'andermatt', 'Unsinn → bisherige Liste');
  const e = bereinige({ levelFolge: [{ karte: 'andermatt', aktiv: true }, { karte: 'geretsried', aktiv: false }] });
  assert.deepEqual(ids(e.levelFolge), ['andermatt', 'geretsried', 'isarauen', 'koenigsdorf', 'kochel']);
  assert.equal(bereinige({ bots: 3 }, e).levelFolge[1].aktiv, false, 'Teiländerung lässt die Folge stehen');
});

test('nächstes Level folgt der Reihenfolge, überspringt abgeschaltete und beginnt am Ende von vorn', () => {
  const folge = bereinigeFolge([{ karte: 'kochel' }, { karte: 'geretsried' }, { karte: 'isarauen', aktiv: false }, { karte: 'andermatt' }, { karte: 'koenigsdorf' }]);
  assert.deepEqual(aktiveFolge(folge), ['kochel', 'geretsried', 'andermatt', 'koenigsdorf']);
  assert.equal(naechste(folge, 'kochel'), 'geretsried');
  assert.equal(naechste(folge, 'geretsried2'), 'andermatt', 'beide Geretsried-Karten sind derselbe Eintrag');
  assert.equal(naechste(folge, 'koenigsdorf'), 'kochel', 'Ende → wieder Level 1');
  assert.equal(naechste(folge, 'isarauen'), 'kochel', 'abgeschaltete Karte → erstes aktives Level');
  assert.equal(naechste(folge, 'dorf'), 'kochel');
  assert.equal(naechsterEintrag(undefined, 'isarauen'), 'koenigsdorf', 'ohne Einstellung: Standard');
  assert.equal(Aufgaben.prototype.erstesLevel.call(mitFolge(folge)), 'kochel');
  assert.equal(Aufgaben.prototype.levelNr.call(mitFolge(folge), 'andermatt'), 3);
  assert.equal(Aufgaben.prototype.levelNr.call(mitFolge(folge), 'isarauen'), 0);
});

test('Geretsried bleibt Zufall 1/2 (oder feste Wahl), andere Karten sind fest', () => {
  assert.equal(karteAufloesen('geretsried', '', () => 0.1), 'geretsried');
  assert.equal(karteAufloesen('geretsried', '', () => 0.9), 'geretsried2');
  assert.equal(karteAufloesen('geretsried', 'geretsried2', () => 0.1), 'geretsried2', 'feste Wahl aus dem Backend');
  assert.equal(karteAufloesen('geretsried', 'kochel', () => 0.1), 'geretsried', 'fremde Wahl gilt nicht');
  assert.equal(karteAufloesen('kochel', 'geretsried2', () => 0.9), 'kochel');
  assert.equal(karteAufloesen('unbekannt'), 'unbekannt');
});

test('Levelwechsel: Karte folgt der Reihenfolge, die Levelnummer (Schwierigkeit) zählt weiter nach Position', () => {
  const aufrufe = [];
  const folge = bereinigeFolge([{ karte: 'andermatt' }, { karte: 'kochel' }]);
  const fake = Object.create(Aufgaben.prototype);
  fake.raum = { state: { karte: 'andermatt', level: 1, spieler: new Map(), besiegt: 7 }, chatVerlauf: [], constructor: { einstellungen: { levelFolge: folge }, level1Wahl: '', kartenWechsel: k => aufrufe.push(['karte', k]) },
    weltNeuStarten: (l, st) => aufrufe.push(['neu', st]) };
  fake.eingestiegen = new Set(); fake.plan = null;
  fake.levelWechsel();
  assert.deepEqual(aufrufe[0], ['karte', 'kochel']);
  assert.equal(aufrufe[1][1].karte, 'kochel'); assert.equal(aufrufe[1][1].level, 2);
  // fehlende Karten stehen hinten (aktiv); Geretsried = Zufall zwischen den zwei Karten
  fake.raum.state.karte = 'kochel'; aufrufe.length = 0;
  fake.levelWechsel();
  assert.equal(eintragVon(aufrufe[0][1]).id, 'geretsried', 'nach Kochel folgt der angehängte Rest (Geretsried)');
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
  assert.equal(kartenNr('andermatt', 1), 5); assert.equal(kartenNr('geretsried2', 9), 1); assert.equal(kartenNr('dorf', 3), 3, 'unbekannte Karte → Rückfall');
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
  assert.deepEqual(ids(d.einstellungen.levelFolge), ['kochel', 'geretsried', 'isarauen', 'koenigsdorf', 'andermatt']);
  assert.equal(d.einstellungen.levelFolge[1].aktiv, false);
  assert.ok(Array.isArray(d.levelKatalog) && d.levelKatalog.length === LEVEL_KATALOG.length && d.levelKatalog[0].name.includes('zufällig'));
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

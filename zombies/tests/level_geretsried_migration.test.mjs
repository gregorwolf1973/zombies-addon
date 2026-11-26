// Migration: Geretsried 1 und 2 sind eigene Level (früher ein Eintrag 'geretsried' = Zufall aus beiden Karten, Backend-Wahl 'level1').
// Alte Reihenfolge (5 Einträge) → 6 Einträge, positionsgebundene Tabelle „Zombies je Level“ 5 → 6 Zeilen (Kopie der Geretsried-Zeile,
// der Rest rückt nach), kartengebundene Werte (Biss) erbt Geretsried 2 von Geretsried, 'level1' → erstes aktives Level.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EinstellungsDatei, bereinige, grundwerte, migriereLevelTabelle } from '../server/einstellungen.mjs';
import { migriereFolge, aktiveFolge, kartenNr } from '../client/levelkatalog.mjs';

const ALT_FOLGE = ['geretsried', 'isarauen', 'koenigsdorf', 'kochel', 'andermatt'].map(karte => ({ karte, aktiv: true }));
const zeile = n => ({ grund: 10 * n, jeSpieler: n, horde: 20 + n, dauer: 10 + n, pause: n, gleichzeitig: n % 3, haeuser: 10 + n });
const ALT_TABELLE = [1, 2, 3, 4, 5].map(zeile);   // Zeile n = alte Position n (unterscheidbare Werte)
const ids = f => f.map(x => x.karte);
const tmp = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'zombies-gmig-')), 'einstellungen.json');

test('Gregors gespeicherter Stand: 5 Level + level1 + 5-Zeilen-Tabelle → 6 Level, Geretsried 1, Tabelle verschoben', () => {
  const f = tmp();
  fs.writeFileSync(f, JSON.stringify({ karte: 'level1', levelFolge: ALT_FOLGE, zombies: { level: ALT_TABELLE }, bissSpielerLevel: { geretsried: 50, isarauen: 25, koenigsdorf: 20 } }));
  const d = new EinstellungsDatei(f);
  const w = d.werte;
  assert.deepEqual(ids(w.levelFolge), ['geretsried', 'geretsried2', 'isarauen', 'koenigsdorf', 'kochel', 'andermatt']);
  assert.ok(w.levelFolge.every(x => x.aktiv), 'alle aktiv');
  assert.equal(w.karte, 'geretsried', "'level1' → erstes aktives Level");
  assert.equal(w.zombies.level.length, 6);
  assert.deepEqual(w.zombies.level, [1, 1, 2, 3, 4, 5].map(zeile), 'Geretsried 2 = Kopie von Position 1, Isarauen … behalten ihre Werte');
  assert.equal(w.bissSpielerLevel.geretsried2, 50, 'Geretsried 2 erbt den Biss von Geretsried');
  assert.equal(w.bissSpielerLevel.geretsried, 50); assert.equal(w.bissSpielerLevel.isarauen, 25);
  // speichern und neu laden: nichts verschiebt sich ein zweites Mal
  d.aendern({ bots: 3 });
  const neu = new EinstellungsDatei(f).werte;
  assert.deepEqual(neu.zombies.level, w.zombies.level);
  assert.deepEqual(neu.levelFolge, w.levelFolge);
  assert.equal(neu.karte, 'geretsried');
  assert.equal(JSON.parse(fs.readFileSync(f, 'utf8')).zombies.level.length, 6);
});

test('Geretsried an anderer Stelle bzw. abgeschaltet: Geretsried 2 dahinter mit gleichem Schalter, Tabelle passend', () => {
  const mitte = [{ karte: 'isarauen', aktiv: true }, { karte: 'koenigsdorf', aktiv: false }, { karte: 'geretsried', aktiv: true }, { karte: 'kochel', aktiv: true }, { karte: 'andermatt', aktiv: true }];
  const e = bereinige({ levelFolge: mitte, zombies: { level: ALT_TABELLE } });
  assert.deepEqual(ids(e.levelFolge), ['isarauen', 'koenigsdorf', 'geretsried', 'geretsried2', 'kochel', 'andermatt']);
  assert.equal(e.levelFolge[3].aktiv, true);
  assert.deepEqual(aktiveFolge(e.levelFolge), ['isarauen', 'geretsried', 'geretsried2', 'kochel', 'andermatt']);
  assert.deepEqual(e.zombies.level, [1, 2, 2, 3, 4, 5].map(zeile), 'Kopie an der aktiven Position von Geretsried (Level 2)');
  const aus = bereinige({ levelFolge: [{ karte: 'geretsried', aktiv: false }, ...ALT_FOLGE.slice(1)], zombies: { level: ALT_TABELLE }, karte: 'level1' });
  assert.deepEqual(aus.levelFolge.slice(0, 2), [{ karte: 'geretsried', aktiv: false }, { karte: 'geretsried2', aktiv: false }]);
  assert.deepEqual(aus.zombies.level, [1, 2, 3, 4, 5, 5].map(zeile), 'Positionen unverändert, hinten eine Kopie der letzten Zeile');
  assert.equal(aus.karte, 'isarauen', "'level1' → erstes aktives Level");
});

test('migriereFolge/migriereLevelTabelle: neue Listen und Tabellen bleiben unverändert', () => {
  const neu = [{ karte: 'geretsried2', aktiv: true }, { karte: 'kochel', aktiv: true }, { karte: 'geretsried', aktiv: false }];
  assert.equal(migriereFolge(neu), neu);
  assert.equal(migriereFolge('Unsinn'), 'Unsinn');
  assert.deepEqual(migriereFolge(['kochel', 'geretsried']), ['kochel', 'geretsried', { karte: 'geretsried2', aktiv: true }]);
  const sechs = [1, 2, 3, 4, 5, 6].map(zeile);
  assert.equal(migriereLevelTabelle(sechs, ALT_FOLGE), sechs);
  assert.deepEqual(migriereLevelTabelle(ALT_TABELLE), [1, 1, 2, 3, 4, 5].map(zeile), 'ohne Folge: Vorgabe (Geretsried vorn)');
  // Teiländerung mit bestehender (neuer) Folge: Tabelle mit 6 Zeilen wird nur bereinigt
  const a = bereinige({ levelFolge: ALT_FOLGE, zombies: { level: ALT_TABELLE } });
  const b = bereinige({ zombies: { level: [{ grund: 77 }] } }, a);
  assert.equal(b.zombies.level[0].grund, 77); assert.deepEqual(b.zombies.level.slice(1), a.zombies.level.slice(1));
  assert.equal(bereinige({ levelFolge: ALT_FOLGE }, a).levelFolge.length, 6, 'alte Liste aus einer zwischengespeicherten Seite: Geretsried 2 bleibt');
});

test('Alter Export über die Verwaltung (aendern): wird wie eine alte Datei umgestellt', () => {
  const d = new EinstellungsDatei(null);
  assert.equal(d.werte.zombies.level.length, 6);
  d.aendern({ karte: 'level1', levelFolge: ALT_FOLGE, zombies: { level: ALT_TABELLE }, bissSpielerLevel: { geretsried: 33 } });
  assert.deepEqual(d.werte.zombies.level, [1, 1, 2, 3, 4, 5].map(zeile));
  assert.equal(d.werte.bissSpielerLevel.geretsried2, 33);
  assert.equal(d.werte.karte, 'geretsried');
  // Geretsried 2 behält einen eigenen, später gesetzten Wert
  d.aendern({ bissSpielerLevel: { geretsried2: 5 } });
  d.aendern({ bissSpielerLevel: { geretsried: 40 } });
  assert.equal(d.werte.bissSpielerLevel.geretsried2, 5); assert.equal(d.werte.bissSpielerLevel.geretsried, 40);
});

test('Musik und Radio-Durchsage: Geretsried 2 nutzt weiter die Zuordnung „Level 1“ (gehört zur Karte)', () => {
  assert.equal(kartenNr('geretsried'), 1); assert.equal(kartenNr('geretsried2'), 1); assert.equal(kartenNr('isarauen'), 2); assert.equal(kartenNr('andermatt'), 5);
  const g = grundwerte();
  assert.deepEqual(Object.keys(bereinige({}, g).toene).filter(k => /^(musik|durchsage)Level\d$/.test(k)).sort(),
    ['durchsageLevel1', 'durchsageLevel2', 'durchsageLevel3', 'durchsageLevel4', 'durchsageLevel5', 'musikLevel1', 'musikLevel2', 'musikLevel3', 'musikLevel4', 'musikLevel5']);
});

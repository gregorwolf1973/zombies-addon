// Einstellungen ohne Limit: „von–bis“ der Verwaltung ist nur eine Empfehlung; der Server begrenzt nur technisch (client/zahl.mjs)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { bereinige, grundwerte } from '../server/einstellungen.mjs';
import { zahl, fest, SICHER } from '../client/zahl.mjs';
import { verkehrAnzahl, METER_JE_AUTO } from '../server/verkehr.mjs';
import { LEVEL_GRENZEN, LEVEL_SICHER } from '../server/schwierigkeit.mjs';

test('zahl(): frei ab Untergrenze, fest() klemmt, Unsinn → Vorgabe', () => {
  assert.equal(zahl(5000, 0, 100, 7), 5000);
  assert.equal(zahl(-4, 0, 100, 7), 0, 'nicht negativ');
  assert.equal(zahl(0, 20, 500, 100), 1, 'Untergrenze 1 bei Empfehlung ab >1');
  assert.equal(zahl(0, 0.05, 5, 1), 0.05);
  assert.equal(zahl('x', 0, 5, 3), 3); assert.equal(zahl(Infinity, 0, 5, 3), 3); assert.equal(zahl(NaN, 0, 5, 3), 3);
  assert.equal(zahl(1e12, 0, 5, 3), SICHER);
  assert.equal(zahl(1e12, 0, 5, 3, { max: 40 }), 40);
  assert.equal(fest(500, 0, 100, 7), 100); assert.equal(fest(-1, 0, 100, 7), 0);
});

test('Zahlen weit über der bisherigen Obergrenze bleiben erhalten', () => {
  const e = bereinige({
    zombieLeben: 5000, groesseGesamt: 400, zombieGroesse: 900, baumTempo: 300, verwandlung: 999, feuer: 99, feuerPhase: 999, unfall: 5000, unfallSchaden: 900,
    tempoHeldGehen: 120, tempoZombieJagen: 99, innenTempo: 400, tagMinuten: 1000, reichweite: { pistole: 500, granatwerfer: 900 },
    waffen: { pistole: { schaden: 5000, pause: 20 }, gewehr: { magazin: 9999, nachlade: 60 } },
    zombies: { tempo: 400, nacht: 90, hordeZiel: 99, hordeReichweite: 500 },
    bundeswehr: { falltage: 365, leopardReichweite: 500, leopardSchaden: 9999, leopardKanonePause: 600, boxerHordeSek: 99999, boxerReichweite: 900, mgMunition: 99999 },
    sprache: { hoerweite: 900 }, faehigkeiten: { xpFaktor: 5000 }, nebel: { sicht: 500 }, zombieSicht: { gehen: 400, aufgeben: 900, nacht: 900 },
    toeneHorde: { ab: 500, hoerweite: 400 }, radioStream: { vorlauf: 999, durchsage: 99 }, musik: { blende: 60 },
  });
  assert.equal(e.zombieLeben, 5000); assert.equal(e.groesseGesamt, 400); assert.equal(e.zombieGroesse, 900); assert.equal(e.baumTempo, 300);
  assert.equal(e.verwandlung, 999); assert.equal(e.feuer, 99); assert.equal(e.unfall, 5000); assert.equal(e.tempoHeldGehen, 120); assert.equal(e.innenTempo, 400);
  assert.equal(e.tagMinuten, 1000); assert.equal(e.reichweite.pistole, 500); assert.equal(e.reichweite.granatwerfer, 900);
  assert.equal(e.waffen.pistole.schaden, 5000); assert.equal(e.waffen.pistole.pause, 20); assert.equal(e.waffen.gewehr.magazin, 9999); assert.equal(e.waffen.gewehr.nachlade, 60);
  assert.equal(e.zombies.tempo, 400); assert.equal(e.zombies.nacht, 90); assert.equal(e.zombies.hordeZiel, 99); assert.equal(e.zombies.hordeReichweite, 500);
  assert.equal(e.bundeswehr.falltage, 365); assert.equal(e.bundeswehr.leopardReichweite, 500); assert.equal(e.bundeswehr.leopardSchaden, 9999);
  assert.equal(e.bundeswehr.leopardKanonePause, 600); assert.equal(e.bundeswehr.boxerHordeSek, 99999); assert.equal(e.bundeswehr.boxerReichweite, 900); assert.equal(e.bundeswehr.mgMunition, 99999);
  assert.equal(e.sprache.hoerweite, 900); assert.equal(e.faehigkeiten.xpFaktor, 5000); assert.equal(e.nebel.sicht, 500);
  assert.equal(e.zombieSicht.gehen, 400); assert.equal(e.zombieSicht.aufgeben, 900); assert.equal(e.zombieSicht.nacht, 900);
  assert.equal(e.toeneHorde.ab, 500); assert.equal(e.toeneHorde.hoerweite, 400); assert.equal(e.radioStream.vorlauf, 999); assert.equal(e.radioStream.durchsage, 99); assert.equal(e.musik.blende, 60);
});

test('Level-Tabelle: über der Empfehlung frei, Obergrenze nur technisch (LEVEL_SICHER)', () => {
  const e = bereinige({ zombies: { level: [{ grund: 400, jeSpieler: 150, horde: 300, dauer: 90, pause: 120, gleichzeitig: 9, haeuser: 80 }, { grund: 1e9 }] } });
  assert.deepEqual(e.zombies.level[0], { grund: 400, jeSpieler: 150, horde: 300, dauer: 90, pause: 120, gleichzeitig: 9, haeuser: 80 });
  assert.equal(e.zombies.level[1].grund, LEVEL_SICHER.grund);
  for (const k of Object.keys(LEVEL_GRENZEN)) assert.ok(LEVEL_SICHER[k] >= LEVEL_GRENZEN[k][1], k);
  assert.equal(bereinige({ zombies: { level: [{ dauer: 0, pause: 0 }] } }).zombies.level[0].dauer, 1, 'Dauer mindestens 1');
});

test('Anzahlen mit Sicherheitsgrenze (Server/Speicher) und feste Prozentwerte', () => {
  const e = bereinige({ bots: 99, autos: 999, menschen: 1e6, verkehr: 1e6, funde: { wasser: 1e6 }, zombies: { hordeTrupp: 1e6, lagerWelle: 1e6 }, polizei: { anzahl: 999 }, hund: { streuner: 999 }, bundeswehr: { boxerHordeMin: 1e6, boxerHordeMax: 1e6 } });
  assert.deepEqual([e.bots, e.autos, e.menschen, e.verkehr, e.funde.wasser], [30, 250, 2000, 1000, 1000]);
  assert.deepEqual([e.zombies.hordeTrupp, e.zombies.lagerWelle, e.polizei.anzahl, e.hund.streuner, e.bundeswehr.boxerHordeMin, e.bundeswehr.boxerHordeMax], [2000, 5000, 50, 200, 2000, 2000]);
  // Wahrscheinlichkeiten/Lautstärken in %, Uhrzeiten: weiter echte Grenzen
  const f = bereinige({ biss: 500, bissSpieler: 500, unfallExplosion: 500, tagAb: 9999, nachtAb: 5, nachtDunkel: 500, zombies: { ueberraschung: 500 }, hund: { ablenkung: 500 }, sprache: { funk: 500, stockwerk: 500 },
    aufgaben: { stunde: 99 }, nebel: { morgen: 500, zombie: 500 }, musik: { laut: 500 }, zombieSicht: { kegel: 900 }, bissSpielerLevel: { kochel: 500 } });
  assert.deepEqual([f.biss, f.bissSpieler, f.unfallExplosion, f.tagAb, f.nachtAb, f.nachtDunkel], [100, 100, 100, 660, 1080, 100]);
  assert.deepEqual([f.zombies.ueberraschung, f.hund.ablenkung, f.sprache.funk, f.sprache.stockwerk, f.aufgaben.stunde, f.nebel.morgen, f.nebel.zombie, f.musik.laut], [100, 100, 100, 100, 23, 100, 100, 100]);
  assert.deepEqual([f.zombieSicht.kegel, f.bissSpielerLevel.kochel], [360, 100]);   // Munitionsglück gibt es seit 0.85 nicht mehr
});

test('Negatives bleibt technisch unmöglich, Streuner -1 = automatisch', () => {
  const e = bereinige({ zombieLeben: -9, feuer: -1, verkehr: -5, autos: -1, bots: -2, hund: { streuner: -7 }, waffen: { pistole: { schaden: -3, pause: -1 } } });
  assert.deepEqual([e.zombieLeben, e.feuer, e.verkehr, e.autos, e.bots, e.hund.streuner], [1, 0, 0, 0, 0, -1]);
  assert.equal(e.waffen.pistole.schaden, 1); assert.equal(e.waffen.pistole.pause, 0.05);
});

test('Fahrende Autos: Dichte (Meter je Auto) ist eine eigene Einstellung, keine Obergrenze mehr', () => {
  const g = grundwerte();
  assert.equal(g.verkehrDichte, 2000); assert.equal(g.verkehr, 30);
  assert.equal(bereinige({ verkehrDichte: 300 }).verkehrDichte, 300);
  assert.equal(bereinige({ verkehrDichte: 1 }).verkehrDichte, 10, 'technische Untergrenze 10 m');
  assert.equal(bereinige({ verkehr: 200 }).verkehr, 200);
  // 40 km Straße: 2000 m/Auto → 20; 200 m/Auto und Grenze 200 → 200
  assert.equal(verkehrAnzahl(40000, 200), 20);
  assert.equal(verkehrAnzahl(40000, 200, 200), 200);
  assert.equal(verkehrAnzahl(40000, 200, 300), 133);
  assert.equal(verkehrAnzahl(40000, 50, 200), 50, '`verkehr` bleibt Obergrenze');
  assert.equal(verkehrAnzahl(500, 200, 300), 3, 'mindestens 3');
  assert.equal(verkehrAnzahl(40000, 200, 0), verkehrAnzahl(40000, 200, METER_JE_AUTO), 'ungültige Dichte → Vorgabe');
});

test('Verwaltungsseite: Schieber sind nur Empfehlung (Hinweis „empfohlen“, Eintippen frei), feste Werte bleiben begrenzt', () => {
  const html = fs.readFileSync(new URL('../client/verwaltung.html', import.meta.url), 'utf8');
  assert.match(html, /empfohlen: /);
  assert.match(html, /function weiten\(v\)/);
  assert.match(html, /var FESTE = \{/);
  // kein Wert-Klemmen mehr am Schieber für freie Werte: step 'any', Min/Max wandern mit dem getippten Wert
  assert.match(html, /r\.step = 'any'/);
  for (const id of ['ueberraschung', 'tnBiss', 'tnUnfallExpl', 'spFunk', 'tuFrei', 'tnHundAblenk', 'tnNachtDunkel', 'tnTagAb', 'agStunde']) assert.match(html, new RegExp('\\b' + id + ': null'), id + ' bleibt fest');
  // jedes Server-fest()-Feld der Schieber steht in FESTE (Gegenprobe: freie Beispiele nicht)
  for (const id of ['tnVerkehr', 'tnZLeben', 'tempo', 'tnFeuer', 'wfS_pistole']) assert.doesNotMatch(html.slice(html.indexOf('var FESTE = {'), html.indexOf('var FORMATE')), new RegExp('\\b' + id + ':'), id + ' ist frei');
  assert.match(html, /id="tnVerkehrDichte"/);
});

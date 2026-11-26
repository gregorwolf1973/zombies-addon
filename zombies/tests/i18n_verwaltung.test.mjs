// Zweisprachigkeit Phase 3: Verwaltungsseite (Übersetzung über den deutschen Wortlaut, client/i18n_muster.mjs),
// Quizfragen je Sprache (server/fragenquelle.mjs), englische Radio-Eilmeldung (Sprachvariante _en), manifest.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { vwUebersetzer } from '../client/i18n_muster.mjs';
import { vwTabellen, verwaltungTexteSkript } from '../server/verwaltung_texte.mjs';
import { htmlTexte, AUSNAHMEN } from '../tools/i18n_pruefen.mjs';
import { EREIGNISSE, TON_GRUPPEN } from '../server/einstellungen.mjs';
import { LEVEL_KATALOG } from '../client/levelkatalog.mjs';
import { sprachVariante, zuordnungInSprache } from '../client/tonlogik.mjs';
import { setzeFragenquelle, holeFragen } from '../server/fragenquelle.mjs';
import { starte } from '../server/index.mjs';
import { freierPort } from './hilfe.mjs';

const { de, en } = vwTabellen();
const u = vwUebersetzer(de, en);
const norm = s => String(s).replace(/\s+/g, ' ').trim();
const ent = s => s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');

test('Übersetzer: exakter Wortlaut, Muster mit Platzhaltern, Zahlen, Zeichen vorn, Leerraum bleibt', () => {
  assert.equal(u.text('Gerade im Spiel'), 'In the game right now');
  assert.equal(u.text('  Gerade   im Spiel '), '  In the game right now ');
  assert.equal(u.text('✓ Gespeichert 12:30'), '✓ Saved 12:30');
  assert.equal(u.text('⚠ Laden fehlgeschlagen: Nur über die Home-Assistant-Seitenleiste'), '⚠ Loading failed: Only via the Home Assistant sidebar', 'Werte werden selbst übersetzt');
  assert.equal(u.text('3,5 min'), '3.5 min');
  assert.equal(u.text('×1,5'), '×1.5');
  assert.equal(u.text('Gerade: steht · 2,5 Spieltage seit Weltbeginn.'), 'Right now: standing · 2.5 game days since the world began.');
  assert.equal(u.text('1 Spieler'), '1 player');
  assert.equal(u.text('4 Spieler'), '4 players');
  assert.equal(u.text('🔫 Waffen (7)'), '🔫 Weapons (7)');
  assert.equal(u.text('Musik (je Level, Lager, Horde, Finale) (10)'), 'Music (per level, camp, horde, finale) (10)', 'letzte Klammer');
  assert.equal(u.text('Hauptlied Geretsried 1 + Flugplatz Königsdorf'), 'Main theme Geretsried 1 + Königsdorf airfield');
  assert.equal(u.text('Nachrichtensprecher im Live-Radio (allgemeine Zombie-Eilmeldung) auf Isarauen und Kochel am See; unterbricht den Sender, kommt aus dem Autoradio – gehört zur Karte; englische Spieler hören die Variante mit Endung _en, falls vorhanden').includes('Isarauen and Kochel am See'), true);
  assert.equal(u.text('Sepp'), null, 'Unbekanntes bleibt');
  assert.equal(u.text('42'), null);
  assert.equal(u.t('vw.info.trefferDat', { n: 1 }), '1 hit');
  assert.equal(u.t('vw.info.trefferDat', { n: 3 }), '3 hits');
  const d = vwUebersetzer(de, de);
  assert.equal(d.t('vw.info.trefferDat', { n: 3 }), '3 Treffern');
});

// Alles, was auf der Seite deutsch aussieht, muss eine Übersetzung haben: als ganzer Text (exakt/Muster) oder als Teil einer Vorlage (zusammengesetzte Texte)
test('Verwaltungsseite: jeder deutsche Text hat eine Übersetzung (vw.* in de.mjs/en.mjs)', () => {
  const html = fs.readFileSync(new URL('../client/verwaltung.html', import.meta.url), 'utf8');
  const zeilen = html.split('\n');
  const deWerte = Object.values(de).map(norm);
  const DEUTSCH = /[äöüÄÖÜß]|(^|[^\p{L}])(der|die|das|und|nicht|mit|für|ist|ein|eine|auf|zu|im|den|dem|von|wird|kein|keine|noch|oder|auch|nur|bei|nach|vom|zum|zur|je|alle|bis|gilt|Spieler|Fehler|Speichern|Laden|Datei|Dateien|Vorgabe|Leben|Schaden|Tempo|Zombies? \p{Ll})(?=$|[^\p{L}])/u;
  const fehlt = [];
  for (const l of htmlTexte(html)) {
    if (/i18n-ok|console\.|Feld fehlt/.test(zeilen[l.zeile - 1] || '')) continue;
    for (const teil of ent(l.wert).split(/<[^>]*>/)) {
      const t = norm(teil.replace(/\$\{\}/g, ' '));
      if (!/\p{L}{2}/u.test(t) || /^[\w.-]+$/.test(t) || /^(#|\.|--|var\(|https?:|\/\*|:root)/.test(t) || /\{[^}]*:[^}]*;/.test(t)) continue;   // Bezeichner, CSS
      if (!DEUTSCH.test(t.replace(AUSNAHMEN[0], ''))) continue;   // Ortsnamen allein („4 · Königsdorf“) bleiben
      if (u.text(t) !== null) continue;
      if (deWerte.some(v => v.includes(t))) continue;   // Teil eines zusammengesetzten Textes (Vorlage mit {platzhalter})
      fehlt.push(`${l.zeile}: ${t.slice(0, 90)}`);
    }
  }
  assert.deepEqual(fehlt, []);
});

test('Verwaltungsseite: Texte vom Server (Töne, Gruppen, Karten) sind übersetzbar', () => {
  const fehlt = [];
  for (const e of EREIGNISSE) for (const t of [e.name, e.beschreibung]) if (t && u.text(t) === null) fehlt.push(t);
  for (const g of TON_GRUPPEN) if (u.text(g.name) === null && g.name !== 'Zombies') fehlt.push(g.name);
  assert.deepEqual(fehlt, []);
  for (const k of LEVEL_KATALOG) if (/Flugplatz|\(Finale\)/.test(k.name)) assert.ok(u.text(k.name) !== null, k.name);   // sonst reine Ortsnamen
});

test('de/en: vw-Einträge ohne Umlaut im Englischen (außer Ortsnamen), Muster haben festen Text', () => {
  for (const [k, v] of Object.entries(en)) if (k.startsWith('vw.') && /[äöüÄÖÜß]/.test(v.replace(/Königsdorf|Oberbayern/g, ''))) assert.fail(`${k}: ${v}`);
  assert.ok(u.anzahl.exakt > 500 && u.anzahl.muster > 50, JSON.stringify(u.anzahl));
});

test('Skript /verwaltung_texte.js: Sprache nach Browser bzw. gemerkt, vwT/vwText im Fenster', () => {
  const lauf = (sprachen, gemerkt) => {
    const speicher = new Map(gemerkt ? [['zob_sprache', gemerkt]] : []);
    const hoerer = [];
    const docEl = { lang: '', classList: { add() {}, remove() {} } };
    const fenster = {
      navigator: { languages: sprachen, language: sprachen[0] },
      localStorage: { getItem: k => speicher.get(k) ?? null, setItem: (k, v) => speicher.set(k, v) },
      document: { documentElement: docEl, head: { appendChild() {} }, createElement: () => ({}), addEventListener: (e, f) => hoerer.push(f), getElementById: () => null },
      location: { reload() {} }, setTimeout() {}, alert() {}, confirm: m => m, prompt() {},
    };
    fenster.window = fenster;
    vm.runInNewContext(verwaltungTexteSkript(), fenster);
    return fenster;
  };
  const e = lauf(['en-US', 'en']);
  assert.equal(e.vwSprache, 'en');
  assert.equal(e.document.documentElement.lang, 'en');
  assert.equal(e.vwText('Gerade im Spiel'), 'In the game right now');
  assert.equal(e.confirm('Wirklich die Welt neu starten? Alle Spieler werden kurz getrennt.'), 'Really restart the world? All players will be briefly disconnected.', 'Rückfragen werden übersetzt');
  assert.equal(e.vwT('vw.info.zBwNie'), 'game days from the start of the world · never');
  const d = lauf(['de-AT', 'en']);
  assert.equal(d.vwSprache, 'de');
  assert.equal(d.vwText('Gerade im Spiel'), 'Gerade im Spiel');
  assert.equal(lauf(['en-US'], 'de').vwSprache, 'de', 'gemerkte Wahl gilt');
  assert.equal(lauf(['de-DE'], 'en').vwSprache, 'en');
});

test('Quizfragen je Sprache: Englisch aus en/…/spielfragen.txt mit den IDs der deutschen, sonst Rückfall Deutsch', () => {
  const ordner = fs.mkdtempSync(path.join(os.tmpdir(), 'zombies-fragen-'));
  try {
    const kopf = '^ Thema ^ Frage ^ Richtig ^ Falsch 1 ^ Falsch 2 ^ Seite ^\n';
    fs.writeFileSync(path.join(ordner, 'de.txt'), kopf + '| T | Wie viel Wasser? | Viel | Wenig | Keins | [[ueberlebenshandbuch:de:k07_wasser]] |\n| T | Wo lagern? | Kühl | Warm | Nass | [[ueberlebenshandbuch:de:k08_lebensmittel]] |\n');
    fs.writeFileSync(path.join(ordner, 'en.txt'), '^ Topic ^ Question ^ Correct ^ Wrong 1 ^ Wrong 2 ^ Page ^\n| T | How much water? | Lots | Little | None | [[ueberlebenshandbuch:en:k07_wasser]] |\n| T | Where to store? | Cool | Warm | Wet | [[ueberlebenshandbuch:en:k08_lebensmittel]] |\n');
    setzeFragenquelle(path.join(ordner, 'de.txt'), 'de', null);
    setzeFragenquelle(path.join(ordner, 'en.txt'), 'en', null);
    const d = holeFragen('de'), e = holeFragen('en');
    assert.equal(e[0].frage, 'How much water?');
    assert.equal(e[1].richtig, 'Cool');
    assert.equal(e[0].seite, 'ueberlebenshandbuch:en:k07_wasser');
    assert.deepEqual(e.map(f => f.id), d.map(f => f.id), 'gleiche IDs (gleiche Reihenfolge)');
    assert.equal(holeFragen('xx')[0].frage, 'Wie viel Wasser?');
    assert.equal(holeFragen()[0].frage, 'Wie viel Wasser?');
    setzeFragenquelle(path.join(ordner, 'fehlt.txt'), 'en', null);
    assert.equal(holeFragen('en')[0].frage, 'Wie viel Wasser?', 'ohne englische Seite: Deutsch');
  } finally {
    setzeFragenquelle(process.env.ZOMBIES_FRAGEN || '/share/dokuwiki/data/pages/krisenvorsorge/spielfragen.txt', 'de', path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'server', 'spielfragen.txt'));
    setzeFragenquelle(process.env.ZOMBIES_FRAGEN_EN || '/share/dokuwiki/data/pages/en/krisenvorsorge/spielfragen.txt', 'en', path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'server', 'spielfragen_en.txt'));
    fs.rmSync(ordner, { recursive: true, force: true });
  }
});

test('Mitgelieferte Fragen: Englisch gleich viele wie Deutsch, gleiche Seiten (en statt de)', async () => {
  const { leseSpielfragen } = await import('../server/raetsel.mjs');
  const lies = n => leseSpielfragen(fs.readFileSync(new URL('../server/' + n, import.meta.url), 'utf8'));
  const d = lies('spielfragen.txt'), e = lies('spielfragen_en.txt');
  assert.deepEqual(e.fehler, []);
  assert.equal(e.fragen.length, d.fragen.length);
  e.fragen.forEach((f, i) => assert.equal(f.seite, d.fragen[i].seite.replace(':de:', ':en:'), f.frage));
  for (const f of e.fragen) assert.ok(!/[äöüß]/.test(f.frage + f.richtig + f.falsch.join('')), f.frage);
});

test('Töne: englische Spieler hören die _en-Variante, falls es sie gibt', () => {
  const da = new Set(['eilmeldung_allgemein_en.mp3']);
  assert.equal(sprachVariante('eilmeldung_allgemein.mp3', 'en', da), 'eilmeldung_allgemein_en.mp3');
  assert.equal(sprachVariante('eilmeldung_allgemein.mp3', 'de', da), 'eilmeldung_allgemein.mp3');
  assert.equal(sprachVariante('funk_abholung.mp3', 'en', da), 'funk_abholung.mp3', 'ohne Variante: Original');
  assert.equal(sprachVariante('x.mp3', 'en', new Set()), 'x.mp3');
  const z = { durchsageLevel1: { dateien: ['eilmeldung_allgemein.mp3', 'andere.mp3'], laut: 90 }, leer: null };
  const e = zuordnungInSprache(z, 'en', da);
  assert.deepEqual(e.durchsageLevel1, { dateien: ['eilmeldung_allgemein_en.mp3', 'andere.mp3'], laut: 90 });
  assert.deepEqual(z.durchsageLevel1.dateien, ['eilmeldung_allgemein.mp3', 'andere.mp3'], 'Einstellung bleibt unverändert');
  assert.equal(e.leer, null);
});

test('manifest: Eigenname bleibt, nur Beschreibung/Sprache englisch', () => {
  const m = JSON.parse(fs.readFileSync(new URL('../client/manifest.json', import.meta.url), 'utf8'));
  const e = JSON.parse(fs.readFileSync(new URL('../client/manifest_en.json', import.meta.url), 'utf8'));
  assert.equal(e.name, 'Zombies in Oberbayern'); assert.equal(m.name, e.name);
  assert.equal(m.lang, 'de'); assert.equal(e.lang, 'en');
  assert.ok(!/[äöüß]/.test(e.description));
  assert.deepEqual({ ...e, description: '', lang: '' }, { ...m, description: '', lang: '' }, 'sonst identisch');
});

// ---------- Server: Texte-Skript, Tonvarianten in /info ----------
const ordner = fs.mkdtempSync(path.join(os.tmpdir(), 'zombies-i18nvw-'));
const toene = path.join(ordner, 'toene');
let server, PORT;
before(async () => {
  fs.mkdirSync(toene);
  for (const n of ['eilmeldung_allgemein.mp3', 'eilmeldung_allgemein_en.mp3', 'hund.mp3']) fs.writeFileSync(path.join(toene, n), 'x');
  process.env.ZOMBIES_TOENE = toene;
  PORT = await freierPort();
  server = await starte({ port: PORT, optionen: { karte: 'dorf', zombies: 5 }, leise: true, datenbank: path.join(ordner, 'z.db'), einstellungsDatei: path.join(ordner, 'e.json') });
});
after(async () => { await server.gracefullyShutdown(false); delete process.env.ZOMBIES_TOENE; fs.rmSync(ordner, { recursive: true, force: true }); });

test('Server: /verwaltung_texte.js wird ausgeliefert, /info nennt die englischen Tonvarianten', async () => {
  const r = await fetch(`http://127.0.0.1:${PORT}/verwaltung_texte.js`);
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type'), /javascript/);
  assert.match(await r.text(), /vwUebersetzer/);
  const i = await (await fetch(`http://127.0.0.1:${PORT}/info`)).json();
  assert.deepEqual(i.toeneEn, ['eilmeldung_allgemein_en.mp3']);
  const seite = fs.readFileSync(new URL('../client/verwaltung.html', import.meta.url), 'utf8');
  assert.ok(seite.indexOf('src="verwaltung_texte.js"') < seite.indexOf('<script>'), 'Texte-Skript vor allen anderen');
  assert.match(seite, /id="vwSprachwahl"/);
});

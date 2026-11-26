// Einstellungen des Spiels: werden auf der Verwaltungsseite (HA-Seitenleiste) geändert und gelten sofort.
// Gespeichert in /data/einstellungen.json; beim allerersten Start dienen die Add-on-Optionen als Startwerte.
import fs from 'node:fs';
import path from 'node:path';
import { DINGE, WAFFEN, MOEBEL_ANTEIL } from '../client/welt.mjs';
import { HUND } from './hund.mjs';
import { hashe, hashGueltig } from './superuser.mjs';
import { LEVEL_VORGABE, LEVEL_GRENZEN, LEVEL_SICHER } from './schwierigkeit.mjs';
import { NEBEL_VORGABE, bereinigeNebel } from './nebel.mjs';
import { SICHT_VORGABE, bereinigeSicht } from '../client/zombiesicht.mjs';
import { zfFigurenEinst } from '../client/zombiefiguren.mjs';
import { hfFigurenEinst } from '../client/heldenfiguren.mjs';
import { zahl, fest } from '../client/zahl.mjs';
import { PKW_VORGABE } from '../client/pkw.mjs';
import { LEVEL_KATALOG, bereinigeFolge, folgeVorgabe, aktiveFolge } from '../client/levelkatalog.mjs';

// Vorlage: im Backend eingestellte Werte, die als Vorgabe übernommen wurden (Stand 22.11.2026) – überschreibt die Grundwerte unten.
// Arrays werden ganz ersetzt. Neu erzeugen: aktuelle /data/einstellungen.json gegen die Grundwerte vergleichen (ohne Hash, Zugangscode, Test).
const VORLAGE = (() => { try { return JSON.parse(fs.readFileSync(new URL('./vorlage.json', import.meta.url), 'utf8')); } catch { return {}; } })();
function mischen(a, b) {
  if (!b || typeof b !== 'object' || Array.isArray(b) || !a || typeof a !== 'object' || Array.isArray(a)) return b === undefined ? a : JSON.parse(JSON.stringify(b));
  const o = { ...a }; for (const k of Object.keys(b)) o[k] = mischen(a[k], b[k]); return o;
}

// Kartenliste kommt aus dem Katalog (client/levelkatalog.mjs): neue Level-Karte = Eintrag dort, sie erscheint hier und in der Level-Reihenfolge.
// Die frühere Wahl 'level1' (Zufall Geretsried/Geretsried 2) gibt es nicht mehr: gespeichert wird sie zum ersten aktiven Level (bereinige).
export const KARTEN = [...LEVEL_KATALOG.map(k => k.id), 'dorf'];
export const LEVEL_WELTEN = LEVEL_KATALOG.map(k => k.id);
export const BISS_LEVEL_VORGABE = { geretsried: 12, geretsried2: 12, isarauen: 12, koenigsdorf: 14, kochel: 16, andermatt: 18 };   // Ansteckung der Spieler in % je Sekunde Biss, steigend   // Karten der Level (wie LEVEL_KARTEN in aufgaben.mjs)
export const EVAK_ARTEN = ['bus', 'panzer', 'flugzeug', 'absturz', 'heli', 'bunker'];   // Evakuierungsarten (server/aufgaben.mjs); '' in den Einstellungen = je Karte
export const SCHWIERIGKEITEN = ['leicht', 'normal', 'schwer'];
export const ZEITRAFFER = [1, 5, 10, 60];
export const REICHWEITE_VORGABE = { pistole: 29, gewehr: 52, schrotflinte: 20, mp: 30, mg: 45, armbrust: 25, scharfschuetze: 75, granatwerfer: 25, handgranate: 25 };   // Meter
// Zombietypen (Reihenfolge = Nummer der Variante, siehe ZOMBIE_TYPEN im Client)
export const ZOMBIE_TYPEN = ['tarn', 'dirndl', 'feuerwehr', 'hemd', 'lederhose', 'z6', 'z7',
  'kaminkehrer', 'bauarbeiter', 'koch', 'holzfaeller', 'mechaniker', 'brandmeister', 'kehrer', 'strassenarbeiter', 'baecker', 'flanell', 'werkstatt', 'vogelscheuche', 'postbote', 'streife', 'wachtmeister', 'landstreicher', 'mantel', 'langhaar'];   // ab 'kaminkehrer': Gemini-Bogen figuren3
// je Waffe einstellbar: Schaden und Abklingzeit (Sekunden zwischen zwei Schlägen/Schüssen); Vorgabe = Werte aus WAFFEN
export const WAFFEN_VORGABE = Object.fromEntries(Object.entries(WAFFEN).map(([w, v]) => [w, { schaden: v.schaden, pause: v.pause, ...(v.fern ? { magazin: v.magazin ?? 1, nachlade: v.nachlade ?? 4 } : {}) }]));
export const HORDE_TON_VORGABE = { ab: 8, nurHorde: 20, voll: 40, aus: 5, hoerweite: 30 };   // Hordengeräusch: Zombies in Hörweite (Meter), siehe client/hordenlogik.mjs
export const MUSIK_VORGABE = { laut: 35, blende: 3 };
// Autoradio als Live-Radio: Jedes Gerät holt den Stream direkt beim Sender (nicht über diesen Server); an = statt der Autoradio-Datei
export const RADIO_STREAM_VORGABE = { an: false, url: '', name: '', laut: 60, vorlauf: 30, durchsage: 4 };   // durchsage: alle … Minuten Eilmeldung (0 = aus)   // vorlauf: s stumm ab Spielbeginn (Senderwerbung am Anfang)   // Musik-Lautstärke in %, Überblendzeit in Sekunden
// Vorbelegung (nur wenn die Dateien im Tonordner liegen und dem Ereignis noch nichts zugeordnet ist, siehe server/index.mjs)
export const TON_STANDARD = {
  funkAnsage: { dateien: ['funk_abholung.mp3'], laut: 100 },   // Sprachansage nach dem Funkspruch (Datei legt Gregor selbst in den Tonordner)
  horde: { dateien: ['zombie-horde-growls-and-snarls-7c0b158d.mp3', 'alice_soundz-zombie-sound-224167.mp3'], laut: 80 },
  hordeAkzent: { dateien: ['freesound_community-zombie-horde-87204.mp3'], laut: 80 },
  musikLevel5: { dateien: ['franzian-deo-apocalypse-469581.mp3'], laut: 100 },
  hundBellen: { dateien: ['dragon-studio-free-dog-bark-419014.mp3', 'dragon-studio-dog-bark-382732.mp3'], laut: 80 },
  durchsageLevel1: { dateien: ['eilmeldung_allgemein.mp3'], laut: 100 },   // allgemeine Eilmeldung ohne Ortsnamen, Piper-Stimme
  durchsageLevel2: { dateien: ['eilmeldung_allgemein.mp3'], laut: 100 },
};
export const TON_DATEI = /^[\w][\w.()+\- ]{0,118}\.(mp3|ogg|wav|m4a)$/i;

// Anzeigenamen der Tondateien: { dateiname: name } – getrimmt, höchstens 60 Zeichen, leere fallen weg (leer setzen = Namen entfernen)
export const TON_NAME_MAX = 60;
export function bereinigeToeneNamen(neu, alt = {}) {
  const aus = {};
  for (const [k, v] of Object.entries(alt && typeof alt === 'object' ? alt : {})) if (TON_DATEI.test(k) && typeof v === 'string' && v.trim()) aus[k] = v.trim().slice(0, TON_NAME_MAX);
  if (neu && typeof neu === 'object' && !Array.isArray(neu)) {
    for (const [k, v] of Object.entries(neu)) {
      if (!TON_DATEI.test(k)) continue;
      const n = typeof v === 'string' ? v.trim().slice(0, TON_NAME_MAX).trim() : '';
      if (n) aus[k] = n; else delete aus[k];
    }
  }
  return aus;
}

// Musik und Radio-Durchsage „Level n“ gehören zur Karte (Katalog-Nr., Geretsried 1 und 2 teilen sich Nr. 1): Namen der Karten mit dieser Nummer
const nrNamen = (n, trenner = ' + ') => LEVEL_KATALOG.filter(k => k.nr === n).map(k => k.name.replace(/ \(.*\)$/, '')).join(trenner) || `Level ${n}`;

// Hintergrundmusik im Spiel: je Situation eine Dateiliste (nach Ende das nächste Stück, abwechselnd); Auswahl siehe client/musiklogik.mjs
export const MUSIK_EREIGNISSE = [
  ...[1, 2, 3, 4, 5].map(n => ({ id: 'musikLevel' + n, name: `Hauptlied ${nrNamen(n)}`, beschreibung: `Hauptlied auf ${nrNamen(n, ' und ')} – gehört zur Karte und wandert mit, wenn die Level-Reihenfolge geändert wird`, art: 'schleife', gruppe: 'spielmusik', kategorien: ['musik'], lautVorgabe: 100 })),
  { id: 'musikLager', name: 'Im Bundeswehr-Lager', beschreibung: 'Solange du im Bundeswehr-Lager bist', art: 'schleife', gruppe: 'spielmusik', kategorien: ['musik'], lautVorgabe: 100 },
  { id: 'musikHorde', name: 'Kampf gegen Horde', beschreibung: 'Solange das Hordengeräusch läuft (bleibt danach noch 10 s)', art: 'schleife', gruppe: 'spielmusik', kategorien: ['musik'], lautVorgabe: 100 },
  { id: 'musikSafe', name: 'Im Safehouse', beschreibung: 'Solange du in einem Safe Room bist', art: 'schleife', gruppe: 'spielmusik', kategorien: ['musik'], lautVorgabe: 100 },
  { id: 'musikFinale', name: 'Finale', beschreibung: 'Wenn in Level 5 der Atomschlag-Countdown läuft', art: 'schleife', gruppe: 'spielmusik', kategorien: ['musik'], lautVorgabe: 100 },
];

// Spielereignisse, denen auf der Einstellungsseite Tondateien zugeordnet werden
export const EREIGNISSE = [
  { id: 'zombieTod', name: 'Zombie stirbt', beschreibung: 'Wenn ein Zombie erledigt wird', art: 'einmal', gruppe: 'zombies', kategorien: ['zombies'] },
  { id: 'kriecher', name: 'Kriecher', beschreibung: 'Stöhnen kriechender Zombies in der Nähe', art: 'einmal', gruppe: 'zombies', kategorien: ['zombies'] },
  { id: 'stoehnen', name: 'Zombie stöhnt', beschreibung: 'Stöhnen gehender Zombies in der Nähe', art: 'einmal', gruppe: 'zombies', kategorien: ['zombies'] },
  { id: 'entdeckt', name: 'Zombie entdeckt dich', beschreibung: 'Schrei, wenn ein Zombie zu jagen beginnt', art: 'einmal', gruppe: 'zombies', kategorien: ['zombies'] },
  { id: 'horde', name: 'Hordengeräusch', beschreibung: 'Schleife, sobald viele Zombies in Hörweite sind (Schwellen unten bei „Hordengeräusch“); es wird zufällig eine der Dateien gewählt und nahtlos wiederholt', art: 'schleife', gruppe: 'zombies', kategorien: ['zombies'] },
  { id: 'hordeAkzent', name: 'Horde kommt (Akzent)', beschreibung: 'Kurzer Ton, wenn plötzlich eine neue Horde in Hörweite kommt (höchstens alle 30 s)', art: 'einmal', gruppe: 'zombies', kategorien: ['zombies'] },
  { id: 'stadt', name: 'Stadtgeräusche', beschreibung: 'Hintergrund draußen (Verkehr in der Ferne)', art: 'schleife', gruppe: 'umgebung', kategorien: ['umgebung', 'fahrzeuge'] },
  { id: 'zombielandTag', name: 'Zombieland (Tag)', beschreibung: 'Ferne Zombies tagsüber – kurze Töne kommen ab und zu aus wechselnder Richtung', art: 'schleife', gruppe: 'zombies', kategorien: ['zombies', 'umgebung'] },
  { id: 'zombielandNacht', name: 'Zombieland (Nacht)', beschreibung: 'Ferne Zombies und Schreie in der Nacht', art: 'schleife', gruppe: 'zombies', kategorien: ['zombies', 'umgebung'] },
  { id: 'nachteinbruch', name: 'Nachteinbruch', beschreibung: 'Einmal, wenn es dunkel wird', art: 'einmal', gruppe: 'umgebung', kategorien: ['umgebung', 'sirene', 'zombies'] },
  { id: 'menschGebissen', name: 'Mensch wird gebissen', beschreibung: 'Schrei, wenn ein Bewohner gebissen wird', art: 'einmal', gruppe: 'zombies', kategorien: ['zombies', 'spieler'] },
  { id: 'sirene', name: 'Sirene', beschreibung: 'Polizei und Feuerwehr auf der Durchfahrt (aus ihrer Richtung)', art: 'einmal', gruppe: 'fahrzeuge', kategorien: ['sirene', 'fahrzeuge'] },
  { id: 'hilferufe', name: 'Hilferufe', beschreibung: 'Ein Mensch wird von Zombies angegriffen und ruft um Hilfe (nicht zu oft, aus seiner Richtung)', art: 'einmal', gruppe: 'zombies', kategorien: ['zombies', 'spieler'] },
  { id: 'krankenwagen', name: 'Krankenwagen (fern)', beschreibung: 'Gelegentliche ferne Sirene als Stimmung, selten', art: 'einmal', gruppe: 'fahrzeuge', kategorien: ['sirene', 'fahrzeuge'] },
  { id: 'truheLeer', name: 'Behälter leer', beschreibung: 'Wenn du einen Behälter oder ein Möbelstück durchsuchst und nichts findest', art: 'einmal', gruppe: 'spieler', kategorien: ['spieler', 'umgebung'] },
  { id: 'krach', name: 'Autounfall (Krach)', beschreibung: 'Wenn ein Auto in ein anderes Fahrzeug oder eine Hauswand kracht', art: 'einmal', gruppe: 'fahrzeuge', kategorien: ['fahrzeuge', 'umgebung'] },
  { id: 'blech', name: 'Blech schabt', beschreibung: 'Wenn ein festgefahrenes Fahrzeug ein anderes zur Seite schiebt', art: 'einmal', gruppe: 'fahrzeuge', kategorien: ['fahrzeuge'] },
  { id: 'aufprall', name: 'Aufprall (Zombie überfahren)', beschreibung: 'Wenn ein fahrendes Fahrzeug einen Zombie umfährt (dumpfer Schlag)', art: 'einmal', gruppe: 'fahrzeuge', kategorien: ['fahrzeuge', 'zombies'], lautVorgabe: 70 },
  { id: 'feuer', name: 'Feuer bricht aus', beschreibung: 'Wenn ein Haus, Auto oder Bus zu brennen beginnt', art: 'einmal', gruppe: 'umgebung', kategorien: ['umgebung'] },
  { id: 'schussPistole', name: 'Schuss: Pistole', beschreibung: 'Ohne Zuordnung erzeugt das Spiel einen Knall', art: 'einmal', gruppe: 'waffen', kategorien: ['waffen'] },
  { id: 'schussGewehr', name: 'Schuss: Jagdgewehr', beschreibung: 'Ohne Zuordnung erzeugt das Spiel einen Knall', art: 'einmal', gruppe: 'waffen', kategorien: ['waffen'] },
  { id: 'schussSchrot', name: 'Schuss: Schrotflinte', beschreibung: 'Ohne Zuordnung erzeugt das Spiel einen Knall', art: 'einmal', gruppe: 'waffen', kategorien: ['waffen'] },
  { id: 'kanone', name: 'Panzerkanone', beschreibung: 'Hauptwaffe von Leopard und Puma; ohne Zuordnung dient die Schrotflinten-Datei bzw. ein tiefer Knall; Regler bis 200 %', art: 'einmal', gruppe: 'bundeswehr', kategorien: ['bundeswehr', 'waffen'], lautVorgabe: 100, lautMax: 200 },
  { id: 'explosion', name: 'Explosion', beschreibung: 'Granate, Unfall, Fahrzeug; ohne Zuordnung dient die Schrotflinten-Datei bzw. ein tiefer Knall; Regler bis 200 %', art: 'einmal', gruppe: 'waffen', kategorien: ['waffen', 'umgebung'], lautVorgabe: 100, lautMax: 200 },
  { id: 'tuerAuf', name: 'Tür geht auf', beschreibung: 'Zimmertüren in Häusern', art: 'einmal', gruppe: 'tueren', kategorien: ['tueren'] },
  { id: 'tuerZu', name: 'Tür fällt zu', beschreibung: 'Zimmertüren in Häusern', art: 'einmal', gruppe: 'tueren', kategorien: ['tueren'] },
  { id: 'autoMotor', name: 'Auto: Motor (selbst gefahren)', beschreibung: 'Motorgeräusch eines Autos, das ein Spieler mit dem Autoschlüssel fährt (Schleife, die Tonhöhe folgt dem Tempo); ohne Datei bleibt es still', art: 'schleife', gruppe: 'fahrzeuge', kategorien: ['fahrzeuge'] },
  { id: 'autoVorbei', name: 'Auto fährt vorbei', beschreibung: 'Wenn ein fahrendes Auto oder der Bus dicht vorbeifährt', art: 'einmal', gruppe: 'fahrzeuge', kategorien: ['fahrzeuge'] },
  ...[1, 2, 3, 4, 5].map(n => ({ id: 'durchsageLevel' + n, name: `Radio-Durchsage ${nrNamen(n)}`, beschreibung: `Nachrichtensprecher im Live-Radio (allgemeine Zombie-Eilmeldung) auf ${nrNamen(n, ' und ')}; unterbricht den Sender, kommt aus dem Autoradio – gehört zur Karte`, art: 'einmal', gruppe: 'musik', kategorien: ['musik'], lautVorgabe: 100 })),
  { id: 'autoradio', name: 'Autoradio', beschreibung: 'Läuft in jedem dritten fahrenden Auto, lauter beim Vorbeifahren', art: 'schleife', gruppe: 'musik', kategorien: ['musik'] },
  { id: 'startmusik', name: 'Startmusik', beschreibung: 'Auf der Startseite (nach dem ersten Antippen), blendet beim Spielbeginn aus', art: 'schleife', gruppe: 'musik', kategorien: ['musik'] },
  { id: 'funkAnsage', name: 'Funk-Ansage Abholung', beschreibung: 'Sprachansage nach dem Funkspruch: „Alles klar, sichern Sie die notwendigen Gegenstände und halten Sie sich bereit, wir holen Sie da raus.“ (ohne Uhrzeit; ohne Datei bleibt es still)', art: 'einmal', gruppe: 'bundeswehr', kategorien: ['bundeswehr'] },
  { id: 'soldatRuf', name: 'Soldat ruft', beschreibung: 'Soldaten im Bundeswehr-Lager rufen „Halt, sofort stehen bleiben!“, wenn sich jemand nähert oder Zombies den Zaun erreichen (aus Richtung des Soldaten)', art: 'einmal', gruppe: 'bundeswehr', kategorien: ['bundeswehr', 'soldat'] },
  { id: 'funk', name: 'Funkgerät', beschreibung: 'Kurzer Klick bei wichtigen Meldungen', art: 'einmal', gruppe: 'spieler', kategorien: ['spieler', 'bundeswehr'] },
  { id: 'wasser', name: 'Wasser', beschreibung: 'Rauschen in der Nähe von Bach und Fluss', art: 'schleife', gruppe: 'umgebung', kategorien: ['umgebung'] },
  { id: 'durstMann', name: 'Durst (Männerstimme)', beschreibung: 'Bei großem Durst alle 22–30 s; Stimme je Gerät fest', art: 'einmal', gruppe: 'spieler', kategorien: ['spieler'] },
  { id: 'durstFrau', name: 'Durst (Frauenstimme)', beschreibung: 'Bei großem Durst alle 22–30 s; Stimme je Gerät fest', art: 'einmal', gruppe: 'spieler', kategorien: ['spieler'] },
  { id: 'panzerFaehrt', name: 'Panzer fährt', beschreibung: 'Kettenrasseln aller Panzer (Puma, Leopard), solange sie fahren', art: 'schleife', gruppe: 'bundeswehr', kategorien: ['bundeswehr', 'fahrzeuge'] },
  { id: 'chatKlingel', name: 'Chat-Nachricht', beschreibung: 'Klingelton, wenn eine neue Chat-Nachricht eintrifft (dazu kurze Vibration)', art: 'einmal', gruppe: 'spieler', kategorien: ['spieler'] },
  { id: 'radio', name: 'Radio (Gegenstand)', beschreibung: 'Ein eingeschaltetes Radio spielt ca. 75 s und lockt Zombies an; ohne Zuordnung nimmt das Spiel das Autoradio, sonst erzeugte Musik', art: 'schleife', gruppe: 'musik', kategorien: ['musik', 'bundeswehr'] },
  { id: 'nachladen', name: 'Nachladen', beschreibung: 'Wenn eine Waffe nachgeladen wird (ohne Datei ein kurzer Klick)', art: 'einmal', gruppe: 'waffen', kategorien: ['waffen'] },
  { id: 'hundBellen', name: 'Hund bellt', beschreibung: 'Der Begleiter-Hund bellt, wenn ein Zombie vor der Haustür steht, und kurz bei Ablenkung (macht keinen Lärm, lockt keine Zombies an; zählt nicht zu den Zombiegeräuschen)', art: 'einmal', gruppe: 'tiere', kategorien: ['tiere'] },
  { id: 'huelse', name: 'Hülse fällt', beschreibung: 'In Räumen kurz nach einem Schuss', art: 'einmal', gruppe: 'waffen', kategorien: ['waffen'] },
  ...MUSIK_EREIGNISSE,
];

// Gruppen der Ton-Übersicht (Reihenfolge = Anzeige) und Kategorien der Tondateien
export const TON_GRUPPEN = [
  { id: 'musik', name: 'Musik', symbol: '🎵' },
  { id: 'spielmusik', name: 'Musik im Spiel (Level, Lager, Horde …)', symbol: '🎼' },
  { id: 'zombies', name: 'Zombies', symbol: '🧟' },
  { id: 'waffen', name: 'Waffen', symbol: '🔫' },
  { id: 'fahrzeuge', name: 'Fahrzeuge & Sirenen', symbol: '🚗' },
  { id: 'bundeswehr', name: 'Bundeswehr', symbol: '🎖' },
  { id: 'tueren', name: 'Türen', symbol: '🚪' },
  { id: 'umgebung', name: 'Umgebung', symbol: '🌲' },
  { id: 'spieler', name: 'Spieler', symbol: '🧍' },
  { id: 'tiere', name: 'Tiere', symbol: '🐕' },
];
// Stichwörter im Dateinamen → Kategorie (Wortanfang, ab 5 Buchstaben auch mitten im Wort); eine Datei kann mehrere haben
const TON_STICHWORTE = {
  musik: ['music', 'musik', 'chill', 'hip', 'hop', 'song', 'beat', 'jazz', 'rock', 'piano', 'melod', 'theme', 'soundtrack', 'lied'],
  zombies: ['zombie', 'scream', 'growl', 'groan', 'moan', 'stoehn', 'stöhn', 'schrei', 'kriech', 'undead', 'monster', 'biss', 'bite', 'untot', 'crawl'],
  waffen: ['gun', 'shot', 'pistol', 'pistole', 'schuss', 'shell', 'rifle', 'gewehr', 'schrot', 'bullet', 'reload', 'huelse', 'hülse', 'knall', 'bang', 'revolver', 'ammo'],
  fahrzeuge: ['car', 'tank', 'auto', 'motor', 'engine', 'bus', 'truck', 'lkw', 'reifen', 'traffic', 'verkehr', 'vehicle'],
  sirene: ['alarm', 'siren', 'sirene', 'blaulicht', 'martinshorn'],
  bundeswehr: ['puma', 'panzer', 'bundeswehr', 'soldat', 'army', 'militar', 'militär', 'funk', 'radio'],
  tueren: ['door', 'tuer', 'tür', 'creak', 'knarr'],
  umgebung: ['wasser', 'bach', 'water', 'river', 'rain', 'regen', 'wind', 'bird', 'vogel', 'city', 'stadt', 'ambient', 'crow', 'cricket', 'fire', 'feuer', 'burn', 'brand', 'wald', 'forest', 'night', 'nacht'],
  tiere: ['dog', 'hund', 'bark', 'woof', 'wuff'],
  spieler: ['durst', 'thirst', 'cough', 'husten', 'breath', 'atem', 'heartbeat', 'herz', 'hurt', 'pain', 'schmerz'],
};
export function tonKategorien(dateiname) {
  const woerter = String(dateiname).toLowerCase().replace(/\.[a-z0-9]+$/, '').split(/[^a-zäöüß0-9]+/).filter(Boolean);
  const treffer = Object.entries(TON_STICHWORTE).filter(([, ws]) =>
    ws.some(w => woerter.some(t => w.length >= 5 ? t.includes(w) : t.startsWith(w)))).map(([k]) => k);
  return treffer.length ? treffer : ['sonstiges'];
}

// zahl(wert, von, bis, vorgabe, opt): „von–bis“ ist nur die empfohlene Spanne, siehe client/zahl.mjs (fest() = echte Grenzen)

// Alte Einstellungen (vor der Level-Tabelle) übernehmen: globale Zombiedichte/-häuser/Hordengröße skalieren die Level-Vorgaben,
// Min/Max-Paare (Trupp, Zielwechsel) werden zu ihrem Mittelwert, welle = 0 (keine Wellen) schaltet die Horden aus.
// Die alten Felder fallen danach weg; gibt es schon eine Tabelle (zombies.level), gilt sie.
const ALT_FELDER = ['dichte', 'haeuser', 'welle', 'welleMin', 'welleMax', 'hordeZielMin', 'hordeZielMax', 'hordeTruppMin', 'hordeTruppMax'];
export function migriereZombies(e = {}) {
  const z = e?.zombies;
  if (!z || typeof z !== 'object' || !ALT_FELDER.some(k => k in z)) return e;
  const n = { ...z }, num = (v, d) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Number(v) : d);
  if (!Array.isArray(n.level)) {
    const fd = num(z.dichte, 10) / 10, fh = num(z.haeuser, 10) / 10;
    const mittel = (num(z.welleMin, 20) + num(z.welleMax, 50)) / 2 / 35;   // alte Vorgabe 20–50, Mittel 35
    const aus = num(z.welle, 20) === 0;
    n.level = LEVEL_VORGABE.map(v => ({
      grund: v.grund * fd, jeSpieler: v.jeSpieler * fd, horde: v.horde * mittel, haeuser: v.haeuser * fh,
      ...(aus ? { gleichzeitig: 0 } : {}),
    }));
  }
  if (('hordeZielMin' in z || 'hordeZielMax' in z) && n.hordeZiel === undefined) n.hordeZiel = (num(z.hordeZielMin, 2) + num(z.hordeZielMax, 5)) / 2;
  if (('hordeTruppMin' in z || 'hordeTruppMax' in z) && n.hordeTrupp === undefined) n.hordeTrupp = (num(z.hordeTruppMin, 5) + num(z.hordeTruppMax, 15)) / 2;
  for (const k of ALT_FELDER) delete n[k];
  return { ...e, zombies: n };
}

// Hordengeräusch: Schwellen (Anzahl hörbarer Zombies) und Hörweite in Metern, jeweils in Grenzen
export function bereinigeHordeTon(h = {}) {
  const V = HORDE_TON_VORGABE;
  return {
    ab: Math.round(zahl(h.ab, 1, 100, V.ab)),
    nurHorde: Math.round(zahl(h.nurHorde, 1, 200, V.nurHorde)),
    voll: Math.round(zahl(h.voll, 2, 300, V.voll)),
    aus: Math.round(zahl(h.aus, 0, 50, V.aus)),
    hoerweite: Math.round(zahl(h.hoerweite, 10, 100, V.hoerweite)),
  };
}
export function bereinigeRadioStream(r = {}) {
  const url = String(r.url ?? '').trim();
  return {
    an: r.an === true,
    url: /^https:\/\/[^\s"'<>]{4,300}$/.test(url) ? url : RADIO_STREAM_VORGABE.url,
    name: String(r.name ?? RADIO_STREAM_VORGABE.name).trim().slice(0, 40) || RADIO_STREAM_VORGABE.name,
    laut: Math.round(fest(r.laut, 0, 100, RADIO_STREAM_VORGABE.laut)),
    vorlauf: Math.round(zahl(r.vorlauf, 0, 120, RADIO_STREAM_VORGABE.vorlauf)),
    durchsage: Math.round(zahl(r.durchsage, 0, 30, RADIO_STREAM_VORGABE.durchsage)),
  };
}
export function bereinigeMusik(m = {}) {
  return { laut: Math.round(fest(m.laut, 0, 100, MUSIK_VORGABE.laut)), blende: Math.round(zahl(m.blende, 1, 10, MUSIK_VORGABE.blende) * 2) / 2 };
}

// Alte Tabelle „Zombies je Level“ (5 Zeilen, als Geretsried 1 und 2 noch ein Level mit Zufallswahl waren): Geretsried 2 steht jetzt als eigenes
// Level direkt hinter Geretsried (migriereFolge in client/levelkatalog.mjs) – dort kommt eine Kopie der Geretsried-Zeile dazu, die Zeilen dahinter
// rücken eine Position nach, damit Isarauen usw. ihre Werte behalten. Ist Geretsried abgeschaltet, ändern sich die Positionen nicht: Kopie der letzten Zeile hinten.
// folge = Level-Reihenfolge, zu der die Tabelle gehört (alte Liste ohne geretsried2 oder schon umgestellte); fehlt sie, gilt die Vorgabe.
export function migriereLevelTabelle(tab, folge) {
  if (!Array.isArray(tab) || tab.length !== LEVEL_VORGABE.length - 1) return tab;
  const aktive = aktiveFolge(Array.isArray(folge) ? folge : folgeVorgabe()), p = aktive.indexOf('geretsried');
  const i = p >= 0 && aktive[p + 1] === 'geretsried2' ? p : tab.length - 1;
  return [...tab.slice(0, i + 1), { ...tab[i] }, ...tab.slice(i + 1)];
}
// Eingabe vor dem Bereinigen auf die Level-Aufteilung Geretsried 1 + 2 umstellen (alte Datei, alter Export, alte Vorlage)
// (alte Tabelle mit 5 Zeilen oder alte Reihenfolge ohne geretsried2): Tabelle verschieben, Biss von Geretsried für Geretsried 2 übernehmen
export function migriereGeretsried(e = {}, alt = {}) {
  const tab = e?.zombies?.level, f = e?.levelFolge, id = x => (typeof x === 'string' ? x : x?.karte);
  const alteTabelle = Array.isArray(tab) && tab.length === LEVEL_VORGABE.length - 1;
  const alteFolge = Array.isArray(f) && f.some(x => id(x) === 'geretsried') && !f.some(x => id(x) === 'geretsried2');
  if (!alteTabelle && !alteFolge) return e;
  const n = { ...e };
  if (alteTabelle) n.zombies = { ...e.zombies, level: migriereLevelTabelle(tab, f ?? alt?.levelFolge) };
  const b = e.bissSpielerLevel;
  if (b && typeof b === 'object' && b.geretsried !== undefined && b.geretsried2 === undefined) n.bissSpielerLevel = { ...b, geretsried2: b.geretsried };
  return n;
}

// Tabelle „Zombies je Level“: fehlende oder ungültige Werte kommen aus der bisherigen Tabelle bzw. der Vorgabe
function bereinigeLevel(neu, alt) {
  return LEVEL_VORGABE.map((v, i) => Object.fromEntries(Object.entries(v).map(([k, vorgabe]) => {
    const [lo, hi] = LEVEL_GRENZEN[k];
    const roh = neu?.[i]?.[k] ?? alt?.[i]?.[k];
    const n = zahl(roh, lo, hi, vorgabe, { max: LEVEL_SICHER[k] });
    return [k, k === 'pause' ? Math.round(n * 2) / 2 : Math.round(n)];
  })));
}

// Autos mit Autoschlüssel (server/pkw.mjs, Vorgaben PKW_VORGABE in client/pkw.mjs): Werte frei, die Grenzen sind nur Empfehlung (außer Prozentchancen)
export function bereinigeAuto(au = {}) {
  const V = PKW_VORGABE;
  return {
    tempo: Math.round(zahl(au.tempo, 10, 160, V.tempo, { max: 300 })),                  // Höchsttempo in km/h
    lenkung: Math.round(zahl(au.lenkung, 20, 120, V.lenkung, { min: 5, max: 360 })),   // Lenkung in Grad je Sekunde
    lenkWeich: Math.round(zahl(au.lenkWeich, 0.1, 2, V.lenkWeich, { min: 0.05, max: 5 }) * 10) / 10,   // s: weich lenken (Abweichung / lenkWeich = Drehrate)
    lenkTempo: Math.round(zahl(au.lenkTempo, 10, 100, V.lenkTempo, { min: 5, max: 100 })),   // % der Lenkung bei Höchsttempo
    lenkTotzone: Math.round(zahl(au.lenkTotzone, 0, 15, V.lenkTotzone, { min: 0, max: 30 })),   // Grad Totzone um die Fahrtrichtung (alle Fahrzeuge)
    spurhilfe: typeof au.spurhilfe === 'boolean' ? au.spurhilfe : V.spurhilfe,   // Spurhilfe auf Straßen (alle Fahrzeuge)
    leben: Math.round(zahl(au.leben, 10, 1000, V.leben, { min: 1 })),       // Lebenspunkte des Autos
    plaetze: Math.round(zahl(au.plaetze, 1, 9, V.plaetze, { min: 1, max: 20 })),     // Sitzplätze (Fahrer + Mitfahrer, auch Bots)
    crashAb: Math.round(zahl(au.crashAb, 0, 79, V.crashAb)),                // km/h: ab hier kostet ein Aufprall Lebensenergie
    crashSchaden: Math.round(fest(au.crashSchaden, 0, 100, V.crashSchaden)),   // % Lebensenergie für alle Insassen bei 80 km/h (linear ab crashAb)
    crashAuto: Math.round(zahl(au.crashAuto, 0, 1000, V.crashAuto)),         // Lebenspunkte des Autos bei einem Aufprall mit 80 km/h
    zombieTotKmh: Math.round(zahl(au.zombieTotKmh, 1, 160, V.zombieTotKmh)),   // km/h: ab hier stirbt ein überfahrener Zombie sofort
    zombieSchaden: Math.round(zahl(au.zombieSchaden, 0, 100, V.zombieSchaden) * 10) / 10,   // Lebenspunkte des Autos je überfahrenem Zombie
    zaunBremse: Math.round(fest(au.zaunBremse, 0, 90, V.zaunBremse)),        // % Tempo weg je durchbrochenem Zaun-/Heckenstück (Auto walzt sie platt)
    zaunSchaden: Math.round(zahl(au.zaunSchaden, 0, 100, V.zaunSchaden) * 10) / 10,   // Lebenspunkte des Autos je Zaun-/Heckenstück bei 80 km/h (linear mit dem Tempo)
    laerm: Math.round(zahl(au.laerm, 5, 100, V.laerm, { min: 0, max: 1000 })),             // m: Grund-Hörweite des Motors beim Fahren (dazu Tempo in px; Panzer/Boxer ebenso)
    sireneWeite: Math.round(zahl(au.sireneWeite, 20, 400, V.sireneWeite, { min: 0, max: 2000 })),   // m: so weit lockt die Sirene eines Streifenwagens Zombies an
    schluesselMoebel: Math.round(fest(au.schluesselMoebel, 0, 100, V.schluesselMoebel) * 10) / 10,         // % Autoschlüssel je gefülltem Schrank/Spind/Aktenschrank/Werkbank (nur Möbel mit Inhalt, siehe beute.moebel)
    schluesselKofferraum: Math.round(fest(au.schluesselKofferraum, 0, 100, V.schluesselKofferraum) * 10) / 10,   // % je Kofferraum
    schluesselLeiche: Math.round(fest(au.schluesselLeiche, 0, 100, V.schluesselLeiche) * 10) / 10,         // % je toter Zombie
  };
}

// aus beliebiger Eingabe gültige Einstellungen machen (unbekannte Felder fallen weg)
export function bereinige(e = {}, alt = {}) {
  e = migriereGeretsried(migriereZombies(e ?? {}), alt);
  const a = { ...vorgaben(), ...alt };
  const z = { ...a.zombies, ...(e.zombies ?? {}) };
  const t = { ...a.test, ...(e.test ?? {}) };
  const sp = { ...a.sprache, ...(e.sprache ?? {}) };
  const ag = { ...a.aufgaben, ...(e.aufgaben ?? {}) };
  const bw = { ...a.bundeswehr, ...(e.bundeswehr ?? {}) };
  const fk = { ...a.faehigkeiten, ...(e.faehigkeiten ?? {}) };
  const tu = { ...a.tueren, ...(e.tueren ?? {}) };
  const typen = Object.fromEntries(ZOMBIE_TYPEN.map(k => [k, typeof z.typen?.[k] === 'boolean' ? z.typen[k] : (typeof a.zombies?.typen?.[k] === 'boolean' ? a.zombies.typen[k] : true)]));
  if (!Object.values(typen).some(Boolean)) typen[ZOMBIE_TYPEN[0]] = true;
  const figuren = zfFigurenEinst(Object.fromEntries(Object.keys(zfFigurenEinst()).map(id => [id, { ...a.zombies?.figuren?.[id], ...(e.zombies?.figuren?.[id] ?? {}) }])));   // Teiländerungen je Figur
  const heldenFiguren = hfFigurenEinst(Object.fromEntries(Object.keys(hfFigurenEinst()).map(id => [id, { ...a.helden?.figuren?.[id], ...(e.helden?.figuren?.[id] ?? {}) }])));   // Helden-Figuren (client/heldenfiguren.mjs): Teiländerungen je Figur, mindestens eine bleibt an
  const funde = { ...a.funde };
  for (const [k, v] of Object.entries(e.funde ?? {})) if (DINGE[k]) funde[k] = Math.round(zahl(v, 0, 50, 10, { max: 1000 }));
  const toene = {};
  for (const ev of EREIGNISSE) {
    const lv = ev.lautVorgabe ?? 80, alt = a.toene?.[ev.id] ?? { dateien: [], laut: lv }, neu = e.toene?.[ev.id] ?? {};
    const dateien = Array.isArray(neu.dateien) ? neu.dateien : alt.dateien;
    toene[ev.id] = {
      dateien: [...new Set((dateien ?? []).map(String).filter(d => TON_DATEI.test(d)))].slice(0, 12),
      laut: Math.round(fest(neu.laut ?? alt.laut, 0, ev.lautMax ?? 100, lv)),
    };
  }
  // Superuser-Testzugang: nur der scrypt-Hash wird gespeichert; ein Klartext-Passwort (superuserPasswort) wird sofort gehasht,
  // superuserLoeschen schaltet den Superuser ab. Leer = Superuser unmöglich.
  const suHash = e.superuserLoeschen === true ? ''
    : typeof e.superuserPasswort === 'string' && e.superuserPasswort.length >= 8 ? hashe(e.superuserPasswort)
    : hashGueltig(e.superuserHash) ? e.superuserHash : hashGueltig(a.superuserHash) ? a.superuserHash : '';
  return {
    superuserHash: suHash,
    zugangscode: String(e.zugangscode ?? a.zugangscode ?? '').trim().slice(0, 40),
    wikiAdresse: bereinigeUrl(e.wikiAdresse ?? a.wikiAdresse ?? ''),
    impressum: String(e.impressum ?? a.impressum ?? '').slice(0, 20000),
    datenschutz: String(e.datenschutz ?? a.datenschutz ?? '').slice(0, 20000),
    karte: KARTEN.includes(e.karte) ? e.karte : e.karte === 'level1' || !KARTEN.includes(a.karte) ? aktiveFolge(bereinigeFolge(e.levelFolge, a.levelFolge))[0] : a.karte,   // alte Wahl 'level1' (Zufall Geretsried 1/2) = erstes aktives Level
    levelFolge: bereinigeFolge(e.levelFolge, a.levelFolge),   // Reihenfolge und Schalter der Level [{ karte, aktiv }]; Schwierigkeit/Tabellen hängen an der Position, Karten-Besonderheiten an der Karte
    bots: Math.round(zahl(e.bots ?? a.bots, 0, 9, 2, { max: 30 })),
    frischerStart: typeof e.frischerStart === 'boolean' ? e.frischerStart : !!a.frischerStart,
    autos: Math.round(zahl(e.autos ?? a.autos, 0, 50, 10, { max: 250 })),            // geparkte Autos, 10 = normal (gilt für neue Welten)
    tagMinuten: Math.round(zahl(e.tagMinuten ?? a.tagMinuten, 10, 240, 48)),   // so viele echte Minuten dauert ein Spieltag
    tagAb: Math.round(fest(e.tagAb ?? a.tagAb, 240, 660, 420) / 15) * 15,      // ab dieser Uhrzeit (Minuten) ganz hell, 2 h Dämmerung davor
    nachtAb: Math.round(fest(e.nachtAb ?? a.nachtAb, 1080, 1439, 1290) / 15) * 15,   // ab dieser Uhrzeit ganz dunkel
    nachtDunkel: Math.round(fest(e.nachtDunkel ?? a.nachtDunkel, 30, 100, 92)),       // Nachtdunkelheit in % (100 = fast schwarz)
    menschenGroesse: Math.round(zahl(e.menschenGroesse ?? a.menschenGroesse, 50, 200, 100)),   // Darstellungsgröße ALLER Menschen in % (100 = alle gleich breit, Schulterbreite)
    zombieGroesse: Math.round(zahl(e.zombieGroesse ?? a.zombieGroesse, 50, 200, 100)),   // Zombiegröße im Verhältnis zu den Menschen in % (100 = gleich breit; Leichen folgen automatisch)
    groesseGesamt: Math.round(zahl(e.groesseGesamt ?? a.groesseGesamt, 50, 150, 70)),   // Gesamtgröße in % (Menschen, Zombies, Leichen, Füße), multipliziert mit den Einzelwerten
    baumTempo: Math.round(zahl(e.baumTempo ?? a.baumTempo, 5, 100, 25)),   // Tempo unter Bäumen in % des normalen Tempos (Menschen, Zombies, Spieler, Bots; 25 = 75 % langsamer)
    zombieLeben: Math.round(zahl(e.zombieLeben ?? a.zombieLeben, 20, 500, 100)),         // Lebenspunkte eines Zombies (100 = normal)
    menschen: Math.round(zahl(e.menschen ?? a.menschen, 0, 200, 50, { max: 2000 })),         // Bewohner zu Beginn einer Welt
    verwandlung: Math.round(zahl(e.verwandlung ?? a.verwandlung, 1, 240, 30)),   // Menschen: Spielminuten vom Biss bis zur Verwandlung in einen Zombie
    bissSpieler: Math.round(fest(e.bissSpieler ?? a.bissSpieler, 0, 100, 12)),   // Spieler: Ansteckungschance in % je Sekunde Biss (alter globaler Wert, Vorgabe für die Level)
    // Spieler: Ansteckungschance je Level (Karte); fehlt ein Wert, gilt der alte globale Wert (Geretsried 2 erbt den Wert von Geretsried 1)
    bissSpielerLevel: Object.fromEntries(LEVEL_WELTEN.map(k => [k, Math.round(fest(e.bissSpielerLevel?.[k] ?? alt.bissSpielerLevel?.[k] ?? (k === 'geretsried2' ? e.bissSpielerLevel?.geretsried ?? alt.bissSpielerLevel?.geretsried : undefined) ?? (BISS_LEVEL_VORGABE[k] > 12 ? BISS_LEVEL_VORGABE[k] : (e.bissSpieler ?? alt.bissSpieler)), 0, 100, BISS_LEVEL_VORGABE[k] ?? 12))])),
    biss: Math.round(fest(e.biss ?? a.biss, 0, 100, 100)),                   // Stadtbewohner: Chance in % je Bissversuch (einmal pro Sekunde bei Berührung)
    feuer: zahl(e.feuer ?? a.feuer, 0, 30, 1),                                 // Minuten zwischen zwei Bränden (0 = keine)
    feuerPhase: Math.round(zahl(e.feuerPhase ?? a.feuerPhase, 0, 240, 20)),  // so lange (Spielminuten ab Weltbeginn) brennt es immer wieder
    verkehr: Math.round(zahl(e.verkehr ?? a.verkehr, 0, 200, 30, { max: 1000 })),            // Obergrenze fahrender Autos am Anfang (Anzahl = Straßenlänge / verkehrDichte, server/verkehr.mjs verkehrAnzahl)
    verkehrDichte: Math.round(zahl(e.verkehrDichte ?? a.verkehrDichte, 300, 3000, 2000, { min: 10 })),   // Meter befahrbare Straße je fahrendem Auto (empfohlen 300–3000); Anzahl = Netzlänge / Dichte, höchstens `verkehr`
    verkehrPhase: Math.round(zahl(e.verkehrPhase ?? a.verkehrPhase, 0, 240, 25)),
    unfall: Math.round(zahl(e.unfall ?? a.unfall, 0, 600, 10)),                // Verkehrsunfall durchschnittlich alle … Spielminuten (0 = keine Unfälle, siehe server/unfall.mjs)
    unfallExplosion: Math.round(fest(e.unfallExplosion ?? a.unfallExplosion, 0, 100, 50)),   // % der Unfallautos, die nach dem Brennen explodieren
    fahrzeugStoss: Math.round(zahl(e.fahrzeugStoss ?? a.fahrzeugStoss, 0, 100, 15)),         // größter Schaden (Lebenspunkte) beim Stoß eines fahrenden Fahrzeugs gegen einen Helden (nie tödlich, Tempo-abhängig, 0 = kein Schaden)
    geraeuschPause: zahl(e.geraeuschPause ?? a.geraeuschPause, 0, 30, 5, { max: 600 }),   // Mindestpause (s) zwischen zwei Zombie-Hintergrundgeräuschen (Stöhnen/Grunzen), empfohlen 0–30
    unfallSchaden: Math.round(zahl(e.unfallSchaden ?? a.unfallSchaden, 0, 100, 30)),         // Lebenspunkte Schaden für Spieler in der Explosion (in der Mitte, am Rand halb)
    unfallTuer: Math.round(fest(e.unfallTuer ?? a.unfallTuer, 0, 100, 60)),   // % der Verkehrsunfälle mit Unfallszene: Tür geht auf, ein Mensch flieht, ein Zombie verfolgt ihn (server/unfallszene.mjs)
    auto: bereinigeAuto({ ...a.auto, ...(e.auto ?? {}) }),   // Autos mit Autoschlüssel fahren (server/pkw.mjs)
    blaulicht: ['aus', 'selten', 'normal'].includes(e.blaulicht) ? e.blaulicht : (['aus', 'selten', 'normal'].includes(a.blaulicht) ? a.blaulicht : 'selten'),   // Polizei/Feuerwehr-Durchfahrten
    schwierigkeit: SCHWIERIGKEITEN.includes(e.schwierigkeit) ? e.schwierigkeit : SCHWIERIGKEITEN.includes(a.schwierigkeit) ? a.schwierigkeit : 'normal',   // Regler leicht/normal/schwer (×0,75/1/1,3, siehe schwierigkeit.mjs)
    zombieFigurenNeu: typeof e.zombieFigurenNeu === 'boolean' ? e.zombieFigurenNeu : a.zombieFigurenNeu !== false,   // neue Zombie-Figuren (Mixamo, client/zombiefiguren.mjs); aus = alte Bilder; Vorgabe an
    heldenFigurenNeu: typeof e.heldenFigurenNeu === 'boolean' ? e.heldenFigurenNeu : a.heldenFigurenNeu !== false,   // neue Helden-Figuren (Mixamo, client/heldenfiguren.mjs); aus = alte Heldenbilder; Vorgabe an
    sichtkegel: typeof e.sichtkegel === 'boolean' ? e.sichtkegel : !!a.sichtkegel,   // Sichtkegel der Zombies anzeigen
    diagnose: typeof e.diagnose === 'boolean' ? e.diagnose : a.diagnose !== false,   // Fehler/Leistung der Geräte im Server-Log (server/diagnose.mjs), Vorgabe an; nicht in Vorlagen
    tempoHeldGehen: Math.round(zahl(e.tempoHeldGehen ?? a.tempoHeldGehen, 2, 60, 20) * 10) / 10,   // Held geht (km/h; 8 px = 1 m)
    tempoHeldSchleichen: Math.round(zahl(e.tempoHeldSchleichen ?? a.tempoHeldSchleichen, 1, 40, 9) * 10) / 10,   // Held schleicht (km/h)
    tempoZombieJagen: Math.round(zahl(e.tempoZombieJagen ?? a.tempoZombieJagen, 1, 60, 15) * 10) / 10,   // Zombie jagt (km/h; wirkt auch auf Hordenmarsch, Verwandelte ×1,15)
    tempoZombieWandern: Math.round(zahl(e.tempoZombieWandern ?? a.tempoZombieWandern, 1, 30, 4) * 10) / 10,   // Zombie wandert (km/h)
    tempoSchlurferJagen: Math.round(zahl(e.tempoSchlurferJagen ?? a.tempoSchlurferJagen, 4, 10, 7) * 10) / 10,   // Schlurfer jagt (km/h; empfohlen 4–10, höchstens „Zombie jagt“)
    schussDunkel: Math.round(zahl(e.schussDunkel ?? a.schussDunkel, 0, 80, 30)),   // automatische Schussreichweite bei Nacht/Nebel: so viel % weniger (außer das Ziel ist beleuchtet: Taschenlampe, Scheinwerfer, Feuer)
    innenTempo: Math.round(zahl(e.innenTempo ?? a.innenTempo, 10, 100, 50)),   // Tempo in maßstäblichen Innenräumen in % vom Tempo draußen (Figuren sind drinnen halb so groß, die Kamera 3,4-fach näher)
    innenMassstab: typeof e.innenMassstab === 'boolean' ? e.innenMassstab : !!a.innenMassstab,   // Innenräume maßstäblich (0,25-m-Raster, echter Grundriss, siehe client/innen_fein.mjs); Standard an (aus = altes grobes Raster)
    reichweite: Object.fromEntries(Object.entries(REICHWEITE_VORGABE).map(([w, v]) => [w, Math.round(zahl(e.reichweite?.[w] ?? a.reichweite?.[w], 5, w === 'granatwerfer' ? 100 : 80, v))])),   // automatische Schussreichweite in Metern
    waffen: Object.fromEntries(Object.entries(WAFFEN_VORGABE).map(([w, v]) => [w, {
      schaden: Math.round(zahl(e.waffen?.[w]?.schaden ?? a.waffen?.[w]?.schaden, 1, 500, v.schaden)),
      pause: Math.round(zahl(e.waffen?.[w]?.pause ?? a.waffen?.[w]?.pause, 0.05, 5, v.pause) * 100) / 100,
      ...(v.magazin ? {
        magazin: Math.round(zahl(e.waffen?.[w]?.magazin ?? a.waffen?.[w]?.magazin, 1, 150, v.magazin, { max: 10000 })),   // Schuss je Magazin
        nachlade: Math.round(zahl(e.waffen?.[w]?.nachlade ?? a.waffen?.[w]?.nachlade, 0.5, 10, v.nachlade) * 10) / 10,   // Sekunden zum Nachladen
      } : {}),
    }])),
    toeneVorbelegt: Array.isArray(e.toeneVorbelegt) ? e.toeneVorbelegt.filter(x => typeof x === 'string').slice(0, 50) : (a.toeneVorbelegt ?? []),
    zombies: {
      level: bereinigeLevel(e.zombies?.level, a.zombies?.level),   // je Level: draußen, Horden, Häuser (siehe LEVEL_VORGABE)
      tempo: Math.round(zahl(z.tempo, 50, 150, 100)),    // Laufgeschwindigkeit in Prozent
      nacht: Math.round(zahl(z.nacht, 10, 30, 15)),      // nachts so viel mehr draußen (15 = ×1,5)
      hordeZiel: Math.round(zahl(z.hordeZiel, 0.5, 30, 3.5) * 2) / 2,   // Horde wechselt ihr Ziel etwa alle … echte Minuten (±40 % Streuung im Code)
      hordeZieleZeigen: typeof z.hordeZieleZeigen === 'boolean' ? z.hordeZieleZeigen : false,   // Prüfwerkzeug: Ziel der Horde für Superuser anzeigen
      hordeTrupp: Math.round(zahl(z.hordeTrupp, 1, 300, 10, { max: 2000 })),   // Angriffstrupp je Ziel: Größe in Zombies (±30 % Streuung im Code, wächst mit der Horde)
      hordeReichweite: Math.round(zahl(z.hordeReichweite, 5, 60, 18)), // so nah (Meter) an Spielern/Bots/Soldaten/Menschen löst sich ein Trupp
      lagerWelle: Math.round(zahl(z.lagerWelle, 0, 400, 200, { max: 5000 })),   // Zombies der Welle, wenn alle Menschen im Bundeswehr-Lager sind (0 = aus)
      lagerWellePause: Math.round(zahl(z.lagerWellePause, 1, 120, 10)),   // höchstens alle … Minuten eine Lager-Welle
      anteilKriecher: Math.round(fest(z.anteilKriecher, 0, 100, 5)),     // Bewegungsklassen (Anteile in %, werden auf 100 normiert): Kriecher robben (sehr langsam),
      anteilSchlurfer: Math.round(fest(z.anteilSchlurfer, 0, 100, 45)),   // Schlurfer gehen (langsam, auch beim Jagen),
      anteilLaeufer: Math.round(fest(z.anteilLaeufer, 0, 100, 50)),       // Läufer rennen beim Jagen bis „Zombie jagt“ (Höchsttempo); client/zombiefiguren.mjs zkKlasse
      drahtVoll: Math.round(fest(z.drahtVoll, 1, 50, 4)),      // S-Draht: ab so vielen hängenden Zombies an einer Rolle ist sie „voll“, weitere bleiben nicht mehr hängen, sondern steigen drüber
      drahtUeber: Math.round(fest(z.drahtUeber, 10, 100, 70)), // Tempo (% des eigenen) beim Übersteigen eines vollen S-Drahts
      ueberraschung: Math.round(fest(z.ueberraschung, 0, 100, 3)),   // % Chance, dass beim ersten Durchsuchen von Schrank/Spind/Müllcontainer/Auto ein Zombie herausspringt
      figuren: figuren,                                  // neue Zombie-Figuren (client/zombiefiguren.mjs): { id: { an, anteil % } }, nur mit zombieFigurenNeu
      typen: typen,                                      // welche Zombietypen (Aussehen) vorkommen dürfen; mindestens einer bleibt an
    },
    helden: { figuren: heldenFiguren },   // wählbare Helden der Startwahl (nur mit heldenFigurenNeu; Bots bekommen zufällige aktive Helden)
    zombieSicht: bereinigeSicht(e.zombieSicht, a.zombieSicht),   // Zombie-Sicht: Meter/Grad/% (client/zombiesicht.mjs)
    nebel: bereinigeNebel(e.nebel, a.nebel),   // Nebel als Wetterlage (server/nebel.mjs)
    sprache: {
      an: typeof sp.an === 'boolean' ? sp.an : true,                          // Sprachübertragung zwischen Mitspielern
      hoerweite: Math.round(zahl(sp.hoerweite, 10, 100, 40)),                 // Meter, ab hier ist man draußen nicht mehr zu hören
      stockwerk: Math.round(fest(sp.stockwerk, 0, 100, 35)),                  // % Lautstärke in einem anderen Stockwerk desselben Hauses
      drinnenDraussen: Math.round(fest(sp.drinnenDraussen, 0, 50, 10)),       // % Lautstärke zwischen drinnen und draußen (an der Tür)
      funk: Math.round(fest(sp.funk, 0, 100, 70)),                            // % Lautstärke über Funkgeräte
      redenLockt: typeof sp.redenLockt === 'boolean' ? sp.redenLockt : false, // Reden lockt Zombies an
    },
    aufgaben: {
      an: typeof ag.an === 'boolean' ? ag.an : true,                          // gemeinsame Aufgaben und Evakuierungsbus
      stunde: Math.round(fest(ag.stunde, 6, 23, 18)),                         // Uhrzeit (Spieluhr), zu der der Bus am Ortsausgang ankommt
      wartezeit: Math.round(zahl(ag.wartezeit, 10, 180, 60)),                 // Spielminuten: Ankunftsfenster, in dem der Bus noch erscheint
      wartenEchtMin: Math.round(zahl(ag.wartenEchtMin, 1, 60, 10)),           // echte Minuten, die der Bus ab dem Halt höchstens wartet
      anzahl: Math.round(zahl(ag.anzahl, 3, 6, 4, { min: 1, max: 50 })),                           // Aufgaben je Level
      finaleMinuten: Math.round(zahl(ag.finaleMinuten, 10, 90, 30)),          // Andermatt: echte Minuten bis zum Atomschlag (server/finale.mjs)
      evakArt: EVAK_ARTEN.includes(ag.evakArt) ? ag.evakArt : '',             // Test: Evakuierungsart für die aktuelle Karte erzwingen ('' = aus, je Karte: Bus / Leopard / A400M)
    },
    tueren: (() => {                                                          // Anteile verschlossener Zimmertüren in %: frei / nur Rätsel / nur Schlüssel
      const r = { frei: Math.round(fest(tu.frei, 0, 100, 50)), raetsel: Math.round(fest(tu.raetsel, 0, 100, 25)), schluessel: Math.round(fest(tu.schluessel, 0, 100, 25)) };
      if (r.frei + r.raetsel + r.schluessel <= 0) r.frei = 100;
      return r;
    })(),
    faehigkeiten: {
      an: typeof fk.an === 'boolean' ? fk.an : true,                          // Erfahrung, Level und Fähigkeiten
      xpFaktor: Math.round(zahl(fk.xpFaktor, 10, 500, 100)),                  // Erfahrungspunkte in Prozent (100 = normal)
    },
    bundeswehr: {
      aktiv: typeof bw.aktiv === 'boolean' ? bw.aktiv : true,                 // Stützpunkt schießt, handelt und kann fallen
      pumaPause: Math.round(zahl(bw.pumaPause, 0.1, 10, 2.5) * 10) / 10,     // Panzer (Puma): Sekunden zwischen zwei Schüssen
      mgMunition: Math.round(zahl(bw.mgMunition, 0, 5000, 400)),             // Munition je MG-Nest (0 = unbegrenzt); leer: Soldaten holen Nachschub
      pumaMunition: Math.round(zahl(bw.pumaMunition, 0, 2000, 200)),         // Munition des Puma (0 = unbegrenzt)
      falltage: Math.round(zahl(bw.falltage, 0, 30, 3)),                      // fällt nach so vielen Spieltagen seit Weltbeginn (0 = nie)
      versorgungTage: Math.round(zahl(bw.versorgungTage, 1, 30, 2)),          // Versorgung über die Munitionskisten: alle so viele Spieltage (je Echtspieler, solange das Lager steht)
      versorgungMunition: Math.round(zahl(bw.versorgungMunition, 0, 500, 50)), // … Schuss Munition
      versorgungVerband: Math.round(zahl(bw.versorgungVerband, 0, 10, 3)),     // … Verbandszeug
      versorgungSpritze: Math.round(zahl(bw.versorgungSpritze, 0, 5, 1)),      // … Spritzen
      versorgungWaffe: typeof bw.versorgungWaffe === 'boolean' ? bw.versorgungWaffe : true,   // … eine zufällige Schusswaffe (Pistole, Jagdgewehr, Schrotflinte)
      kistenMunChance: Math.round(fest(bw.kistenMunChance, 0, 100, 50)),        // Munitionskisten: Zufallsbeute je Kiste/Spieler/Spieltag – Chance auf Munition (%)
      kistenMunMin: Math.round(zahl(bw.kistenMunMin, 0, 50, 5)),                // … mindestens so viele Schuss (empfohlen 0–50)
      kistenMunMax: Math.round(zahl(bw.kistenMunMax, 0, 100, 15)),              // … höchstens so viele Schuss (empfohlen 0–100)
      kistenVerbandChance: Math.round(fest(bw.kistenVerbandChance, 0, 100, 15)), // … Chance auf ein Verbandszeug (%)
      kistenGranateChance: Math.round(fest(bw.kistenGranateChance, 0, 100, 5)),  // … Chance auf eine Handgranate (%)
      leopardReichweite: Math.round(zahl(bw.leopardReichweite, 5, 80, 29)),   // Evakuierungspanzer Leopard 2A7: Reichweite des MG in Metern
      leopardPause: Math.round(zahl(bw.leopardPause, 0.1, 5, 0.4) * 10) / 10, // … Sekunden zwischen zwei Schüssen
      leopardSchaden: Math.round(zahl(bw.leopardSchaden, 1, 500, 100)),       // … Schaden je Treffer
      leopardUeberrollen: typeof bw.leopardUeberrollen === 'boolean' ? bw.leopardUeberrollen : true,   // … überrollt Zombies beim Fahren
      leopardKanone: typeof bw.leopardKanone === 'boolean' ? bw.leopardKanone : true,                    // … Hauptkanone auf Zombiehaufen (an/aus)
      leopardKanonePause: Math.round(zahl(bw.leopardKanonePause, 3, 120, 8)),                           // … Sekunden zwischen zwei Kanonenschüssen
      leopardKanoneMin: Math.round(zahl(bw.leopardKanoneMin, 3, 50, 10)),                               // … so viele Zombies müssen auf einem Fleck (6 m Durchmesser) stehen
      boxerHordeSek: Math.round(zahl(bw.boxerHordeSek, 10, 3600, 120)),                                  // Radpanzer Boxer (Königsdorf): alle … Sekunden eine Horde, solange jemand drinsitzt
      boxerHordeMin: Math.round(zahl(bw.boxerHordeMin, 1, 500, 20, { max: 2000 })),                                     // … mindestens so viele Zombies je Horde
      boxerHordeMax: Math.max(Math.round(zahl(bw.boxerHordeMin, 1, 500, 20, { max: 2000 })), Math.round(zahl(bw.boxerHordeMax, 1, 500, 50, { max: 2000 }))),   // … höchstens so viele (nie weniger als das Minimum)
      boxerSchussPause: Math.round(zahl(bw.boxerSchussPause, 0.05, 5, 0.25) * 100) / 100,               // … Sekunden zwischen zwei Schüssen des Turms (Dauerfeuer)
      boxerReichweite: Math.round(zahl(bw.boxerReichweite, 5, 120, 40)),                                 // … Reichweite des Turms in Metern
      boxerTempo: Math.round(zahl(bw.boxerTempo, 10, 120, 60)),                                          // … Höchsttempo beim Fahren in km/h
      pumaTempo: Math.round(zahl(bw.pumaTempo, 10, 120, 60)),                                            // fahrbarer Puma (Superuser/Schießstand): Höchsttempo in km/h
      leopardTempo: Math.round(zahl(bw.leopardTempo, 10, 120, 60)),                                      // fahrbarer Leopard (Superuser/Schießstand): Höchsttempo in km/h
      panzerLenkWeich: Math.round(zahl(bw.panzerLenkWeich, 0.1, 2, 0.6, { min: 0.05, max: 5 }) * 10) / 10,   // Boxer/Puma/Leopard: weich lenken (s, Abweichung / Wert = Drehrate)
      panzerLenkTempo: Math.round(zahl(bw.panzerLenkTempo, 10, 100, 50, { min: 5, max: 100 })),          // … % der Lenkrate bei Höchsttempo
    },
    polizei: {
      aktiv: typeof e.polizei?.aktiv === 'boolean' ? e.polizei.aktiv : (typeof a.polizei?.aktiv === 'boolean' ? a.polizei.aktiv : true),   // Polizisten und Streifenwagen an den Straßensperren
      anzahl: Math.round(zahl(e.polizei?.anzahl ?? a.polizei?.anzahl, 1, 6, 3, { max: 50 })),                // Polizisten je Sperre
      munition: Math.round(zahl(e.polizei?.munition ?? a.polizei?.munition, 0, 200, 30)),       // Schuss je Polizist (0 = unbegrenzt)
    },
    hund: {
      ablenkung: Math.round(fest(e.hund?.ablenkung ?? a.hund?.ablenkung, 0, 100, HUND.ablenkung)),
      streuner: Math.round(zahl(e.hund?.streuner ?? a.hund?.streuner, -1, 20, HUND.streuner, { max: 200 })),   // Streuner-Hunde je Karte: Vorgabe 2; -1 = automatisch (höchstens 2), 0 = keine, 1–20 fest
    },   // Begleiter-Hund: Wahrscheinlichkeit in %, dass ein Zombie in 25 m ihn statt des Spielers jagt
    funde,
    beute: { moebel: Math.round(fest(e.beute?.moebel ?? a.beute?.moebel, 0, 100, MOEBEL_ANTEIL)) },   // Prozent: echte Grenze 0–100   // % der Möbel/Behälter, die überhaupt etwas enthalten
    toene,
    toeneNamen: bereinigeToeneNamen(e.toeneNamen, a.toeneNamen),
    toeneHorde: bereinigeHordeTon({ ...a.toeneHorde, ...(e.toeneHorde ?? {}) }),
    musik: bereinigeMusik({ ...a.musik, ...(e.musik ?? {}) }),
    radioStream: bereinigeRadioStream({ ...a.radioStream, ...(e.radioStream ?? {}) }),
    test: {
      zeitraffer: ZEITRAFFER.includes(Number(t.zeitraffer)) ? Number(t.zeitraffer) : 1,
      unsterblich: [...new Set((Array.isArray(t.unsterblich) ? t.unsterblich : []).map(n => String(n).trim().slice(0, 16)).filter(Boolean))].slice(0, 20),
    },
  };
}

// Unter node --test (NODE_TEST_CONTEXT gesetzt) bleiben die Grundwerte, damit Tests nicht von der Vorlage abhängen.
export function vorgaben() { return process.env.NODE_TEST_CONTEXT ? grundwerte() : mitVorlage(); }
export function mitVorlage() { return mischen(grundwerte(), VORLAGE); }

export function grundwerte() {
  return {
    superuserHash: '', zugangscode: '', wikiAdresse: '', impressum: '', datenschutz: '', karte: 'geretsried', levelFolge: folgeVorgabe(), bots: 2, frischerStart: false, autos: 10, tagMinuten: 48, tagAb: 420, nachtAb: 1290, nachtDunkel: 92, menschenGroesse: 100, zombieGroesse: 100, groesseGesamt: 70, baumTempo: 25, zombieLeben: 100, menschen: 50, verwandlung: 30, bissSpieler: 12, bissSpielerLevel: { ...BISS_LEVEL_VORGABE }, biss: 100, feuer: 1, feuerPhase: 20, verkehr: 30, verkehrDichte: 2000, verkehrPhase: 25, unfall: 10, unfallExplosion: 50, unfallSchaden: 30, fahrzeugStoss: 15, geraeuschPause: 5, blaulicht: 'selten', schwierigkeit: 'normal', sichtkegel: false, diagnose: true, zombieFigurenNeu: true, heldenFigurenNeu: true, innenMassstab: true, innenTempo: 50, schussDunkel: 30, tempoHeldGehen: 20, tempoHeldSchleichen: 9, tempoZombieJagen: 15, tempoZombieWandern: 4, tempoSchlurferJagen: 7, toeneVorbelegt: [], reichweite: { ...REICHWEITE_VORGABE }, unfallTuer: 60, auto: { ...PKW_VORGABE }, waffen: JSON.parse(JSON.stringify(WAFFEN_VORGABE)),
    helden: { figuren: hfFigurenEinst() }, zombies: { level: LEVEL_VORGABE.map(v => ({ ...v })), tempo: 100, nacht: 15, hordeZiel: 3.5, hordeZieleZeigen: false, hordeTrupp: 10, hordeReichweite: 18, lagerWelle: 200, lagerWellePause: 10, ueberraschung: 3, anteilKriecher: 5, anteilSchlurfer: 45, anteilLaeufer: 50, drahtVoll: 4, drahtUeber: 70, figuren: zfFigurenEinst(), typen: Object.fromEntries(ZOMBIE_TYPEN.map(k => [k, true])) },
    funde: Object.fromEntries(Object.keys(DINGE).map(k => [k, 10])),
    aufgaben: { an: true, stunde: 18, wartezeit: 60, wartenEchtMin: 10, anzahl: 4, evakArt: '', finaleMinuten: 30 },
    faehigkeiten: { an: true, xpFaktor: 100 },
    tueren: { frei: 50, raetsel: 25, schluessel: 25 },
    bundeswehr: { aktiv: true, falltage: 3, versorgungTage: 2, versorgungMunition: 50, versorgungVerband: 3, versorgungSpritze: 1, versorgungWaffe: true, kistenMunChance: 50, kistenMunMin: 5, kistenMunMax: 15, kistenVerbandChance: 15, kistenGranateChance: 5, pumaPause: 2.5, leopardReichweite: 29, leopardPause: 0.4, leopardSchaden: 100, leopardUeberrollen: true, leopardKanone: true, leopardKanonePause: 8, leopardKanoneMin: 10, boxerHordeSek: 120, boxerHordeMin: 20, boxerHordeMax: 50, boxerSchussPause: 0.25, boxerReichweite: 40, boxerTempo: 60, pumaTempo: 60, leopardTempo: 60, panzerLenkWeich: 0.6, panzerLenkTempo: 50, mgMunition: 400, pumaMunition: 200 },
    polizei: { aktiv: true, anzahl: 3, munition: 30 },
    nebel: { ...NEBEL_VORGABE },
    zombieSicht: { ...SICHT_VORGABE },
    sprache: { an: true, hoerweite: 40, stockwerk: 35, drinnenDraussen: 10, funk: 70, redenLockt: false },
    test: { zeitraffer: 1, unsterblich: [] },
    hund: { ...HUND },
    beute: { moebel: MOEBEL_ANTEIL },
    toene: {},
    toeneNamen: {},
    toeneHorde: { ...HORDE_TON_VORGABE },
    musik: { ...MUSIK_VORGABE },
    radioStream: { ...RADIO_STREAM_VORGABE },
  };
}

// Adresse (http/https) oder leer; alles andere wird verworfen
export function bereinigeUrl(w) {
  const t = String(w ?? '').trim().slice(0, 200);
  return /^https?:\/\/[^\s"'<>]+$/i.test(t) ? t : '';
}

// Startwerte aus den Add-on-Optionen (options.json)
export function ausOptionen(o = {}) {
  const dichte = o.zombies !== undefined && o.zombies !== null ? Number(o.zombies) : (Number(o.zombie_faktor) || 1) * 10;
  return bereinige({
    zugangscode: o.zugangscode, karte: o.karte, bots: o.bots ?? 0,
    zombies: { dichte }, funde: o.funde ?? {},
  });
}

export class EinstellungsDatei {
  constructor(datei, optionen = {}) {
    this.datei = datei;
    let gespeichert = null;
    try { if (datei) gespeichert = JSON.parse(fs.readFileSync(datei, 'utf8')); } catch { /* erster Start */ }
    this.werte = gespeichert ? bereinige(gespeichert) : ausOptionen(optionen);
    // Testschalter gelten nie über einen Neustart hinaus
    this.werte.test = { zeitraffer: 1, unsterblich: this.werte.test.unsterblich };
    if (gespeichert?.superuserPasswort) this.aendern({});   // Klartext aus der Datei: sofort als Hash zurückschreiben
  }

  aendern(neu) {
    if (neu && typeof neu === 'object' && 'superuserHash' in neu) { neu = { ...neu }; delete neu.superuserHash; }   // einen Hash gibt es nur aus der Datei, nie über die Oberfläche
    this.werte = bereinige(neu, this.werte);
    if (this.datei) {
      try {
        fs.mkdirSync(path.dirname(this.datei), { recursive: true });
        fs.writeFileSync(this.datei + '.neu', JSON.stringify(this.werte, null, 2));
        fs.renameSync(this.datei + '.neu', this.datei);
      } catch (e) { console.error('Einstellungen nicht gespeichert:', e.message); }
    }
    return this.werte;
  }
}

// Einstellungen für Browser/Verwaltung: nie Hash oder Passwort, nur „gesetzt“
export function oeffentlich(werte) {
  const { superuserHash, superuserPasswort, ...rest } = werte;
  return { ...rest, superuserGesetzt: hashGueltig(superuserHash) };
}

// Für Vorlagen und Export: ohne Zugangscode, Superuser-Hash/-Passwort und ohne die Testschalter und den Diagnose-Schalter
export function ohneGeheimnisse(werte) {
  const { superuserHash, superuserPasswort, zugangscode, test, superuserGesetzt, diagnose, ...rest } = werte ?? {};
  return JSON.parse(JSON.stringify(rest));
}

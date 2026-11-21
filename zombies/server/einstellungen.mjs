// Einstellungen des Spiels: werden auf der Verwaltungsseite (HA-Seitenleiste) geändert und gelten sofort.
// Gespeichert in /data/einstellungen.json; beim allerersten Start dienen die Add-on-Optionen als Startwerte.
import fs from 'node:fs';
import path from 'node:path';
import { DINGE, WAFFEN } from '../client/welt.mjs';
import { MOERSER } from './moerser.mjs';
import { hashe, hashGueltig } from './superuser.mjs';
import { LEVEL_VORGABE, LEVEL_GRENZEN } from './schwierigkeit.mjs';

// 'level1' = Zufallswahl für Level 1: bei jedem Start/Levelwechsel auf Level 1 wird Geretsried oder Geretsried 2 gewürfelt (server/aufgaben.mjs, level1Karte)
export const KARTEN = ['level1', 'geretsried', 'geretsried2', 'isarauen', 'koenigsdorf', 'kochel', 'andermatt', 'dorf'];
export const LEVEL_WELTEN = ['geretsried', 'isarauen', 'koenigsdorf', 'kochel', 'andermatt'];
export const BISS_LEVEL_VORGABE = { geretsried: 12, isarauen: 12, koenigsdorf: 14, kochel: 16, andermatt: 18 };   // Ansteckung der Spieler in % je Sekunde Biss, steigend   // Karten der Level (wie LEVEL_KARTEN in aufgaben.mjs)
export const EVAK_ARTEN = ['bus', 'panzer', 'flugzeug', 'absturz', 'heli', 'bunker'];   // Evakuierungsarten (server/aufgaben.mjs); '' in den Einstellungen = je Karte
export const SCHWIERIGKEITEN = ['leicht', 'normal', 'schwer'];
export const ZEITRAFFER = [1, 5, 10, 60];
export const REICHWEITE_VORGABE = { pistole: 29, gewehr: 52, schrotflinte: 20, mp: 30, mg: 45, armbrust: 25, scharfschuetze: 75, granatwerfer: 60, handgranate: 25 };   // Meter
// Zombietypen (Reihenfolge = Nummer der Variante, siehe ZOMBIE_TYPEN im Client)
export const ZOMBIE_TYPEN = ['tarn', 'dirndl', 'feuerwehr', 'hemd', 'lederhose', 'z6', 'z7',
  'kaminkehrer', 'bauarbeiter', 'koch', 'holzfaeller', 'mechaniker', 'brandmeister', 'kehrer', 'strassenarbeiter', 'baecker', 'flanell', 'werkstatt', 'vogelscheuche', 'postbote', 'streife', 'wachtmeister', 'landstreicher', 'mantel', 'langhaar'];   // ab 'kaminkehrer': Gemini-Bogen figuren3
// je Waffe einstellbar: Schaden und Abklingzeit (Sekunden zwischen zwei Schlägen/Schüssen); Vorgabe = Werte aus WAFFEN
export const WAFFEN_VORGABE = Object.fromEntries(Object.entries(WAFFEN).map(([w, v]) => [w, { schaden: v.schaden, pause: v.pause, ...(v.fern ? { magazin: v.magazin ?? 1, nachlade: v.nachlade ?? 4 } : {}) }]));
export const TON_DATEI = /^[\w][\w.()+\- ]{0,118}\.(mp3|ogg|wav|m4a)$/i;

// Spielereignisse, denen auf der Einstellungsseite Tondateien zugeordnet werden
export const EREIGNISSE = [
  { id: 'zombieTod', name: 'Zombie stirbt', beschreibung: 'Wenn ein Zombie erledigt wird', art: 'einmal', gruppe: 'zombies', kategorien: ['zombies'] },
  { id: 'kriecher', name: 'Kriecher', beschreibung: 'Stöhnen kriechender Zombies in der Nähe', art: 'einmal', gruppe: 'zombies', kategorien: ['zombies'] },
  { id: 'stoehnen', name: 'Zombie stöhnt', beschreibung: 'Stöhnen gehender Zombies in der Nähe', art: 'einmal', gruppe: 'zombies', kategorien: ['zombies'] },
  { id: 'entdeckt', name: 'Zombie entdeckt dich', beschreibung: 'Schrei, wenn ein Zombie zu jagen beginnt', art: 'einmal', gruppe: 'zombies', kategorien: ['zombies'] },
  { id: 'stadt', name: 'Stadtgeräusche', beschreibung: 'Hintergrund draußen (Verkehr in der Ferne)', art: 'schleife', gruppe: 'umgebung', kategorien: ['umgebung', 'fahrzeuge'] },
  { id: 'zombielandTag', name: 'Zombieland (Tag)', beschreibung: 'Ferne Zombies tagsüber – kurze Töne kommen ab und zu aus wechselnder Richtung', art: 'schleife', gruppe: 'zombies', kategorien: ['zombies', 'umgebung'] },
  { id: 'zombielandNacht', name: 'Zombieland (Nacht)', beschreibung: 'Ferne Zombies und Schreie in der Nacht', art: 'schleife', gruppe: 'zombies', kategorien: ['zombies', 'umgebung'] },
  { id: 'nachteinbruch', name: 'Nachteinbruch', beschreibung: 'Einmal, wenn es dunkel wird', art: 'einmal', gruppe: 'umgebung', kategorien: ['umgebung', 'sirene', 'zombies'] },
  { id: 'menschGebissen', name: 'Mensch wird gebissen', beschreibung: 'Schrei, wenn ein Bewohner gebissen wird', art: 'einmal', gruppe: 'zombies', kategorien: ['zombies', 'spieler'] },
  { id: 'sirene', name: 'Sirene', beschreibung: 'Polizei und Feuerwehr auf der Durchfahrt (aus ihrer Richtung)', art: 'einmal', gruppe: 'fahrzeuge', kategorien: ['sirene', 'fahrzeuge'] },
  { id: 'hilferufe', name: 'Hilferufe', beschreibung: 'Ein Mensch wird von Zombies angegriffen und ruft um Hilfe (nicht zu oft, aus seiner Richtung)', art: 'einmal', gruppe: 'zombies', kategorien: ['zombies', 'spieler'] },
  { id: 'krankenwagen', name: 'Krankenwagen (fern)', beschreibung: 'Gelegentliche ferne Sirene als Stimmung, selten', art: 'einmal', gruppe: 'fahrzeuge', kategorien: ['sirene', 'fahrzeuge'] },
  { id: 'truheLeer', name: 'Behälter leer', beschreibung: 'Wenn du einen Behälter oder ein Möbelstück durchsuchst und nichts findest', art: 'einmal', gruppe: 'spieler', kategorien: ['spieler', 'umgebung'] },
  { id: 'feuer', name: 'Feuer bricht aus', beschreibung: 'Wenn ein Haus, Auto oder Bus zu brennen beginnt', art: 'einmal', gruppe: 'umgebung', kategorien: ['umgebung'] },
  { id: 'schussPistole', name: 'Schuss: Pistole', beschreibung: 'Ohne Zuordnung erzeugt das Spiel einen Knall', art: 'einmal', gruppe: 'waffen', kategorien: ['waffen'] },
  { id: 'schussGewehr', name: 'Schuss: Jagdgewehr', beschreibung: 'Ohne Zuordnung erzeugt das Spiel einen Knall', art: 'einmal', gruppe: 'waffen', kategorien: ['waffen'] },
  { id: 'schussSchrot', name: 'Schuss: Schrotflinte', beschreibung: 'Ohne Zuordnung erzeugt das Spiel einen Knall', art: 'einmal', gruppe: 'waffen', kategorien: ['waffen'] },
  { id: 'tuerAuf', name: 'Tür geht auf', beschreibung: 'Zimmertüren in Häusern', art: 'einmal', gruppe: 'tueren', kategorien: ['tueren'] },
  { id: 'tuerZu', name: 'Tür fällt zu', beschreibung: 'Zimmertüren in Häusern', art: 'einmal', gruppe: 'tueren', kategorien: ['tueren'] },
  { id: 'autoVorbei', name: 'Auto fährt vorbei', beschreibung: 'Wenn ein fahrendes Auto oder der Bus dicht vorbeifährt', art: 'einmal', gruppe: 'fahrzeuge', kategorien: ['fahrzeuge'] },
  { id: 'autoradio', name: 'Autoradio', beschreibung: 'Läuft in jedem dritten fahrenden Auto, lauter beim Vorbeifahren', art: 'schleife', gruppe: 'musik', kategorien: ['musik'] },
  { id: 'startmusik', name: 'Startmusik', beschreibung: 'Auf der Startseite (nach dem ersten Antippen), blendet beim Spielbeginn aus', art: 'schleife', gruppe: 'musik', kategorien: ['musik'] },
  { id: 'soldatRuf', name: 'Soldat ruft', beschreibung: 'Soldaten im Bundeswehr-Lager rufen „Halt, sofort stehen bleiben!“, wenn sich jemand nähert oder Zombies den Zaun erreichen (aus Richtung des Soldaten)', art: 'einmal', gruppe: 'bundeswehr', kategorien: ['bundeswehr', 'soldat'] },
  { id: 'funk', name: 'Funkgerät', beschreibung: 'Kurzer Klick bei wichtigen Meldungen', art: 'einmal', gruppe: 'spieler', kategorien: ['spieler', 'bundeswehr'] },
  { id: 'wasser', name: 'Wasser', beschreibung: 'Rauschen in der Nähe von Bach und Fluss', art: 'schleife', gruppe: 'umgebung', kategorien: ['umgebung'] },
  { id: 'durstMann', name: 'Durst (Männerstimme)', beschreibung: 'Bei großem Durst alle 22–30 s; Stimme je Gerät fest', art: 'einmal', gruppe: 'spieler', kategorien: ['spieler'] },
  { id: 'durstFrau', name: 'Durst (Frauenstimme)', beschreibung: 'Bei großem Durst alle 22–30 s; Stimme je Gerät fest', art: 'einmal', gruppe: 'spieler', kategorien: ['spieler'] },
  { id: 'panzerFaehrt', name: 'Panzer fährt', beschreibung: 'Kettenrasseln des Puma, solange er fährt', art: 'schleife', gruppe: 'bundeswehr', kategorien: ['bundeswehr', 'fahrzeuge'] },
  { id: 'chatKlingel', name: 'Chat-Nachricht', beschreibung: 'Klingelton, wenn eine neue Chat-Nachricht eintrifft (dazu kurze Vibration)', art: 'einmal', gruppe: 'spieler', kategorien: ['spieler'] },
  { id: 'radio', name: 'Radio (Gegenstand)', beschreibung: 'Ein eingeschaltetes Radio spielt ca. 75 s und lockt Zombies an; ohne Zuordnung nimmt das Spiel das Autoradio, sonst erzeugte Musik', art: 'schleife', gruppe: 'musik', kategorien: ['musik', 'bundeswehr'] },
  { id: 'nachladen', name: 'Nachladen', beschreibung: 'Wenn eine Waffe nachgeladen wird (ohne Datei ein kurzer Klick)', art: 'einmal', gruppe: 'waffen', kategorien: ['waffen'] },
  { id: 'huelse', name: 'Hülse fällt', beschreibung: 'In Räumen kurz nach einem Schuss', art: 'einmal', gruppe: 'waffen', kategorien: ['waffen'] },
];

// Gruppen der Ton-Übersicht (Reihenfolge = Anzeige) und Kategorien der Tondateien
export const TON_GRUPPEN = [
  { id: 'musik', name: 'Musik', symbol: '🎵' },
  { id: 'zombies', name: 'Zombies', symbol: '🧟' },
  { id: 'waffen', name: 'Waffen', symbol: '🔫' },
  { id: 'fahrzeuge', name: 'Fahrzeuge & Sirenen', symbol: '🚗' },
  { id: 'bundeswehr', name: 'Bundeswehr', symbol: '🎖' },
  { id: 'tueren', name: 'Türen', symbol: '🚪' },
  { id: 'umgebung', name: 'Umgebung', symbol: '🌲' },
  { id: 'spieler', name: 'Spieler', symbol: '🧍' },
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
  spieler: ['durst', 'thirst', 'cough', 'husten', 'breath', 'atem', 'heartbeat', 'herz', 'hurt', 'pain', 'schmerz'],
};
export function tonKategorien(dateiname) {
  const woerter = String(dateiname).toLowerCase().replace(/\.[a-z0-9]+$/, '').split(/[^a-zäöüß0-9]+/).filter(Boolean);
  const treffer = Object.entries(TON_STICHWORTE).filter(([, ws]) =>
    ws.some(w => woerter.some(t => w.length >= 5 ? t.includes(w) : t.startsWith(w)))).map(([k]) => k);
  return treffer.length ? treffer : ['sonstiges'];
}

const zahl = (v, min, max, vorgabe) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : vorgabe;
};

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

// Tabelle „Zombies je Level“: fehlende oder ungültige Werte kommen aus der bisherigen Tabelle bzw. der Vorgabe
function bereinigeLevel(neu, alt) {
  return LEVEL_VORGABE.map((v, i) => Object.fromEntries(Object.entries(v).map(([k, vorgabe]) => {
    const [lo, hi] = LEVEL_GRENZEN[k];
    const roh = neu?.[i]?.[k] ?? alt?.[i]?.[k];
    const n = zahl(roh, lo, hi, vorgabe);
    return [k, k === 'pause' ? Math.round(n * 2) / 2 : Math.round(n)];
  })));
}

// aus beliebiger Eingabe gültige Einstellungen machen (unbekannte Felder fallen weg)
export function bereinige(e = {}, alt = {}) {
  e = migriereZombies(e ?? {});
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
  const funde = { ...a.funde };
  for (const [k, v] of Object.entries(e.funde ?? {})) if (DINGE[k]) funde[k] = Math.round(zahl(v, 0, 50, 10));
  const toene = {};
  for (const ev of EREIGNISSE) {
    const alt = a.toene?.[ev.id] ?? { dateien: [], laut: 80 }, neu = e.toene?.[ev.id] ?? {};
    const dateien = Array.isArray(neu.dateien) ? neu.dateien : alt.dateien;
    toene[ev.id] = {
      dateien: [...new Set((dateien ?? []).map(String).filter(d => TON_DATEI.test(d)))].slice(0, 12),
      laut: Math.round(zahl(neu.laut ?? alt.laut, 0, 100, 80)),
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
    karte: KARTEN.includes(e.karte) ? e.karte : a.karte,
    bots: Math.round(zahl(e.bots ?? a.bots, 0, 9, 2)),
    frischerStart: typeof e.frischerStart === 'boolean' ? e.frischerStart : !!a.frischerStart,
    autos: Math.round(zahl(e.autos ?? a.autos, 0, 50, 10)),            // geparkte Autos, 10 = normal (gilt für neue Welten)
    tagMinuten: Math.round(zahl(e.tagMinuten ?? a.tagMinuten, 10, 240, 48)),   // so viele echte Minuten dauert ein Spieltag
    tagAb: Math.round(zahl(e.tagAb ?? a.tagAb, 240, 660, 420) / 15) * 15,      // ab dieser Uhrzeit (Minuten) ganz hell, 2 h Dämmerung davor
    nachtAb: Math.round(zahl(e.nachtAb ?? a.nachtAb, 1080, 1439, 1290) / 15) * 15,   // ab dieser Uhrzeit ganz dunkel
    nachtDunkel: Math.round(zahl(e.nachtDunkel ?? a.nachtDunkel, 30, 100, 92)),       // Nachtdunkelheit in % (100 = fast schwarz)
    menschenGroesse: Math.round(zahl(e.menschenGroesse ?? a.menschenGroesse, 50, 200, 100)),   // Darstellungsgröße ALLER Menschen in % (100 = alle gleich breit, Schulterbreite)
    zombieGroesse: Math.round(zahl(e.zombieGroesse ?? a.zombieGroesse, 50, 200, 100)),   // Zombiegröße im Verhältnis zu den Menschen in % (100 = gleich breit; Leichen folgen automatisch)
    groesseGesamt: Math.round(zahl(e.groesseGesamt ?? a.groesseGesamt, 50, 150, 70)),   // Gesamtgröße in % (Menschen, Zombies, Leichen, Füße), multipliziert mit den Einzelwerten
    zombieLeben: Math.round(zahl(e.zombieLeben ?? a.zombieLeben, 20, 500, 100)),         // Lebenspunkte eines Zombies (100 = normal)
    menschen: Math.round(zahl(e.menschen ?? a.menschen, 0, 200, 50)),         // Bewohner zu Beginn einer Welt
    verwandlung: Math.round(zahl(e.verwandlung ?? a.verwandlung, 1, 240, 30)),   // Menschen: Spielminuten vom Biss bis zur Verwandlung in einen Zombie
    bissSpieler: Math.round(zahl(e.bissSpieler ?? a.bissSpieler, 0, 100, 12)),   // Spieler: Ansteckungschance in % je Sekunde Biss (alter globaler Wert, Vorgabe für die Level)
    // Spieler: Ansteckungschance je Level (Karte); fehlt ein Wert, gilt der alte globale Wert
    bissSpielerLevel: Object.fromEntries(LEVEL_WELTEN.map(k => [k, Math.round(zahl(e.bissSpielerLevel?.[k] ?? alt.bissSpielerLevel?.[k] ?? (BISS_LEVEL_VORGABE[k] > 12 ? BISS_LEVEL_VORGABE[k] : (e.bissSpieler ?? alt.bissSpieler)), 0, 100, BISS_LEVEL_VORGABE[k] ?? 12))])),
    biss: Math.round(zahl(e.biss ?? a.biss, 0, 100, 100)),                   // Stadtbewohner: Chance in % je Bissversuch (einmal pro Sekunde bei Berührung)
    feuer: zahl(e.feuer ?? a.feuer, 0, 30, 1),                                 // Minuten zwischen zwei Bränden (0 = keine)
    feuerPhase: Math.round(zahl(e.feuerPhase ?? a.feuerPhase, 0, 240, 20)),  // so lange (Spielminuten ab Weltbeginn) brennt es immer wieder
    verkehr: Math.round(zahl(e.verkehr ?? a.verkehr, 0, 30, 6)),             // fahrende Autos am Anfang
    verkehrPhase: Math.round(zahl(e.verkehrPhase ?? a.verkehrPhase, 0, 240, 25)),
    blaulicht: ['aus', 'selten', 'normal'].includes(e.blaulicht) ? e.blaulicht : (['aus', 'selten', 'normal'].includes(a.blaulicht) ? a.blaulicht : 'selten'),   // Polizei/Feuerwehr-Durchfahrten
    schwierigkeit: SCHWIERIGKEITEN.includes(e.schwierigkeit) ? e.schwierigkeit : SCHWIERIGKEITEN.includes(a.schwierigkeit) ? a.schwierigkeit : 'normal',   // Regler leicht/normal/schwer (×0,75/1/1,3, siehe schwierigkeit.mjs)
    sichtkegel: typeof e.sichtkegel === 'boolean' ? e.sichtkegel : !!a.sichtkegel,   // Sichtkegel der Zombies anzeigen
    reichweite: Object.fromEntries(Object.entries(REICHWEITE_VORGABE).map(([w, v]) => [w, Math.round(zahl(e.reichweite?.[w] ?? a.reichweite?.[w], 5, w === 'granatwerfer' ? 100 : 80, v))])),   // automatische Schussreichweite in Metern
    waffen: Object.fromEntries(Object.entries(WAFFEN_VORGABE).map(([w, v]) => [w, {
      schaden: Math.round(zahl(e.waffen?.[w]?.schaden ?? a.waffen?.[w]?.schaden, 1, 500, v.schaden)),
      pause: Math.round(zahl(e.waffen?.[w]?.pause ?? a.waffen?.[w]?.pause, 0.05, 5, v.pause) * 100) / 100,
      ...(v.magazin ? {
        magazin: Math.round(zahl(e.waffen?.[w]?.magazin ?? a.waffen?.[w]?.magazin, 1, 150, v.magazin)),   // Schuss je Magazin
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
      hordeTrupp: Math.round(zahl(z.hordeTrupp, 1, 300, 10)),   // Angriffstrupp je Ziel: Größe in Zombies (±30 % Streuung im Code, wächst mit der Horde)
      hordeReichweite: Math.round(zahl(z.hordeReichweite, 5, 60, 18)), // so nah (Meter) an Spielern/Bots/Soldaten/Menschen löst sich ein Trupp
      ueberraschung: Math.round(zahl(z.ueberraschung, 0, 100, 3)),   // % Chance, dass beim ersten Durchsuchen von Schrank/Spind/Müllcontainer/Auto ein Zombie herausspringt
      typen: typen,                                      // welche Zombietypen (Aussehen) vorkommen dürfen; mindestens einer bleibt an
    },
    sprache: {
      an: typeof sp.an === 'boolean' ? sp.an : true,                          // Sprachübertragung zwischen Mitspielern
      hoerweite: Math.round(zahl(sp.hoerweite, 10, 100, 40)),                 // Meter, ab hier ist man draußen nicht mehr zu hören
      stockwerk: Math.round(zahl(sp.stockwerk, 0, 100, 35)),                  // % Lautstärke in einem anderen Stockwerk desselben Hauses
      drinnenDraussen: Math.round(zahl(sp.drinnenDraussen, 0, 50, 10)),       // % Lautstärke zwischen drinnen und draußen (an der Tür)
      funk: Math.round(zahl(sp.funk, 0, 100, 70)),                            // % Lautstärke über Funkgeräte
      redenLockt: typeof sp.redenLockt === 'boolean' ? sp.redenLockt : false, // Reden lockt Zombies an
    },
    aufgaben: {
      an: typeof ag.an === 'boolean' ? ag.an : true,                          // gemeinsame Aufgaben und Evakuierungsbus
      stunde: Math.round(zahl(ag.stunde, 6, 23, 18)),                         // Uhrzeit (Spieluhr), zu der der Bus am Ortsausgang ankommt
      wartezeit: Math.round(zahl(ag.wartezeit, 10, 180, 60)),                 // Spielminuten: Ankunftsfenster, in dem der Bus noch erscheint
      wartenEchtMin: Math.round(zahl(ag.wartenEchtMin, 1, 60, 10)),           // echte Minuten, die der Bus ab dem Halt höchstens wartet
      anzahl: Math.round(zahl(ag.anzahl, 3, 6, 4)),                           // Aufgaben je Level
      finaleMinuten: Math.round(zahl(ag.finaleMinuten, 10, 90, 30)),          // Andermatt: echte Minuten bis zum Atomschlag (server/finale.mjs)
      evakArt: EVAK_ARTEN.includes(ag.evakArt) ? ag.evakArt : '',             // Test: Evakuierungsart für die aktuelle Karte erzwingen ('' = aus, je Karte: Bus / Leopard / A400M)
    },
    tueren: (() => {                                                          // Anteile verschlossener Zimmertüren in %: frei / nur Rätsel / nur Schlüssel
      const r = { frei: Math.round(zahl(tu.frei, 0, 100, 50)), raetsel: Math.round(zahl(tu.raetsel, 0, 100, 25)), schluessel: Math.round(zahl(tu.schluessel, 0, 100, 25)) };
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
      leopardReichweite: Math.round(zahl(bw.leopardReichweite, 5, 80, 29)),   // Evakuierungspanzer Leopard 2A7: Reichweite des MG in Metern
      leopardPause: Math.round(zahl(bw.leopardPause, 0.1, 5, 0.4) * 10) / 10, // … Sekunden zwischen zwei Schüssen
      leopardSchaden: Math.round(zahl(bw.leopardSchaden, 1, 500, 100)),       // … Schaden je Treffer
      leopardUeberrollen: typeof bw.leopardUeberrollen === 'boolean' ? bw.leopardUeberrollen : true,   // … überrollt Zombies beim Fahren
    },
    moerser: (() => {                                                         // Panzermörser: Reichweite/Radius/Sicherheit in Metern, Pause in Sekunden
      const m = { ...a.moerser, ...(e.moerser ?? {}) }, V = MOERSER;
      const rmin = Math.round(zahl(m.reichweiteMin, 5, 100, V.reichweiteMin)), rmax = Math.max(rmin + 5, Math.round(zahl(m.reichweiteMax, 10, 150, V.reichweiteMax)));
      return {
        reichweiteMin: rmin, reichweiteMax: rmax,
        pause: Math.round(zahl(m.pause, 1, 60, V.pause) * 10) / 10,
        schaden: Math.round(zahl(m.schaden, 10, 1000, V.schaden)),
        radius: Math.round(zahl(m.radius, 2, 15, V.radius) * 2) / 2,
        mindestZombies: Math.round(zahl(m.mindestZombies, 1, 30, V.mindestZombies)),
        sicherheit: Math.round(zahl(m.sicherheit, 0, 30, V.sicherheit)),
        tempo: Math.round(zahl(m.tempo, 10, 80, V.tempo)),
      };
    })(),
    funde,
    toene,
    test: {
      zeitraffer: ZEITRAFFER.includes(Number(t.zeitraffer)) ? Number(t.zeitraffer) : 1,
      moerser: typeof t.moerser === 'boolean' ? t.moerser : false,           // Test: Panzermörser (M113) neben den Start stellen
      unsterblich: [...new Set((Array.isArray(t.unsterblich) ? t.unsterblich : []).map(n => String(n).trim().slice(0, 16)).filter(Boolean))].slice(0, 20),
    },
  };
}

export function vorgaben() {
  return {
    superuserHash: '', zugangscode: '', karte: 'level1', bots: 2, frischerStart: false, autos: 10, tagMinuten: 48, tagAb: 420, nachtAb: 1290, nachtDunkel: 92, menschenGroesse: 100, zombieGroesse: 100, groesseGesamt: 70, zombieLeben: 100, menschen: 50, verwandlung: 30, bissSpieler: 12, bissSpielerLevel: { ...BISS_LEVEL_VORGABE }, biss: 100, feuer: 1, feuerPhase: 20, verkehr: 6, verkehrPhase: 25, blaulicht: 'selten', schwierigkeit: 'normal', sichtkegel: false, toeneVorbelegt: [], reichweite: { ...REICHWEITE_VORGABE }, waffen: JSON.parse(JSON.stringify(WAFFEN_VORGABE)),
    zombies: { level: LEVEL_VORGABE.map(v => ({ ...v })), tempo: 100, nacht: 15, hordeZiel: 3.5, hordeZieleZeigen: false, hordeTrupp: 10, hordeReichweite: 18, ueberraschung: 3, typen: Object.fromEntries(ZOMBIE_TYPEN.map(k => [k, true])) },
    funde: Object.fromEntries(Object.keys(DINGE).map(k => [k, 10])),
    aufgaben: { an: true, stunde: 18, wartezeit: 60, wartenEchtMin: 10, anzahl: 4, evakArt: '', finaleMinuten: 30 },
    faehigkeiten: { an: true, xpFaktor: 100 },
    tueren: { frei: 50, raetsel: 25, schluessel: 25 },
    bundeswehr: { aktiv: true, falltage: 3, pumaPause: 2.5, leopardReichweite: 29, leopardPause: 0.4, leopardSchaden: 100, leopardUeberrollen: true, mgMunition: 400, pumaMunition: 200 },
    sprache: { an: true, hoerweite: 40, stockwerk: 35, drinnenDraussen: 10, funk: 70, redenLockt: false },
    test: { zeitraffer: 1, unsterblich: [], moerser: false },
    moerser: { ...MOERSER },
    toene: {},
  };
}

// Startwerte aus den Add-on-Optionen (options.json)
export function ausOptionen(o = {}) {
  const dichte = o.zombies !== undefined && o.zombies !== null ? Number(o.zombies) : (Number(o.zombie_faktor) || 1) * 10;
  return bereinige({
    zugangscode: o.zugangscode, karte: o.karte ?? 'level1', bots: o.bots ?? 0,
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

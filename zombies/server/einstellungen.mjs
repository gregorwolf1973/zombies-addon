// Einstellungen des Spiels: werden auf der Verwaltungsseite (HA-Seitenleiste) geändert und gelten sofort.
// Gespeichert in /data/einstellungen.json; beim allerersten Start dienen die Add-on-Optionen als Startwerte.
import fs from 'node:fs';
import path from 'node:path';
import { DINGE, WAFFEN } from '../client/welt.mjs';

export const KARTEN = ['geretsried', 'isarauen', 'dorf'];
export const ZEITRAFFER = [1, 5, 10, 60];
export const REICHWEITE_VORGABE = { pistole: 29, gewehr: 52, schrotflinte: 20, mp: 30, mg: 45 };   // Meter
// Zombietypen (Reihenfolge = Nummer der Variante, siehe ZOMBIE_TYPEN im Client)
export const ZOMBIE_TYPEN = ['tarn', 'dirndl', 'feuerwehr', 'hemd', 'lederhose', 'z6', 'z7'];
// je Waffe einstellbar: Schaden und Abklingzeit (Sekunden zwischen zwei Schlägen/Schüssen); Vorgabe = Werte aus WAFFEN
export const WAFFEN_VORGABE = Object.fromEntries(Object.entries(WAFFEN).map(([w, v]) => [w, { schaden: v.schaden, pause: v.pause }]));
export const TON_DATEI = /^[\w][\w.()+\- ]{0,118}\.(mp3|ogg|wav|m4a)$/i;

// Spielereignisse, denen auf der Einstellungsseite Tondateien zugeordnet werden
export const EREIGNISSE = [
  { id: 'zombieTod', name: 'Zombie stirbt', beschreibung: 'Wenn ein Zombie erledigt wird', art: 'einmal' },
  { id: 'kriecher', name: 'Kriecher', beschreibung: 'Stöhnen kriechender Zombies in der Nähe', art: 'einmal' },
  { id: 'stoehnen', name: 'Zombie stöhnt', beschreibung: 'Stöhnen gehender Zombies in der Nähe', art: 'einmal' },
  { id: 'entdeckt', name: 'Zombie entdeckt dich', beschreibung: 'Schrei, wenn ein Zombie zu jagen beginnt', art: 'einmal' },
  { id: 'stadt', name: 'Stadtgeräusche', beschreibung: 'Hintergrund draußen (Verkehr in der Ferne)', art: 'schleife' },
  { id: 'zombielandTag', name: 'Zombieland (Tag)', beschreibung: 'Ferne Zombies tagsüber – kurze Töne kommen ab und zu aus wechselnder Richtung', art: 'schleife' },
  { id: 'zombielandNacht', name: 'Zombieland (Nacht)', beschreibung: 'Ferne Zombies und Schreie in der Nacht', art: 'schleife' },
  { id: 'nachteinbruch', name: 'Nachteinbruch', beschreibung: 'Einmal, wenn es dunkel wird', art: 'einmal' },
  { id: 'menschGebissen', name: 'Mensch wird gebissen', beschreibung: 'Schrei, wenn ein Bewohner gebissen wird', art: 'einmal' },
  { id: 'sirene', name: 'Sirene', beschreibung: 'Polizei und Feuerwehr auf der Durchfahrt (aus ihrer Richtung)', art: 'einmal' },
  { id: 'feuer', name: 'Feuer bricht aus', beschreibung: 'Wenn ein Haus, Auto oder Bus zu brennen beginnt', art: 'einmal' },
  { id: 'schussPistole', name: 'Schuss: Pistole', beschreibung: 'Ohne Zuordnung erzeugt das Spiel einen Knall', art: 'einmal' },
  { id: 'schussGewehr', name: 'Schuss: Jagdgewehr', beschreibung: 'Ohne Zuordnung erzeugt das Spiel einen Knall', art: 'einmal' },
  { id: 'schussSchrot', name: 'Schuss: Schrotflinte', beschreibung: 'Ohne Zuordnung erzeugt das Spiel einen Knall', art: 'einmal' },
  { id: 'tuerAuf', name: 'Tür geht auf', beschreibung: 'Zimmertüren in Häusern', art: 'einmal' },
  { id: 'tuerZu', name: 'Tür fällt zu', beschreibung: 'Zimmertüren in Häusern', art: 'einmal' },
  { id: 'autoVorbei', name: 'Auto fährt vorbei', beschreibung: 'Wenn ein fahrendes Auto oder der Bus dicht vorbeifährt', art: 'einmal' },
  { id: 'autoradio', name: 'Autoradio', beschreibung: 'Läuft in jedem dritten fahrenden Auto, lauter beim Vorbeifahren', art: 'schleife' },
  { id: 'startmusik', name: 'Startmusik', beschreibung: 'Auf der Startseite (nach dem ersten Antippen), blendet beim Spielbeginn aus', art: 'schleife' },
  { id: 'funk', name: 'Funkgerät', beschreibung: 'Kurzer Klick bei wichtigen Meldungen', art: 'einmal' },
  { id: 'wasser', name: 'Wasser', beschreibung: 'Rauschen in der Nähe von Bach und Fluss', art: 'schleife' },
];

const zahl = (v, min, max, vorgabe) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : vorgabe;
};

// aus beliebiger Eingabe gültige Einstellungen machen (unbekannte Felder fallen weg)
export function bereinige(e = {}, alt = {}) {
  const a = { ...vorgaben(), ...alt };
  const z = { ...a.zombies, ...(e.zombies ?? {}) };
  const t = { ...a.test, ...(e.test ?? {}) };
  const sp = { ...a.sprache, ...(e.sprache ?? {}) };
  const ag = { ...a.aufgaben, ...(e.aufgaben ?? {}) };
  const bw = { ...a.bundeswehr, ...(e.bundeswehr ?? {}) };
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
  // Wellen: 0 = aus, sonst mindestens alle 5 Minuten; Maximum nie kleiner als Minimum
  if (z.welle > 0 && z.welle < 5) z.welle = 5;
  z.welleMin = Math.round(zahl(z.welleMin, 5, 50, 20)); z.welleMax = Math.max(z.welleMin, Math.round(zahl(z.welleMax, 5, 50, 50)));
  return {
    zugangscode: String(e.zugangscode ?? a.zugangscode ?? '').trim().slice(0, 40),
    karte: KARTEN.includes(e.karte) ? e.karte : a.karte,
    bots: Math.round(zahl(e.bots ?? a.bots, 0, 9, 2)),
    frischerStart: typeof e.frischerStart === 'boolean' ? e.frischerStart : !!a.frischerStart,
    autos: Math.round(zahl(e.autos ?? a.autos, 0, 50, 10)),            // geparkte Autos, 10 = normal (gilt für neue Welten)
    tagMinuten: Math.round(zahl(e.tagMinuten ?? a.tagMinuten, 10, 240, 48)),   // so viele echte Minuten dauert ein Spieltag
    tagAb: Math.round(zahl(e.tagAb ?? a.tagAb, 240, 660, 420) / 15) * 15,      // ab dieser Uhrzeit (Minuten) ganz hell, 2 h Dämmerung davor
    nachtAb: Math.round(zahl(e.nachtAb ?? a.nachtAb, 1080, 1439, 1290) / 15) * 15,   // ab dieser Uhrzeit ganz dunkel
    nachtDunkel: Math.round(zahl(e.nachtDunkel ?? a.nachtDunkel, 30, 100, 92)),       // Nachtdunkelheit in % (100 = fast schwarz)
    menschen: Math.round(zahl(e.menschen ?? a.menschen, 0, 200, 50)),         // Bewohner zu Beginn einer Welt
    verwandlung: Math.round(zahl(e.verwandlung ?? a.verwandlung, 1, 240, 30)),   // Menschen: Spielminuten vom Biss bis zur Verwandlung in einen Zombie
    bissSpieler: Math.round(zahl(e.bissSpieler ?? a.bissSpieler, 0, 100, 12)),   // Spieler: Ansteckungschance in % je Sekunde Biss durch einen lebenden Zombie
    biss: Math.round(zahl(e.biss ?? a.biss, 0, 100, 100)),                   // Stadtbewohner: Chance in % je Bissversuch (einmal pro Sekunde bei Berührung)
    feuer: zahl(e.feuer ?? a.feuer, 0, 30, 1),                                 // Minuten zwischen zwei Bränden (0 = keine)
    feuerPhase: Math.round(zahl(e.feuerPhase ?? a.feuerPhase, 0, 240, 20)),  // so lange (Spielminuten ab Weltbeginn) brennt es immer wieder
    verkehr: Math.round(zahl(e.verkehr ?? a.verkehr, 0, 30, 6)),             // fahrende Autos am Anfang
    verkehrPhase: Math.round(zahl(e.verkehrPhase ?? a.verkehrPhase, 0, 240, 25)),
    blaulicht: ['aus', 'selten', 'normal'].includes(e.blaulicht) ? e.blaulicht : (['aus', 'selten', 'normal'].includes(a.blaulicht) ? a.blaulicht : 'selten'),   // Polizei/Feuerwehr-Durchfahrten
    sichtkegel: typeof e.sichtkegel === 'boolean' ? e.sichtkegel : !!a.sichtkegel,   // Sichtkegel der Zombies anzeigen
    reichweite: Object.fromEntries(Object.entries(REICHWEITE_VORGABE).map(([w, v]) => [w, Math.round(zahl(e.reichweite?.[w] ?? a.reichweite?.[w], 5, 80, v))])),   // automatische Schussreichweite in Metern
    waffen: Object.fromEntries(Object.entries(WAFFEN_VORGABE).map(([w, v]) => [w, {
      schaden: Math.round(zahl(e.waffen?.[w]?.schaden ?? a.waffen?.[w]?.schaden, 1, 500, v.schaden)),
      pause: Math.round(zahl(e.waffen?.[w]?.pause ?? a.waffen?.[w]?.pause, 0.05, 5, v.pause) * 100) / 100,
    }])),
    toeneVorbelegt: Array.isArray(e.toeneVorbelegt) ? e.toeneVorbelegt.filter(x => typeof x === 'string').slice(0, 50) : (a.toeneVorbelegt ?? []),
    zombies: {
      dichte: Math.round(zahl(z.dichte, 0, 50, 10)),     // draußen, 10 = normal
      haeuser: Math.round(zahl(z.haeuser, 0, 50, 10)),   // schlafende Zombies in Häusern, 10 = normal
      tempo: Math.round(zahl(z.tempo, 50, 150, 100)),    // Laufgeschwindigkeit in Prozent
      nacht: Math.round(zahl(z.nacht, 10, 30, 15)),      // nachts so viel mehr draußen (15 = ×1,5)
      welle: Math.round(zahl(z.welle, 0, 120, 20)),      // alle so viele Spielminuten kommt eine Zombiewelle (0 = aus; sonst mindestens 5)
      welleMin: Math.round(zahl(z.welleMin, 5, 50, 20)), // Größe der Welle: kleinste Zahl
      welleMax: Math.round(zahl(z.welleMax, 5, 50, 50)), // … größte Zahl (höchstens 50)
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
      wartezeit: Math.round(zahl(ag.wartezeit, 10, 180, 60)),                 // Spielminuten, die der Bus wartet
      anzahl: Math.round(zahl(ag.anzahl, 3, 6, 4)),                           // Aufgaben je Level
    },
    bundeswehr: {
      aktiv: typeof bw.aktiv === 'boolean' ? bw.aktiv : true,                 // Stützpunkt schießt, handelt und kann fallen
      pumaPause: Math.round(zahl(bw.pumaPause, 0.5, 10, 2.5) * 10) / 10,     // Panzer (Puma): Sekunden zwischen zwei Schüssen
      falltage: Math.round(zahl(bw.falltage, 0, 30, 3)),                      // fällt nach so vielen Spieltagen seit Weltbeginn (0 = nie)
    },
    funde,
    toene,
    test: {
      zeitraffer: ZEITRAFFER.includes(Number(t.zeitraffer)) ? Number(t.zeitraffer) : 1,
      unsterblich: [...new Set((Array.isArray(t.unsterblich) ? t.unsterblich : []).map(n => String(n).trim().slice(0, 16)).filter(Boolean))].slice(0, 20),
    },
  };
}

export function vorgaben() {
  return {
    zugangscode: '', karte: 'geretsried', bots: 2, frischerStart: false, autos: 10, tagMinuten: 48, tagAb: 420, nachtAb: 1290, nachtDunkel: 92, menschen: 50, verwandlung: 30, bissSpieler: 12, biss: 100, feuer: 1, feuerPhase: 20, verkehr: 6, verkehrPhase: 25, blaulicht: 'selten', sichtkegel: false, toeneVorbelegt: [], reichweite: { ...REICHWEITE_VORGABE }, waffen: JSON.parse(JSON.stringify(WAFFEN_VORGABE)),
    zombies: { dichte: 10, haeuser: 10, tempo: 100, nacht: 15, welle: 20, welleMin: 20, welleMax: 50, typen: Object.fromEntries(ZOMBIE_TYPEN.map(k => [k, true])) },
    funde: Object.fromEntries(Object.keys(DINGE).map(k => [k, 10])),
    aufgaben: { an: true, stunde: 18, wartezeit: 60, anzahl: 4 },
    bundeswehr: { aktiv: true, falltage: 3, pumaPause: 2.5 },
    sprache: { an: true, hoerweite: 40, stockwerk: 35, drinnenDraussen: 10, funk: 70, redenLockt: false },
    test: { zeitraffer: 1, unsterblich: [] },
    toene: {},
  };
}

// Startwerte aus den Add-on-Optionen (options.json)
export function ausOptionen(o = {}) {
  const dichte = o.zombies !== undefined && o.zombies !== null ? Number(o.zombies) : (Number(o.zombie_faktor) || 1) * 10;
  return bereinige({
    zugangscode: o.zugangscode, karte: o.karte ?? 'geretsried', bots: o.bots ?? 0,
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
  }

  aendern(neu) {
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

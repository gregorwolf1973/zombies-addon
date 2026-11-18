// Einstellungen des Spiels: werden auf der Verwaltungsseite (HA-Seitenleiste) geändert und gelten sofort.
// Gespeichert in /data/einstellungen.json; beim allerersten Start dienen die Add-on-Optionen als Startwerte.
import fs from 'node:fs';
import path from 'node:path';
import { DINGE } from '../client/welt.mjs';

export const KARTEN = ['geretsried', 'dorf'];
export const ZEITRAFFER = [1, 5, 10, 60];
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
  return {
    zugangscode: String(e.zugangscode ?? a.zugangscode ?? '').trim().slice(0, 40),
    karte: KARTEN.includes(e.karte) ? e.karte : a.karte,
    bots: Math.round(zahl(e.bots ?? a.bots, 0, 9, 2)),
    frischerStart: typeof e.frischerStart === 'boolean' ? e.frischerStart : !!a.frischerStart,
    autos: Math.round(zahl(e.autos ?? a.autos, 0, 50, 10)),            // geparkte Autos, 10 = normal (gilt für neue Welten)
    tagMinuten: Math.round(zahl(e.tagMinuten ?? a.tagMinuten, 10, 240, 48)),   // so viele echte Minuten dauert ein Spieltag
    menschen: Math.round(zahl(e.menschen ?? a.menschen, 0, 200, 50)),         // Bewohner zu Beginn einer Welt
    ansteckung: Math.round(zahl(e.ansteckung ?? a.ansteckung, 1, 30, 5)),     // Minuten vom Biss bis zur Verwandlung
    zombies: {
      dichte: Math.round(zahl(z.dichte, 0, 50, 10)),     // draußen, 10 = normal
      haeuser: Math.round(zahl(z.haeuser, 0, 50, 10)),   // schlafende Zombies in Häusern, 10 = normal
      tempo: Math.round(zahl(z.tempo, 50, 150, 100)),    // Laufgeschwindigkeit in Prozent
      nacht: Math.round(zahl(z.nacht, 10, 30, 15)),      // nachts so viel mehr draußen (15 = ×1,5)
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
    zugangscode: '', karte: 'geretsried', bots: 2, frischerStart: false, autos: 10, tagMinuten: 48, menschen: 50, ansteckung: 5,
    zombies: { dichte: 10, haeuser: 10, tempo: 100, nacht: 15 },
    funde: Object.fromEntries(Object.keys(DINGE).map(k => [k, 10])),
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

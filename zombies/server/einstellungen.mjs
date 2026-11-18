// Einstellungen des Spiels: werden auf der Verwaltungsseite (HA-Seitenleiste) geändert und gelten sofort.
// Gespeichert in /data/einstellungen.json; beim allerersten Start dienen die Add-on-Optionen als Startwerte.
import fs from 'node:fs';
import path from 'node:path';
import { DINGE } from '../client/welt.mjs';

export const KARTEN = ['geretsried', 'dorf'];
export const ZEITRAFFER = [1, 5, 10, 60];

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
  return {
    zugangscode: String(e.zugangscode ?? a.zugangscode ?? '').trim().slice(0, 40),
    karte: KARTEN.includes(e.karte) ? e.karte : a.karte,
    bots: Math.round(zahl(e.bots ?? a.bots, 0, 9, 2)),
    frischerStart: typeof e.frischerStart === 'boolean' ? e.frischerStart : !!a.frischerStart,
    zombies: {
      dichte: Math.round(zahl(z.dichte, 0, 50, 10)),     // draußen, 10 = normal
      haeuser: Math.round(zahl(z.haeuser, 0, 50, 10)),   // schlafende Zombies in Häusern, 10 = normal
      tempo: Math.round(zahl(z.tempo, 50, 150, 100)),    // Laufgeschwindigkeit in Prozent
    },
    funde,
    test: {
      zeitraffer: ZEITRAFFER.includes(Number(t.zeitraffer)) ? Number(t.zeitraffer) : 1,
      unsterblich: [...new Set((Array.isArray(t.unsterblich) ? t.unsterblich : []).map(n => String(n).trim().slice(0, 16)).filter(Boolean))].slice(0, 20),
    },
  };
}

export function vorgaben() {
  return {
    zugangscode: '', karte: 'geretsried', bots: 2, frischerStart: false,
    zombies: { dichte: 10, haeuser: 10, tempo: 100 },
    funde: Object.fromEntries(Object.keys(DINGE).map(k => [k, 10])),
    test: { zeitraffer: 1, unsterblich: [] },
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

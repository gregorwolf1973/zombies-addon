// Nebel als Wetterlage: morgens und abends (Spieluhr) wird zufällig Nebel gewürfelt, der ein- und ausblendet.
// Reine Logik ohne Raum/Netz (Test: tests/nebel.test.mjs); der Raum ruft Nebel.schritt() je Takt und schreibt die Dichte in den Zustand.

export const NEBEL_VORGABE = { an: true, morgen: 35, abend: 35, sicht: 20, zombie: 50 };   // an, Wahrscheinlichkeit je Morgen/Abend in %, Sichtweite in m (bei voller Dichte), Zombie-Sicht in % (bei voller Dichte)
export const NEBEL_DAUER = [20, 60];      // Spielminuten
export const NEBEL_BLENDE = 10;           // Spielminuten Ein-/Ausblenden (höchstens ein Drittel der Dauer)
export const MORGEN_VOR_TAG = 90;         // Würfeln: so viele Spielminuten vor „Tag ab“ (mitten in der Morgendämmerung)
export const ABEND_VOR_NACHT = 150;       // … und so viele vor „Nacht ab“ (Abenddämmerung)
export const NEBEL_SPRUNG = 60;           // größere Uhrsprünge (Testbefehl „Zeit“) würfeln und zählen nicht

import { zahl, fest } from '../client/zahl.mjs';
const tag = m => ((m % 1440) + 1440) % 1440;

// aus beliebiger Eingabe gültige Nebel-Einstellungen machen
export function bereinigeNebel(e = {}, a = NEBEL_VORGABE) {
  const x = { ...NEBEL_VORGABE, ...a, ...(e && typeof e === 'object' ? e : {}) };
  return {
    an: typeof x.an === 'boolean' ? x.an : NEBEL_VORGABE.an,
    morgen: Math.round(fest(x.morgen, 0, 100, NEBEL_VORGABE.morgen)),
    abend: Math.round(fest(x.abend, 0, 100, NEBEL_VORGABE.abend)),
    sicht: Math.round(zahl(x.sicht, 5, 100, NEBEL_VORGABE.sicht)),
    zombie: Math.round(fest(x.zombie, 10, 100, NEBEL_VORGABE.zombie)),
  };
}

// Würfeln: Nebel ja/nein bei p % (zuf liefert 0..1)
export const nebelWuerfeln = (prozent, zuf = Math.random) => zuf() * 100 < prozent;
// Dauer in Spielminuten, gleichverteilt in NEBEL_DAUER
export const nebelDauer = (zuf = Math.random) => Math.round(NEBEL_DAUER[0] + zuf() * (NEBEL_DAUER[1] - NEBEL_DAUER[0]));

// Dichte 0..1 nach `vergangen` von `dauer` Spielminuten: sanft hinein, voll, sanft hinaus
export function nebelDichte(vergangen, dauer) {
  if (!(dauer > 0) || vergangen <= 0 || vergangen >= dauer) return 0;
  const blende = Math.min(NEBEL_BLENDE, dauer / 3);
  const k = Math.min(vergangen / blende, (dauer - vergangen) / blende, 1);
  return k * k * (3 - 2 * k);
}

// Faktor für die Sicht der Zombies: 1 ohne Nebel, bei voller Dichte zombieProzent/100
export const zombieSichtFaktor = (dichte, zombieProzent = NEBEL_VORGABE.zombie) => 1 - Math.max(0, Math.min(1, dichte || 0)) * (1 - fest(zombieProzent, 10, 100, 50) / 100);

// liegt `marke` (Minute am Tag) im Schritt von `vorher` nach `jetzt` (über Mitternacht gerechnet)?
export function kreuzt(vorher, jetzt, marke) {
  const d = tag(jetzt - vorher);
  if (d === 0) return false;
  const m = tag(marke - vorher);
  return m > 0 && m <= d;
}

export class Nebel {
  constructor(zuf = Math.random) {
    this.zuf = zuf;
    this.dauer = 0; this.vergangen = 0; this.dichte = 0;
    this.erzwungen = false;   // Testbefehl: Nebel bleibt auf voller Dichte, bis er wieder ausgeschaltet wird
    this.letzteUhr = null;
  }
  // Nebel jetzt starten (Dauer in Spielminuten)
  start(dauer = nebelDauer(this.zuf)) { this.dauer = dauer; this.vergangen = 0.0001; this.dichte = nebelDichte(this.vergangen, dauer); }
  ende() { this.dauer = 0; this.vergangen = 0; this.dichte = 0; }
  aktiv() { return this.dauer > 0; }
  // Testbefehl: sofort an (volle Dichte, bis wieder aus) oder aus
  schalte(an) {
    this.erzwungen = !!an;
    this.ende();
    if (an) this.dichte = 1;
    return this.dichte;
  }
  // ein Takt: uhr = Spieluhr jetzt (Minuten am Tag). Gibt die Dichte (0..1) zurück.
  schritt(uhr, einst, tagAb, nachtAb) {
    const e = einst ?? NEBEL_VORGABE;
    const vorher = this.letzteUhr; this.letzteUhr = uhr;
    if (this.erzwungen) { this.dichte = 1; return 1; }
    if (!e.an) { if (this.aktiv()) this.ende(); return 0; }
    if (vorher === null) return this.dichte;
    if (tag(uhr - vorher) > NEBEL_SPRUNG) return this.dichte;   // Zeitsprung: nichts würfeln, nichts zählen
    const d = tag(uhr - vorher);
    if (this.aktiv()) {
      this.vergangen += d;
      if (this.vergangen >= this.dauer) this.ende(); else this.dichte = nebelDichte(this.vergangen, this.dauer);
    }
    if (!this.aktiv()) {
      const morgen = kreuzt(vorher, uhr, tag(tagAb - MORGEN_VOR_TAG));
      const abend = kreuzt(vorher, uhr, tag(nachtAb - ABEND_VOR_NACHT));
      if ((morgen && nebelWuerfeln(e.morgen, this.zuf)) || (abend && nebelWuerfeln(e.abend, this.zuf))) this.start();
    }
    return this.dichte;
  }
}

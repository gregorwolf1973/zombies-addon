// Panzermörser (M113 mit 120-mm-Mörser, Besatzung ein Soldat): Steilfeuer auf Zombiegruppen.
// Noch an keiner Karte fest eingebaut: nur der Test-Schalter test.moerser (Verwaltung) stellt ihn neben den Start (Vorgabe aus).
// Ablauf: Ziel = Zombie mit den meisten Zombies im Splitterradius (zwischen Mindest- und Höchstreichweite), Granate fliegt im hohen Bogen
// (Flugzeit nach Entfernung, Nachricht 'moerser'), Einschlag mit Flächenschaden (nach außen schwächer, Sicht egal – Steilfeuer von oben).
// Es wird nie geschossen, wenn ein Spieler (auch Bot) oder Mensch im Sicherheitsradius um den Einschlagpunkt steht; Spieler nehmen nie Schaden.
import { Fahrzeug } from './verkehr.mjs';
import { PX, gefaehrdet, haufenZiel } from './zielwahl.mjs';

export const MOERSER = {
  reichweiteMin: 15, reichweiteMax: 80,   // Meter (8 px = 1 m) vom Fahrzeug zum Einschlag
  pause: 6,                               // Sekunden zwischen zwei Schüssen
  schaden: 200, radius: 6,                // Schaden in der Mitte (am Rand die Hälfte), Splitterradius in Metern
  mindestZombies: 3,                      // so viele Zombies müssen im Radius stehen
  sicherheit: 6,                          // Meter um den Einschlag, in denen kein Spieler/Mensch stehen darf
  tempo: 30,                              // Granatengeschwindigkeit in m/s (Flugzeit = Entfernung / Tempo, 1,5–5 s)
};

export class Moerser {
  constructor(raum) {
    this.raum = raum;
    this.id = null;        // Fahrzeug-Id (state.fahrzeuge, art 'moerser')
    this.kuehl = 2;        // erster Schuss nach 2 s
    this.flug = [];        // { x, y, t, von: {x, y} }
    this.richtung = 0;
  }

  einst() { return { ...MOERSER, ...(this.raum.einstellungen?.()?.moerser ?? {}) }; }
  // Schalter test.moerser; der Schießstand erzwingt ihn per this.erzwungen (true/false) und gibt den Standplatz in this.platz { x, y } vor
  an() { return this.erzwungen ?? !!this.raum.einstellungen?.()?.test?.moerser; }

  // Fahrzeug anlegen/entfernen je nach Schalter; steht neben dem Start (freier Platz)
  abgleichen() {
    if (this.fest) return;   // fest eingebaut (Szene „Stau auf der B11“, server/szene_b11.mjs): Fahrzeug setzt die Szene, Test-Schalter egal
    const r = this.raum, s = r.state;
    if (this.an() && !this.id && r.welt?.start) {
      const p = this.platz ?? (q => ({ x: q.x + 60, y: q.y }))(r.freierPlatz(r.welt.start, 2));
      const f = new Fahrzeug();
      f.x = p.x; f.y = p.y; f.richtung = this.richtung; f.art = 'moerser'; f.farbe = 0; f.haelt = true;
      this.id = 'moerser1'; s.fahrzeuge.set(this.id, f);
    } else if (!this.an() && this.id) {
      s.fahrzeuge.delete(this.id); this.id = null; this.flug = [];
    }
  }

  fahrzeug() { return this.id ? this.raum.state.fahrzeuge.get(this.id) : null; }

  // Wer im Sicherheitsradius um (x, y) steht: Spieler (auch Bots, draußen) und Menschen (gemeinsame Hilfe: server/zielwahl.mjs)
  gefaehrdet(x, y, R) { return gefaehrdet(this.raum.state, x, y, R); }

  // bester Einschlagpunkt (Zombie mit den meisten Nachbarn im Radius) oder null
  waehleZiel(f, e) {
    return haufenZiel(this.raum.state, f, { rmin: e.reichweiteMin * PX, rmax: e.reichweiteMax * PX, R: e.radius * PX, min: e.mindestZombies, sicher: e.sicherheit * PX });
  }

  schritt(dt) {
    const r = this.raum, s = r.state;
    this.abgleichen();
    const f = this.fahrzeug();
    if (!f || this.schweigt) return;   // schweigt: Besatzung gefallen, Posten aufgegeben
    const e = this.einst();
    // Granaten im Flug
    for (let i = this.flug.length - 1; i >= 0; i--) {
      const g = this.flug[i];
      g.t -= dt;
      if (g.t <= 0) { this.flug.splice(i, 1); this.einschlag(g, e); }
    }
    this.kuehl -= dt;
    if (this.kuehl > 0) return;
    const ziel = this.waehleZiel(f, e);
    if (!ziel) { this.kuehl = 0.5; return; }
    this.kuehl = Math.max(0.5, e.pause);
    const flugzeit = Math.max(1.5, Math.min(5, ziel.d / (e.tempo * PX)));
    this.richtung = Math.atan2(ziel.y - f.y, ziel.x - f.x);
    this.flug.push({ x: ziel.x, y: ziel.y, t: flugzeit });
    r.broadcast('moerser', { x1: f.x, y1: f.y, x2: ziel.x, y2: ziel.y, flug: flugzeit, w: this.richtung, r: e.radius * PX });
  }

  // Einschlag: Flächenschaden an Zombies (nach außen schwächer), Spieler und Menschen bleiben unverletzt
  einschlag(g, e) {
    const r = this.raum, s = r.state, R = e.radius * PX;
    const von = this.schuetze ??= { name: 'Panzermörser', x: g.x, y: g.y, besiegt: 0 };
    von.x = g.x; von.y = g.y;
    const vorher = s.besiegt;
    for (const [id, z] of [...s.zombies]) {
      if (z.ebene) continue;
      const d = Math.hypot(z.x - g.x, z.y - g.y);
      if (d > R) continue;
      const sch = Math.max(1, Math.round(e.schaden * (1 - 0.5 * d / R)));
      if (sch >= z.hp) z.kriecht = true;   // ein Treffer, der ihn erledigt, lässt ihn nicht mehr kriechen
      r.schaden(id, z, sch, von);
    }
    s.besiegt = vorher;   // zählt nicht für die Aufgaben der Spieler (wie die Bundeswehr)
    r.broadcast('explosion', { x: g.x, y: g.y, r: R, ebene: '' });
    r.laerm?.(g.x, g.y, 600, true, '');
  }
}

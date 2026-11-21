// Panzermörser (M113 mit 120-mm-Mörser, Besatzung ein Soldat): Steilfeuer auf Zombiegruppen.
// Noch an keiner Karte fest eingebaut: nur der Test-Schalter test.moerser (Verwaltung) stellt ihn neben den Start (Vorgabe aus).
// Ablauf: Ziel = Zombie mit den meisten Zombies im Splitterradius (zwischen Mindest- und Höchstreichweite), Granate fliegt im hohen Bogen
// (Flugzeit nach Entfernung, Nachricht 'moerser'), Einschlag mit Flächenschaden (nach außen schwächer, Sicht egal – Steilfeuer von oben).
// Es wird nie geschossen, wenn ein Spieler (auch Bot) oder Mensch im Sicherheitsradius um den Einschlagpunkt steht; Spieler nehmen nie Schaden.
import { Fahrzeug } from './verkehr.mjs';

export const MOERSER = {
  reichweiteMin: 15, reichweiteMax: 80,   // Meter (8 px = 1 m) vom Fahrzeug zum Einschlag
  pause: 6,                               // Sekunden zwischen zwei Schüssen
  schaden: 200, radius: 6,                // Schaden in der Mitte (am Rand die Hälfte), Splitterradius in Metern
  mindestZombies: 3,                      // so viele Zombies müssen im Radius stehen
  sicherheit: 6,                          // Meter um den Einschlag, in denen kein Spieler/Mensch stehen darf
  tempo: 30,                              // Granatengeschwindigkeit in m/s (Flugzeit = Entfernung / Tempo, 1,5–5 s)
};
const PX = 8;

export class Moerser {
  constructor(raum) {
    this.raum = raum;
    this.id = null;        // Fahrzeug-Id (state.fahrzeuge, art 'moerser')
    this.kuehl = 2;        // erster Schuss nach 2 s
    this.flug = [];        // { x, y, t, von: {x, y} }
    this.richtung = 0;
  }

  einst() { return { ...MOERSER, ...(this.raum.einstellungen?.()?.moerser ?? {}) }; }
  an() { return !!this.raum.einstellungen?.()?.test?.moerser; }

  // Fahrzeug anlegen/entfernen je nach Schalter; steht neben dem Start (freier Platz)
  abgleichen() {
    if (this.fest) return;   // fest eingebaut (Szene „Stau auf der B11“, server/szene_b11.mjs): Fahrzeug setzt die Szene, Test-Schalter egal
    const r = this.raum, s = r.state;
    if (this.an() && !this.id && r.welt?.start) {
      const p = r.freierPlatz(r.welt.start, 2);
      const f = new Fahrzeug();
      f.x = p.x + 60; f.y = p.y; f.richtung = this.richtung; f.art = 'moerser'; f.farbe = 0; f.haelt = true;
      this.id = 'moerser1'; s.fahrzeuge.set(this.id, f);
    } else if (!this.an() && this.id) {
      s.fahrzeuge.delete(this.id); this.id = null; this.flug = [];
    }
  }

  fahrzeug() { return this.id ? this.raum.state.fahrzeuge.get(this.id) : null; }

  // Wer im Sicherheitsradius um (x, y) steht: Spieler (auch Bots, draußen) und Menschen
  gefaehrdet(x, y, R) {
    const s = this.raum.state;
    for (const p of s.spieler.values()) if (!p.ebene && p.sichtbar !== false && Math.hypot(p.x - x, p.y - y) < R) return true;
    for (const m of s.menschen?.values?.() ?? []) if (!m.ebene && Math.hypot(m.x - x, m.y - y) < R) return true;
    return false;
  }

  // bester Einschlagpunkt (Zombie mit den meisten Nachbarn im Radius) oder null
  waehleZiel(f, e) {
    const s = this.raum.state, rmin = e.reichweiteMin * PX, rmax = e.reichweiteMax * PX, R = e.radius * PX;
    const liste = [];
    for (const z of s.zombies.values()) if (!z.ebene && z.hp > 0) liste.push(z);
    let best = null;
    for (const z of liste) {
      const d = Math.hypot(z.x - f.x, z.y - f.y);
      if (d < rmin || d > rmax) continue;
      let n = 0, sx = 0, sy = 0;
      for (const q of liste) if (Math.hypot(q.x - z.x, q.y - z.y) <= R) { n++; sx += q.x; sy += q.y; }
      if (n < e.mindestZombies) continue;
      // Schwerpunkt der Gruppe als Einschlagpunkt
      const x = sx / n, y = sy / n, dd = Math.hypot(x - f.x, y - f.y);
      if (dd < rmin || dd > rmax || this.gefaehrdet(x, y, e.sicherheit * PX)) continue;
      if (!best || n > best.n || (n === best.n && dd < best.d)) best = { x, y, n, d: dd };
    }
    return best;
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

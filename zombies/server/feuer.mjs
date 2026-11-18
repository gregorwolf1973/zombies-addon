// Brände in der Anfangsphase des Ausbruchs: etwa jede Minute (einstellbar) fängt ein Haus, ein geparktes oder
// fahrendes Auto oder ein Bus Feuer. Feuer wächst, brennt eine Weile, verletzt alles in der Nähe und erlischt.
// Autos und Busse bleiben als Wrack stehen, Häuser als ausgebrannte Ruine.
import { schema, t } from '@colyseus/schema';
import { KACHEL } from '../client/welt.mjs';

export const Feuer = schema({
  x: t.number(), y: t.number(),
  r: t.number(),            // Radius in Pixeln
  staerke: t.number(),      // 0–1
  art: t.string(),          // 'haus' | 'auto' | 'bus' | 'fahrzeug'
}, 'Feuer');

const DAUER = { haus: 300, auto: 100, bus: 130, fahrzeug: 100 };
const SCHADEN_SPIELER = 7, SCHADEN_ZOMBIE = 18;   // pro Sekunde im Feuer

export class Brandstifter {
  constructor(raum) {
    this.raum = raum;
    this.info = new Map();
    this.naechsteId = 1;
    this.uhr = 20 + raum.rnd() * 20;   // erster Brand nach kurzer Zeit
  }

  // verbrannt-Schlüssel: 'haus:nr', 'auto:bID', 'bus:ID', 'fz:ID'
  istVerbrannt(k) { return this.raum.state.verbrannt.has(k); }

  schritt(dt) {
    const s = this.raum.state, e = this.raum.einstellungen?.() ?? {};
    const zr = this.raum.zeitraffer?.() ?? 1;
    const minuten = e.feuerMinuten ?? 1, phase = e.feuerPhase ?? 20;
    if (minuten > 0 && (s.zeit ?? 0) / 60 < phase) {
      this.uhr -= dt * zr;
      if (this.uhr <= 0) { this.uhr = minuten * 60 * (0.6 + this.raum.rnd() * 0.8); this.entfachen(); }
    }
    for (const [id, f] of s.feuer) {
      const inf = this.info.get(id);
      if (!inf) { s.feuer.delete(id); continue; }
      inf.alter += dt * zr;
      const t0 = inf.dauer;
      f.staerke = inf.alter < 15 ? 0.3 + inf.alter / 15 * 0.7 : inf.alter > t0 - 25 ? Math.max(0, (t0 - inf.alter) / 25) : 1;
      if (inf.alter >= t0) { this.erloschen(id, f, inf); continue; }
      // Schaden in der Nähe
      const r = f.r * (0.6 + f.staerke * 0.4);
      for (const p of s.spieler.values()) {
        if (p.ebene || p.unten || p.zombie > 0 || this.raum.unsterblich?.(p)) continue;
        if (Math.hypot(p.x - f.x, p.y - f.y) < r) { p.hp = Math.max(0, p.hp - SCHADEN_SPIELER * f.staerke * dt); if (p.hp === 0) this.raum.liegtAmBoden(p); }
      }
      for (const [zid, z] of s.zombies) {
        if (z.ebene || Math.hypot(z.x - f.x, z.y - f.y) >= r) continue;
        z.hp = Math.max(0, z.hp - SCHADEN_ZOMBIE * f.staerke * dt);
        if (z.hp === 0) { s.zombies.delete(zid); this.raum.zombieInfo.delete(zid); this.raum.broadcast('weg', { x: z.x, y: z.y }); }
      }
    }
  }

  // Ziel in der Nähe eines Spielers wählen, damit man den Brand mitbekommt
  entfachen() {
    const s = this.raum.state, w = this.raum.welt, r = this.raum.rnd;
    const draussen = [...s.spieler.values()].filter(p => !p.ebene);
    if (!draussen.length) return;
    const p = draussen[Math.floor(r() * draussen.length)];
    const nah = (x, y) => { const d = Math.hypot(x - p.x, y - p.y); return d > 250 && d < 1300; };
    const brennt = new Set([...this.info.values()].map(i => i.ziel));
    const kandidaten = [];
    for (const h of w.haeuser) {
      if (h.safe) continue;
      const x = (h.x + h.b / 2) * KACHEL, y = (h.y + h.h / 2) * KACHEL, k = 'haus:' + h.nr;
      if (nah(x, y) && !this.istVerbrannt(k) && !brennt.has(k)) kandidaten.push({ k, x, y, art: 'haus', r: Math.max(h.b, h.h) * KACHEL * 0.55 + 20, haus: h });
    }
    for (const b of w.behaelter) {
      if (b.art !== 'auto' && b.art !== 'bus') continue;
      const k = (b.art === 'auto' ? 'auto:' : 'bus:') + b.id;
      if (nah(b.x, b.y) && !this.istVerbrannt(k) && !brennt.has(k)) kandidaten.push({ k, x: b.x, y: b.y, art: b.art, r: b.art === 'bus' ? 70 : 42 });
    }
    for (const [id, f] of s.fahrzeuge ?? []) {
      if (f.art !== 'auto' || !nah(f.x, f.y)) continue;
      kandidaten.push({ k: 'fz:' + id, x: f.x, y: f.y, art: 'fahrzeug', r: 42, fz: id });
    }
    if (!kandidaten.length) return;
    // Häuser seltener als Fahrzeuge (sonst brennt die Stadt zu schnell ab)
    const gewicht = c => c.art === 'haus' ? 1 : 2;
    let summe = kandidaten.reduce((a, c) => a + gewicht(c), 0), z = r() * summe, ziel = kandidaten[0];
    for (const c of kandidaten) { z -= gewicht(c); if (z <= 0) { ziel = c; break; } }
    this.anzuenden(ziel);
  }

  anzuenden(ziel) {
    const s = this.raum.state;
    const f = new Feuer();
    f.x = ziel.x; f.y = ziel.y; f.r = ziel.r; f.staerke = 0.3; f.art = ziel.art;
    const id = 'f' + this.naechsteId++;
    s.feuer.set(id, f);
    this.info.set(id, { ziel: ziel.k, alter: 0, dauer: DAUER[ziel.art] ?? 120, fz: ziel.fz });
    if (ziel.fz) { const vi = this.raum.verkehr?.info.get(ziel.fz); if (vi) vi.brennt = true; }
    // Knall und Lärm locken Zombies an; die Feuerwehr rückt aus
    this.raum.laerm(f.x, f.y, ziel.art === 'haus' ? 380 : 520, true, '');
    this.raum.broadcast('feuer', { x: f.x, y: f.y, art: ziel.art });
    this.raum.broadcast('meldung', { text: ziel.art === 'haus' ? '🔥 Ein Haus brennt!' : '🔥 Ein Fahrzeug ist in Flammen aufgegangen!' });
    if (this.raum.rnd() < 0.6) this.raum.verkehr?.blaulicht({ x: f.x, y: f.y });
    return id;
  }

  erloschen(id, f, inf) {
    const s = this.raum.state;
    s.feuer.delete(id); this.info.delete(id);
    s.verbrannt.set(inf.ziel, true);
    if (inf.fz) { const fz = s.fahrzeuge.get(inf.fz); if (fz) { fz.art = 'wrack'; fz.haelt = true; } this.raum.verkehr?.info.delete(inf.fz); }
  }
}

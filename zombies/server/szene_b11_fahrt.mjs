// Streifenfahrt der Panzer an der B 11 (Szene „Stau auf der B11“, nur geretsried2): Puma und Leopard 2 rollen langsam zwischen Wegpunkten
// im Bereich der Kreuzung und des Parkplatzes beim Rathaus hin und her. Der Weg liegt in Pixeln relativ zur Kreuzung (b11Geometrie().kreuzung);
// Wegpunkte, die nicht befahrbar sind, werden auf die nächste freie Stelle verschoben. Die Wanne wendet auf der Stelle (Kettenfahrzeug),
// rollt erst bei passender Richtung, bremst vor Spielern und Menschen und hält Abstand zum anderen Fahrzeug.
import { frei } from '../client/welt.mjs';
import { imFussabdruck } from '../client/evak.mjs';
import { befahrbarNahe } from './querfeld.mjs';

export const winkelDiff = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
const norm = w => Math.atan2(Math.sin(w), Math.cos(w));

// Maße in Pixeln (8 px = 1 m): halbe Länge/Breite der Wanne (Überrollen), rad = Platzbedarf beim Fahren, tempo px/s, wende rad/s
export const STREIFE = {
  puma:    { hl: 52, hb: 26, rad: 30, tempo: 22, wende: 0.6, pause: [3, 6], start: 0, route: [[-70, 110], [-240, 170], [-200, 310]] },
  leopard: { hl: 56, hb: 28, rad: 32, tempo: 18, wende: 0.5, pause: [4, 8], start: 4, route: [[-480, -20], [-460, 140], [-420, 290]] },
};
export const MIN_ABSTAND = 160;   // Mindestabstand der Wannenmitten (20 m): kein Fahrzeug fährt näher an das andere heran

// Wegpunkte (Pixel, Welt) einer Streife um die Kreuzung k, auf befahrbare Stellen gelegt; null, wenn keine Route möglich
export function streifeRoute(welt, kreuzung, def) {
  const route = [];
  for (const [dx, dy] of def.route) {
    const p = befahrbarNahe(welt, kreuzung.x + dx, kreuzung.y + dy, def.rad);
    if (!p) return null;
    route.push({ x: p.x, y: p.y });
  }
  return route;
}

export class Streife {
  // k: Körper { x, y, richtung } (wird bewegt), def: Eintrag aus STREIFE, von: „Schütze“ für überrollte Zombies
  constructor(raum, k, def, route, von) {
    this.raum = raum; this.k = k; this.def = def; this.route = route; this.von = von;
    this.idx = 1; this.dir = 1; this.wartet = def.start ?? 0; this.steht = 0;
    this.bewegt = false;   // dreht oder rollt gerade
    this.faehrt = false;   // rollt gerade (nur dann Überrollen/Plattmachen)
    k.x = route[0].x; k.y = route[0].y;
    k.richtung = Math.atan2(route[1].y - route[0].y, route[1].x - route[0].x);
  }

  // Wegpunkt weiterschalten (hin und her: 0 1 2 1 0 …) und an den Enden kurz halten
  weiter() {
    const n = this.route.length;
    if (this.idx + this.dir >= n || this.idx + this.dir < 0) this.dir = -this.dir;
    this.idx += this.dir;
    const [a, b] = this.def.pause;
    this.wartet = a + this.raum.rnd() * (b - a);
  }

  // steht ein Spieler oder Mensch (draußen) in der Wanne oder knapp davor? Dann rührt sich das Fahrzeug nicht
  imWeg() {
    const s = this.raum.state, k = this.k, d = this.def;
    const f = { x: k.x + Math.cos(k.richtung) * 8, y: k.y + Math.sin(k.richtung) * 8, richtung: k.richtung };
    for (const m of [s.spieler, s.menschen]) for (const q of m?.values?.() ?? []) {
      if (q.ebene) continue;
      if (imFussabdruck(f, q.x, q.y, d.hl + 24, d.hb + 14)) return true;
    }
    return false;
  }

  // andere: Liste anderer Streifen (Abstand halten)
  schritt(dt, andere = []) {
    this.bewegt = false; this.faehrt = false;
    const k = this.k, d = this.def, r = this.raum;
    if (this.wartet > 0) { this.wartet -= dt; return; }
    if (this.imWeg()) return;
    const z = this.route[this.idx], dx = z.x - k.x, dy = z.y - k.y, rest = Math.hypot(dx, dy);
    if (rest < 14) { this.weiter(); return; }
    const diff = winkelDiff(k.richtung, Math.atan2(dy, dx)), dreh = Math.min(Math.abs(diff), d.wende * dt);
    if (dreh > 0) { k.richtung = norm(k.richtung + Math.sign(diff) * dreh); this.bewegt = true; }
    if (Math.abs(diff) - dreh > 0.5) return;   // erst auf der Stelle drehen, dann rollen
    const schritt = Math.min(rest, d.tempo * dt), nx = k.x + Math.cos(k.richtung) * schritt, ny = k.y + Math.sin(k.richtung) * schritt;
    // Abstand zu anderen Streifen: nicht näher heranfahren, wenn schon zu dicht
    for (const o of andere) {
      const alt = Math.hypot(o.k.x - k.x, o.k.y - k.y), neu = Math.hypot(o.k.x - nx, o.k.y - ny);
      if (neu < MIN_ABSTAND && neu < alt) { this.steht += dt; if (this.steht > 6) { this.steht = 0; this.dir = -this.dir; this.idx = Math.max(0, Math.min(this.route.length - 1, this.idx + this.dir)); } return; }
    }
    this.steht = 0;
    if (!frei(r.welt, nx, ny, d.rad)) { this.weiter(); this.wartet = Math.max(this.wartet, 1.5); return; }   // Hindernis (Haus, Zaun, Baum): zum nächsten Wegpunkt
    k.x = nx; k.y = ny;
    this.bewegt = true; this.faehrt = true;
  }
}

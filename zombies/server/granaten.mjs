// Handgranaten (nur bei der Bundeswehr zu finden): werfen, 0,6 s fliegen, nach 2 s Zünder explodieren.
// Hoher Schaden für Zombies im Radius, halber Schaden für Spieler, sehr laut (lockt Zombies aus 600 px).
import { GRANATE, sichtfrei, frei } from '../client/welt.mjs';

export class Granaten {
  constructor(raum) {
    this.raum = raum;
    this.zeit = 0;     // eigene Uhr (Sekunden) für die Wurfpause
    this.liste = [];   // { x, y, ebene, t, von (sessionId), name }
  }

  // Wurf (Nachricht 'wurf' oder „Benutzen“ im Rucksack): auf den nächsten Zombie in ≤ 15 m, sonst in Blickrichtung
  werfen(client) {
    const r = this.raum, p = r.state.spieler.get(client.sessionId), x = r.extra.get(client.sessionId);
    if (!p || !x || p.unten || p.zombie > 0 || p.aktion || r.state.phase !== 'spiel') return false;
    const i = p.rucksack.indexOf('granate');
    if (i < 0 || (x.wurfPause ?? 0) > this.zeit) return false;
    const welt = r.wv(p.ebene);
    let zx, zy;
    const ziel = r.naechsterZombie(p.x, p.y, GRANATE.wurfWeite, p);
    if (ziel) { zx = ziel[1].x; zy = ziel[1].y; }
    else {
      // in Blickrichtung so weit, bis etwas im Weg ist
      zx = p.x; zy = p.y;
      for (let d = 8; d <= GRANATE.blickWeite; d += 8) {
        const nx = p.x + Math.cos(p.richtung) * d, ny = p.y + Math.sin(p.richtung) * d;
        if (!frei(welt, nx, ny, 4)) break;
        zx = nx; zy = ny;
      }
    }
    p.rucksack.splice(i, 1);
    x.wurfPause = this.zeit + 0.6;
    this.liste.push({ x: zx, y: zy, ebene: p.ebene ?? '', t: 0, von: client.sessionId, name: p.name });
    r.broadcast('granate', { x1: p.x, y1: p.y, x2: zx, y2: zy, flug: GRANATE.flug, zeit: GRANATE.zuender, ebene: p.ebene ?? '' });
    return true;
  }

  schritt(dt) {
    this.zeit += dt;
    for (let i = this.liste.length - 1; i >= 0; i--) {
      const g = this.liste[i];
      g.t += dt;
      if (g.t >= GRANATE.zuender) { this.liste.splice(i, 1); this.explodiert(g); }
    }
  }

  explodiert(g) {
    const r = this.raum, welt = r.wv(g.ebene), R = GRANATE.radius;
    const werfer = r.state.spieler.get(g.von) ?? { name: g.name, x: g.x, y: g.y, besiegt: 0 };
    for (const [id, z] of [...r.state.zombies]) {
      if ((z.ebene ?? '') !== g.ebene) continue;
      const d = Math.hypot(z.x - g.x, z.y - g.y);
      if (d > R || !sichtfrei(welt, g.x, g.y, z.x, z.y)) continue;
      r.schaden(id, z, GRANATE.schadenZombie, werfer);
    }
    for (const p of r.state.spieler.values()) {
      if (p.ebene !== g.ebene || p.unten || Math.hypot(p.x - g.x, p.y - g.y) > R || !sichtfrei(welt, g.x, g.y, p.x, p.y)) continue;
      p.hp = Math.max(0, p.hp - GRANATE.schadenSpieler);
      if (p.hp <= 0 && p.zombie <= 0 && !r.unsterblich?.(p)) r.liegtAmBoden(p);
    }
    r.broadcast('explosion', { x: g.x, y: g.y, r: R, ebene: g.ebene });
    r.laerm(g.x, g.y, GRANATE.laerm, true, g.ebene);
  }
}


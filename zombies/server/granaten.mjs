// Handgranaten (nur bei der Bundeswehr zu finden): werfen, 0,6 s fliegen, nach 2 s Zünder explodieren.
// Hoher Schaden für Zombies im Radius, halber Schaden für Spieler, sehr laut (lockt Zombies aus 600 px).
import { indexVon, nimmEins } from '../client/stapel.mjs';
import { GRANATE, sichtfrei, frei } from '../client/welt.mjs';

export class Granaten {
  constructor(raum) {
    this.raum = raum;
    this.zeit = 0;     // eigene Uhr (Sekunden) für die Wurfpause
    this.liste = [];   // { x, y, ebene, t, von (sessionId), name }
  }

  // Wurf (Nachricht 'wurf' oder „Benutzen“ im Rucksack). Quelle: Handgranaten in der Hand (Magazin), sonst eine Granate im Rucksack,
  // sonst der Vorrat eines Handgranaten-Platzes. Ohne Zielpunkt: auf den nächsten Zombie in ≤ 25 m, sonst in Blickrichtung.
  // Mit Zielpunkt m = { x, y }: genau dorthin, geklemmt auf Wurfweite und den 60°-Bogen vor der Figur; Zünder = Aufschlag.
  werfen(client, m = null) {
    const r = this.raum, p = r.state.spieler.get(client.sessionId), x = r.extra.get(client.sessionId);
    if (!p || !x || p.unten || p.zombie > 0 || p.aktion || r.state.phase !== 'spiel') return false;
    if ((x.wurfPause ?? 0) > this.zeit) return false;
    const einst = r.constructor.einstellungen ?? {};
    const hand = p.waffe === 'handgranate' && !p.faust;
    const i = indexVon(p.rucksack, 'granate');
    let quelle;
    if (hand && p.magazin > 0 && !(p.nachladen > 0)) quelle = 'magazin';
    else if (hand && p.nachladen > 0 && i < 0) return false;
    else if (i >= 0) quelle = 'rucksack';
    else if ((p.handgranaten ?? 0) > 0) quelle = 'vorrat';
    else return false;
    const slot = quelle !== 'rucksack';   // Platz-Granaten: Schaden und Reichweite aus der Verwaltung
    const weite = slot ? (einst.reichweite?.handgranate ?? GRANATE.wurfWeite / 8) * 8 : GRANATE.wurfWeite;
    const schaden = slot ? (einst.waffen?.handgranate?.schaden ?? GRANATE.schadenZombie) : GRANATE.schadenZombie;
    const welt = r.wv(p.ebene);
    let zx, zy, flug = GRANATE.flug, zuender = GRANATE.zuender;
    const gezielt = m && Number.isFinite(Number(m.x)) && Number.isFinite(Number(m.y));
    if (gezielt) {
      let w = Math.atan2(Number(m.y) - p.y, Number(m.x) - p.x);
      const d = Math.atan2(Math.sin(w - p.richtung), Math.cos(w - p.richtung)), halb = GRANATE.bogen / 2;
      if (Math.abs(d) > halb) w = p.richtung + Math.sign(d) * halb;
      const dist = Math.min(weite, Math.hypot(Number(m.x) - p.x, Number(m.y) - p.y));
      zx = p.x; zy = p.y;
      for (let k = 8; dist >= 1; k += 8) {   // in 8-px-Schritten bis zum Ziel oder bis etwas im Weg ist
        const kk = Math.min(k, dist), nx = p.x + Math.cos(w) * kk, ny = p.y + Math.sin(w) * kk;
        if (!frei(welt, nx, ny, 4)) break;
        zx = nx; zy = ny;
        if (kk >= dist) break;
      }
      p.richtung = w;
      flug = zuender = Math.max(0.12, Math.hypot(zx - p.x, zy - p.y) / GRANATE.tempo);   // Aufschlagzündung
    } else {
      const ziel = r.naechsterZombie(p.x, p.y, weite, p);
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
    }
    if (quelle === 'rucksack') nimmEins(p.rucksack, i);
    else if (quelle === 'magazin') p.magazin--;
    else p.handgranaten--;
    x.wurfPause = this.zeit + (slot ? Math.max(0.2, einst.waffen?.handgranate?.pause ?? 0.6) : 0.6);
    this.liste.push({ x: zx, y: zy, ebene: p.ebene ?? '', t: 0, von: client.sessionId, name: p.name, zuender: gezielt ? zuender : undefined, schaden: slot ? schaden : undefined });
    r.broadcast('granate', { x1: p.x, y1: p.y, x2: zx, y2: zy, flug, zeit: gezielt ? zuender : GRANATE.zuender, ebene: p.ebene ?? '' });
    return true;
  }

  // Granatwerfer: Bogenschuss auf den Zielpunkt (zx, zy), schlägt nach kurzem Flug (≈ 4× so schnell wie ein Wurf) ein und
  // explodiert sofort (schaden = Zombieschaden)
  abfeuern(p, sid, zx, zy, schaden = GRANATE.schadenZombie) {
    const r = this.raum, flug = Math.max(0.08, Math.hypot(zx - p.x, zy - p.y) / GRANATE.tempoWerfer);
    this.liste.push({ x: zx, y: zy, ebene: p.ebene ?? '', t: 0, von: sid, name: p.name, zuender: flug, schaden });
    r.broadcast('granate', { x1: p.x, y1: p.y, x2: zx, y2: zy, flug, zeit: flug, ebene: p.ebene ?? '', werfer: true });
  }

  schritt(dt) {
    this.zeit += dt;
    for (let i = this.liste.length - 1; i >= 0; i--) {
      const g = this.liste[i];
      g.t += dt;
      if (g.t >= (g.zuender ?? GRANATE.zuender)) { this.liste.splice(i, 1); this.explodiert(g); }
    }
  }

  explodiert(g) {
    const r = this.raum, welt = r.wv(g.ebene), R = GRANATE.radius;
    const werfer = r.state.spieler.get(g.von) ?? { name: g.name, x: g.x, y: g.y, besiegt: 0 };
    for (const [id, z] of [...r.state.zombies]) {
      if ((z.ebene ?? '') !== g.ebene) continue;
      const d = Math.hypot(z.x - g.x, z.y - g.y);
      if (d > R || !sichtfrei(welt, g.x, g.y, z.x, z.y)) continue;
      r.schaden(id, z, g.schaden ?? GRANATE.schadenZombie, werfer);
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


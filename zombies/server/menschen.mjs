// Abschnitt 4: Menschen in der Stadt und der Ausbruch.
// Menschen gehen von zu Hause zum Einkaufen, zum Platz und zur Bushaltestelle, ein Bus fährt die Haltestellen ab.
// Zombies wittern Menschen und beißen sie; Gebissene werden nach einer einstellbaren Zeit selbst zu Zombies.
import { schema, t } from '@colyseus/schema';
import { KACHEL, BREITE, HOEHE, T, findeWeg, sichtfrei, bewege, ladenArt, WERTE as W } from '../client/welt.mjs';

export const Mensch = schema({
  x: t.number(), y: t.number(), richtung: t.number(),
  aussehen: t.string(),
  infiziert: t.boolean(),
  flieht: t.boolean(),
  sichtbar: t.boolean(),       // false = im Haus oder im Bus
}, 'Mensch');

export const Bus = schema({ x: t.number(), y: t.number(), richtung: t.number(), haelt: t.boolean() }, 'Bus');

const RAD = 10;
const TEMPO = W.tempoGehen * 0.55, FLUCHT = W.tempoGehen * 0.95, BUS_TEMPO = 150;
const BISS_ABSTAND = 26;
const FERN = 1400;   // weiter von allen Spielern weg: seltener rechnen

const winkelDiff = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

export class Stadtleben {
  constructor(raum) {
    this.raum = raum;
    this.info = new Map();        // id → { heim, ziel, weg, warte, inf, steckt, art }
    this.naechsteId = 1;
    this.takt = 0;
    this.anfangs = 0;
    this.busInfo = null;
    const w = raum.welt;
    this.wohnungen = w.haeuser.filter(h => h.betretbar && !ladenArt(h));
    this.laeden = w.haeuser.filter(h => h.betretbar && ladenArt(h));
    this.haltestellen = (w.details?.objekte ?? []).filter(o => o.a === 'haltestelle').map(o => ({ x: o.x * KACHEL, y: o.y * KACHEL, name: o.n }));
    this.plaetze = w.markt ? [{ x: (w.markt.x + w.markt.b / 2) * KACHEL, y: (w.markt.y + w.markt.h / 2) * KACHEL }] : [];
  }

  vorDerTuer(h) { return { x: (h.tuer.x + 0.5 + h.raus.dx) * KACHEL, y: (h.tuer.y + 0.5 + h.raus.dy) * KACHEL }; }

  // zu Spielbeginn: Menschen an ihren Haustüren, ein Bus, ein paar erste Zombies weit weg vom Start
  start(anzahl, ersteZombies = 3) {
    const r = this.raum.rnd;
    for (let i = 0; i < anzahl && this.wohnungen.length; i++) {
      const heim = this.wohnungen[Math.floor(r() * this.wohnungen.length)];
      const p = this.vorDerTuer(heim);
      const m = new Mensch();
      m.x = p.x; m.y = p.y; m.richtung = 0; m.infiziert = false; m.flieht = false;
      // ein Teil ist noch zu Hause und kommt später heraus
      m.sichtbar = r() < 0.6;
      m.aussehen = `${r() < 0.5 ? 'm' : 'w'},${Math.floor(r() * 6)},${Math.floor(r() * 8)}`;
      const id = 'm' + this.naechsteId++;
      this.raum.state.menschen.set(id, m);
      this.info.set(id, { heim, ziel: null, weg: null, warte: m.sichtbar ? 0 : 10 + r() * 120, inf: 0, steckt: 0 });
    }
    this.anfangs = anzahl;
    if (anzahl > 0) {
      const start = this.raum.welt.start;
      for (let n = 0, v = 0; n < ersteZombies && v < 400; v++) {
        const x = (2 + r() * (BREITE - 4)) * KACHEL, y = (2 + r() * (HOEHE - 4)) * KACHEL;
        if (Math.hypot(x - start.x, y - start.y) < 900 || this.raum.welt.hole(Math.floor(x / KACHEL), Math.floor(y / KACHEL)) !== T.WIESE) continue;
        const zid = this.raum.setzeZombie(x, y, ''); this.raum.zombieInfo.get(zid).bleibt = true; n++;
      }
    }
    if (this.haltestellen.length >= 2) this.busStarten();
  }

  lebende() { return this.raum.state.menschen.size; }

  // Anteil der noch gesunden Menschen (für den Zombie-Nachschub aus dem Umland)
  ruheAnteil() { return this.anfangs ? [...this.raum.state.menschen.values()].filter(m => !m.infiziert).length / this.anfangs : 0; }

  neuesZiel(id, m, inf) {
    const r = this.raum.rnd, wahl = r();
    let ziel;
    if (wahl < 0.35 && this.laeden.length) { const h = this.laeden[Math.floor(r() * this.laeden.length)]; ziel = { ...this.vorDerTuer(h), art: 'haus' }; }
    else if (wahl < 0.6 && this.haltestellen.length) { const hs = this.haltestellen[Math.floor(r() * this.haltestellen.length)]; ziel = { x: hs.x, y: hs.y, art: 'haltestelle', hs }; }
    else if (wahl < 0.75 && this.plaetze.length) { const p = this.plaetze[0]; ziel = { x: p.x + (r() - 0.5) * 120, y: p.y + (r() - 0.5) * 120, art: 'platz' }; }
    else ziel = { ...this.vorDerTuer(inf.heim), art: 'haus' };
    inf.ziel = ziel; inf.weg = null; inf.steckt = 0;
  }

  schritt(dt) {
    const s = this.raum.state, welt = this.raum.welt;
    const zr = this.raum.zeitraffer?.() ?? 1;
    this.takt += dt;
    const spieler = [...s.spieler.values()].filter(p => !p.ebene);
    const zombies = [...s.zombies.entries()].filter(([, z]) => !z.ebene);
    const fern = m => spieler.every(p => Math.hypot(p.x - m.x, p.y - m.y) > FERN);
    const tick = Math.round(this.takt * 20);
    for (const [id, m] of s.menschen) {
      const inf = this.info.get(id);
      if (!inf) continue;
      // Ansteckung läuft auch im Haus und im Bus
      if (m.infiziert) {
        inf.inf -= dt * zr;
        if (inf.inf <= 0) { this.verwandeln(id, m, inf); continue; }
      }
      // weit weg: nur jedes fünfte Mal, dafür mit größerem Schritt
      let d = dt;
      if (fern(m)) { if ((tick + inf.heim.nr) % 5) continue; d = dt * 5; }
      if (!m.sichtbar) {
        if (inf.imBus) continue;
        inf.warte -= d;
        if (inf.warte <= 0) { const p = this.vorDerTuer(inf.heim.nr === inf.drinIn?.nr ? inf.heim : (inf.drinIn ?? inf.heim)); m.x = p.x; m.y = p.y; m.sichtbar = true; this.neuesZiel(id, m, inf); }
        continue;
      }
      // Zombie in der Nähe? Weglaufen (gebissene laufen auch, aber langsamer)
      let gefahr = null, gd = 170;
      for (const [, z] of zombies) {
        const dd = Math.hypot(z.x - m.x, z.y - m.y);
        if (dd < gd && sichtfrei(welt, m.x, m.y, z.x, z.y)) { gd = dd; gefahr = z; }
      }
      if (gefahr) {
        m.flieht = true;
        const w = Math.atan2(m.y - gefahr.y, m.x - gefahr.x);
        const v = (m.infiziert ? TEMPO : FLUCHT) * d;
        const x0 = m.x, y0 = m.y;
        bewege(welt, m, Math.cos(w) * v, Math.sin(w) * v, RAD);
        if (Math.hypot(m.x - x0, m.y - y0) < v * 0.3) bewege(welt, m, Math.cos(w + 1.3) * v, Math.sin(w + 1.3) * v, RAD);   // an Hindernis vorbei
        m.richtung = w;
        inf.weg = null;
        continue;
      }
      m.flieht = false;
      if (!inf.ziel) this.neuesZiel(id, m, inf);
      const z = inf.ziel;
      // an der Haltestelle warten, bis der Bus kommt – oder irgendwann weitergehen
      if (inf.wartet) { inf.wartet -= d; if (inf.wartet <= 0) { inf.wartet = 0; this.neuesZiel(id, m, inf); } continue; }
      const dz = Math.hypot(z.x - m.x, z.y - m.y);
      if (dz < 18) { this.angekommen(id, m, inf); continue; }
      if (!inf.weg) {
        inf.weg = findeWeg(welt, m.x, m.y, z.x, z.y, RAD, 60000);
        if (!inf.weg) { this.neuesZiel(id, m, inf); continue; }
      }
      while (inf.weg.length > 1 && Math.hypot(inf.weg[0].x - m.x, inf.weg[0].y - m.y) < 10) inf.weg.shift();
      const wp = inf.weg[0];
      const w = Math.atan2(wp.y - m.y, wp.x - m.x), v = TEMPO * d;
      const x0 = m.x, y0 = m.y;
      bewege(welt, m, Math.cos(w) * v, Math.sin(w) * v, RAD);
      m.richtung = w;
      inf.steckt = Math.hypot(m.x - x0, m.y - y0) < v * 0.2 ? inf.steckt + d : 0;
      if (inf.steckt > 2.5) { inf.weg = null; if (inf.steckt > 6) this.neuesZiel(id, m, inf); }
    }
    this.zombiesWittern(zombies);
    this.busSchritt(dt);
  }

  angekommen(id, m, inf) {
    const z = inf.ziel, r = this.raum.rnd;
    if (z.art === 'haus') {
      m.sichtbar = false; inf.warte = 25 + r() * 90; inf.ziel = null;
      inf.drinIn = this.raum.welt.haeuser.find(h => Math.hypot(this.vorDerTuer(h).x - z.x, this.vorDerTuer(h).y - z.y) < 4) ?? inf.heim;
    } else if (z.art === 'haltestelle') {
      if (!inf.wartet) inf.wartet = 40 + r() * 40;   // auf den Bus warten, sonst weitergehen
    } else this.neuesZiel(id, m, inf);
  }

  // gebissen → nach der Ansteckungszeit ein Zombie an derselben Stelle
  verwandeln(id, m, inf) {
    const s = this.raum.state;
    if (!m.sichtbar) { const p = this.vorDerTuer(inf.drinIn ?? inf.heim); m.x = p.x; m.y = p.y; }
    s.menschen.delete(id); this.info.delete(id);
    const zid = this.raum.setzeZombie(m.x, m.y, '');
    this.raum.zombieInfo.get(zid).bleibt = true;
    this.zuletztVerwandelt = zid;
    this.raum.broadcast('meldung', { text: '🧟 Ein gebissener Mensch hat sich verwandelt' });
  }

  // Zombies ohne Ziel gehen auf sichtbare Menschen los und beißen bei Berührung
  zombiesWittern(zombies) {
    const s = this.raum.state, welt = this.raum.welt;
    const menschen = [...s.menschen.entries()].filter(([, m]) => m.sichtbar);
    if (!menschen.length) return;
    const minuten = this.raum.einstellungen?.()?.ansteckungMin ?? 5;
    for (const [zid, z] of zombies) {
      const info = this.raum.zombieInfo.get(zid);
      if (!info || info.ziel || info.schlaeft) continue;
      let best = null, bd = W.sichtWeite;
      for (const [mid, m] of menschen) {
        const d = Math.hypot(m.x - z.x, m.y - z.y);
        if (d > bd) continue;
        const imKegel = winkelDiff(Math.atan2(m.y - z.y, m.x - z.x), z.richtung) < W.sichtWinkel / 2;
        if ((imKegel || d < 60) && sichtfrei(welt, z.x, z.y, m.x, m.y)) { bd = d; best = [mid, m]; }
      }
      if (!best) continue;
      const [mid, m] = best;
      info.punkt = { x: m.x, y: m.y };
      if (bd < BISS_ABSTAND && !m.infiziert) {
        m.infiziert = true;
        this.info.get(mid).inf = minuten * 60;
        this.raum.broadcast('biss', { x: m.x, y: m.y });
      }
    }
  }

  // ---------- Bus: fährt auf Straßen von Haltestelle zu Haltestelle ----------
  busStarten() {
    const welt = this.raum.welt;
    // Haltestellen auf die nächste Straßenkachel legen, Reihenfolge: jeweils die nächste noch nicht besuchte
    const aufStrasse = hs => {
      const kx = Math.floor(hs.x / KACHEL), ky = Math.floor(hs.y / KACHEL);
      for (let r = 0; r < 6; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (welt.hole(kx + dx, ky + dy) === T.STRASSE) return { kx: kx + dx, ky: ky + dy };
      }
      return null;
    };
    const stopps = this.haltestellen.map(hs => ({ hs, k: aufStrasse(hs) })).filter(s => s.k);
    if (stopps.length < 2) return;
    const reihe = [stopps.shift()];
    while (stopps.length) {
      const l = reihe.at(-1);
      stopps.sort((a, b) => Math.hypot(a.k.kx - l.k.kx, a.k.ky - l.k.ky) - Math.hypot(b.k.kx - l.k.kx, b.k.ky - l.k.ky));
      reihe.push(stopps.shift());
    }
    // Wege zwischen den Haltestellen nur über Straßenkacheln
    const strecken = [];
    for (let i = 0; i < reihe.length; i++) {
      const a = reihe[i].k, b = reihe[(i + 1) % reihe.length].k;
      const weg = strassenWeg(welt, a, b);
      if (!weg) continue;
      strecken.push({ von: reihe[i], nach: reihe[(i + 1) % reihe.length], weg });
    }
    if (!strecken.length) return;
    const bus = new Bus();
    const p0 = strecken[0].weg[0];
    bus.x = p0.x; bus.y = p0.y; bus.richtung = 0; bus.haelt = true;
    this.raum.state.busse.set('linie1', bus);
    this.busInfo = { strecken, nr: 0, pos: 0, halt: 6, mitfahrer: new Map() };
  }

  busSchritt(dt) {
    const b = this.busInfo, bus = this.raum.state.busse.get('linie1');
    if (!b || !bus) return;
    const st = b.strecken[b.nr];
    if (b.halt > 0) {
      bus.haelt = true;
      b.halt -= dt;
      if (b.halt <= 0) this.einAussteigen(st.von.hs);
      return;
    }
    bus.haelt = false;
    let rest = BUS_TEMPO * dt;
    while (rest > 0) {
      const ziel = st.weg[b.pos + 1];
      if (!ziel) { b.nr = (b.nr + 1) % b.strecken.length; b.pos = 0; b.halt = 8; this.einAussteigen(b.strecken[b.nr].von.hs, true); return; }
      const d = Math.hypot(ziel.x - bus.x, ziel.y - bus.y);
      const w = Math.atan2(ziel.y - bus.y, ziel.x - bus.x);
      bus.richtung += Math.atan2(Math.sin(w - bus.richtung), Math.cos(w - bus.richtung)) * Math.min(1, dt * 6);
      if (d <= rest) { bus.x = ziel.x; bus.y = ziel.y; b.pos++; rest -= d; }
      else { bus.x += Math.cos(w) * rest; bus.y += Math.sin(w) * rest; rest = 0; }
    }
  }

  // an einer Haltestelle: Mitfahrer mit diesem Ziel steigen aus, Wartende steigen ein
  einAussteigen(hs, nurAus = false) {
    const s = this.raum.state, b = this.busInfo, r = this.raum.rnd;
    for (const [id, zielHs] of b.mitfahrer) {
      if (zielHs !== hs) continue;
      const m = s.menschen.get(id), inf = this.info.get(id);
      b.mitfahrer.delete(id);
      if (!m || !inf) continue;
      m.x = hs.x + (r() - 0.5) * 30; m.y = hs.y + (r() - 0.5) * 30; m.sichtbar = true; inf.imBus = false; this.neuesZiel(id, m, inf);
    }
    if (nurAus) return;
    for (const [id, m] of s.menschen) {
      const inf = this.info.get(id);
      if (!m.sichtbar || !inf?.wartet || inf.ziel?.hs !== hs) continue;
      const andere = this.haltestellen.filter(h => h !== hs);
      if (!andere.length) continue;
      m.sichtbar = false; inf.imBus = true; inf.wartet = 0; inf.ziel = null;
      b.mitfahrer.set(id, andere[Math.floor(r() * andere.length)]);
    }
  }
}

// Breitensuche nur über Straßenkacheln, Rückgabe: Punkte in Pixeln
function strassenWeg(welt, a, b) {
  const start = a.ky * BREITE + a.kx, ziel = b.ky * BREITE + b.kx;
  const vor = new Int32Array(BREITE * HOEHE).fill(-1);
  vor[start] = start;
  const q = [start];
  for (let k = 0; k < q.length; k++) {
    const i = q[k];
    if (i === ziel) break;
    const x = i % BREITE, y = (i - x) / BREITE;
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      if (nx < 0 || ny < 0 || nx >= BREITE || ny >= HOEHE) continue;
      const j = ny * BREITE + nx;
      if (vor[j] !== -1 || welt.hole(nx, ny) !== T.STRASSE) continue;
      vor[j] = i; q.push(j);
    }
  }
  if (vor[ziel] === -1) return null;
  const weg = [];
  for (let i = ziel; i !== start; i = vor[i]) weg.push(i);
  weg.push(start); weg.reverse();
  // jede zweite Kachel reicht, der Bus fährt die Punkte weich an
  return weg.filter((_, n) => n % 2 === 0 || n === weg.length - 1).map(i => ({ x: (i % BREITE + 0.5) * KACHEL, y: (Math.floor(i / BREITE) + 0.5) * KACHEL }));
}

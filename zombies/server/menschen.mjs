// Abschnitt 4: Menschen in der Stadt und der Ausbruch.
// Menschen gehen von zu Hause zum Einkaufen, zum Platz und zur Bushaltestelle, ein Bus fährt die Haltestellen ab.
// Zombies wittern Menschen und beißen sie; Gebissene werden nach einer einstellbaren Zeit selbst zu Zombies.
import { schema, t } from '@colyseus/schema';
import { KACHEL, BREITE, HOEHE, T, findeWeg, sichtfrei, bewege, frei, ladenArt, WERTE as W } from '../client/welt.mjs';

export const Mensch = schema({
  x: t.number(), y: t.number(), richtung: t.number(),
  aussehen: t.string(),
  infiziert: t.boolean(),
  flieht: t.boolean(),
  sichtbar: t.boolean(),       // false = im Haus oder im Bus
}, 'Mensch');


export const POLIZIST_ANTEIL = 0.06;
const RAD = 10;
const TEMPO = W.tempoGehen * 0.55, FLUCHT = W.tempoGehen * 0.95;
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
      // ca. 6 % Polizisten (Kennung 'p', der Client zeichnet sie mit dem Polizistenbild)
      m.aussehen = `${r() < POLIZIST_ANTEIL ? 'p' : r() < 0.5 ? 'm' : 'w'},${Math.floor(r() * 6)},${Math.floor(r() * 8)}`;
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
  }

  lebende() { return this.raum.state.menschen.size; }

  // Anteil der noch gesunden Menschen (für den Zombie-Nachschub aus dem Umland)
  ruheAnteil() { return this.anfangs ? [...this.raum.state.menschen.values()].filter(m => !m.infiziert).length / this.anfangs : 0; }

  neuesZiel(id, m, inf) {
    const r = this.raum.rnd, wahl = r();
    // eines der nächstgelegenen Ziele (kurze Wege: glaubwürdiger und spart Rechenzeit auf dem Pi)
    const nahe = (liste, n, pos) => {
      const sortiert = liste.map(e => { const p = pos(e); return { e, d: Math.hypot(p.x - m.x, p.y - m.y) }; }).sort((a, b) => a.d - b.d);
      return sortiert[Math.floor(r() * Math.min(n, sortiert.length))].e;
    };
    let ziel;
    if (wahl < 0.35 && this.laeden.length) { const h = nahe(this.laeden, 5, h => this.vorDerTuer(h)); ziel = { ...this.vorDerTuer(h), art: 'haus' }; }
    else if (wahl < 0.6 && this.haltestellen.length) { const hs = nahe(this.haltestellen, 3, hs => hs); ziel = { x: hs.x, y: hs.y, art: 'haltestelle', hs }; }
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
    let suchen = 1;
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
      // Zombie oder Feuer in der Nähe? Weglaufen (gebissene laufen auch, aber langsamer)
      let gefahr = null, gd = 170;
      for (const [, z] of zombies) {
        const dd = Math.hypot(z.x - m.x, z.y - m.y);
        if (dd < gd && sichtfrei(welt, m.x, m.y, z.x, z.y)) { gd = dd; gefahr = z; }
      }
      for (const f of s.feuer?.values() ?? []) { const dd = Math.hypot(f.x - m.x, f.y - m.y) - f.r; if (dd < Math.min(gd, 90)) { gd = dd; gefahr = f; } }
      if (gefahr || inf.fluchtZeit > 0) {
        m.flieht = true;
        inf.fluchtZeit = gefahr ? 0.8 : inf.fluchtZeit - d;
        // Richtung nur alle 0,4 s neu wählen (sonst zittert die Figur an Hindernissen): von 12 Richtungen die freie, die am weitesten weg führt
        inf.fluchtWahl = (inf.fluchtWahl ?? 0) - d;
        if (gefahr && (inf.fluchtWahl <= 0 || inf.fluchtW === undefined)) {
          inf.fluchtWahl = 0.4;
          const weg = Math.atan2(m.y - gefahr.y, m.x - gefahr.x);
          let best = weg, bw = -Infinity;
          for (let k = 0; k < 12; k++) {
            const w = weg + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (Math.PI / 6);
            const tx = m.x + Math.cos(w) * 40, ty = m.y + Math.sin(w) * 40;
            if (!frei(welt, tx, ty, RAD)) continue;
            const alt = inf.fluchtW ?? w;
            const wert = Math.hypot(tx - gefahr.x, ty - gefahr.y) - Math.abs(Math.atan2(Math.sin(w - alt), Math.cos(w - alt))) * 6;
            if (wert > bw) { bw = wert; best = w; }
          }
          inf.fluchtW = best;
        }
        const v = (m.infiziert ? TEMPO : FLUCHT) * d, w = inf.fluchtW ?? 0;
        bewege(welt, m, Math.cos(w) * v, Math.sin(w) * v, RAD);
        m.richtung = w;
        inf.weg = null;
        continue;
      }
      inf.fluchtW = undefined;
      m.flieht = false;
      if (!inf.ziel) this.neuesZiel(id, m, inf);
      const z = inf.ziel;
      // an der Haltestelle warten, bis der Bus kommt – oder irgendwann weitergehen
      if (inf.wartet) { inf.wartet -= d; if (inf.wartet <= 0) { inf.wartet = 0; this.neuesZiel(id, m, inf); } continue; }
      const dz = Math.hypot(z.x - m.x, z.y - m.y);
      if (dz < 18) { this.angekommen(id, m, inf); continue; }
      if (!inf.weg) {
        if (suchen <= 0) continue;   // höchstens eine Wegsuche je Takt, die anderen warten einen Augenblick
        suchen--;
        inf.weg = findeWeg(welt, m.x, m.y, z.x, z.y, RAD, 30000);
        if (!inf.weg) { this.neuesZiel(id, m, inf); continue; }
      }
      while (inf.weg.length > 1 && Math.hypot(inf.weg[0].x - m.x, inf.weg[0].y - m.y) < 10) inf.weg.shift();
      const wp = inf.weg[0];
      const w = Math.atan2(wp.y - m.y, wp.x - m.x), v = TEMPO * d;
      const x0 = m.x, y0 = m.y;
      bewege(welt, m, Math.cos(w) * v, Math.sin(w) * v, RAD);
      m.richtung = w;
      // nicht ineinanderlaufen: von zu nahen Nachbarn wegschieben
      for (const [oid, o] of s.menschen) {
        if (oid === id || !o.sichtbar) continue;
        const dd = Math.hypot(o.x - m.x, o.y - m.y);
        if (dd > 0.01 && dd < 20) bewege(welt, m, (m.x - o.x) / dd * (20 - dd) * 0.3, (m.y - o.y) / dd * (20 - dd) * 0.3, RAD);
      }
      inf.steckt = Math.hypot(m.x - x0, m.y - y0) < v * 0.2 ? inf.steckt + d : 0;
      if (inf.steckt > 2.5) { inf.weg = null; if (inf.steckt > 6) this.neuesZiel(id, m, inf); }
    }
    this.zombiesWittern(zombies);
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
    const chance = this.raum.einstellungen?.()?.bissChance ?? 1;
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
        // einmal pro Sekunde ein Bissversuch; die Einstellung „Biss-Chance“ entscheidet, ob er trifft
        if ((info.bissVersuch ?? -1) > this.takt) continue;
        info.bissVersuch = this.takt + 1;
        if (this.raum.rnd() >= chance) continue;
        m.infiziert = true;
        this.info.get(mid).inf = minuten * 60;
        this.raum.broadcast('menschGebissen', { x: m.x, y: m.y });
      }
    }
  }

  // Bus (verkehr.mjs) hält an einer Haltestelle: Mitfahrer mit diesem Ziel steigen aus, Wartende steigen ein
  busHalt(businfo, stopp) {
    const s = this.raum.state, r = this.raum.rnd;
    const gleich = (a, b) => a && b && Math.abs(a.x - b.x) < 1 && Math.abs(a.y - b.y) < 1;
    businfo.mitfahrer ??= new Map();
    for (const [id, zielHs] of businfo.mitfahrer) {
      if (!gleich(zielHs, stopp)) continue;
      businfo.mitfahrer.delete(id);
      const m = s.menschen.get(id), inf = this.info.get(id);
      if (!m || !inf) continue;
      m.x = stopp.x + (r() - 0.5) * 30; m.y = stopp.y + (r() - 0.5) * 30; m.sichtbar = true; inf.imBus = false; this.neuesZiel(id, m, inf);
    }
    for (const [id, m] of s.menschen) {
      const inf = this.info.get(id);
      if (!m.sichtbar || !inf?.wartet || !gleich(inf.ziel?.hs, stopp)) continue;
      const andere = this.haltestellen.filter(h => !gleich(h, stopp));
      if (!andere.length) continue;
      m.sichtbar = false; inf.imBus = true; inf.wartet = 0; inf.ziel = null;
      businfo.mitfahrer.set(id, andere[Math.floor(r() * andere.length)]);
    }
  }
}

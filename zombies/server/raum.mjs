// Spielraum: der Server entscheidet über Bewegung, Zombies, Treffer und Aufhelfen.
import { Room } from '@colyseus/core';
import { schema, t } from '@colyseus/schema';
import {
  KACHEL, BREITE, HOEHE, T, WERTE as W, baueWelt, bewege, frei, sichtfrei, drinnen,
  bewaffnetSoll, zombieSoll, zufall,
} from '../client/welt.mjs';

export const Spieler = schema({
  name: t.string(),
  x: t.number(), y: t.number(),
  richtung: t.number(),
  hp: t.number(),
  unten: t.boolean(),
  hilfe: t.number(),        // Fortschritt beim Aufhelfen 0..1
  waffe: t.string(),        // "pistole" oder ""
  munition: t.uint8(),
  farbe: t.uint8(),
  schleicht: t.boolean(),
  verbunden: t.boolean(),
  besiegt: t.uint16(),
}, 'Spieler');

export const Zombie = schema({
  x: t.number(), y: t.number(),
  richtung: t.number(),
  jagt: t.boolean(),
  hp: t.uint8(),
}, 'Zombie');

export const Zustand = schema({
  seed: t.number(),
  phase: t.string(),        // "spiel" | "erwischt"
  zeit: t.number(),         // Sekunden seit Rundenstart
  besiegt: t.uint16(),
  spieler: t.map(Spieler),
  zombies: t.map(Zombie),
}, 'Zustand');

const TICK = 50; // ms → 20 Updates pro Sekunde
const ZOMBIE_HP = 100;
const PISTOLE_SCHADEN = 34, PISTOLE_PAUSE = 0.45;
const STOSS_SCHADEN = 20, STOSS_PAUSE = 0.7, STOSS_WEG = 34;
const BISS_PRO_SEK = 14;
const START_MUNITION = 40;

function winkelDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return Math.abs(d);
}

export function sauberName(n) {
  const s = String(n ?? '').replace(/[^\p{L}\p{N} ._-]/gu, '').trim().slice(0, 16);
  return s || 'Unbekannt';
}

export class SpielRaum extends Room {
  maxClients = 10;
  patchRate = TICK;

  onCreate(optionen = {}) {
    this.state = new Zustand();
    this.state.seed = Number.isInteger(optionen.seed) ? optionen.seed : Math.floor(Math.random() * 2 ** 31);
    this.welt = baueWelt(this.state.seed);
    this.rnd = zufall(this.state.seed ^ 0x5bd1e995);
    this.eingaben = new Map();   // sessionId → {dx, dy, s}
    this.pausen = new Map();     // sessionId → Sekunden bis zum nächsten Angriff
    this.zombieInfo = new Map(); // id → {ziel, punkt, wechsel, verloren}
    this.naechsteZombieId = 1;
    this.feldZeit = 0;
    this.nachspawn = 0;
    this.erwischtSeit = 0;
    this.state.phase = 'spiel';
    this.state.zeit = 0;
    this.state.besiegt = 0;
    this.zombieFaktor = optionen.zombieFaktor ?? 1;

    this.onMessage('eingabe', (client, m) => {
      if (!m || typeof m !== 'object') return;
      let dx = Number(m.dx) || 0, dy = Number(m.dy) || 0;
      const l = Math.hypot(dx, dy);
      if (l > 1) { dx /= l; dy /= l; }
      this.eingaben.set(client.sessionId, { dx, dy, s: !!m.s });
    });
    this.onMessage('ping', (client, m) => client.send('pong', m));

    this.setSimulationInterval(dt => this.schritt(dt / 1000), TICK);
  }

  onJoin(client, optionen = {}) {
    const p = new Spieler();
    p.name = sauberName(optionen.name);
    const n = this.state.spieler.size;
    const winkel = n * 2.4;
    p.x = this.welt.start.x + Math.cos(winkel) * 40;
    p.y = this.welt.start.y + Math.sin(winkel) * 40;
    p.hp = 100; p.unten = false; p.hilfe = 0; p.richtung = 0;
    p.farbe = n % 10; p.verbunden = true; p.besiegt = 0;
    const bewaffnet = [...this.state.spieler.values()].filter(s => s.waffe).length;
    if (bewaffnet < bewaffnetSoll(n + 1)) { p.waffe = 'pistole'; p.munition = START_MUNITION; }
    else { p.waffe = ''; p.munition = 0; }
    this.state.spieler.set(client.sessionId, p);
    this.pausen.set(client.sessionId, 0);
    this.broadcast('meldung', { text: `${p.name} ist dabei` }, { except: client });
  }

  onDrop(client) {
    // Verbindung weg: Figur bleibt 2 Minuten stehen und wartet
    const p = this.state.spieler.get(client.sessionId);
    if (p) p.verbunden = false;
    this.eingaben.delete(client.sessionId);
    this.allowReconnection(client, 120);
  }

  onReconnect(client) {
    const p = this.state.spieler.get(client.sessionId);
    if (p) p.verbunden = true;
  }

  onLeave(client) {
    const p = this.state.spieler.get(client.sessionId);
    if (p) this.broadcast('meldung', { text: `${p.name} hat das Spiel verlassen` });
    this.state.spieler.delete(client.sessionId);
    this.eingaben.delete(client.sessionId);
    this.pausen.delete(client.sessionId);
  }

  // ---------- Simulation ----------

  schritt(dt) {
    const s = this.state;
    if (s.spieler.size === 0) return;
    if (s.phase === 'erwischt') {
      this.erwischtSeit += dt;
      if (this.erwischtSeit > 6) this.neueRunde();
      return;
    }
    s.zeit += dt;
    this.feldZeit -= dt;
    if (this.feldZeit <= 0) { this.baueFeld(); this.feldZeit = 0.4; }

    for (const [id, p] of s.spieler) this.spielerSchritt(id, p, dt);
    for (const [id, z] of s.zombies) this.zombieSchritt(id, z, dt);
    this.aufhelfen(dt);
    this.zombiesAuffuellen(dt);

    const stehend = [...s.spieler.values()].filter(p => !p.unten);
    if (stehend.length === 0) {
      s.phase = 'erwischt';
      this.erwischtSeit = 0;
      this.broadcast('meldung', { text: 'Alle erwischt! Neue Runde in 6 Sekunden …', lang: true });
    }
  }

  spielerSchritt(id, p, dt) {
    if (p.unten) return;
    const e = this.eingaben.get(id) ?? { dx: 0, dy: 0, s: false };
    const laenge = Math.hypot(e.dx, e.dy);
    p.schleicht = e.s || (laenge > 0 && laenge < 0.55);
    const tempo = p.schleicht ? W.tempoSchleichen : W.tempoGehen;
    if (laenge > 0.05) {
      const f = Math.min(1, laenge / (p.schleicht ? 0.55 : 1)) * tempo * dt;
      bewege(this.welt, p, e.dx / laenge * f, e.dy / laenge * f, W.spielerRadius);
      p.richtung = Math.atan2(e.dy, e.dx);
      // Rennen ist laut
      if (!p.schleicht) this.laerm(p.x, p.y, W.hoerweiteRennen, false);
    }
    // automatischer Angriff
    let pause = (this.pausen.get(id) ?? 0) - dt;
    if (pause <= 0) {
      const mitPistole = p.waffe === 'pistole' && p.munition > 0;
      const reichweite = mitPistole ? W.pistoleReichweite : W.nahkampfReichweite;
      const ziel = this.naechsterZombie(p.x, p.y, reichweite);
      if (ziel) {
        const [zid, z] = ziel;
        if (mitPistole) {
          p.munition--;
          this.broadcast('schuss', { x1: p.x, y1: p.y, x2: z.x, y2: z.y });
          this.laerm(p.x, p.y, W.hoerweiteSchuss, true);
          this.schaden(zid, z, PISTOLE_SCHADEN, p);
          pause = PISTOLE_PAUSE;
        } else {
          const w = Math.atan2(z.y - p.y, z.x - p.x);
          bewege(this.welt, z, Math.cos(w) * STOSS_WEG, Math.sin(w) * STOSS_WEG, W.zombieRadius);
          this.broadcast('stoss', { x: p.x, y: p.y, w });
          this.schaden(zid, z, STOSS_SCHADEN, p);
          pause = STOSS_PAUSE;
        }
        p.richtung = Math.atan2(z.y - p.y, z.x - p.x);
      } else pause = 0;
    }
    this.pausen.set(id, pause);
  }

  naechsterZombie(x, y, reichweite) {
    let best = null, bd = reichweite;
    for (const [id, z] of this.state.zombies) {
      const d = Math.hypot(z.x - x, z.y - y);
      if (d < bd && sichtfrei(this.welt, x, y, z.x, z.y)) { bd = d; best = [id, z]; }
    }
    return best;
  }

  schaden(id, z, menge, von) {
    z.hp = Math.max(0, z.hp - menge);
    const info = this.zombieInfo.get(id);
    if (info && !info.ziel) { info.punkt = { x: von.x, y: von.y }; }
    if (z.hp === 0) {
      this.state.zombies.delete(id);
      this.zombieInfo.delete(id);
      this.state.besiegt++;
      von.besiegt++;
      this.broadcast('weg', { x: z.x, y: z.y });
    }
  }

  laerm(x, y, weite, schuss) {
    for (const [id, z] of this.state.zombies) {
      if (Math.hypot(z.x - x, z.y - y) > weite) continue;
      const info = this.zombieInfo.get(id);
      if (!info || info.ziel) continue;
      // Schüsse hört man auch durch Wände, Schritte nur im Freien
      if (!schuss && !sichtfrei(this.welt, z.x, z.y, x, y)) continue;
      info.punkt = { x, y };
    }
  }

  // Wegfeld: Abstand jeder Kachel zum nächsten stehenden Spieler (Breitensuche)
  baueFeld() {
    const feld = new Int16Array(BREITE * HOEHE).fill(-1);
    const q = [];
    for (const p of this.state.spieler.values()) {
      if (p.unten) continue;
      const i = Math.floor(p.y / KACHEL) * BREITE + Math.floor(p.x / KACHEL);
      if (feld[i] === -1) { feld[i] = 0; q.push(i); }
    }
    for (let k = 0; k < q.length; k++) {
      const i = q[k], x = i % BREITE, y = (i - x) / BREITE;
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
        if (nx < 0 || ny < 0 || nx >= BREITE || ny >= HOEHE) continue;
        const j = ny * BREITE + nx;
        if (feld[j] !== -1) continue;
        const t = this.welt.hole(nx, ny);
        if (t === T.WAND || t === T.WASSER || t === T.BAUM || t === T.ZAUN || t === T.TOR) continue;
        feld[j] = feld[i] + 1;
        q.push(j);
      }
    }
    this.feld = feld;
  }

  feldRichtung(x, y) {
    if (!this.feld) return null;
    const kx = Math.floor(x / KACHEL), ky = Math.floor(y / KACHEL);
    const hier = this.feld[ky * BREITE + kx];
    let best = null, bw = hier < 0 ? Infinity : hier;
    for (const [nx, ny] of [[kx + 1, ky], [kx - 1, ky], [kx, ky + 1], [kx, ky - 1]]) {
      if (nx < 0 || ny < 0 || nx >= BREITE || ny >= HOEHE) continue;
      const w = this.feld[ny * BREITE + nx];
      if (w >= 0 && w < bw) { bw = w; best = [nx, ny]; }
    }
    if (!best) return null;
    return Math.atan2((best[1] + 0.5) * KACHEL - y, (best[0] + 0.5) * KACHEL - x);
  }

  zombieSchritt(id, z, dt) {
    const info = this.zombieInfo.get(id);
    // Sehen: Kegel in Blickrichtung, schleichende Spieler erst später
    if (!info.ziel) {
      for (const [sid, p] of this.state.spieler) {
        if (p.unten) continue;
        const d = Math.hypot(p.x - z.x, p.y - z.y);
        const weite = p.schleicht ? W.sichtWeiteSchleichen : W.sichtWeite;
        const imKegel = winkelDiff(Math.atan2(p.y - z.y, p.x - z.x), z.richtung) < W.sichtWinkel / 2;
        if ((d < 28 || (d < weite && imKegel)) && sichtfrei(this.welt, z.x, z.y, p.x, p.y)) {
          info.ziel = sid; info.verloren = 0; info.punkt = null;
          this.broadcast('entdeckt', { x: z.x, y: z.y });
          break;
        }
      }
    }
    let ziel = info.ziel ? this.state.spieler.get(info.ziel) : null;
    if (ziel && ziel.unten) { info.ziel = null; ziel = null; }
    z.jagt = !!ziel;

    if (ziel) {
      const d = Math.hypot(ziel.x - z.x, ziel.y - z.y);
      const sieht = d < W.sichtWeite * 1.6 && sichtfrei(this.welt, z.x, z.y, ziel.x, ziel.y);
      info.verloren = sieht ? 0 : info.verloren + dt;
      if (info.verloren > 6 || d > W.sichtWeite * 3) {
        info.ziel = null; info.punkt = { x: ziel.x, y: ziel.y }; z.jagt = false;
      } else {
        const w = sieht ? Math.atan2(ziel.y - z.y, ziel.x - z.x) : (this.feldRichtung(z.x, z.y) ?? z.richtung);
        z.richtung = w;
        if (d > W.spielerRadius + W.zombieRadius - 2) {
          this.zombieGehen(z, w, W.zombieTempoJagen * dt);
        }
        if (d < W.spielerRadius + W.zombieRadius + 6) {
          ziel.hp = Math.max(0, ziel.hp - BISS_PRO_SEK * dt);
          if (ziel.hp <= 0) {
            ziel.unten = true; ziel.hilfe = 0;
            this.broadcast('meldung', { text: `${ziel.name} liegt am Boden – hilf ihm auf!`, lang: true });
          }
        }
        return;
      }
    }

    if (info.punkt) {
      // Geräusch nachgehen
      const d = Math.hypot(info.punkt.x - z.x, info.punkt.y - z.y);
      if (d < 16) { info.punkt = null; info.wechsel = 0; }
      else {
        z.richtung = Math.atan2(info.punkt.y - z.y, info.punkt.x - z.x);
        if (!this.zombieGehen(z, z.richtung, W.zombieTempoJagen * 0.7 * dt)) info.punkt = null;
      }
      return;
    }

    // Wandern
    info.wechsel -= dt;
    if (info.wechsel <= 0) {
      info.wechsel = 2 + this.rnd() * 4;
      info.steht = this.rnd() < 0.4;
      if (!info.steht) z.richtung = this.rnd() * Math.PI * 2;
    }
    if (!info.steht && !this.zombieGehen(z, z.richtung, W.zombieTempoWandern * dt)) {
      z.richtung += Math.PI * (0.5 + this.rnd());
    }
  }

  zombieGehen(z, w, weg) {
    const x0 = z.x, y0 = z.y;
    bewege(this.welt, z, Math.cos(w) * weg, Math.sin(w) * weg, W.zombieRadius);
    // Abstand zu anderen Zombies halten
    for (const o of this.state.zombies.values()) {
      if (o === z) continue;
      const d = Math.hypot(o.x - z.x, o.y - z.y);
      if (d > 0 && d < W.zombieRadius * 2) {
        const f = (W.zombieRadius * 2 - d) / 2;
        bewege(this.welt, z, (z.x - o.x) / d * f, (z.y - o.y) / d * f, W.zombieRadius);
      }
    }
    return Math.hypot(z.x - x0, z.y - y0) > weg * 0.3;
  }

  aufhelfen(dt) {
    const alle = [...this.state.spieler.entries()];
    for (const [, p] of alle) {
      if (!p.unten) continue;
      const helfer = alle.find(([hid, h]) => {
        if (h.unten || h === p) return false;
        const e = this.eingaben.get(hid);
        const steht = !e || Math.hypot(e.dx, e.dy) < 0.05;
        return steht && Math.hypot(h.x - p.x, h.y - p.y) < W.aufhelfenAbstand;
      });
      if (helfer) {
        p.hilfe = Math.min(1, p.hilfe + dt / W.aufhelfenDauer);
        if (p.hilfe >= 1) {
          p.unten = false; p.hp = 40; p.hilfe = 0;
          this.broadcast('meldung', { text: `${helfer[1].name} hat ${p.name} aufgeholfen` });
        }
      } else p.hilfe = Math.max(0, p.hilfe - dt / 6);
    }
  }

  zombiesAuffuellen(dt) {
    this.nachspawn -= dt;
    const soll = Math.round(zombieSoll(this.state.spieler.size) * this.zombieFaktor);
    if (this.state.zombies.size >= soll || this.nachspawn > 0) return;
    // beim Rundenstart viele auf einmal, danach langsam nachrücken
    const anzahl = this.state.zeit < 1 ? soll - this.state.zombies.size : 1;
    for (let i = 0; i < anzahl; i++) this.neuerZombie(this.state.zeit < 1 ? 380 : 520);
    this.nachspawn = 2.5;
  }

  neuerZombie(abstand) {
    for (let versuch = 0; versuch < 60; versuch++) {
      const x = (1 + this.rnd() * (BREITE - 8)) * KACHEL, y = (1 + this.rnd() * (HOEHE - 2)) * KACHEL;
      if (!frei(this.welt, x, y, W.zombieRadius + 2)) continue;
      const nah = [...this.state.spieler.values()].some(p => Math.hypot(p.x - x, p.y - y) < abstand);
      if (nah) continue;
      // in Häusern lauern auch welche, aber seltener
      if (drinnen(this.welt, x, y) && this.rnd() < 0.6) continue;
      const z = new Zombie();
      z.x = x; z.y = y; z.hp = ZOMBIE_HP; z.richtung = this.rnd() * Math.PI * 2; z.jagt = false;
      const id = 'z' + (this.naechsteZombieId++);
      this.state.zombies.set(id, z);
      this.zombieInfo.set(id, { ziel: null, punkt: null, wechsel: 0, verloren: 0, steht: false });
      return;
    }
  }

  neueRunde() {
    const s = this.state;
    s.zombies.clear();
    this.zombieInfo.clear();
    s.zeit = 0; s.besiegt = 0; s.phase = 'spiel';
    let n = 0;
    for (const p of s.spieler.values()) {
      const w = n++ * 2.4;
      p.x = this.welt.start.x + Math.cos(w) * 40; p.y = this.welt.start.y + Math.sin(w) * 40;
      p.hp = 100; p.unten = false; p.hilfe = 0; p.besiegt = 0;
      if (p.waffe) p.munition = START_MUNITION;
    }
    this.nachspawn = 0;
    this.broadcast('meldung', { text: 'Neue Runde – haltet zusammen!', lang: true });
  }
}

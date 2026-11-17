// Spielraum: der Server entscheidet über Bewegung, Zombies, Treffer, Gegenstände und Safe Rooms.
import crypto from 'node:crypto';
import { holeFragen } from './fragenquelle.mjs';
import { mischeAntworten, waehleFrage } from './raetsel.mjs';
import { Room, ServerError } from '@colyseus/core';
import { schema, t } from '@colyseus/schema';
import {
  KACHEL, BREITE, HOEHE, T, WERTE as W, baueWelt, bewege, frei, sichtfrei, drinnen,
  bewaffnetSoll, zombieSoll, zufall, safeRoomAn, WELT_VERSION,
  DINGE, RUCKSACK_PLAETZE, KISTE_PLAETZE, BEUTE, MUNITION_PRO_FUND, AKTION_ABSTAND,
  INFEKTION_DAUER, ZOMBIE_ZEIT,
} from '../client/welt.mjs';

export const Spieler = schema({
  name: t.string(),
  x: t.number(), y: t.number(),
  richtung: t.number(),
  hp: t.number(),
  durst: t.number(),        // 100 = satt, 0 = verdurstet
  hunger: t.number(),
  unten: t.boolean(),
  hilfe: t.number(),        // Fortschritt beim Aufhelfen 0..1
  waffe: t.string(),        // "pistole", "schlaeger" oder ""
  munition: t.uint8(),
  rucksack: t.array("string"),
  farbe: t.uint8(),
  schleicht: t.boolean(),
  verbunden: t.boolean(),
  sicher: t.string(),       // Id des Safe Rooms, in dem man steht, sonst ""
  aktion: t.string(),       // "durchsuchen" | "barrikade" | ""
  fortschritt: t.number(),
  besiegt: t.uint16(),
  infektion: t.number(),    // Sekunden bis zur Verwandlung, 0 = gesund
  zombie: t.number(),       // Sekunden, die man noch Zombie ist, 0 = Mensch
}, 'Spieler');

export const Zombie = schema({
  x: t.number(), y: t.number(),
  richtung: t.number(),
  jagt: t.boolean(),
  hp: t.uint8(),
}, 'Zombie');

export const Behaelter = schema({ rest: t.uint8() }, 'Behaelter');
export const Safe = schema({ barrikade: t.number(), kiste: t.array("string") }, 'Safe');

export const Zustand = schema({
  seed: t.number(),
  phase: t.string(),        // "spiel" | "erwischt"
  zeit: t.number(),         // Spielzeit in Sekunden (wird gespeichert)
  besiegt: t.uint16(),
  torGeloest: t.uint8(),    // richtig beantwortete Rätsel am Tor (3 = offen)
  spieler: t.map(Spieler),
  zombies: t.map(Zombie),
  behaelter: t.map(Behaelter),   // nur schon durchsuchte
  safes: t.map(Safe),
}, 'Zustand');

const TICK = 50; // ms → 20 Updates pro Sekunde
const ZOMBIE_HP = 100;
const PISTOLE_SCHADEN = 34, PISTOLE_PAUSE = 0.45;
const SCHLAEGER_SCHADEN = 40, SCHLAEGER_PAUSE = 0.6, SCHLAEGER_REICHWEITE = 42;
const STOSS_SCHADEN = 20, STOSS_PAUSE = 0.7, STOSS_WEG = 34;
const BISS_PRO_SEK = 14;
const BISS_CHANCE = 0.12;   // pro Sekunde Kontakt: Wahrscheinlichkeit für einen infizierenden Biss
const SPRITZE_ABSTAND = 50;
const START_MUNITION = 24;
const DURST_DAUER = 3600, HUNGER_DAUER = 5400;   // Sekunden von voll bis leer
const SPEICHER_TAKT = 30;
const ID_MUSTER = /^[a-f0-9]{32}$/;
export const TOR_RAETSEL = 3;
const TOR_ABSTAND = 70;

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

  // vom Server beim Start gesetzt (nicht über Client-Optionen änderbar)
  static einstellungen = { zugangscode: '', zombieFaktor: 1 };
  static speicher = null;

  // läuft bei der Anfrage zum Beitreten: Zugangscode prüfen.
  // Wer über die HA-Seitenleiste (Ingress) kommt, ist schon bei HA angemeldet.
  static async onAuth(_token, optionen = {}, kontext = {}) {
    const code = SpielRaum.einstellungen.zugangscode;
    if (!code) return true;
    const ingress = kontext.headers?.get?.('x-ingress-path');
    if (ingress) return true;
    if (String(optionen.code ?? '').trim() !== code) throw new ServerError(403, 'Falscher Zugangscode');
    return true;
  }

  onCreate(optionen = {}) {
    this.speicher = SpielRaum.speicher;
    const stand = this.speicher?.ladeWelt() ?? null;
    this.state = new Zustand();
    this.state.seed = Number.isInteger(optionen.seed) ? optionen.seed
      : stand?.seed ?? Math.floor(Math.random() * 2 ** 31);
    this.welt = baueWelt(this.state.seed);
    this.rnd = zufall((this.state.seed ^ 0x5bd1e995) + Date.now() % 100000);
    this.state.phase = 'spiel';
    this.state.zeit = stand?.zeit ?? 0;
    this.state.besiegt = stand?.besiegt ?? 0;
    this.state.torGeloest = Math.min(TOR_RAETSEL, Number(stand?.torGeloest) || 0);
    this.gestellt = new Set(stand?.gestellt ?? []);
    this.offeneRaetsel = new Map();   // sessionId → { id, richtigIndex, seite, richtig, bis }

    this.inhalte = new Map();     // Behälter-Id → verbliebene Gegenstände
    for (const s of this.welt.safeRooms) {
      const safe = new Safe(); safe.barrikade = 0;
      this.state.safes.set(s.id, safe);
    }
    const passt = stand && stand.version === WELT_VERSION && stand.seed === this.state.seed;
    if (passt) {
      for (const [id, inhalt] of Object.entries(stand.behaelter ?? {})) this.setzeInhalt(id, inhalt);
      for (const [id, s] of Object.entries(stand.safes ?? {})) {
        const safe = this.state.safes.get(id);
        if (!safe) continue;
        safe.barrikade = Math.max(0, Math.min(100, Number(s.barrikade) || 0));
        for (const d of (s.kiste ?? []).slice(0, KISTE_PLAETZE)) if (DINGE[d]) safe.kiste.push(d);
      }
    }

    this.extra = new Map();       // sessionId → { spielerId, letzterSafe, pause, eingabe, aktionZiel }
    this.wiederkehr = new Map();  // sessionId → Deferred der erlaubten Wiederverbindung
    this.zombieInfo = new Map();
    this.naechsteZombieId = 1;
    this.feldZeit = 0;
    this.nachspawn = 0;
    this.ersteWelle = true;
    this.erwischtSeit = 0;
    this.speicherUhr = SPEICHER_TAKT;
    this.zombieFaktor = SpielRaum.einstellungen.zombieFaktor;

    this.onMessage('eingabe', (client, m) => {
      if (!m || typeof m !== 'object') return;
      let dx = Number(m.dx) || 0, dy = Number(m.dy) || 0;
      const l = Math.hypot(dx, dy);
      if (l > 1) { dx /= l; dy /= l; }
      const x = this.extra.get(client.sessionId);
      if (x) x.eingabe = { dx, dy, s: !!m.s };
    });
    this.onMessage('aktion', client => this.starteAktion(client));
    this.onMessage('benutze', (client, m) => this.benutze(client, m));
    this.onMessage('wegwerfen', (client, m) => this.wegwerfen(client, m));
    this.onMessage('kiste', (client, m) => this.kiste(client, m));
    this.onMessage('ausruhen', client => this.ausruhen(client));
    this.onMessage('antwort', (client, m) => this.antwort(client, m));
    this.onMessage('ping', (client, m) => client.send('pong', m));

    this.setSimulationInterval(dt => this.schritt(dt / 1000), TICK);
  }

  setzeInhalt(id, inhalt) {
    const liste = (inhalt ?? []).filter(d => DINGE[d]);
    this.inhalte.set(id, liste);
    let b = this.state.behaelter.get(id);
    if (!b) { b = new Behaelter(); this.state.behaelter.set(id, b); }
    b.rest = liste.length;
  }

  // ---------- Beitreten, Verlassen, Speichern ----------

  onJoin(client, optionen = {}) {
    const spielerId = ID_MUSTER.test(String(optionen.spielerId ?? '')) ? optionen.spielerId : crypto.randomBytes(16).toString('hex');
    const name = sauberName(optionen.name);

    // dieselbe Person schon da? Verbunden → ablehnen, weg → Figur übernehmen
    for (const [sid, x] of this.extra) {
      if (x.spielerId !== spielerId) continue;
      const alt = this.state.spieler.get(sid);
      if (alt?.verbunden) throw new ServerError(409, 'Du spielst schon in einem anderen Fenster');
      this.wiederkehr.get(sid)?.reject?.(new Error('übernommen'));
      this.wiederkehr.delete(sid);
      this.state.spieler.delete(sid);
      this.extra.delete(sid);
      alt.name = name; alt.verbunden = true;
      this.state.spieler.set(client.sessionId, alt);
      this.extra.set(client.sessionId, { ...x, eingabe: { dx: 0, dy: 0, s: false } });
      return;
    }

    const p = new Spieler();
    p.name = name;
    p.farbe = this.freieFarbe();
    p.verbunden = true; p.unten = false; p.hilfe = 0; p.richtung = 0;
    p.schleicht = false; p.aktion = ''; p.fortschritt = 0; p.sicher = ''; p.infektion = 0; p.zombie = 0;
    const extra = { spielerId, letzterSafe: '', pause: 0, eingabe: { dx: 0, dy: 0, s: false }, aktionZiel: null };
    const gespeichert = this.speicher?.ladeSpieler(spielerId);
    if (gespeichert) {
      p.hp = Math.max(25, Math.min(100, Number(gespeichert.hp) || 100));
      p.durst = Math.max(20, Math.min(100, Number(gespeichert.durst) || 100));
      p.hunger = Math.max(20, Math.min(100, Number(gespeichert.hunger) || 100));
      p.waffe = DINGE[gespeichert.waffe]?.waffe ? gespeichert.waffe : '';
      p.munition = Math.max(0, Math.min(99, Number(gespeichert.munition) || 0));
      p.besiegt = Math.max(0, Math.min(65535, Number(gespeichert.besiegt) || 0));
      p.infektion = Math.max(0, Math.min(INFEKTION_DAUER, Number(gespeichert.infektion) || 0));
      for (const d of (gespeichert.rucksack ?? []).slice(0, RUCKSACK_PLAETZE)) if (DINGE[d]) p.rucksack.push(d);
      extra.letzterSafe = gespeichert.letzterSafe ?? '';
      const ort = gespeichert.draussen || !Number.isFinite(gespeichert.x)
        ? this.safeFuer(extra.letzterSafe, gespeichert.x, gespeichert.y)?.innen
        : { x: gespeichert.x, y: gespeichert.y };
      const pos = this.freierPlatz(ort ?? this.welt.start);
      p.x = pos.x; p.y = pos.y;
    } else {
      p.hp = 100; p.durst = 100; p.hunger = 100; p.besiegt = 0;
      const pos = this.freierPlatz(this.welt.start, this.state.spieler.size);
      p.x = pos.x; p.y = pos.y;
      const bewaffnet = [...this.state.spieler.values()].filter(s => s.waffe === 'pistole').length;
      if (bewaffnet < bewaffnetSoll(this.state.spieler.size + 1)) { p.waffe = 'pistole'; p.munition = START_MUNITION; }
      else { p.waffe = ''; p.munition = 0; }
      p.rucksack.push('wasser');
    }
    this.state.spieler.set(client.sessionId, p);
    this.extra.set(client.sessionId, extra);
    this.speichereSpieler(client.sessionId);
    this.broadcast('meldung', { text: `${p.name} ist dabei` }, { except: client });
  }

  freieFarbe() {
    const belegt = new Set([...this.state.spieler.values()].map(s => s.farbe));
    for (let i = 0; i < 10; i++) if (!belegt.has(i)) return i;
    return Math.floor(this.rnd() * 10);
  }

  // freier Platz in der Nähe eines Punkts (für mehrere Spieler leicht versetzt)
  freierPlatz(ort, n = 0) {
    for (let ring = 0; ring < 8; ring++) {
      for (let i = 0; i < 8; i++) {
        const w = (n + i) * 2.4, d = ring === 0 && i === 0 && n === 0 ? 0 : 18 + ring * 14;
        const x = ort.x + Math.cos(w) * d, y = ort.y + Math.sin(w) * d;
        if (frei(this.welt, x, y, W.spielerRadius)) return { x, y };
      }
    }
    return { ...this.welt.start };
  }

  safeFuer(id, x, y) {
    const s = this.welt.safeRooms.find(r => r.id === id);
    if (s) return s;
    let best = this.welt.safeRooms[0], bd = Infinity;
    for (const r of this.welt.safeRooms) {
      const d = Number.isFinite(x) ? Math.hypot(r.innen.x - x, r.innen.y - y) : 0;
      if (d < bd) { bd = d; best = r; }
    }
    return best;
  }

  onDrop(client) {
    // Verbindung weg: Figur bleibt 2 Minuten stehen und wartet
    const p = this.state.spieler.get(client.sessionId);
    if (!p) return;   // Beitritt wurde abgelehnt – nichts zu halten
    p.verbunden = false; p.aktion = '';
    const x = this.extra.get(client.sessionId);
    if (x) x.eingabe = { dx: 0, dy: 0, s: false };
    const zusage = this.allowReconnection(client, 120);
    // läuft die Zeit ab oder wird die Figur übernommen, ist das kein Fehler
    zusage?.catch?.(() => {});
    zusage?.promise?.catch?.(() => {});
    this.wiederkehr.set(client.sessionId, zusage);
  }

  onReconnect(client) {
    this.wiederkehr.delete(client.sessionId);
    const p = this.state.spieler.get(client.sessionId);
    if (p) p.verbunden = true;
  }

  onLeave(client) {
    this.wiederkehr.delete(client.sessionId);
    this.offeneRaetsel.delete(client.sessionId);
    const p = this.state.spieler.get(client.sessionId);
    if (!p) return;
    this.speichereSpieler(client.sessionId);
    const text = p.sicher ? `${p.name} ruht sich aus` : `${p.name} hat sich versteckt`;
    this.broadcast('meldung', { text });
    this.state.spieler.delete(client.sessionId);
    this.extra.delete(client.sessionId);
  }

  onDispose() { this.speichereAlles(); }

  speichereSpieler(sid) {
    const p = this.state.spieler.get(sid), x = this.extra.get(sid);
    if (!p || !x || !this.speicher) return;
    this.speicher.speichereSpieler(x.spielerId, p.name, {
      x: p.x, y: p.y, hp: p.unten ? 25 : p.hp, durst: p.durst, hunger: p.hunger,
      waffe: p.waffe, munition: p.munition, rucksack: [...p.rucksack], besiegt: p.besiegt,
      letzterSafe: x.letzterSafe, draussen: !p.sicher || p.zombie > 0, infektion: p.zombie > 0 ? 0 : p.infektion,
    });
  }

  speichereWelt() {
    if (!this.speicher) return;
    const behaelter = {}, safes = {};
    for (const [id, inhalt] of this.inhalte) behaelter[id] = inhalt;
    for (const [id, s] of this.state.safes) safes[id] = { barrikade: Math.round(s.barrikade), kiste: [...s.kiste] };
    this.speicher.speichereWelt({
      version: WELT_VERSION, seed: this.state.seed, zeit: this.state.zeit, besiegt: this.state.besiegt, behaelter, safes,
      torGeloest: this.state.torGeloest, gestellt: [...this.gestellt].slice(-500),
    });
  }

  speichereAlles() {
    if (!this.speicher) return;
    try {
      this.speicher.transaktion(() => {
        this.speichereWelt();
        for (const sid of this.state.spieler.keys()) this.speichereSpieler(sid);
      });
    } catch (e) { console.error('Speichern fehlgeschlagen:', e.message); }
  }

  // ---------- Aktionen der Spieler ----------

  kontext(p) {
    if (p.unten || p.zombie > 0 || this.state.phase !== 'spiel') return null;
    const safe = safeRoomAn(this.welt, p.x, p.y);
    if (safe) {
      const tx = (safe.haus.tuer.x + 0.5) * KACHEL, ty = (safe.haus.tuer.y + 0.5) * KACHEL;
      const zustand = this.state.safes.get(safe.id);
      if (Math.hypot(p.x - tx, p.y - ty) < 56 && p.rucksack.includes('bretter') && zustand.barrikade < 100) {
        return { art: 'barrikade', safe, dauer: 3 };
      }
    }
    if (this.state.torGeloest < TOR_RAETSEL && this.amTor(p)) return { art: 'raetsel' };
    let best = null, bd = AKTION_ABSTAND;
    for (const b of this.welt.behaelter) {
      const d = Math.hypot(b.x - p.x, b.y - p.y);
      if (d >= bd) continue;
      const zustand = this.state.behaelter.get(b.id);
      if (zustand && zustand.rest === 0) continue;
      if (!sichtfrei(this.welt, p.x, p.y, b.x, b.y)) continue;
      bd = d; best = b;
    }
    if (best) return { art: 'durchsuchen', behaelter: best, dauer: best.art === 'auto' ? 3.5 : 2.5 };
    return null;
  }

  amTor(p) {
    const t = this.welt.tor;
    return Math.hypot(p.x - (t.x + 1) * KACHEL, p.y - (t.y + 1) * KACHEL) < TOR_ABSTAND;
  }

  starteAktion(client) {
    const p = this.state.spieler.get(client.sessionId), x = this.extra.get(client.sessionId);
    if (!p || !x || p.aktion) return;
    const k = this.kontext(p);
    if (!k) return;
    if (k.art === 'raetsel') return this.stelleRaetsel(client);
    p.aktion = k.art; p.fortschritt = 0;
    x.aktionZiel = k;
    x.laermUhr = 0;
  }

  aktionSchritt(sid, p, x, dt) {
    if (!p.aktion) return;
    const e = x.eingabe;
    if (p.unten || Math.hypot(e.dx, e.dy) > 0.05 || this.state.phase !== 'spiel') {
      p.aktion = ''; p.fortschritt = 0; x.aktionZiel = null;
      return;
    }
    const k = x.aktionZiel;
    p.fortschritt = Math.min(1, p.fortschritt + dt / k.dauer);
    // Durchsuchen und Hämmern machen Lärm – auch durch Wände
    x.laermUhr -= dt;
    if (x.laermUhr <= 0) { this.laerm(p.x, p.y, k.art === 'barrikade' ? 220 : 150, true); x.laermUhr = 1; }
    if (p.fortschritt < 1) return;
    p.aktion = ''; p.fortschritt = 0; x.aktionZiel = null;
    const client = this.clients.find(c => c.sessionId === sid);
    if (k.art === 'durchsuchen') this.durchsucht(client, p, k.behaelter);
    else if (k.art === 'barrikade') {
      const i = p.rucksack.indexOf('bretter');
      if (i < 0) return;
      p.rucksack.splice(i, 1);
      const safe = this.state.safes.get(k.safe.id);
      safe.barrikade = Math.min(100, safe.barrikade + 35);
      client?.send('meldung', { text: `Tür verbarrikadiert (${Math.round(safe.barrikade)} %)` });
    }
  }

  durchsucht(client, p, b) {
    if (!this.inhalte.has(b.id)) {
      const tabelle = BEUTE[b.art] ?? [];
      const funde = [];
      const n = 1 + (this.rnd() < 0.45 ? 1 : 0);
      for (let i = 0; i < n; i++) {
        const d = tabelle[Math.floor(this.rnd() * tabelle.length)];
        if (d) funde.push(d);
      }
      this.setzeInhalt(b.id, funde);
    }
    const inhalt = this.inhalte.get(b.id);
    const genommen = [];
    for (let i = 0; i < inhalt.length;) {
      const d = inhalt[i];
      if (d === 'munition') { p.munition = Math.min(99, p.munition + MUNITION_PRO_FUND); genommen.push(d); inhalt.splice(i, 1); continue; }
      if (p.rucksack.length < RUCKSACK_PLAETZE) { p.rucksack.push(d); genommen.push(d); inhalt.splice(i, 1); continue; }
      i++;
    }
    this.setzeInhalt(b.id, inhalt);
    client?.send('gefunden', { dinge: genommen, rest: inhalt.length });
  }

  benutze(client, m) {
    const p = this.state.spieler.get(client.sessionId);
    const i = Number(m?.platz);
    if (!p || p.unten || p.zombie > 0 || !Number.isInteger(i) || i < 0 || i >= p.rucksack.length) return;
    const d = p.rucksack[i];
    if (d === 'spritze') return this.spritze(client, p, i);
    if (d === 'wasser') { p.durst = Math.min(100, p.durst + 45); p.rucksack.splice(i, 1); }
    else if (d === 'essen') { p.hunger = Math.min(100, p.hunger + 45); p.rucksack.splice(i, 1); }
    else if (d === 'verband') {
      if (p.hp >= 100) return client.send('meldung', { text: 'Du bist nicht verletzt' });
      p.hp = Math.min(100, p.hp + 45); p.rucksack.splice(i, 1);
    } else if (DINGE[d]?.waffe) {
      const alt = p.waffe;
      p.waffe = d;
      if (alt) p.rucksack[i] = alt; else p.rucksack.splice(i, 1);
      client.send('meldung', { text: `${DINGE[d].name} in der Hand` });
    } else if (d === 'bretter') {
      client.send('meldung', { text: 'Bretter: im Safe Room an der Tür verbarrikadieren' });
    }
  }

  spritze(client, p, i) {
    // zuerst sich selbst, sonst den nächsten infizierten Mitspieler daneben
    let ziel = p.infektion > 0 ? p : null;
    if (!ziel) {
      let bd = SPRITZE_ABSTAND;
      for (const o of this.state.spieler.values()) {
        if (o === p || o.infektion <= 0 || o.zombie > 0) continue;
        const d = Math.hypot(o.x - p.x, o.y - p.y);
        if (d < bd) { bd = d; ziel = o; }
      }
    }
    if (!ziel) return client.send('meldung', { text: 'Niemand hier ist infiziert – hebe die Spritze auf' });
    p.rucksack.splice(i, 1);
    ziel.infektion = 0;
    this.broadcast('meldung', {
      text: ziel === p ? `💉 ${p.name} hat sich die Rettungsspritze gesetzt` : `💉 ${p.name} hat ${ziel.name} die Rettungsspritze gesetzt`,
    });
  }

  wegwerfen(client, m) {
    const p = this.state.spieler.get(client.sessionId);
    const i = Number(m?.platz);
    if (!p || !Number.isInteger(i) || i < 0 || i >= p.rucksack.length) return;
    p.rucksack.splice(i, 1);
  }

  kiste(client, m) {
    const p = this.state.spieler.get(client.sessionId);
    if (!p || p.unten) return;
    const s = safeRoomAn(this.welt, p.x, p.y);
    if (!s || Math.hypot(s.kiste.x - p.x, s.kiste.y - p.y) > AKTION_ABSTAND + 24) return;
    const kiste = this.state.safes.get(s.id).kiste;
    const i = Number(m?.platz);
    if (m?.richtung === 'rein') {
      if (!Number.isInteger(i) || i < 0 || i >= p.rucksack.length || kiste.length >= KISTE_PLAETZE) return;
      kiste.push(p.rucksack[i]); p.rucksack.splice(i, 1);
    } else if (m?.richtung === 'raus') {
      if (!Number.isInteger(i) || i < 0 || i >= kiste.length || p.rucksack.length >= RUCKSACK_PLAETZE) return;
      p.rucksack.push(kiste[i]); kiste.splice(i, 1);
    }
  }

  stelleRaetsel(client) {
    const offen = this.offeneRaetsel.get(client.sessionId);
    if (offen && offen.bis > Date.now()) return;   // schon eine Frage offen
    const fragen = holeFragen();
    const f = waehleFrage(fragen, this.gestellt, this.rnd);
    if (!f) return client.send('meldung', { text: 'Das Schloss klemmt – keine Rätsel gefunden' });
    this.gestellt.add(f.id);
    const { antworten, richtigIndex } = mischeAntworten(f, this.rnd);
    this.offeneRaetsel.set(client.sessionId, { id: f.id, richtigIndex, seite: f.seite, richtig: f.richtig, bis: Date.now() + 120000 });
    client.send('raetsel', { id: f.id, thema: f.thema, frage: f.frage, antworten, geloest: this.state.torGeloest, noetig: TOR_RAETSEL });
  }

  antwort(client, m) {
    const offen = this.offeneRaetsel.get(client.sessionId);
    const p = this.state.spieler.get(client.sessionId);
    if (!offen || !p || m?.id !== offen.id) return;
    this.offeneRaetsel.delete(client.sessionId);
    const richtig = Number(m.index) === offen.richtigIndex && offen.bis > Date.now();
    const tor = this.welt.tor;
    if (richtig && this.state.torGeloest < TOR_RAETSEL) {
      this.state.torGeloest++;
      const offenJetzt = this.state.torGeloest >= TOR_RAETSEL;
      this.broadcast('meldung', {
        text: offenJetzt ? `🔓 ${p.name} hat das letzte Schloss geknackt – das Tor ist offen!`
          : `🔐 ${p.name} hat ein Schloss geknackt (${this.state.torGeloest}/${TOR_RAETSEL})`, lang: true,
      });
      if (offenJetzt) this.broadcast('tor', {});
    } else if (!richtig) {
      // falsche Antwort: das Schloss klappert laut
      this.laerm((tor.x + 1) * KACHEL, (tor.y + 1) * KACHEL, 420, true);
      this.broadcast('meldung', { text: `${p.name}: falsche Antwort – das Schloss klappert laut!` }, { except: client });
    }
    client.send('aufloesung', { richtig, loesung: offen.richtig, seite: offen.seite });
  }

  ausruhen(client) {
    const p = this.state.spieler.get(client.sessionId);
    if (!p || !p.sicher) return client.send('meldung', { text: 'Abmelden geht nur in einem Safe Room' });
    this.speichereSpieler(client.sessionId);
    this.speichereWelt();
    client.send('ausgeruht', {});
  }

  // ---------- Simulation ----------

  schritt(dt) {
    const s = this.state;
    if (s.spieler.size === 0) return;
    this.speicherUhr -= dt;
    if (this.speicherUhr <= 0) { this.speicherUhr = SPEICHER_TAKT; this.speichereAlles(); }
    if (s.phase === 'erwischt') {
      this.erwischtSeit += dt;
      if (this.erwischtSeit > 6) this.zurueckInDieSafeRooms();
      return;
    }
    s.zeit += dt;
    this.feldZeit -= dt;
    if (this.feldZeit <= 0) { this.baueFeld(); this.feldZeit = 0.4; }

    for (const [id, p] of s.spieler) {
      const x = this.extra.get(id);
      if (!x) continue;
      this.spielerSchritt(id, p, x, dt);
      this.beduerfnisse(p, x, dt);
      this.aktionSchritt(id, p, x, dt);
    }
    for (const [id, z] of s.zombies) this.zombieSchritt(id, z, dt);
    this.aufhelfen(dt);
    this.zombiesAuffuellen(dt);

    const stehend = [...s.spieler.values()].filter(p => !p.unten && !(p.zombie > 0));
    if (stehend.length === 0) {
      s.phase = 'erwischt';
      this.erwischtSeit = 0;
      this.broadcast('meldung', { text: 'Alle erwischt! Ihr schleppt euch in die Safe Rooms …', lang: true });
    }
  }

  spielerSchritt(id, p, x, dt) {
    const safe = safeRoomAn(this.welt, p.x, p.y);
    p.sicher = safe ? safe.id : '';
    if (safe) x.letzterSafe = safe.id;
    if (p.unten) return;
    const e = x.eingabe;
    const laenge = Math.hypot(e.dx, e.dy);
    if (p.zombie > 0) return this.zombieSpielerSchritt(p, x, e, laenge, dt);
    p.schleicht = e.s || (laenge > 0 && laenge < 0.55);
    // infiziert: langsamer
    const tempo = (p.schleicht ? W.tempoSchleichen : W.tempoGehen) * (p.infektion > 0 ? 0.85 : 1);
    if (laenge > 0.05) {
      const f = Math.min(1, laenge / (p.schleicht ? 0.55 : 1)) * tempo * dt;
      bewege(this.welt, p, e.dx / laenge * f, e.dy / laenge * f, W.spielerRadius);
      p.richtung = Math.atan2(e.dy, e.dx);
      if (!p.schleicht) this.laerm(p.x, p.y, W.hoerweiteRennen, false);
    }
    // automatischer Angriff (nicht während man durchsucht)
    let pause = x.pause - dt;
    if (pause <= 0 && !p.aktion) {
      const mitPistole = p.waffe === 'pistole' && p.munition > 0;
      const mitSchlaeger = p.waffe === 'schlaeger';
      const reichweite = mitPistole ? W.pistoleReichweite : mitSchlaeger ? SCHLAEGER_REICHWEITE : W.nahkampfReichweite;
      const ziel = this.naechsterZombie(p.x, p.y, reichweite, p);
      if (ziel) {
        const [zid, z] = ziel;
        const w = Math.atan2(z.y - p.y, z.x - p.x);
        if (mitPistole) {
          p.munition--;
          this.broadcast('schuss', { x1: p.x, y1: p.y, x2: z.x, y2: z.y });
          this.laerm(p.x, p.y, W.hoerweiteSchuss, true);
          this.schaden(zid, z, PISTOLE_SCHADEN, p);
          pause = PISTOLE_PAUSE;
        } else {
          bewege(this.welt, z, Math.cos(w) * STOSS_WEG, Math.sin(w) * STOSS_WEG, W.zombieRadius);
          this.broadcast('stoss', { x: p.x, y: p.y, w, schlag: mitSchlaeger });
          this.schaden(zid, z, mitSchlaeger ? SCHLAEGER_SCHADEN : STOSS_SCHADEN, p);
          pause = mitSchlaeger ? SCHLAEGER_PAUSE : STOSS_PAUSE;
        }
        p.richtung = w;
      } else pause = 0;
    }
    x.pause = Math.max(0, pause);
  }

  // als Zombie: schnell, beißt Menschen bei Berührung, sonst nichts
  zombieSpielerSchritt(p, x, e, laenge, dt) {
    p.schleicht = false;
    if (laenge > 0.05) {
      const f = Math.min(1, laenge) * W.zombieTempoJagen * 1.15 * dt;
      bewege(this.welt, p, e.dx / laenge * f, e.dy / laenge * f, W.spielerRadius);
      p.richtung = Math.atan2(e.dy, e.dx);
    }
    for (const o of this.state.spieler.values()) {
      if (o === p || o.unten || o.zombie > 0) continue;
      if (Math.hypot(o.x - p.x, o.y - p.y) < W.spielerRadius * 2 + 6) {
        o.hp = Math.max(0, o.hp - BISS_PRO_SEK * dt);
        if (o.hp <= 0) this.liegtAmBoden(o);
      }
    }
  }

  beduerfnisse(p, x, dt) {
    if (!p.verbunden) return;
    if (p.zombie > 0) {
      p.zombie = Math.max(0, p.zombie - dt);
      if (p.zombie === 0) this.zurueckverwandeln(p, x, 'Die Verwandlung lässt nach');
      return;
    }
    // Infektion läuft nur draußen
    if (p.infektion > 0 && !p.sicher) {
      p.infektion = Math.max(0, p.infektion - dt);
      if (p.infektion === 0) return this.verwandeln(p);
    }
    p.durst = Math.max(0, p.durst - dt * 100 / DURST_DAUER);
    p.hunger = Math.max(0, p.hunger - dt * 100 / HUNGER_DAUER);
    if (p.unten) return;
    if (p.durst === 0 || p.hunger === 0) {
      p.hp = Math.max(0, p.hp - dt * 0.25);
      if (p.hp === 0) this.liegtAmBoden(p);
    } else if (p.sicher && p.durst > 20 && p.hunger > 20 && p.hp < 100) {
      p.hp = Math.min(100, p.hp + dt * 0.6);   // ausruhen im Safe Room
    }
  }

  verwandeln(p) {
    p.zombie = ZOMBIE_ZEIT; p.hp = 100; p.unten = false; p.hilfe = 0; p.aktion = ''; p.fortschritt = 0;
    this.broadcast('meldung', { text: `🧟 ${p.name} hat sich verwandelt! Lauft!`, lang: true });
    this.broadcast('verwandelt', { name: p.name });
  }

  zurueckverwandeln(p, x, grund) {
    const safe = this.safeFuer(x?.letzterSafe, p.x, p.y);
    const pos = this.freierPlatz(safe.innen);
    p.x = pos.x; p.y = pos.y;
    p.zombie = 0; p.infektion = 0; p.hp = 50; p.unten = false; p.hilfe = 0;
    this.broadcast('meldung', { text: `${grund}: ${p.name} wacht im ${safe.name} wieder als Mensch auf`, lang: true });
  }

  liegtAmBoden(p) {
    p.unten = true; p.hilfe = 0; p.aktion = ''; p.fortschritt = 0;
    this.broadcast('meldung', { text: `${p.name} liegt am Boden – hilf ihm auf!`, lang: true });
  }

  naechsterZombie(x, y, reichweite, selbst = null) {
    let best = null, bd = reichweite;
    for (const [id, z] of this.state.zombies) {
      const d = Math.hypot(z.x - x, z.y - y);
      if (d < bd && sichtfrei(this.welt, x, y, z.x, z.y)) { bd = d; best = [id, z]; }
    }
    // verwandelte Mitspieler sind auch Ziele
    for (const [sid, o] of this.state.spieler) {
      if (o === selbst || !(o.zombie > 0)) continue;
      const d = Math.hypot(o.x - x, o.y - y);
      if (d < bd && sichtfrei(this.welt, x, y, o.x, o.y)) { bd = d; best = ['spieler:' + sid, o]; }
    }
    return best;
  }

  schaden(id, z, menge, von) {
    if (id.startsWith('spieler:')) {
      z.hp = Math.max(0, z.hp - menge);
      if (z.hp === 0) this.zurueckverwandeln(z, this.extra.get(id.slice(8)), `${von.name} hat den Zombie erledigt`);
      return;
    }
    z.hp = Math.max(0, z.hp - menge);
    const info = this.zombieInfo.get(id);
    if (info && !info.ziel) info.punkt = { x: von.x, y: von.y };
    if (z.hp === 0) {
      this.state.zombies.delete(id);
      this.zombieInfo.delete(id);
      this.state.besiegt++;
      von.besiegt++;
      this.broadcast('weg', { x: z.x, y: z.y });
    }
  }

  laerm(x, y, weite, durchWaende) {
    for (const [id, z] of this.state.zombies) {
      if (Math.hypot(z.x - x, z.y - y) > weite) continue;
      const info = this.zombieInfo.get(id);
      if (!info || info.ziel) continue;
      if (!durchWaende && !sichtfrei(this.welt, z.x, z.y, x, y)) continue;
      info.punkt = { x, y };
    }
  }

  // Wegfeld: Abstand jeder Kachel zum nächsten stehenden Spieler (Breitensuche)
  baueFeld() {
    const feld = new Int16Array(BREITE * HOEHE).fill(-1);
    const q = [];
    for (const p of this.state.spieler.values()) {
      if (p.unten || p.zombie > 0) continue;
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
        if (p.unten || p.zombie > 0) continue;
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
    if (ziel && (ziel.unten || ziel.zombie > 0)) { info.ziel = null; ziel = null; }
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
        if (d > W.spielerRadius + W.zombieRadius - 2) this.zombieGehen(z, w, W.zombieTempoJagen * dt, dt);
        if (d < W.spielerRadius + W.zombieRadius + 6) {
          ziel.hp = Math.max(0, ziel.hp - BISS_PRO_SEK * dt);
          if (!(ziel.infektion > 0) && this.rnd() < BISS_CHANCE * dt) {
            ziel.infektion = INFEKTION_DAUER;
            this.broadcast('meldung', { text: `🦠 ${ziel.name} wurde gebissen! Eine Rettungsspritze hilft.`, lang: true });
          }
          if (ziel.hp <= 0) this.liegtAmBoden(ziel);
        }
        return;
      }
    }

    if (info.punkt) {
      // Geräusch nachgehen
      const d = Math.hypot(info.punkt.x - z.x, info.punkt.y - z.y);
      if (d < 16) { info.punkt = null; info.wechsel = 0; }
      else {
        const sieht = sichtfrei(this.welt, z.x, z.y, info.punkt.x, info.punkt.y);
        z.richtung = sieht ? Math.atan2(info.punkt.y - z.y, info.punkt.x - z.x) : (this.feldRichtung(z.x, z.y) ?? z.richtung);
        if (!this.zombieGehen(z, z.richtung, W.zombieTempoJagen * 0.7 * dt, dt)) info.punkt = null;
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
    if (!info.steht && !this.zombieGehen(z, z.richtung, W.zombieTempoWandern * dt, dt)) {
      z.richtung += Math.PI * (0.5 + this.rnd());
    }
  }

  // verbarrikadierte Tür eines Safe Rooms an dieser Stelle?
  barrikadeAn(x, y) {
    const kx = Math.floor(x / KACHEL), ky = Math.floor(y / KACHEL);
    for (const s of this.welt.safeRooms) {
      if (s.haus.tuer.x === kx && s.haus.tuer.y === ky) {
        const zustand = this.state.safes.get(s.id);
        if (zustand.barrikade > 0) return zustand;
      }
    }
    return null;
  }

  zombieGehen(z, w, weg, dt) {
    const x0 = z.x, y0 = z.y;
    bewege(this.welt, z, Math.cos(w) * weg, Math.sin(w) * weg, W.zombieRadius);
    // Barrikade: nicht durch, sondern dagegen hämmern
    const sperre = this.barrikadeAn(z.x + Math.cos(w) * W.zombieRadius, z.y + Math.sin(w) * W.zombieRadius)
      ?? this.barrikadeAn(z.x, z.y);
    if (sperre) {
      z.x = x0; z.y = y0;
      if (z.jagt || weg > W.zombieTempoWandern * dt * 1.5) sperre.barrikade = Math.max(0, sperre.barrikade - dt * 2);
      return false;
    }
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
        if (h.unten || h === p || h.zombie > 0) return false;
        const e = this.extra.get(hid)?.eingabe;
        const steht = !e || Math.hypot(e.dx, e.dy) < 0.05;
        return steht && Math.hypot(h.x - p.x, h.y - p.y) < W.aufhelfenAbstand;
      });
      if (helfer) {
        const h = helfer[1];
        const mitVerband = h.rucksack.includes('verband');
        p.hilfe = Math.min(1, p.hilfe + dt / (mitVerband ? W.aufhelfenDauer : 8));
        if (p.hilfe >= 1) {
          if (mitVerband) h.rucksack.splice(h.rucksack.indexOf('verband'), 1);
          p.unten = false; p.hp = mitVerband ? 70 : 25; p.hilfe = 0;
          this.broadcast('meldung', {
            text: mitVerband ? `${h.name} hat ${p.name} verbunden und aufgeholfen` : `${h.name} hat ${p.name} notdürftig aufgeholfen`,
          });
        }
      } else p.hilfe = Math.max(0, p.hilfe - dt / 6);
    }
  }

  zombiesAuffuellen(dt) {
    this.nachspawn -= dt;
    const soll = Math.round(zombieSoll(this.state.spieler.size) * this.zombieFaktor);
    if (this.state.zombies.size >= soll || this.nachspawn > 0) return;
    // beim Start viele auf einmal, danach langsam nachrücken
    const anzahl = this.ersteWelle ? soll - this.state.zombies.size : 1;
    for (let i = 0; i < anzahl; i++) this.neuerZombie(this.ersteWelle ? 380 : 520);
    this.ersteWelle = false;
    this.nachspawn = 2.5;
  }

  neuerZombie(abstand) {
    for (let versuch = 0; versuch < 60; versuch++) {
      const x = (1 + this.rnd() * (BREITE - 8)) * KACHEL, y = (1 + this.rnd() * (HOEHE - 2)) * KACHEL;
      if (!frei(this.welt, x, y, W.zombieRadius + 2)) continue;
      if (safeRoomAn(this.welt, x, y)) continue;
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

  // alle am Boden: jeder wacht in seinem letzten Safe Room auf, die Welt bleibt erhalten
  zurueckInDieSafeRooms() {
    const s = this.state;
    const besetzt = new Map();
    for (const [sid, p] of s.spieler) {
      const x = this.extra.get(sid);
      const safe = this.safeFuer(x?.letzterSafe, p.x, p.y);
      const n = besetzt.get(safe.id) ?? 0;
      besetzt.set(safe.id, n + 1);
      const pos = this.freierPlatz(safe.innen, n);
      p.x = pos.x; p.y = pos.y;
      p.hp = 50; p.unten = false; p.hilfe = 0; p.aktion = ''; p.fortschritt = 0; p.zombie = 0;
    }
    // Zombies rund um die Safe Rooms vertreiben
    for (const [id, z] of s.zombies) {
      if (this.welt.safeRooms.some(r => Math.hypot(r.innen.x - z.x, r.innen.y - z.y) < 320)) {
        s.zombies.delete(id); this.zombieInfo.delete(id);
      }
    }
    for (const info of this.zombieInfo.values()) { info.ziel = null; info.punkt = null; }
    s.phase = 'spiel';
    this.broadcast('meldung', { text: 'Ihr seid im Safe Room aufgewacht – mit Kopfweh, aber lebendig.', lang: true });
  }
}

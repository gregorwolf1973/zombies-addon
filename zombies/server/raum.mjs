// Spielraum: der Server entscheidet über Bewegung, Zombies, Treffer, Gegenstände und Safe Rooms.
import crypto from 'node:crypto';
import { holeFragen } from './fragenquelle.mjs';
import { mischeAntworten, waehleFrage } from './raetsel.mjs';
import { botSchritt, BOT_NAMEN } from './bots.mjs';
import { Mensch, Stadtleben } from './menschen.mjs';
import { Fahrzeug, Verkehr } from './verkehr.mjs';
import { Feuer, Brandstifter } from './feuer.mjs';
import { baueInnenraum } from '../client/innen.mjs';
import { baueWeltAusKarte } from '../client/osmwelt.mjs';
import { Room, ServerError } from '@colyseus/core';
import { schema, t } from '@colyseus/schema';
import {
  KACHEL, BREITE, HOEHE, T, WERTE as W, baueWelt, bewege, frei, sichtfrei, drinnen, istNacht, hausHell, aktiveWaffe,
  bewaffnetSoll, zombieSoll, zufall, safeRoomAn, WELT_VERSION,
  DINGE, RUCKSACK_PLAETZE, KISTE_PLAETZE, BEUTE, MUNITION_PRO_FUND, AKTION_ABSTAND,
  BLOCKIERT, ziehe, BEUTE_BONUS, setzeKartengroesse, seiteVon, ladenArt, INFEKTION_DAUER, ZOMBIE_ZEIT, LEICHE_SELTEN, LEICHE_OFT, LEICHE_DAUER, LEICHEN_MAX, BODEN_DAUER, TAUSCH_ABSTAND,
} from '../client/welt.mjs';

export const Spieler = schema({
  name: t.string(),
  aussehen: t.string(),     // Figur: 'm|w,Haarfarbe,Kleidfarbe', z. B. 'w,2,5' (siehe client/figurbild.mjs)
  x: t.number(), y: t.number(),
  richtung: t.number(),
  hp: t.number(),
  durst: t.number(),        // 100 = satt, 0 = verdurstet
  hunger: t.number(),
  unten: t.boolean(),
  hilfe: t.number(),        // Fortschritt beim Aufhelfen 0..1
  waffe: t.string(),        // Name aus WAFFEN (pistole, gewehr, schrotflinte, schlaeger, sense, messer) oder ""
  munition: t.uint8(),
  ebene: t.string(),        // '' = draußen, sonst z. B. 'h5eg', 'h5keller', 'h5dach'
  lampe: t.number(),        // Restzeit der Taschenlampe in Sekunden (leuchtet drinnen von selbst)
  rucksack: t.array("string"),
  plaetze: t.uint8(),       // Größe des Rucksacks (8, 12 oder 16)
  farbe: t.uint8(),
  schleicht: t.boolean(),
  verbunden: t.boolean(),
  sicher: t.string(),       // Id des Safe Rooms, in dem man steht, sonst ""
  aktion: t.string(),       // "durchsuchen" | "barrikade" | ""
  fortschritt: t.number(),
  besiegt: t.uint16(),
  kleidung: t.number(),     // Haltbarkeit der festen Kleidung 0..100 (Schutz vor Bissen)
  infektion: t.number(),    // Sekunden bis zur Verwandlung, 0 = gesund
  zombie: t.number(),       // Sekunden, die man noch Zombie ist, 0 = Mensch
}, 'Spieler');

export const Zombie = schema({
  x: t.number(), y: t.number(),
  richtung: t.number(),
  jagt: t.boolean(),
  hp: t.uint8(),
  kriecht: t.boolean(),     // „nicht ganz tot“: robbt am Boden
  ebene: t.string(),
  variante: t.uint8(),      // Zombietyp 0–4 (Tarnjacke, Dirndl, Feuerwehr, Hemd, Lederhose)
}, 'Zombie');

export const Behaelter = schema({ rest: t.uint8() }, 'Behaelter');
export const Leiche = schema({ x: t.number(), y: t.number(), richtung: t.number(), rest: t.uint8(), alter: t.number(), variante: t.uint8(), ebene: t.string() }, 'Leiche');
export const BodenDing = schema({ x: t.number(), y: t.number(), ding: t.string(), alter: t.number(), ebene: t.string() }, 'BodenDing');
export const Tuer = schema({ offen: t.boolean(), verschlossen: t.boolean() }, 'Tuer');
export const Safe = schema({ barrikade: t.number(), kiste: t.array("string") }, 'Safe');

export const Zustand = schema({
  seed: t.number(),
  karte: t.string(),        // '' = Dorf (erzeugt), sonst Name der OSM-Karte, z. B. 'geretsried'
  phase: t.string(),        // "spiel" | "erwischt"
  zeit: t.number(),         // Spielzeit in Sekunden (wird gespeichert)
  besiegt: t.uint16(),
  torGeloest: t.uint8(),    // richtig beantwortete Rätsel am Tor (3 = offen)
  uhr: t.number(),          // Tageszeit in Spielminuten (0–1439)
  autos: t.uint8(),         // Autodichte der Welt (10 = normal), gilt bis zum Neustart der Welt
  spieler: t.map(Spieler),
  zombies: t.map(Zombie),
  behaelter: t.map(Behaelter),   // nur schon durchsuchte
  leichen: t.map(Leiche),       // tote Zombies, die eine Weile liegen bleiben
  boden: t.map(BodenDing),      // weggeworfene Gegenstände
  tueren: t.map(Tuer),          // Zimmertüren der betretenen Häuser: Schlüssel 'ebene:x,y'
  safes: t.map(Safe),
  menschen: t.map(Mensch),      // Bewohner der Stadt (Abschnitt 4)
  fahrzeuge: t.map(Fahrzeug),   // Linienbus, Verkehr, Polizei, Feuerwehr, Wracks
  feuer: t.map(Feuer),
  verbrannt: t.map('boolean'),  // 'haus:nr', 'auto:bID', 'bus:ID', 'fz:ID'
  kegel: t.boolean(),           // Sichtkegel der Zombies anzeigen (Einstellung)
}, 'Zustand');

const TICK = 50; // ms → 20 Updates pro Sekunde
const ZOMBIE_HP = 100;
const STOSS_WEG = 34;   // Schläger und Faust stoßen den Zombie zurück (Waffenwerte: WAFFEN in client/welt.mjs)
const BISS_PRO_SEK = 14;
const KRIECHER_CHANCE = 0.25, KRIECHER_HP = 35, KRIECHER_TEMPO = 0.28, KRIECHER_SPUERT = 110;
const BISS_CHANCE = 0.12;   // pro Sekunde Kontakt: Wahrscheinlichkeit für einen infizierenden Biss
const SPRITZE_ABSTAND = 50;
const LAMPE_DAUER = 3600;   // eine Taschenlampe leuchtet etwa eine Stunde
const START_MUNITION = 24;
const DURST_DAUER = 3600, HUNGER_DAUER = 5400;   // Sekunden von voll bis leer
const SPEICHER_TAKT = 30;
const ID_MUSTER = /^[a-f0-9]{32}$/;
const BLOCKIERT_FELD = new Set([...BLOCKIERT].filter(t => t !== T.INNENTUER).concat([T.INNENTUER]));
const EBENE_MUSTER = /^h(\d+)(eg|keller|dach)$/;
const AUSSEHEN = /^[mw],[0-5],[0-7]$/;
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
  static einstellungen = { zugangscode: '', zombieFaktor: 1, haeuserFaktor: 1, tempoFaktor: 1, bots: 0, funde: {}, zeitraffer: 1, unsterblich: new Set() };
  static speicher = null;
  static aktiv = null;   // laufender Raum (für die Verwaltungsseite)

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
    SpielRaum.aktiv = this;
    // „frischer Start“: jede neue Spielrunde beginnt mit einer neuen Welt (Spielerstände bleiben)
    const stand = SpielRaum.einstellungen.frischerStart ? null : (this.speicher?.ladeWelt() ?? null);
    this.state = new Zustand();
    this.state.seed = Number.isInteger(optionen.seed) ? optionen.seed
      : stand?.seed ?? Math.floor(Math.random() * 2 ** 31);
    const karte = SpielRaum.einstellungen.karte;
    if (karte?.kacheln) {
      setzeKartengroesse(karte.breite, karte.hoehe);
      const passtStand = stand && (stand.karte ?? '') === karte.name && stand.seed === this.state.seed;
      this.state.autos = Math.max(0, Math.min(50, Math.round(passtStand && Number.isFinite(stand.autos) ? stand.autos : (SpielRaum.einstellungen.autoFaktor ?? 1) * 10)));
      this.welt = baueWeltAusKarte(karte, this.state.seed, { autos: this.state.autos / 10 });
      this.state.karte = karte.name;
    } else {
      setzeKartengroesse(64, 48);
      this.welt = baueWelt(this.state.seed);
      this.state.karte = '';
    }
    this.rnd = zufall((this.state.seed ^ 0x5bd1e995) + Date.now() % 100000);
    this.state.phase = 'spiel';
    this.state.zeit = stand?.zeit ?? 0;
    this.state.uhr = Number.isFinite(stand?.uhr) ? stand.uhr : 8 * 60;   // neue Welt beginnt morgens um acht
    this.state.besiegt = stand?.besiegt ?? 0;
    this.state.torGeloest = Math.min(TOR_RAETSEL, Number(stand?.torGeloest) || 0);
    this.gestellt = new Set(stand?.gestellt ?? []);
    this.offeneRaetsel = new Map();   // sessionId → { id, richtigIndex, seite, richtig, bis }

    this.inhalte = new Map();     // Behälter-Id → verbliebene Gegenstände
    this.leichenInhalt = new Map(); // Leichen-Id → Gegenstände
    this.naechsteLeichenId = 1;
    this.naechsteBodenId = 1;
    this.ebenen = new Map();      // Ebene → Innenraum-Karte (wird beim ersten Betreten gebaut)
    this.felder = new Map();      // Ebene → Wegfeld für Zombies
    this.gespeicherteTueren = {};
    this.tausche = new Map();     // sessionId → laufender Tausch (beide Seiten zeigen auf dasselbe Objekt)
    for (const s of this.welt.safeRooms) {
      const safe = new Safe(); safe.barrikade = 0;
      this.state.safes.set(s.id, safe);
    }
    const passt = stand && stand.version === WELT_VERSION && stand.seed === this.state.seed && (stand.karte ?? '') === this.state.karte;
    this.gespeichertTueren = null;
    if (passt) {
      this.gespeicherteTuerenStand = stand.tueren ?? {};
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

    // Stadtleben: Menschen, Bus, erste Zombies
    this.stadt = new Stadtleben(this);
    this.stadt.start(this.welt.karte ? (SpielRaum.einstellungen.menschen ?? 50) : 0);
    this.verkehr = new Verkehr(this);
    if (this.welt.karte) this.verkehr.start(this.stadt.haltestellen, SpielRaum.einstellungen.verkehr ?? 6);
    this.brand = new Brandstifter(this);
    this.state.kegel = !!SpielRaum.einstellungen.sichtkegel;
    if (stand?.verbrannt && (stand.karte ?? '') === this.state.karte && stand.version === WELT_VERSION) for (const k of stand.verbrannt.slice(0, 2000)) this.state.verbrannt.set(String(k), true);

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
    this.onMessage('tausch_start', (client, m) => this.tauschStart(client, m));
    this.onMessage('tausch_anbieten', (client, m) => this.tauschAnbieten(client, m));
    this.onMessage('tausch_zurueck', (client, m) => this.tauschZurueck(client, m));
    this.onMessage('tausch_ok', client => this.tauschOk(client));
    this.onMessage('tausch_ende', client => { const t = this.tausche.get(client.sessionId); if (t) this.tauschEnde(t, 'abgebrochen'); });
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
      if (AUSSEHEN.test(String(optionen.aussehen ?? ''))) alt.aussehen = optionen.aussehen;
      this.state.spieler.set(client.sessionId, alt);
      this.extra.set(client.sessionId, { ...x, eingabe: { dx: 0, dy: 0, s: false } });
      return;
    }

    const p = new Spieler();
    p.name = name;
    p.farbe = this.freieFarbe();
    const gewaehlt = AUSSEHEN.test(String(optionen.aussehen ?? ''));
    p.aussehen = gewaehlt ? optionen.aussehen : this.zufallsAussehen();
    p.verbunden = true; p.unten = false; p.hilfe = 0; p.richtung = 0;
    p.schleicht = false; p.aktion = ''; p.fortschritt = 0; p.sicher = ''; p.infektion = 0; p.zombie = 0; p.kleidung = 0; p.plaetze = RUCKSACK_PLAETZE; p.ebene = ''; p.lampe = 0;
    const extra = { spielerId, letzterSafe: '', pause: 0, eingabe: { dx: 0, dy: 0, s: false }, aktionZiel: null };
    const gespeichert = this.speicher?.ladeSpieler(spielerId);
    if (gespeichert) {
      p.hp = Math.max(25, Math.min(100, Number(gespeichert.hp) || 100));
      p.durst = Math.max(20, Math.min(100, Number(gespeichert.durst) || 100));
      p.hunger = Math.max(20, Math.min(100, Number(gespeichert.hunger) || 100));
      p.waffe = DINGE[gespeichert.waffe]?.waffe ? gespeichert.waffe : '';
      p.munition = Math.max(0, Math.min(99, Number(gespeichert.munition) || 0));
      p.besiegt = Math.max(0, Math.min(65535, Number(gespeichert.besiegt) || 0));
      if (!gewaehlt && AUSSEHEN.test(String(gespeichert.aussehen ?? ''))) p.aussehen = gespeichert.aussehen;
      p.infektion = Math.max(0, Math.min(INFEKTION_DAUER, Number(gespeichert.infektion) || 0));
      p.kleidung = Math.max(0, Math.min(100, Number(gespeichert.kleidung) || 0));
      p.lampe = Math.max(0, Math.min(LAMPE_DAUER, Number(gespeichert.lampe) || 0));
      p.plaetze = [8, 12, 16].includes(Number(gespeichert.plaetze)) ? Number(gespeichert.plaetze) : RUCKSACK_PLAETZE;
      for (const d of (gespeichert.rucksack ?? []).slice(0, p.plaetze)) if (DINGE[d]) p.rucksack.push(d);
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
    this.botsAnpassen();
  }

  // Simulierte Mitspieler: bei einem Menschen so viele wie eingestellt, jeder weitere Mensch ersetzt einen
  botsAnpassen() {
    const menschen = [...this.extra.values()].filter(x => !x.bot).length;
    const botIds = [...this.extra.entries()].filter(([, x]) => x.bot).map(([sid]) => sid);
    const soll = menschen > 0 ? Math.max(0, (SpielRaum.einstellungen.bots || 0) + 1 - menschen) : 0;
    while (botIds.length > soll) {
      const sid = botIds.pop();
      this.state.spieler.delete(sid); this.extra.delete(sid);
    }
    let n = 0;
    while (botIds.length < soll && n++ < 20) {
      const belegt = new Set([...this.state.spieler.values()].map(s => s.name));
      const name = BOT_NAMEN.find(b => !belegt.has(b + ' 🤖')) ?? 'Bot';
      const sid = 'bot-' + (this.naechsteBotId = (this.naechsteBotId ?? 0) + 1);
      const p = new Spieler();
      p.name = name + ' 🤖'; p.farbe = this.freieFarbe(); p.aussehen = this.zufallsAussehen();
      p.verbunden = true; p.unten = false; p.hilfe = 0; p.richtung = 0; p.schleicht = false;
      p.aktion = ''; p.fortschritt = 0; p.sicher = ''; p.infektion = 0; p.zombie = 0; p.kleidung = 0; p.plaetze = RUCKSACK_PLAETZE; p.ebene = ''; p.lampe = 0;
      p.hp = 100; p.durst = 100; p.hunger = 100; p.besiegt = 0;
      // in die Nähe des ersten Menschen
      const mensch = [...this.state.spieler.entries()].find(([s]) => !this.extra.get(s)?.bot)?.[1];
      const pos = this.freierPlatz(mensch ?? this.welt.start, this.state.spieler.size);
      p.x = pos.x; p.y = pos.y;
      const bewaffnet = [...this.state.spieler.values()].filter(s => s.waffe === 'pistole').length;
      if (bewaffnet < bewaffnetSoll(this.state.spieler.size + 1)) { p.waffe = 'pistole'; p.munition = START_MUNITION; }
      else { p.waffe = ''; p.munition = 0; }
      p.rucksack.push('wasser'); p.rucksack.push('essen');
      this.state.spieler.set(sid, p);
      this.extra.set(sid, { spielerId: null, bot: { nr: botIds.length }, letzterSafe: '', pause: 0, eingabe: { dx: 0, dy: 0, s: false }, aktionZiel: null });
      botIds.push(sid);
    }
  }

  zufallsAussehen() {
    return `${this.rnd() < 0.5 ? 'm' : 'w'},${Math.floor(this.rnd() * 6)},${Math.floor(this.rnd() * 8)}`;
  }

  freieFarbe() {
    const belegt = new Set([...this.state.spieler.values()].map(s => s.farbe));
    for (let i = 0; i < 10; i++) if (!belegt.has(i)) return i;
    return Math.floor(this.rnd() * 10);
  }

  // freier Platz in der Nähe eines Punkts (für mehrere Spieler leicht versetzt)
  freierPlatz(ort, n = 0, ebene = '') {
    const welt = this.wv(ebene);
    for (let ring = 0; ring < 8; ring++) {
      for (let i = 0; i < 8; i++) {
        const w = (n + i) * 2.4, d = ring === 0 && i === 0 && n === 0 ? 0 : 18 + ring * 14;
        const x = ort.x + Math.cos(w) * d, y = ort.y + Math.sin(w) * d;
        if (frei(welt, x, y, W.spielerRadius)) return { x, y };
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
    const tausch = this.tausche.get(client.sessionId);
    if (tausch) this.tauschEnde(tausch, 'abgebrochen');
    this.offeneRaetsel.delete(client.sessionId);
    const p = this.state.spieler.get(client.sessionId);
    if (!p) return;
    this.speichereSpieler(client.sessionId);
    const text = p.sicher ? `${p.name} ruht sich aus` : `${p.name} hat sich versteckt`;
    this.broadcast('meldung', { text });
    this.state.spieler.delete(client.sessionId);
    this.extra.delete(client.sessionId);
    this.botsAnpassen();
  }

  onDispose() {
    if (!this.nichtSpeichern) this.speichereAlles();
    if (SpielRaum.aktiv === this) SpielRaum.aktiv = null;
  }

  // von der Verwaltungsseite: neue Werte gelten sofort
  // Zombies draußen: Grundmenge × Einstellung, nachts × Nachtfaktor
  zombieSollJetzt() {
    const e = SpielRaum.einstellungen;
    // this.zombieFaktor: Vorgabe nur für diesen Raum (Tests), sonst die Einstellung
    // solange viele Menschen gesund sind, kommen weniger Zombies aus dem Umland – die Gefahr wächst mit dem Ausbruch
    const ausbruch = this.stadt?.anfangs ? 0.3 + 0.7 * (1 - this.stadt.ruheAnteil()) : 1;
    return Math.round(zombieSoll(this.state.spieler.size) * (this.zombieFaktor ?? e.zombieFaktor ?? 1) * (istNacht(this.state.uhr) ? (e.nachtFaktor ?? 1.5) : 1) * ausbruch);
  }

  // Taschenlampe nötig: drinnen in dunklen Häusern (Keller immer), draußen nachts
  brauchtLicht(p) {
    if (!p.ebene) return istNacht(this.state.uhr);
    const m = EBENE_MUSTER.exec(p.ebene);
    return !m || !hausHell(Number(m[1]), m[2], this.state.uhr);
  }

  einstellungenGeaendert() {
    this.botsAnpassen();
    this.state.kegel = !!SpielRaum.einstellungen.sichtkegel;
    const soll = this.zombieSollJetzt();
    // zu viele Zombies draußen: die am weitesten entfernten, nicht jagenden verschwinden
    const draussen = [...this.state.zombies.entries()].filter(([, z]) => !z.ebene && !z.jagt);
    const spieler = [...this.state.spieler.values()].filter(p => !p.ebene);
    const abstand = z => Math.min(...spieler.map(p => Math.hypot(p.x - z.x, p.y - z.y)), Infinity);
    draussen.sort((a, b) => abstand(b[1]) - abstand(a[1]));
    for (const [id] of draussen.slice(0, Math.max(0, draussen.length - soll))) { this.state.zombies.delete(id); this.zombieInfo.delete(id); }
  }

  zeitraffer() { return SpielRaum.einstellungen.zeitraffer || 1; }
  einstellungen() { return SpielRaum.einstellungen; }

  unsterblich(p) { return SpielRaum.einstellungen.unsterblich?.has?.(String(p.name).toLowerCase()); }

  // von der Verwaltungsseite: alle bekommen Bescheid, die Welt wird verworfen und beim nächsten Beitritt neu gebaut
  weltNeuStarten(spielerLoeschen = false) {
    this.nichtSpeichern = true;
    this.speicher?.loescheWelt();
    if (spielerLoeschen) this.speicher?.loescheSpieler();
    else for (const [sid, p] of this.state.spieler) {
      const x = this.extra.get(sid);
      if (!x || x.bot || !this.speicher) continue;
      // Rucksack und Werte bleiben, der Platz wird in der neuen Welt neu bestimmt
      this.speichereSpieler(sid);
      const { name, ...daten } = this.speicher.ladeSpieler(x.spielerId) ?? {};
      this.speicher.speichereSpieler(x.spielerId, p.name, { ...daten, x: null, y: null, letzterSafe: '', draussen: true });
    }
    this.broadcast('neustart', {});
    this.clock.setTimeout(() => this.disconnect(), 400);
  }

  speichereSpieler(sid) {
    const p = this.state.spieler.get(sid), x = this.extra.get(sid);
    if (!p || !x || x.bot || !this.speicher) return;
    this.speicher.speichereSpieler(x.spielerId, p.name, {
      x: p.x, y: p.y, hp: p.unten ? 25 : p.hp, durst: p.durst, hunger: p.hunger,
      waffe: p.waffe, munition: p.munition, rucksack: [...p.rucksack], plaetze: p.plaetze, besiegt: p.besiegt,
      aussehen: p.aussehen, letzterSafe: x.letzterSafe, draussen: !p.sicher || p.zombie > 0, infektion: p.zombie > 0 ? 0 : p.infektion, kleidung: p.kleidung, lampe: p.lampe,
    });
  }

  speichereWelt() {
    if (!this.speicher) return;
    const behaelter = {}, safes = {};
    for (const [id, inhalt] of this.inhalte) behaelter[id] = inhalt;
    for (const [id, s] of this.state.safes) safes[id] = { barrikade: Math.round(s.barrikade), kiste: [...s.kiste] };
    this.speicher.speichereWelt({
      version: WELT_VERSION, karte: this.state.karte, seed: this.state.seed, zeit: this.state.zeit, uhr: this.state.uhr, autos: this.state.autos, besiegt: this.state.besiegt, behaelter, safes,
      torGeloest: this.state.torGeloest, gestellt: [...this.gestellt].slice(-500),
      tueren: Object.fromEntries([...this.state.tueren.entries()].map(([k, t]) => [k, [t.offen, t.verschlossen]])),
      verbrannt: [...this.state.verbrannt.keys()].filter(k => !k.startsWith('fz:')),
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
    const welt = this.wv(p.ebene);
    const safe = p.ebene ? null : safeRoomAn(this.welt, p.x, p.y);
    const tuer = this.tuerKontext(p);
    if (tuer) return tuer;
    if (safe) {
      const tx = (safe.haus.tuer.x + 0.5) * KACHEL, ty = (safe.haus.tuer.y + 0.5) * KACHEL;
      const zustand = this.state.safes.get(safe.id);
      if (Math.hypot(p.x - tx, p.y - ty) < 56) {
        // ein toter Zombie in der Tür muss erst weg
        const imWeg = this.leicheInTuer(safe);
        if (imWeg) return { art: 'wegziehen', leiche: imWeg, safe, dauer: 1.5 };
        if (p.rucksack.includes('bretter') && zustand.barrikade < 100) return { art: 'barrikade', safe, dauer: 3 };
      }
    }
    // Gegenstand am Boden aufheben
    let nahDing = null, nd = AKTION_ABSTAND;
    for (const [id, b] of this.state.boden) {
      if ((b.ebene ?? '') !== p.ebene) continue;
      const d = Math.hypot(b.x - p.x, b.y - p.y);
      if (d < nd) { nd = d; nahDing = id; }
    }
    if (nahDing && p.rucksack.length < p.plaetze) return { art: 'aufheben', id: nahDing, dauer: 0.4 };
    if (!p.ebene && this.state.torGeloest < TOR_RAETSEL && this.amTor(p)) return { art: 'raetsel' };
    let best = null, bd = AKTION_ABSTAND;
    for (const b of welt.behaelter) {
      const d = Math.hypot(b.x - p.x, b.y - p.y);
      if (d >= bd) continue;
      const zustand = this.state.behaelter.get(b.id);
      if (zustand && zustand.rest === 0) continue;
      if (b.art !== 'bus' && !sichtfrei(welt, p.x, p.y, b.x, b.y) && !p.ebene) continue;
      bd = d; best = b;
    }
    for (const [id, l] of this.state.leichen) {
      if ((l.ebene ?? '') !== p.ebene) continue;
      const d = Math.hypot(l.x - p.x, l.y - p.y);
      if (d >= bd || l.rest === 0) continue;
      bd = d; best = { id, art: 'leiche', x: l.x, y: l.y };
    }
    if (best) return { art: 'durchsuchen', behaelter: best, dauer: best.art === 'auto' || best.art === 'bus' ? 3.5 : best.art === 'leiche' ? 1.5 : 2.5 };
    return this.tuerKontext(p, true);
  }

  amTor(p) {
    const t = this.welt.tor;
    return Math.hypot(p.x - (t.x + 1) * KACHEL, p.y - (t.y + 1) * KACHEL) < TOR_ABSTAND;
  }

  // ---------- Ebenen (Innenräume) ----------

  wv(ebene) {
    if (!ebene) return this.welt;
    return this.ebenen.get(ebene) ?? this.baueEbene(ebene);
  }

  baueEbene(ebene) {
    const m = EBENE_MUSTER.exec(ebene);
    if (!m) return this.welt;
    const haus = this.welt.haeuser[Number(m[1])];
    const kat = ladenArt(haus);
    const w = baueInnenraum(this.state.seed, Number(m[1]), m[2], seiteVon(haus), !!kat);
    if (kat) w.behaelter.forEach(b => { if (b.art === 'laden') b.art = 'laden_' + kat; });
    w.ebene = ebene; w.nr = Number(m[1]); w.stock = m[2];
    w.behaelter = w.behaelter.map(b => ({ ...b, id: ebene + ':' + b.id }));
    w.safeRooms = [];
    for (const t of w.tueren) {
      const key = `${ebene}:${t.x},${t.y}`;
      let st = this.state.tueren.get(key);
      if (!st) {
        st = new Tuer();
        const g = (this.gespeicherteTuerenStand ?? {})[key];
        st.offen = g ? !!g[0] : false; st.verschlossen = g ? !!g[1] : !!t.verschlossen;
        this.state.tueren.set(key, st);
      }
      if (st.offen) w.kacheln[t.y * BREITE + t.x] = T.TUER_OFFEN;
    }
    this.ebenen.set(ebene, w);
    // schlafende Zombies hinter den Türen
    // Menge über die Einstellung „Zombies in Häusern“ (10 = normal): Plätze ausdünnen oder verdoppeln
    const hf = SpielRaum.einstellungen.haeuserFaktor ?? 1;
    for (const zp of w.zombiePlaetze ?? []) {
      for (let n = Math.floor(hf) + (this.rnd() < hf % 1 ? 1 : 0), i = 0; i < n; i++) {
        const dx = i ? (this.rnd() - 0.5) * KACHEL : 0, dy = i ? (this.rnd() - 0.5) * KACHEL : 0;
        if (!i || frei(w, zp.x + dx, zp.y + dy, W.zombieRadius)) this.setzeZombie(zp.x + dx, zp.y + dy, ebene, true);
      }
    }
    return w;
  }

  setzeZombie(x, y, ebene = '', schlaeft = false) {
    const z = new Zombie();
    z.x = x; z.y = y; z.hp = ZOMBIE_HP; z.richtung = this.rnd() * Math.PI * 2; z.jagt = false;
    z.kriecht = false; z.variante = Math.floor(this.rnd() * 5); z.ebene = ebene;
    const id = 'z' + (this.naechsteZombieId++);
    this.state.zombies.set(id, z);
    this.zombieInfo.set(id, { ziel: null, punkt: null, wechsel: 0, verloren: 0, steht: schlaeft, schlaeft });
    return id;
  }

  // Betreten, Verlassen, Treppen: wer auf die Kachel tritt, wechselt die Ebene
  uebergang(id, p, x, dt) {
    if (!x) return;
    x.wechselSperre = Math.max(0, (x.wechselSperre ?? 0) - dt);
    if (x.wechselSperre > 0) return;
    // nach einem Wechsel erst wieder, wenn man sich vom Ankunftsort entfernt hat
    // (sonst läuft man mit gehaltener Taste sofort zurück durch Tür oder Treppe)
    if (x.ankunft) {
      if (Math.hypot(p.x - x.ankunft.x, p.y - x.ankunft.y) < 44) return;
      x.ankunft = null;
    }
    // Bots wechseln nur, wenn sie genau diesen Übergang ansteuern (nicht beim Vorbeilaufen)
    if (x.bot && (!x.bot.uebergangZiel || Math.hypot(p.x - x.bot.uebergangZiel.x, p.y - x.bot.uebergangZiel.y) > 24)) return;
    const welt = this.wv(p.ebene);
    const kx = Math.floor(p.x / KACHEL), ky = Math.floor(p.y / KACHEL);
    const t = welt.hole(kx, ky);
    let ziel = null, pos = null;
    if (!p.ebene && t === T.TUER) {
      const h = this.welt.haeuser.find(h => h.tuer.x === kx && h.tuer.y === ky);
      if (!h || !h.betretbar) return;
      // brennende Häuser kann man nicht betreten
      if ([...this.brand?.info.values() ?? []].some(i => i.ziel === 'haus:' + h.nr)) {
        if (!x.bot) this.clients.find(c => c.sessionId === id)?.send('meldung', { text: '🔥 Das Haus brennt – da kommst du nicht rein' });
        bewege(welt, p, h.raus.dx * 20, h.raus.dy * 20, W.spielerRadius); return;
      }
      ziel = `h${h.nr}eg`; pos = this.wv(ziel).start;
    } else if (p.ebene && t === T.AUSGANG) {
      const h = this.welt.haeuser[welt.nr];
      const r = h.raus ?? { dx: 0, dy: 1 };
      ziel = ''; pos = { x: (h.tuer.x + 0.5 + r.dx * 1.3) * KACHEL, y: (h.tuer.y + 0.5 + r.dy * 1.3) * KACHEL };
    } else if (p.ebene && (t === T.TREPPE_RUNTER || t === T.TREPPE_HOCH)) {
      const tr = welt.treppen.find(tr => tr.x === kx && tr.y === ky);
      if (!tr) return;
      ziel = `h${welt.nr}${tr.ziel}`;
      const zw = this.wv(ziel);
      const zurueck = zw.treppen.find(z => z.ziel === welt.stock);
      pos = zurueck ? this.nebenKachel(zw, zurueck) : zw.start;
    } else return;
    const platz = this.freierPlatz(pos, 0, ziel);
    p.ebene = ziel; p.x = platz.x; p.y = platz.y; p.aktion = ''; p.fortschritt = 0;
    x.wechselSperre = 0.3; x.ankunft = { x: platz.x, y: platz.y };
    if (x.bot) { x.bot.weg = null; x.bot.uebergangZiel = null; }
  }

  // begehbare Nachbarkachel einer Treppe (dort landet man)
  nebenKachel(w, k) {
    for (const [dx, dy] of [[0, -1], [0, 1], [1, 0], [-1, 0]]) {
      if (w.hole(k.x + dx, k.y + dy) === T.BODEN) return { x: (k.x + dx + 0.5) * KACHEL, y: (k.y + dy + 0.5) * KACHEL };
    }
    return w.start;
  }

  // wohin muss man auf dieser Ebene gehen, um Richtung Zielebene zu kommen? (für Bots)
  uebergangsPunkt(von, nach) {
    const mitte = k => ({ x: (k.x + 0.5) * KACHEL, y: (k.y + 0.5) * KACHEL });
    const ziel = EBENE_MUSTER.exec(nach ?? '');
    if (!von) {
      if (!ziel) return null;
      return mitte(this.welt.haeuser[Number(ziel[1])].tuer);
    }
    const w = this.wv(von);
    if (w.stock !== 'eg') return mitte(w.treppen.find(t => t.ziel === 'eg') ?? w.treppen[0]);
    if (ziel && Number(ziel[1]) === w.nr && ziel[2] !== 'eg') {
      const tr = w.treppen.find(t => t.ziel === ziel[2]);
      if (tr) return mitte(tr);
    }
    return w.ausgang ? mitte(w.ausgang) : null;
  }

  // Türen in Innenräumen: öffnen, schließen, aufschließen, aufbrechen, Rätsel
  tuerKontext(p, nurSchliessen = false) {
    if (!p.ebene) return null;
    const w = this.wv(p.ebene);
    let best = null, bd = 42;
    for (const t of w.tueren) {
      const d = Math.hypot((t.x + 0.5) * KACHEL - p.x, (t.y + 0.5) * KACHEL - p.y);
      if (d < bd) { bd = d; best = t; }
    }
    if (!best) return null;
    const key = `${p.ebene}:${best.x},${best.y}`, st = this.state.tueren.get(key);
    if (!st) return null;
    const basis = { key, tuer: best, ebene: p.ebene };
    if (st.offen) {
      if (!nurSchliessen) return null;
      const cx = (best.x + 0.5) * KACHEL, cy = (best.y + 0.5) * KACHEL;
      const belegt = [...this.state.spieler.values(), ...this.state.zombies.values()]
        .some(o => (o.ebene ?? '') === p.ebene && Math.hypot(o.x - cx, o.y - cy) < 20);
      return belegt ? null : { ...basis, art: 'tuer_zu', dauer: 0.25 };
    }
    if (nurSchliessen) return null;
    if (!st.verschlossen) return { ...basis, art: 'tuer_auf', dauer: 0.25 };
    if (p.rucksack.includes('schluessel')) return { ...basis, art: 'aufschliessen', dauer: 1 };
    if (p.rucksack.includes('brechstange')) return { ...basis, art: 'aufbrechen', dauer: 2.5 };
    return { ...basis, art: 'schlossraetsel' };
  }

  setzeTuer(key, offen) {
    const st = this.state.tueren.get(key);
    if (!st) return;
    const [ebene, xy] = key.split(':');
    const [x, y] = xy.split(',').map(Number);
    const w = this.wv(ebene);
    st.offen = offen;
    if (offen) st.verschlossen = false;
    w.kacheln[y * BREITE + x] = offen ? T.TUER_OFFEN : T.INNENTUER;
    // wer hinter der Tür schläft und jemanden sieht, wacht im nächsten Schritt auf (Sichtprüfung)
  }

  // ---------- Tauschen (wenn sich zwei Spieler berühren; das Spiel läuft weiter) ----------

  istBot(sid) { return !!this.extra.get(sid)?.bot; }

  tauschStart(client, m) {
    const ich = client.sessionId, du = String(m?.mit ?? '');
    const p = this.state.spieler.get(ich), q = this.state.spieler.get(du);
    if (!p || !q || ich === du || this.tausche.has(ich) || this.tausche.has(du)) return;
    if (p.unten || q.unten || p.zombie > 0 || q.zombie > 0 || p.ebene !== q.ebene) return;
    if (Math.hypot(p.x - q.x, p.y - q.y) > TAUSCH_ABSTAND + 8) return client.send('meldung', { text: 'Zum Tauschen musst du direkt neben ihm stehen' });
    const t = { seiten: [ich, du], angebot: { [ich]: [], [du]: [] }, ok: { [ich]: false, [du]: this.istBot(du) } };
    this.tausche.set(ich, t); this.tausche.set(du, t);
    this.tauschSenden(t);
  }

  tauschSenden(t) {
    const [a, b] = t.seiten;
    for (const [ich, du] of [[a, b], [b, a]]) {
      const c = this.clients.find(k => k.sessionId === ich);
      c?.send('tausch', {
        partner: this.state.spieler.get(du)?.name ?? '?', mit: du,
        meins: t.angebot[ich], seins: t.angebot[du], meinOk: t.ok[ich], seinOk: t.ok[du],
      });
    }
  }

  tauschGeaendert(t) { for (const s of t.seiten) t.ok[s] = this.istBot(s); this.tauschSenden(t); }

  tauschAnbieten(client, m) {
    const t = this.tausche.get(client.sessionId), p = this.state.spieler.get(client.sessionId);
    const i = Number(m?.platz);
    if (!t || !p || !Number.isInteger(i) || i < 0 || i >= p.rucksack.length) return;
    t.angebot[client.sessionId].push(p.rucksack[i]); p.rucksack.splice(i, 1);
    this.tauschGeaendert(t);
  }

  tauschZurueck(client, m) {
    const t = this.tausche.get(client.sessionId), p = this.state.spieler.get(client.sessionId);
    const i = Number(m?.index), liste = t?.angebot[client.sessionId];
    if (!t || !p || !Number.isInteger(i) || i < 0 || i >= liste.length || p.rucksack.length >= p.plaetze) return;
    p.rucksack.push(liste[i]); liste.splice(i, 1);
    this.tauschGeaendert(t);
  }

  tauschOk(client) {
    const t = this.tausche.get(client.sessionId);
    if (!t) return;
    t.ok[client.sessionId] = true;
    const [a, b] = t.seiten;
    if (!(t.ok[a] && t.ok[b])) return this.tauschSenden(t);
    const pa = this.state.spieler.get(a), pb = this.state.spieler.get(b);
    if (pa.rucksack.length + t.angebot[b].length > pa.plaetze || pb.rucksack.length + t.angebot[a].length > pb.plaetze) {
      for (const s of t.seiten) this.clients.find(k => k.sessionId === s)?.send('meldung', { text: 'Für den Tausch ist im Rucksack nicht genug Platz' });
      return this.tauschGeaendert(t);
    }
    for (const d of t.angebot[b]) pa.rucksack.push(d);
    for (const d of t.angebot[a]) pb.rucksack.push(d);
    t.angebot[a] = []; t.angebot[b] = [];
    this.tauschEnde(t, 'fertig');
  }

  tauschEnde(t, grund) {
    for (const s of t.seiten) {
      const p = this.state.spieler.get(s);
      for (const d of t.angebot[s] ?? []) {
        if (p && p.rucksack.length < p.plaetze) p.rucksack.push(d);
        else if (p) this.legeHin(d, p.x, p.y, p.ebene);
      }
      t.angebot[s] = [];
      this.tausche.delete(s);
      this.clients.find(k => k.sessionId === s)?.send('tausch_ende', { grund });
    }
  }

  tauschPruefen() {
    const gesehen = new Set();
    for (const t of this.tausche.values()) {
      if (gesehen.has(t)) continue;
      gesehen.add(t);
      const [pa, pb] = t.seiten.map(s => this.state.spieler.get(s));
      if (!pa || !pb || pa.unten || pb.unten || pa.zombie > 0 || pb.zombie > 0 || pa.ebene !== pb.ebene || Math.hypot(pa.x - pb.x, pa.y - pb.y) > 70) {
        this.tauschEnde(t, 'abgebrochen');
      }
    }
  }

  // Leiche, die in der Tür eines Safe Rooms liegt (Id) oder null
  leicheInTuer(safe) {
    const tx = (safe.haus.tuer.x + 0.5) * KACHEL, ty = (safe.haus.tuer.y + 0.5) * KACHEL;
    for (const [id, l] of this.state.leichen) if (Math.hypot(l.x - tx, l.y - ty) < 30) return id;
    return null;
  }

  starteAktion(client) {
    const p = this.state.spieler.get(client.sessionId), x = this.extra.get(client.sessionId);
    if (!p || !x || p.aktion) return;
    const k = this.kontext(p);
    if (!k) return;
    if (k.art === 'raetsel') return this.stelleRaetsel(client);
    if (k.art === 'schlossraetsel') return this.stelleRaetsel(client, { art: 'tuer', key: k.key, tuer: k.tuer, ebene: k.ebene });
    // Kofferräume gehen nur mit Brechstange auf
    if (k.art === 'durchsuchen' && k.behaelter?.art === 'auto' && !p.rucksack.includes('brechstange')) {
      return client.send('meldung', { text: '🔒 Der Kofferraum ist zu – dafür brauchst du eine ⚒️ Brechstange' });
    }
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
    if (x.laermUhr <= 0) {
      const weite = { barrikade: 220, aufbrechen: 340, tuer_auf: 60, tuer_zu: 60, aufschliessen: 40, aufheben: 0 }[k.art] ?? 150;
      if (weite) this.laerm(p.x, p.y, weite, true, p.ebene);
      x.laermUhr = 1;
    }
    if (p.fortschritt < 1) return;
    p.aktion = ''; p.fortschritt = 0; x.aktionZiel = null;
    const client = this.clients.find(c => c.sessionId === sid);
    if (k.art === 'durchsuchen') this.durchsucht(client, p, k.behaelter);
    else if (k.art === 'tuer_auf' || k.art === 'aufschliessen' || k.art === 'aufbrechen') {
      this.setzeTuer(k.key, true);
      if (k.art === 'aufbrechen') client?.send('meldung', { text: '⚒️ Tür aufgebrochen – das war laut!' });
    }
    else if (k.art === 'tuer_zu') this.setzeTuer(k.key, false);
    else if (k.art === 'aufheben') {
      const b = this.state.boden.get(k.id);
      if (!b || p.rucksack.length >= p.plaetze) return;
      const d = b.ding;
      if (DINGE[d]?.waffe && !p.waffe) p.waffe = d;
      else if (d === 'taschenlampe' && !(p.lampe > 0)) p.lampe = LAMPE_DAUER;
      else if (d === 'kleidung' && !(p.kleidung > 0)) p.kleidung = 100;
      else p.rucksack.push(d);
      this.state.boden.delete(k.id);
      client?.send('meldung', { text: `Aufgehoben: ${DINGE[b.ding]?.zeichen ?? ''} ${DINGE[b.ding]?.name ?? b.ding}` });
    }
    else if (k.art === 'wegziehen') {
      const l = this.state.leichen.get(k.leiche);
      if (!l) return;
      // vom Haus weg nach draußen ziehen
      const tx = (k.safe.haus.tuer.x + 0.5) * KACHEL, ty = (k.safe.haus.tuer.y + 0.5) * KACHEL;
      const w = Math.atan2(ty - k.safe.innen.y, tx - k.safe.innen.x);
      const dx = Math.abs(Math.cos(w)) > Math.abs(Math.sin(w)) ? Math.sign(Math.cos(w)) : 0;
      const dy = dx ? 0 : Math.sign(Math.sin(w));
      l.x = tx + dx * KACHEL * 1.8; l.y = ty + dy * KACHEL * 1.8;
      client?.send('meldung', { text: 'Den toten Zombie aus der Tür gezogen' });
    }
    else if (k.art === 'barrikade') {
      if (this.leicheInTuer(k.safe)) return client?.send('meldung', { text: 'Ein toter Zombie liegt in der Tür – erst wegziehen' });
      const i = p.rucksack.indexOf('bretter');
      if (i < 0) return;
      p.rucksack.splice(i, 1);
      const safe = this.state.safes.get(k.safe.id);
      safe.barrikade = Math.min(100, safe.barrikade + 35);
      client?.send('meldung', { text: `Tür verbarrikadiert (${Math.round(safe.barrikade)} %)` });
    }
  }

  durchsucht(client, p, b) {
    if (b.art === 'leiche') return this.leicheDurchsucht(client, p, b.id);
    // ausgebrannt: nichts mehr zu holen
    if ((b.art === 'auto' || b.art === 'bus') && this.state.verbrannt.has((b.art === 'auto' ? 'auto:' : 'bus:') + b.id)) this.setzeInhalt(b.id, []);
    if (!this.inhalte.has(b.id)) {
      const tabelle = BEUTE[b.art] ?? [];
      const funde = [];
      const n = 1 + (this.rnd() < 0.45 ? 1 : 0);
      for (let i = 0; i < n; i++) {
        const d = ziehe(tabelle, SpielRaum.einstellungen.funde, this.rnd, BEUTE_BONUS[b.art]);
        if (d) funde.push(d);
      }
      this.setzeInhalt(b.id, funde);
    }
    const inhalt = this.inhalte.get(b.id);
    const genommen = this.einpacken(p, inhalt);
    this.setzeInhalt(b.id, inhalt);
    client?.send('gefunden', { dinge: genommen, rest: inhalt.length });
  }

  // Gegenstände in den Rucksack (Munition direkt zur Pistole); Rest bleibt liegen
  einpacken(p, inhalt) {
    const genommen = [];
    for (let i = 0; i < inhalt.length;) {
      const d = inhalt[i];
      if (d === 'munition') { p.munition = Math.min(99, p.munition + MUNITION_PRO_FUND); genommen.push(d); inhalt.splice(i, 1); continue; }
      // in die Hand bzw. anziehen, wenn frei – das braucht keinen Rucksackplatz
      if (DINGE[d]?.waffe && !p.waffe) { p.waffe = d; genommen.push(d); inhalt.splice(i, 1); continue; }
      if (d === 'taschenlampe' && !(p.lampe > 0)) { p.lampe = LAMPE_DAUER; genommen.push(d); inhalt.splice(i, 1); continue; }
      if (d === 'kleidung' && !(p.kleidung > 0)) { p.kleidung = 100; genommen.push(d); inhalt.splice(i, 1); continue; }
      if (p.rucksack.length < p.plaetze) { p.rucksack.push(d); genommen.push(d); inhalt.splice(i, 1); continue; }
      i++;
    }
    return genommen;
  }

  leicheDurchsucht(client, p, id) {
    const l = this.state.leichen.get(id);
    if (!l) return;
    const inhalt = this.leichenInhalt.get(id) ?? [];
    const genommen = this.einpacken(p, inhalt);
    l.rest = inhalt.length;
    client?.send('gefunden', { dinge: genommen, rest: inhalt.length });
  }

  neueLeiche(z) {
    const inhalt = [];
    // selten (zusammen 5 %) und oft (zusammen 55 %), jeweils mit der Fundhäufigkeit je Gegenstand
    const f = SpielRaum.einstellungen.funde ?? {};
    const anteile = [
      ...LEICHE_SELTEN.map(d => [d, 0.05 / LEICHE_SELTEN.length * (f[d] ?? 10) / 10]),
      ...LEICHE_OFT.map(d => [d, 0.55 / LEICHE_OFT.length * (f[d] ?? 10) / 10]),
    ];
    const summe = anteile.reduce((a, [, g]) => a + g, 0);
    let r = this.rnd() * Math.max(1, summe);
    for (const [d, g] of anteile) { r -= g; if (r < 0) { inhalt.push(d); break; } }
    const id = 'l' + (this.naechsteLeichenId++);
    const l = new Leiche();
    l.x = z.x; l.y = z.y; l.richtung = z.richtung; l.rest = inhalt.length; l.alter = 0; l.variante = z.variante ?? 0; l.ebene = z.ebene ?? '';
    this.state.leichen.set(id, l);
    this.leichenInhalt.set(id, inhalt);
    // höchstens LEICHEN_MAX: die älteste verschwindet
    if (this.state.leichen.size > LEICHEN_MAX) {
      const aelteste = this.state.leichen.keys().next().value;
      this.state.leichen.delete(aelteste); this.leichenInhalt.delete(aelteste);
    }
  }

  leichenAltern(dt) {
    for (const [id, l] of this.state.leichen) {
      l.alter += dt;
      if (l.alter > LEICHE_DAUER) { this.state.leichen.delete(id); this.leichenInhalt.delete(id); }
    }
  }

  benutze(client, m) {
    const p = this.state.spieler.get(client.sessionId);
    const i = Number(m?.platz);
    if (!p || p.unten || p.zombie > 0 || !Number.isInteger(i) || i < 0 || i >= p.rucksack.length) return;
    const d = p.rucksack[i];
    if (d === 'spritze') return this.spritze(client, p, i);
    if (d === 'wasser') { p.durst = Math.min(100, p.durst + 45); p.rucksack.splice(i, 1); }
    else if (d === 'essen') { p.hunger = Math.min(100, p.hunger + 45); p.rucksack.splice(i, 1); }
    else if (d === 'schokoriegel') { p.hunger = Math.min(100, p.hunger + 20); p.rucksack.splice(i, 1); }
    else if (DINGE[d]?.plaetze) {
      if (DINGE[d].plaetze <= p.plaetze) return client.send('meldung', { text: 'Dein Rucksack ist schon so groß' });
      p.plaetze = DINGE[d].plaetze; p.rucksack.splice(i, 1);
      client.send('meldung', { text: `${DINGE[d].zeichen} Umgepackt – jetzt ${p.plaetze} Plätze` });
    }
    else if (d === 'kleidung') {
      if (p.kleidung >= 100) return client.send('meldung', { text: 'Du trägst schon feste Kleidung' });
      p.kleidung = 100; p.rucksack.splice(i, 1);
      client.send('meldung', { text: '🧥 Feste Kleidung angezogen – Bisse gehen seltener durch' });
    }
    else if (d === 'seil') { client.send('meldung', { text: '🪢 Ein Seil – brauchst du später am Fluss' }); }
    else if (d === 'taschenlampe') { client.send('meldung', { text: '🔦 Schaltet sich in Häusern von selbst ein (hält etwa eine Stunde)' }); }
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
    const [ding] = p.rucksack.splice(i, 1);
    this.legeHin(ding, p.x, p.y, p.ebene);
  }

  legeHin(ding, x, y, ebene = '') {
    const b = new BodenDing(); b.ebene = ebene;
    const w = this.rnd() * Math.PI * 2;
    b.x = x + Math.cos(w) * 10; b.y = y + Math.sin(w) * 10; b.ding = ding; b.alter = 0;
    this.state.boden.set('d' + (this.naechsteBodenId++), b);
  }

  bodenAltern(dt) {
    for (const [id, b] of this.state.boden) {
      b.alter += dt;
      if (b.alter > BODEN_DAUER) this.state.boden.delete(id);
    }
  }

  kiste(client, m) {
    const p = this.state.spieler.get(client.sessionId);
    if (!p || p.unten) return;
    const s = p.ebene ? null : safeRoomAn(this.welt, p.x, p.y);
    if (!s || Math.hypot(s.kiste.x - p.x, s.kiste.y - p.y) > AKTION_ABSTAND + 24) return;
    const kiste = this.state.safes.get(s.id).kiste;
    const i = Number(m?.platz);
    if (m?.richtung === 'rein') {
      if (!Number.isInteger(i) || i < 0 || i >= p.rucksack.length || kiste.length >= KISTE_PLAETZE) return;
      kiste.push(p.rucksack[i]); p.rucksack.splice(i, 1);
    } else if (m?.richtung === 'raus') {
      if (!Number.isInteger(i) || i < 0 || i >= kiste.length || p.rucksack.length >= p.plaetze) return;
      p.rucksack.push(kiste[i]); kiste.splice(i, 1);
    }
  }

  stelleRaetsel(client, zweck = null) {
    const offen = this.offeneRaetsel.get(client.sessionId);
    if (offen && offen.bis > Date.now()) return;   // schon eine Frage offen
    const fragen = holeFragen();
    const f = waehleFrage(fragen, this.gestellt, this.rnd);
    if (!f) return client.send('meldung', { text: 'Das Schloss klemmt – keine Rätsel gefunden' });
    this.gestellt.add(f.id);
    const { antworten, richtigIndex } = mischeAntworten(f, this.rnd);
    this.offeneRaetsel.set(client.sessionId, { id: f.id, richtigIndex, seite: f.seite, richtig: f.richtig, bis: Date.now() + 120000, zweck });
    client.send('raetsel', { id: f.id, thema: f.thema, frage: f.frage, antworten, geloest: this.state.torGeloest, noetig: TOR_RAETSEL, tuer: !!zweck });
  }

  antwort(client, m) {
    const offen = this.offeneRaetsel.get(client.sessionId);
    const p = this.state.spieler.get(client.sessionId);
    if (!offen || !p || m?.id !== offen.id) return;
    this.offeneRaetsel.delete(client.sessionId);
    const richtig = Number(m.index) === offen.richtigIndex && offen.bis > Date.now();
    if (offen.zweck?.art === 'tuer') {
      const z = offen.zweck;
      if (richtig) { this.setzeTuer(z.key, true); client.send('meldung', { text: '🔓 Das Schloss springt auf' }); }
      else this.laerm((z.tuer.x + 0.5) * KACHEL, (z.tuer.y + 0.5) * KACHEL, 300, true, z.ebene);
      client.send('aufloesung', { richtig, loesung: offen.richtig, seite: offen.seite });
      return;
    }
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
    const zr = SpielRaum.einstellungen.zeitraffer || 1;   // Testschalter: Spielzeit läuft schneller
    s.zeit += dt * zr;
    // Tageszeit: ein Spieltag dauert tagMinuten echte Minuten
    const vorher = istNacht(s.uhr);
    s.uhr = (s.uhr + dt * zr * 1440 / ((SpielRaum.einstellungen.tagMinuten || 48) * 60)) % 1440;
    if (istNacht(s.uhr) !== vorher) this.broadcast('meldung', { text: istNacht(s.uhr) ? '🌙 Die Nacht bricht herein – Zombies werden mehr. Taschenlampe bereit?' : '🌅 Es wird Tag', lang: true });
    this.feldZeit -= dt;
    if (this.feldZeit <= 0) {
      for (const e of new Set([...s.spieler.values()].map(p => p.ebene ?? ''))) this.baueFeld(e);
      this.feldZeit = 0.4;
    }

    for (const [id, p] of s.spieler) {
      const x = this.extra.get(id);
      if (!x) continue;
      if (x.bot) {
        try { botSchritt(this, id, p, x, dt); } catch (e) { x.eingabe = { dx: 0, dy: 0, s: false }; if (!x.fehlerGemeldet) { console.error('Bot-Fehler:', e.message); x.fehlerGemeldet = true; } }
      }
      this.spielerSchritt(id, p, x, dt);
      this.beduerfnisse(p, x, dt * zr);
      if (this.unsterblich(p)) { p.hp = 100; p.unten = false; p.infektion = 0; p.durst = Math.max(p.durst, 30); p.hunger = Math.max(p.hunger, 30); }
      this.aktionSchritt(id, p, x, dt);
    }
    for (const [id, z] of s.zombies) this.zombieSchritt(id, z, dt);
    this.stadt?.schritt(dt);
    this.verkehr?.schritt(dt);
    this.brand?.schritt(dt);
    this.aufhelfen(dt);
    this.leichenAltern(dt);
    this.bodenAltern(dt);
    this.tauschPruefen();
    this.zombiesAuffuellen(dt);

    const stehend = [...s.spieler.values()].filter(p => !p.unten && !(p.zombie > 0));
    if (stehend.length === 0) {
      s.phase = 'erwischt';
      this.erwischtSeit = 0;
      this.broadcast('meldung', { text: 'Alle erwischt! Ihr schleppt euch in die Safe Rooms …', lang: true });
    }
  }

  spielerSchritt(id, p, x, dt) {
    const welt = this.wv(p.ebene);
    const safe = p.ebene ? null : safeRoomAn(this.welt, p.x, p.y);
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
      const x0 = p.x, y0 = p.y;
      bewege(welt, p, e.dx / laenge * f, e.dy / laenge * f, W.spielerRadius);
      p.richtung = Math.atan2(e.dy, e.dx);
      if (!p.schleicht) this.laerm(p.x, p.y, W.hoerweiteRennen, false, p.ebene);
      this.klettern(id, p, x, e, laenge, Math.hypot(p.x - x0, p.y - y0) < f * 0.25, dt);
    } else x.kletter = 0;
    this.uebergang(id, p, x, dt);
    // automatischer Angriff (nicht während man durchsucht)
    let pause = x.pause - dt;
    if (pause <= 0 && !p.aktion) {
      const [name, wf0] = aktiveWaffe(p);
      const meter = SpielRaum.einstellungen.reichweite?.[name];
      const wf = meter ? { ...wf0, reichweite: meter * KACHEL / 4 } : wf0;   // eingestellte Reichweite (Meter, 4 m je Kachel)
      const ziel = this.naechsterZombie(p.x, p.y, wf.reichweite, p);
      if (ziel) {
        const [zid, z] = ziel;
        const w = Math.atan2(z.y - p.y, z.x - p.x);
        // Überraschung: Zombie hat noch niemanden im Visier → deutlich mehr Schaden (von hinten anschleichen)
        const faktor = t => { if (t[0].startsWith('spieler:')) return 1; const info = this.zombieInfo.get(t[0]); return !t[1].jagt && !info?.ziel ? wf.ueberraschung : 1; };
        const treffer = (liste, menge) => { for (const t of liste) this.schaden(t[0], t[1], menge * faktor(t), p, id); };
        // mehrere Ziele: alle Zombies im Kegel bzw. Bogen
        const imWinkel = winkel => [...this.state.zombies.entries()].filter(([, q]) => (q.ebene ?? '') === (p.ebene ?? '')
          && Math.hypot(q.x - p.x, q.y - p.y) <= wf.reichweite && winkelDiff(Math.atan2(q.y - p.y, q.x - p.x), w) <= winkel
          && sichtfrei(welt, p.x, p.y, q.x, q.y));
        if (wf.fern) {
          p.munition--;
          this.laerm(p.x, p.y, W.hoerweiteSchuss * (wf.laut ?? 1), true, p.ebene);
          if (wf.kegel) {
            const alle = imWinkel(wf.kegel).filter(t => t[0] !== zid);
            for (let i = -2; i <= 2; i++) {   // Schrotgarbe
              const ww = w + i * wf.kegel / 2.5;
              this.broadcast('schuss', { x1: p.x, y1: p.y, x2: p.x + Math.cos(ww) * wf.reichweite, y2: p.y + Math.sin(ww) * wf.reichweite, art: name });
            }
            treffer([ziel], wf.schaden); treffer(alle, wf.nebenSchaden);
          } else {
            this.broadcast('schuss', { x1: p.x, y1: p.y, x2: z.x, y2: z.y, art: name });
            treffer([ziel], wf.schaden);
          }
        } else if (wf.bogen) {
          this.broadcast('stoss', { x: p.x, y: p.y, w, sense: true });
          treffer(imWinkel(wf.bogen), wf.schaden);
        } else {
          if (wf.stoss) bewege(welt, z, Math.cos(w) * STOSS_WEG, Math.sin(w) * STOSS_WEG, W.zombieRadius);
          this.broadcast('stoss', { x: p.x, y: p.y, w, messer: name === 'messer', schlag: name === 'schlaeger' });
          treffer([ziel], wf.schaden);
        }
        pause = wf.pause;
        p.richtung = w;
      } else pause = 0;
    }
    x.pause = Math.max(0, pause);
  }

  // Über Hecken, Gartenzäune und -mauern steigen: etwa 0,9 s an derselben Stelle dagegenlaufen
  klettern(id, p, x, e, laenge, steckt, dt) {
    const zaunart = this.welt.details?.zaunart;
    if (p.ebene || !zaunart || !steckt) { x.kletter = 0; return; }
    const dx = e.dx / laenge, dy = e.dy / laenge;
    const vor = { x: p.x + dx * (W.spielerRadius + 8), y: p.y + dy * (W.spielerRadius + 8) };
    const kx = Math.floor(vor.x / KACHEL), ky = Math.floor(vor.y / KACHEL);
    // nur Gartenzäune (Kartenrand und Hauswände nicht)
    if (this.welt.hole(kx, ky) !== T.ZAUN || !'hzmw'.includes(zaunart[ky * BREITE + kx])) { x.kletter = 0; return; }
    if (x.kletterStelle !== kx + ',' + ky) { x.kletterStelle = kx + ',' + ky; x.kletter = 0; }
    x.kletter = (x.kletter ?? 0) + dt;
    if (x.kletter < 0.9) return;
    x.kletter = 0;
    // Landeplatz hinter dem Zaun suchen
    for (const weite of [1.2, 1.6, 2.0]) {
      const zx = p.x + dx * KACHEL * weite, zy = p.y + dy * KACHEL * weite;
      if (frei(this.welt, zx, zy, W.spielerRadius)) {
        p.x = zx; p.y = zy;
        this.broadcast('klettern', { x: zx, y: zy });
        return;
      }
    }
  }

  // als Zombie: schnell, beißt Menschen bei Berührung, sonst nichts
  zombieSpielerSchritt(p, x, e, laenge, dt) {
    p.schleicht = false;
    if (laenge > 0.05) {
      const f = Math.min(1, laenge) * W.zombieTempoJagen * 1.15 * dt;
      bewege(this.wv(p.ebene), p, e.dx / laenge * f, e.dy / laenge * f, W.spielerRadius);
      p.richtung = Math.atan2(e.dy, e.dx);
    }
    this.uebergang(null, p, x, dt);
    for (const o of this.state.spieler.values()) {
      if (o === p || o.unten || o.zombie > 0 || o.ebene !== p.ebene) continue;
      if (Math.hypot(o.x - p.x, o.y - p.y) < W.spielerRadius * 2 + 6) {
        o.hp = Math.max(0, o.hp - BISS_PRO_SEK * dt);
        if (o.hp <= 0) this.liegtAmBoden(o);
      }
    }
  }

  beduerfnisse(p, x, dt) {
    if (!p.verbunden) return;
    if (this.brauchtLicht(p)) {
      if (p.lampe <= 0) {
        const i = p.rucksack.indexOf('taschenlampe');
        if (i >= 0) { p.rucksack.splice(i, 1); p.lampe = LAMPE_DAUER; }
      } else p.lampe = Math.max(0, p.lampe - dt);
    }
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
    p.x = pos.x; p.y = pos.y; p.ebene = '';
    p.zombie = 0; p.infektion = 0; p.hp = 50; p.unten = false; p.hilfe = 0;
    this.broadcast('meldung', { text: `${grund}: ${p.name} wacht im ${safe.name} wieder als Mensch auf`, lang: true });
  }

  liegtAmBoden(p) {
    p.unten = true; p.hilfe = 0; p.aktion = ''; p.fortschritt = 0;
    this.broadcast('meldung', { text: `${p.name} liegt am Boden – hilf ihm auf!`, lang: true });
  }

  naechsterZombie(x, y, reichweite, selbst = null) {
    let best = null, bd = reichweite;
    const ebene = selbst?.ebene ?? '', welt = this.wv(ebene);
    for (const [id, z] of this.state.zombies) {
      if ((z.ebene ?? '') !== ebene) continue;
      const d = Math.hypot(z.x - x, z.y - y);
      if (d < bd && sichtfrei(welt, x, y, z.x, z.y)) { bd = d; best = [id, z]; }
    }
    // verwandelte Mitspieler sind auch Ziele
    for (const [sid, o] of this.state.spieler) {
      if (o === selbst || !(o.zombie > 0) || o.ebene !== ebene) continue;
      const d = Math.hypot(o.x - x, o.y - y);
      if (d < bd && sichtfrei(welt, x, y, o.x, o.y)) { bd = d; best = ['spieler:' + sid, o]; }
    }
    return best;
  }

  schaden(id, z, menge, von, vonSid = null) {
    if (id.startsWith('spieler:')) {
      z.hp = Math.max(0, z.hp - menge);
      if (z.hp === 0) this.zurueckverwandeln(z, this.extra.get(id.slice(8)), `${von.name} hat den Zombie erledigt`);
      return;
    }
    z.hp = Math.max(0, z.hp - menge);
    const info = this.zombieInfo.get(id);
    if (info && !info.ziel) {
      // getroffen: jetzt hat er dich bemerkt
      if (vonSid && z.hp > 0) { info.ziel = vonSid; info.verloren = 0; info.punkt = null; info.schlaeft = false; z.jagt = true; this.broadcast('entdeckt', { x: z.x, y: z.y }); }
      else info.punkt = { x: von.x, y: von.y };
    }
    if (z.hp === 0 && !z.kriecht && this.rnd() < (this.kriecherChance ?? KRIECHER_CHANCE)) {
      // nicht ganz tot: bricht zusammen und kriecht weiter
      z.kriecht = true; z.hp = KRIECHER_HP; z.jagt = false;
      if (info) { info.ziel = null; info.punkt = null; }
      this.broadcast('weg', { x: z.x, y: z.y, halb: true });
      return;
    }
    if (z.hp === 0) {
      this.state.zombies.delete(id);
      this.zombieInfo.delete(id);
      this.state.besiegt++;
      von.besiegt++;
      this.neueLeiche(z);
      this.broadcast('weg', { x: z.x, y: z.y });
    }
  }

  laerm(x, y, weite, durchWaende, ebene = '') {
    const welt = this.wv(ebene);
    for (const [id, z] of this.state.zombies) {
      if ((z.ebene ?? '') !== ebene) continue;
      if (Math.hypot(z.x - x, z.y - y) > weite) continue;
      const info = this.zombieInfo.get(id);
      if (!info || info.ziel) continue;
      if (!durchWaende && !sichtfrei(welt, z.x, z.y, x, y)) continue;
      info.punkt = { x, y }; info.schlaeft = false;
    }
  }

  // Wegfeld: Abstand jeder Kachel zum nächsten stehenden Spieler (Breitensuche)
  baueFeld(ebene = '') {
    const welt = this.wv(ebene);
    const feld = new Int16Array(BREITE * HOEHE).fill(-1);
    const q = [];
    for (const p of this.state.spieler.values()) {
      if (p.unten || p.zombie > 0 || p.ebene !== ebene) continue;
      const i = Math.floor(p.y / KACHEL) * BREITE + Math.floor(p.x / KACHEL);
      if (feld[i] === -1) { feld[i] = 0; q.push(i); }
    }
    for (let k = 0; k < q.length; k++) {
      const i = q[k], x = i % BREITE, y = (i - x) / BREITE;
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
        if (nx < 0 || ny < 0 || nx >= BREITE || ny >= HOEHE) continue;
        const j = ny * BREITE + nx;
        if (feld[j] !== -1) continue;
        if (BLOCKIERT_FELD.has(welt.hole(nx, ny))) continue;
        feld[j] = feld[i] + 1;
        q.push(j);
      }
    }
    this.felder.set(ebene, feld);
    if (!ebene) this.feld = feld;
  }

  feldRichtung(x, y, ebene = '') {
    const feld = this.felder.get(ebene);
    if (!feld) return null;
    const kx = Math.floor(x / KACHEL), ky = Math.floor(y / KACHEL);
    const hier = feld[ky * BREITE + kx];
    let best = null, bw = hier < 0 ? Infinity : hier;
    for (const [nx, ny] of [[kx + 1, ky], [kx - 1, ky], [kx, ky + 1], [kx, ky - 1]]) {
      if (nx < 0 || ny < 0 || nx >= BREITE || ny >= HOEHE) continue;
      const w = feld[ny * BREITE + nx];
      if (w >= 0 && w < bw) { bw = w; best = [nx, ny]; }
    }
    if (!best) return null;
    return Math.atan2((best[1] + 0.5) * KACHEL - y, (best[0] + 0.5) * KACHEL - x);
  }

  zombieSchritt(id, z, dt) {
    const info = this.zombieInfo.get(id);
    const welt = this.wv(z.ebene);
    const ebene = z.ebene ?? '';
    // Sehen: Kegel in Blickrichtung, schleichende Spieler erst später
    if (!info.ziel) {
      for (const [sid, p] of this.state.spieler) {
        if (p.unten || p.zombie > 0 || p.ebene !== ebene) continue;
        const d = Math.hypot(p.x - z.x, p.y - z.y);
        const weite = p.schleicht ? W.sichtWeiteSchleichen : W.sichtWeite;
        const imKegel = winkelDiff(Math.atan2(p.y - z.y, p.x - z.x), z.richtung) < W.sichtWinkel / 2;
        // wer schleicht oder still steht, kann sich von hinten bis zum ersten Schlag heranpirschen
        const e = this.extra.get(sid)?.eingabe;
        const leise = p.schleicht || !e || Math.hypot(e.dx, e.dy) < 0.05;
        const ganzNah = d < (leise && !imKegel ? 8 : 28);
        // Kriecher spüren ringsum, schlafende (lauernde) Zombies in Häusern auch – aber nur bei freier Sicht
        const bemerkt = z.kriecht ? d < (leise ? KRIECHER_SPUERT * 0.5 : KRIECHER_SPUERT) : info.schlaeft ? d < (leise ? 70 : 140) : (ganzNah || (d < weite && imKegel));
        if (bemerkt && sichtfrei(welt, z.x, z.y, p.x, p.y)) {
          info.ziel = sid; info.verloren = 0; info.punkt = null; info.schlaeft = false;
          this.broadcast('entdeckt', { x: z.x, y: z.y });
          break;
        }
      }
    }
    let ziel = info.ziel ? this.state.spieler.get(info.ziel) : null;
    if (ziel && (ziel.unten || ziel.zombie > 0 || ziel.ebene !== ebene)) { info.ziel = null; ziel = null; }
    z.jagt = !!ziel;

    if (ziel) {
      const d = Math.hypot(ziel.x - z.x, ziel.y - z.y);
      const sieht = d < W.sichtWeite * 1.6 && sichtfrei(welt, z.x, z.y, ziel.x, ziel.y);
      info.verloren = sieht ? 0 : info.verloren + dt;
      if (info.verloren > 6 || d > W.sichtWeite * 3) {
        info.ziel = null; info.punkt = { x: ziel.x, y: ziel.y }; z.jagt = false;
      } else {
        const w = sieht ? Math.atan2(ziel.y - z.y, ziel.x - z.x) : (this.feldRichtung(z.x, z.y, ebene) ?? z.richtung);
        z.richtung = w;
        const lahm = z.kriecht ? KRIECHER_TEMPO : 1;
        if (d > W.spielerRadius + W.zombieRadius - 2) this.zombieGehen(z, w, W.zombieTempoJagen * lahm * dt, dt);
        if (d < W.spielerRadius + W.zombieRadius + 6) {
          const schutz = ziel.kleidung > 0;
          ziel.hp = Math.max(0, ziel.hp - BISS_PRO_SEK * dt * (schutz ? 0.6 : 1) * (z.kriecht ? 0.6 : 1));
          if (schutz) ziel.kleidung = Math.max(0, ziel.kleidung - dt * 4);
          if (!(ziel.infektion > 0) && this.rnd() < BISS_CHANCE * dt * (schutz ? 0.5 : 1)) {
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
        const sieht = sichtfrei(welt, z.x, z.y, info.punkt.x, info.punkt.y);
        z.richtung = sieht ? Math.atan2(info.punkt.y - z.y, info.punkt.x - z.x) : (this.feldRichtung(z.x, z.y, ebene) ?? z.richtung);
        if (!this.zombieGehen(z, z.richtung, W.zombieTempoJagen * 0.7 * (z.kriecht ? KRIECHER_TEMPO : 1) * dt, dt)) info.punkt = null;
      }
      return;
    }

    // schlafende Zombies (in Häusern) bewegen sich nicht, bis sie jemanden sehen oder hören
    if (info.schlaeft) return;
    // Wandern
    info.wechsel -= dt;
    if (info.wechsel <= 0) {
      info.wechsel = 2 + this.rnd() * 4;
      info.steht = this.rnd() < 0.4;
      if (!info.steht) z.richtung = this.rnd() * Math.PI * 2;
    }
    if (!info.steht && !this.zombieGehen(z, z.richtung, W.zombieTempoWandern * (z.kriecht ? 0.5 : 1) * dt, dt)) {
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
    weg *= SpielRaum.einstellungen.tempoFaktor ?? 1;   // Einstellung „Tempo“
    const x0 = z.x, y0 = z.y;
    const welt = this.wv(z.ebene);
    bewege(welt, z, Math.cos(w) * weg, Math.sin(w) * weg, W.zombieRadius);
    // Barrikade: nicht durch, sondern dagegen hämmern (nur draußen)
    const sperre = z.ebene ? null : (this.barrikadeAn(z.x + Math.cos(w) * W.zombieRadius, z.y + Math.sin(w) * W.zombieRadius)
      ?? this.barrikadeAn(z.x, z.y));
    if (sperre) {
      z.x = x0; z.y = y0;
      if (z.jagt || weg > W.zombieTempoWandern * dt * 1.5) sperre.barrikade = Math.max(0, sperre.barrikade - dt * 2);
      return false;
    }
    // Abstand zu anderen Zombies halten
    for (const o of this.state.zombies.values()) {
      if (o === z || o.ebene !== z.ebene) continue;
      const d = Math.hypot(o.x - z.x, o.y - z.y);
      if (d > 0 && d < W.zombieRadius * 2) {
        const f = (W.zombieRadius * 2 - d) / 2;
        bewege(welt, z, (z.x - o.x) / d * f, (z.y - o.y) / d * f, W.zombieRadius);
      }
    }
    return Math.hypot(z.x - x0, z.y - y0) > weg * 0.3;
  }

  aufhelfen(dt) {
    const alle = [...this.state.spieler.entries()];
    for (const [, p] of alle) {
      if (!p.unten) continue;
      const helfer = alle.find(([hid, h]) => {
        if (h.unten || h === p || h.zombie > 0 || h.ebene !== p.ebene) return false;
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
    // weit von allen Spielern entfernte, nicht jagende Zombies draußen verschwinden (große Karten)
    const draussenSpieler = [...this.state.spieler.values()].filter(p => !p.ebene);
    if (draussenSpieler.length) for (const [id, z] of this.state.zombies) {
      if (z.ebene || z.jagt || this.zombieInfo.get(id)?.bleibt) continue;   // Stadt-Zombies (Ausbruch, Verwandelte) bleiben
      if (draussenSpieler.every(p => Math.hypot(p.x - z.x, p.y - z.y) > 1500)) { this.state.zombies.delete(id); this.zombieInfo.delete(id); }
    }
    const soll = this.zombieSollJetzt();
    // gezählt werden nur Zombies aus dem Umland – die Stadt-Zombies kommen obendrauf
    const draussen = [...this.state.zombies.entries()].filter(([id, z]) => !z.ebene && !this.zombieInfo.get(id)?.bleibt).length;
    if (draussen >= soll || this.nachspawn > 0) return;
    // beim Start viele auf einmal, danach langsam nachrücken
    const anzahl = this.ersteWelle ? soll - draussen : 1;
    for (let i = 0; i < anzahl; i++) this.neuerZombie(this.ersteWelle ? 380 : 520);
    this.ersteWelle = false;
    this.nachspawn = 2.5;
  }

  neuerZombie(abstand) {
    // im Ring um einen zufälligen Spieler draußen (bei großen Karten), sonst irgendwo
    const draussen = [...this.state.spieler.values()].filter(p => !p.ebene);
    for (let versuch = 0; versuch < 60; versuch++) {
      let x, y;
      if (draussen.length && abstand > 0) {
        const p = draussen[Math.floor(this.rnd() * draussen.length)];
        const w = this.rnd() * Math.PI * 2, d = abstand + this.rnd() * 450;
        x = p.x + Math.cos(w) * d; y = p.y + Math.sin(w) * d;
        if (x < KACHEL || y < KACHEL || x > (BREITE - 1) * KACHEL || y > (HOEHE - 1) * KACHEL) continue;
      } else { x = (1 + this.rnd() * (BREITE - 8)) * KACHEL; y = (1 + this.rnd() * (HOEHE - 2)) * KACHEL; }
      if (!frei(this.welt, x, y, W.zombieRadius + 2)) continue;
      if (safeRoomAn(this.welt, x, y)) continue;
      const nah = [...this.state.spieler.values()].some(p => Math.hypot(p.x - x, p.y - y) < abstand);
      if (nah) continue;
      // in Häusern lauern auch welche, aber seltener
      if (drinnen(this.welt, x, y)) continue;   // Häuser haben eigene Innenräume
      this.setzeZombie(x, y, '');
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
      p.x = pos.x; p.y = pos.y; p.ebene = '';
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

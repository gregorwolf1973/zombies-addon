// Schießstand / Tutorial: ein eigener kleiner Raum je Spieler ('schiessstand'), unabhängig von der Hauptwelt.
// Es wird nichts in die Datenbank geschrieben (kein Rucksack, keine Werte, keine Welt) und SpielRaum.aktiv bleibt die Hauptwelt.
// Der Raum erbt Bewegung, Zombies, Schüsse und Nachladen von SpielRaum und nutzt dieselben Einstellungen (Waffen: Schaden, Pause,
// Reichweite, Magazin, Zombie-Leben …), damit die Auswertung die echten Werte zeigt. Spieler: unsterblich, kein Hunger/Durst,
// unbegrenzter Vorrat (Magazin und Nachladen wie im Spiel). Ein Fahrzeug am Lager (Auswahl vor dem Start) feuert auf die Zombies: Puma des
// Bundeswehr-Standorts, Leopard (Turm, MG, Hauptkanone); Vorgabe: keins.
// Zusätzlich kann der Spieler Boxer, Puma oder Leopard selbst fahren (E zum Einsteigen/Aussteigen, Gehen-Taste lenkt, der Turm schießt von selbst;
// server/fahrbar.mjs): ein Fahrzeug je Spieler, nie eine Horde.
import { zaehle, fuegeHinzu } from '../client/stapel.mjs';
import { aussehenMigriert, AUSSEHEN_MUSTER } from '../client/figurbild.mjs';
import { SpielRaum, Zustand, Spieler, sauberName, eingabeKompakt } from './raum.mjs';
import { Stuetzpunkt } from './stuetzpunkt.mjs';
import { Granaten } from './granaten.mjs';
import { Fahrzeug } from './verkehr.mjs';
import { Leopard, leopardEinst } from './leopard.mjs';
import { Fahrbare } from './fahrbar.mjs';
import { FAHRBAR_ARTEN } from '../client/fahrbar.mjs';
import * as WP from './waffenplaetze.mjs';
import { ZOMBIE_TYPEN } from './einstellungen.mjs';
import { WAFFEN, GRANATE, WERTE as W, RUCKSACK_PLAETZE, MUNITION_MAX, PFEILE_MAX, GRANATEN_MAX, aktiveWaffe, frei, zufall, KACHEL } from '../client/welt.mjs';
import { baueSchiessstandWelt, SS_START, SS_ZOMBIE_Y } from '../client/schiessstand_welt.mjs';

export const SS_WAFFEN = ['pistole', 'mp', 'gewehr', 'schrotflinte', 'mg', 'scharfschuetze', 'armbrust', 'granatwerfer', 'messer', 'schlaeger', 'faust'];
export const SS_FAHRZEUGE = ['', 'puma', 'leopard'];   // Auswahl: keins, Puma, Leopard 2A7
export const SS_FZ_LEOPARD = { x: SS_START.x - 140, y: SS_START.y - 10, richtung: Math.PI / 2 };   // Standplätze vor dem Lager (freie Wiese)
export const SS_GRANATE = 'handgranate';   // Statistikname der Handgranate (Wurfgegenstand, keine Waffe in der Hand)
const AUSSEHEN = AUSSEHEN_MUSTER;
const ZOMBIE_MAX = 120;      // so viele Zombies gleichzeitig (Warteschlange eingerechnet)
const SPAWN_TAKT = 0.2, SPAWN_JE_TAKT = 3;   // Zombies kommen gestaffelt aus dem Süden
const STAT_TAKT = 0.4;

export class SchiessstandRaum extends SpielRaum {
  maxClients = 1;

  onCreate() {
    this.speicher = null; this.nichtSpeichern = true;     // nichts speichern, nichts aus der Hauptwelt laden
    const s = this.state = new Zustand();
    this.tageszeitenUebernehmen();
    s.seed = 4242; s.karte = ''; s.phase = 'spiel'; s.zeit = 0; s.uhr = 12 * 60; s.tag = 1; s.level = 1; s.autos = 0; s.besiegt = 0;
    s.evakArt = ''; s.busAnkunft = -1;
    this.welt = baueSchiessstandWelt();
    this.weltFp = 'schiessstand';
    this.rnd = zufall(0x5c1e55 + Date.now() % 100000);
    this.inhalte = new Map(); this.leichenInhalt = new Map(); this.leichenMunition = new Map(); this.naechsteLeichenId = 1; this.naechsteBodenId = 1;
    this.ebenen = new Map(); this.felder = new Map(); this.gespeicherteTueren = {};
    this.chatVerlauf = []; this.naechsteChatId = 1; this.chatZeiten = new Map();
    this.fkVon = new WeakMap(); this.tausche = new Map(); this.offeneRaetsel = new Map(); this.gestellt = new Set();
    this.extra = new Map(); this.wiederkehr = new Map(); this.zombieInfo = new Map();
    this.naechsteZombieId = 1; this.feldZeit = 0; this.nachspawn = 0; this.erwischtSeit = 0; this.kriecherChance = 0.15;
    this.stadt = null; this.verkehr = null; this.brand = null; this.welle = null; this.aufgaben = null; this.radios = null;
    this.granaten = new Granaten(this);
    this.fahrzeug = ''; this.leopard = new Leopard(this, 'Leopard');
    this.boxer = null; this.fahrbare = new Fahrbare(this);   // selbst fahrbare Fahrzeuge (je Spieler eins)
    this.warteschlange = 0; this.spawnT = 0; this.statT = 0; this.statSchmutzig = true;
    this.stuetzpunkt = new SchiessstandBasis(this);
    this.stuetzpunkt.start(null, false);
    this.statistikLeeren();
    // Granatenexplosionen den Spielern zurechnen: Quelle (Handgranate oder Granatwerfer) merken
    const explodiert = this.granaten.explodiert.bind(this.granaten);
    this.granaten.explodiert = g => {
      this.quelle = { waffe: g.zuender ? 'granatwerfer' : SS_GRANATE, getroffen: false };
      try { explodiert(g); } finally {
        const q = this.quelle; this.quelle = null;
        if (q.getroffen && this.stat[q.waffe]) { this.stat[q.waffe].treffer++; this.statSchmutzig = true; }
      }
    };

    this.onMessage('eingabe', (client, m) => this.eingabeEmpfangen(client, m));
    // kompakte Eingabe (Client ≥ 0.78 sendet nur noch 'e') und Blickrichtung der Drehzone – fehlten hier bis 0.84.1: Figur stand still
    this.onMessage('e', (client, a) => { const m = eingabeKompakt(a); if (m) this.eingabeEmpfangen(client, m); });
    this.onMessage('blick', (client, a) => this.blickEmpfangen(client, a));
    this.onMessage('sicht', (client, m) => {
      const w = Number(m?.w), h = Number(m?.h);
      if (Number.isFinite(w) && Number.isFinite(h)) client.sicht = { w: Math.max(200, Math.min(2600, w)), h: Math.max(150, Math.min(2600, h)) };
    });
    this.onMessage('nachladen', client => { const p = this.state.spieler.get(client.sessionId), x = this.extra.get(client.sessionId); if (p && x) WP.startNachladen(this, p, x, this.einstellungen()); });
    this.onMessage('waffenplatz', (client, m) => {
      const p = this.state.spieler.get(client.sessionId), x = this.extra.get(client.sessionId);
      if (!p || !x) return;
      WP.abgleich(p, x, this.einstellungen());
      WP.wechsle(this, client, p, x, m?.weiter ? WP.naechster(p) : Number(m?.platz), this.einstellungen());
    });
    this.onMessage('wurf', (client, m) => {
      if (this.granaten.werfen(client, m)) { this.stat[SS_GRANATE].schuesse++; this.stat[SS_GRANATE].munition++; this.statSchmutzig = true; }
    });
    this.onMessage('ss_waffe', (client, m) => this.waffeWaehlen(client.sessionId, String(m?.name ?? '')));
    this.onMessage('ss_zombies', (client, m) => this.zombiesStarten(Number(m?.n)));
    this.onMessage('ss_panzer', (client, m) => this.fahrzeugWaehlen(m?.an ? 'puma' : ''));   // alter Schalter: an = Puma
    this.onMessage('ss_fahrzeug', (client, m) => this.fahrzeugWaehlen(String(m?.art ?? '')));
    this.onMessage('ss_fahrbar', (client, m) => this.fahrbarWaehlen(client.sessionId, String(m?.art ?? '')));   // '' = Fahrzeug entfernen
    // Einsteigen/Aussteigen: nur die fahrbaren Fahrzeuge (die übrige Aktionslogik des Spiels gibt es hier nicht)
    this.onMessage('aktion', client => { const sid = client.sessionId; if (this.fahrbare.von(sid)) this.fahrbare.aussteigen(sid); else this.fahrbare.einsteigen(sid); });
    this.onMessage('aussteigen', client => { this.fahrbare.aussteigen(client.sessionId); });
    this.onMessage('ss_reset', () => this.zuruecksetzen());
    this.onMessage('ss_stat', client => this.statSenden(client));
    this.onMessage('ping', (client, m) => client.send('pong', m));
    this.onMessage('*', () => {});   // alles andere vom Client (Sprache, Chat, Weltprüfung …) gibt es hier nicht

    this.setSimulationInterval(dt => this.schritt(dt / 1000), 50);
  }

  // ---------- Beitritt ----------
  onJoin(client, optionen = {}) {
    const p = new Spieler();
    p.name = sauberName(optionen.name); p.farbe = 0;
    p.aussehen = AUSSEHEN.test(aussehenMigriert(optionen.aussehen)) ? aussehenMigriert(optionen.aussehen) : 'h,0,0';
    p.verbunden = true; p.unten = false; p.afk = false; p.hilfe = 0; p.richtung = Math.PI / 2;
    p.schleicht = false; p.aktion = ''; p.fortschritt = 0; p.sicher = ''; p.infektion = 0; p.zombie = 0; p.kleidung = 0; p.plaetze = RUCKSACK_PLAETZE; p.ebene = ''; p.lampe = 0; p.spricht = false;
    p.hp = 100; p.durst = 100; p.hunger = 100; p.besiegt = 0;
    p.x = SS_START.x; p.y = SS_START.y;
    p.waffe = 'pistole'; p.munition = MUNITION_MAX; p.pfeile = PFEILE_MAX; p.granaten = GRANATEN_MAX;
    fuegeHinzu(p.rucksack, p.plaetze, 'granate', 4);
    const extra = { spielerId: 'schiessstand', letzterSafe: '', pause: 0, eingabe: { dx: 0, dy: 0, s: false }, aktionZiel: null, letzteEingabe: Date.now() };
    WP.lade(p, extra, null);
    this.state.spieler.set(client.sessionId, p);
    this.extra.set(client.sessionId, extra);
    client.send('einstellungen_spieler', { werte: {} });   // der Client wartet darauf (Merkzettel); die Auswertung holt er mit 'ss_stat'
  }

  onDrop() { /* kein Wiedereinstieg: der Raum geht mit dem Spieler */ }
  onLeave(client) {
    this.fahrbare.entfernen(client.sessionId);
    this.state.spieler.delete(client.sessionId); this.extra.delete(client.sessionId);
  }
  onDispose() { /* nichts speichern, SpielRaum.aktiv bleibt die Hauptwelt */ }

  // ---------- Regeln des Schießstands ----------
  unsterblich() { return true; }
  imLagerSafe() { return false; }
  legeHin() { return null; }               // Pfeile bleiben nicht liegen
  speichereSpieler() {} speichereWelt() {} speichereAlles() {}
  xpGeben() {}
  botsAnpassen() {}

  einst() { return SpielRaum.einstellungen ?? {}; }

  waffeWaehlen(sid, name) {
    const p = this.state.spieler.get(sid), x = this.extra.get(sid);
    if (!p || !x || !SS_WAFFEN.includes(name)) return;
    p.waffe = name === 'faust' ? '' : name;
    p.nachladen = 0; x.nRest = 0;
    WP.abgleich(p, x, this.einst());
    this.statSchmutzig = true;
  }

  // ---------- Fahrzeug am Lager ----------
  // Auswahl: '' (keins), 'puma', 'leopard' (Evakuierungspanzer-Fahrzeug, Turm/MG/Kanone);  es steht vor dem Lager
  fahrzeugWaehlen(art) {
    if (!SS_FAHRZEUGE.includes(art) || art === this.fahrzeug) return;
    this.fahrzeug = art;
    const s = this.state;
    if (this.leopardId && art !== 'leopard') { s.fahrzeuge.delete(this.leopardId); this.leopardId = null; s.evakArt = ''; }
    if (art === 'leopard' && !this.leopardId) {
      const f = new Fahrzeug();
      f.x = SS_FZ_LEOPARD.x; f.y = SS_FZ_LEOPARD.y; f.richtung = SS_FZ_LEOPARD.richtung; f.turm = f.richtung; f.art = 'evakuierung'; f.farbe = 0; f.haelt = true;
      this.leopardId = 'leopard1'; s.fahrzeuge.set(this.leopardId, f); s.evakArt = 'panzer';
      this.leopard = new Leopard(this, 'Leopard');
    }
    this.statSchmutzig = true;
  }

  // selbst fahrbares Fahrzeug (boxer, puma, leopard) neben den Spieler stellen; '' oder dieselbe Art noch einmal = entfernen
  fahrbarWaehlen(sid, art) {
    const p = this.state.spieler.get(sid);
    if (!p) return;
    const alt = this.fahrbare.vonBesitzer(sid);
    if (!art || art === alt?.art) { this.fahrbare.entfernen(sid); this.statSchmutzig = true; return; }
    if (!FAHRBAR_ARTEN.includes(art) || p.anBord) return;
    this.fahrbare.setzen(sid, art, p);
    this.statSchmutzig = true;
  }

  fahrzeugSchritt(dt) {
    const s = this.state, bw = this.einst().bundeswehr ?? {};
    if (this.fahrzeug === 'leopard') {
      const f = s.fahrzeuge.get(this.leopardId);
      if (f) this.leopard.schritt(f, dt, leopardEinst({ leopardReichweite: 29, leopardPause: 0.4, leopardSchaden: 100, leopardKanone: true, leopardKanonePause: 8, leopardKanoneMin: 10, ...bw }, 0.8));
    }
  }

  // ---------- Zombies ----------
  zombiesStarten(n) {
    if (!Number.isFinite(n) || n < 1) return;
    n = Math.min(Math.round(n), ZOMBIE_MAX);
    const fehlt = Math.max(0, ZOMBIE_MAX - this.state.zombies.size - this.warteschlange);
    this.warteschlange += Math.min(n, fehlt);
    this.statSchmutzig = true;
  }

  zombieErzeugen() {
    const sid = this.state.spieler.keys().next().value;
    for (let versuch = 0; versuch < 20; versuch++) {
      const x = SS_START.x + (this.rnd() - 0.5) * 520, y = SS_ZOMBIE_Y + this.rnd() * 40;
      if (!frei(this.welt, x, y, W.zombieRadius + 2)) continue;
      const id = this.setzeZombie(x, y, '');
      const z = this.state.zombies.get(id), info = this.zombieInfo.get(id);
      z.variante = Math.floor(this.rnd() * ZOMBIE_TYPEN.length);      // alle Typen gemischt
      z.richtung = -Math.PI / 2; z.jagt = true;
      info.ziel = sid ?? null; info.schlaeft = false; info.steht = false; info.bleibt = true; info.uebung = true;
      return true;
    }
    return false;
  }

  zuruecksetzen() {
    this.state.zombies.clear(); this.zombieInfo.clear(); this.state.leichen.clear(); this.leichenInhalt.clear(); this.state.boden.clear();
    this.warteschlange = 0; this.granaten.liste.length = 0; this.leopard.kuehlK = 3;
    for (const b of [...this.fahrbare.liste]) this.fahrbare.entfernen(b.besitzer);   // selbst gefahrene Fahrzeuge weg, Spieler steigen aus
    this.state.besiegt = 0;
    for (const [sid, p] of this.state.spieler) {
      const x = this.extra.get(sid);
      p.x = SS_START.x; p.y = SS_START.y; p.hp = 100; p.unten = false; p.infektion = 0; p.richtung = Math.PI / 2; p.besiegt = 0;
      if (x) { x.pause = 0; x.nRest = 0; x.eingabe = { dx: 0, dy: 0, s: false }; }
      p.nachladen = 0; p.magazin = 0; if (x) x.mag = [null, null, null];
      WP.abgleich(p, x ?? {}, this.einst());
    }
    this.statistikLeeren();
    this.stuetzpunkt.start(null, false);
    this.statSchmutzig = true;
  }

  // ---------- Auswertung ----------
  statistikLeeren() {
    this.stat = {};
    for (const n of [...SS_WAFFEN, SS_GRANATE]) this.stat[n] = { schuesse: 0, treffer: 0, kills: 0, munition: 0 };
    this.panzerKills = 0;   // Abschüsse des gewählten Fahrzeugs
    this.schussKontext = null; this.quelle = null;
  }

  // Schaden mit Zurechnung: Schüsse des Spielers (Kontext des laufenden Schusses oder der Explosion), Abschüsse des Panzers
  schaden(id, z, menge, von, vonSid = null) {
    const spieler = [...this.state.spieler.values()];
    const vomSpieler = spieler.includes(von);
    const tier = !id.startsWith('spieler:');
    const vorher = tier ? this.state.zombies.get(id) : null;
    const lebteMal = !!vorher;
    super.schaden(id, z, menge, von, vonSid);
    if (!tier || !lebteMal) return;
    const tot = !this.state.zombies.has(id);
    if (vomSpieler) {
      const k = this.quelle ?? this.schussKontext;
      if (k) {
        if (!k.getroffen) k.getroffen = true;
        if (tot && this.stat[k.waffe]) this.stat[k.waffe].kills++;
        this.statSchmutzig = true;
      }
    } else if (tot && von && [this.stuetzpunkt.schuetze, this.leopard?.schuetze, ...this.fahrbare.schuetzen()].includes(von)) { this.panzerKills++; this.statSchmutzig = true; }
  }

  // jeder Schuss/Schlag des Spielers: Waffe merken, danach prüfen, ob geschossen wurde und ob er getroffen hat
  spielerSchritt(id, p, x, dt) {
    const [name] = aktiveWaffe(p);
    const kontext = { waffe: name, getroffen: false };
    const pause0 = x.pause ?? 0;
    this.schussKontext = kontext;
    try { super.spielerSchritt(id, p, x, dt); } finally { this.schussKontext = null; }
    if (pause0 - dt <= 0 && (x.pause ?? 0) > 0 && this.stat[name]) {
      const st = this.stat[name];
      st.schuesse++;
      if (WAFFEN[name]?.fern) st.munition++;
      if (kontext.getroffen && !WAFFEN[name]?.granate) st.treffer++;
      this.statSchmutzig = true;
    }
  }

  werte() {
    const e = this.einst(), out = {};
    for (const n of SS_WAFFEN) {
      const w = WAFFEN[n], ew = e.waffen?.[n];
      out[n] = {
        schaden: ew?.schaden ?? w.schaden, pause: ew?.pause ?? w.pause,
        reichweite: Math.round((e.reichweite?.[n] ?? w.reichweite / (KACHEL / 4)) * 10) / 10,
        magazin: w.fern ? WP.magGroesse(n, e) : 0, nachlade: w.fern ? WP.nachladeDauer(n, e) : 0, fern: !!w.fern,
        nebenSchaden: w.nebenSchaden ? w.nebenSchaden * (ew?.schaden ?? w.schaden) / w.schaden : 0,
      };
    }
    out[SS_GRANATE] = { schaden: GRANATE.schadenZombie, pause: 0.6, reichweite: GRANATE.wurfWeite / 8, magazin: 0, nachlade: 0, fern: false, radius: Math.round(GRANATE.radius / 8 * 10) / 10 };
    return out;
  }

  statSenden(client) {
    const clients = client ? [client] : this.clients;
    const e = this.einst();
    const daten = {
      stat: this.stat, werte: this.werte(), zombieLeben: e.zombieLeben ?? 100,
      zombies: this.state.zombies.size, warten: this.warteschlange, panzer: this.fahrzeug === 'puma', fahrzeug: this.fahrzeug, panzerKills: this.panzerKills,
    };
    for (const c of clients) c.send('ss_stat', { ...daten, fahrbar: this.fahrbare.vonBesitzer(c.sessionId)?.art ?? '' });
    this.statSchmutzig = false;
  }

  // ---------- Takt ----------
  schritt(dt) {
    const s = this.state;
    if (s.spieler.size === 0) return;
    s.zeit += dt;
    // Wegefeld der Zombies (nur wenn sich der Spieler bewegt hat)
    this.feldZeit -= dt; this.feldAlter = (this.feldAlter ?? 0) + dt;
    if (this.feldZeit <= 0) { this.feldZeit = 0.4; this.baueFeld(''); }
    for (const [id, p] of s.spieler) {
      const x = this.extra.get(id);
      if (!x) continue;
      // unsterblich, satt, unbegrenzter Vorrat (Magazin wie im Spiel: der Vorrat füllt nach)
      p.hp = 100; p.unten = false; p.infektion = 0; p.zombie = 0; p.durst = 100; p.hunger = 100;
      p.munition = MUNITION_MAX; p.pfeile = PFEILE_MAX; p.granaten = GRANATEN_MAX;
      if (zaehle(p.rucksack, 'granate') < 4) fuegeHinzu(p.rucksack, p.plaetze, 'granate', 4 - zaehle(p.rucksack, 'granate'));
      this.spielerSchritt(id, p, x, dt);
      p.hp = 100; p.unten = false; p.infektion = 0;
    }
    // Zombies nachrücken lassen
    this.spawnT -= dt;
    if (this.warteschlange > 0 && this.spawnT <= 0) {
      this.spawnT = SPAWN_TAKT;
      for (let i = 0; i < SPAWN_JE_TAKT && this.warteschlange > 0; i++) { this.warteschlange--; this.zombieErzeugen(); this.statSchmutzig = true; }
    }
    // Übungszombies verlieren den Spieler nie
    const sid = s.spieler.keys().next().value;
    for (const info of this.zombieInfo.values()) if (info.uebung && sid) { info.ziel = sid; info.verloren = 0; info.schlaeft = false; info.steht = false; }
    this.berechneNah();
    this.baueZombieRaster();
    for (const [id, z] of s.zombies) { if (this.zombieInfo.get(id)) this.zombieSchritt(id, z, dt); }
    this.zRaster = null;
    for (const p of s.spieler.values()) { p.hp = 100; p.unten = false; p.infektion = 0; }   // Bisse in diesem Takt zählen nicht
    this.stuetzpunkt.schritt(dt);
    this.fahrzeugSchritt(dt);
    this.fahrbare.schritt(dt);
    this.granaten.schritt(dt);
    this.leichenAltern(dt);
    this.statT -= dt;
    if (this.statT <= 0) { this.statT = STAT_TAKT; if (this.statSchmutzig || s.zombies.size) this.statSenden(); }
  }
}

// Bundeswehr-Standort im Schießstand: nur der Puma (und nur, wenn er als Fahrzeug gewählt ist), keine MG-Nester, Soldaten, Ärzte, kein Fall des Lagers
class SchiessstandBasis extends Stuetzpunkt {
  einst() { return { aktiv: true, falltage: 0, mgMunition: 0, pumaMunition: 0, pumaPause: this.raum.einst?.().bundeswehr?.pumaPause }; }
  schritt(dt) {
    const s = this.raum.state;
    if (!this.sp || s.stuetzpunkt !== 'steht' || !this.puma) return;
    if (this.raum.fahrzeug === 'puma') this.pumaSchritt(this.puma, dt);
  }
}

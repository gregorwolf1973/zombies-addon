// Spielraum: der Server entscheidet über Bewegung, Zombies, Treffer, Gegenstände und Safe Rooms.
import crypto from 'node:crypto';
import { holeFragen } from './fragenquelle.mjs';
import { mischeAntworten, waehleFrage } from './raetsel.mjs';
import { botSchritt, BOT_NAMEN, botGegenangebot, botEinverstanden } from './bots.mjs';
import { botBefehl } from './botplan.mjs';
import { Mensch, Stadtleben } from './menschen.mjs';
import { Fahrzeug, Verkehr } from './verkehr.mjs';
import { Feuer, Brandstifter } from './feuer.mjs';
import { Zombiewelle } from './welle.mjs';
import { Aufgabe, Aufgaben } from './aufgaben.mjs';
import { Stuetzpunkt } from './stuetzpunkt.mjs';
import { Granaten } from './granaten.mjs';
import * as FK from './faehigkeiten.mjs';
import { innenraumFuer } from '../client/innen.mjs';
import { baueWeltAusKarte } from '../client/osmwelt.mjs';
import { lautstaerke } from '../client/sprache_regeln.mjs';
import { Room, ServerError } from '@colyseus/core';
import { schema, t } from '@colyseus/schema';
import {
  KACHEL, BREITE, HOEHE, T, WERTE as W, baueWelt, bewege, frei, sichtfrei, drinnen, istNacht, hausHell, aktiveWaffe, zaunUeberstieg, durchsuchDauer, freiTier, tierGelaende,
  bewaffnetSoll, zombieSoll, zufall, schlossArt, safeRoomVon, WELT_VERSION, setzeTageszeiten,
  DINGE, RUCKSACK_PLAETZE, KISTE_PLAETZE, BEUTE, MUNITION_PRO_FUND, AKTION_ABSTAND,
  BLOCKIERT, ziehe, MUNITION_MAX, TEMPO_MG, traegtMg, BEUTE_BONUS, setzeKartengroesse, INFEKTION_DAUER, ZOMBIE_ZEIT, LEICHE_SELTEN, LEICHE_OFT, LEICHE_DAUER, LEICHEN_MAX, BODEN_DAUER, TAUSCH_ABSTAND,
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
  afk: t.boolean(),         // true = untätig, ein Bot steuert die Figur (Client: 🤖 hinter dem Namen)
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
  ruht: t.boolean(),        // ruht auf einem Feldbett im Safe Room (Leben +1/s, Hunger/Durst halb so schnell)
  spricht: t.boolean(),     // spricht gerade ins Mikrofon (Sprachübertragung, zeigt 🔊 über der Figur)
}, 'Spieler');

export const Zombie = schema({
  x: t.number(), y: t.number(),
  richtung: t.number(),
  jagt: t.boolean(),
  hp: t.uint8(),
  kriecht: t.boolean(),     // „nicht ganz tot“: robbt am Boden
  ebene: t.string(),
  variante: t.uint8(),      // Zombietyp 0–24 (Reihenfolge ZOMBIE_TYPEN in einstellungen.mjs)
}, 'Zombie');

export const Behaelter = schema({ rest: t.uint8() }, 'Behaelter');
export const Leiche = schema({ x: t.number(), y: t.number(), richtung: t.number(), rest: t.uint8(), alter: t.number(), variante: t.uint8(), ebene: t.string() }, 'Leiche');
export const BodenDing = schema({ x: t.number(), y: t.number(), ding: t.string(), alter: t.number(), ebene: t.string() }, 'BodenDing');
// Türen: Zimmertüren ('ebene:x,y') und Haustüren ('haus:nr'). barrikade und hp 0–100, kaputt = zerbrochen (bleibt offen)
export const Tuer = schema({ offen: t.boolean(), verschlossen: t.boolean(), barrikade: t.number(), hp: t.number(), kaputt: t.boolean() }, 'Tuer');
function neueTuer(offen, verschlossen) {
  const st = new Tuer();
  st.offen = !!offen; st.verschlossen = !!verschlossen; st.barrikade = 0; st.hp = TUER_HP; st.kaputt = false;
  return st;
}
export const Safe = schema({ barrikade: t.number(), kiste: t.array("string") }, 'Safe');

export const Zustand = schema({
  seed: t.number(),
  karte: t.string(),        // '' = Dorf (erzeugt), sonst Name der OSM-Karte, z. B. 'geretsried'
  phase: t.string(),        // "spiel" | "erwischt"
  zeit: t.number(),         // Spielzeit in Sekunden (wird gespeichert)
  besiegt: t.uint16(),
  torGeloest: t.uint8(),    // richtig beantwortete Rätsel am Tor (3 = offen)
  level: t.uint8(),         // 1 = erste Karte, nach jedem geschafften Evakuierungsbus eins mehr (server/aufgaben.mjs)
  funk: t.boolean(),        // Funkspruch abgesetzt: der Evakuierungsbus kommt
  busAnkunft: t.number(),   // Ankunftszeit des Busses (Spielminuten am Tag), -1 = noch kein Funkspruch
  busAb: t.number(),        // Abfahrtszeit des wartenden Busses (Spielminuten am Tag)
  busDa: t.boolean(),       // der Bus steht am Ortsausgang
  busBord: t.uint8(),       // so viele sind an Bord ...
  busGesamt: t.uint8(),     // ... von so vielen lebenden Spielern (mit Bots)
  aufgaben: t.map(Aufgabe), // gemeinsame Aufgaben dieses Levels
  uhr: t.number(),          // Tageszeit in Spielminuten (0–1439)
  tagAb: t.number(),        // ab hier ganz hell (Einstellung, für die Clients)
  nachtAb: t.number(),      // ab hier ganz dunkel
  nachtDunkel: t.number(),  // Nachtdunkelheit in % (Einstellung, für die Clients)
  zombieGroesse: t.number(),   // Zombiegröße in % (Einstellung, für die Clients)
  leichenGroesse: t.number(), // Leichengröße in %
  groesseGesamt: t.number(),  // Gesamtgröße (Zombies + Leichen) in %
  autos: t.uint8(),         // Autodichte der Welt (10 = normal), gilt bis zum Neustart der Welt
  spieler: t.map(Spieler),
  zombies: t.map(Zombie),
  behaelter: t.map(Behaelter),   // nur schon durchsuchte
  leichen: t.map(Leiche),       // tote Zombies, die eine Weile liegen bleiben
  boden: t.map(BodenDing),      // weggeworfene Gegenstände
  tueren: t.map(Tuer),          // Zimmertüren der betretenen Häuser ('ebene:x,y') und Haustüren mit Zustand ('haus:nr')
  safes: t.map(Safe),
  menschen: t.map(Mensch),      // Bewohner der Stadt (Abschnitt 4)
  fahrzeuge: t.map(Fahrzeug),   // Linienbus, Verkehr, Polizei, Feuerwehr, Wracks
  feuer: t.map(Feuer),
  verbrannt: t.map('boolean'),  // 'haus:nr', 'auto:bID', 'bus:ID', 'fz:ID'
  kegel: t.boolean(),           // Sichtkegel der Zombies anzeigen (Einstellung)
  tuerFrei: t.uint8(), tuerRaetsel: t.uint8(), tuerSchluessel: t.uint8(),   // Anteile der Schlossarten verschlossener Zimmertüren in % (Einstellung, der Client berechnet damit schlossArt)
  stuetzpunkt: t.string(),      // Bundeswehr-Stützpunkt: '' = keiner, 'steht', 'gefallen' oder 'aus' (server/stuetzpunkt.mjs)
  bwTurm: t.number(),           // Drehwinkel des Puma-Turms (Bogenmaß), der Turm dreht sich zum Ziel
  bwX: t.number(), bwY: t.number(), bwW: t.number(),   // Puma: Position (Turmmitte) und Fahrtrichtung der Wanne, er patrouilliert an der Front
}, 'Zustand');

const TUER_HP = 100;          // Haltbarkeit einer Tür (nach der Barrikade)
const TUER_SCHADEN = 4;       // hp pro Sekunde und hämmerndem Zombie
const TUER_SCHADEN_ZU = 2.8;  // verschlossene Zimmertüren halten länger
const BARRIKADE_SCHADEN = 2;  // Barrikade pro Sekunde und Zombie
const BRETT_STAERKE = 35;

const TICK = 50; // ms → 20 Updates pro Sekunde
const ZOMBIE_HP = 100;   // Vorgabe; wirksam ist die Einstellung zombieLeben
const STOSS_WEG = 34;   // Schläger und Faust stoßen den Zombie zurück (Waffenwerte: WAFFEN in client/welt.mjs)
const ANKUNFT_ZOMBIEFREI = 144;   // Pixel (4,5 Kacheln): so weit um den Ankunftspunkt entstehen beim ersten Betreten keine Zombies
const SCHONZEIT_EBENE = 1;   // Sekunden nach einem Ebenenwechsel, in denen Zombies nicht beißen
const BISS_PRO_SEK = 14;
const KRIECHER_CHANCE = 0.25, KRIECHER_HP = 35, KRIECHER_TEMPO = 0.28, KRIECHER_SPUERT = 110;
const BISS_CHANCE = 0.12;   // pro Sekunde Kontakt: Wahrscheinlichkeit für einen infizierenden Biss
const SPRITZE_ABSTAND = 50;
const LAMPE_DAUER = 3600;   // eine Taschenlampe leuchtet etwa eine Stunde
const START_MUNITION = 24;
const DURST_DAUER = 3600, HUNGER_DAUER = 5400;   // Sekunden von voll bis leer
const SPEICHER_TAKT = 30;
const ID_MUSTER = /^[a-f0-9]{32}$/;
// Wegfeld der Zombies: geschlossene Zimmertüren zählen als Weg (sie hämmern sie auf), alles andere Blockierte nicht
const BLOCKIERT_FELD = new Set([...BLOCKIERT].filter(t => t !== T.INNENTUER));
const EBENE_MUSTER = /^h(\d+)(eg|keller|dach)$/;
const FERN_WEITE = 900;     // weiter als so viele px von allen Spielern weg: nur jeden FERN_TAKT-ten Takt rechnen
const FERN_TAKT = 4;
const AFK_SEKUNDEN = 60;    // so lange ohne Eingabe, dann übernimmt die Bot-Steuerung die Figur
const RASTER = 96;          // Zellgröße des Zombie-Rasters (px), je Takt neu befüllt
const WEGEFELD_TIEFE = 60;  // Wegefeld nur so viele Kacheln weit um die Spieler (2000 px) berechnen
const AUSSEHEN = /^[mws],[0-5],[0-7]$/;   // m/w = eigene Figur mit Farben, s = Survivor (feste Figur)
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

const RTC_MAX = 20000;          // größte Signalisierungsnachricht (JSON-Zeichen)
const SPRACH_PAKET_MAX = 2048;  // größtes Sprachpaket über den Server (Bytes)
const SPRACH_RATE = 60, SPRACH_BURST = 30;   // Sprachpakete je Sekunde und Absender (Eimer: Nachfüllrate, Größe)
const SPRICHT_PAUSE = 250;      // ms: höchstens 4 Wechsel je Sekunde und Spieler
const REDEN_LAERM = 200;        // px (25 m): so weit lockt Reden Zombies, wenn die Einstellung „Reden lockt“ an ist

const CHAT_MAX = 300, CHAT_VERLAUF = 100, CHAT_ANZAHL = 5, CHAT_FENSTER = 10000;

// Spielerdaten in der Form, die lautstaerke() erwartet
const sprachDaten_ = p => ({ x: p.x, y: p.y, ebene: p.ebene ?? '', rucksack: [...(p.rucksack ?? [])] });

export class SpielRaum extends Room {
  maxClients = 10;
  patchRate = TICK;

  // vom Server beim Start gesetzt (nicht über Client-Optionen änderbar)
  static einstellungen = { zugangscode: '', zombieFaktor: 1, haeuserFaktor: 1, tempoFaktor: 1, bots: 0, funde: {}, zeitraffer: 1, unsterblich: new Set() };
  static speicher = null;
  static aktiv = null;   // laufender Raum (für die Verwaltungsseite)
  static kartenWechsel = null;   // vom Server gesetzt: stellt die Karte für die nächste Welt ein (Levelwechsel)

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
    this.tageszeitenUebernehmen();
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
    this.chatVerlauf = Array.isArray(stand?.chat) ? stand.chat.slice(-CHAT_VERLAUF) : [];   // letzte Nachrichten, mit der Welt gespeichert
    this.naechsteChatId = (this.chatVerlauf.at(-1)?.id ?? 0) + 1;
    this.chatZeiten = new Map();  // sessionId → Zeitstempel der letzten Nachrichten (Flutbremse)
    this.fkVon = new WeakMap();   // Spieler → Fähigkeiten-Stand (Bots haben keinen)
    this.tausche = new Map();     // sessionId → laufender Tausch (beide Seiten zeigen auf dasselbe Objekt)
    for (const s of this.welt.safeRooms) {
      const safe = new Safe(); safe.barrikade = 0;
      this.state.safes.set(s.id, safe);
    }
    const passt = stand && stand.version === WELT_VERSION && stand.seed === this.state.seed && (stand.karte ?? '') === this.state.karte;
    this.gespeichertTueren = null;
    if (passt) {
      this.gespeicherteTuerenStand = stand.tueren ?? {};
      // Haustüren: Zustand mit Barrikade, Haltbarkeit und Bruch
      for (const [key, g] of Object.entries(this.gespeicherteTuerenStand)) {
        if (!key.startsWith('haus:') || !Array.isArray(g)) continue;
        this.state.tueren.set(key, this.tuerAusStand(g, true));
      }
      for (const [id, inhalt] of Object.entries(stand.behaelter ?? {})) this.setzeInhalt(id, inhalt);
      for (const [id, s] of Object.entries(stand.safes ?? {})) {
        const safe = this.state.safes.get(id);
        if (!safe) continue;
        safe.barrikade = Math.max(0, Math.min(100, Number(s.barrikade) || 0));
        for (const d of (s.kiste ?? []).slice(0, KISTE_PLAETZE)) if (DINGE[d]) safe.kiste.push(d);
      }
    }
    this.spiegleSafeTueren();

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
    this.welle = new Zombiewelle(this);
    this.aufgaben = new Aufgaben(this);
    this.aufgaben.start(stand, !!passt);
    this.stuetzpunkt = new Stuetzpunkt(this);
    this.stuetzpunkt.start(stand, !!passt);
    this.granaten = new Granaten(this);
    this.state.kegel = !!SpielRaum.einstellungen.sichtkegel;
    this.tuerAnteileUebernehmen();
    if (stand?.verbrannt && (stand.karte ?? '') === this.state.karte && stand.version === WELT_VERSION) for (const k of stand.verbrannt.slice(0, 2000)) this.state.verbrannt.set(String(k), true);

    this.onMessage('eingabe', (client, m) => {
      if (!m || typeof m !== 'object') return;
      let dx = Number(m.dx) || 0, dy = Number(m.dy) || 0;
      const l = Math.hypot(dx, dy);
      if (l > 1) { dx /= l; dy /= l; }
      const x = this.extra.get(client.sessionId);
      if (x) { x.eingabe = { dx, dy, s: !!m.s }; if (Math.hypot(dx, dy) > 0.05) this.ruehrt(client.sessionId); }   // der Client sendet auch im Stand alle 250 ms: nur Bewegung zählt
    });
    // jede dieser Nachrichten zeigt, dass jemand am Gerät ist (Rückkehr aus der AFK-Steuerung)
    {
      const aktiv = new Set(['aktion', 'aktion2', 'wurf', 'handel', 'handel_raetsel', 'benutze', 'wegwerfen', 'aufheben_wahl', 'kiste', 'kuehlschrank', 'ausruhen', 'antwort', 'fk_punkt', 'tausch_start', 'tausch_anbieten', 'tausch_zurueck', 'tausch_ok', 'chat', 'spricht']);
      const om = this.onMessage.bind(this);
      this.onMessage = (typ, cb) => om(typ, aktiv.has(typ) ? (c, m) => { this.ruehrt(c.sessionId); return cb(c, m); } : cb);
    }
    this.onMessage('aktion', client => this.starteAktion(client));
    this.onMessage('aktion2', client => this.starteAktion(client, true));
    this.onMessage('wurf', client => this.granaten.werfen(client));
    this.onMessage('handel', (client, m) => this.stuetzpunkt.handel(client, m));
    this.onMessage('handel_raetsel', (client, m) => this.stuetzpunkt.handelRaetsel(client, m));
    this.onMessage('benutze', (client, m) => this.benutze(client, m));
    this.onMessage('wegwerfen', (client, m) => this.wegwerfen(client, m));
    this.onMessage('aufheben_wahl', (client, m) => this.aufhebenWahl(client, m));
    this.onMessage('kiste', (client, m) => this.kiste(client, m));
    this.onMessage('kuehlschrank', client => this.kuehlschrank(client));
    this.onMessage('ausruhen', client => this.ausruhen(client));
    this.onMessage('antwort', (client, m) => this.antwort(client, m));
    this.onMessage('fk_punkt', (client, m) => this.fkPunkt(client, m));
    this.onMessage('tausch_start', (client, m) => this.tauschStart(client, m));
    this.onMessage('tausch_anbieten', (client, m) => this.tauschAnbieten(client, m));
    this.onMessage('tausch_zurueck', (client, m) => this.tauschZurueck(client, m));
    this.onMessage('tausch_ok', client => this.tauschOk(client));
    this.onMessage('tausch_ende', client => { const t = this.tausche.get(client.sessionId); if (t) this.tauschEnde(t, 'abgebrochen'); });
    this.onMessage('chat', (client, m) => this.chat(client, m));
    this.onMessage('rtc', (client, m) => this.rtcWeiter(client, m));
    this.onMessage('spricht', (client, m) => this.sprichtSetzen(client.sessionId, !!m?.an));
    this.onMessage('sprachBereit', client => { this.sprachNeu(client.sessionId); this.sprachStart(client); this.sprachPartner(); });
    this.onMessage('sprachWeg', (client, m) => this.sprachWeg(client, m));
    this.onMessage('sprachKann', (client, m) => this.sprachKann(client, m));
    this.onMessage('_$bsprachDaten', (client, m) => this.sprachDaten(client, m));   // Binärnachrichten (sendBytes) kommen mit Vorsatz _$b
    this.onMessage('ping', (client, m) => client.send('pong', m));

    this.setSimulationInterval(dt => {
      const t0 = performance.now();
      this.schritt(dt / 1000);
      this.messen('takt', t0);
    }, TICK);
    // Versand der Änderungen an die Spieler mitmessen
    const patch = this.broadcastPatch.bind(this);
    this.broadcastPatch = () => { const t0 = performance.now(); const r = patch(); this.messen('versand', t0); return r; };
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
      this.extra.set(client.sessionId, { ...x, eingabe: { dx: 0, dy: 0, s: false }, afkBot: null, letzteEingabe: Date.now() }); alt.afk = false;
      client.send('chatVerlauf', { nachrichten: this.chatVerlauf, ich: this.chatKennung(client.sessionId) });
      this.sprachStart(client); this.sprachPartner();
      return;
    }

    const p = new Spieler();
    p.name = name;
    p.farbe = this.freieFarbe();
    const gewaehlt = AUSSEHEN.test(String(optionen.aussehen ?? ''));
    p.aussehen = gewaehlt ? optionen.aussehen : this.zufallsAussehen();
    p.verbunden = true; p.unten = false; p.afk = false; p.hilfe = 0; p.richtung = 0;
    p.schleicht = false; p.aktion = ''; p.fortschritt = 0; p.sicher = ''; p.infektion = 0; p.zombie = 0; p.kleidung = 0; p.plaetze = RUCKSACK_PLAETZE; p.ebene = ''; p.lampe = 0; p.spricht = false;
    const extra = { spielerId, letzterSafe: '', pause: 0, eingabe: { dx: 0, dy: 0, s: false }, aktionZiel: null, letzteEingabe: Date.now() };
    const gespeichert = this.speicher?.ladeSpieler(spielerId);
    if (gespeichert) {
      p.hp = Math.max(25, Math.min(100, Number(gespeichert.hp) || 100));
      p.durst = Math.max(20, Math.min(100, Number(gespeichert.durst) || 100));
      p.hunger = Math.max(20, Math.min(100, Number(gespeichert.hunger) || 100));
      p.waffe = DINGE[gespeichert.waffe]?.waffe ? gespeichert.waffe : '';
      p.munition = Math.max(0, Math.min(MUNITION_MAX, Number(gespeichert.munition) || 0));
      p.besiegt = Math.max(0, Math.min(65535, Number(gespeichert.besiegt) || 0));
      if (!gewaehlt && AUSSEHEN.test(String(gespeichert.aussehen ?? ''))) p.aussehen = gespeichert.aussehen;
      p.infektion = Math.max(0, Math.min(INFEKTION_DAUER, Number(gespeichert.infektion) || 0));
      p.kleidung = Math.max(0, Math.min(100, Number(gespeichert.kleidung) || 0));
      p.lampe = Math.max(0, Math.min(LAMPE_DAUER, Number(gespeichert.lampe) || 0));
      p.plaetze = [8, 12, 16].includes(Number(gespeichert.plaetze)) ? Number(gespeichert.plaetze) : RUCKSACK_PLAETZE;
      extra.fk = FK.normiere(gespeichert.fk);
      p.plaetze += FK.wirkung.rucksack(extra.fk);
      for (const d of (gespeichert.rucksack ?? []).slice(0, p.plaetze)) if (DINGE[d]) p.rucksack.push(d);
      extra.letzterSafe = gespeichert.letzterSafe ?? '';
      // gespeichert wird nur im Safe Room: dort (im Innenraum) geht es weiter; sonst im letzten Safe Room
      const safe = this.safeFuer(extra.letzterSafe, gespeichert.x, gespeichert.y);
      const pos = safe ? this.safePlatz(safe) : { ...this.freierPlatz(this.welt.start), ebene: '' };
      p.x = pos.x; p.y = pos.y; p.ebene = pos.ebene;
    } else {
      p.hp = 100; p.durst = 100; p.hunger = 100; p.besiegt = 0;
      const pos = this.freierPlatz(this.welt.start, this.state.spieler.size);
      p.x = pos.x; p.y = pos.y;
      const bewaffnet = [...this.state.spieler.values()].filter(s => s.waffe === 'pistole').length;
      if (bewaffnet < bewaffnetSoll(this.state.spieler.size + 1)) { p.waffe = 'pistole'; p.munition = START_MUNITION; }
      else { p.waffe = ''; p.munition = 0; }
      p.rucksack.push('wasser');
    }
    if (!extra.fk) { extra.fk = FK.neuerStand(); }
    this.fkVon.set(p, extra.fk);
    this.state.spieler.set(client.sessionId, p);
    this.extra.set(client.sessionId, extra);
    this.speichereSpieler(client.sessionId);
    this.fkSenden(client.sessionId);
    client.send('chatVerlauf', { nachrichten: this.chatVerlauf });
    this.broadcast('meldung', { text: `${p.name} ist dabei` }, { except: client });
    this.botsAnpassen();
    this.sprachStart(client); this.sprachPartner();
  }

  // ---------- Sprachübertragung (WebRTC-Signalisierung; die Sprache selbst läuft direkt zwischen den Browsern) ----------
  sprachEinst() {
    const sp = SpielRaum.einstellungen.sprache ?? {};
    return { an: sp.an !== false, hoerweite: sp.hoerweite ?? 40, stockwerk: sp.stockwerk ?? 0.35, drinnenDraussen: sp.drinnenDraussen ?? 0.10, funk: sp.funk ?? 0.7, redenLockt: !!sp.redenLockt };
  }

  // nur an den neuen Client: ICE-Server und Sprach-Einstellungen
  sprachStart(client) {
    client.send('sprachStart', { ice: SpielRaum.einstellungen.ice ?? [], einst: this.sprachEinst() });
  }

  // alle verbundenen Menschen (keine Bots, keine abgerissenen Verbindungen)
  sprachPartner() {
    const ids = [];
    for (const [sid, p] of this.state.spieler) if (!this.extra.get(sid)?.bot && p.verbunden) ids.push(sid);
    this.broadcast('sprachPartner', { ids });
  }

  // Signalisierung: nur an genau einen verbundenen Menschen weiterreichen
  rtcWeiter(client, m) {
    const an = String(m?.an ?? '');
    const von = client.sessionId;
    if (!an || an === von || !this.sprachEinst().an) return;
    if (this.extra.get(von)?.bot || this.extra.get(an)?.bot || !this.state.spieler.get(an)?.verbunden) return;
    let groesse = Infinity;
    try { groesse = JSON.stringify(m.daten ?? null).length; } catch { /* zirkulär o. ä. */ }
    if (groesse > RTC_MAX) return;
    this.clients.find(c => c.sessionId === an)?.send('rtc', { von, daten: m.daten });
  }

  // ---------- Sprache über den Server (Ausweichweg, wenn die direkte WebRTC-Verbindung eines Paars nicht zustande kommt) ----------
  // Paar auf Server-Weg: x.serverPartner (Set von sessionIds, symmetrisch). Binärpaket: siehe client/sprache_kodierung.mjs.
  sprachNr(sid) {
    const x = this.extra.get(sid);
    if (!x) return 0;
    if (x.sprachNr) return x.sprachNr;
    const belegt = new Set([...this.extra.values()].map(e => e.sprachNr));
    let n = (this.sprachZaehler = ((this.sprachZaehler ?? 0) % 255) + 1);
    for (let i = 0; i < 255 && belegt.has(n); i++) n = n % 255 + 1;
    return x.sprachNr = n;
  }

  // Beitritt (neue Seite) oder Verlassen: alle Server-Paare des Spielers lösen, die anderen erfahren es (dann wieder WebRTC)
  sprachNeu(sid) {
    for (const [anderer, y] of this.extra) {
      if (anderer === sid || !y.serverPartner?.delete(sid)) continue;
      this.clients.find(c => c.sessionId === anderer)?.send('sprachWeg', { mit: sid, server: false });
      this.sprachFormatMelden(anderer);
    }
    const x = this.extra.get(sid);
    if (x?.serverPartner?.size) { x.serverPartner.clear(); this.sprachFormatMelden(sid); }
  }

  sprachWeg(client, m) {
    const von = client.sessionId, mit = String(m?.mit ?? '');
    const x = this.extra.get(von), y = this.extra.get(mit);
    if (!x || !y || x.bot || y.bot || von === mit || !m?.server || !this.sprachEinst().an) return;
    if (!this.state.spieler.get(mit)?.verbunden) return;
    (x.serverPartner ??= new Set()).add(mit);
    (y.serverPartner ??= new Set()).add(von);
    client.send('sprachWeg', { mit, server: true, nr: this.sprachNr(mit) });
    this.clients.find(c => c.sessionId === mit)?.send('sprachWeg', { mit: von, server: true, nr: this.sprachNr(von) });
    this.sprachFormatMelden(von); this.sprachFormatMelden(mit);
  }

  sprachKann(client, m) {
    const x = this.extra.get(client.sessionId);
    if (!x || x.bot) return;
    x.kannOpus = m?.opus === true;
    // auch die Formate derer neu prüfen, die diesen Client als Server-Partner haben
    this.sprachFormatMelden(client.sessionId);
    for (const anderer of x.serverPartner ?? []) this.sprachFormatMelden(anderer);
  }

  // Format je Absender: Opus nur, wenn er selbst und alle seine Server-Partner Opus können; sonst μ-law
  sprachFormatMelden(sid) {
    const x = this.extra.get(sid);
    if (!x || x.bot) return;
    let format = x.kannOpus ? 0 : 1;
    for (const q of x.serverPartner ?? []) if (!this.extra.get(q)?.kannOpus) format = 1;
    if (x.sprachFormat === format) return;
    x.sprachFormat = format;
    this.clients.find(c => c.sessionId === sid)?.send('sprachFormat', { format });
  }

  // Binärpaket eines Spielers an seine Server-Partner in Hörweite (oder per Funk)
  sprachDaten(client, bytes) {
    const t0 = performance.now();
    const von = client.sessionId, x = this.extra.get(von);
    if (!x || x.bot || !x.serverPartner?.size || !bytes?.length || bytes.length > SPRACH_PAKET_MAX) return;
    const einst = this.sprachEinst();
    if (!einst.an) return;
    const e = x.sprachEimer ??= { n: SPRACH_BURST, t: t0 };   // Eimer: SPRACH_RATE Pakete/s, kurze Spitzen bis SPRACH_BURST
    e.n = Math.min(SPRACH_BURST, e.n + (t0 - e.t) * SPRACH_RATE / 1000); e.t = t0;
    if (e.n < 1) return;
    e.n -= 1;
    if (bytes[0] !== 0 && bytes[0] !== 1) return;   // unbekanntes Format
    const ich = this.state.spieler.get(von);
    if (!ich?.verbunden) return;
    let paket = null;
    for (const ziel of x.serverPartner) {
      const y = this.extra.get(ziel), er = this.state.spieler.get(ziel);
      if (!y || y.bot || !er?.verbunden) continue;
      const l = lautstaerke(sprachDaten_(er), sprachDaten_(ich), this.welt, einst);   // wie laut hört der Empfänger den Sprecher
      if (!(l.nah > 0.01 || l.funk > 0.01)) continue;
      const c = this.clients.find(k => k.sessionId === ziel);
      if (!c) continue;
      if (!paket) { paket = new Uint8Array(bytes.length + 1); paket[0] = this.sprachNr(von); paket.set(bytes, 1); }
      c.sendBytes('sprachDaten', paket);
    }
    this.messen('sprache', t0);
  }

  sprichtSetzen(sid, an) {
    const p = this.state.spieler.get(sid), x = this.extra.get(sid);
    if (!p || !x || x.bot) return;
    if (an && !this.sprachEinst().an) an = false;
    const jetzt = Date.now();
    if (jetzt - (x.sprichtZeit ?? 0) < SPRICHT_PAUSE) { x.sprichtOffen = an; return; }   // zu schnell: später (im Takt) nachholen
    x.sprichtOffen = undefined; x.sprichtZeit = jetzt;
    p.spricht = an;
  }

  // im Takt: aufgeschobene Wechsel nachholen, Reden lockt Zombies
  sprachSchritt(dt) {
    const jetzt = Date.now();
    for (const [sid, x] of this.extra) {
      if (x.sprichtOffen !== undefined && jetzt - (x.sprichtZeit ?? 0) >= SPRICHT_PAUSE) this.sprichtSetzen(sid, x.sprichtOffen);
    }
    this.redenUhr = (this.redenUhr ?? 0) - dt;
    if (this.redenUhr > 0) return;
    this.redenUhr = 0.5;
    const sp = this.sprachEinst();
    if (!sp.an || !sp.redenLockt) return;
    for (const [sid, p] of this.state.spieler) {
      if (!p.spricht || !p.verbunden || this.extra.get(sid)?.bot) continue;
      this.laerm(p.x, p.y, REDEN_LAERM, false, p.ebene);
    }
  }

  // Text-Chat für alle im Raum, unabhängig von der Entfernung
  // Kurzkennung des Absenders (aus der Spieler-ID abgeleitet, die ID selbst geht nicht an andere – sonst könnte man Figuren übernehmen)
  chatKennung(sid) {
    const id = this.extra.get(sid)?.spielerId ?? sid;
    return crypto.createHash('sha256').update('chat:' + id).digest('hex').slice(0, 12);
  }

  chat(client, m) {
    const p = this.state.spieler.get(client.sessionId), x = this.extra.get(client.sessionId);
    if (!p || !x || x.bot) return;
    const text = String(m?.text ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, CHAT_MAX).trim();
    if (!text) return;
    const jetzt = Date.now();
    const zeiten = (this.chatZeiten.get(client.sessionId) ?? []).filter(z => jetzt - z < CHAT_FENSTER);
    if (zeiten.length >= CHAT_ANZAHL) { this.chatZeiten.set(client.sessionId, zeiten); client.send('meldung', { text: 'Langsam – zu viele Nachrichten' }); return; }
    zeiten.push(jetzt); this.chatZeiten.set(client.sessionId, zeiten);
    let ort = 'draußen';
    const safe = safeRoomVon(this.welt, p);
    if (safe) ort = '🛡 ' + safe.name;
    else if (p.ebene) {
      const e = EBENE_MUSTER.exec(p.ebene);
      ort = (e && this.welt.haeuser?.[Number(e[1])]?.name) || 'in einem Haus';
    }
    const nachricht = { id: this.naechsteChatId++, von: this.chatKennung(client.sessionId), name: p.name, farbe: p.farbe, zeit: jetzt, text, ort };
    this.chatVerlauf.push(nachricht);
    if (this.chatVerlauf.length > CHAT_VERLAUF) this.chatVerlauf.splice(0, this.chatVerlauf.length - CHAT_VERLAUF);
    this.broadcast('chat', nachricht);
    botBefehl(this, client.sessionId, text);   // Befehle an die Bots („Resi, hol wasser“), siehe botplan.mjs
  }

  // AFK: Wer AFK_SEKUNDEN lang nichts getan hat, wird von der Bot-Steuerung gespielt (x.afkBot, p.afk) – bis zur nächsten Eingabe
  ruehrt(sid) {
    const x = this.extra.get(sid);
    if (!x || x.bot) return;
    x.letzteEingabe = Date.now();
    if (x.afkBot) {
      x.afkBot = null; x.eingabe = { dx: 0, dy: 0, s: false };
      const p = this.state.spieler.get(sid);
      if (p) { p.afk = false; this.broadcast('meldung', { text: `${p.name} ist wieder da` }); }
    }
  }

  afkPruefen(sid, p, x) {
    if (p.verbunden === false) {   // Verbindung weg: die Figur steht still und wartet (siehe onDrop)
      if (x.afkBot) { x.afkBot = null; p.afk = false; x.eingabe = { dx: 0, dy: 0, s: false }; }
      return;
    }
    if (x.afkBot) return;
    x.letzteEingabe ??= Date.now();
    if (Date.now() - x.letzteEingabe < (this.afkSekunden ?? AFK_SEKUNDEN) * 1000) return;
    x.afkBot = { nr: 0, afk: true, plan: { rolle: 'begleiter', auftrag: null, pause: 0 } };
    p.afk = true; p.spricht = false;
    this.broadcast('meldung', { text: `🤖 ${p.name} ist untätig – ein Bot übernimmt die Figur` });
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
    const r = this.rnd();
    return `${r < 0.2 ? 's' : r < 0.6 ? 'm' : 'w'},${Math.floor(this.rnd() * 6)},${Math.floor(this.rnd() * 8)}`;
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

  // freier Platz im Innenraum eines Safe Rooms (n: für mehrere Spieler leicht versetzt)
  safePlatz(safe, n = 0) {
    const w = this.wv(safe.ebene);
    return { ...this.freierPlatz(w.start, n, safe.ebene), ebene: safe.ebene };
  }

  safeFuer(id, x, y) {
    const s = this.welt.safeRooms.find(r => r.id === id);
    if (s) return s;
    let best = this.welt.safeRooms[0], bd = Infinity;
    for (const r of this.welt.safeRooms) {
      const d = Number.isFinite(x) ? Math.hypot(r.vorTuer.x - x, r.vorTuer.y - y) : 0;
      if (d < bd) { bd = d; best = r; }
    }
    return best;
  }

  onDrop(client) {
    // Verbindung weg: Figur bleibt 2 Minuten stehen und wartet
    const p = this.state.spieler.get(client.sessionId);
    if (!p) return;   // Beitritt wurde abgelehnt – nichts zu halten
    p.verbunden = false; p.aktion = ''; p.spricht = false;
    this.sprachPartner();
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
    this.ruehrt(client.sessionId);
    this.sprachStart(client); this.sprachPartner();
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
    this.sprachNeu(client.sessionId);
    this.extra.delete(client.sessionId);
    this.botsAnpassen();
    this.sprachPartner();
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
    if (safeRoomVon(this.welt, p)) return false;   // Safe Rooms haben Notlicht
    const m = EBENE_MUSTER.exec(p.ebene);
    return !m || !hausHell(Number(m[1]), m[2], this.state.uhr);
  }

  // Tag/Nacht-Zeiten aus den Einstellungen: für die Regeln auf dem Server und im Zustand für die Clients
  tageszeitenUebernehmen() {
    const e = SpielRaum.einstellungen ?? {};
    setzeTageszeiten(e.tagAb ?? 420, e.nachtAb ?? 1290);
    if (this.state) { this.state.tagAb = e.tagAb ?? 420; this.state.nachtAb = e.nachtAb ?? 1290; this.state.nachtDunkel = e.nachtDunkel ?? 92; this.state.zombieGroesse = e.zombieGroesse ?? 100; this.state.leichenGroesse = e.leichenGroesse ?? 100; this.state.groesseGesamt = e.groesseGesamt ?? 100; }
  }

  einstellungenGeaendert() {
    this.tageszeitenUebernehmen();
    this.botsAnpassen();
    const sprache = this.sprachEinst();
    if (!sprache.an) for (const p of this.state.spieler.values()) p.spricht = false;
    this.broadcast('spracheEinst', { einst: sprache });
    this.state.kegel = !!SpielRaum.einstellungen.sichtkegel;
    this.tuerAnteileUebernehmen();
    const soll = this.zombieSollJetzt();
    // zu viele Zombies draußen: die am weitesten entfernten, nicht jagenden verschwinden
    const draussen = [...this.state.zombies.entries()].filter(([id, z]) => !z.ebene && !z.jagt && !this.zombieInfo.get(id)?.welle);
    const spieler = [...this.state.spieler.values()].filter(p => !p.ebene);
    const abstand = z => Math.min(...spieler.map(p => Math.hypot(p.x - z.x, p.y - z.y)), Infinity);
    draussen.sort((a, b) => abstand(b[1]) - abstand(a[1]));
    for (const [id] of draussen.slice(0, Math.max(0, draussen.length - soll))) { this.state.zombies.delete(id); this.zombieInfo.delete(id); }
  }

  zeitraffer() { return SpielRaum.einstellungen.zeitraffer || 1; }
  einstellungen() { return SpielRaum.einstellungen; }

  unsterblich(p) { return SpielRaum.einstellungen.unsterblich?.has?.(String(p.name).toLowerCase()); }

  // von der Verwaltungsseite: alle bekommen Bescheid, die Welt wird verworfen und beim nächsten Beitritt neu gebaut
  // neuerStand: Levelwechsel – statt der leeren Welt wird dieser Anfangsstand (neue Karte, Level) gespeichert
  weltNeuStarten(spielerLoeschen = false, neuerStand = null) {
    this.nichtSpeichern = true;
    this.chatVerlauf = [];   // der Chat gehört zur Welt
    this.speicher?.loescheWelt();
    if (neuerStand) this.speicher?.speichereWelt(neuerStand);
    if (spielerLoeschen) this.speicher?.loescheSpieler();
    else for (const [sid, p] of this.state.spieler) {
      const x = this.extra.get(sid);
      if (!x || x.bot || !this.speicher) continue;
      // Rucksack und Werte bleiben, der Platz wird in der neuen Welt neu bestimmt
      this.speichereSpieler(sid);
      const { name, ...daten } = this.speicher.ladeSpieler(x.spielerId) ?? {};
      this.speicher.speichereSpieler(x.spielerId, p.name, { ...daten, x: null, y: null, letzterSafe: '', draussen: true });
    }
    this.broadcast('neustart', neuerStand ? { level: neuerStand.level } : {});
    this.clock.setTimeout(() => this.disconnect(), 400);
  }

  // ---------- Erfahrung und Fähigkeiten (Logik in faehigkeiten.mjs) ----------
  fkEinst() { return { an: true, xpFaktor: 100, ...(SpielRaum.einstellungen.faehigkeiten ?? {}) }; }
  fkWert(p, was, standard = 1) {
    const st = this.fkVon.get(p);
    return st && this.fkEinst().an ? FK.wirkung[was](st) : standard;
  }
  fkRucksack(p) { return this.fkWert(p, 'rucksack', 0); }
  fkSenden(sid) {
    const x = this.extra.get(sid), c = this.clients.find(k => k.sessionId === sid);
    if (x?.fk && c) c.send('fk', FK.fuerClient(x.fk, this.fkEinst().an));
  }
  xpGeben(sid, art, menge = FK.XP[art]) {
    const x = this.extra.get(sid), p = this.state.spieler.get(sid), e = this.fkEinst();
    if (!x?.fk || !p || x.bot || !e.an) return;
    const neu = FK.gebeXp(x.fk, menge, e.xpFaktor / 100);
    if (neu > 0) {
      const c = this.clients.find(k => k.sessionId === sid);
      c?.send('meldung', { text: `⭐ Level ${FK.levelAus(x.fk.xp)} – ${FK.freiePunkte(x.fk)} Punkt${FK.freiePunkte(x.fk) === 1 ? '' : 'e'} frei (Taste K)`, lang: true });
      this.speichereSpieler(sid);
    }
    this.fkSenden(sid);
  }
  // Evakuierung geschafft: alle echten Spieler bekommen Erfahrung (Haken aus aufgaben.mjs)
  xpAlle(art) { for (const [sid, x] of this.extra) if (!x.bot) this.xpGeben(sid, art); }
  fkPunkt(client, m) {
    const x = this.extra.get(client.sessionId), p = this.state.spieler.get(client.sessionId);
    if (!x?.fk || !p || x.bot || !this.fkEinst().an) return;
    const vorher = this.fkRucksack(p);
    if (!FK.investiere(x.fk, String(m?.id))) return this.fkSenden(client.sessionId);
    p.plaetze += this.fkRucksack(p) - vorher;
    this.speichereSpieler(client.sessionId);
    this.fkSenden(client.sessionId);
  }

  speichereSpieler(sid) {
    const p = this.state.spieler.get(sid), x = this.extra.get(sid);
    if (!p || !x || x.bot || !this.speicher) return;
    this.speicher.speichereSpieler(x.spielerId, p.name, {
      x: p.x, y: p.y, hp: p.unten ? 25 : p.hp, durst: p.durst, hunger: p.hunger,
      waffe: p.waffe, munition: p.munition, rucksack: [...p.rucksack], plaetze: p.plaetze - this.fkRucksack(p), besiegt: p.besiegt, fk: x.fk,
      aussehen: p.aussehen, letzterSafe: x.letzterSafe, draussen: !p.sicher || p.zombie > 0, infektion: p.zombie > 0 ? 0 : p.infektion, kleidung: p.kleidung, lampe: p.lampe,
    });
  }

  speichereWelt() {
    if (!this.speicher || this.nichtSpeichern) return;
    const behaelter = {}, safes = {};
    for (const [id, inhalt] of this.inhalte) behaelter[id] = inhalt;
    for (const [id, s] of this.state.safes) safes[id] = { barrikade: Math.round(s.barrikade), kiste: [...s.kiste] };
    this.speicher.speichereWelt({
      version: WELT_VERSION, karte: this.state.karte, seed: this.state.seed, zeit: this.state.zeit, uhr: this.state.uhr, autos: this.state.autos, besiegt: this.state.besiegt, behaelter, safes,
      torGeloest: this.state.torGeloest, level: this.state.level, aufgaben: this.aufgaben?.speichern() ?? null, gestellt: [...this.gestellt].slice(-500),
      tueren: Object.fromEntries([...this.state.tueren.entries()].map(([k, t]) => [k, [t.offen, t.verschlossen, Math.round(t.barrikade), Math.round(t.hp), t.kaputt]])),
      verbrannt: [...this.state.verbrannt.keys()].filter(k => !k.startsWith('fz:')),
      chat: this.chatVerlauf, stuetzpunkt: this.stuetzpunkt?.speichern() ?? '',
    });
  }

  speichereAlles() {
    if (!this.speicher || this.nichtSpeichern) return;
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
    const safe = safeRoomVon(this.welt, p);
    const tuer = this.tuerKontext(p);
    if (tuer) return tuer;
    if (safe && welt.ausgang) {
      // die Eingangstür von innen verbarrikadieren
      const tx = (welt.ausgang.x + 0.5) * KACHEL, ty = (welt.ausgang.y + 0.5) * KACHEL;
      const zustand = this.state.safes.get(safe.id);
      if (Math.hypot(p.x - tx, p.y - ty) < 56) {
        // ein toter Zombie in der Tür muss erst weg
        const imWeg = this.leicheInTuer(safe);
        if (imWeg) return { art: 'wegziehen', leiche: imWeg, safe, dauer: 1.5 };
        if (p.rucksack.includes('bretter') && zustand.barrikade < 100) return { art: 'barrikade', safe, key: 'haus:' + safe.haus.nr, dauer: 3 };
      }
      const funk = this.aufgaben?.funkKontext(p);
      if (funk) return funk;
    }
    // Funkzelt des Bundeswehr-Stützpunkts: Funkspruch wie am Funktisch im Safe Room
    const funkZelt = !p.ebene ? this.aufgaben?.funkKontext(p) : null;
    if (funkZelt) return funkZelt;
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
    if (best) return { art: 'durchsuchen', behaelter: best, dauer: durchsuchDauer(best.art) };
    const tuerK = this.tuerKontext(p, 'zu');
    if (tuerK) return tuerK;
    // an einer Hecke, einem Gartenzaun oder einer Gartenmauer: drübersteigen
    if (!p.ebene) { const z = zaunUeberstieg(this.welt, p.x, p.y, p.richtung, W.spielerRadius); if (z) return { art: 'klettern', ziel: z, dauer: 0.7 }; }
    return null;
  }

  amTor(p) {
    const t = this.welt.tor;
    return Math.hypot(p.x - (t.x + 1) * KACHEL, p.y - (t.y + 1) * KACHEL) < TOR_ABSTAND;
  }

  // ---------- Ebenen (Innenräume) ----------

  // von: Ebene, aus der man kommt (nur beim ersten Bauen wichtig: Zombies entstehen nicht am Ankunftspunkt)
  wv(ebene, von) {
    if (!ebene) return this.welt;
    return this.ebenen.get(ebene) ?? this.baueEbene(ebene, von);
  }

  baueEbene(ebene, von) {
    const w = innenraumFuer(this.state.seed, this.welt, ebene);
    if (!w) return this.welt;
    w.safeRooms = [];
    for (const t of w.tueren) {
      const key = `${ebene}:${t.x},${t.y}`;
      let st = this.state.tueren.get(key);
      if (!st) {
        const g = (this.gespeicherteTuerenStand ?? {})[key];
        st = g ? this.tuerAusStand(g) : neueTuer(t.offen, t.verschlossen && this.tuerArt(key) !== 'frei');
        this.state.tueren.set(key, st);
      }
      if (st.offen) w.kacheln[t.y * BREITE + t.x] = T.TUER_OFFEN;
    }
    this.ebenen.set(ebene, w);
    // schlafende Zombies hinter den Türen
    // Menge über die Einstellung „Zombies in Häusern“ (10 = normal): Plätze ausdünnen oder verdoppeln
    const hf = SpielRaum.einstellungen.haeuserFaktor ?? 1;
    // Ankunftspunkt: von draußen der Start, sonst neben der Treppe zur Herkunftsebene – dort bleibt ein Umkreis zombiefrei
    let meiden = null;
    if (von !== undefined) {
      const zurueck = von ? w.treppen?.find(z => z.ziel === von) : null;
      meiden = zurueck ? this.nebenKachel(w, zurueck) : w.start;
    }
    for (const zp of (w.zombiePlaetze ?? []).filter(zp => !meiden || Math.hypot(zp.x - meiden.x, zp.y - meiden.y) >= ANKUNFT_ZOMBIEFREI)) {
      for (let n = Math.floor(hf) + (this.rnd() < hf % 1 ? 1 : 0), i = 0; i < n; i++) {
        const dx = i ? (this.rnd() - 0.5) * KACHEL : 0, dy = i ? (this.rnd() - 0.5) * KACHEL : 0;
        if (!i || frei(w, zp.x + dx, zp.y + dy, W.zombieRadius)) this.setzeZombie(zp.x + dx, zp.y + dy, ebene, true);
      }
    }
    return w;
  }

  setzeZombie(x, y, ebene = '', schlaeft = false) {
    const z = new Zombie();
    z.x = x; z.y = y; z.hp = SpielRaum.einstellungen?.zombieLeben ?? ZOMBIE_HP; z.richtung = this.rnd() * Math.PI * 2; z.jagt = false;
    z.kriecht = false; {
      const erlaubt = SpielRaum.einstellungen.zombieTypen;   // Verwaltung: erlaubte Zombietypen (Nummern), sonst alle
      z.variante = erlaubt?.length ? erlaubt[Math.floor(this.rnd() * erlaubt.length)] : Math.floor(this.rnd() * 25);
    } z.ebene = ebene;
    const id = 'z' + (this.naechsteZombieId++);
    this.state.zombies.set(id, z);
    // tempo: fester Tempofaktor 0,9–1,1, damit nicht alle gleich schnell sind (Kriecher bleiben langsam, siehe zombieGehen)
    this.zombieInfo.set(id, { ziel: null, punkt: null, wechsel: 0, verloren: 0, steht: schlaeft, schlaeft, tempo: 0.9 + this.rnd() * 0.2 });
    return id;
  }

  // Betreten, Verlassen, Treppen: wer auf die Kachel tritt, wechselt die Ebene
  uebergang(id, p, x, dt) {
    if (!x) return;
    x.schonT = Math.max(0, (x.schonT ?? 0) - dt);
    x.wechselSperre = Math.max(0, (x.wechselSperre ?? 0) - dt);
    if (x.wechselSperre > 0) return;
    // nach einem Wechsel erst wieder, wenn man sich vom Ankunftsort entfernt hat
    // (sonst läuft man mit gehaltener Taste sofort zurück durch Tür oder Treppe)
    x.ankunftT = (x.ankunftT ?? 0) + dt;
    // (Bots stehen nach dem Wechsel oft nur einen Schritt von der Tür entfernt und müssen sofort zurück können – nach 1 s darf es)
    if (x.ankunft && x.ankunftT > (x.bot ? 1 : 1.5)) x.ankunft = null;
    if (x.ankunft) {
      if (Math.hypot(p.x - x.ankunft.x, p.y - x.ankunft.y) < 36) return;
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
      this.haustuerOeffnen(h.nr);   // Menschen gehen durch geschlossene Haustüren hindurch (Barrikaden halten nur Zombies auf)
      ziel = `h${h.nr}eg`; pos = this.wv(ziel, '').start;
    } else if (p.ebene && t === T.AUSGANG) {
      const h = this.welt.haeuser[welt.nr];
      this.haustuerOeffnen(h.nr);
      const r = h.raus ?? { dx: 0, dy: 1 };
      ziel = ''; pos = { x: (h.tuer.x + 0.5 + r.dx * 1.3) * KACHEL, y: (h.tuer.y + 0.5 + r.dy * 1.3) * KACHEL };
    } else if (p.ebene && (t === T.TREPPE_RUNTER || t === T.TREPPE_HOCH)) {
      const tr = welt.treppen.find(tr => tr.x === kx && tr.y === ky);
      if (!tr) return;
      ziel = `h${welt.nr}${tr.ziel}`;
      const zw = this.wv(ziel, welt.stock);
      const zurueck = zw.treppen.find(z => z.ziel === welt.stock);
      pos = zurueck ? this.nebenKachel(zw, zurueck) : zw.start;
    } else return;
    const platz = this.freierPlatz(pos, 0, ziel);
    p.ebene = ziel; p.x = platz.x; p.y = platz.y; p.aktion = ''; p.fortschritt = 0;
    x.wechselSperre = 0.2; x.ankunft = { x: platz.x, y: platz.y }; x.ankunftT = 0; x.schonT = SCHONZEIT_EBENE;
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

  // ---------- Türen: Zimmertüren und Haustüren ----------

  tuerAnteileUebernehmen() {
    const a = SpielRaum.einstellungen.tueren ?? { frei: 50, raetsel: 25, schluessel: 25 };
    this.state.tuerFrei = a.frei; this.state.tuerRaetsel = a.raetsel; this.state.tuerSchluessel = a.schluessel;
  }

  // Schlossart einer Zimmertür: 'frei' | 'raetsel' | 'schluessel' (Haustüren sind nie verschlossen → 'frei')
  tuerArt(key) {
    if (this.hausNr(key) !== null) return 'frei';
    const s = this.state;
    return schlossArt(key, s.seed, { frei: s.tuerFrei, raetsel: s.tuerRaetsel, schluessel: s.tuerSchluessel });
  }

  tuerAusStand(g, haus = false) {
    const st = neueTuer(haus ? g[0] ?? true : g[0], g[1]);
    st.barrikade = Math.max(0, Math.min(100, Number(g[2]) || 0));
    st.hp = g[3] === undefined ? TUER_HP : Math.max(0, Math.min(100, Number(g[3]) || 0));
    st.kaputt = !!g[4];
    if (st.kaputt) { st.offen = true; st.verschlossen = false; }
    return st;
  }

  hausNr(key) { return key.startsWith('haus:') ? Number(key.slice(5)) : null; }

  safeVonHaus(nr) { return this.welt.safeRooms.find(r => r.haus.nr === nr) ?? null; }

  // Zustand der Haustür (null = nie angefasst: offen, heil, ohne Barrikade)
  hausTuer(nr, anlegen = false) {
    const key = 'haus:' + nr;
    let st = this.state.tueren.get(key);
    if (!st && anlegen) { st = neueTuer(true, false); this.state.tueren.set(key, st); }
    return st ?? null;
  }

  // Die Barrikade eines Safe-Room-Hauses lebt in state.safes (wird gespeichert und im HUD gezeigt), die Haustür spiegelt sie
  spiegleSafeTueren() {
    for (const r of this.welt.safeRooms) {
      const st = this.hausTuer(r.haus.nr, true), b = this.state.safes.get(r.id)?.barrikade ?? 0;
      if (Math.abs(st.barrikade - b) > 0.001) st.barrikade = b;
    }
  }

  tuerBarrikade(key) {
    const nr = this.hausNr(key);
    if (nr !== null) {
      const s = this.safeVonHaus(nr);
      if (s) return this.state.safes.get(s.id)?.barrikade ?? 0;
    }
    return this.state.tueren.get(key)?.barrikade ?? 0;
  }

  setzeBarrikade(key, wert) {
    wert = Math.max(0, Math.min(100, wert));
    const nr = this.hausNr(key);
    let st;
    if (nr !== null) {
      st = this.hausTuer(nr, true);
      const s = this.safeVonHaus(nr);
      if (s) this.state.safes.get(s.id).barrikade = wert;
    } else st = this.state.tueren.get(key);
    if (st) st.barrikade = wert;
  }

  hausAnTuer(kx, ky) {
    if (!this.haeuserTuer) {
      this.haeuserTuer = new Map();
      for (const h of this.welt.haeuser) if (h.betretbar) this.haeuserTuer.set(h.tuer.y * BREITE + h.tuer.x, h);
    }
    return this.haeuserTuer.get(ky * BREITE + kx) ?? null;
  }

  haustuerOeffnen(nr) {
    const st = this.state.tueren.get('haus:' + nr);
    if (st && !st.offen) st.offen = true;
  }

  // Orte (Ebene, Mitte) der Türkachel(n): wer dort steht, verhindert das Schließen
  tuerStellen(wahl) {
    const mitte = (k, ebene) => ({ ebene, x: (k.x + 0.5) * KACHEL, y: (k.y + 0.5) * KACHEL });
    if (wahl.tuer) return [mitte(wahl.tuer, wahl.ebene)];
    const h = this.welt.haeuser[wahl.nr], a = this.wv(`h${wahl.nr}eg`).ausgang;
    return [mitte(h.tuer, ''), ...(a ? [mitte(a, `h${wahl.nr}eg`)] : [])];
  }

  // nächste bedienbare Tür: Zimmertür, Haustür von innen (am Ausgang) oder von außen
  tuerWahl(p) {
    let best = null, bd = Infinity;
    if (p.ebene) {
      const w = this.wv(p.ebene);
      for (const t of w.tueren) {
        const d = Math.hypot((t.x + 0.5) * KACHEL - p.x, (t.y + 0.5) * KACHEL - p.y);
        if (d < 42 && d < bd) { bd = d; best = { key: `${p.ebene}:${t.x},${t.y}`, tuer: t, ebene: p.ebene }; }
      }
      if (w.ausgang && w.nr !== undefined) {
        const d = Math.hypot((w.ausgang.x + 0.5) * KACHEL - p.x, (w.ausgang.y + 0.5) * KACHEL - p.y);
        if (d < 48 && d < bd) best = { key: 'haus:' + w.nr, nr: w.nr, ebene: p.ebene };
      }
    } else {
      const kx = Math.floor(p.x / KACHEL), ky = Math.floor(p.y / KACHEL);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const h = this.hausAnTuer(kx + dx, ky + dy);
        if (!h) continue;
        const d = Math.hypot((h.tuer.x + 0.5) * KACHEL - p.x, (h.tuer.y + 0.5) * KACHEL - p.y);
        if (d < 44 && d < bd) { bd = d; best = { key: 'haus:' + h.nr, nr: h.nr, ebene: '' }; }
      }
    }
    return best;
  }

  // Türen: öffnen, schließen, aufschließen, aufbrechen, Rätsel, verbarrikadieren
  // modus 'auf': geschlossene Tür bedienen · 'zu': offene Tür verbarrikadieren (mit Brettern) oder schließen · 'zweit': die jeweils andere Möglichkeit
  tuerKontext(p, modus = 'auf') {
    if (modus === true) modus = 'zu';
    const wahl = this.tuerWahl(p);
    if (!wahl) return null;
    const st = this.state.tueren.get(wahl.key);
    if (!st && wahl.tuer) return null;
    const offen = st ? st.offen : true, kaputt = !!st?.kaputt;
    const bar = this.tuerBarrikade(wahl.key);
    const basis = { key: wahl.key, tuer: wahl.tuer, ebene: wahl.ebene };
    const schliessen = () => {
      if (kaputt) return null;
      const belegt = this.tuerStellen(wahl).some(o => [...this.state.spieler.values(), ...this.state.zombies.values()]
        .some(q => (q.ebene ?? '') === o.ebene && Math.hypot(q.x - o.x, q.y - o.y) < 20));
      return belegt ? null : { ...basis, art: 'tuer_zu', dauer: 0.25 };
    };
    const oeffnen = () => {
      const art = st?.verschlossen ? this.tuerArt(wahl.key) : 'frei';
      if (art === 'frei') return { ...basis, art: 'tuer_auf', dauer: 0.25 };
      if (art === 'raetsel') return { ...basis, art: 'schlossraetsel' };
      // nur mit Schlüsselbund; die Brechstange hilft hier nicht
      if (p.rucksack.includes('schluessel')) return { ...basis, art: 'aufschliessen', dauer: 1 };
      return { ...basis, art: 'schluessel_noetig' };
    };
    const brett = () => p.rucksack.includes('bretter') && bar < 100 ? { ...basis, art: 'barrikade', dauer: 3 } : null;
    const umschalten = () => offen ? schliessen() : oeffnen();
    if (modus === 'auf') return offen ? null : oeffnen();
    if (modus === 'zu') return offen ? (brett() ?? schliessen()) : null;
    const b = brett();
    return b ? (offen ? umschalten() : b) : null;
  }

  setzeTuer(key, offen) {
    const nr = this.hausNr(key);
    if (nr !== null) {
      const hs = this.hausTuer(nr, true);
      if (hs.kaputt && !offen) return;
      hs.offen = offen;
      if (offen) hs.verschlossen = false;
      return;
    }
    const st = this.state.tueren.get(key);
    if (!st || (st.kaputt && !offen)) return;
    const [ebene, xy] = key.split(':');
    const [x, y] = xy.split(',').map(Number);
    const w = this.wv(ebene);
    st.offen = offen;
    if (offen) st.verschlossen = false;
    w.kacheln[y * BREITE + x] = offen ? T.TUER_OFFEN : T.INNENTUER;
    // wer hinter der Tür schläft und jemanden sieht, wacht im nächsten Schritt auf (Sichtprüfung)
  }

  // Spieler (Menschen) hinter dieser Tür: im Haus (Haustür) bzw. auf der Ebene (Zimmertür)
  spielerHinterTuer(key) {
    const nr = this.hausNr(key), erg = [];
    for (const [sid, q] of this.state.spieler) {
      if (q.zombie > 0 || !q.ebene) continue;
      const m = EBENE_MUSTER.exec(q.ebene);
      if (nr !== null ? m && Number(m[1]) === nr : q.ebene === key.split(':')[0]) erg.push([sid, q]);
    }
    return erg;
  }

  sageDrin(key, text) {
    for (const [sid] of this.spielerHinterTuer(key)) this.clients.find(c => c.sessionId === sid)?.send('meldung', { text });
  }

  // Ein Zombie schlägt gegen die Tür: erst die Barrikade, dann die Tür selbst
  tuerSchlag(key, dt, z) {
    const st = this.state.tueren.get(key);
    if (!st) return;
    const bar = this.tuerBarrikade(key);
    if (bar > 0) this.setzeBarrikade(key, bar - dt * BARRIKADE_SCHADEN);
    else if (!st.kaputt) {
      st.hp = Math.max(0, st.hp - dt * (st.verschlossen ? TUER_SCHADEN_ZU : TUER_SCHADEN));
      if (st.hp <= 0) {
        st.kaputt = true; st.verschlossen = false; st.hp = 0;
        this.setzeTuer(key, true);
        this.sageDrin(key, '💥 Die Tür ist zerbrochen!');
        this.laerm(z.x, z.y, 300, true, z.ebene ?? '', z);
        return;
      }
    }
    // Lärm und Meldung höchstens einmal pro Sekunde bzw. alle 6 s
    const jetzt = Date.now(), u = this.tuerUhr?.get(key) ?? { laerm: 0, meldung: 0 };
    if (!this.tuerUhr) this.tuerUhr = new Map();
    if (jetzt - u.laerm > 1000) { u.laerm = jetzt; this.laerm(z.x, z.y, 220, true, z.ebene ?? '', z); }
    if (jetzt - u.meldung > 6000) { u.meldung = jetzt; this.sageDrin(key, '🧟 Zombies hämmern gegen die Tür!'); }
    this.tuerUhr.set(key, u);
  }

  // ---------- Tauschen (wenn sich zwei Spieler berühren; das Spiel läuft weiter) ----------

  istBot(sid) { return !!this.extra.get(sid)?.bot; }

  tauschStart(client, m) {
    const ich = client.sessionId, du = String(m?.mit ?? '');
    const p = this.state.spieler.get(ich), q = this.state.spieler.get(du);
    if (!p || !q || ich === du || this.tausche.has(ich) || this.tausche.has(du)) return;
    if (p.unten || q.unten || p.zombie > 0 || q.zombie > 0 || p.ebene !== q.ebene) return;
    if (Math.hypot(p.x - q.x, p.y - q.y) > TAUSCH_ABSTAND + 8) return client.send('meldung', { text: 'Zum Tauschen musst du direkt neben ihm stehen' });
    const t = { seiten: [ich, du], angebot: { [ich]: [], [du]: [] }, ok: { [ich]: false, [du]: false } };
    this.tausche.set(ich, t); this.tausche.set(du, t);
    this.tauschGeaendert(t);
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

  // Nach jeder Änderung: Bots legen ein Gegenangebot hin und stimmen zu, wenn der Tausch für sie in Ordnung ist
  tauschGeaendert(t) {
    for (const s of t.seiten) {
      const andere = t.seiten.find(q => q !== s);
      if (!this.istBot(s) || this.istBot(andere)) { t.ok[s] = this.istBot(s); continue; }
      const bot = this.state.spieler.get(s), mensch = this.state.spieler.get(andere);
      if (!bot || !mensch) { t.ok[s] = false; continue; }
      for (const d of t.angebot[s]) bot.rucksack.push(d);   // altes Gegenangebot zurücklegen und neu zusammenstellen
      t.angebot[s] = botGegenangebot(bot, mensch, t.angebot[andere]);
      for (const d of t.angebot[s]) bot.rucksack.splice(bot.rucksack.indexOf(d), 1);
      t.ok[s] = botEinverstanden(bot, t.angebot[andere], t.angebot[s]);
    }
    for (const s of t.seiten) if (!this.istBot(s)) t.ok[s] = false;
    this.tauschSenden(t);
  }

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
    if (!(t.ok[a] && t.ok[b])) {
      const bs = t.seiten.find(q => this.istBot(q) && !t.ok[q]);
      if (bs) {
        const bot = this.state.spieler.get(bs), name = bot?.name ?? 'Der Bot';
        const H = t.angebot[t.seiten.find(q => q !== bs)] ?? [], B = t.angebot[bs] ?? [];
        const voll = bot && bot.rucksack.length - B.length + H.length > bot.plaetze;
        this.clients.find(k => k.sessionId === client.sessionId)?.send('meldung', { text: voll ? `${name}: Mein Rucksack ist voll` : `${name} will das so nicht tauschen` });
      }
      return this.tauschSenden(t);
    }
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
    const a = this.wv(safe.ebene).ausgang;
    if (!a) return null;
    const tx = (a.x + 0.5) * KACHEL, ty = (a.y + 0.5) * KACHEL;
    for (const [id, l] of this.state.leichen) if ((l.ebene ?? '') === safe.ebene && Math.hypot(l.x - tx, l.y - ty) < 44) return id;
    return null;
  }

  starteAktion(client, zweit = false) {
    const p = this.state.spieler.get(client.sessionId), x = this.extra.get(client.sessionId);
    if (!p || !x || p.aktion) return;
    // zweite Taste: die andere Möglichkeit an derselben Tür (z. B. schließen statt verbarrikadieren)
    const k = zweit ? (p.unten || p.zombie > 0 || this.state.phase !== 'spiel' ? null : this.tuerKontext(p, 'zweit')) : this.kontext(p);
    if (!k) return;
    if (k.art === 'raetsel') return this.stelleRaetsel(client);
    if (k.art === 'schlossraetsel') return this.stelleRaetsel(client, { art: 'tuer', key: k.key, tuer: k.tuer, ebene: k.ebene });
    if (k.art === 'schluessel_noetig') return client.send('meldung', { text: '🔑 Diese Tür braucht einen Schlüssel' });
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
      const weite = { barrikade: 220, funk: 420, aufbrechen: 340, tuer_auf: 60, tuer_zu: 60, aufschliessen: 40, aufheben: 0 }[k.art] ?? 150;
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
    else if (k.art === 'funk') this.aufgaben?.funkAbsetzen(p, k.safe);
    else if (k.art === 'tuer_zu') this.setzeTuer(k.key, false);
    else if (k.art === 'klettern') { p.x = k.ziel.x; p.y = k.ziel.y; this.broadcast('klettern', { x: p.x, y: p.y, id: sid }); }
    else if (k.art === 'aufheben') {
      const b = this.state.boden.get(k.id);
      if (!b || p.rucksack.length >= p.plaetze) return;
      this.nimmAuf(client, p, k.id, b);
    }
    else if (k.art === 'wegziehen') {
      const l = this.state.leichen.get(k.leiche);
      if (!l) return;
      // von der Eingangstür weg in den Raum ziehen
      const sw = this.wv(k.safe.ebene), a = sw.ausgang;
      const tx = (a.x + 0.5) * KACHEL, ty = (a.y + 0.5) * KACHEL, w = Math.atan2(sw.start.y - ty, sw.start.x - tx);
      const ziel = this.freierPlatz({ x: tx + Math.cos(w) * KACHEL * 2.2, y: ty + Math.sin(w) * KACHEL * 2.2 }, 0, k.safe.ebene);
      l.x = ziel.x; l.y = ziel.y;
      client?.send('meldung', { text: 'Den toten Zombie aus der Tür gezogen' });
    }
    else if (k.art === 'barrikade') {
      if (k.safe && this.leicheInTuer(k.safe)) return client?.send('meldung', { text: 'Ein toter Zombie liegt in der Tür – erst wegziehen' });
      const i = p.rucksack.indexOf('bretter');
      if (i < 0) return;
      if (this.tuerBarrikade(k.key) >= 100) return;
      p.rucksack.splice(i, 1);
      this.setzeBarrikade(k.key, this.tuerBarrikade(k.key) + BRETT_STAERKE);
      client?.send('meldung', { text: `Tür verbarrikadiert (${Math.round(this.tuerBarrikade(k.key))} %)` });
    }
  }

  durchsucht(client, p, b) {
    if (b.art === 'leiche') return this.leicheDurchsucht(client, p, b.id);
    // Munitionskisten der Bundeswehr: für jeden Mitspieler ein eigener Inhalt (nie leer), der Haufen für die anderen bleibt unberührt
    if (b.art === 'bw_kiste') {
      const schluessel = b.id + '@' + (this.extra.get(client?.sessionId)?.spielerId ?? client?.sessionId ?? 'x');
      // je Mitspieler: 100 Schuss (sofort), 1 Schusswaffe und 1 Taschenlampe
      let extraGenommen = [];
      if (!this.inhalte.has(schluessel)) {
        const waffen = ['pistole', 'gewehr', 'schrotflinte', 'mp'];
        this.inhalte.set(schluessel, [waffen[Math.floor(this.rnd() * waffen.length)], 'taschenlampe']);
        p.munition = Math.min(MUNITION_MAX, p.munition + 100);
        extraGenommen = ['munition'];
      }
      const inhalt = this.inhalte.get(schluessel);
      const genommen = [...extraGenommen, ...this.einpacken(p, inhalt)];
      this.aufgaben?.gefunden(b, genommen);
      return client?.send('gefunden', { dinge: genommen, rest: inhalt.length });
    }
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
    this.aufgaben?.gefunden(b, genommen);
    client?.send('gefunden', { dinge: genommen, rest: inhalt.length });
  }

  // Gegenstände in den Rucksack (Munition direkt zur Pistole); Rest bleibt liegen
  einpacken(p, inhalt) {
    const genommen = [];
    for (let i = 0; i < inhalt.length;) {
      const d = inhalt[i];
      if (d === 'munition') { p.munition = Math.min(MUNITION_MAX, p.munition + MUNITION_PRO_FUND); genommen.push(d); inhalt.splice(i, 1); continue; }
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
    if (d === 'granate') { if (!this.granaten.werfen(client)) client.send('meldung', { text: '💣 Jetzt geht kein Wurf' }); return; }
    if (d === 'wasser') { p.durst = Math.min(100, p.durst + 45); p.rucksack.splice(i, 1); }
    else if (d === 'essen') { p.hunger = Math.min(100, p.hunger + 45); p.rucksack.splice(i, 1); }
    else if (d === 'schokoriegel') { p.hunger = Math.min(100, p.hunger + 20); p.rucksack.splice(i, 1); }
    else if (DINGE[d]?.plaetze) {
      const bonus = this.fkRucksack(p);
      if (DINGE[d].plaetze <= p.plaetze - bonus) return client.send('meldung', { text: 'Dein Rucksack ist schon so groß' });
      p.plaetze = DINGE[d].plaetze + bonus; p.rucksack.splice(i, 1);
      client.send('meldung', { text: `${DINGE[d].zeichen} Umgepackt – jetzt ${p.plaetze} Plätze` });
    }
    else if (d === 'kleidung') {
      if (p.kleidung >= 100) return client.send('meldung', { text: 'Du trägst schon feste Kleidung' });
      p.kleidung = 100; p.rucksack.splice(i, 1);
      client.send('meldung', { text: '🧥 Feste Kleidung angezogen – Bisse gehen seltener durch' });
    }
    else if (d === 'seil') { client.send('meldung', { text: '🪢 Ein Seil – brauchst du später am Fluss' }); }
    else if (d === 'taschenlampe') { client.send('meldung', { text: '🔦 Schaltet sich in Häusern von selbst ein (hält etwa eine Stunde)' }); }
    else if (d === 'funkgeraet') { client.send('meldung', { text: '📻 Mit einem zweiten Funkgerät im Rucksack hörst du die Mitspieler überall' }); }
    else if (d === 'verband') {
      if (p.hp >= 100) return client.send('meldung', { text: 'Du bist nicht verletzt' });
      p.hp = Math.min(100, p.hp + 45 * this.fkWert(p, 'heilen')); p.rucksack.splice(i, 1);
    } else if (DINGE[d]?.waffe) {
      const alt = p.waffe;
      p.waffe = d;
      if (alt) p.rucksack[i] = alt; else p.rucksack.splice(i, 1);
      client.send('meldung', { text: `${DINGE[d].name} in der Hand` });
    } else if (d === 'bretter') {
      client.send('meldung', { text: 'Bretter: an einer Tür verbarrikadieren (Taste an der Tür)' });
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

  // Bodengegenstand einsammeln (Rucksack muss Platz haben, wenn er dort landet)
  nimmAuf(client, p, id, b) {
    const d = b.ding;
    if (DINGE[d]?.waffe && !p.waffe) p.waffe = d;
    else if (d === 'munition') p.munition = Math.min(MUNITION_MAX, p.munition + MUNITION_PRO_FUND);
    else if (d === 'taschenlampe' && !(p.lampe > 0)) p.lampe = LAMPE_DAUER;
    else if (d === 'kleidung' && !(p.kleidung > 0)) p.kleidung = 100;
    else p.rucksack.push(d);
    this.state.boden.delete(id);
    client?.send('meldung', { text: `Aufgehoben: ${DINGE[d]?.zeichen ?? ''} ${DINGE[d]?.name ?? d}` });
  }

  // Aufheben mit Auswahl: { id, platz? } – bei vollem Rucksack räumt "platz" den Platz frei (Gegenstand fällt zu Boden)
  aufhebenWahl(client, m) {
    const p = this.state.spieler.get(client.sessionId);
    if (!p || p.unten || p.zombie > 0 || this.state.phase !== 'spiel' || typeof m?.id !== 'string') return;
    const b = this.state.boden.get(m.id);
    if (!b || (b.ebene ?? '') !== p.ebene || Math.hypot(b.x - p.x, b.y - p.y) >= AKTION_ABSTAND) return;
    const d = b.ding;
    // wandert der Gegenstand nicht in den Rucksack (Waffe/Munition/Lampe/Kleidung), braucht er keinen Platz
    const direkt = (DINGE[d]?.waffe && !p.waffe) || d === 'munition' || (d === 'taschenlampe' && !(p.lampe > 0)) || (d === 'kleidung' && !(p.kleidung > 0));
    if (!direkt && p.rucksack.length >= p.plaetze) {
      const i = Number(m.platz);
      if (!Number.isInteger(i) || i < 0 || i >= p.rucksack.length) return client.send('meldung', { text: '🎒 Rucksack voll – wähle, was du ablegst' });
      const [alt] = p.rucksack.splice(i, 1);
      this.legeHin(alt, p.x, p.y, p.ebene);
    }
    this.nimmAuf(client, p, m.id, b);
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
    const id = 'd' + (this.naechsteBodenId++);
    this.state.boden.set(id, b);
    return id;
  }

  bodenAltern(dt) {
    for (const [id, b] of this.state.boden) {
      b.alter += dt;
      if (b.alter > BODEN_DAUER) this.state.boden.delete(id);
    }
  }

  // Notvorrat im Safe-Room-Kühlschrank: Wasser bzw. Essen nur bei unter 30 %, höchstens einmal je Spieler und Spielstunde
  kuehlschrank(client) {
    const p = this.state.spieler.get(client.sessionId);
    if (!p || p.unten || p.zombie > 0) return;
    const s = safeRoomVon(this.welt, p), k = s && this.wv(s.ebene).kuehlschrank;
    if (!k || Math.hypot(k.x - p.x, k.y - p.y) > AKTION_ABSTAND + 24) return;
    const sage = text => client.send('meldung', { text });
    const stunde = (SpielRaum.einstellungen.tagMinuten || 48) * 60 / 24;
    const schluessel = this.extra.get(client.sessionId)?.spielerId ?? client.sessionId;
    this.kuehlLetzte ??= new Map();
    const letzte = this.kuehlLetzte.get(schluessel);
    if (letzte !== undefined && this.state.zeit - letzte < stunde) {
      return sage(`🧊 Du hast gerade erst etwas genommen – in ${Math.ceil((stunde - (this.state.zeit - letzte)) / 60)} Min. wieder`);
    }
    if (p.durst >= 30 && p.hunger >= 30) return sage('🧊 Der Kühlschrank ist für den Notfall: erst bei unter 30 % Wasser oder Hunger');
    if (p.rucksack.length >= p.plaetze) return sage('Dein Rucksack ist voll');
    const ding = p.durst <= p.hunger ? 'wasser' : 'essen';
    p.rucksack.push(ding);
    this.kuehlLetzte.set(schluessel, this.state.zeit);
    sage(`🧊 Aus dem Kühlschrank: ${DINGE[ding].zeichen} ${DINGE[ding].name}`);
  }

  kiste(client, m) {
    const p = this.state.spieler.get(client.sessionId);
    if (!p || p.unten) return;
    const s = safeRoomVon(this.welt, p), k = s && this.wv(s.ebene).kiste;
    if (!k || Math.hypot(k.x - p.x, k.y - p.y) > AKTION_ABSTAND + 24) return;
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
    client.send('raetsel', { id: f.id, thema: f.thema, frage: f.frage, antworten, geloest: this.state.torGeloest, noetig: TOR_RAETSEL, tuer: zweck?.art === 'tuer', handel: zweck?.art === 'handel' ? { nr: zweck.nr, von: zweck.von } : null });
  }

  antwort(client, m) {
    const offen = this.offeneRaetsel.get(client.sessionId);
    const p = this.state.spieler.get(client.sessionId);
    if (!offen || !p || m?.id !== offen.id) return;
    this.offeneRaetsel.delete(client.sessionId);
    const richtig = Number(m.index) === offen.richtigIndex && offen.bis > Date.now();
    if (offen.zweck?.art === 'handel') return this.stuetzpunkt.raetselAntwort(client, p, offen, richtig);
    if (offen.zweck?.art === 'tuer') {
      const z = offen.zweck;
      if (richtig) { this.setzeTuer(z.key, true); this.xpGeben(client.sessionId, 'raetsel'); client.send('meldung', { text: '🔓 Das Schloss springt auf' }); }
      else this.laerm((z.tuer.x + 0.5) * KACHEL, (z.tuer.y + 0.5) * KACHEL, 300, true, z.ebene);
      client.send('aufloesung', { richtig, loesung: offen.richtig, seite: offen.seite });
      return;
    }
    const tor = this.welt.tor;
    if (richtig) this.xpGeben(client.sessionId, 'raetsel');
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

  // Rechenzeit je Teil sammeln; alle 10 s als Zusammenfassung für die Einstellungsseite ablegen
  messen(teil, t0) {
    const ms = performance.now() - t0;
    const l = this.leistungLauf ??= { seit: Date.now(), teile: {} };
    const e = l.teile[teil] ??= { n: 0, summe: 0, max: 0 };
    e.n++; e.summe += ms; if (ms > e.max) e.max = ms;
    if (teil === 'takt' && Date.now() - l.seit >= 10_000) {
      this.leistung = {
        zeit: Date.now(),
        teile: Object.fromEntries(Object.entries(l.teile).map(([k, v]) => [k, { mittel: +(v.summe / v.n).toFixed(2), max: +v.max.toFixed(1), n: v.n }])),
        zombies: this.state.zombies.size, menschen: this.state.menschen?.size ?? 0, fahrzeuge: this.state.fahrzeuge?.size ?? 0,
        spieler: this.state.spieler.size, speicherMB: Math.round(process.memoryUsage().rss / 1048576),
      };
      this.leistungLauf = { seit: Date.now(), teile: {} };
      // einmal pro Minute ins Add-on-Log (so lässt sich die Last auf dem Pi nachlesen)
      if ((this.leistungZaehler = (this.leistungZaehler ?? 0) + 1) % 6 === 0) {
        const t = this.leistung.teile, f = k => t[k] ? `${k} ${t[k].mittel}/${t[k].max}` : '';
        console.log(`Leistung (ms Mittel/Spitze): ${['takt', 'spieler', 'zombies', 'menschen', 'verkehr', 'wegefeld', 'versand', 'sprache'].map(f).filter(Boolean).join(', ')} · ${this.leistung.zombies} Zombies, ${this.leistung.spieler} Spieler, ${this.leistung.speicherMB} MB`);
      }
    }
  }

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
    this.feldZeit -= dt; this.feldAlter = (this.feldAlter ?? 0) + dt;
    if (this.feldZeit <= 0) {
      this.feldZeit = 0.4;
      // nur neu rechnen, wenn ein Spieler die Kachel gewechselt hat (oder alle 5 s zur Sicherheit)
      const sig = [...s.spieler.values()].filter(p => !p.unten && !(p.zombie > 0)).map(p => `${p.ebene ?? ''}:${Math.floor(p.x / KACHEL)},${Math.floor(p.y / KACHEL)}`).sort().join('|')
        + '#' + [...s.spieler.values()].map(p => p.ebene ?? '').sort().join(',');
      if (sig !== this.feldSig || this.feldAlter > 5) {
        const tf = performance.now();
        this.feldSig = sig; this.feldAlter = 0;
        for (const e of new Set([...s.spieler.values()].map(p => p.ebene ?? ''))) this.baueFeld(e);
        this.messen('wegefeld', tf);
      }
    }

    let t0 = performance.now();
    for (const [id, p] of s.spieler) {
      const x = this.extra.get(id);
      if (!x) continue;
      // untätiger Mensch: die Bot-Steuerung übernimmt (Sicht „x.bot“ = x.afkBot, Schreibzugriffe gehen auf x)
      let xs = x;
      if (!x.bot) { this.afkPruefen(id, p, x); if (x.afkBot) xs = new Proxy(x, { get: (t, k) => k === 'bot' ? t.afkBot : t[k] }); }
      if (xs.bot) {
        try { botSchritt(this, id, p, xs, dt); } catch (e) { x.eingabe = { dx: 0, dy: 0, s: false }; if (!x.fehlerGemeldet) { console.error('Bot-Fehler:', e.message); x.fehlerGemeldet = true; } }
      }
      this.spielerSchritt(id, p, xs, dt);
      this.beduerfnisse(p, x, dt * zr);
      if (this.unsterblich(p)) { p.hp = 100; p.unten = false; p.infektion = 0; p.durst = Math.max(p.durst, 30); p.hunger = Math.max(p.hunger, 30); }
      this.aktionSchritt(id, p, x, dt);
    }
    this.messen('spieler', t0); t0 = performance.now();
    this.spiegleSafeTueren();
    this.welle?.schritt(dt);
    // Entlastung: weit von allen Spielern (und vom Stützpunkt) entfernte Zombies nur jeden FERN_TAKT-ten Takt mit gesammeltem dt
    this.takteGezaehlt = (this.takteGezaehlt ?? 0) + 1;
    this.berechneNah();
    this.baueZombieRaster();
    for (const [id, z] of s.zombies) {
      const info = this.zombieInfo.get(id);
      if (!info) continue;
      let d = dt;
      if (this.istFern(z.x, z.y, z.ebene)) {
        info.stau = (info.stau ?? 0) + dt;
        info.nr ??= Number(id.slice(1)) || 0;
        info.dran = (this.takteGezaehlt + info.nr) % FERN_TAKT === 0;
        if (!info.dran) continue;
        d = info.stau; info.stau = 0;
      } else { info.stau = 0; info.dran = true; }
      this.zombieSchritt(id, z, d);
    }
    this.messen('zombies', t0); t0 = performance.now();
    this.stadt?.schritt(dt);
    this.messen('menschen', t0); t0 = performance.now();
    this.verkehr?.schritt(dt);
    this.zRaster = null;
    this.messen('verkehr', t0); t0 = performance.now();
    this.brand?.schritt(dt);
    this.aufgaben?.schritt(dt);
    this.messen('feuer', t0); t0 = performance.now();
    this.stuetzpunkt?.schritt(dt);
    this.granaten?.schritt(dt);
    this.messen('stuetzpunkt', t0);
    this.sprachSchritt(dt);
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
    const safe = safeRoomVon(this.welt, p);
    p.sicher = safe ? safe.id : '';
    if (safe) x.letzterSafe = safe.id;
    if (p.unten) return;
    const e = x.eingabe;
    const laenge = Math.hypot(e.dx, e.dy);
    if (p.zombie > 0) return this.zombieSpielerSchritt(p, x, e, laenge, dt);
    p.schleicht = e.s || (laenge > 0 && laenge < 0.55);
    // infiziert: langsamer
    const tempo = (p.schleicht ? W.tempoSchleichen : W.tempoGehen) * (p.infektion > 0 ? 0.85 : 1) * (traegtMg(p) ? TEMPO_MG : 1) * this.fkWert(p, 'tempo');
    if (laenge > 0.05) {
      let f = Math.min(1, laenge / (p.schleicht ? 0.55 : 1)) * tempo * dt;
      const x0 = p.x, y0 = p.y;
      if (x.bot) {
        // Bots steigen nicht über Zäune, gehen aber durch Hecken und Holzzäune – langsam
        f *= Math.min(tierGelaende(welt, x0, y0, W.spielerRadius) || 1, tierGelaende(welt, x0 + e.dx / laenge * f, y0 + e.dy / laenge * f, W.spielerRadius) || 1);
        bewege(welt, p, e.dx / laenge * f, e.dy / laenge * f, W.spielerRadius, freiTier);
      } else bewege(welt, p, e.dx / laenge * f, e.dy / laenge * f, W.spielerRadius);
      p.richtung = Math.atan2(e.dy, e.dx);
      if (!p.schleicht) this.laerm(p.x, p.y, W.hoerweiteRennen * this.fkWert(p, 'hoerweite'), false, p.ebene);
      if (!x.bot) this.klettern(id, p, x, e, laenge, ((p.x - x0) * e.dx + (p.y - y0) * e.dy) / laenge < f * 0.35, dt);
    } else x.kletter = 0;
    this.uebergang(id, p, x, dt);
    // automatischer Angriff (nicht während man durchsucht)
    let pause = x.pause - dt;
    if (pause <= 0 && !p.aktion) {
      const [name, wf0] = aktiveWaffe(p);
      const meter = SpielRaum.einstellungen.reichweite?.[name];
      const ew = SpielRaum.einstellungen.waffen?.[name];   // Verwaltung: Schaden und Abklingzeit je Waffe
      const wf = { ...wf0 };
      if (meter) wf.reichweite = meter * KACHEL / 4;   // eingestellte Reichweite (Meter, 4 m je Kachel)
      if (ew) {
        if (wf0.nebenSchaden) wf.nebenSchaden = wf0.nebenSchaden * ew.schaden / wf0.schaden;
        wf.schaden = ew.schaden; wf.pause = ew.pause;
      }
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
          if (!(this.rnd() < this.fkWert(p, 'schussFrei', 0))) p.munition--;
          this.laerm(p.x, p.y, W.hoerweiteSchuss * (wf.laut ?? 1) * this.fkWert(p, 'hoerweite'), true, p.ebene);
          if (wf.kegel) {
            const alle = imWinkel(wf.kegel).filter(t => t[0] !== zid);
            for (let i = -2; i <= 2; i++) {   // Schrotgarbe
              const ww = w + i * wf.kegel / 2.5;
              this.broadcast('schuss', { x1: p.x, y1: p.y, x2: p.x + Math.cos(ww) * wf.reichweite, y2: p.y + Math.sin(ww) * wf.reichweite, art: name });
            }
            treffer([ziel], wf.schaden); treffer(alle, wf.nebenSchaden);
          } else {
            this.broadcast('schuss', { x1: p.x, y1: p.y, x2: z.x, y2: z.y, art: name, z: zid });
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
    // zählt, solange direkt in Laufrichtung ein Zaun ist – auch wenn man dabei am Zaun entlangrutscht
    const z = p.ebene ? null : zaunUeberstieg(this.welt, p.x, p.y, Math.atan2(e.dy, e.dx), W.spielerRadius, true);
    if (!z) { x.kletter = 0; return; }
    x.kletter = (x.kletter ?? 0) + dt;
    if (x.kletter < 0.8) return;
    x.kletter = 0;
    p.x = z.x; p.y = z.y;
    this.broadcast('klettern', { x: z.x, y: z.y, id });
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
        o.hp = Math.max(0, o.hp - BISS_PRO_SEK * dt * this.fkWert(o, 'schadenFaktor'));
        if (o.hp <= 0) this.liegtAmBoden(o);
      }
    }
  }

  // Safe Room: auf oder direkt neben einem Feldbett (≤ 1 Kachel) und 2 s ohne Bewegung = ruhen
  ruhtAmBett(p, x, dt) {
    const e = x.eingabe;
    // Safe Room (Innenraum) oder Sanitätszelt des Bundeswehr-Stützpunkts (draußen)
    const zelt = !p.ebene && this.stuetzpunkt?.amFeldbett(p);
    if (!(p.sicher && p.ebene) && !zelt || p.unten || p.aktion || (e && Math.hypot(e.dx, e.dy) > 0.05)) { x.stillSeit = 0; return false; }
    x.stillSeit = (x.stillSeit ?? 0) + dt;
    if (x.stillSeit < 2) return false;
    if (zelt) return true;
    const kx = Math.floor(p.x / KACHEL), ky = Math.floor(p.y / KACHEL);
    return !!this.wv(p.ebene).moebel?.some(m => m.art === 'feldbett' && kx >= m.x - 1 && kx <= m.x + m.b && ky >= m.y - 1 && ky <= m.y + m.h);
  }

  beduerfnisse(p, x, dt) {
    if (!p.verbunden) { p.ruht = false; return; }
    if (this.brauchtLicht(p)) {
      if (p.lampe <= 0) {
        const i = p.rucksack.indexOf('taschenlampe');
        if (i >= 0) { p.rucksack.splice(i, 1); p.lampe = LAMPE_DAUER; }
      } else p.lampe = Math.max(0, p.lampe - dt);
    }
    if (p.zombie > 0) {
      p.ruht = false;
      p.zombie = Math.max(0, p.zombie - dt);
      if (p.zombie === 0) this.zurueckverwandeln(p, x, 'Die Verwandlung lässt nach');
      return;
    }
    // Infektion läuft nur draußen
    if (p.infektion > 0 && !p.sicher) {
      p.infektion = Math.max(0, p.infektion - dt);
      if (p.infektion === 0) return this.verwandeln(p);
    }
    const ruht = this.ruhtAmBett(p, x, dt);
    if (p.ruht !== ruht) p.ruht = ruht;
    const rate = ruht ? 0.5 : 1;
    const fkV = rate * this.fkWert(p, 'verbrauch');
    p.durst = Math.max(0, p.durst - dt * fkV * 100 / DURST_DAUER);
    p.hunger = Math.max(0, p.hunger - dt * fkV * 100 / HUNGER_DAUER);
    if (p.unten) return;
    if (p.durst === 0 || p.hunger === 0) {
      p.hp = Math.max(0, p.hp - dt * 0.25);
      if (p.hp === 0) this.liegtAmBoden(p);
    } else if (ruht && p.hp < 100) {
      p.hp = Math.min(100, p.hp + dt);   // Feldbett: +1 Leben pro Sekunde
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
    const pos = this.safePlatz(safe);
    p.x = pos.x; p.y = pos.y; p.ebene = pos.ebene;
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
      z.kriecht = true; z.hp = Math.max(1, Math.round(KRIECHER_HP * (SpielRaum.einstellungen?.zombieLeben ?? ZOMBIE_HP) / ZOMBIE_HP)); z.jagt = false;
      if (info) { info.ziel = null; info.punkt = null; }
      this.broadcast('weg', { x: z.x, y: z.y, halb: true });
      return;
    }
    if (z.hp === 0) {
      this.state.zombies.delete(id);
      this.zombieInfo.delete(id);
      this.state.besiegt++;
      von.besiegt++;
      if (vonSid) this.xpGeben(vonSid, 'zombie');
      this.neueLeiche(z);
      this.broadcast('weg', { x: z.x, y: z.y });
    }
  }

  laerm(x, y, weite, durchWaende, ebene = '', ausser = null) {
    const welt = this.wv(ebene);
    for (const [id, z] of this.state.zombies) {
      if (z === ausser || (z.ebene ?? '') !== ebene) continue;
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
        if (feld[j] < WEGEFELD_TIEFE) q.push(j);   // weiter weg ist das Feld nicht nötig (Zombies sehen/hören höchstens ~500 px)
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

  // „Nah“-Punkte je Ebene: alle Spieler, dazu für draußen die Haustüren der Häuser mit Spielern darin und die Posten des Stützpunkts
  berechneNah() {
    const m = new Map();
    const add = (e, x, y) => { let l = m.get(e); if (!l) m.set(e, l = []); l.push(x, y); };
    for (const p of this.state.spieler.values()) {
      const e = p.ebene ?? '';
      add(e, p.x, p.y);
      if (e) {
        const mm = EBENE_MUSTER.exec(e), h = mm ? this.welt.haeuser[Number(mm[1])] : null;
        if (h) add('', (h.tuer.x + 0.5) * KACHEL, (h.tuer.y + 0.5) * KACHEL);
      }
    }
    const sp = this.stuetzpunkt;
    if (sp) {
      for (const q of sp.schuetzen ?? []) add('', q.x, q.y);
      for (const q of sp.nester ?? []) add('', q.x, q.y);
      if (sp.puma) add('', sp.puma.x, sp.puma.y);
    }
    this.nahPunkte = m;
  }

  istFern(x, y, ebene = '') {
    const l = this.nahPunkte?.get(ebene ?? '');
    if (!l) return true;
    const r2 = FERN_WEITE * FERN_WEITE;
    for (let i = 0; i < l.length; i += 2) { const dx = l[i] - x, dy = l[i + 1] - y; if (dx * dx + dy * dy < r2) return false; }
    return true;
  }

  // Raster aller Zombies je Ebene (Zelle → Liste), gilt für den laufenden Takt
  baueZombieRaster() {
    const r = new Map();
    for (const z of this.state.zombies.values()) {
      const e = z.ebene ?? '';
      let g = r.get(e); if (!g) r.set(e, g = new Map());
      const k = Math.floor(z.y / RASTER) * 4096 + Math.floor(z.x / RASTER);
      const l = g.get(k); if (l) l.push(z); else g.set(k, [z]);
    }
    this.zRaster = r;
  }

  // Zombies nahe (x, y) (Radius ≤ 1 Zelle ⇒ Zellen ±zellen); ohne Raster: alle auf der Ebene
  zombiesNahe(x, y, ebene, zellen = 1) {
    const g = this.zRaster?.get(ebene ?? '');
    if (!g) return this.zRaster ? [] : [...this.state.zombies.values()].filter(z => (z.ebene ?? '') === (ebene ?? ''));
    const cx = Math.floor(x / RASTER), cy = Math.floor(y / RASTER), out = [];
    for (let j = cy - zellen; j <= cy + zellen; j++) for (let i = cx - zellen; i <= cx + zellen; i++) { const l = g.get(j * 4096 + i); if (l) for (const z of l) out.push(z); }
    return out;
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
    if (ziel && (ziel.unten || ziel.zombie > 0 || ziel.ebene !== ebene)) {
      // der Gejagte ist in ein Haus gelaufen: zur Haustür (letzte bekannte Stelle)
      const m = !ebene && !ziel.unten && !(ziel.zombie > 0) ? EBENE_MUSTER.exec(ziel.ebene ?? '') : null;
      const h = m ? this.welt.haeuser[Number(m[1])] : null;
      if (h && Math.hypot((h.tuer.x + 0.5) * KACHEL - z.x, (h.tuer.y + 0.5) * KACHEL - z.y) < 700) {
        info.punkt = { x: (h.tuer.x + 0.5) * KACHEL, y: (h.tuer.y + 0.5) * KACHEL };
      }
      info.ziel = null; ziel = null;
    }
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
        if (d > W.spielerRadius + W.zombieRadius - 2) this.zombieGehen(z, w, W.zombieTempoJagen * lahm * dt, dt, info);
        if (d < W.spielerRadius + W.zombieRadius + 6 && !(this.extra.get(info.ziel)?.schonT > 0)) {
          const schutz = ziel.kleidung > 0;
          ziel.hp = Math.max(0, ziel.hp - BISS_PRO_SEK * dt * (schutz ? 0.6 : 1) * (z.kriecht ? 0.6 : 1) * this.fkWert(ziel, 'schadenFaktor'));
          if (schutz) ziel.kleidung = Math.max(0, ziel.kleidung - dt * 4);
          if (!(ziel.infektion > 0) && this.rnd() < (SpielRaum.einstellungen.bissSpieler ?? BISS_CHANCE) * dt * (schutz ? 0.5 : 1)) {
            ziel.infektion = INFEKTION_DAUER;
            this.broadcast('meldung', { text: `🦠 ${ziel.name} wurde gebissen! Eine Rettungsspritze hilft.`, lang: true });
          }
          if (ziel.hp <= 0) this.liegtAmBoden(ziel);
        }
        return;
      }
    }

    // Mensch (Stadtbewohner) verfolgen: volle Jagdgeschwindigkeit, bis er gebissen ist oder entkommt (gesetzt in menschen.mjs zombiesWittern)
    if (info.mensch) {
      const m = this.state.menschen.get(info.mensch);
      const d = m ? Math.hypot(m.x - z.x, m.y - z.y) : Infinity;
      if (!m || !m.sichtbar || m.infiziert || ebene || d > W.sichtWeite * 1.6 || !sichtfrei(welt, z.x, z.y, m.x, m.y)) {
        if (m && m.sichtbar && !m.infiziert && d < W.sichtWeite * 1.6) info.punkt = { x: m.x, y: m.y };   // aus den Augen: letzte Stelle ansteuern
        info.mensch = null;
      } else {
        z.richtung = Math.atan2(m.y - z.y, m.x - z.x); z.jagt = true;
        this.zombieGehen(z, z.richtung, W.zombieTempoJagen * (z.kriecht ? KRIECHER_TEMPO : 1) * dt, dt, info);
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
        if (!this.zombieGehen(z, z.richtung, W.zombieTempoJagen * 0.7 * (z.kriecht ? KRIECHER_TEMPO : 1) * dt, dt, info)) info.punkt = null;
      }
      return;
    }

    // Zombiewelle: gemeinsam zum Gruppenziel
    if (info.welle) return this.welle.gehen(id, z, info, dt);
    // schlafende Zombies (in Häusern) bewegen sich nicht, bis sie jemanden sehen oder hören
    if (info.schlaeft) return;
    // Wandern
    info.wechsel -= dt;
    if (info.wechsel <= 0) {
      info.wechsel = 2 + this.rnd() * 4;
      info.steht = this.rnd() < 0.4;
      if (!info.steht) z.richtung = this.rnd() * Math.PI * 2;
    }
    if (!info.steht && !this.zombieGehen(z, z.richtung, W.zombieTempoWandern * (z.kriecht ? 0.5 : 1) * dt, dt, info)) {
      z.richtung += Math.PI * (0.5 + this.rnd());
    }
  }

  // Zombie steht in der offenen, unverbarrikadierten Haustür eines Hauses, in dem Menschen sind: er kommt hinein
  hausEindringen(z) {
    const kx = Math.floor(z.x / KACHEL), ky = Math.floor(z.y / KACHEL);
    const h = this.hausAnTuer(kx, ky);
    if (!h) return false;
    const key = 'haus:' + h.nr, st = this.state.tueren.get(key);
    if ((st && !st.offen && !st.kaputt) || this.tuerBarrikade(key) > 0) return false;
    if (!this.spielerHinterTuer(key).length) return false;
    const ebene = `h${h.nr}eg`, w = this.wv(ebene), a = w.ausgang;
    const pos = this.freierPlatz(a ? this.nebenKachel(w, a) : w.start, 0, ebene);
    z.ebene = ebene; z.x = pos.x; z.y = pos.y;
    const info = [...this.zombieInfo.entries()].find(([id]) => this.state.zombies.get(id) === z)?.[1];
    if (info) { info.ziel = null; info.punkt = null; info.schlaeft = false; info.steht = false; }
    const s = this.safeVonHaus(h.nr);
    if (s) this.broadcast('meldung', { text: `🧟 Ein Zombie ist in den ${s.name} eingedrungen!`, lang: true });
    else this.sageDrin(key, '🧟 Ein Zombie ist ins Haus eingedrungen!');
    return true;
  }

  // Tür, gegen die der Zombie gerade läuft und die ihn aufhält (geschlossen oder verbarrikadiert), sonst null
  zombieSperre(z, w, welt) {
    const pruefe = (x, y) => {
      const kx = Math.floor(x / KACHEL), ky = Math.floor(y / KACHEL);
      if (!z.ebene) {
        const h = this.hausAnTuer(kx, ky);
        if (!h) return null;
        const key = 'haus:' + h.nr, st = this.state.tueren.get(key);
        return st && (!st.offen || this.tuerBarrikade(key) > 0) ? key : null;
      }
      const t = welt.hole(kx, ky);
      if (t !== T.INNENTUER && t !== T.TUER_OFFEN) return null;
      const key = `${z.ebene}:${kx},${ky}`, st = this.state.tueren.get(key);
      return st && (!st.offen || this.tuerBarrikade(key) > 0) ? key : null;
    };
    return pruefe(z.x + Math.cos(w) * (W.zombieRadius + 3), z.y + Math.sin(w) * (W.zombieRadius + 3)) ?? pruefe(z.x, z.y);
  }

  zombieGehen(z, w, weg, dt, info = null) {
    const eifrig = z.jagt || weg > W.zombieTempoWandern * dt * 1.5;   // jagt oder folgt einem Geräusch (nicht nur Umherirren)
    weg *= SpielRaum.einstellungen.tempoFaktor ?? 1;   // Einstellung „Tempo“
    if (info && !z.kriecht) weg *= info.tempo ?? 1;     // eigener Tempofaktor des Zombies (0,9–1,1)
    const x0 = z.x, y0 = z.y;
    const welt = this.wv(z.ebene);
    // Hecken und Holzzäune: durchquerbar, aber langsam (Metallzäune und Mauern bleiben zu)
    const schritt = weg * Math.min(tierGelaende(welt, x0, y0, W.zombieRadius) || 1, tierGelaende(welt, x0 + Math.cos(w) * weg, y0 + Math.sin(w) * weg, W.zombieRadius) || 1);
    bewege(welt, z, Math.cos(w) * schritt, Math.sin(w) * schritt, W.zombieRadius, freiTier);
    // geschlossene oder verbarrikadierte Tür (Haustür, Zimmertür): nicht durch, sondern dagegen hämmern
    const sperre = this.zombieSperre(z, w, welt);
    if (sperre) {
      z.x = x0; z.y = y0;
      if (!eifrig) return false;
      // hinter der Tür niemand? Dann gibt er auf (ein Zimmer ohne Menschen ist es nicht wert)
      if (!this.spielerHinterTuer(sperre).length) return false;
      this.tuerSchlag(sperre, dt, z);
      return true;
    }
    if (!z.ebene && this.hausEindringen(z)) return true;
    // Abstand zu anderen Zombies halten
    for (const o of this.zRaster ? this.zombiesNahe(z.x, z.y, z.ebene) : this.state.zombies.values()) {
      if (o === z || o.ebene !== z.ebene) continue;
      const d = Math.hypot(o.x - z.x, o.y - z.y);
      if (d > 0 && d < W.zombieRadius * 2) {
        const f = (W.zombieRadius * 2 - d) / 2;
        bewege(welt, z, (z.x - o.x) / d * f, (z.y - o.y) / d * f, W.zombieRadius);
      }
    }
    return Math.hypot(z.x - x0, z.y - y0) > schritt * 0.3;
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
        p.hilfe = Math.min(1, p.hilfe + dt * this.fkWert(h, 'heilen') / (mitVerband ? W.aufhelfenDauer : 8));
        if (p.hilfe >= 1) {
          if (mitVerband) h.rucksack.splice(h.rucksack.indexOf('verband'), 1);
          p.unten = false; p.hp = mitVerband ? 70 : 25; p.hilfe = 0;
          this.xpGeben(helfer[0], 'wiederbelebt');
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
      if (this.welt.safeRooms.some(r => Math.hypot(r.vorTuer.x - x, r.vorTuer.y - y) < 120)) continue;
      const nah = [...this.state.spieler.values()].some(p => Math.hypot(p.x - x, p.y - y) < abstand);
      if (nah) continue;
      // in Häusern lauern auch welche, aber seltener
      if (drinnen(this.welt, x, y)) continue;   // Häuser haben eigene Innenräume
      this.setzeZombie(x, y, '');
      return;
    }
  }

  // Tod: Rucksack, Waffe, Munition, Kleidung und Lampe fallen als Einzelgegenstände an den Sterbeort und bleiben einen Spieltag liegen
  sterbeHaufen(p) {
    const dinge = [...p.rucksack];
    if (p.waffe) dinge.push(p.waffe);
    if (p.munition > 0) for (let i = 0; i < Math.min(3, Math.ceil(p.munition / MUNITION_PRO_FUND)); i++) dinge.push('munition');
    if (p.kleidung > 0) dinge.push('kleidung');
    if (p.lampe > 0) dinge.push('taschenlampe');
    const fkB = this.fkRucksack(p);
    if (p.plaetze - fkB > RUCKSACK_PLAETZE) dinge.push(p.plaetze - fkB >= 16 ? 'trekking' : 'tasche');
    const tag = ((SpielRaum.einstellungen.tagMinuten || 48) * 60);
    for (const d of dinge) {
      if (!DINGE[d]) continue;
      const id = this.legeHin(d, p.x, p.y, p.ebene);
      this.state.boden.get(id).alter = BODEN_DAUER - tag;   // BODEN_DAUER + (Spieltag) Sekunden bis zum Verschwinden
    }
    p.rucksack.splice(0, p.rucksack.length);
    p.waffe = ''; p.munition = 0; p.kleidung = 0; p.lampe = 0; p.plaetze = RUCKSACK_PLAETZE + fkB;
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
      this.sterbeHaufen(p);   // Ausrüstung bleibt am Sterbeort liegen (1 Spieltag)
      const pos = this.safePlatz(safe, n);
      p.x = pos.x; p.y = pos.y; p.ebene = pos.ebene;
      p.hp = 100; p.durst = 100; p.hunger = 100; p.unten = false; p.hilfe = 0; p.aktion = ''; p.fortschritt = 0; p.zombie = 0;
    }
    // Zombies rund um die Safe Rooms vertreiben
    for (const [id, z] of s.zombies) {
      if (this.welt.safeRooms.some(r => z.ebene === r.ebene || (!z.ebene && Math.hypot(r.vorTuer.x - z.x, r.vorTuer.y - z.y) < 320))) {
        s.zombies.delete(id); this.zombieInfo.delete(id);
      }
    }
    for (const info of this.zombieInfo.values()) { info.ziel = null; info.punkt = null; }
    s.phase = 'spiel';
    this.broadcast('meldung', { text: 'Ihr seid im Safe Room aufgewacht – mit Kopfweh, aber lebendig.', lang: true });
  }
}

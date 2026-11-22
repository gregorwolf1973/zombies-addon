// Gemeinsame Aufgaben und der Evakuierungsbus: Pro Welt (Level) zieht der Server einige Aufgaben aus einem Vorrat.
// Der Funkspruch am Funktisch eines Safe Rooms ist immer Pflicht und meldet die Gruppe für den Bus an.
// Der Bus steht zur eingestellten Zeit am Ortsausgang; sind bei der Abfahrt genug Aufgaben erledigt, geht es in
// die nächste Karte (Level), sonst fährt er ohne die Gruppe ab und kommt am nächsten Spieltag wieder.
import { flach, hat, indexVon, zaehle as zaehleStapel } from '../client/stapel.mjs';
import { schema, t } from '@colyseus/schema';
import { KACHEL, WELT_VERSION, BUS_ABSTAND, zufall, WAFFEN, frei, kachelVon, reichVon } from '../client/welt.mjs';
import { LEOPARD, A400M, evakArtFuer, imFussabdruck } from '../client/evak.mjs';
import { Leopard, leopardEinst } from './leopard.mjs';
import { ueberrolleZombies } from './ueberrollen.mjs';
import { querfeldPlan } from './querfeld.mjs';
import { flugplanBerechnen, heliPlan, bunkerPlan, absturzPlan } from './flugplatz.mjs';
import { missionsPlan, kreisSchrumpfen, FUNK_TEILE, LANDEFEUER_MAX } from './mission.mjs';
import { DINGE } from '../client/welt.mjs';
import { weltVorbereiten } from './weltcache.mjs';

// Missionsgegenstand für die Clients (Karte): exakte Position (x, y), Radius des animierten Auffindkreises, abgegeben, Ortsbeschreibung
export const Mission = schema({ id: t.string(), nummer: t.uint8(), von: t.uint8(), ding: t.string(), x: t.number(), y: t.number(), r: t.number(), abgegeben: t.boolean(), ort: t.string(), behaelter: t.string() }, 'Mission');

export const Aufgabe = schema({
  id: t.string(),
  text: t.string(),
  symbol: t.string(),
  fortschritt: t.number(),
  ziel: t.number(),
  erledigt: t.boolean(),
  pflicht: t.boolean(),
}, 'Aufgabe');

// Reihenfolge der Karten von Level zu Level (jede andere Karte beginnt wieder bei der ersten)
export const LEVEL_KARTEN = ['geretsried', 'isarauen', 'koenigsdorf', 'kochel', 'andermatt'];
// Level 1 hat zwei Karten; die Wahl fällt per Zufall (50/50), außer das Backend legt eine fest
export const LEVEL1_KARTEN = ['geretsried', 'geretsried2'];
export const level1Karte = (zufall = Math.random) => LEVEL1_KARTEN[zufall() < 0.5 ? 0 : 1];
// Spielstand-Schlüssel je Level (Tabellen je Karte): beide Level-1-Karten teilen sich die Werte von 'geretsried'
export const levelSchluessel = karte => karte === 'geretsried2' ? 'geretsried' : karte;
export const KARTEN_NAMEN = { geretsried: 'Geretsried (Level 1)', geretsried2: 'Geretsried 2 (Level 1)', isarauen: 'die Isarauen', koenigsdorf: 'der Flugplatz Königsdorf', kochel: 'Kochel am See', andermatt: 'Andermatt', dorf: 'das Dorf' };

export const STUETZPUNKT = 'stuetzpunkt';   // funkSafe, wenn der Funkspruch im Funkzelt des Bundeswehr-Stützpunkts abgesetzt wurde
const TOR_SCHLOESSER = 3;   // wie TOR_RAETSEL in raum.mjs
const WARNUNG_MIN = 30;     // so viele Spielminuten vor der Ankunft kommt die Funkmeldung
const WARTE_RADIUS = 800;   // 100 m um den Abholpunkt: stehen dort alle Lebenden, läuft die Uhr schneller (warteRaffer)

const kisten = raum => [...raum.state.safes.values()].flatMap(s => flach(s.kiste));
const anzahl = (liste, ding) => liste.filter(d => d === ding).length;   // Listen hier sind flach (einzelne Dinge)

// Sammelaufgaben: höchstens 2 je Level (Wasser, Essen), jede mit höchstens VORRAT_MAX Stück (Paket N)
export const VORRAT_MAX = 5;
const vorrat = n => Math.min(VORRAT_MAX, 2 + n);

// Aufgabenvorrat. ziel(n) und text(n) bekommen die Spielerzahl; stand(a) liefert den aktuellen Fortschritt.
const ARTEN = {
  funk: {
    symbol: '📻', pflicht: true,
    text: () => 'Funkspruch absetzen (Funktisch im Safe Room)', ziel: () => 1,
    stand: a => a.raum.state.funk ? 1 : 0,
  },
  vorraete: {
    symbol: '📦',
    text: n => `Vorräte sichern: ${vorrat(n)} Wasser + ${vorrat(n)} Essen in Safe-Room-Kisten`, ziel: n => 2 * vorrat(n),
    stand: (a, n) => { const k = kisten(a.raum); return Math.min(anzahl(k, 'wasser'), vorrat(n)) + Math.min(anzahl(k, 'essen'), vorrat(n)); },
  },
  medizin: {
    symbol: '💊',
    text: () => 'Medizin holen: eine Spritze aus der Apotheke', ziel: () => 1,
    stand: a => a.medizin || kisten(a.raum).includes('spritze') ? 1 : 0,
  },
  zombies: {
    symbol: '🧟',
    text: n => `Zombies erledigen: zusammen ${15 + 3 * (n - 1)}`, ziel: n => 15 + 3 * (n - 1),
    stand: a => Math.max(0, a.raum.state.besiegt - a.basis),
  },
  tor: {
    symbol: '🔓',
    text: () => 'Tor am Ortsausgang öffnen (alle Schlösser)', ziel: () => TOR_SCHLOESSER,
    stand: a => a.raum.state.torGeloest,
  },
  lampen: {
    symbol: '🔦',
    text: () => 'Taschenlampen: jeder hat eine', ziel: n => n,
    stand: a => [...a.raum.state.spieler.values()].filter(p => p.lampe > 0 || hat(p.rucksack, 'taschenlampe')).length,
  },
  // Missionsgegenstände (server/mission.mjs): jeder liegt in einem weit entfernten Gebäude und wird in eine Safe-Room-Kiste gelegt
  mission: {
    symbol: '🧩', pflicht: true,
    text: (n, a) => 'Missionsgegenstände finden und in die Safe-Room-Kiste legen: ' + a.mission.map(m => `${a.abgegeben.has(m.id) ? '✅' : `⬜`} ${a.missionName(m)}${a.abgegeben.has(m.id) || !m.ort ? '' : ` – ${m.ort}`}`).join(' · '),
    ziel: (n, a) => Math.max(1, a.mission.length),
    stand: a => a.abgegeben.size,
  },
  bretter: {
    symbol: '🪵',
    text: () => 'Den Funk-Safe-Room zu 100 % verbarrikadieren', ziel: () => 100,
    // kam der Funkspruch vom Bundeswehr-Stützpunkt, gilt er als gesichert (die Soldaten halten das Lager): Aufgabe erfüllt
    stand: a => a.funkSafe === STUETZPUNKT ? 100 : a.funkSafe ? Math.round(a.raum.state.safes.get(a.funkSafe)?.barrikade ?? 0) : 0,
  },
};

export const hhmm = min => {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

const EVAK_REICHWEITE = 230, EVAK_PAUSE = 0.4, EVAK_TREFFER = 0.8;   // Bus/Panzer: Reichweite (px), Schussfolge (s), Trefferchance
const HELI_ANFLUG = 30, HELI_NEU = 60, HELI_ABSTAND = 90;            // Hubschrauber: Anflugzeit, Wartezeit bis zum nächsten Anflug (echte Sekunden), Einstiegsradius (px)
const ROLLEN_TEMPO = 190;                                            // A400M: Aufsetzgeschwindigkeit der Landerolle (px/s), bremst bis zum Stand
const ABSTURZ_DAUER = 14;   // Königsdorf: so viele Sekunden dauert der Landeanflug bis zum Absturz
const UEBERROLLEN_PAUSE = 0.1;                                       // Leopard: so oft (s) wird der Fußabdruck auf Zombies geprüft

export class Aufgaben {
  constructor(raum) {
    this.raum = raum;
    this.basis = 0;            // Stand von state.besiegt bei Aufgabenbeginn
    this.funkSafe = '';        // Safe Room, in dem der Funkspruch abgesetzt wurde
    this.medizin = false;      // Spritze aus der Apotheke gefunden
    this.busId = null;
    this.busRest = 0;          // ECHTE Sekunden bis zur Abfahrt (ab dem Halt)
    this.alleBordSek = 10;     // sind alle echten Spieler an Bord und die Aufgaben geschafft, läuft die Wartezeit auf höchstens so viele Sekunden herunter
    this.alleBordGemeldet = false; this.alleDa = false;
    this.busHeute = false;     // der Bus war in diesem Zeitfenster schon da
    this.ankGemeldet = false;
    this.echteDa = 0;
    this.eingestiegen = new Set();   // Spieler, die Bus/Panzer unterwegs eingesammelt hat (fahren mit)
    this.wechselLaeuft = false;
    this.wechselVerzoegerung = 5000;   // ms zwischen „Geschafft!“ und dem Weltwechsel
    this.takt = 0;
    this.einstiegT = new Map();      // wann jemand eingestiegen ist (Aussteigen in den ersten 2,5 s ignoriert: Fehlbedienung)
    this.ausgestiegen = new Set();   // wer freiwillig ausgestiegen ist, steigt nicht sofort wieder ein
    this.crash = null;         // Königsdorf: A400M-Absturz { rest, phase }
    this.flug = null;          // A400M: Landerolle { von, bis, t } | Hubschrauberphase { phase, rest }
    this.heli = null;
    this.mission = [];         // Plan der Missionsorte (server/mission.mjs)
    this.abgegeben = new Set();   // Missionsgegenstände, die in einer Safe-Room-Kiste abgegeben wurden
    this.hinweise = {};        // Gegenstand → Zahl der Hinweise (Suchkreis halbiert)
    this.planKey = '';
    this.landefeuer = 1;       // Zahl der Landefeuer: echte Spieler (1 bis 5), wächst nur
    this.fehlPruef = 0;
  }

  einst() { return { an: false, stunde: 18, wartezeit: 60, wartenEchtMin: 10, anzahl: 4, ...(this.raum.einstellungen?.()?.aufgaben ?? {}) }; }
  an() { return !!this.einst().an; }
  bw() { return { leopardReichweite: 29, leopardPause: EVAK_PAUSE, leopardSchaden: 100, leopardUeberrollen: true, leopardKanone: true, leopardKanonePause: 8, leopardKanoneMin: 10, ...(this.raum.einstellungen?.()?.bundeswehr ?? {}) }; }

  // Evakuierungsart dieser Karte; die Einstellung aufgaben.evakArt erzwingt eine Art zum Ausprobieren.
  // Flugzeug braucht einen Landestreifen und einen Hubschrauberplatz in der Welt, sonst Bus.
  evakArt() {
    const s = this.raum.state, w = this.raum.welt;
    const art = this.einst().evakArt || evakArtFuer(s.karte);
    if (art === 'flugzeug' && !(w && w.fein && flugplanBerechnen(w, s.seed))) return 'bus';
    return art;   // 'absturz', 'heli' und 'bunker' haben immer einen Plan (Rückfall im Plan selbst, nie auf Bus/Panzer)
  }
  // Abholpunkt der Straßenfahrzeuge: Ortsausgang (tor + 1 Kachel)
  torPunkt() { const t = this.raum.welt?.tor; return t ? { x: (t.x + 1) * KACHEL, y: (t.y + 1) * KACHEL } : null; }

  // Leopard (Isarauen): Plan für die Fahrt querfeldein zum Abholpunkt (ggf. auf die nächste befahrbare Stelle verschoben), sonst null
  panzerPlan() {
    const w = this.raum.welt, t = this.torPunkt();
    return w && t ? querfeldPlan(w, t) : null;
  }

  // Haltepunkt des Busses: nächster Knoten des Straßennetzes; liegt er weit vom Ortsausgang (> 400 px), wandert der Abholpunkt dorthin
  busHalt() {
    const v = this.raum.verkehr, t = this.torPunkt();
    if (!v?.graph?.knoten?.length || !t) return null;
    const k = [...v.graph.knoten].sort((a, b) => Math.hypot(a.x - t.x, a.y - t.y) - Math.hypot(b.x - t.x, b.y - t.y))[0];
    return k && Math.hypot(k.x - t.x, k.y - t.y) < 400 ? { knoten: k, punkt: null } : { knoten: k, punkt: k ? { x: k.x, y: k.y } : null };
  }

  flugplan() { const w = this.raum.welt; return w?.fein ? flugplanBerechnen(w, this.raum.state.seed) : null; }

  // Art, Anzeige und Abholpunkt in den Zustand schreiben (nur wenn gerade nichts unterwegs ist)
  evakSync() {
    const s = this.raum.state;
    if (this.heli?.dauer && this.heli.art !== this.evakArt()) { this.ausladen(); this.heli = null; s.busDa = false; s.busSteht = false; s.busBord = 0; s.busGesamt = 0; s.evakPhase = ''; }   // Einstellung gewechselt
    if (s.busDa || this.flug || this.heli || this.crash) return;
    const art = this.evakArt();
    if (s.evakArt !== art) s.evakArt = art;
    if (art === 'heli' || art === 'bunker') { this.dauerStart(art); return; }
    const w = this.raum.welt, ap = art === 'absturz' ? absturzPlan(w, s.seed) : null;
    const p = art === 'flugzeug' ? this.flugplan() : null;
    const ax = ap ? Math.round(ap.x) : 0, ay = ap ? Math.round(ap.y) : 0, aw = ap ? ap.w : 0;
    if (s.evakAX !== ax) s.evakAX = ax;
    if (s.evakAY !== ay) s.evakAY = ay;
    if (s.evakW !== aw) s.evakW = aw;
    // Straßenfahrzeuge: Abholpunkt nur dann abweichend vom Ortsausgang, wenn der Panzer dort nicht hinkommt bzw. der Bus keine Straße dort hat
    const pp = art === 'panzer' ? this.panzerPlan() : null, bh = art === 'bus' ? this.busHalt() : null;
    const zielP = pp?.verschoben ? pp.ziel : bh?.punkt ?? null;
    const x = p ? Math.round(p.rampe.x) : ap ? Math.round(ap.heli.x) : zielP ? Math.round(zielP.x) : 0, y = p ? Math.round(p.rampe.y) : ap ? Math.round(ap.heli.y) : zielP ? Math.round(zielP.y) : 0;
    if (s.evakX !== x) s.evakX = x;
    if (s.evakY !== y) s.evakY = y;
    if (s.evakPhase) s.evakPhase = '';
  }
  spielerZahl() { return Math.max(1, this.raum.state.spieler.size); }

  // beim Aufbau der Welt: gespeicherten Stand laden (nur wenn er zur Welt passt) oder neu ziehen
  start(stand, passt) {
    const s = this.raum.state;
    s.level = Math.max(1, Math.min(250, Math.round(Number(stand?.level) || 1)));
    s.funk = false; s.busDa = false; s.busSteht = false; s.busAnkunft = -1; s.busAb = -1; s.busBord = 0; s.busGesamt = 0;
    this.flug = null; this.heli = null; this.crash = null; s.evakPhase = ''; s.evakRest = 0; this.evakSync();
    for (const p of s.spieler.values()) p.anBord = false;
    this.eingestiegen.clear(); this.ausgestiegen.clear(); this.folgenId = null;
    this.basis = s.besiegt;
    if (!this.an()) return;
    const g = passt ? stand?.aufgaben : null;
    this.planen(g?.mission);
    const ids = Array.isArray(g?.ids) ? g.ids.filter(id => ARTEN[id]) : [];
    if (ids.length) {
      for (const id of ids) this.neu(id, !!g.erledigt?.[id]);
      this.basis = Number.isFinite(g.basis) ? g.basis : s.besiegt;
      this.funkSafe = typeof g.funkSafe === 'string' ? g.funkSafe : '';
      this.medizin = !!g.medizin;
      s.funk = !!g.funk;
    } else this.ziehen();
    if (this.mission.length && !s.aufgaben.has('mission')) this.neu('mission', false);   // älterer Spielstand ohne Mission
    this.abholMeldung = s.funk && [...s.aufgaben.values()].every(x => !x.pflicht || x.erledigt);   // beim Laden nicht erneut melden
    this.aktualisieren(false);
    if (s.funk) s.busAnkunft = this.einst().stunde * 60;
  }

  // deterministisch aus Seed und Level: Funkspruch immer, dazu zufällig weitere aus dem Vorrat
  ziehen() {
    const s = this.raum.state;
    const rng = zufall((s.seed ^ Math.imul(s.level, 0x9e3779b1) ^ 0xa0f6) >>> 0);
    if (!this.planKey) this.planen();
    const mitMission = this.mission.length > 0;
    const rest = Object.keys(ARTEN).filter(id => id !== 'funk' && id !== 'mission');
    for (let i = rest.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [rest[i], rest[j]] = [rest[j], rest[i]]; }
    const n = Math.max(3, Math.min(6, Math.round(this.einst().anzahl)));
    for (const id of ['funk', ...(mitMission ? ['mission'] : []), ...rest.slice(0, n - (mitMission ? 2 : 1))]) this.neu(id, false);
  }

  neu(id, erledigt) {
    const art = ARTEN[id], a = new Aufgabe(), n = this.spielerZahl();
    a.id = id; a.symbol = art.symbol; a.pflicht = !!art.pflicht;
    a.text = art.text(n, this); a.ziel = art.ziel(n, this); a.fortschritt = erledigt ? a.ziel : 0; a.erledigt = erledigt;
    this.raum.state.aufgaben.set(id, a);
  }

  speichern() {
    const s = this.raum.state;
    if (!s.aufgaben.size) return null;
    return {
      ids: [...s.aufgaben.keys()], erledigt: Object.fromEntries([...s.aufgaben].filter(([, a]) => a.erledigt).map(([id]) => [id, true])),
      basis: this.basis, funk: s.funk, funkSafe: this.funkSafe, medizin: this.medizin,
      mission: { abgegeben: [...this.abgegeben], hinweise: { ...this.hinweise }, landefeuer: this.landefeuer },
    };
  }

  // Fortschritt neu berechnen; erledigt bleibt erledigt
  aktualisieren(melden = true) {
    const n = this.spielerZahl();
    this.landefeuerWachsen();
    this.abgabePruefen(melden);
    for (const [id, a] of this.raum.state.aufgaben) {
      const art = ARTEN[id];
      if (!art || a.erledigt) continue;
      a.ziel = art.ziel(n, this); a.text = art.text(n, this);
      const f = art.stand(this, n);
      a.fortschritt = Math.min(f, a.ziel);
      if (f >= a.ziel) {
        a.erledigt = true; a.fortschritt = a.ziel;
        if (melden) { this.raum.broadcast('meldung', { text: `✅ Aufgabe erledigt: ${a.symbol} ${a.text}`, lang: true }); this.raum.xpAlle?.('aufgabe'); }
      }
    }
  }

  // ---------- Missionsgegenstände (A1/A2) ----------
  // Plan aus Seed, Level und Karte (jede Runde andere Orte); gespeicherte Abgaben und Hinweise einlesen
  planen(gespeichert = null) {
    const r = this.raum, s = r.state;
    this.mission = []; this.abgegeben = new Set(); this.hinweise = {}; this.planKey = ''; this.landefeuer = 1;
    s.missionen?.clear(); s.missionOffen = 0;
    if (!this.an() || !r.welt?.haeuser) return;
    this.planKey = `${s.seed}:${s.level}:${s.karte}`;
    this.landefeuer = Math.min(LANDEFEUER_MAX, Math.max(1, Math.round(Number(gespeichert?.landefeuer) || 0), this.echteSpieler()));
    this.mission = missionsPlan(s.seed, s.level, s.karte, r.welt, this.landefeuer);
    const bekannt = new Set(this.mission.map(m => m.id));
    for (const d of gespeichert?.abgegeben ?? []) if (bekannt.has(d)) this.abgegeben.add(d);
    for (const m of this.mission) this.missionEintragen(m, gespeichert?.hinweise?.[m.id]);
    s.missionOffen = this.mission.length - this.abgegeben.size;
  }

  // Verbundene echte Spieler (ohne Bots)
  echteSpieler() {
    const r = this.raum;
    return [...r.state.spieler].filter(([sid, p]) => p.verbunden !== false && !r.extra?.get(sid)?.bot).length;
  }

  missionEintragen(m, hinweise = 0) {
    const s = this.raum.state;
    const h = Math.max(0, Math.min(4, Math.round(Number(hinweise) || 0)));
    for (let i = 0; i < h; i++) kreisSchrumpfen(m);
    this.hinweise[m.id] = h;
    const q = new Mission(); q.id = m.id; q.ding = m.ding; q.nummer = m.nummer ?? 0; q.von = m.von ?? 0;
    q.x = Math.round(m.x); q.y = Math.round(m.y); q.r = Math.round(m.r); q.abgegeben = this.abgegeben.has(m.id); q.ort = m.ort ?? ''; q.behaelter = m.behaelter ?? '';
    s.missionen?.set(m.id, q);
  }

  // Anzeigename: „Landefeuer 2/3“ bei mehreren Landefeuern
  missionName(m) {
    const n = DINGE[m.ding].name;
    return m.nummer && this.landefeuer > 1 ? `${n} ${m.nummer}/${this.landefeuer}` : n;
  }

  // Kommen echte Spieler dazu, kommen weitere Landefeuer an neuen Orten dazu (bis 5, nie weniger); nur bis der Funkspruch raus ist
  landefeuerWachsen() {
    const s = this.raum.state;
    if (!this.planKey || s.funk || !this.mission.some(m => m.ding === 'm_landefeuer')) return;
    const n = Math.min(LANDEFEUER_MAX, this.echteSpieler());
    if (n <= this.landefeuer) return;
    const plan = missionsPlan(s.seed, s.level, s.karte, this.raum.welt, n);
    const da = new Set(this.mission.map(m => m.id));
    this.landefeuer = n;
    for (const m of plan) {
      if (m.ding !== 'm_landefeuer') continue;
      const alt = this.mission.find(q => q.id === m.id);
      if (alt) { alt.von = n; const q = s.missionen.get(m.id); if (q) q.von = n; continue; }
      if (!da.has(m.id)) { this.mission.push(m); this.missionEintragen(m); }
    }
    s.missionOffen = this.mission.length - this.abgegeben.size;
    const a = s.aufgaben.get('mission'); if (a && !a.erledigt) { a.ziel = this.mission.length; a.text = ARTEN.mission.text(0, this); }
  }

  missionFertig() { return !this.raum.state.aufgaben.has('mission') || this.mission.every(m => this.abgegeben.has(m.id)); }

  // Gegenstände, die beim ersten Durchsuchen dieses Behälters dazugelegt werden
  missionsFunde(behaelterId) {
    if (!this.an()) return [];
    return this.mission.filter(m => m.behaelter === behaelterId && !this.abgegeben.has(m.id)).map(m => m.ding);
  }

  // Fehlende Teile für den Funkspruch (Namen); leer = Funkspruch möglich
  funkFehlt() {
    if (!this.raum.state.aufgaben.has('mission')) return [];
    return FUNK_TEILE.filter(d => this.mission.some(m => m.id === d) && !this.abgegeben.has(d)).map(d => DINGE[d].name);
  }

  // Missionsgegenstand in einer Safe-Room-Kiste: abgegeben (zählt für alle, wird aus der Kiste genommen)
  abgabePruefen(melden = true) {
    if (!this.mission.length) return;
    const s = this.raum.state;
    for (const m of this.mission) {
      if (this.abgegeben.has(m.id)) continue;
      for (const safe of s.safes.values()) {
        const i = indexVon(safe.kiste, m.ding);
        if (i < 0) continue;
        safe.kiste.splice(i, 1);
        this.abgegeben.add(m.id);
        const q = s.missionen.get(m.id); if (q) q.abgegeben = true;
        s.missionOffen = this.mission.length - this.abgegeben.size;
        if (melden) this.raum.broadcast('meldung', { text: `${DINGE[m.ding].zeichen} ${this.missionName(m)} abgegeben (${this.abgegeben.size}/${this.mission.length})`, lang: true });
        break;
      }
    }
    if (melden && (this.fehlPruef -= 0.5) <= 0) { this.fehlPruef = 10; this.verlorenPruefen(); }
  }

  // Hinweise (Zettel, geretteter Mensch) gibt es nicht mehr: Die Position der Gegenstände steht exakt auf der Karte (null = kein Hinweis)
  missionHinweis() { return null; }

  // Gegenstand weg (Spieler abgemeldet, Behälter schon früher geleert …)? Dann liegt er wieder im Behälter
  verlorenPruefen() {
    const r = this.raum, s = r.state;
    // je Gegenstandsart: fehlende Stücke (Behälter schon durchsucht, Stück nicht mehr drin) abzüglich der Stücke, die irgendwo anders sind
    const arten = new Set(this.mission.map(m => m.ding));
    for (const ding of arten) {
      const fehlend = [];
      for (const m of this.mission) {
        if (m.ding !== ding || this.abgegeben.has(m.id)) continue;
        const inh = r.inhalte.get(m.behaelter);
        if (inh && !inh.includes(ding)) fehlend.push([m, inh]);
      }
      if (!fehlend.length) continue;
      const zaehle = l => l.filter(d => d === ding).length;   // flache Listen (Tausch-Angebote)
      let woanders = 0;
      for (const p of s.spieler.values()) woanders += zaehleStapel(p.rucksack, ding);
      for (const b of s.boden.values()) if (b.ding === ding) woanders++;
      for (const sf of s.safes.values()) woanders += zaehleStapel(sf.kiste, ding);
      for (const tt of r.tausche?.values?.() ?? []) for (const l of Object.values(tt.angebot ?? {})) woanders += zaehle(l);
      for (const [m, inh] of fehlend.slice(woanders)) { inh.push(ding); r.setzeInhalt(m.behaelter, inh); }
    }
  }

  erledigtZahl() { return [...this.raum.state.aufgaben.values()].filter(a => a.erledigt).length; }
  noetig() { return Math.max(1, this.raum.state.aufgaben.size - 1); }   // „3 von 4“

  // Haken aus raum.mjs: ein Fund aus einem Behälter (Spritze aus der Apotheke)
  gefunden(behaelter, dinge) {
    if (!this.an() || behaelter?.art !== 'laden_apotheke' || !dinge.includes('spritze')) return;
    this.medizin = true;
    this.aktualisieren();
  }

  // Haken aus raum.mjs: Funkspruch am Funktisch fertig
  funkAbsetzen(p, safe) {
    const s = this.raum.state;
    if (!this.an() || s.funk) return;
    s.funk = true; this.funkSafe = safe?.id ?? STUETZPUNKT;
    s.busAnkunft = this.einst().stunde * 60;
    this.aktualisieren(false);
    const a = s.aufgaben.get('funk'); if (a) { a.erledigt = true; a.fortschritt = a.ziel; this.raum.xpAlle?.('aufgabe'); }
    this.raum.broadcast('meldung', { text: `📻 ${p.name} hat den Funkspruch abgesetzt – ${this.fz().der} kommt um ${hhmm(s.busAnkunft)} zum Ortsausgang!`, lang: true });
    this.aktualisieren();
  }

  // Safe Room mit Funktisch und Abstand zu ihm (für Kontext und Aktion)
  funkKontext(p) {
    const s = this.raum.state;
    if (!this.an() || s.funk) return null;
    if (!p.ebene) {   // draußen: Funkzelt des Bundeswehr-Stützpunkts
      const f = this.raum.welt.stuetzpunkt?.teile.find(q => q.art === 'funkzelt')?.funkpunkt;
      return f && Math.hypot(p.x - f[0], p.y - f[1]) < 44 ? { art: 'funk', safe: null, dauer: 4 } : null;
    }
    const safe = this.raum.welt.safeRooms.find(r => r.ebene === p.ebene);
    if (!safe) return null;
    const m = this.raum.wv(p.ebene).moebel?.find(q => q.art === 'funktisch');
    if (!m) return null;
    const wf = this.raum.wv(p.ebene), K = kachelVon(wf), nx = Math.max(m.x * K, Math.min((m.x + m.b) * K, p.x)), ny = Math.max(m.y * K, Math.min((m.y + m.h) * K, p.y));
    return Math.hypot(p.x - nx, p.y - ny) < reichVon(wf, 44) ? { art: 'funk', safe, dauer: 4 } : null;
  }

  // ---------- Takt ----------
  schritt(dt) {
    const s = this.raum.state;
    if (!this.an()) { if (s.busDa || this.heli) this.busWeg(); return; }
    if (this.heli) { this.heliSchritt(dt); return; }
    if (this.crash) { this.absturzSchritt(dt); return; }
    if (s.busDa) { this.evakFeuer(dt); if (this.flug) this.flugRollen(dt); }
    if (!s.aufgaben.size) { this.basis = s.besiegt; this.ziehen(); }   // zur Laufzeit eingeschaltet
    this.takt -= dt;
    if (this.takt <= 0) { this.takt = 0.5; this.aktualisieren(); this.evakSync(); }
    if (!this.abholMeldung && s.funk && [...s.aufgaben.values()].every(a => !a.pflicht || a.erledigt)) {
      this.abholMeldung = true;
      const art = this.fz().art;
      this.raum.broadcast('meldung', { text: art === 'flugzeug' ? '📍 Landeplatz steht fest – der A400M landet dort, er ist auf der Karte markiert'
        : art === 'panzer' ? '📍 Abholstelle am Ortsausgang steht fest – der Panzer holt euch dort ab, sie ist auf der Karte markiert' : '📍 Abholstelle am Ortsausgang steht fest – sie ist auf der Karte markiert', lang: true });
    }
    if (this.wechselLaeuft) { this.mitnehmen(); return; }
    const { stunde, wartezeit } = this.einst();
    const A = stunde * 60;
    if (!s.busDa) {
      if (!s.funk || !this.missionFertig()) return;   // der Bus kommt erst, wenn alle Missionsgegenstände abgegeben sind
      const seit = (s.uhr - A + 1440) % 1440;          // Minuten seit der Ankunftszeit
      const bis = (A - s.uhr + 1440) % 1440;           // Minuten bis zur Ankunftszeit
      if (seit < wartezeit) {
        if (!this.busHeute) this.ankunft(wartezeit - seit);
      } else {
        this.busHeute = false;                          // Zeitfenster vorbei: morgen kommt ein neuer Bus
        if (bis > 0 && bis <= WARNUNG_MIN && !this.ankGemeldet) {
          this.ankGemeldet = true;
          this.raum.broadcast('meldung', { text: `${this.fz().zeichen} ${this.fz().Der} kommt um ${hhmm(A)} zum Ortsausgang!`, lang: true });
        } else if (bis > WARNUNG_MIN) this.ankGemeldet = false;
      }
      return;
    }
    // Anfahrt: er rollt noch zur Haltestelle – kein Einsteigen, die Wartezeit läuft erst ab dem Halt
    if (!this.raum.verkehr?.evakuierungDa(this.busId)) {
      s.busSteht = false;
      if (!s.fahrzeuge.get(this.busId)) { this.busWeg(); s.busBord = 0; }
      else if (this.fz().art !== 'flugzeug') this.mitfahrer();   // auf dem ganzen Weg einsteigen: wer nah vorbeifahrenden Bus erreicht, fährt mit (Flugzeug: erst nach der Landerolle)
      return;
    }
    if (!s.busSteht) {
      s.busSteht = true;
      this.restSetzen();
      if (!this.busGemeldet) this.stehtMeldung();
    }
    this.busRest -= dt;
    this.busAbSetzen();
    const alleDa = this.mitfahrer();
    this.abfahrtWarnung();
    // alle an Bord und die Fahrt gelingt: Wartezeit auf höchstens 10 s kürzen, dann fährt er sofort – sonst wartet er bis zum Ablauf der Zeit
    this.bordRaffen(alleDa);
    if (this.busRest <= 0) this.abfahrt();
  }

  // Alle lebenden echten Spieler an Bord und die Aufgaben geschafft (fahrtGelingt): Restwartezeit höchstens alleBordSek, einmalige Meldung
  bordRaffen(alleDa) {
    this.alleDa = alleDa;
    if (!alleDa || !this.fahrtGelingt()) { this.alleBordGemeldet = false; return; }
    const bunker = this.heli?.art === 'bunker', fin = this.raum.finale;
    if (bunker) {   // Bunker: der Atomschlag-Countdown springt auf 10 s (server/finale.mjs), danach Sieg
      if (!fin?.aktiv() || fin.rest <= this.alleBordSek) return;
      fin.setzen(this.alleBordSek);
    } else {
      if (this.busRest <= this.alleBordSek) return;
      this.busRest = this.alleBordSek; this.busAbSetzen();
    }
    if (this.alleBordGemeldet) return;
    this.alleBordGemeldet = true;
    const n = Math.max(1, Math.round(this.alleBordSek));
    this.raum.broadcast('meldung', { text: bunker ? `☢️ Alle im Bunker – Tor schließt in ${n} s` : `${this.fz().zeichen} Alle an Bord – Abfahrt in ${n} s`, lang: true });
  }

  // Bus (Gewehre aus den Fenstern) und Panzer (Turm-MG) schießen vom Erscheinen bis zur Abfahrt auf Zombies in der Nähe;
  // Treffer nur auf Zombies draußen, nie auf Spieler. Darstellung wie bei Soldaten/MG-Nest ('bwschuss', n = -1).
  evakFeuer(dt) {
    const r = this.raum, s = r.state, f = s.fahrzeuge.get(this.busId);
    if (!f) return;
    const art = this.fz().art;
    if (art === 'flugzeug') return;
    const bw = this.bw();
    if (art === 'panzer') {   // Leopard: Turm, Lader-MG und Hauptkanone (server/leopard.mjs)
      if (bw.leopardUeberrollen) this.ueberrollen(f, dt);
      (this.leopard ??= new Leopard(r)).schritt(f, dt, leopardEinst(bw, this.evakTrefferChance));
      return;
    }
    this.feuerKuehl = (this.feuerKuehl ?? 0) - dt;
    if (this.feuerKuehl > 0) return;
    let ziel = null, bd = EVAK_REICHWEITE;
    for (const [id, z] of s.zombies) {
      if (z.ebene || !(z.hp > 0)) continue;
      const d = Math.hypot(z.x - f.x, z.y - f.y);
      if (d < bd) { bd = d; ziel = [id, z]; }
    }
    if (!ziel) return;
    this.feuerKuehl = EVAK_PAUSE;
    const [id, z] = ziel;
    // Bus: Fenster verteilt über die Länge, auf der Seite zum Ziel
    const c = Math.cos(f.richtung), sn = Math.sin(f.richtung), laengs = (r.rnd() - 0.5) * 100;
    const links = (z.y - f.y) * c - (z.x - f.x) * sn > 0 ? 1 : -1;   // Seite des Ziels
    const x = f.x + c * laengs - sn * 9 * links, y = f.y + sn * laengs + c * 9 * links;
    const treffer = r.rnd() < (this.evakTrefferChance ?? EVAK_TREFFER);
    const w = Math.atan2(z.y - y, z.x - x) + (treffer ? 0 : (r.rnd() < 0.5 ? -1 : 1) * (0.06 + r.rnd() * 0.08));
    const d = Math.hypot(z.x - x, z.y - y);
    r.broadcast('bwschuss', { art: 'mg', n: -1, x1: x, y1: y, x2: x + Math.cos(w) * d, y2: y + Math.sin(w) * d, w, t: treffer ? 1 : 0 });
    if (treffer) {
      const vorher = s.besiegt, von = this.schuetze ??= { name: 'Evakuierungsbus', x, y, besiegt: 0 };
      von.x = x; von.y = y;
      r.schaden(id, z, r.einstellungen?.()?.waffen?.gewehr?.schaden ?? WAFFEN.gewehr.schaden, von);
      s.besiegt = vorher;   // zählt nicht für die Aufgaben der Spieler (wie die Bundeswehr)
    }
  }

  // Leopard: Zombies im Fußabdruck der fahrenden Wanne werden überrollt (sterben auf der Stelle, kein Kriechen; Blut und Leiche wie üblich).
  // Spieler nie: das Fahrzeug bremst vor ihnen (server/verkehr.mjs, imWeg) – hier wird nur geprüft, ob ein Spieler im Weg steht.
  ueberrollen(f, dt) {
    this.ueberrollKuehl = (this.ueberrollKuehl ?? 0) - dt;
    if (this.ueberrollKuehl > 0 || f.haelt) return;
    this.ueberrollKuehl = UEBERROLLEN_PAUSE;
    ueberrolleZombies(this.raum, f, LEOPARD.laenge / 2, LEOPARD.breite / 2, this.schuetze ??= { name: 'Evakuierungspanzer', x: f.x, y: f.y, besiegt: 0 });   // gemeinsame Logik mit dem Puma (ueberrollen.mjs)
  }

  restSetzen() {
    this.alleBordGemeldet = false;
    this.busRest = Math.max(1, Math.min(60, Number(this.einst().wartenEchtMin) || 10)) * 60;
    this.busAbSetzen();
  }

  // Anzeige: Uhrzeit (Spielminuten) der spätesten Abfahrt, nur bei Änderung schreiben
  busAbSetzen() {
    const s = this.raum.state;
    const ab = (Math.round(s.uhr + Math.max(0, this.busRest) * 1440 / ((this.raum.einstellungen?.().tagMinuten || 48) * 60))) % 1440;
    if (s.busAb !== ab) s.busAb = ab;
  }

  // Wartezeit raffen: Funkspruch abgesetzt, Pflichtaufgaben erledigt, Bus/Panzer noch nicht da und ALLE lebenden Spieler
  // (auch Bots und Liegende, nicht getrennte) stehen draußen im Umkreis von 100 m um den Abholpunkt → Uhr läuft schneller.
  // Faktor: Einstellung aufgaben.warteRaffer (Vorgabe 6). Meldet Beginn und Ende einmal.
  warteRaffer() {
    const s = this.raum.state, tor = this.raum.welt?.tor;
    let an = this.an() && s.funk && !s.busDa && !this.wechselLaeuft && !!tor
      && [...s.aufgaben.values()].every(a => !a.pflicht || a.erledigt);
    if (an) {
      const ev = s.evakX > 0 && s.evakY > 0;   // Abholpunkt weicht vom Ortsausgang ab (A400M, verschobener Punkt)
      const ax = ev ? s.evakX : (tor.x + 1) * KACHEL, ay = ev ? s.evakY : (tor.y + 1) * KACHEL;
      let lebende = 0;
      for (const p of s.spieler.values()) {
        if (p.zombie > 0 || p.verbunden === false) continue;
        lebende++;
        if (p.ebene || Math.hypot(p.x - ax, p.y - ay) > WARTE_RADIUS) { an = false; break; }
      }
      if (!lebende) an = false;
    }
    if (an !== !!this.raffAn) {
      this.raffAn = an;
      this.raum.broadcast('meldung', { text: an ? `⏩ Alle warten am Abholpunkt – die Zeit vergeht schneller, bis ${this.fz().der} kommt` : '⏸️ Nicht mehr alle am Abholpunkt – die Zeit läuft wieder normal' });
    }
    return an ? Math.max(1, Number(this.einst().warteRaffer) || 6) : 1;
  }

  // Bus erscheint am Ortsausgang (auf der nächsten Straße, sonst dahinter im Ort) und wartet
  ankunft(rest) {
    const s = this.raum.state, w = this.raum.welt, tor = w.tor, v = this.raum.verkehr;
    if (!v) return;
    if (this.evakArt() === 'absturz') { this.laufendeArt = 'absturz'; this.absturzStart(); return; }
    if (this.evakArt() === 'flugzeug') { this.laufendeArt = 'flugzeug'; this.flugAnkunft(); return; }   // Flug läuft bis zum Ende, auch wenn die Einstellung wechselt
    if (this.evakArt() === 'panzer') {   // Leopard: querfeldein zum (ggf. verschobenen) Abholpunkt
      const plan = this.panzerPlan();
      if (plan) {
        this.busId = v.evakuierungPanzer(plan);
        this.busHeute = true; this.busRest = 0; s.busDa = true; this.busAbSetzen(); this.busGemeldet = false;
        s.busSteht = false;
        this.raum.broadcast('meldung', { text: `${this.fz().zeichen} ${this.fz().Der} rollt querfeldein zur Abholstelle!`, lang: true });
        return;
      }
    }
    const tx = (tor.x + 1) * KACHEL, ty = (tor.y + 1) * KACHEL;
    const links = tor.x === 0;
    let x = links ? tx + 4 * KACHEL : tx, y = links ? ty : ty + 4 * KACHEL;
    const k = v.graph?.knoten?.length ? [...v.graph.knoten].sort((a, b) => Math.hypot(a.x - tx, a.y - ty) - Math.hypot(b.x - tx, b.y - ty))[0] : null;
    if (k) { x = k.x; y = k.y; }   // der Bus hält am nächsten Straßenknoten (liegt er weit vom Ortsausgang, wandert der Abholpunkt dorthin, siehe evakSync)
    this.busId = v.evakuierungBus(x, y, links ? Math.PI : -Math.PI / 2, k);
    this.busHeute = true; this.busRest = 0; s.busDa = true; this.busAbSetzen(); this.busGemeldet = false;
    s.busSteht = v.evakuierungDa(this.busId);
    if (s.busSteht) { this.restSetzen(); this.stehtMeldung(); }
    else this.raum.broadcast('meldung', { text: `${this.fz().zeichen} ${this.fz().Der} fährt zum Ortsausgang vor!`, lang: true });
  }

  // Evakuierungsart je Karte (Einstellung aufgaben.evakArt erzwingt eine): Bus, Panzer (Leopard 2A7, Isarauen) oder A400M mit Hubschrauber
  fz() {
    const art = this.laufendeArt ?? this.evakArt();
    return art === 'panzer' ? { art, zeichen: '🪖', Der: 'Der Evakuierungspanzer', der: 'der Evakuierungspanzer', name: 'Evakuierungspanzer', neu: 'einen neuen Panzer' }
      : art === 'flugzeug' || art === 'absturz' ? { art, zeichen: '✈️', Der: 'Der A400M', der: 'der A400M', name: 'A400M', neu: 'eine neue Maschine' }
      : art === 'heli' ? { art, zeichen: '🚁', Der: 'Der NH90', der: 'der NH90', name: 'NH90', neu: 'einen neuen Hubschrauber' }
      : art === 'bunker' ? { art, zeichen: '☢️', Der: 'Der Bunker', der: 'der Bunker', name: 'Bunker', neu: 'einen neuen Bunker' }
      : { art, zeichen: '🚌', Der: 'Der Evakuierungsbus', der: 'der Evakuierungsbus', name: 'Evakuierungsbus', neu: 'einen neuen Bus' };
  }

  stehtMeldung() {
    const s = this.raum.state;
    this.busGemeldet = true;
    this.raum.broadcast('meldung', { text: this.fz().art === 'flugzeug' ? `✈️ Der A400M ist gelandet! Einsteigen an der Heckrampe – Abflug um ${hhmm(s.busAb)}`
      : `${this.fz().zeichen} ${this.fz().Der} steht am Ortsausgang! Abfahrt um ${hhmm(s.busAb)}`, lang: true });
  }

  busWeg(behalten = false) {
    const s = this.raum.state;
    s.busDa = false; s.busSteht = false; s.busBord = 0; s.busGesamt = 0;
    if (!behalten) this.ausladen();
    if (this.busId) { this.raum.verkehr?.evakuierungAb(this.busId); this.busId = null; }
    this.flug = null; this.crash = null; this.laufendeArt = null;
    if (this.heli) { this.heli = null; s.evakPhase = ''; s.evakRest = 0; this.evakSync(); }
    else if (s.evakPhase) { s.evakPhase = ''; }
  }

  // nach der erfolgreichen Abfahrt: wer an Bord ist, bewegt sich mit dem abfahrenden Fahrzeug bis zum Levelwechsel
  mitnehmen() {
    const s = this.raum.state, f = this.folgenId ? s.fahrzeuge.get(this.folgenId) : null;
    if (!f) return;
    // Aufspringen: der Bus rollt langsam los, wer ihn noch erreicht, fährt mit (bis er die Karte verlässt)
    for (const [sid, p] of s.spieler) {
      if (p.zombie > 0 || p.ebene || p.unten || this.eingestiegen.has(sid) || this.ausgestiegen.has(sid)) continue;
      if (this.heli || this.fz().art === 'flugzeug' || Math.hypot(p.x - f.x, p.y - f.y) >= BUS_ABSTAND * 1.5) continue;
      this.eingestiegen.add(sid); p.anBord = true; this.einstiegT.set(sid, Date.now());
      if (!this.raum.extra.get(sid)?.bot) this.einsteigMeldung(sid);
    }
    for (const sid of this.eingestiegen) { const p = s.spieler.get(sid); if (p) { p.x = f.x; p.y = f.y; } }
  }

  // wer in Busnähe steht, ist an Bord; true, wenn alle lebenden verbundenen Spieler (Bots und Liegende zählen mit) an Bord sind
  mitfahrer() {
    const s = this.raum.state;
    const f = this.einstiegsPunkt();
    if (!f) { this.busWeg(); return false; }
    const abstand = this.heli ? HELI_ABSTAND : BUS_ABSTAND;
    let bord = 0, gesamt = 0, echtDa = 0, lebende = 0, lebendeDa = 0;
    for (const [sid, p] of s.spieler) {
      if (p.zombie > 0) { this.eingestiegen.delete(sid); p.anBord = false; continue; }
      const bot = !!this.raum.extra.get(sid)?.bot;
      let an = this.eingestiegen.has(sid);
      // Einsteigen: wer nah genug steht, sitzt im Fahrzeug (Position folgt ihm, Figur weg, Zombies lassen ihn in Ruhe) bis zum Levelwechsel.
      // Fehlt noch etwas für die Abfahrt, sagt die Meldung beim Einsteigen, was – es wirft niemand still wieder raus.
      if (this.ausgestiegen.has(sid) && Math.hypot(p.x - f.x, p.y - f.y) >= abstand) this.ausgestiegen.delete(sid);   // erst wieder einsteigen, wenn er einmal weg war
      if (!an && !p.ebene && !p.unten && !this.ausgestiegen.has(sid) && Math.hypot(p.x - f.x, p.y - f.y) < abstand && this.einsteigenOffen()) {   // Bunkertor bleibt zu, bis die Missionen erledigt sind (server/finale.mjs meldet, was fehlt)
        an = true; this.eingestiegen.add(sid); p.anBord = true; this.einstiegT.set(sid, Date.now());
        if (this.heli?.art === 'bunker') this.raum.bunker?.betreten?.(sid);   // Haken für einen Bunker-Innenraum (falls vorhanden)
        if (!bot) this.einsteigMeldung(sid);
      }
      if (an) { p.x = f.x; p.y = f.y; p.anBord = true; }   // fährt mit
      gesamt++; if (an) bord++;
      // Abfahrt wartet nur auf echte, verbundene, stehende Spieler – Bots und Liegende kommen beim Levelwechsel ohnehin mit
      if (!bot && p.verbunden !== false && !p.unten) { lebende++; if (an) lebendeDa++; }
      if (!bot && p.verbunden !== false && an) echtDa++;
    }
    s.busBord = bord; s.busGesamt = gesamt; this.echteDa = echtDa;
    this.alleDa = lebende > 0 && lebendeDa === lebende;
    return this.alleDa;
  }

  // was für eine erfolgreiche Abfahrt noch fehlt (Pflichtaufgaben, Mindestzahl erledigter Aufgaben)
  fehlt() {
    const l = [...this.raum.state.aufgaben.values()].filter(a => a.pflicht && !a.erledigt).map(a => `${a.symbol} ${a.text}`);
    const n = this.noetig(), e = this.erledigtZahl();
    if (e < n) l.push(`weitere Aufgaben (${e}/${n} erledigt)`);
    return l;
  }

  // Aussteigen auf Wunsch (Knopf/Aktionstaste), solange das Fahrzeug steht: Platz neben dem Fahrzeug, kurze Schonzeit gegen Zombies
  aussteigen(sid) {
    const s = this.raum.state, p = s.spieler.get(sid);
    if (!p || !this.eingestiegen.has(sid)) return false;
    if (Date.now() - (this.einstiegT.get(sid) ?? 0) < 2500) return false;   // gerade erst eingestiegen: ein versehentlicher Tastendruck wirft niemanden raus
    if (!s.busSteht || this.wechselLaeuft) { this.sendeAn(sid, '🚪 Aussteigen geht erst, wenn das Fahrzeug steht.'); return false; }
    const f = this.einstiegsPunkt() ?? p, fz = s.fahrzeuge.get(this.busId), w = (fz?.richtung ?? 0) + Math.PI / 2;
    const r = (this.heli ? HELI_ABSTAND : BUS_ABSTAND) + 14;
    const q = this.platzNeben(f.x + Math.cos(w) * r, f.y + Math.sin(w) * r);
    p.x = q.x; p.y = q.y; p.anBord = false;
    if (this.heli?.art === 'bunker') this.raum.bunker?.verlassen?.(sid);
    this.eingestiegen.delete(sid); this.ausgestiegen.add(sid);
    const x = this.raum.extra.get(sid); if (x) x.schonT = 3;   // 3 s lang beißen Zombies nicht
    this.sendeAn(sid, '🚪 Du bist ausgestiegen. Steig wieder ein, indem du erneut zum Fahrzeug gehst.');
    return true;
  }

  sendeAn(sid, text) { this.raum.clients?.find(c => c.sessionId === sid)?.send('meldung', { text, lang: true }); }

  einsteigMeldung(sid) {
    if (this.heli?.art === 'bunker') return this.sendeAn(sid, '☢️ Du bist im Bunker – hier überstehst du den Schlag. Zum Verlassen: Taste E oder Knopf „Aussteigen“.');
    const fz = this.heli ? { zeichen: '🚁', der: 'der Hubschrauber' } : this.fz(), fehlt = this.fehlt();
    this.sendeAn(sid, fehlt.length
      ? `${fz.zeichen} Du bist an Bord. ${fz.der[0].toUpperCase() + fz.der.slice(1)} kann aber noch nicht abfliegen/abfahren – es fehlt: ${fehlt.join(' · ')}. Zum Aussteigen: Taste E oder Knopf „Aussteigen“ (sonst fährt er nach der Wartezeit ohne Erfolg ab und setzt alle ab).`
      : `${fz.zeichen} Du bist an Bord – es geht los, sobald alle da sind (oder die Wartezeit abläuft).`);
  }

  // alle an Bord steigen aus (Platz neben dem Fahrzeug bzw. Einstiegspunkt) – Abfahrt ohne sie oder Ende der Evakuierung
  ausladen(text) {
    const s = this.raum.state;
    for (const sid of [...this.eingestiegen]) {
      const p = s.spieler.get(sid);
      if (!p) continue;
      const q = this.platzNeben(p.x + 36, p.y + 20);
      p.x = q.x; p.y = q.y; p.anBord = false;
      if (text && !this.raum.extra.get(sid)?.bot) this.sendeAn(sid, text);
    }
    this.eingestiegen.clear();; this.ausgestiegen.clear();
  }

  // Bunkertor (Finale): öffnet erst, wenn die Fahrt gelingen würde (Missionen erledigt); alle anderen Fahrzeuge: immer offen
  einsteigenOffen() { return this.heli?.art !== 'bunker' || this.fahrtGelingt(); }

  // Wer an Bord sitzt, obwohl die Fahrt noch nicht gelingt: 60 s und 15 s vor Ablauf der Wartezeit eine deutliche Warnung mit dem, was fehlt
  abfahrtWarnung() {
    if (!this.eingestiegen.size || this.fahrtGelingt()) { this.warnStufe = 0; return; }
    const stufe = this.busRest <= 15 ? 2 : this.busRest <= 60 ? 1 : 0;
    if (stufe <= (this.warnStufe ?? 0)) return;
    this.warnStufe = stufe;
    const fz = this.fz();
    for (const sid of this.eingestiegen) if (!this.raum.extra.get(sid)?.bot) this.sendeAn(sid, `⏳ ${fz.zeichen} Noch ${stufe === 2 ? 15 : 60} s, dann fährt ${fz.der} OHNE Erfolg ab und setzt alle ab. Es fehlt: ${this.fehlt().join(' · ') || '–'}`);
  }

  // Pflichtaufgaben und Mindestzahl erledigt: wer einsteigt, kann tatsächlich mitfahren
  fahrtGelingt() {
    return [...this.raum.state.aufgaben.values()].every(a => !a.pflicht || a.erledigt) && this.erledigtZahl() >= this.noetig();
  }

  // ---------- A400M (Evakuierungsart 'flugzeug') ----------
  // Ablauf: landet (Landerolle) → Einsteigen an der Heckrampe → sobald alle an Bord sind (oder die Zeit abläuft) fällt ein Triebwerk aus,
  // der Start wird abgebrochen → alle müssen raus und zu Fuß zum Hubschrauber-Landeplatz → der Hubschrauber landet, holt ab → Levelwechsel.
  flugAnkunft() {
    const s = this.raum.state, v = this.raum.verkehr, p = this.flugplan();
    if (!p) { this.laufendeArt = null; return this.ankunft(0); }
    const w = p.w;
    this.busId = v.evakuierungFlugzeug(p.start.x, p.start.y, w);
    this.busHeute = true; this.busRest = 0; s.busDa = true; s.busSteht = false; this.busGemeldet = false; this.busAbSetzen();
    this.flug = { von: { ...p.start }, bis: { ...p.mitte }, w, t: 0 };
    s.evakArt = 'flugzeug'; s.evakPhase = 'landung'; s.evakX = Math.round(p.rampe.x); s.evakY = Math.round(p.rampe.y);
    this.raum.broadcast('meldung', { text: '✈️ Ein A400M setzt zur Landung an – der Landeplatz ist auf der Karte markiert!', lang: true });
  }

  // Landerolle: bremst vom Aufsetztempo bis zum Stand an `bis`, dann beginnt das Einsteigen (evakuierungDa)
  flugRollen(dt) {
    const s = this.raum.state, f = s.fahrzeuge.get(this.busId), g = this.flug;
    if (!f || !g || g.fertig) return;
    const L = Math.hypot(g.bis.x - g.von.x, g.bis.y - g.von.y) || 1, a = ROLLEN_TEMPO * ROLLEN_TEMPO / (2 * L);   // gleichmäßig gebremst
    g.t += dt;
    const t = Math.min(g.t, ROLLEN_TEMPO / a), d = ROLLEN_TEMPO * t - a * t * t / 2;
    f.x = g.von.x + Math.cos(g.w) * d; f.y = g.von.y + Math.sin(g.w) * d; f.richtung = g.w;
    if (t >= ROLLEN_TEMPO / a - 1e-9) {
      f.x = g.bis.x; f.y = g.bis.y; g.fertig = true;
      const inf = this.raum.verkehr.info.get(this.busId);
      if (inf) inf.angekommen = true;
      s.evakPhase = 'einsteigen';
    }
  }

  // Der Start schlägt fehl: Meldung, alle steigen aus (neben die Heckrampe), der Hubschrauber wird gerufen
  flugFehlschlag() {
    const r = this.raum, s = r.state, p = this.flugplan();
    const ids = [...s.spieler.keys()].filter(id => this.eingestiegen.has(id));
    const f = s.fahrzeuge.get(this.busId);
    this.busHeute = true;
    s.busDa = false; s.busSteht = false; s.busBord = 0; s.busGesamt = 0;
    this.eingestiegen.clear();
    for (const id of ids) { const pl = s.spieler.get(id); if (pl) pl.anBord = false; }
    // das Flugzeug bleibt stehen (Wrack ohne Straßenweg); der Einstiegspunkt wandert zum Hubschrauberplatz
    this.busId = null;
    if (f) for (let i = 0; i < ids.length; i++) {
      const pl = s.spieler.get(ids[i]), c = Math.cos(f.richtung), sn = Math.sin(f.richtung);
      const q = this.platzNeben(p.rampe.x - c * 30 - sn * (i - (ids.length - 1) / 2) * 22, p.rampe.y - sn * 30 + c * (i - (ids.length - 1) / 2) * 22);
      pl.x = q.x; pl.y = q.y;
    }
    this.heli = { phase: 'anflug', rest: HELI_ANFLUG };
    s.evakX = Math.round(p.heli.x); s.evakY = Math.round(p.heli.y); s.evakPhase = 'heliAnflug'; s.evakRest = HELI_ANFLUG;
    r.broadcast('meldung', { text: '🔥 Triebwerk 3 des A400M fängt Feuer – Start abgebrochen! Alle raus!', lang: true });
    r.broadcast('meldung', { text: `🚁 Zu Fuß zum Hubschrauber-Landeplatz (auf der Karte markiert) – er landet in ${HELI_ANFLUG} s`, lang: true });
  }

  // nächster freier Punkt um (x, y) (für das Aussteigen)
  platzNeben(x, y) {
    const w = this.raum.welt;
    for (let rad = 0; rad <= 200; rad += 20) for (let k = 0; k < (rad ? 10 : 1); k++) {
      const a = k * Math.PI / 5, px = x + Math.cos(a) * rad, py = y + Math.sin(a) * rad;
      if (frei(w, px, py, 10)) return { x: px, y: py };
    }
    return { x, y };
  }

  // ---------- Hubschrauber von Anfang an (Kochel, 'heli') und Bunkertor (Finale, 'bunker') ----------
  // Beide sind „stehende Evakuierungspunkte“: Einsteigen jederzeit (mit Aussteigen), Punkt = state.evakX/evakY.
  dauerStart(art) {
    const s = this.raum.state, w = this.raum.welt;
    const p = art === 'bunker' ? bunkerPlan(w, s.seed)?.tor : heliPlan(w, s.seed)?.heli;
    if (!p) return;
    s.evakArt = art; s.evakX = Math.round(p.x); s.evakY = Math.round(p.y); s.evakAX = 0; s.evakAY = 0;
    this.heli = { phase: art === 'bunker' ? 'bunker' : 'wartet', dauer: true, art };
    s.busDa = true; s.busSteht = true; s.evakPhase = art === 'bunker' ? 'bunker' : 'heli';
    this.restSetzen();
  }

  // Countdown-Ende im Finale (server/finale.mjs ruft das): wer im Bunker (an Bord) ist, überlebt; alle anderen nicht.
  // Liefert { drinnen, draussen } (Spieler- und Bot-Ids, ohne Zombies); evakPhase 'sieg' wenn mindestens ein echter Spieler drin ist.
  bunkerEnde() {
    const r = this.raum, s = r.state, drinnen = [], draussen = [];
    for (const [sid, p] of s.spieler) {
      if (p.zombie > 0) continue;
      (this.eingestiegen.has(sid) && p.anBord ? drinnen : draussen).push(sid);
    }
    const echt = sid => !r.extra.get(sid)?.bot && s.spieler.get(sid)?.verbunden !== false;
    const sieg = drinnen.some(echt);
    s.evakPhase = sieg ? 'sieg' : 'niederlage';
    for (const sid of drinnen) if (echt(sid)) this.sendeAn(sid, '☢️ Der Bunker hält – ihr habt den Schlag überlebt!');
    for (const sid of draussen) if (echt(sid)) this.sendeAn(sid, '☢️ Der Schlag erwischt euch draußen …');
    r.broadcast('bunkerEnde', { drinnen, draussen, sieg });
    return { drinnen, draussen, sieg };
  }

  // ---------- Königsdorf ('absturz'): der A400M kommt zur Evakuierung und stürzt im Landeanflug ab ----------
  // Ablauf: Anflug (ABSTURZ_DAUER s, Client animiert) → Absturz mit Rauch und Brand, Wrack bleibt als Kulisse → sobald die Fahrt gelingt
  // (Missionsteile erledigt), kommt der NH90 (Anflug, Landung, Einsteigen/Abflug wie bei der A400M-Evakuierung).
  absturzStart() {
    const s = this.raum.state, p = absturzPlan(this.raum.welt, s.seed);
    if (!p) return;   // kann nicht vorkommen (absturzPlan liefert immer einen Plan), aber nie in eine andere Evakuierungsart ausweichen
    this.busHeute = true;
    this.crash = { rest: ABSTURZ_DAUER, phase: 'anflug' };
    s.evakArt = 'absturz'; s.evakPhase = 'absturz'; s.evakRest = ABSTURZ_DAUER;
    s.evakAX = Math.round(p.x); s.evakAY = Math.round(p.y); s.evakW = p.w;
    s.evakX = Math.round(p.heli.x); s.evakY = Math.round(p.heli.y);
    this.raum.broadcast('meldung', { text: '✈️ Ein A400M kommt im Landeanflug über die Berge …', lang: true });
  }

  absturzSchritt(dt) {
    const s = this.raum.state, c = this.crash;
    if (this.wechselLaeuft) return;
    this.takt -= dt;
    if (this.takt <= 0) { this.takt = 0.5; this.aktualisieren(); }
    if (c.phase === 'anflug') {
      c.rest -= dt; s.evakRest = Math.max(0, Math.ceil(c.rest));
      if (c.rest > 0) return;
      c.phase = 'wrack'; s.evakPhase = 'wrack'; s.evakRest = 0;
      this.raum.broadcast('meldung', { text: '💥 Der A400M stürzt ab! Keine Rettung aus der Luft – ein Hubschrauber kommt erst, wenn alles erledigt ist', lang: true });
      return;
    }
    if (!this.fahrtGelingt()) return;
    // die Missionsteile sind erledigt: der NH90 fliegt den Platz an
    this.crash = null; this.heli = { phase: 'anflug', rest: HELI_ANFLUG, art: 'absturz' };
    s.evakPhase = 'heliAnflug'; s.evakRest = HELI_ANFLUG;
    this.raum.broadcast('meldung', { text: `🚁 Funkkontakt steht – ein NH90 landet in ${HELI_ANFLUG} s auf dem markierten Platz`, lang: true });
  }

  // Hubschrauber: Anflug → gelandet und wartet (Einsteigen wie beim Bus) → Abflug und Levelwechsel; ohne alle fliegt er ab und kommt später wieder
  heliSchritt(dt) {
    const s = this.raum.state, h = this.heli;
    if (this.wechselLaeuft) return;
    if (h.phase === 'anflug') {
      h.rest -= dt; const rest = Math.max(0, Math.ceil(h.rest));
      if (s.evakRest !== rest) s.evakRest = rest;
      if (h.rest > 0) return;
      h.phase = 'wartet'; s.busDa = true; s.busSteht = true; s.evakPhase = 'heli'; this.restSetzen();
      this.raum.broadcast('meldung', { text: `🚁 Der Hubschrauber ist gelandet! Einsteigen – Abflug um ${hhmm(s.busAb)}`, lang: true });
      return;
    }
    this.takt -= dt;
    if (this.takt <= 0) { this.takt = 0.5; this.aktualisieren(); this.evakSync(); }   // Aufgaben/Missionen laufen auch beim wartenden Hubschrauber weiter
    const alleDa = this.mitfahrer();
    if (!this.heli) return;   // mitfahrer() hat abgebrochen
    if (h.phase === 'bunker') { this.bordRaffen(this.alleDa); return; }   // Bunkertor: nur hineingehen, kein Abflug – das Ende kommt mit dem Countdown (bunkerEnde)
    this.busRest -= dt; this.busAbSetzen();
    // Abflug nur, wenn die Fahrt gelingt (Pflicht-/Missionsaufgaben erledigt); sonst wartet er weiter
    if (!this.fahrtGelingt()) { this.alleBordGemeldet = false; if (this.busRest <= 0) this.restSetzen(); return; }
    this.bordRaffen(alleDa);
    if (this.busRest > 0) return;
    const nichtDa = s.busGesamt > s.busBord;
    if (this.echteDa >= 1) {
      this.heli = null; s.busDa = false; s.busSteht = false; s.busBord = 0; s.busGesamt = 0; this.folgenId = null;   // wer an Bord ist, bleibt bis zum Levelwechsel dort
      s.evakPhase = 'abflug'; s.evakRest = 0;
      this.erfolg(nichtDa, '🚁');
      return;
    }
    if (h.dauer) { this.restSetzen(); return; }   // steht dauerhaft (Kochel): wartet weiter
    // niemand da: er fliegt ab und kommt nach einer Weile wieder
    s.busDa = false; s.busSteht = false; s.busBord = 0; s.busGesamt = 0; this.ausladen();
    this.heli = { phase: 'anflug', rest: HELI_NEU }; s.evakPhase = 'heliAnflug'; s.evakRest = HELI_NEU;
    this.raum.broadcast('meldung', { text: `🚁 Der Hubschrauber ist ohne euch abgeflogen – er kommt in ${HELI_NEU} s noch einmal`, lang: true });
  }

  // Punkt, an dem man einsteigt: Bus/Panzer = Fahrzeugmitte, A400M = Heckrampe, Hubschrauber = Landeplatz (Einstellung evakX/evakY)
  einstiegsPunkt() {
    const s = this.raum.state;
    if (this.heli) return { x: s.evakX, y: s.evakY };
    const f = s.fahrzeuge.get(this.busId);
    if (!f) return null;
    return this.fz().art === 'flugzeug' ? { x: s.evakX, y: s.evakY } : f;
  }

  abfahrt() {
    const s = this.raum.state;
    const pflichtOk = [...s.aufgaben.values()].every(a => !a.pflicht || a.erledigt);
    const geschafft = pflichtOk && this.erledigtZahl() >= this.noetig() && this.echteDa >= 1;
    const nichtDa = s.busGesamt > s.busBord;
    if (geschafft && this.fz().art === 'flugzeug') { this.flugFehlschlag(); return; }   // die Maschine schafft es nicht in die Luft
    const fehltText = this.fehlt().join(' · ');
    if (!geschafft) this.ausladen(`${this.fz().zeichen} ${this.fz().Der} fährt ohne Erfolg ab – ihr steigt aus. Es fehlte: ${fehltText || 'jemand an Bord'}`);
    else this.folgenId = this.busId;   // wer an Bord ist, fährt bis zum Levelwechsel mit
    this.busWeg(geschafft);
    this.busHeute = true;
    if (!geschafft) {
      this.raum.broadcast('meldung', { text: `${this.fz().zeichen} ${this.fz().Der} ist ohne euch ${this.fz().art === 'flugzeug' ? 'abgeflogen' : 'abgefahren'} (es fehlte: ${fehltText || 'jemand an Bord'}) – morgen gibt es ${this.fz().neu}`, lang: true });
      return;
    }
    this.erfolg(nichtDa);
  }

  // Evakuierung geschafft: Meldung, Erfahrung und Levelwechsel nach einer kurzen Pause
  erfolg(nichtDa, zeichen = this.fz().zeichen) {
    const s = this.raum.state;
    const karte = this.naechsteKarte();
    this.raum.xpAlle?.('evakuierung');
    this.raum.broadcast('meldung', { text: `🎉 Geschafft! Weiter nach Level ${s.level + 1} – ${KARTEN_NAMEN[karte] ?? karte}`, lang: true });
    if (nichtDa) this.raum.broadcast('meldung', { text: `${zeichen} Wer nicht an Bord war, kommt trotzdem mit – ihr seid eine Gruppe` });
    this.wechselLaeuft = true;
    this.levelVorplanen();
    this.raum.clock.setTimeout(() => this.levelWechsel(), this.wechselVerzoegerung);
  }

  // Nächstes Level (Karte + Seed) schon jetzt festlegen: der Server baut die Welt im Worker-Thread vor (weltcache.mjs), die Clients
  // bekommen 'weltvorschau' und rechnen sie im Hintergrund in ihren Zwischenspeicher. Der Levelwechsel nach der Pause nutzt genau diesen Plan.
  levelVorplanen() {
    try {
      const r = this.raum, s = r.state;
      let karte = this.naechsteKarte();
      if (karte === 'geretsried') karte = r.constructor.level1Wahl || level1Karte();
      const seed = Math.floor(Math.random() * 2 ** 31);
      const autos = Math.max(0, Math.min(50, Math.round((r.constructor.einstellungen?.autoFaktor ?? 1) * 10)));   // wie SpielRaum.onCreate für neue Level
      this.plan = { von: s.karte, karte, seed, autos };
      const k = r.constructor.karteVon?.(karte);
      if (k?.kacheln) weltVorbereiten(k, seed, autos / 10);
      r.broadcast('weltvorschau', { karte, seed, autos });
    } catch (e) { this.plan = null; console.error('Level vorplanen:', e.message); }
  }

  naechsteKarte() {
    const i = LEVEL_KARTEN.indexOf(levelSchluessel(this.raum.state.karte || 'dorf'));
    return LEVEL_KARTEN[(i + 1) % LEVEL_KARTEN.length];
  }

  // neue Karte einstellen und die Welt mit neuem Level neu starten; Rucksack und Werte der Spieler bleiben
  // ziel (optional): { karte, level, frisch } – Testbefehl und Finale; frisch = ganz neue Runde (Level 1, Fähigkeiten und Startwahl von vorn)
  levelWechsel(ziel = null) {
    const r = this.raum, s = r.state;
    const plan = !ziel && this.plan?.von === s.karte ? this.plan : null;   // in erfolg() vorgeplant (Karte + Seed, Welt ist schon im Bau)
    this.plan = null;
    let karte = ziel?.karte ?? plan?.karte ?? this.naechsteKarte();
    if (!plan && karte === 'geretsried' && !ziel?.fest) karte = r.constructor.level1Wahl || level1Karte();   // Level 1: feste Wahl aus dem Backend, sonst Zufall
    r.constructor.kartenWechsel?.(karte);
    for (const p of s.spieler.values()) p.anBord = false;
    this.eingestiegen.clear(); this.folgenId = null;
    if (ziel?.frisch) return r.weltNeuStarten(false);
    r.weltNeuStarten(false, {
      version: WELT_VERSION, karte, seed: plan?.seed ?? Math.floor(Math.random() * 2 ** 31), zeit: 0, uhr: 8 * 60,
      besiegt: s.besiegt, level: ziel?.level ?? s.level + 1, chat: [...r.chatVerlauf],
    });
  }
}

// Gemeinsame Aufgaben und der Evakuierungsbus: Pro Welt (Level) zieht der Server einige Aufgaben aus einem Vorrat.
// Der Funkspruch am Funktisch eines Safe Rooms ist immer Pflicht und meldet die Gruppe für den Bus an.
// Der Bus steht zur eingestellten Zeit am Ortsausgang; sind bei der Abfahrt genug Aufgaben erledigt, geht es in
// die nächste Karte (Level), sonst fährt er ohne die Gruppe ab und kommt am nächsten Spieltag wieder.
import { schema, t } from '@colyseus/schema';
import { KACHEL, WELT_VERSION, BUS_ABSTAND, zufall, WAFFEN, frei } from '../client/welt.mjs';
import { LEOPARD, A400M, evakArtFuer, imFussabdruck } from '../client/evak.mjs';
import { flugplanBerechnen } from './flugplatz.mjs';
import { missionsPlan, kreisSchrumpfen, FUNK_TEILE } from './mission.mjs';
import { DINGE } from '../client/welt.mjs';

// Suchkreis eines Missionsgegenstands für die Clients (Karte): Mitte, Radius, abgegeben
export const Mission = schema({ ding: t.string(), x: t.number(), y: t.number(), r: t.number(), abgegeben: t.boolean() }, 'Mission');

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
export const LEVEL_KARTEN = ['geretsried', 'isarauen'];
export const KARTEN_NAMEN = { geretsried: 'Geretsried', isarauen: 'die Isarauen', dorf: 'das Dorf' };

export const STUETZPUNKT = 'stuetzpunkt';   // funkSafe, wenn der Funkspruch im Funkzelt des Bundeswehr-Stützpunkts abgesetzt wurde
const TOR_SCHLOESSER = 3;   // wie TOR_RAETSEL in raum.mjs
const WARNUNG_MIN = 30;     // so viele Spielminuten vor der Ankunft kommt die Funkmeldung
const WARTE_RADIUS = 800;   // 100 m um den Abholpunkt: stehen dort alle Lebenden, läuft die Uhr schneller (warteRaffer)

const kisten = raum => [...raum.state.safes.values()].flatMap(s => [...s.kiste]);
const anzahl = (liste, ding) => liste.filter(d => d === ding).length;

// Aufgabenvorrat. ziel(n) und text(n) bekommen die Spielerzahl; stand(a) liefert den aktuellen Fortschritt.
const ARTEN = {
  funk: {
    symbol: '📻', pflicht: true,
    text: () => 'Funkspruch absetzen (Funktisch im Safe Room)', ziel: () => 1,
    stand: a => a.raum.state.funk ? 1 : 0,
  },
  vorraete: {
    symbol: '📦',
    text: n => `Vorräte sichern: ${2 + n} Wasser + ${2 + n} Essen in Safe-Room-Kisten`, ziel: n => 2 * (2 + n),
    stand: (a, n) => { const k = kisten(a.raum); return Math.min(anzahl(k, 'wasser'), 2 + n) + Math.min(anzahl(k, 'essen'), 2 + n); },
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
    stand: a => [...a.raum.state.spieler.values()].filter(p => p.lampe > 0 || p.rucksack.includes('taschenlampe')).length,
  },
  // Missionsgegenstände (server/mission.mjs): jeder liegt in einem weit entfernten Gebäude und wird in eine Safe-Room-Kiste gelegt
  mission: {
    symbol: '🧩', pflicht: true,
    text: (n, a) => 'Missionsgegenstände finden und in die Safe-Room-Kiste legen: ' + a.mission.map(m => `${a.abgegeben.has(m.ding) ? '✅' : '⬜'} ${DINGE[m.ding].name}`).join(' · '),
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
const UEBERROLLEN_PAUSE = 0.1;                                       // Leopard: so oft (s) wird der Fußabdruck auf Zombies geprüft

export class Aufgaben {
  constructor(raum) {
    this.raum = raum;
    this.basis = 0;            // Stand von state.besiegt bei Aufgabenbeginn
    this.funkSafe = '';        // Safe Room, in dem der Funkspruch abgesetzt wurde
    this.medizin = false;      // Spritze aus der Apotheke gefunden
    this.busId = null;
    this.busRest = 0;          // ECHTE Sekunden bis zur Abfahrt (ab dem Halt)
    this.busHeute = false;     // der Bus war in diesem Zeitfenster schon da
    this.ankGemeldet = false;
    this.echteDa = 0;
    this.eingestiegen = new Set();   // Spieler, die Bus/Panzer unterwegs eingesammelt hat (fahren mit)
    this.wechselLaeuft = false;
    this.wechselVerzoegerung = 5000;   // ms zwischen „Geschafft!“ und dem Weltwechsel
    this.takt = 0;
    this.flug = null;          // A400M: Landerolle { von, bis, t } | Hubschrauberphase { phase, rest }
    this.heli = null;
    this.mission = [];         // Plan der Missionsorte (server/mission.mjs)
    this.abgegeben = new Set();   // Missionsgegenstände, die in einer Safe-Room-Kiste abgegeben wurden
    this.hinweise = {};        // Gegenstand → Zahl der Hinweise (Suchkreis halbiert)
    this.planKey = '';
    this.fehlPruef = 0;
  }

  einst() { return { an: false, stunde: 18, wartezeit: 60, wartenEchtMin: 10, anzahl: 4, ...(this.raum.einstellungen?.()?.aufgaben ?? {}) }; }
  an() { return !!this.einst().an; }
  bw() { return { leopardReichweite: 29, leopardPause: EVAK_PAUSE, leopardSchaden: 100, leopardUeberrollen: true, ...(this.raum.einstellungen?.()?.bundeswehr ?? {}) }; }

  // Evakuierungsart dieser Karte; die Einstellung aufgaben.evakArt erzwingt eine Art zum Ausprobieren.
  // Flugzeug braucht einen Landestreifen und einen Hubschrauberplatz in der Welt, sonst Bus.
  evakArt() {
    const s = this.raum.state, w = this.raum.welt;
    const art = this.einst().evakArt || evakArtFuer(s.karte);
    if (art === 'flugzeug' && !(w && w.fein && flugplanBerechnen(w, s.seed))) return 'bus';
    return art;
  }
  flugplan() { const w = this.raum.welt; return w?.fein ? flugplanBerechnen(w, this.raum.state.seed) : null; }

  // Art, Anzeige und Abholpunkt in den Zustand schreiben (nur wenn gerade nichts unterwegs ist)
  evakSync() {
    const s = this.raum.state;
    if (s.busDa || this.flug || this.heli) return;
    const art = this.evakArt();
    if (s.evakArt !== art) s.evakArt = art;
    const p = art === 'flugzeug' ? this.flugplan() : null;
    const x = p ? Math.round(p.rampe.x) : 0, y = p ? Math.round(p.rampe.y) : 0;
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
    this.flug = null; this.heli = null; s.evakPhase = ''; s.evakRest = 0; this.evakSync();
    for (const p of s.spieler.values()) p.anBord = false;
    this.eingestiegen.clear(); this.folgenId = null;
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
      mission: { abgegeben: [...this.abgegeben], hinweise: { ...this.hinweise } },
    };
  }

  // Fortschritt neu berechnen; erledigt bleibt erledigt
  aktualisieren(melden = true) {
    const n = this.spielerZahl();
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
    this.mission = []; this.abgegeben = new Set(); this.hinweise = {}; this.planKey = '';
    s.missionen?.clear(); s.missionOffen = 0;
    if (!this.an() || !r.welt?.haeuser) return;
    this.planKey = `${s.seed}:${s.level}:${s.karte}`;
    this.mission = missionsPlan(s.seed, s.level, s.karte, r.welt);
    const bekannt = new Set(this.mission.map(m => m.ding));
    for (const d of gespeichert?.abgegeben ?? []) if (bekannt.has(d)) this.abgegeben.add(d);
    for (const m of this.mission) {
      const h = Math.max(0, Math.min(4, Math.round(Number(gespeichert?.hinweise?.[m.ding]) || 0)));
      for (let i = 0; i < h; i++) kreisSchrumpfen(m);
      this.hinweise[m.ding] = h;
      const q = new Mission(); q.ding = m.ding; q.x = Math.round(m.kx); q.y = Math.round(m.ky); q.r = Math.round(m.r); q.abgegeben = this.abgegeben.has(m.ding);
      s.missionen?.set(m.ding, q);
    }
    s.missionOffen = this.mission.length - this.abgegeben.size;
  }

  missionFertig() { return !this.raum.state.aufgaben.has('mission') || this.mission.every(m => this.abgegeben.has(m.ding)); }

  // Gegenstände, die beim ersten Durchsuchen dieses Behälters dazugelegt werden
  missionsFunde(behaelterId) {
    if (!this.an()) return [];
    return this.mission.filter(m => m.behaelter === behaelterId && !this.abgegeben.has(m.ding)).map(m => m.ding);
  }

  // Fehlende Teile für den Funkspruch (Namen); leer = Funkspruch möglich
  funkFehlt() {
    if (!this.raum.state.aufgaben.has('mission')) return [];
    return FUNK_TEILE.filter(d => this.mission.some(m => m.ding === d) && !this.abgegeben.has(d)).map(d => DINGE[d].name);
  }

  // Missionsgegenstand in einer Safe-Room-Kiste: abgegeben (zählt für alle, wird aus der Kiste genommen)
  abgabePruefen(melden = true) {
    if (!this.mission.length) return;
    const s = this.raum.state;
    for (const m of this.mission) {
      if (this.abgegeben.has(m.ding)) continue;
      for (const safe of s.safes.values()) {
        const i = safe.kiste.indexOf(m.ding);
        if (i < 0) continue;
        safe.kiste.splice(i, 1);
        this.abgegeben.add(m.ding);
        const q = s.missionen.get(m.ding); if (q) q.abgegeben = true;
        s.missionOffen = this.mission.length - this.abgegeben.size;
        if (melden) this.raum.broadcast('meldung', { text: `${DINGE[m.ding].zeichen} ${DINGE[m.ding].name} abgegeben (${this.abgegeben.size}/${this.mission.length})`, lang: true });
        break;
      }
    }
    if (melden && (this.fehlPruef -= 0.5) <= 0) { this.fehlPruef = 10; this.verlorenPruefen(); }
  }

  // Hinweis (Zettel, geretteter Mensch): Suchkreis des Gegenstands halbieren; ohne Angabe ein zufällig gewählter offener
  missionHinweis(ding) {
    const offen = this.mission.filter(m => !this.abgegeben.has(m.ding) && m.r > 150);
    const m = ding ? this.mission.find(q => q.ding === ding && !this.abgegeben.has(q.ding)) : offen[Math.floor(this.raum.rnd() * offen.length)];
    if (!m || !kreisSchrumpfen(m)) return null;
    this.hinweise[m.ding] = (this.hinweise[m.ding] ?? 0) + 1;
    const q = this.raum.state.missionen.get(m.ding);
    if (q) { q.x = Math.round(m.kx); q.y = Math.round(m.ky); q.r = Math.round(m.r); }
    return m.ding;
  }

  // Gegenstand weg (Spieler abgemeldet, Behälter schon früher geleert …)? Dann liegt er wieder im Behälter
  verlorenPruefen() {
    const r = this.raum, s = r.state;
    for (const m of this.mission) {
      if (this.abgegeben.has(m.ding)) continue;
      const inh = r.inhalte.get(m.behaelter);
      if (!inh) continue;   // noch nie durchsucht: wird beim ersten Mal dazugelegt
      if (inh.includes(m.ding)) continue;
      if ([...s.spieler.values()].some(p => p.rucksack.includes(m.ding))) continue;
      if ([...s.boden.values()].some(b => b.ding === m.ding)) continue;
      if ([...s.safes.values()].some(sf => sf.kiste.includes(m.ding))) continue;
      if ([...(r.tausche?.values?.() ?? [])].some(tt => Object.values(tt.angebot ?? {}).some(l => l.includes(m.ding)))) continue;
      inh.push(m.ding); r.setzeInhalt(m.behaelter, inh);
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
    const nx = Math.max(m.x * KACHEL, Math.min((m.x + m.b) * KACHEL, p.x)), ny = Math.max(m.y * KACHEL, Math.min((m.y + m.h) * KACHEL, p.y));
    return Math.hypot(p.x - nx, p.y - ny) < 44 ? { art: 'funk', safe, dauer: 4 } : null;
  }

  // ---------- Takt ----------
  schritt(dt) {
    const s = this.raum.state;
    if (!this.an()) { if (s.busDa || this.heli) this.busWeg(); return; }
    if (this.heli) { this.heliSchritt(dt); return; }
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
    // sofortige Abfahrt nur, wenn die Fahrt auch gelingt – sonst wartet er bis zum Ablauf der Zeit
    if ((alleDa && this.fahrtGelingt()) || this.busRest <= 0) this.abfahrt();
  }

  // Bus (Gewehre aus den Fenstern) und Panzer (Turm-MG) schießen vom Erscheinen bis zur Abfahrt auf Zombies in der Nähe;
  // Treffer nur auf Zombies draußen, nie auf Spieler. Darstellung wie bei Soldaten/MG-Nest ('bwschuss', n = -1).
  evakFeuer(dt) {
    const r = this.raum, s = r.state, f = s.fahrzeuge.get(this.busId);
    if (!f) return;
    const art = this.fz().art;
    if (art === 'flugzeug') return;
    const bw = this.bw(), panzer = art === 'panzer';
    if (panzer && bw.leopardUeberrollen) this.ueberrollen(f, dt);
    this.feuerKuehl = (this.feuerKuehl ?? 0) - dt;
    if (this.feuerKuehl > 0) return;
    // Leopard: Turmdrehpunkt vor der Wannenmitte; Reichweite aus den Einstellungen (Meter)
    const px = panzer ? f.x + Math.cos(f.richtung) * LEOPARD.turmX : f.x, py = panzer ? f.y + Math.sin(f.richtung) * LEOPARD.turmX : f.y;
    let ziel = null, bd = panzer ? bw.leopardReichweite * 8 : EVAK_REICHWEITE;
    for (const [id, z] of s.zombies) {
      if (z.ebene || !(z.hp > 0)) continue;
      const d = Math.hypot(z.x - px, z.y - py);
      if (d < bd) { bd = d; ziel = [id, z]; }
    }
    if (!ziel) return;
    this.feuerKuehl = panzer ? bw.leopardPause : EVAK_PAUSE;
    const [id, z] = ziel;
    // Bus: Fenster verteilt über die Länge, auf der Seite zum Ziel; Leopard: Lader-MG im (zum Ziel gedrehten) Turm
    let x = f.x, y = f.y, turmW;
    if (panzer) {
      turmW = Math.atan2(z.y - py, z.x - px);
      const c = Math.cos(turmW), sn = Math.sin(turmW);
      x = px + c * LEOPARD.mgX - sn * LEOPARD.mgY; y = py + sn * LEOPARD.mgX + c * LEOPARD.mgY;
    } else {
      const c = Math.cos(f.richtung), sn = Math.sin(f.richtung), laengs = (r.rnd() - 0.5) * 100;
      const links = (z.y - f.y) * c - (z.x - f.x) * sn > 0 ? 1 : -1;   // Seite des Ziels
      x = f.x + c * laengs - sn * 9 * links; y = f.y + sn * laengs + c * 9 * links;
    }
    const treffer = r.rnd() < (this.evakTrefferChance ?? EVAK_TREFFER);
    const w = Math.atan2(z.y - y, z.x - x) + (treffer ? 0 : (r.rnd() < 0.5 ? -1 : 1) * (0.06 + r.rnd() * 0.08));
    const d = Math.hypot(z.x - x, z.y - y);
    r.broadcast('bwschuss', { art: 'mg', n: -1, x1: x, y1: y, x2: x + Math.cos(w) * d, y2: y + Math.sin(w) * d, w, t: treffer ? 1 : 0, ...(panzer ? { evak: 'panzer', tw: turmW } : {}) });
    if (treffer) {
      const vorher = s.besiegt, von = this.schuetze ??= { name: panzer ? 'Evakuierungspanzer' : 'Evakuierungsbus', x, y, besiegt: 0 };
      von.x = x; von.y = y;
      r.schaden(id, z, panzer ? bw.leopardSchaden : (r.einstellungen?.()?.waffen?.gewehr?.schaden ?? WAFFEN.gewehr.schaden), von);
      s.besiegt = vorher;   // zählt nicht für die Aufgaben der Spieler (wie die Bundeswehr)
    }
  }

  // Leopard: Zombies im Fußabdruck der fahrenden Wanne werden überrollt (sterben auf der Stelle, kein Kriechen; Blut und Leiche wie üblich).
  // Spieler nie: das Fahrzeug bremst vor ihnen (server/verkehr.mjs, imWeg) – hier wird nur geprüft, ob ein Spieler im Weg steht.
  ueberrollen(f, dt) {
    this.ueberrollKuehl = (this.ueberrollKuehl ?? 0) - dt;
    if (this.ueberrollKuehl > 0 || f.haelt) return;
    this.ueberrollKuehl = UEBERROLLEN_PAUSE;
    const r = this.raum, s = r.state, hl = LEOPARD.laenge / 2, hb = LEOPARD.breite / 2;
    for (const [id, z] of [...s.zombies]) {
      if (z.ebene || !(z.hp > 0) || Math.abs(z.x - f.x) > hl + 12 || Math.abs(z.y - f.y) > hl + 12) continue;
      if (!imFussabdruck(f, z.x, z.y, hl, hb, 6)) continue;
      const vorher = s.besiegt, von = this.schuetze ??= { name: 'Evakuierungspanzer', x: f.x, y: f.y, besiegt: 0 };
      von.x = f.x; von.y = f.y;
      z.kriecht = true;                         // nicht ganz tot: gibt es nicht, die Ketten erledigen ihn
      r.schaden(id, z, z.hp + 1, von);
      s.besiegt = vorher;                       // zählt nicht für die Aufgaben der Spieler
      r.broadcast('ueberrollt', { x: z.x, y: z.y });
    }
  }

  restSetzen() {
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
      const ev = s.evakX > 0 && s.evakY > 0 && this.evakArt() === 'flugzeug';
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
    if (this.evakArt() === 'flugzeug') { this.laufendeArt = 'flugzeug'; this.flugAnkunft(); return; }   // Flug läuft bis zum Ende, auch wenn die Einstellung wechselt
    const tx = (tor.x + 1) * KACHEL, ty = (tor.y + 1) * KACHEL;
    const links = tor.x === 0;
    let x = links ? tx + 4 * KACHEL : tx, y = links ? ty : ty + 4 * KACHEL;
    const k = v.graph?.knoten?.length ? [...v.graph.knoten].sort((a, b) => Math.hypot(a.x - tx, a.y - ty) - Math.hypot(b.x - tx, b.y - ty))[0] : null;
    if (k && Math.hypot(k.x - tx, k.y - ty) < 400) { x = k.x; y = k.y; }
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
      : art === 'flugzeug' ? { art, zeichen: '✈️', Der: 'Der A400M', der: 'der A400M', name: 'A400M', neu: 'eine neue Maschine' }
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
    this.flug = null; this.laufendeArt = null;
    if (this.heli) { this.heli = null; s.evakPhase = ''; s.evakRest = 0; this.evakSync(); }
    else if (s.evakPhase) { s.evakPhase = ''; }
  }

  // nach der erfolgreichen Abfahrt: wer an Bord ist, bewegt sich mit dem abfahrenden Fahrzeug bis zum Levelwechsel
  mitnehmen() {
    const s = this.raum.state, f = this.folgenId ? s.fahrzeuge.get(this.folgenId) : null;
    if (!f) return;
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
      if (!an && !p.ebene && !p.unten && Math.hypot(p.x - f.x, p.y - f.y) < abstand) {
        an = true; this.eingestiegen.add(sid); p.anBord = true;
        if (!bot) this.einsteigMeldung(sid);
      }
      if (an) { p.x = f.x; p.y = f.y; p.anBord = true; }   // fährt mit
      gesamt++; if (an) bord++;
      // Abfahrt wartet nur auf echte, verbundene, stehende Spieler – Bots und Liegende kommen beim Levelwechsel ohnehin mit
      if (!bot && p.verbunden !== false && !p.unten) { lebende++; if (an) lebendeDa++; }
      if (!bot && p.verbunden !== false && an) echtDa++;
    }
    s.busBord = bord; s.busGesamt = gesamt; this.echteDa = echtDa;
    return lebende > 0 && lebendeDa === lebende;
  }

  // was für eine erfolgreiche Abfahrt noch fehlt (Pflichtaufgaben, Mindestzahl erledigter Aufgaben)
  fehlt() {
    const l = [...this.raum.state.aufgaben.values()].filter(a => a.pflicht && !a.erledigt).map(a => `${a.symbol} ${a.text}`);
    const n = this.noetig(), e = this.erledigtZahl();
    if (e < n) l.push(`weitere Aufgaben (${e}/${n} erledigt)`);
    return l;
  }

  sendeAn(sid, text) { this.raum.clients?.find(c => c.sessionId === sid)?.send('meldung', { text, lang: true }); }

  einsteigMeldung(sid) {
    const fz = this.heli ? { zeichen: '🚁', der: 'der Hubschrauber' } : this.fz(), fehlt = this.fehlt();
    this.sendeAn(sid, fehlt.length
      ? `${fz.zeichen} Du bist an Bord. ${fz.der[0].toUpperCase() + fz.der.slice(1)} kann aber noch nicht abfliegen/abfahren – es fehlt: ${fehlt.join(' · ')}. Steig bei Bedarf nach der Wartezeit wieder aus.`
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
    this.eingestiegen.clear();
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
    this.busRest -= dt; this.busAbSetzen();
    const alleDa = this.mitfahrer();
    if (!this.heli) return;   // mitfahrer() hat abgebrochen
    if (!alleDa && this.busRest > 0) return;
    const nichtDa = s.busGesamt > s.busBord;
    if (this.echteDa >= 1) {
      this.heli = null; s.busDa = false; s.busSteht = false; s.busBord = 0; s.busGesamt = 0; this.folgenId = null;   // wer an Bord ist, bleibt bis zum Levelwechsel dort
      s.evakPhase = 'abflug'; s.evakRest = 0;
      this.erfolg(nichtDa, '🚁');
      return;
    }
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
    if (!geschafft) this.ausladen(`${this.fz().zeichen} ${this.fz().Der} fährt ohne euch ab – ihr steigt aus. Es fehlte: ${this.fehlt().join(' · ') || 'jemand an Bord'}`);
    else this.folgenId = this.busId;   // wer an Bord ist, fährt bis zum Levelwechsel mit
    this.busWeg(geschafft);
    this.busHeute = true;
    if (!geschafft) {
      this.raum.broadcast('meldung', { text: `${this.fz().zeichen} ${this.fz().Der} ist ohne euch ${this.fz().art === 'flugzeug' ? 'abgeflogen' : 'abgefahren'} – morgen gibt es ${this.fz().neu}`, lang: true });
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
    this.raum.clock.setTimeout(() => this.levelWechsel(), this.wechselVerzoegerung);
  }

  naechsteKarte() {
    const i = LEVEL_KARTEN.indexOf(this.raum.state.karte || 'dorf');
    return LEVEL_KARTEN[(i + 1) % LEVEL_KARTEN.length];
  }

  // neue Karte einstellen und die Welt mit neuem Level neu starten; Rucksack und Werte der Spieler bleiben
  levelWechsel() {
    const r = this.raum, s = r.state, karte = this.naechsteKarte();
    r.constructor.kartenWechsel?.(karte);
    for (const p of s.spieler.values()) p.anBord = false;
    this.eingestiegen.clear(); this.folgenId = null;
    r.weltNeuStarten(false, {
      version: WELT_VERSION, karte, seed: Math.floor(Math.random() * 2 ** 31), zeit: 0, uhr: 8 * 60,
      besiegt: s.besiegt, level: s.level + 1, chat: [...r.chatVerlauf],
    });
  }
}

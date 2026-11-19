// Gemeinsame Aufgaben und der Evakuierungsbus: Pro Welt (Level) zieht der Server einige Aufgaben aus einem Vorrat.
// Der Funkspruch am Funktisch eines Safe Rooms ist immer Pflicht und meldet die Gruppe für den Bus an.
// Der Bus steht zur eingestellten Zeit am Ortsausgang; sind bei der Abfahrt genug Aufgaben erledigt, geht es in
// die nächste Karte (Level), sonst fährt er ohne die Gruppe ab und kommt am nächsten Spieltag wieder.
import { schema, t } from '@colyseus/schema';
import { KACHEL, WELT_VERSION, BUS_ABSTAND, zufall } from '../client/welt.mjs';

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

export class Aufgaben {
  constructor(raum) {
    this.raum = raum;
    this.basis = 0;            // Stand von state.besiegt bei Aufgabenbeginn
    this.funkSafe = '';        // Safe Room, in dem der Funkspruch abgesetzt wurde
    this.medizin = false;      // Spritze aus der Apotheke gefunden
    this.busId = null;
    this.busRest = 0;          // Spielminuten bis zur Abfahrt
    this.busHeute = false;     // der Bus war in diesem Zeitfenster schon da
    this.ankGemeldet = false;
    this.echteDa = 0;
    this.wechselLaeuft = false;
    this.wechselVerzoegerung = 5000;   // ms zwischen „Geschafft!“ und dem Weltwechsel
    this.takt = 0;
  }

  einst() { return { an: false, stunde: 18, wartezeit: 60, anzahl: 4, ...(this.raum.einstellungen?.()?.aufgaben ?? {}) }; }
  an() { return !!this.einst().an; }
  spielerZahl() { return Math.max(1, this.raum.state.spieler.size); }

  // beim Aufbau der Welt: gespeicherten Stand laden (nur wenn er zur Welt passt) oder neu ziehen
  start(stand, passt) {
    const s = this.raum.state;
    s.level = Math.max(1, Math.min(250, Math.round(Number(stand?.level) || 1)));
    s.funk = false; s.busDa = false; s.busAnkunft = -1; s.busAb = -1; s.busBord = 0; s.busGesamt = 0;
    this.basis = s.besiegt;
    if (!this.an()) return;
    const g = passt ? stand?.aufgaben : null;
    const ids = Array.isArray(g?.ids) ? g.ids.filter(id => ARTEN[id]) : [];
    if (ids.length) {
      for (const id of ids) this.neu(id, !!g.erledigt?.[id]);
      this.basis = Number.isFinite(g.basis) ? g.basis : s.besiegt;
      this.funkSafe = typeof g.funkSafe === 'string' ? g.funkSafe : '';
      this.medizin = !!g.medizin;
      s.funk = !!g.funk;
    } else this.ziehen();
    this.aktualisieren(false);
    if (s.funk) s.busAnkunft = this.einst().stunde * 60;
  }

  // deterministisch aus Seed und Level: Funkspruch immer, dazu zufällig weitere aus dem Vorrat
  ziehen() {
    const s = this.raum.state;
    const rng = zufall((s.seed ^ Math.imul(s.level, 0x9e3779b1) ^ 0xa0f6) >>> 0);
    const rest = Object.keys(ARTEN).filter(id => id !== 'funk');
    for (let i = rest.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [rest[i], rest[j]] = [rest[j], rest[i]]; }
    const n = Math.max(3, Math.min(6, Math.round(this.einst().anzahl)));
    for (const id of ['funk', ...rest.slice(0, n - 1)]) this.neu(id, false);
  }

  neu(id, erledigt) {
    const art = ARTEN[id], a = new Aufgabe(), n = this.spielerZahl();
    a.id = id; a.symbol = art.symbol; a.pflicht = !!art.pflicht;
    a.text = art.text(n); a.ziel = art.ziel(n); a.fortschritt = erledigt ? a.ziel : 0; a.erledigt = erledigt;
    this.raum.state.aufgaben.set(id, a);
  }

  speichern() {
    const s = this.raum.state;
    if (!s.aufgaben.size) return null;
    return {
      ids: [...s.aufgaben.keys()], erledigt: Object.fromEntries([...s.aufgaben].filter(([, a]) => a.erledigt).map(([id]) => [id, true])),
      basis: this.basis, funk: s.funk, funkSafe: this.funkSafe, medizin: this.medizin,
    };
  }

  // Fortschritt neu berechnen; erledigt bleibt erledigt
  aktualisieren(melden = true) {
    const n = this.spielerZahl();
    for (const [id, a] of this.raum.state.aufgaben) {
      const art = ARTEN[id];
      if (!art || a.erledigt) continue;
      a.ziel = art.ziel(n); a.text = art.text(n);
      const f = art.stand(this, n);
      a.fortschritt = Math.min(f, a.ziel);
      if (f >= a.ziel) {
        a.erledigt = true; a.fortschritt = a.ziel;
        if (melden) { this.raum.broadcast('meldung', { text: `✅ Aufgabe erledigt: ${a.symbol} ${a.text}`, lang: true }); this.raum.xpAlle?.('aufgabe'); }
      }
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
    this.raum.broadcast('meldung', { text: `📻 ${p.name} hat den Funkspruch abgesetzt – der Evakuierungsbus kommt um ${hhmm(s.busAnkunft)} zum Ortsausgang!`, lang: true });
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
    if (!this.an()) { if (s.busDa) this.busWeg(); return; }
    if (!s.aufgaben.size) { this.basis = s.besiegt; this.ziehen(); }   // zur Laufzeit eingeschaltet
    this.takt -= dt;
    if (this.takt <= 0) { this.takt = 0.5; this.aktualisieren(); }
    if (this.wechselLaeuft) return;
    const { stunde, wartezeit } = this.einst();
    const A = stunde * 60;
    if (!s.busDa) {
      if (!s.funk) return;
      const seit = (s.uhr - A + 1440) % 1440;          // Minuten seit der Ankunftszeit
      const bis = (A - s.uhr + 1440) % 1440;           // Minuten bis zur Ankunftszeit
      if (seit < wartezeit) {
        if (!this.busHeute) this.ankunft(wartezeit - seit);
      } else {
        this.busHeute = false;                          // Zeitfenster vorbei: morgen kommt ein neuer Bus
        if (bis > 0 && bis <= WARNUNG_MIN && !this.ankGemeldet) {
          this.ankGemeldet = true;
          this.raum.broadcast('meldung', { text: `🚌 Der Evakuierungsbus kommt um ${hhmm(A)} zum Ortsausgang!`, lang: true });
        } else if (bis > WARNUNG_MIN) this.ankGemeldet = false;
      }
      return;
    }
    const zr = this.raum.zeitraffer?.() ?? 1;
    this.busRest -= dt * zr * 1440 / ((this.raum.einstellungen?.().tagMinuten || 48) * 60);
    const alleDa = this.mitfahrer();
    if (alleDa || this.busRest <= 0) this.abfahrt();
  }

  // Bus erscheint am Ortsausgang (auf der nächsten Straße, sonst dahinter im Ort) und wartet
  ankunft(rest) {
    const s = this.raum.state, w = this.raum.welt, tor = w.tor, v = this.raum.verkehr;
    if (!v) return;
    const { stunde, wartezeit } = this.einst();
    const tx = (tor.x + 1) * KACHEL, ty = (tor.y + 1) * KACHEL;
    const links = tor.x === 0;
    let x = links ? tx + 4 * KACHEL : tx, y = links ? ty : ty + 4 * KACHEL;
    const k = v.graph?.knoten?.length ? [...v.graph.knoten].sort((a, b) => Math.hypot(a.x - tx, a.y - ty) - Math.hypot(b.x - tx, b.y - ty))[0] : null;
    if (k && Math.hypot(k.x - tx, k.y - ty) < 400) { x = k.x; y = k.y; }
    this.busId = v.evakuierungBus(x, y, links ? Math.PI : -Math.PI / 2);
    this.busHeute = true; this.busRest = rest; s.busDa = true; s.busAb = (stunde * 60 + wartezeit) % 1440;
    this.raum.broadcast('meldung', { text: `🚌 Der Evakuierungsbus steht am Ortsausgang! Abfahrt um ${hhmm(s.busAb)}`, lang: true });
  }

  busWeg() {
    const s = this.raum.state;
    s.busDa = false; s.busBord = 0; s.busGesamt = 0;
    if (this.busId) { this.raum.verkehr?.evakuierungAb(this.busId); this.busId = null; }
  }

  // wer in Busnähe steht, ist an Bord; true, wenn alle echten (verbundenen, lebenden) Spieler an Bord sind
  mitfahrer() {
    const s = this.raum.state, f = s.fahrzeuge.get(this.busId);
    if (!f) { this.busWeg(); return false; }
    let bord = 0, gesamt = 0, echt = 0, echtDa = 0;
    for (const [sid, p] of s.spieler) {
      if (p.zombie > 0) continue;
      const bot = !!this.raum.extra.get(sid)?.bot;
      const an = !p.ebene && !p.unten && Math.hypot(p.x - f.x, p.y - f.y) < BUS_ABSTAND;
      gesamt++; if (an) bord++;
      if (!bot && p.verbunden !== false) { echt++; if (an) echtDa++; }
    }
    s.busBord = bord; s.busGesamt = gesamt; this.echteDa = echtDa;
    return echt > 0 && echtDa === echt;
  }

  abfahrt() {
    const s = this.raum.state;
    const pflichtOk = [...s.aufgaben.values()].every(a => !a.pflicht || a.erledigt);
    const geschafft = pflichtOk && this.erledigtZahl() >= this.noetig() && this.echteDa >= 1;
    const nichtDa = s.busGesamt > s.busBord;
    this.busWeg();
    this.busHeute = true;
    if (!geschafft) {
      this.raum.broadcast('meldung', { text: '🚌 Der Bus ist ohne euch abgefahren – morgen gibt es einen neuen', lang: true });
      return;
    }
    const karte = this.naechsteKarte();
    this.raum.xpAlle?.('evakuierung');
    this.raum.broadcast('meldung', { text: `🎉 Geschafft! Weiter nach Level ${s.level + 1} – ${KARTEN_NAMEN[karte] ?? karte}`, lang: true });
    if (nichtDa) this.raum.broadcast('meldung', { text: '🚌 Wer nicht an Bord war, kommt trotzdem mit – ihr seid eine Gruppe' });
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
    r.weltNeuStarten(false, {
      version: WELT_VERSION, karte, seed: Math.floor(Math.random() * 2 ** 31), zeit: 0, uhr: 8 * 60,
      besiegt: s.besiegt, level: s.level + 1, chat: [...r.chatVerlauf],
    });
  }
}

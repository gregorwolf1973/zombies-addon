// Fahrbare Kampffahrzeuge (Boxer, Puma, Leopard): gemeinsame Logik. Bis zu vier Spieler steigen mit der Aktionstaste ein, der erste fährt
// (Eingabe wie beim Gehen), der Turm schießt von selbst, die Insassen sind unsichtbar und vor Zombies sicher, das Fahrzeug hat keine Lebenspunkte.
// Server ist maßgeblich (Fahren, Kollision, Schießen); der Client zeichnet nur (client/fahrbardarstellung.mjs, client/boxerdarstellung.mjs).
// Es können mehrere Fahrzeuge verschiedener Art gleichzeitig stehen: der Boxer am Flugfeld (server/boxer.mjs, mit Horde) und beliebig viele
// Superuser-/Schießstand-Fahrzeuge (`Fahrbare`, ohne Horde). Die Spielerfelder anBord/imBoxer gelten für alle Arten („sitzt in einem Fahrzeug“).
import { frei, kmhZuPx, sichtfrei, WERTE as W } from '../client/welt.mjs';
import { FAHRBAR, FAHRBAR_EINSTIEG, FAHRBAR_PLAETZE, fahrbarNah } from '../client/fahrbar.mjs';
import { Fahrzeug } from './verkehr.mjs';
import { Leopard, leopardEinst, turmDrehen, winkelDiff } from './leopard.mjs';
import { ueberrolleZombies, UEBERROLLEN_PAUSE } from './ueberrollen.mjs';
import { stammBei, rueckwaerts, RUECK_ANTEIL } from '../client/walze.mjs';
import { strassenRichtung } from './spurhilfe.mjs';

export const PX = 8;                             // Pixel je Meter
export { FAHRBAR_PLAETZE };
// Fahrwerk (je Art überschreibbar); Höchsttempo kommt aus der Einstellung bundeswehr.<art>Tempo (km/h)
export const FAHRWERK = {
  tempoKmh: 60,                                  // Vorgabe, wenn die Einstellung fehlt
  beschleunigung: 7 * PX,                        // px/s² (60 km/h in ~2,4 s)
  bremse: 14 * PX,                               // px/s² (ohne Eingabe)
  drehrate: 1.3,                                 // rad/s bei Fahrt
  drehrateStand: 0.6,                            // rad/s im Stand
  rueckwaerts: RUECK_ANTEIL,                     // Rückwärtsgang: Anteil des Höchsttempos (1/3, client/walze.mjs)
  schrittPx: 2,                                  // Teilschritt der Kollisionsprüfung (px): bei 60 km/h (133 px/s) nie durch Zäune/Wände
};
export const ART = {
  boxer: { tempoEinst: 'boxerTempo', fahrwerk: FAHRWERK },
  puma: { tempoEinst: 'pumaTempo', fahrwerk: { ...FAHRWERK, drehrate: 1.4 } },
  leopard: { tempoEinst: 'leopardTempo', fahrwerk: { ...FAHRWERK, drehrate: 1.1 } },
};
// Einstellungen, die der Rest braucht, falls die Verwaltung sie nicht kennt
export const EINST_BASIS = { boxerSchussPause: 0.25, boxerReichweite: 40, boxerTempo: 60, pumaTempo: 60, leopardTempo: 60, pumaPause: 2.5, leopardUeberrollen: true, panzerLenkWeich: 0.6, panzerLenkTempo: 50 };

const KOLL_R = 5;
const punkteVon = art => {
  const m = FAHRBAR[art], p = [];
  for (const u of [-1, -0.5, 0, 0.5, 1]) for (const v of [-1, 0, 1]) p.push([u * m.laenge / 2, v * m.breite / 2]);
  return p;
};
const PUNKTE = Object.fromEntries(Object.keys(FAHRBAR).map(a => [a, punkteVon(a)]));

// Wanne der Art an Pose (x, y, w) frei? (Welt `welt`, Punkte mit KOLL_R Spielraum)
export function fahrbarFrei(welt, art, x, y, w) {
  const c = Math.cos(w), s = Math.sin(w);
  for (const [u, v] of PUNKTE[art]) {
    const px = x + c * u - s * v, py = y + s * u + c * v;
    if (!frei(welt, px, py, KOLL_R) || stammBei(welt, px, py, 1)) return false;   // Wände, Zäune, Baumstämme (der Leopard walzt kleine Bäume vorher um, server/walze.mjs)
  }
  return true;
}

const norm = w => Math.atan2(Math.sin(w), Math.cos(w));
const GRAD = Math.PI / 180;
const LENK_AUFBAU = 0.3;   // s: so schnell baut sich der Lenkeinschlag auf bzw. ab
// Lenkvorgaben (Backend: auto.lenkWeich/lenkTempo/lenkTotzone/spurhilfe, Panzer bundeswehr.panzerLenkWeich/panzerLenkTempo)
export const LENK_VORGABE = { lenkWeich: 0.5, lenkTempo: 40, lenkTotzone: 3, spurhilfe: true };
export const LENK_PANZER = { lenkWeich: 0.6, lenkTempo: 50 };
// Lenkwerte aus Einstellungen: weich (s, Abweichung/weich = Drehrate), tempo (Anteil der Lenkrate bei Höchsttempo), totzone (rad), spurhilfe
export function lenkWerte(weich, tempo, totzone, spurhilfe, vorgabe = LENK_VORGABE) {
  const zahl = (v, d, lo, hi) => { const n = Number(v); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d; };
  return {
    weich: zahl(weich, vorgabe.lenkWeich, 0.05, 5),
    tempo: zahl(tempo, vorgabe.lenkTempo, 5, 100) / 100,
    totzone: zahl(totzone, LENK_VORGABE.lenkTotzone, 0, 30) * GRAD,
    spurhilfe: spurhilfe !== false,
  };
}
const SPUR_AB = 0.15;               // Spurhilfe erst ab 15 % des Höchsttempos (vorwärts)
const SPUR_WINKEL = 20 * GRAD;      // Fangbereich: Fahrzeug und Wunschrichtung weniger als 20° von der Straßenrichtung
const SPUR_STAERKE = 0.9;           // so stark zieht die Wunschrichtung in der Mitte des Fangbereichs zur Straße
const GLEIT_WINKEL = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65].map(g => g * GRAD);   // Bewegung so weit gedreht zum Gleiten versuchen; > 65° = frontal (< 25° zur Normalen)
const GLEIT_SONST = 120 * GRAD;     // Seite ohne freie Gleitrichtung bis 65°: so gerechnet
const GLEIT_FRONTAL = 25 * GRAD;    // Kante weniger als 25° schräg zur Bewegung = frontal: stehen bleiben
const ECKE = [1.5, 3, 4.5];         // px seitlicher Versatz, um eine Ecke/einen Pfahl am Rand zu umrunden
const ECKE_VOR = 6;                 // px: nach dem Versatz muss der Weg so weit voraus frei sein
const ECKE_DEV = 45 * GRAD;         // so zählt das Umrunden beim Tempoverlust höchstens
const GLEIT_DREHEN = 0.5;           // rad/s: beim Gleiten richtet sich das Fahrzeug leicht an der Kante aus
const FREIDREHEN = [[0, 2], [0, -2], [-2, 0], [2, 0], [-1.5, 1.5], [-1.5, -1.5], [1.5, 1.5], [1.5, -1.5]];   // Versatz (längs, quer) px beim Freidrehen

export class Fahrbar {
  // opt: { id, besitzer (Sitzungs-ID des Superusers/Spielers, der es gesetzt hat) }
  constructor(raum, art, opt = {}) {
    this.raum = raum; this.art = art; this.m = FAHRBAR[art];
    this.vorgabeId = opt.id ?? `fz_${art}`; this.besitzer = opt.besitzer ?? null;
    this.id = null; this.f = null;
    this.insassen = [];         // Sitzungs-IDs, der erste fährt
    this.v = 0;                 // Fahrgeschwindigkeit px/s (negativ = rückwärts)
    this.kuehl = 0; this.ueberT = 0;
    this.von = { name: this.m.name, x: 0, y: 0, besiegt: 0 };
    this.letzteEingabe = { dx: 0, dy: 0 };
    this.drehBlock = false;
  }

  get fahrwerkBasis() { return ART[this.art].fahrwerk; }
  fahrwerk() {
    const b = this.fahrwerkBasis, kmh = Number(this.einst()[ART[this.art].tempoEinst]);
    return { ...b, vmax: kmhZuPx(Number.isFinite(kmh) && kmh > 0 ? kmh : b.tempoKmh) };
  }
  einst() { return { ...EINST_BASIS, ...(this.raum.einstellungen?.()?.bundeswehr ?? {}) }; }
  frei(welt, x, y, w) { return fahrbarFrei(welt, this.art, x, y, w); }
  // Schützen dieses Fahrzeugs (Objekte, die raum.schaden als „von“ bekommt)
  get schuetzen() { return [this.von]; }

  aufstellen(x, y, w = 0) {
    const s = this.raum.state;
    if (this.id) s.fahrzeuge.delete(this.id);
    const f = new Fahrzeug();
    f.x = x; f.y = y; f.richtung = w; f.art = this.art; f.farbe = 0; f.haelt = true; f.rauch = false; f.turm = w;
    this.id = this.vorgabeId; this.f = f; this.v = 0; this.insassen = [];
    s.fahrzeuge.set(this.id, f);
    return f;
  }

  // Fahrzeug abbauen: alle Insassen steigen aus, das Fahrzeug verschwindet
  abbauen() {
    for (const sid of [...this.insassen]) this.aussteigen(sid);
    if (this.id) this.raum.state.fahrzeuge.delete(this.id);
    this.id = null; this.f = null;
  }

  spieler(sid) { return this.raum.state.spieler.get(sid); }
  istBot(sid) { return !!this.raum.extra.get(sid)?.bot; }
  sitzt(sid) { return this.insassen.includes(sid); }
  get fahrer() { return this.insassen[0] ?? null; }

  nahGenug(p) { return !!this.f && fahrbarNah(this.art, this.f, p.x, p.y); }

  kannEinsteigen(sid) {
    const p = this.spieler(sid), x = this.raum.extra.get(sid);
    if (!this.f || !p || !x || x.bot || p.anBord || p.imBoxer || p.unten || p.zombie > 0 || p.ebene || p.kamera || p.verbunden === false) return false;
    if (this.raum.state.phase !== 'spiel' || this.insassen.length >= FAHRBAR_PLAETZE) return false;
    return this.nahGenug(p);
  }

  einsteigen(sid) {
    if (!this.kannEinsteigen(sid)) return false;
    const p = this.spieler(sid), n = this.m.name;
    this.insassen.push(sid);
    p.anBord = true; p.imBoxer = true; p.x = this.f.x; p.y = this.f.y;
    this.eingestiegen(sid);
    this.sendeAn(sid, this.fahrer === sid ? `🛡️ Du fährst den ${n} (Gehen-Taste lenkt, E steigt aus). Der Turm schießt von selbst.` : `🛡️ Du sitzt im ${n} – ${this.spieler(this.fahrer)?.name ?? 'jemand'} fährt.`);
    return true;
  }
  eingestiegen() {}   // Haken für Unterklassen (Boxer: Hordenuhr)

  // Aussteigen (Aktionstaste/Knopf) – auch während der Fahrt; ohne Fahrer bremst das Fahrzeug bis zum Stand
  aussteigen(sid) {
    if (!this.sitzt(sid)) return false;
    const p = this.spieler(sid);
    this.insassen = this.insassen.filter(i => i !== sid);
    if (!p) return true;
    const q = this.platzNeben();
    p.x = q.x; p.y = q.y; p.anBord = false; p.imBoxer = false; p.ebene = '';
    const x = this.raum.extra.get(sid); if (x) x.schonT = 3;   // 3 s lang beißen Zombies nicht
    if (this.fahrer && !this.istBot(this.fahrer)) this.sendeAn(this.fahrer, `🛡️ Du fährst jetzt den ${this.m.name}.`);
    return true;
  }

  // freier Platz neben der Wanne (rechts, dann links, dann ringsum)
  platzNeben() {
    const f = this.f, welt = this.raum.welt, r = this.m.breite / 2 + 16;
    const versuche = [];
    for (const seite of [1, -1]) for (const u of [0, 14, -14, 28, -28]) versuche.push([u, seite * r]);
    for (const [u, v] of versuche) {
      const x = f.x + Math.cos(f.richtung) * u - Math.sin(f.richtung) * v, y = f.y + Math.sin(f.richtung) * u + Math.cos(f.richtung) * v;
      if (frei(welt, x, y, 10)) return { x, y };
    }
    for (let rad = 20; rad <= 200; rad += 20) for (let k = 0; k < 10; k++) {
      const a = k * Math.PI / 5, x = f.x + Math.cos(a) * (r + rad), y = f.y + Math.sin(a) * (r + rad);
      if (frei(welt, x, y, 10)) return { x, y };
    }
    return { x: f.x, y: f.y + r };
  }

  sendeAn(sid, text) { this.raum.clients?.find(c => c.sessionId === sid)?.send('meldung', { text, lang: true }); }

  // Eingabe des Fahrers (raum.spielerSchritt): { dx, dy } wie beim Gehen
  fahrerEingabe(sid, e) { if (sid === this.fahrer) this.letzteEingabe = { dx: Number(e?.dx) || 0, dy: Number(e?.dy) || 0 }; }

  // ein Takt: Insassen prüfen, fahren, überrollen, schießen
  schritt(dt) {
    const f = this.f; if (!f) return;
    const r = this.raum, s = r.state;
    // Insassen, die verschwunden sind (Verbindung weg, Superuser-Sprung, Zombie, am Boden), werden herausgenommen
    for (const sid of [...this.insassen]) {
      const p = s.spieler.get(sid);
      if (!p) { this.insassen = this.insassen.filter(i => i !== sid); continue; }
      if (!p.anBord || !p.imBoxer) { this.insassen = this.insassen.filter(i => i !== sid); p.imBoxer = false; continue; }
      if (p.verbunden === false || p.zombie > 0 || p.unten || p.kamera) { this.aussteigen(sid); }
    }
    const fahrer = this.fahrer;
    const e = fahrer && this.letzteEingabe ? this.letzteEingabe : { dx: 0, dy: 0 };
    if (!fahrer) this.letzteEingabe = { dx: 0, dy: 0 };
    this.ueberAuto = r.walze?.autoFaktor(this) ?? 1;   // Puma/Boxer über geparkten Autos langsamer (server/walze.mjs)
    this.fahren(e, dt);
    for (const sid of this.insassen) { const p = s.spieler.get(sid); if (p) { p.x = f.x; p.y = f.y; p.richtung = f.richtung; } }
    f.haelt = Math.abs(this.v) < 1;
    // Zombies im Fußabdruck überrollen
    this.ueberT -= dt;
    if (this.ueberT <= 0 && Math.abs(this.v) > 6) {
      this.ueberT = UEBERROLLEN_PAUSE;
      ueberrolleZombies(r, f, this.m.laenge / 2, this.m.breite / 2, this.von);
    }
    // Motorlärm lockt Zombies (alle 1,5 s; wie bei den Autos, server/pkw.mjs: mindestens so weit wie ein rennender Spieler, je schneller desto weiter)
    this.laermUhr = (this.laermUhr ?? 0) - dt;
    if (this.laermUhr <= 0 && Math.abs(this.v) > 10) { this.laermUhr = 1.5; r.laerm(f.x, f.y, Math.max(W.hoerweiteRennen ?? 110, 160 + Math.abs(this.v)), true, ''); }
    this.schiessen(dt);
    this.hordeSchritt?.(dt);
  }

  // Lenkwerte: weich (Sekunden bis zur Wunschrichtung), Lenkrate bei Höchsttempo (Anteil), Totzone (rad), Spurhilfe an/aus.
  // Panzer: bundeswehr.panzerLenkWeich/panzerLenkTempo; Totzone und Spurhilfe gelten für alle Fahrzeuge (auto.lenkTotzone/auto.spurhilfe).
  lenkEinst() {
    const bw = this.einst(), au = { ...LENK_VORGABE, ...(this.raum.einstellungen?.()?.auto ?? {}) };
    return lenkWerte(bw.panzerLenkWeich, bw.panzerLenkTempo, au.lenkTotzone, au.spurhilfe, LENK_PANZER);
  }

  // Lenken wie bei der Figur: Eingabe {dx, dy} gibt die Wunschrichtung; das Fahrzeug dreht weich dorthin und fährt vorwärts.
  // Weich: Drehrate = Abweichung / Weichheit (kleine Stickbewegung = kleiner Einschlag), höchstens die Lenkrate, Einschlag baut sich in
  // LENK_AUFBAU auf; die Lenkrate fällt ab 30 % Tempo bis zum Höchsttempo auf lenkTempo (Vorgabe Autos 40 %); Abweichungen unter der
  // Totzone gelten als geradeaus. Spurhilfe: fährt man ungefähr in Straßenrichtung (< 20°), zieht die Wunschrichtung sanft zur Straße.
  // Liegt die Wunschrichtung mehr als ~135° hinter der Achse (Skalarprodukt, client/walze.mjs rueckwaerts), fährt es rückwärts (höchstens 1/3 Tempo)
  // und lenkt wie im Rückwärtsgang: das Heck dreht zur Wunschrichtung. Zäune/Hecken/Bäume/Autos unter der Wanne: server/walze.mjs (raum.walze).
  // Hindernis: schräg (> 25° zur Normalen) gleitet das Fahrzeug an der Kante entlang und verliert Tempo nach dem Winkel, frontal bleibt es stehen.
  fahren(e, dt) {
    const f = this.f, welt = this.raum.welt, fw = this.fahrwerk(), VM = fw.vmax * (this.ueberAuto ?? 1), le = this.lenkEinst();
    const roh = Math.hypot(e.dx, e.dy), len = Math.min(1, roh);
    let soll = 0;
    this.rueck = false; this.spur = false;
    if (len > 0.1) {
      const hx = Math.cos(f.richtung), hy = Math.sin(f.richtung), ux = e.dx / roh, uy = e.dy / roh;
      const rueck = this.rueck = rueckwaerts(hx * ux + hy * uy, this.v);
      let ziel = rueck ? Math.atan2(-uy, -ux) : Math.atan2(uy, ux), tz = le.totzone;
      if (le.spurhilfe && !rueck && this.v > fw.vmax * SPUR_AB) { ziel = this.spurZiel(welt, ziel, tz); if (this.spur) tz = 0; }
      const d = winkelDiff(f.richtung, ziel), c = Math.cos(d);
      const vAnteil = Math.min(1, Math.abs(this.v) / fw.vmax);
      let rate = fw.drehrateStand + (fw.drehrate - fw.drehrateStand) * Math.min(1, Math.abs(this.v) / (VM * 0.3));
      rate *= 1 - (1 - le.tempo) * Math.max(0, Math.min(1, (vAnteil - 0.3) / 0.7));   // bei hohem Tempo weicher lenken
      const dw = Math.sign(d) * Math.max(0, Math.abs(d) - tz);                           // kleine Abweichungen um die Fahrtrichtung: geradeaus
      const zielRate = Math.max(-rate, Math.min(rate, dw / le.weich));
      this.lenkW = (this.lenkW ?? 0) + (zielRate - (this.lenkW ?? 0)) * Math.min(1, dt / LENK_AUFBAU);
      const schritt = Math.abs(this.lenkW * dt) > Math.abs(d) ? d : this.lenkW * dt;
      this.drehBlock = false;
      if (Math.abs(schritt) > 1e-6 && !this.drehen(welt, f.richtung + schritt)) this.drehBlock = true;
      if (rueck) soll = c > 0 ? -VM * fw.rueckwaerts * len * c * c : 0;
      else {
        soll = c > 0 ? VM * len * c * c : 0;   // quer zur Wunschrichtung: langsam
        if (this.drehBlock && c < 0.2) soll = -VM * fw.rueckwaerts * len;   // festgefahren: rückwärts freisetzen
      }
    }
    if (len <= 0.1) this.lenkW = 0;
    // Beschleunigen / Bremsen
    if (soll > this.v) this.v = Math.min(soll, this.v + (this.v < 0 ? fw.bremse : fw.beschleunigung) * dt);
    else this.v = Math.max(soll, this.v - (this.v > 0 ? fw.bremse : fw.beschleunigung) * dt);
    if (Math.abs(this.v) < 0.5 && soll === 0) this.v = 0;
    this.v = Math.max(-VM * fw.rueckwaerts, Math.min(VM, this.v));   // über einem geparkten Auto sofort langsam (Puma 40 %, Boxer 30 %)
    this.vorruecken(welt, fw, VM, dt);
  }

  // Spurhilfe: Wunschrichtung `ziel` sanft zur Straßenrichtung ziehen, wenn Fahrzeug und Wunsch ungefähr in Straßenrichtung zeigen
  // (die Totzone tz gilt dann für den Stick gegenüber der Straße: kleine Abweichungen = genau die Straße entlang)
  spurZiel(welt, ziel, tz = 0) {
    const f = this.f, sr = strassenRichtung(welt, f.x, f.y);
    if (sr === null) return ziel;
    const rw = Math.cos(f.richtung - sr) >= 0 ? sr : sr + Math.PI;
    const dz = winkelDiff(rw, ziel), df = winkelDiff(rw, f.richtung);
    if (Math.abs(dz) >= SPUR_WINKEL || Math.abs(df) >= SPUR_WINKEL) return ziel;
    this.spur = true;
    const q = Math.abs(dz) / SPUR_WINKEL, rest = Math.sign(dz) * Math.max(0, Math.abs(dz) - tz);
    return rw + rest * (1 - SPUR_STAERKE * (1 - q * q));   // Mitte: stark zur Straße, zum Rand des Fangbereichs hin ausklingend
  }

  // auf Winkel w drehen; stößt die Wanne dabei an, darf sie sich leicht freidrehen (bis 2 px vom Hindernis weg). true = gedreht
  drehen(welt, w) {
    const f = this.f;
    this.raum.walze?.walzen(this, f.x, f.y, w);
    if (this.frei(welt, f.x, f.y, w)) { f.richtung = w; return true; }
    const c = Math.cos(f.richtung), s = Math.sin(f.richtung);
    for (const [u, v] of FREIDREHEN) {
      const x = f.x + c * u - s * v, y = f.y + s * u + c * v;
      if (this.frei(welt, x, y, w)) { f.x = x; f.y = y; f.richtung = w; return true; }
    }
    return false;
  }

  // Gleiten am Hindernis: { dev (Abweichung von der Bewegungsrichtung `basis`, für den Tempoverlust), x, y (neue Lage) } oder null = frontal/fest.
  // Je Seite die kleinste freie Abweichung a+ / a− (keine bis 65°: als 120° gerechnet); die Kante steht dann um (a− − a+)/2 schräg zur
  // Bewegung – unter 25° (frontal, Pfahl mittig) stehen. Ohne freie Richtung: Ecke umrunden (bis 4,5 px seitlich versetzt, nur auf einer Seite frei).
  gleiten(welt, basis, ds, letzte, seite) {
    const f = this.f, ux = Math.cos(basis), uy = Math.sin(basis);
    const lage = (dev, q = 0) => {
      const x = q ? f.x + ux * ds - uy * q : f.x + Math.cos(basis + dev) * ds, y = q ? f.y + uy * ds + ux * q : f.y + Math.sin(basis + dev) * ds;
      if (!this.frei(welt, x, y, f.richtung)) return null;
      return !q || this.frei(welt, x + ux * ECKE_VOR, y + uy * ECKE_VOR, f.richtung) ? { dev, x, y } : null;   // Ecke: dahinter muss der Weg frei sein (keine Wand)
    };
    if (letzte) { const l = lage(letzte); if (l) return l; }
    let ap = null, am = null;
    for (const a of GLEIT_WINKEL) {
      if (!ap) ap = lage(a * seite);
      if (!am) am = lage(-a * seite);
      if (ap && am) break;
    }
    if (ap || am) {
      if (Math.abs((am ? Math.abs(am.dev) : GLEIT_SONST) - (ap ? Math.abs(ap.dev) : GLEIT_SONST)) / 2 < GLEIT_FRONTAL) return null;
      return ap && (!am || Math.abs(ap.dev) <= Math.abs(am.dev)) ? ap : am;
    }
    for (const q of ECKE) {
      const p = lage(Math.min(Math.atan2(q, ds), ECKE_DEV) * seite, q * seite), m = lage(-Math.min(Math.atan2(q, ds), ECKE_DEV) * seite, -q * seite);
      if (p && m) return null;   // mittig getroffen
      if (p || m) return p ?? m;
    }
    return null;
  }

  // Vorrücken in kleinen Teilschritten. Hindernis: Gleitrichtung suchen (Bewegung um 5°…65° gedreht, bevorzugt zur Lenkseite);
  // gleiten = Tempo × cos(Winkel) beim Anstoß, danach höchstens Höchsttempo × cos²; keine Gleitrichtung (frontal, < 25° zur Normalen) = stehen.
  // this.anstoss = Aufprall-Tempo (px/s, für den Aufprallschaden der Autos): frontal das ganze Tempo, streifend Tempo × sin²(Winkel)
  vorruecken(welt, fw, VM, dt) {
    const f = this.f, weg = this.v * dt;
    this.anstoss = 0;
    if (!weg) { this.gleitet = false; return; }
    const n = Math.max(1, Math.ceil(Math.abs(weg) / fw.schrittPx)), ds = Math.abs(weg) / n, basis = f.richtung + (weg < 0 ? Math.PI : 0);
    const seite = (this.lenkW ?? 0) * (weg < 0 ? -1 : 1) < 0 ? -1 : 1;
    let devMax = 0, gestoppt = false, letzte = 0;
    for (let i = 0; i < n; i++) {
      const nx = f.x + Math.cos(basis) * ds, ny = f.y + Math.sin(basis) * ds;
      this.raum.walze?.walzen(this, nx, ny, f.richtung);
      if (this.frei(welt, nx, ny, f.richtung)) { f.x = nx; f.y = ny; continue; }
      const g = this.gleiten(welt, basis, ds, letzte, seite);
      if (!g) { gestoppt = true; break; }
      f.x = g.x; f.y = g.y;
      letzte = g.dev; devMax = Math.max(devMax, Math.abs(g.dev));
    }
    if (gestoppt) { this.anstoss = Math.abs(this.v); this.v = 0; this.gleitet = false; return; }
    if (!devMax) { this.gleitet = false; return; }
    const c = Math.cos(devMax), vz = Math.sign(this.v);
    if (!this.gleitet) { this.anstoss = Math.abs(this.v) * Math.sin(devMax) ** 2; this.v *= c; }   // streifend: Aufprallschaden nach sin² (gnädiger als der reine Queranteil)
    else this.v = vz * Math.min(Math.abs(this.v), VM * (vz < 0 ? fw.rueckwaerts : 1) * c * c);
    this.gleitet = true;
    // leicht zur Kante hin ausrichten (nicht weiter dagegen fahren)
    const w = f.richtung + Math.sign(letzte) * Math.min(Math.abs(letzte), GLEIT_DREHEN * dt);
    if (this.frei(welt, f.x, f.y, w)) f.richtung = w;
  }

  // Turmmitte (Drehpunkt) in der Welt; mit Winkel w: Punkt `vorn`/`rechts` im Turmrahmen
  turmPunkt(w = null, vorn = 0, rechts = 0) {
    const f = this.f, c = Math.cos(f.richtung), s = Math.sin(f.richtung);
    const px = f.x + c * this.m.turmX - s * this.m.turmY, py = f.y + s * this.m.turmX + c * this.m.turmY;
    if (w === null) return { x: px, y: py };
    const cw = Math.cos(w), sw = Math.sin(w);
    return { x: px + cw * vorn - sw * rechts, y: py + sw * vorn + cw * rechts };
  }

  // nächster lebender Zombie draußen innerhalb `reichweite` px um den Turm, als [id, z] oder null
  naechsterZombie(pv, reichweite) {
    let mz = null, bd = reichweite;
    for (const [id, z] of this.raum.state.zombies) {
      if (z.ebene || !(z.hp > 0)) continue;
      const d = Math.hypot(z.x - pv.x, z.y - pv.y);
      if (d < bd && sichtfrei(this.raum.welt, pv.x, pv.y, z.x, z.y)) { bd = d; mz = [id, z]; }   // nur mit freier Sichtlinie (keine Hauswand dazwischen)
    }
    return mz;
  }

  schiessen() {}   // Unterklassen
}

// ---------- Boxer-Turm: Dauerfeuer ----------
const BOXER_TURM_TEMPO = 2.5;                    // rad/s
const ZIEL_TOLERANZ = 10 * Math.PI / 180;
const BOXER_SCHADEN = 400;
export class FahrbarBoxer extends Fahrbar {
  constructor(raum, opt = {}) { super(raum, 'boxer', opt); }

  // Turm: nächster Zombie in Reichweite; Dauerfeuer, sobald der Turm höchstens 10° danebenliegt. Ohne Insassen: kein Feuer, Turm kehrt nach vorn zurück.
  schiessen(dt) {
    const f = this.f, r = this.raum, s = r.state, e = this.einst();
    this.kuehl -= dt;
    const pv = this.turmPunkt();
    const mz = this.insassen.length ? this.naechsterZombie(pv, e.boxerReichweite * PX) : null;
    const zielW = mz ? Math.atan2(mz[1].y - pv.y, mz[1].x - pv.x) : f.richtung;
    f.turm = norm(turmDrehen(f.turm, zielW, dt, BOXER_TURM_TEMPO));
    if (!mz || this.kuehl > 0) return;
    const [id, z] = mz;
    if (Math.abs(winkelDiff(f.turm, Math.atan2(z.y - pv.y, z.x - pv.x))) > ZIEL_TOLERANZ) return;
    this.kuehl = Math.max(0.05, e.boxerSchussPause);
    const m = this.turmPunkt(f.turm, this.m.muendung, 0);
    const w = Math.atan2(z.y - m.y, z.x - m.x), d = Math.hypot(z.x - m.x, z.y - m.y);
    r.broadcast('bwschuss', { art: 'mg', n: -1, x1: m.x, y1: m.y, x2: m.x + Math.cos(w) * d, y2: m.y + Math.sin(w) * d, w, t: 1, evak: 'boxer', tw: f.turm });
    const vorher = s.besiegt;
    this.von.x = m.x; this.von.y = m.y;
    r.schaden(id, z, Math.max(BOXER_SCHADEN, z.hp), this.von);
    s.besiegt = vorher;   // zählt nicht für die Aufgaben der Spieler (wie Leopard und Bundeswehr)
  }
}

// ---------- Puma: 30-mm-Maschinenkanone (Werte wie der Puma im Bundeswehr-Lager, server/stuetzpunkt.mjs) ----------
export const PUMA_WAFFE = { reichweite: 60, turmTempo: 2.4, tolerance: 0.06, schaden: 100, flaeche: 60, radius: 30, streu: 14 };
export class FahrbarPuma extends Fahrbar {
  constructor(raum, opt = {}) { super(raum, 'puma', opt); }

  schiessen(dt) {
    const f = this.f, r = this.raum, s = r.state, e = this.einst(), W = PUMA_WAFFE;
    this.kuehl -= dt;
    const pv = this.turmPunkt();
    const mz = this.insassen.length ? this.naechsterZombie(pv, W.reichweite * PX) : null;
    const zielW = mz ? Math.atan2(mz[1].y - pv.y, mz[1].x - pv.x) : f.richtung;
    f.turm = norm(turmDrehen(f.turm, zielW, dt, W.turmTempo));
    if (!mz || this.kuehl > 0) return;
    const [id, z] = mz;
    if (Math.abs(winkelDiff(f.turm, Math.atan2(z.y - pv.y, z.x - pv.x))) > W.tolerance) return;
    this.kuehl = Math.max(0.1, e.pumaPause);
    const m = this.turmPunkt(f.turm, this.m.muendung, 0);
    const ix = z.x + (r.rnd() - 0.5) * W.streu, iy = z.y + (r.rnd() - 0.5) * W.streu;   // meist genau das Ziel, manchmal etwas daneben
    r.broadcast('bwschuss', { art: 'kanone', n: -1, x1: m.x, y1: m.y, x2: ix, y2: iy, w: f.turm, t: 1, evak: 'puma', tw: f.turm });
    const vorher = s.besiegt;
    this.von.x = m.x; this.von.y = m.y;
    r.schaden(id, z, W.schaden, this.von);
    for (const [qid, q] of [...s.zombies]) {
      if (qid === id || q.ebene || !(q.hp > 0) || Math.hypot(q.x - ix, q.y - iy) > W.radius || !sichtfrei(r.welt, ix, iy, q.x, q.y)) continue;   // Wände schirmen den Flächenschaden ab
      r.schaden(qid, q, W.flaeche, this.von);
    }
    s.besiegt = vorher;   // zählt nicht für die Aufgaben der Spieler
  }
}

// ---------- Leopard 2A7: Lader-MG und Hauptkanone (server/leopard.mjs, inkl. Rauchkegel und Druckwelle) ----------
// Entscheidung: Die Kanone feuert automatisch wie der Boxer-Turm (Haufensuche, Sicherheitsradius um den Einschlag, Pause leopardKanonePause);
// ein eigener Feuerknopf würde auf dem Handy die Lenkung stören, und die Sicherheitsprüfung (nie auf Spieler/Menschen) bleibt so immer aktiv.
export class FahrbarLeopard extends Fahrbar {
  constructor(raum, opt = {}) { super(raum, 'leopard', opt); this.leopard = new Leopard(raum, 'Leopard'); }
  get schuetzen() { return [this.von, this.leopard.schuetze].filter(Boolean); }

  aufstellen(x, y, w = 0) { const f = super.aufstellen(x, y, w); this.leopard.fahrzeug = f; return f; }

  schiessen(dt) {
    const f = this.f, bw = this.einst();
    if (this.insassen.length) { this.leopard.schritt(f, dt, leopardEinst(bw, 0.8)); return; }
    f.turm = norm(turmDrehen(f.turm, f.richtung, dt));   // ohne Insassen: kein Feuer, Turm kehrt nach vorn zurück
    this.leopard.kz = null;
  }
}

export const KLASSEN = { boxer: FahrbarBoxer, puma: FahrbarPuma, leopard: FahrbarLeopard };

// ---------- Verwaltung mehrerer Fahrzeuge ----------
// Der Boxer am Flugfeld (raum.boxer) gehört nicht dazu, wird aber überall mitgezählt (`alle()`); hier leben die Fahrzeuge,
// die ein Superuser oder der Schießstand aufstellt (`liste`, je Besitzer höchstens eins).
export class Fahrbare {
  constructor(raum) { this.raum = raum; this.liste = []; this.zaehler = 0; }

  alle() { return [this.raum.boxer, ...this.liste].filter(b => b?.f); }
  von(sid) { return this.alle().find(b => b.sitzt(sid)) ?? null; }
  // Versuch, in ein Fahrzeug in Reichweite einzusteigen
  einsteigen(sid) { for (const b of this.alle()) if (b.einsteigen(sid)) return true; return false; }
  aussteigen(sid) { return this.von(sid)?.aussteigen(sid) ?? false; }
  fahrerEingabe(sid, e) { this.von(sid)?.fahrerEingabe(sid, e); }
  schritt(dt) {
    this.raum.boxer?.schritt(dt);
    // Fahrzeug, dessen Besitzer gegangen ist und das leer steht: verschwindet
    for (const b of [...this.liste]) if (!b.insassen.length && b.besitzer && !this.raum.state.spieler.has(b.besitzer)) this.entfernen(b.besitzer);
    for (const b of this.liste) b.schritt(dt);
  }
  schuetzen() { return this.alle().flatMap(b => b.schuetzen); }

  vonBesitzer(besitzer) { return this.liste.find(b => b.besitzer === besitzer) ?? null; }

  // Fahrzeug des Besitzers entfernen (Insassen steigen aus); true, wenn eins da war
  entfernen(besitzer) {
    const b = this.vonBesitzer(besitzer);
    if (!b) return false;
    b.abbauen();
    this.liste = this.liste.filter(q => q !== b);
    return true;
  }

  // freie Pose neben (px, py) in Blickrichtung w: Wanne daneben, Spieler steht an der Seite (zum Einsteigen in Reichweite)
  platzNeben(art, px, py, w) {
    const welt = this.raum.welt, m = FAHRBAR[art], versuche = [];
    const quer = m.breite / 2 + 12, vorn = m.laenge / 2 + 10;
    for (const seite of [1, -1]) for (const dw of [0, Math.PI]) for (const u of [0, 14, -14]) versuche.push([w + dw, u, seite * quer]);
    for (const seite of [1, -1]) for (const dw of [Math.PI / 2, -Math.PI / 2]) versuche.push([w + dw, 0, seite * quer]);
    for (const [fw, u, v] of versuche) {
      const c = Math.cos(w), s = Math.sin(w);
      const x = px + c * u - s * v, y = py + s * u + c * v;   // Mittelpunkt: neben dem Spieler (in dessen Blickrichtung versetzt)
      if (this.pose(art, x, y, fw)) return { x, y, w: fw };
    }
    // weiter weg: Ring um den Spieler (zu Fuß erreichbar)
    for (let rad = vorn; rad <= vorn + 120; rad += 16) for (let k = 0; k < 16; k++) {
      const a = w + k * Math.PI / 8, x = px + Math.cos(a) * rad, y = py + Math.sin(a) * rad;
      for (const fw of [w, a + Math.PI / 2]) if (this.pose(art, x, y, fw)) return { x, y, w: fw };
    }
    return null;
  }
  pose(art, x, y, w) {
    if (!fahrbarFrei(this.raum.welt, art, x, y, w)) return false;
    for (const b of this.alle()) if (Math.hypot(b.f.x - x, b.f.y - y) < ((b.m?.laenge ?? 36) + FAHRBAR[art].laenge) / 2 * 0.8) return false;   // nicht in ein anderes Fahrzeug (auch Autos, server/pkw.mjs)
    return true;
  }

  // Fahrzeug der Art für `besitzer` neben der Figur p aufstellen (ersetzt ein früheres desselben Besitzers); null = kein Platz
  setzen(besitzer, art, p) {
    const K = KLASSEN[art];
    if (!K) return null;
    this.entfernen(besitzer);
    const pos = this.platzNeben(art, p.x, p.y, Number.isFinite(p.richtung) ? p.richtung : 0);
    if (!pos) return null;
    const b = new K(this.raum, { id: `fz_${art}_${++this.zaehler}`, besitzer });
    b.aufstellen(pos.x, pos.y, pos.w);
    this.liste.push(b);
    return b;
  }
}

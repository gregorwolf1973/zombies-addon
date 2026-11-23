// Fahrzeuge gegen Helden (Spieler und Bots): Läuft ein Held gegen ein FAHRENDES Fahrzeug oder fährt es auf ihn, taumelt er zur Seite
// (Stoß quer zur Fahrtrichtung, Taumelzeit mit eingeschränkter Steuerung) und verliert Lebenspunkte nach Tempo – nie bis zum Tod.
// Blockieren/Klettern (Kreis gegen Rechteck) steht in client/fzkollision.mjs und gilt auch für die Client-Vorhersage.
// Einstellung (Verwaltung → Verkehr): fahrzeugStoss = größter Schaden in Lebenspunkten bei Höchsttempo (0 = kein Schaden, der Stoß bleibt).
// Quellen: state.fahrzeuge (Verkehr, Bus, Polizei, Panzer, fahrbare Fahrzeuge), die Streifen der B11-Szene und der Puma im Lager.
import { WERTE as W, bewege } from '../client/welt.mjs';
import { fzRechtecke, kreisImRechteck, STOSS_TAUMEL_FAKTOR } from '../client/fzkollision.mjs';

export const STOSS_TEMPO_MIN = 12;       // px/s (≈ 5 km/h): langsamer rollende Fahrzeuge blockieren nur
export const STOSS_TEMPO_VOLL = 110;     // px/s (≈ 50 km/h): ab hier voller Schaden
export const STOSS_SCHADEN_MIN = 0.33;   // Anteil des Höchstschadens bei kleinstem Tempo (5 von 15 HP)
export const STOSS_DAUER = 0.5;          // s: so lange gleitet der Held zur Seite
export const TAUMEL_DAUER = 0.7;         // s Taumeln (Steuerung eingeschränkt)
export const STOSS_PAUSE = 1.2;          // s bis zum nächsten möglichen Schaden
export const STOSS_VORGABE = 15;

export class Fahrzeugkontakt {
  constructor(raum) {
    this.raum = raum;
    this.alt = new Map();    // Fahrzeug-Schlüssel → letzte Position (Tempomessung)
    this.fz = { steht: [], faehrt: [] };
    this.zusatz = [];        // Fahrzeuge außerhalb von state.fahrzeuge (nur Stoß, kein Blockieren)
  }

  einst() { return this.raum.einstellungen?.() ?? {}; }

  // Tempo (px/s) aus dem Weg seit dem letzten Tick; Sprünge (Neuaufstellen) zählen nicht
  tempo(schluessel, x, y, dt) {
    const a = this.alt.get(schluessel);
    this.alt.set(schluessel, { x, y });
    if (!a || dt <= 0) return 0;
    const v = Math.hypot(x - a.x, y - a.y) / dt;
    return v > 450 ? 0 : v;
  }

  // je Tick: Listen aufbauen (steht/faehrt für Blockieren und Klettern), dann Stöße prüfen
  schritt(dt) {
    const r = this.raum, s = r.state;
    this.fz = fzRechtecke(s.fahrzeuge);
    const geschwindigkeit = new Map(), sehen = new Set();
    for (const [id, f] of s.fahrzeuge) { sehen.add('f' + id); geschwindigkeit.set(id, this.tempo('f' + id, f.x, f.y, dt)); }
    for (const q of this.fz.faehrt) q.v = geschwindigkeit.get(q.id) ?? 0;
    // B11-Streifen und Puma im Lager: nicht im Schema, daher nur Stoß
    this.zusatz = [];
    const sz = r.szeneB11;
    if (sz?.streifen?.length) sz.streifen.forEach((st, i) => {
      const k = st.k; if (!k || !st.def) return;
      sehen.add('s' + i);
      const v = this.tempo('s' + i, k.x, k.y, dt), w = k.richtung ?? 0;
      if (v >= STOSS_TEMPO_MIN) this.zusatz.push({ x: k.x, y: k.y, c: Math.cos(w), s: Math.sin(w), hl: st.def.hl, hb: st.def.hb, w, v });
    });
    const sp = r.stuetzpunkt;
    if (sp?.puma && Number.isFinite(s.bwX) && (s.bwX || s.bwY)) {
      sehen.add('puma');
      const v = this.tempo('puma', s.bwX, s.bwY, dt), w = s.bwW ?? 0;
      if (v >= STOSS_TEMPO_MIN) this.zusatz.push({ x: s.bwX, y: s.bwY, c: Math.cos(w), s: Math.sin(w), hl: 36, hb: 17, w, v });
    }
    if (this.alt.size > sehen.size + 20) for (const k of [...this.alt.keys()]) if (!sehen.has(k)) this.alt.delete(k);
    const quellen = [...this.fz.faehrt.filter(q => q.v >= STOSS_TEMPO_MIN), ...this.zusatz];
    if (!quellen.length) { for (const x of r.extra.values()) if (x.kontaktT > 0) x.kontaktT -= dt; return; }
    for (const [id, p] of s.spieler) {
      const x = r.extra.get(id);
      if (!x) continue;
      if (x.kontaktT > 0) x.kontaktT -= dt;
      if (p.unten) x.taumelT = 0;
      if (p.ebene || p.unten || p.anBord || p.imBoxer || p.kamera || p.zombie > 0 || !(p.hp > 0) || p.verbunden === false) continue;
      if (x.kontaktT > 0 || x.taumelT > 0) continue;
      const rad = W.spielerRadius + 2;
      for (const q of quellen) {
        if (Math.abs(p.x - q.x) > q.hl + rad + 4 || Math.abs(p.y - q.y) > q.hl + rad + 4) continue;
        if (kreisImRechteck(q, p.x, p.y, rad)) { this.stoss(id, p, x, q); break; }
      }
    }
  }

  // Stoß quer zur Fahrtrichtung, Schaden nach Tempo (nie tödlich), Taumeln; der Held bleibt am Leben
  stoss(id, p, x, q) {
    const r = this.raum, dx = p.x - q.x, dy = p.y - q.y;
    const quer = -dx * q.s + dy * q.c, seite = quer >= 0 ? 1 : -1;
    const weg = Math.max(6, q.hb + W.spielerRadius + 6 - Math.abs(quer)) + q.v * 0.04;   // bis sicher neben das Fahrzeug
    x.stoss = { vx: -q.s * seite * weg / STOSS_DAUER, vy: q.c * seite * weg / STOSS_DAUER, t: 0 };
    x.taumelT = TAUMEL_DAUER; x.kontaktT = STOSS_PAUSE;
    const max = Number(this.einst().fahrzeugStoss ?? STOSS_VORGABE);
    if (max > 0 && !r.unsterblich?.(p, x)) {
      const f = Math.max(STOSS_SCHADEN_MIN, Math.min(1, q.v / STOSS_TEMPO_VOLL));
      p.hp = Math.max(1, p.hp - Math.round(max * f));   // nie tödlich
    }
    p.aktion = ''; p.fortschritt = 0;
    r.broadcast('aufprall', { x: p.x, y: p.y, id: 'held', tot: false, w: q.w, ebene: '' });
    r.broadcast('taumel', { id, d: TAUMEL_DAUER });
  }

  // je Tick für einen Helden: Stoß-Bewegung anwenden; liefert den Faktor für die Eingabe (Taumeln = eingeschränkt)
  taumeln(p, x, dt) {
    if (!(x.taumelT > 0)) return 1;
    x.taumelT -= dt;
    const st = x.stoss;
    if (st) {
      const k = Math.max(0, 1 - st.t / STOSS_DAUER) * 2 * dt;   // linear abklingend: das Integral über die Stoßzeit ergibt den Stoßweg
      st.t += dt;
      if (st.t >= STOSS_DAUER) x.stoss = null;
      if (!p.ebene && k > 0) bewege(this.raum.wv(p.ebene), p, st.vx * k, st.vy * k, W.spielerRadius);
    }
    return STOSS_TAUMEL_FAKTOR;
  }
}

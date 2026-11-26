// Bundeswehr-Versorgung über die Munitionskisten (bw_kiste): Alle `versorgungTage` Spieltage legt die Bundeswehr für JEDEN Echtspieler
// ein Paket bereit (Munition, 1 Schusswaffe, Verbandszeug, Spritze). Bots bekommen nichts. Das Paket holt sich der Spieler beim
// nächsten Durchsuchen einer Munitionskiste (die Kisten waren schon immer je Spieler getrennt). Ist die Bundeswehr gefallen,
// kommt nichts Neues mehr (bereits bereitliegende Pakete bleiben abholbar). Der Stand (letzter Versorgungstag, offene Pakete
// je Spieler-ID) steht im Weltstand (`versorgung`), damit ein Neustart nichts doppelt oder gar nicht ausgibt.
import { M, L } from './texte.mjs';
export const VERSORGUNG_VORGABE = { versorgungTage: 2, versorgungMunition: 50, versorgungVerband: 3, versorgungSpritze: 1, versorgungWaffe: true,
  kistenMunChance: 50, kistenMunMin: 5, kistenMunMax: 15, kistenVerbandChance: 15, kistenGranateChance: 5 };   // kleine Zufallsbeute je Kiste, Spieler und Spieltag
// Nur gewöhnliche Feuerwaffen (kein MG, Scharfschützengewehr, Granatwerfer, keine MP): Die Versorgung kommt alle 2 Tage – stärkere Waffen
// sollen Fund und Lager-Belohnung bleiben, sonst wäre jeder Spieler nach wenigen Tagen überbewaffnet.
export const VERSORGUNG_WAFFEN = ['pistole', 'gewehr', 'schrotflinte'];
const MAX_OFFEN = 3;   // höchstens so viele ungeholte Pakete je Spieler (kein Horten über viele Tage)

export class Versorgung {
  constructor(raum) { this.raum = raum; this.letzterTag = null; this.offen = new Map(); this.beuteTag = new Map(); }

  einst() { return { ...VERSORGUNG_VORGABE, ...(this.raum.einstellungen?.()?.bundeswehr ?? {}) }; }
  gefallen() { return this.raum.state.stuetzpunkt === 'gefallen'; }

  start(stand, passt) {
    this.letzterTag = null; this.offen = new Map(); this.beuteTag = new Map();
    const v = passt ? stand?.versorgung : null;
    if (!v || typeof v !== 'object') return;
    if (Number.isFinite(v.tag)) this.letzterTag = Math.max(1, Math.floor(v.tag));
    for (const [k, t] of Object.entries(v.beute ?? {})) if (Number.isFinite(t)) this.beuteTag.set(k, Math.floor(t));
    for (const [id, n] of Object.entries(v.offen ?? {})) if (Number.isFinite(n) && n >= 0) this.offen.set(id, Math.min(MAX_OFFEN, Math.floor(n)));
  }

  speichern() { return { tag: this.letzterTag, offen: Object.fromEntries(this.offen), beute: Object.fromEntries(this.beuteTag) }; }

  // neuer Echtspieler: sofort ein Paket (sonst müsste er bis zu zwei Tage warten); bekannte Spieler behalten ihren Stand
  anmelden(spielerId) {
    if (!spielerId || this.offen.has(spielerId)) return;
    this.letzterTag ??= this.raum.state.tag || 1;
    this.offen.set(spielerId, this.gefallen() ? 0 : 1);
  }

  // Spieltag hat gewechselt (oder Zeitsprung): fällig?
  tagWechsel() {
    const tag = this.raum.state.tag || 1, e = this.einst();
    this.letzterTag ??= tag;
    const abstand = Math.max(1, Math.round(e.versorgungTage || 2));
    if (this.gefallen() || tag < this.letzterTag + abstand) return false;
    this.letzterTag = tag;
    let n = 0;
    for (const id of this.offen.keys()) { this.offen.set(id, Math.min(MAX_OFFEN, this.offen.get(id) + 1)); n++; }
    if (n) {
      this.raum.broadcast('meldung', M('vers.neu', null, L));
      this.raum.broadcast('versorgung', {});   // Clients blenden „für mich leere“ Kisten wieder ein
    }
    this.raum.speichereWelt?.();
    return true;
  }

  bereit(spielerId) { return (this.offen.get(spielerId) ?? 0) > 0; }

  // Inhalt eines Pakets (ohne Munition, die geht direkt in den Vorrat)
  inhalt() {
    const e = this.einst(), dinge = [];
    if (e.versorgungWaffe !== false) dinge.push(VERSORGUNG_WAFFEN[Math.floor(this.raum.rnd() * VERSORGUNG_WAFFEN.length)]);
    for (let i = 0; i < Math.max(0, Math.round(e.versorgungVerband ?? 3)); i++) dinge.push('verband');
    for (let i = 0; i < Math.max(0, Math.round(e.versorgungSpritze ?? 1)); i++) dinge.push('spritze');
    return dinge;
  }

  // ein Paket abholen: { munition, dinge } oder null
  abholen(spielerId) {
    if (!this.bereit(spielerId)) return null;
    this.offen.set(spielerId, this.offen.get(spielerId) - 1);
    this.raum.speichereWelt?.();
    return { munition: Math.max(0, Math.round(this.einst().versorgungMunition ?? 50)), dinge: this.inhalt() };
  }

  // Zufallsbeute einer Kiste für einen Spieler: höchstens einmal je Spieltag gewürfelt (Schlüssel Kiste@Spieler, gemerkt im Spielstand).
  // Gibt { munition, dinge } zurück (leer, wenn heute schon gewürfelt wurde oder nichts fiel).
  zufallsBeute(schluessel) {
    const tag = this.raum.state.tag || 1;
    if (this.beuteTag.get(schluessel) === tag) return { munition: 0, dinge: [] };
    this.beuteTag.set(schluessel, tag);
    const e = this.einst(), r = () => this.raum.rnd() * 100, aus = { munition: 0, dinge: [] };
    if (r() < (e.kistenMunChance ?? 50)) {
      const lo = Math.max(0, Math.round(e.kistenMunMin ?? 5)), hi = Math.max(lo, Math.round(e.kistenMunMax ?? 15));
      aus.munition = lo + Math.floor(this.raum.rnd() * (hi - lo + 1));
    }
    if (r() < (e.kistenVerbandChance ?? 15)) aus.dinge.push('verband');
    if (r() < (e.kistenGranateChance ?? 5)) aus.dinge.push('granate');
    this.raum.speichereWelt?.();
    return aus;
  }

  // Spieltag und ungefähre Uhrzeit der nächsten Lieferung (Beginn des Liefertags); null, wenn die Bundeswehr gefallen ist
  naechsteLieferung() {
    if (this.gefallen()) return null;
    const s = this.raum.state, e = this.einst();
    const tag = (this.letzterTag ?? s.tag ?? 1) + Math.max(1, Math.round(e.versorgungTage || 2));
    const tm = (this.raum.constructor.einstellungen?.tagMinuten || 48) * 60;
    const uhr = ((s.uhr ?? 0) + ((tag - 1) - (s.zeit ?? 0) / tm) * 1440) % 1440;
    const m = Math.round(((uhr % 1440) + 1440) % 1440 / 5) * 5 % 1440;   // auf 5 Minuten gerundet
    return { tag, uhr: m, text: `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}` };
  }

  // Meldung bei „für mich nichts drin“ ({ k, w })
  leerText() {
    const n = this.naechsteLieferung();
    if (!n) return M('vers.keine');
    return M('vers.leer', { tag: n.tag, zeit: n.text });
  }
}

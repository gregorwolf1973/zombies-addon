// Bundeswehr-Versorgung über die Munitionskisten (bw_kiste): Alle `versorgungTage` Spieltage legt die Bundeswehr für JEDEN Echtspieler
// ein Paket bereit (Munition, 1 Schusswaffe, Verbandszeug, Spritze). Bots bekommen nichts. Das Paket holt sich der Spieler beim
// nächsten Durchsuchen einer Munitionskiste (die Kisten waren schon immer je Spieler getrennt). Ist die Bundeswehr gefallen,
// kommt nichts Neues mehr (bereits bereitliegende Pakete bleiben abholbar). Der Stand (letzter Versorgungstag, offene Pakete
// je Spieler-ID) steht im Weltstand (`versorgung`), damit ein Neustart nichts doppelt oder gar nicht ausgibt.
export const VERSORGUNG_VORGABE = { versorgungTage: 2, versorgungMunition: 50, versorgungVerband: 3, versorgungSpritze: 1, versorgungWaffe: true };
// Nur gewöhnliche Feuerwaffen (kein MG, Scharfschützengewehr, Granatwerfer, keine MP): Die Versorgung kommt alle 2 Tage – stärkere Waffen
// sollen Fund und Lager-Belohnung bleiben, sonst wäre jeder Spieler nach wenigen Tagen überbewaffnet.
export const VERSORGUNG_WAFFEN = ['pistole', 'gewehr', 'schrotflinte'];
const MAX_OFFEN = 3;   // höchstens so viele ungeholte Pakete je Spieler (kein Horten über viele Tage)

export class Versorgung {
  constructor(raum) { this.raum = raum; this.letzterTag = null; this.offen = new Map(); }

  einst() { return { ...VERSORGUNG_VORGABE, ...(this.raum.einstellungen?.()?.bundeswehr ?? {}) }; }
  gefallen() { return this.raum.state.stuetzpunkt === 'gefallen'; }

  start(stand, passt) {
    this.letzterTag = null; this.offen = new Map();
    const v = passt ? stand?.versorgung : null;
    if (!v || typeof v !== 'object') return;
    if (Number.isFinite(v.tag)) this.letzterTag = Math.max(1, Math.floor(v.tag));
    for (const [id, n] of Object.entries(v.offen ?? {})) if (Number.isFinite(n) && n >= 0) this.offen.set(id, Math.min(MAX_OFFEN, Math.floor(n)));
  }

  speichern() { return { tag: this.letzterTag, offen: Object.fromEntries(this.offen) }; }

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
      this.raum.broadcast('meldung', { text: '🪖 Die Bundeswehr hat neue Versorgung in die Munitionskisten im Lager gelegt: Munition, Waffe, Verbandszeug, Spritze', lang: true });
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
}

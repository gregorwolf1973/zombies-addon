// Finale in Andermatt (Level 5, Evakuierungsart 'bunker'): ein Countdown (echte Zeit) bis zum Atomschlag.
// Das Bunkertor öffnet erst, wenn die Missionen erledigt sind (aufgaben.einsteigenOffen). Bei 0 entscheidet aufgaben.bunkerEnde():
// Sieg (mindestens ein echter Spieler im Bunker) → nach dem Abspann beginnt eine frische Runde in Level 1 (Geretsried);
// Niederlage (keiner drin) → nach dem Abspann Level 5 von vorn. Die Welt steht während des Abspanns still (state.phase 'finale').
// Der Countdown läuft nur, solange mindestens ein echter Spieler verbunden ist.

export const ABSPANN_SEKUNDEN = 20;
export const ANSAGEN = [600, 300, 60, 30];   // verbleibende Sekunden, bei denen eine Meldung kommt
const TOR_RADIUS = 90;                       // wie HELI_ABSTAND: so nah am Tor kommt der Hinweis „Tor verschlossen“
const HINWEIS_PAUSE = 20;                    // Sekunden zwischen zwei Hinweisen je Spieler

export const zeitText = sek => { const s = Math.max(0, Math.ceil(sek)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

export class Finale {
  constructor(raum) {
    this.raum = raum;
    this.rest = 0;            // Sekunden bis zum Atomschlag (0 = kein Finale oder schon vorbei)
    this.abspann = null;      // { rest, sieg } nach dem Schlag
    this.fertig = false;      // Neustart ist ausgelöst
    this.gemeldet = new Set();
    this.hinweisT = new Map();
  }

  einst() { return { finaleMinuten: 30, ...(this.raum.einstellungen?.()?.aufgaben ?? {}) }; }
  aktiv() { return this.rest > 0 && !this.abspann; }

  // beim Aufbau der Welt: Countdown starten, wenn dies die Bunkerkarte ist
  start() {
    const r = this.raum, s = r.state;
    this.abspann = null; this.fertig = false; this.gemeldet.clear(); this.hinweisT.clear();
    const a = r.aufgaben;
    this.rest = a?.an() && a.evakArt() === 'bunker' ? Math.max(10, Math.min(90, Math.round(Number(this.einst().finaleMinuten) || 30))) * 60 : 0;
    s.finaleRest = Math.ceil(this.rest);
  }

  // Testbefehl: Countdown neu setzen
  setzen(sek) {
    if (!this.aktiv()) return false;
    this.rest = Math.max(1, Math.min(5400, Number(sek) || 60));
    for (const t of ANSAGEN) if (t > this.rest) this.gemeldet.add(t); else this.gemeldet.delete(t);
    this.raum.state.finaleRest = Math.ceil(this.rest);
    return true;
  }

  echteSpieler() {
    const r = this.raum;
    return [...r.state.spieler].filter(([sid, p]) => !r.extra.get(sid)?.bot && p.verbunden !== false && !(p.zombie > 0));
  }

  // true = der Abspann läuft, die Welt steht still (raum.schritt hört auf)
  schritt(dt) {
    const r = this.raum, s = r.state;
    if (this.abspann) {
      if (this.fertig) return true;
      this.abspann.rest -= dt;
      if (this.abspann.rest <= 0) this.neustart(this.abspann.sieg);
      return true;
    }
    if (this.rest <= 0) return false;
    if (![...r.state.spieler].some(([sid, p]) => !r.extra.get(sid)?.bot && p.verbunden !== false)) return false;   // niemand da: Pause
    this.rest -= dt;
    this.torHinweis(dt);
    const sek = Math.max(0, Math.ceil(this.rest));
    if (s.finaleRest !== sek) s.finaleRest = sek;
    for (const t of ANSAGEN) {
      if (this.rest > t || this.gemeldet.has(t)) continue;
      this.gemeldet.add(t);
      r.broadcast('meldung', { text: `☢️ Atomschlag in ${t >= 60 ? (t === 60 ? '1 Minute' : `${t / 60} Minuten`) : `${t} Sekunden`} – ${r.aufgaben.fahrtGelingt() ? 'ab in den Bunker!' : 'erst die Missionen, dann das Bunkertor!'}`, lang: true });
    }
    if (this.rest <= 0) this.ende();
    return false;
  }

  // wer am verschlossenen Tor steht, erfährt, was noch fehlt
  torHinweis(dt) {
    const r = this.raum, a = r.aufgaben, s = r.state;
    for (const [sid, t] of this.hinweisT) this.hinweisT.set(sid, t - dt);
    if (a.einsteigenOffen() || !(s.evakX > 0)) return;
    for (const [sid, p] of this.echteSpieler()) {
      if (p.ebene || p.unten || p.anBord || Math.hypot(p.x - s.evakX, p.y - s.evakY) > TOR_RADIUS) continue;
      if ((this.hinweisT.get(sid) ?? 0) > 0) continue;
      this.hinweisT.set(sid, HINWEIS_PAUSE);
      a.sendeAn(sid, `☢️ Das Bunkertor ist verschlossen – es fehlt: ${a.fehlt().join(' · ') || 'noch etwas'}`);
    }
  }

  ende() {
    const r = this.raum, s = r.state;
    this.rest = 0; s.finaleRest = 0;
    const res = r.aufgaben.bunkerEnde();    // { drinnen, draussen, sieg }; sendet 'bunkerEnde' (Blitz) und die Einzelmeldungen
    r.aufgaben.wechselLaeuft = true;
    for (const sid of res.draussen) { const p = s.spieler.get(sid); if (p) { p.unten = true; p.hilfe = 0; p.aktion = ''; } }   // draußen: tot
    s.phase = 'finale';
    r.broadcast('meldung', res.sieg
      ? { text: '☢️ Geschafft – ihr habt im Bunker überlebt!', lang: true }
      : { text: '☢️ Game over – niemand hat den Bunker erreicht …', lang: true });
    this.abspann = { rest: ABSPANN_SEKUNDEN, sieg: res.sieg };
  }

  neustart(sieg) {
    this.fertig = true;
    const a = this.raum.aufgaben;
    // Sieg: frische Runde in Level 1 (wie „Welt neu starten“); Niederlage: Level 5 noch einmal mit neuer Welt
    a.levelWechsel(sieg ? { karte: 'geretsried', level: 1, frisch: true } : { karte: 'andermatt', level: 5 });
  }
}


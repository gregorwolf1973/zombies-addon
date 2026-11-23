// Diagnose von echten Geräten: Fehler und Kennzahlen der Spieler landen kompakt im Server-Log und in /data/diag.jsonl
// (Ringpuffer der letzten Einträge). Keine IP, kein Name – nur die kurze Sitzungs-Id der Verbindung.
import fs from 'node:fs';
import path from 'node:path';

export const DIAG_MAX_BYTES = 8 * 1024;       // Größe eines Berichts
export const DIAG_RATE = 10;                  // Berichte je Sitzung und Minute
export const DIAG_EINTRAEGE = 500;            // Ringpuffer
export const DIAG_DATEI_MAX = 400 * 1024;     // harte Grenze der Datei (Bytes)

const text = (v, n) => (typeof v === 'string' ? v : v == null ? '' : String(v)).replace(/[\r\n\t]+/g, ' ').slice(0, n);
const zahl = (v, min = 0, max = 1e9, stellen = 1) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  const f = 10 ** stellen;
  return Math.round(Math.min(max, Math.max(min, n)) * f) / f;
};

// Bericht des Clients → bereinigte Einträge ({ art: 'fehler'|'kpi'|'ton', ... }), höchstens ein paar Stück
export function bereinige(roh) {
  const aus = [];
  if (!roh || typeof roh !== 'object') return aus;
  for (const f of (Array.isArray(roh.fehler) ? roh.fehler : []).slice(0, 5)) {
    if (!f || typeof f !== 'object') continue;
    aus.push({ art: 'fehler', meldung: text(f.meldung, 200), quelle: text(f.quelle, 120), zeile: zahl(f.zeile, 0, 1e7, 0), stack: text(f.stack, 600), n: zahl(f.n, 1, 1e6, 0) ?? 1 });
  }
  const k = roh.kpi;
  if (k && typeof k === 'object') {
    aus.push({
      art: 'kpi', fps: zahl(k.fps, 0, 1000), ping: zahl(k.ping, 0, 1e5, 0), kbs: zahl(k.kbs, 0, 1e6),
      zoom: zahl(k.zoom, 0, 100, 2), bild: text(k.bild, 16), dev: text(k.dev, 60), karte: text(k.karte, 32),
      drinnen: k.drinnen === true || k.drinnen === 1, ton: text(k.ton, 20), stumm: zahl(k.stumm, 0, 1e6, 0), verdraengt: zahl(k.verdraengt, 0, 1e6, 0),
      zombies: zahl(k.zombies, 0, 1e5, 0), verz: zahl(k.verz, 0, 1e5, 0), offen: zahl(k.offen, 0, 1e4, 0), offenMax: zahl(k.offenMax, 0, 1e4, 0),
    });
  }
  for (const t of (Array.isArray(roh.ton) ? roh.ton : []).slice(0, 5)) {
    if (!t || typeof t !== 'object') continue;
    aus.push({ art: 'ton', was: text(t.was, 24), detail: text(t.detail, 120) });
  }
  return aus;
}

// eine kompakte Logzeile je Eintrag
export function logzeile(sitzung, e) {
  const kv = o => Object.entries(o).filter(([, v]) => v !== null && v !== '' && v !== undefined).map(([k, v]) => `${k}=${typeof v === 'boolean' ? (v ? 1 : 0) : v}`).join(' ');
  if (e.art === 'fehler') return `[diag] ${sitzung} fehler ${e.n > 1 ? `(${e.n}x) ` : ''}${e.meldung}${e.quelle ? ` @${e.quelle}${e.zeile ? ':' + e.zeile : ''}` : ''}${e.stack ? ' | ' + e.stack : ''}`;
  if (e.art === 'ton') return `[diag] ${sitzung} ton ${e.was}${e.detail ? ' ' + e.detail : ''}`;
  const { art, ...rest } = e;
  return `[diag] ${sitzung} kpi ${kv(rest)}`;
}

export class Diagnose {
  // an: () => bool (Einstellung), sitzungOk: id => bool (verbundener Spieler), datei: Pfad der Ringpuffer-Datei oder null
  constructor({ an = () => true, sitzungOk = () => true, datei = null, log = console.log, jetzt = Date.now } = {}) {
    Object.assign(this, { an, sitzungOk, datei, log, jetzt });
    this.fenster = new Map();   // sitzung → { start, n }
    this.zeilen = null;         // Ringpuffer im Speicher (geladen beim ersten Schreiben)
    this.seitSchreiben = 0;
  }
  // gibt { status } zurück: 204 angenommen (oder aus), 400 ungültig, 403 unbekannte Sitzung, 429 zu viele
  annehmen(body) {
    if (!this.an()) return { status: 204, ignoriert: true };
    const s = typeof body?.s === 'string' && /^[\w-]{3,40}$/.test(body.s) ? body.s : null;
    if (!s) return { status: 400 };
    if (!this.sitzungOk(s)) return { status: 403 };
    const t = this.jetzt();
    const f = this.fenster.get(s);
    if (!f || t - f.start >= 60000) this.fenster.set(s, { start: t, n: 1 });
    else if (++f.n > DIAG_RATE) return { status: 429 };
    if (this.fenster.size > 200) for (const [k, v] of this.fenster) if (t - v.start >= 60000) this.fenster.delete(k);
    const eintraege = bereinige(body);
    for (const e of eintraege) {
      this.log(logzeile(s, e));
      this.merken({ t: Math.round(t / 1000), s, ...e });
    }
    return { status: 204, n: eintraege.length };
  }
  merken(e) {
    if (!this.datei) return;
    try {
      if (!this.zeilen) {
        try { this.zeilen = fs.readFileSync(this.datei, 'utf8').split('\n').filter(Boolean).slice(-DIAG_EINTRAEGE); } catch { this.zeilen = []; }
      }
      this.zeilen.push(JSON.stringify(e));
      if (this.zeilen.length > DIAG_EINTRAEGE) this.zeilen.splice(0, this.zeilen.length - DIAG_EINTRAEGE);
      // Datei nur alle 5 Einträge neu schreiben (Ringpuffer überschreibt sich selbst), nie größer als DIAG_DATEI_MAX
      if (++this.seitSchreiben >= 5 || this.zeilen.length < 5) this.schreiben();
    } catch { /* Diagnose darf nie stören */ }
  }
  schreiben() {
    if (!this.datei || !this.zeilen) return;
    try {
      while (this.zeilen.length > 1 && this.zeilen.reduce((a, z) => a + z.length + 1, 0) > DIAG_DATEI_MAX) this.zeilen.shift();
      fs.mkdirSync(path.dirname(this.datei), { recursive: true });
      fs.writeFileSync(this.datei + '.neu', this.zeilen.join('\n') + '\n');
      fs.renameSync(this.datei + '.neu', this.datei);
      this.seitSchreiben = 0;
    } catch { /* egal */ }
  }
}

// Diagnose auf dem Gerät: sammelt Fehler und Kennzahlen und schickt sie gebündelt an POST diag (Server: server/diagnose.mjs).
// Reines Modul (ohne Browserzugriffe, alles wird übergeben) – pro Frame läuft nur bild() (ein Zähler).

export const FEHLER_PRO_MIN = 4;     // so viele Fehlerberichte je Minute (gleiche Meldungen werden gezählt statt wiederholt)
export const STACK_MAX = 600;
export const KPI_SEKUNDEN = 60;

// userAgent grob: "Plattform Browser/Version" (kein Gerätemodell, keine Feinheiten)
export function geraetTyp(ua = '') {
  ua = String(ua);
  const plattform = /iPhone|iPad|iPod/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac OS X|Macintosh/.test(ua) ? 'Mac' : /CrOS/.test(ua) ? 'ChromeOS' : /Linux/.test(ua) ? 'Linux' : '?';
  const treffer = [[/Edg\/([\d.]+)/, 'Edge'], [/OPR\/([\d.]+)/, 'Opera'], [/(?:Chrome|CriOS)\/([\d.]+)/, 'Chrome'], [/(?:Firefox|FxiOS)\/([\d.]+)/, 'Firefox'], [/Version\/([\d.]+).*Safari/, 'Safari']];
  let browser = '?';
  for (const [re, name] of treffer) { const m = re.exec(ua); if (m) { browser = name + '/' + m[1].split('.')[0]; break; } }
  return `${plattform} ${browser}`.slice(0, 60);
}

export function kuerzeStack(s, max = STACK_MAX) {
  return String(s ?? '').replace(/https?:\/\/[^/\s)]+\/(?:v\/[^/\s)]+\/)?/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
}

const dateiname = u => String(u ?? '').replace(/[?#].*$/, '').replace(/^.*\//, '');

export class Sammler {
  // senden(bericht): schickt das Objekt zum Server (Fehler dürfen nie geworfen werden); jetzt(): Millisekunden
  constructor({ senden, jetzt = () => Date.now(), geraet = '', kpiSekunden = KPI_SEKUNDEN, fehlerProMin = FEHLER_PRO_MIN } = {}) {
    Object.assign(this, { senden, jetzt, geraet, kpiSekunden, fehlerProMin });
    this.an = true;
    this.frames = 0; this.bytes = 0; this.gesamtFrames = 0; this.gesamtBytes = 0; this.seit = jetzt();   // gesamt* nur für die Anzeige (läuft nie zurück)
    this.fenster = { start: jetzt(), n: 0 };
    this.bekannt = new Map();      // Meldung → { n (unterdrückt) }
    this.wartend = { fehler: [], ton: [] };
    this.stumm = 0; this.verdraengt = 0;
    this.ping = null;
  }
  setzeAn(an) { this.an = !!an; }
  // pro Frame
  bild() { this.frames++; this.gesamtFrames++; }
  empfangen(n) { if (n > 0) { this.bytes += n; this.gesamtBytes += n; } }
  // Zurücksetzen des Minutenfensters (z. B. wenn der Tab im Hintergrund war)
  neuFenster() { this.frames = 0; this.bytes = 0; this.seit = this.jetzt(); }
  pingSetzen(ms) { if (Number.isFinite(ms)) this.ping = ms; }
  tonZaehler(stumm = 0, verdraengt = 0) { this.stumm += stumm; this.verdraengt += verdraengt; }

  fehler({ meldung, quelle, zeile, stack } = {}) {
    if (!this.an) return false;
    const t = this.jetzt();
    if (t - this.fenster.start >= 60000) { this.fenster = { start: t, n: 0 }; this.bekannt.clear(); }
    const schluessel = String(meldung ?? '').slice(0, 120) + '|' + dateiname(quelle) + ':' + zeile;
    const b = this.bekannt.get(schluessel);
    if (b) { b.n++; return false; }              // gleiche Meldung: nur zählen
    if (this.fenster.n >= this.fehlerProMin) return false;
    this.fenster.n++;
    this.bekannt.set(schluessel, { n: 0 });
    this.wartend.fehler.push({ meldung: String(meldung ?? '').slice(0, 200), quelle: dateiname(quelle), zeile: Number(zeile) || 0, stack: kuerzeStack(stack) });
    this.sofort();
    return true;
  }
  tonProblem(was, detail = '') {
    if (!this.an) return;
    if (this.wartend.ton.length < 5) this.wartend.ton.push({ was: String(was).slice(0, 24), detail: String(detail).slice(0, 120) });
    this.sofort();
  }
  // Fehler/Tonmeldungen gebündelt (mehrere im selben Tick = ein Bericht)
  sofort() {
    if (this.geplant) return;
    this.geplant = true;
    queueMicrotask(() => { this.geplant = false; this.abschicken({}); });
  }
  abschicken(zusatz) {
    const f = this.wartend.fehler.splice(0), ton = this.wartend.ton.splice(0);
    if (!f.length && !ton.length && !zusatz.kpi) return null;
    const bericht = { ...(f.length ? { fehler: f } : {}), ...(ton.length ? { ton } : {}), ...zusatz };
    try { this.senden(bericht); } catch { /* Diagnose darf nie stören */ }
    return bericht;
  }
  // Kennzahlen seit dem letzten Aufruf; ctx: { zoom, bild: '1280x720', karte, drinnen, ton, zombies }
  kpi(ctx = {}) {
    if (!this.an) return null;
    const t = this.jetzt(), sek = Math.max(0.001, (t - this.seit) / 1000);
    const k = {
      fps: Math.round(this.frames / sek * 10) / 10,
      ping: this.ping == null ? null : Math.round(this.ping),
      kbs: Math.round(this.bytes / 1024 / sek * 10) / 10,
      zoom: ctx.zoom ?? null, bild: ctx.bild ?? '', dev: this.geraet, karte: ctx.karte ?? '', drinnen: !!ctx.drinnen,
      ton: ctx.ton ?? '', stumm: this.stumm, verdraengt: this.verdraengt, zombies: ctx.zombies ?? null,
    };
    this.frames = 0; this.bytes = 0; this.seit = t; this.stumm = 0; this.verdraengt = 0;
    return this.abschicken({ kpi: k }) && k;
  }
}

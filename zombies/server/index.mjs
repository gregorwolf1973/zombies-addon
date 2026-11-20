// Einstieg: liefert die Spieldateien aus und startet den Colyseus-Spielserver.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import express from 'express';
import { Server } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { Encoder } from '@colyseus/schema';
// Große Horden (bis 1000 Zombies): Zustandspuffer gleich groß genug anlegen, statt bei jedem Wachsen zu warnen
Encoder.BUFFER_SIZE = 256 * 1024;
import { SpielRaum } from './raum.mjs';
import { SchiessstandRaum } from './schiessstand.mjs';
import { Speicher } from './speicher.mjs';
import { EinstellungsDatei, KARTEN, ZEITRAFFER, EREIGNISSE, TON_GRUPPEN, tonKategorien, TON_DATEI, ZOMBIE_TYPEN } from './einstellungen.mjs';
import { DINGE } from '../client/welt.mjs';

const hier = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

export function leseOptionen(datei = process.env.ZOMBIES_OPTIONS || '/data/options.json') {
  try { return JSON.parse(fs.readFileSync(datei, 'utf8')); } catch { return {}; }
}

// ICE-Server für die Sprachübertragung aus den Add-on-Optionen („aus“ = kein STUN)
export function iceServer(o = {}) {
  const ice = [];
  const stun = String(o.stun_server ?? 'stun:stun.l.google.com:19302').trim();
  if (stun && stun.toLowerCase() !== 'aus') ice.push({ urls: stun });
  const turn = String(o.turn_server ?? '').trim();
  if (turn) {
    const eintrag = { urls: turn };
    if (o.turn_username) eintrag.username = String(o.turn_username);
    if (o.turn_password) eintrag.credential = String(o.turn_password);
    ice.push(eintrag);
  }
  return ice;
}

const SUPERVISOR = new Set(['172.30.32.2', '::ffff:172.30.32.2']);
export function entferneFremdenIngress(req, res, next) {
  if (!SUPERVISOR.has(req.socket?.remoteAddress)) delete req.headers['x-ingress-path'];
  next?.();
}

// OSM-Karte aus client/karten laden ('dorf' = erzeugtes Dorf ohne Datei)
export function ladeKarte(name) {
  if (!name || name === 'dorf' || !/^[a-z0-9_-]+$/.test(name)) return null;
  try {
    const daten = JSON.parse(fs.readFileSync(path.join(hier, '..', 'client', 'karten', name + '.json'), 'utf8'));
    return { ...daten, name };
  } catch (e) { console.error('Karte nicht gefunden:', name, e.message); return null; }
}

export async function starte({
  port = Number(process.env.PORT) || 2567,
  optionen = leseOptionen(),
  leise = false,
  datenbank = process.env.ZOMBIES_DB || '/data/zombies.db',
  einstellungsDatei = process.env.ZOMBIES_EINSTELLUNGEN ?? (datenbank === ':memory:' ? null : path.join(path.dirname(datenbank), 'einstellungen.json')),
  // Tondateien: mitgelieferte liegen in /share (nicht im öffentlichen Repo – Lizenz), hochgeladene in /data
  tonOrdner = [
    { pfad: process.env.ZOMBIES_TOENE ?? '/share/zombies/toene', quelle: 'mitgeliefert' },
    ...(datenbank === ':memory:' ? [] : [{ pfad: path.join(path.dirname(datenbank), 'toene'), quelle: 'hochgeladen', schreiben: true }]),
  ],
} = {}) {
  SpielRaum.speicher = new Speicher(datenbank);
  const app = express();
  app.disable('x-powered-by');
  const nocache = (req, res, next) => { res.set('Cache-Control', 'no-cache'); next(); };
  app.get('/vendor/phaser.min.js', nocache, (req, res) =>
    res.sendFile(require.resolve('phaser/dist/phaser.min.js')));
  app.get('/vendor/colyseus.js', nocache, (req, res) =>
    res.sendFile(path.join(path.dirname(require.resolve('@colyseus/sdk/package.json')), 'dist/colyseus.js')));
  const datei = new EinstellungsDatei(einstellungsDatei, optionen);
  // Levelwechsel (Evakuierungsbus): die nächste Karte einstellen, die Welt startet der Raum selbst neu
  SpielRaum.kartenWechsel = karte => { anwenden(datei.aendern({ karte })); };
  let geladeneKarte = null;
  const anwenden = w => {
    if (!geladeneKarte || geladeneKarte.wahl !== w.karte) geladeneKarte = { wahl: w.karte, karte: ladeKarte(w.karte) };
    SpielRaum.einstellungen = {
      zugangscode: w.zugangscode,
      zombieFaktor: w.zombies.dichte / 10,         // 10 = Standardmenge
      haeuserFaktor: w.zombies.haeuser / 10,
      tempoFaktor: w.zombies.tempo / 100,
      nachtFaktor: w.zombies.nacht / 10,
      autoFaktor: w.autos / 10,
      tagMinuten: w.tagMinuten,
      tagAb: w.tagAb, nachtAb: w.nachtAb, nachtDunkel: w.nachtDunkel, menschenGroesse: w.menschenGroesse, zombieGroesse: w.zombieGroesse, groesseGesamt: w.groesseGesamt, zombieLeben: w.zombieLeben,
      menschen: w.menschen,
      verwandlungMin: w.verwandlung,               // Spielminuten Biss → Zombie (Menschen)
      bissChance: w.biss / 100,
      bissSpieler: w.bissSpieler / 100,            // je Sekunde Biss eines lebenden Zombies (global)
      bissSpielerLevel: Object.fromEntries(Object.entries(w.bissSpielerLevel ?? {}).map(([k, v]) => [k, v / 100])),   // je Karte/Level
      waffen: w.waffen,                            // je Waffe { schaden, pause }
      zombieTypen: ZOMBIE_TYPEN.filter(k => w.zombies.typen[k]).map(k => ZOMBIE_TYPEN.indexOf(k)),
      feuerMinuten: w.feuer, feuerPhase: w.feuerPhase, verkehr: w.verkehr, verkehrPhase: w.verkehrPhase, blaulicht: w.blaulicht, welleMinuten: w.zombies.welle, welleMin: w.zombies.welleMin, welleMax: w.zombies.welleMax, hordeZielMin: w.zombies.hordeZielMin, hordeZielMax: w.zombies.hordeZielMax, hordeZieleZeigen: w.zombies.hordeZieleZeigen, hordeTruppMin: w.zombies.hordeTruppMin, hordeTruppMax: w.zombies.hordeTruppMax, hordeReichweite: w.zombies.hordeReichweite, ueberraschung: w.zombies.ueberraschung, sichtkegel: w.sichtkegel,
      reichweite: w.reichweite,
      funde: w.funde,                               // je Gegenstand: 10 = normal, 0 = nie, 20 = doppelt
      bots: w.bots,
      karte: geladeneKarte.karte,                   // gilt für die nächste Welt
      frischerStart: w.frischerStart,
      sprache: {                                    // Sprachübertragung (Werte für den Client: Meter bzw. 0..1)
        an: w.sprache.an, hoerweite: w.sprache.hoerweite, stockwerk: w.sprache.stockwerk / 100,
        drinnenDraussen: w.sprache.drinnenDraussen / 100, funk: w.sprache.funk / 100, redenLockt: w.sprache.redenLockt,
      },
      aufgaben: w.aufgaben,                         // { an, stunde, wartezeit, anzahl }
      tueren: w.tueren,                             // { frei, raetsel, schluessel } in %
      faehigkeiten: w.faehigkeiten,                 // { an, xpFaktor }
      bundeswehr: w.bundeswehr,                     // { aktiv, falltage }
      ice: iceServer(optionen),
      zeitraffer: w.test.zeitraffer,
      test: { moerser: w.test.moerser },              // Test-Schalter Panzermörser (M113)
      moerser: w.moerser,                           // { reichweiteMin, reichweiteMax, pause, schaden, radius, mindestZombies, sicherheit, tempo }
      unsterblich: new Set(w.test.unsterblich.map(n => n.toLowerCase())),
    };
    SpielRaum.aktiv?.einstellungenGeaendert?.();
  };
  // Startzuordnung der Töne aus zuordnung.json: jedes Ereignis wird höchstens einmal vorbelegt (spätere Änderungen bleiben)
  for (const o of tonOrdner) {
    let vorgabe = null;
    try { vorgabe = JSON.parse(fs.readFileSync(path.join(o.pfad, 'zuordnung.json'), 'utf8')); } catch { continue; }
    const erledigt = new Set(datei.werte.toeneVorbelegt ?? []);
    const neu = {};
    for (const [id, t] of Object.entries(vorgabe)) {
      if (erledigt.has(id)) continue;
      erledigt.add(id);
      if (!datei.werte.toene[id]?.dateien?.length) neu[id] = t;
    }
    if (erledigt.size !== (datei.werte.toeneVorbelegt ?? []).length) datei.aendern({ toene: neu, toeneVorbelegt: [...erledigt] });
    break;
  }
  anwenden(datei.werte);

  const toeneListe = () => {
    const liste = new Map();
    for (const o of tonOrdner) {
      let namen = [];
      try { namen = fs.readdirSync(o.pfad); } catch { continue; }
      for (const n of namen) {
        if (!TON_DATEI.test(n) || liste.has(n)) continue;
        try { liste.set(n, { datei: n, groesse: fs.statSync(path.join(o.pfad, n)).size, quelle: o.quelle, kategorien: tonKategorien(n) }); } catch { /* weg */ }
      }
    }
    return [...liste.values()].sort((a, b) => a.datei.localeCompare(b.datei, 'de'));
  };
  const tonPfad = name => {
    if (!TON_DATEI.test(name)) return null;
    for (const o of tonOrdner) { const p = path.join(o.pfad, name); if (fs.existsSync(p)) return p; }
    return null;
  };
  app.get('/toene/:datei', (req, res) => {
    const p = tonPfad(req.params.datei);
    if (!p) return res.status(404).end();
    res.set('Cache-Control', 'public, max-age=86400').sendFile(p);
  });

  // ---------- Verwaltung: nur über die HA-Seitenleiste (Ingress, schon bei HA angemeldet) ----------
  // (ZOMBIES_VERWALTUNG_LOKAL=1 erlaubt sie zum Testen auch von diesem Rechner aus)
  const lokal = req => process.env.ZOMBIES_VERWALTUNG_LOKAL === '1' && ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket?.remoteAddress);
  const nurIngress = (req, res, next) => req.get('x-ingress-path') || lokal(req) ? next() : res.status(403).json({ fehler: 'Nur über die Home-Assistant-Seitenleiste' });
  let paketVersion = '';
  try { paketVersion = JSON.parse(fs.readFileSync(path.join(hier, '..', 'package.json'), 'utf8')).version; } catch { /* egal */ }
  const lage = () => {
    const raum = SpielRaum.aktiv;
    return {
      einstellungen: datei.werte,
      karten: KARTEN, zeitraffer: ZEITRAFFER,
      dinge: Object.entries(DINGE).map(([id, d]) => ({ id, name: d.name, zeichen: d.zeichen })),
      laufendeKarte: raum ? (raum.state.karte || 'dorf') : null,
      spieler: raum ? [...raum.state.spieler.entries()].map(([sid, p]) => ({
        name: p.name, bot: !!raum.extra.get(sid)?.bot,
        drinnen: !!p.ebene, hp: Math.round(p.hp), verbunden: !!p.verbunden,
      })) : [],
      spielzeit: raum ? Math.round(raum.state.zeit) : 0,
      leistung: raum?.leistung ?? null, takt: 50,
      toene: toeneListe(), ereignisse: EREIGNISSE, tonGruppen: TON_GRUPPEN,
      uhr: raum ? Math.floor(raum.state.uhr) : null, autosWelt: raum ? raum.state.autos : null,
      bewohner: raum ? { gesund: [...raum.state.menschen.values()].filter(m => !m.infiziert).length, gebissen: [...raum.state.menschen.values()].filter(m => m.infiziert).length, zombies: raum.state.zombies.size } : null,
      version: paketVersion,
      stuetzpunkt: raum ? { zustand: raum.state.stuetzpunkt, tage: Math.round(raum.stuetzpunkt?.spieltage() * 10) / 10 } : null,
    };
  };
  app.get('/verwaltung/api', nurIngress, (req, res) => res.json(lage()));
  app.post('/verwaltung/api', nurIngress, express.json({ limit: '20kb' }), (req, res) => {
    anwenden(datei.aendern(req.body ?? {}));
    res.json(lage());
  });
  // Testwerkzeug: Uhrzeit setzen (Spielminuten 0–1439)
  app.post('/verwaltung/uhr', nurIngress, express.json({ limit: '1kb' }), (req, res) => {
    const u = Number(req.body?.uhr);
    if (!Number.isFinite(u)) return res.status(400).json({ fehler: 'Uhrzeit fehlt' });
    if (SpielRaum.aktiv) SpielRaum.aktiv.state.uhr = ((Math.round(u) % 1440) + 1440) % 1440;
    res.json(lage());
  });
  const hochladeOrdner = tonOrdner.find(o => o.schreiben);
  app.post('/verwaltung/ton', nurIngress, express.raw({ type: () => true, limit: '8mb' }), (req, res) => {
    let name = '';
    try { name = decodeURIComponent(req.get('x-dateiname') ?? ''); } catch { /* unten */ }
    name = path.basename(name).replace(/[^\w.()+\- ]/g, '_');
    if (!hochladeOrdner) return res.status(400).json({ fehler: 'Hochladen hier nicht möglich' });
    if (!TON_DATEI.test(name)) return res.status(400).json({ fehler: 'Nur MP3, OGG, WAV oder M4A' });
    if (!req.body?.length) return res.status(400).json({ fehler: 'Leere Datei' });
    try {
      fs.mkdirSync(hochladeOrdner.pfad, { recursive: true });
      fs.writeFileSync(path.join(hochladeOrdner.pfad, name), req.body);
    } catch (e) { return res.status(400).json({ fehler: 'Speichern fehlgeschlagen: ' + e.message }); }
    res.json(lage());
  });
  app.delete('/verwaltung/ton/:datei', nurIngress, (req, res) => {
    const name = req.params.datei;
    if (!hochladeOrdner || !TON_DATEI.test(name)) return res.status(400).json({ fehler: 'Unbekannte Datei' });
    try { fs.unlinkSync(path.join(hochladeOrdner.pfad, path.basename(name))); } catch { return res.status(404).json({ fehler: 'Nur hochgeladene Dateien lassen sich löschen' }); }
    // aus allen Zuordnungen entfernen
    const toene = Object.fromEntries(Object.entries(datei.werte.toene).map(([id, t]) => [id, { ...t, dateien: t.dateien.filter(d => d !== name) }]));
    anwenden(datei.aendern({ toene }));
    res.json(lage());
  });
  app.post('/verwaltung/neustart', nurIngress, express.json({ limit: '2kb' }), (req, res) => {
    const raum = SpielRaum.aktiv;
    if (raum) raum.weltNeuStarten(!!req.body?.spielerLoeschen);
    else { SpielRaum.speicher?.loescheWelt(); if (req.body?.spielerLoeschen) SpielRaum.speicher?.loescheSpieler(); }
    res.json({ ok: true });
  });
  // In der Seitenleiste erscheint die Verwaltung; gespielt wird über die normale Adresse (oder ?spielen)
  app.get('/', (req, res, next) => req.get('x-ingress-path') && !('spielen' in req.query)
    ? res.set('Cache-Control', 'no-cache').sendFile(path.join(hier, '..', 'client', 'verwaltung.html')) : next());

  app.get('/gesund', (req, res) => res.json({ ok: true }));
  // sagt dem Client, ob er nach dem Zugangscode fragen muss
  app.get('/info', (req, res) => res.json({
    code: !!SpielRaum.einstellungen.zugangscode && !req.get('x-ingress-path'),
    version: paketVersion,                     // Client vergleicht mit der Version beim Laden der Seite (alter Code im Speicher → neu laden)
    wiki: String(optionen.wiki_adresse ?? '').trim(),
    extern: String(optionen.externe_adresse ?? '').trim(),   // https-Adresse, unter der das Mikrofon geht
    toene: datei.werte.toene,
  }));
  app.use(nocache, express.static(path.join(hier, '..', 'client'), { extensions: ['html'] }));

  const httpServer = http.createServer(app);
  const spielServer = new Server({
    transport: new WebSocketTransport({ server: httpServer, maxPayload: 32 * 1024 }),   // Standard 4 KB: zu knapp für WebRTC-Signalisierung (SDP)
    greet: false,
    logger: leise ? { info() {}, warn() {}, error: console.error, debug() {}, trace() {} } : undefined,
  });
  spielServer.define('zombies', SpielRaum);
  spielServer.define('schiessstand', SchiessstandRaum);   // Tutorial: ein eigener Übungsraum je Spieler (nichts davon berührt die Hauptwelt)
  await spielServer.listen(port);
  // Auch die Anfragen zum Beitreten (Colyseus hängt eigene Handler an) laufen durch die Prüfung
  const handler = httpServer.listeners('request');
  httpServer.removeAllListeners('request');
  httpServer.on('request', (req, res) => {
    entferneFremdenIngress(req);
    for (const h of handler) h.call(httpServer, req, res);
  });
  if (!leise) console.log(`Zombies in Oberbayern läuft auf Port ${port}`);
  return spielServer;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  // Sicherheitsnetz: ein einzelner Fehler soll nie das ganze Spiel beenden
  process.on('unhandledRejection', e => console.error('Unbehandelter Fehler:', e?.message ?? e));
  // Datenbank beim Beenden schließen (schreibt die WAL-Datei zurück)
  process.on('exit', () => SpielRaum.speicher?.schliessen());
  // Colyseus fängt SIGTERM/SIGINT selbst ab und fährt sauber herunter
  await starte();
}

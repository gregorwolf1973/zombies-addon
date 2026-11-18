// Einstieg: liefert die Spieldateien aus und startet den Colyseus-Spielserver.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import express from 'express';
import { Server } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { SpielRaum } from './raum.mjs';
import { Speicher } from './speicher.mjs';
import { EinstellungsDatei, KARTEN, ZEITRAFFER } from './einstellungen.mjs';
import { DINGE } from '../client/welt.mjs';

const hier = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

export function leseOptionen(datei = process.env.ZOMBIES_OPTIONS || '/data/options.json') {
  try { return JSON.parse(fs.readFileSync(datei, 'utf8')); } catch { return {}; }
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
  let geladeneKarte = null;
  const anwenden = w => {
    if (!geladeneKarte || geladeneKarte.wahl !== w.karte) geladeneKarte = { wahl: w.karte, karte: ladeKarte(w.karte) };
    SpielRaum.einstellungen = {
      zugangscode: w.zugangscode,
      zombieFaktor: w.zombies.dichte / 10,         // 10 = Standardmenge
      haeuserFaktor: w.zombies.haeuser / 10,
      tempoFaktor: w.zombies.tempo / 100,
      funde: w.funde,                               // je Gegenstand: 10 = normal, 0 = nie, 20 = doppelt
      bots: w.bots,
      karte: geladeneKarte.karte,                   // gilt für die nächste Welt
      frischerStart: w.frischerStart,
      zeitraffer: w.test.zeitraffer,
      unsterblich: new Set(w.test.unsterblich.map(n => n.toLowerCase())),
    };
    SpielRaum.aktiv?.einstellungenGeaendert?.();
  };
  anwenden(datei.werte);

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
      version: paketVersion,
    };
  };
  app.get('/verwaltung/api', nurIngress, (req, res) => res.json(lage()));
  app.post('/verwaltung/api', nurIngress, express.json({ limit: '20kb' }), (req, res) => {
    anwenden(datei.aendern(req.body ?? {}));
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
    wiki: String(optionen.wiki_adresse ?? '').trim(),
  }));
  app.use(nocache, express.static(path.join(hier, '..', 'client'), { extensions: ['html'] }));

  const httpServer = http.createServer(app);
  const spielServer = new Server({
    transport: new WebSocketTransport({ server: httpServer }),
    greet: false,
    logger: leise ? { info() {}, warn() {}, error: console.error, debug() {}, trace() {} } : undefined,
  });
  spielServer.define('zombies', SpielRaum);
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

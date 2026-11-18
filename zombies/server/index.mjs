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

export async function starte({
  port = Number(process.env.PORT) || 2567,
  optionen = leseOptionen(),
  leise = false,
  datenbank = process.env.ZOMBIES_DB || '/data/zombies.db',
} = {}) {
  SpielRaum.speicher = new Speicher(datenbank);
  const app = express();
  app.disable('x-powered-by');
  const nocache = (req, res, next) => { res.set('Cache-Control', 'no-cache'); next(); };
  app.get('/vendor/phaser.min.js', nocache, (req, res) =>
    res.sendFile(require.resolve('phaser/dist/phaser.min.js')));
  app.get('/vendor/colyseus.js', nocache, (req, res) =>
    res.sendFile(path.join(path.dirname(require.resolve('@colyseus/sdk/package.json')), 'dist/colyseus.js')));
  SpielRaum.einstellungen = {
    zugangscode: String(optionen.zugangscode ?? '').trim(),
    // Zombies: ganzzahlig, 10 = Standardmenge (ältere Option zombie_faktor gilt nur, wenn zombies fehlt)
    zombieFaktor: Number.isFinite(Number(optionen.zombies)) && optionen.zombies !== undefined && optionen.zombies !== null
      ? Math.max(0, Math.min(50, Number(optionen.zombies))) / 10 : (Number(optionen.zombie_faktor) || 1),
    // Fundhäufigkeit je Gegenstand: 10 = normal, 0 = nie, 20 = doppelt
    funde: Object.fromEntries(Object.entries(optionen.funde ?? {}).map(([k, v]) => [k, Math.max(0, Math.min(50, Number(v) || 0))])),
    bots: Math.max(0, Math.min(9, Number(optionen.bots) || 0)),
  };
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

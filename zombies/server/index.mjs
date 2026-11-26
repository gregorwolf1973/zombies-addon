// Einstieg: liefert die Spieldateien aus und startet den Colyseus-Spielserver.
import http from 'node:http';
import fs from 'node:fs';
import zlib from 'node:zlib';
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
import { LEVEL_KATALOG } from '../client/levelkatalog.mjs';
import { SchiessstandRaum } from './schiessstand.mjs';
import { verwaltungTexteSkript } from './verwaltung_texte.mjs';
import { Speicher } from './speicher.mjs';
import { clientAuslieferung, auslieferungsVersion } from './statisch.mjs';
import { Diagnose, DIAG_MAX_BYTES } from './diagnose.mjs';
import { EinstellungsDatei, oeffentlich, ohneGeheimnisse, vorgaben, KARTEN, ZEITRAFFER, EREIGNISSE, TON_GRUPPEN, tonKategorien, TON_DATEI, TON_STANDARD, ZOMBIE_TYPEN } from './einstellungen.mjs';
import { DINGE } from '../client/welt.mjs';
import { hfAktive } from '../client/heldenfiguren.mjs';
import { rechtsseite } from './rechtstext.mjs';

const hier = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

export function leseOptionen(datei = process.env.ZOMBIES_OPTIONS || '/data/options.json') {
  try { return JSON.parse(fs.readFileSync(datei, 'utf8')); } catch { return {}; }
}

// WebSocket-Kompression (permessage-deflate): wird nur genutzt, wenn der Client sie anbietet (Browser tun das); entfernt ein Proxy (Cloudflare-Tunnel,
// HA-Ingress) die Erweiterung, läuft es unkomprimiert weiter. Kleine Pakete (Eingaben, Meldungen) bleiben unkomprimiert, Stufe 3 spart CPU.
export const WS_KOMPRESSION = { threshold: 256, zlibDeflateOptions: { level: 3 }, concurrencyLimit: 8 };

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
  diagnosePruefung = null,   // nur Tests: ersetzt die Prüfung „verbundener Spieler“
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
  const datei = new EinstellungsDatei(einstellungsDatei, optionen);
  // Levelwechsel (Evakuierungsbus): die nächste Karte einstellen, die Welt startet der Raum selbst neu
  // (die in der Verwaltung erzwungene Evakuierungsart gilt nur für die aktuelle Karte und wird beim Kartenwechsel zurückgesetzt – sonst käme z. B. der Leopard auch in Königsdorf)
  // Jedes Level hat genau eine Karte (Geretsried 1 und 2 sind eigene Level der Reihenfolge, keine Zufallswahl mehr)
  SpielRaum.kartenWechsel = karte => { anwenden(datei.aendern({ karte, aufgaben: { evakArt: '' } })); };
  SpielRaum.karteVon = ladeKarte;   // für das Vorbauen der nächsten Welt (weltcache.mjs)
  SpielRaum.testSetzen = test => { anwenden(datei.aendern({ test })); return datei.werte.test; };   // Testmenü (Superuser): wie die Verwaltung speichern und für alle Räume übernehmen
  let geladeneKarte = null;
  const anwenden = w => {
    const wahl = w.karte;
    if (!geladeneKarte || geladeneKarte.wahl !== wahl) geladeneKarte = { wahl, karte: ladeKarte(wahl) };
    SpielRaum.einstellungen = {
      zugangscode: w.zugangscode,
      superuserHash: w.superuserHash,              // nur Hash; ohne Hash kein Superuser
      zombieFaktor: 1,                             // Prüfhaken für Tests (0 = keine Zombies draußen); die Mengen stehen in zombiesLevel
      haeuserFaktor: 1,
      zombiesLevel: w.zombies.level,               // Tabelle je Level (grund, jeSpieler, horde, dauer, pause, gleichzeitig, haeuser)
      tempoFaktor: w.zombies.tempo / 100,
      nachtFaktor: w.zombies.nacht / 10,
      autoFaktor: w.autos / 10,
      schwierigkeit: w.schwierigkeit,               // 'leicht' | 'normal' | 'schwer' (server/schwierigkeit.mjs)
      tagMinuten: w.tagMinuten,
      zombieSicht: w.zombieSicht,                   // { gehen, schleichen, kegel, verfolgen, aufgeben, nacht } (client/zombiesicht.mjs)
      nebel: w.nebel,                               // { an, morgen, abend, sicht, zombie } (server/nebel.mjs)
      tagAb: w.tagAb, nachtAb: w.nachtAb, nachtDunkel: w.nachtDunkel, menschenGroesse: w.menschenGroesse, zombieGroesse: w.zombieGroesse, groesseGesamt: w.groesseGesamt, baumTempo: w.baumTempo, zombieLeben: w.zombieLeben,
      menschen: w.menschen,
      verwandlungMin: w.verwandlung,               // Spielminuten Biss → Zombie (Menschen)
      bissChance: w.biss / 100,
      bissSpieler: w.bissSpieler / 100,            // je Sekunde Biss eines lebenden Zombies (global)
      bissSpielerLevel: Object.fromEntries(Object.entries(w.bissSpielerLevel ?? {}).map(([k, v]) => [k, v / 100])),   // je Karte/Level
      waffen: w.waffen,                            // je Waffe { schaden, pause }
      zombieFiguren: w.zombies.figuren,
      zombieTypen: ZOMBIE_TYPEN.filter(k => w.zombies.typen[k]).map(k => ZOMBIE_TYPEN.indexOf(k)),
      feuerMinuten: w.feuer, feuerPhase: w.feuerPhase, verkehr: w.verkehr, verkehrPhase: w.verkehrPhase, unfallMinuten: w.unfall, unfallExplosion: w.unfallExplosion, unfallSchaden: w.unfallSchaden, fahrzeugStoss: w.fahrzeugStoss, blaulicht: w.blaulicht, hordeZiel: w.zombies.hordeZiel, hordeZieleZeigen: w.zombies.hordeZieleZeigen, hordeTrupp: w.zombies.hordeTrupp, hordeReichweite: w.zombies.hordeReichweite, lagerWelle: w.zombies.lagerWelle, lagerWellePause: w.zombies.lagerWellePause, ueberraschung: w.zombies.ueberraschung, sichtkegel: w.sichtkegel, zombieFigurenNeu: w.zombieFigurenNeu !== false, heldenFigurenNeu: w.heldenFigurenNeu !== false, diagnose: w.diagnose !== false, innenMassstab: w.innenMassstab, innenTempo: w.innenTempo, tempoHeldGehen: w.tempoHeldGehen, tempoHeldSchleichen: w.tempoHeldSchleichen, tempoZombieJagen: w.tempoZombieJagen, tempoZombieWandern: w.tempoZombieWandern, tempoSchlurferJagen: w.tempoSchlurferJagen,
      reichweite: w.reichweite,
      funde: w.funde,                               // je Gegenstand: 10 = normal, 0 = nie, 20 = doppelt
      bots: w.bots,
      verkehrDichte: w.verkehrDichte,               // Meter Straße je fahrendem Auto (Anzahl = Netzlänge / Dichte, höchstens `verkehr`)
      levelFolge: w.levelFolge,                     // Reihenfolge/Schalter der Level [{ karte, aktiv }] (client/levelkatalog.mjs)
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
      polizei: w.polizei,                           // { aktiv, anzahl, munition }
      ice: iceServer(optionen),
      zeitraffer: w.test.zeitraffer,
      hund: w.hund,                                 // { ablenkung } in %
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

  // Standardzuordnung (Hordengeräusch) und Übernahme alter Musik: je Ereignis einmal, nur wenn noch nichts zugeordnet ist.
  // Fehlen die Dateien noch im Tonordner, wird später (nächster Start) erneut versucht.
  {
    const erledigt = new Set(datei.werte.toeneVorbelegt ?? []), neu = {};
    for (const [id, t] of Object.entries(TON_STANDARD)) {
      if (erledigt.has(id)) continue;
      if (datei.werte.toene[id]?.dateien?.length) { erledigt.add(id); continue; }
      const da = t.dateien.filter(d => tonPfad(d));
      if (!da.length) continue;
      erledigt.add(id); neu[id] = { dateien: da, laut: t.laut };
    }
    // alte Musik-Einstellung (Startmusik) wird einmal als Hauptlied von Level 1 übernommen
    if (!erledigt.has('musikLevel1')) {
      erledigt.add('musikLevel1');
      const alt = datei.werte.toene.startmusik;
      if (!datei.werte.toene.musikLevel1?.dateien?.length && alt?.dateien?.length) neu.musikLevel1 = { dateien: [...alt.dateien], laut: 100 };
    }
    if (Object.keys(neu).length || erledigt.size !== (datei.werte.toeneVorbelegt ?? []).length) { datei.aendern({ toene: neu, toeneVorbelegt: [...erledigt] }); anwenden(datei.werte); }
  }
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
  // Version aus config.yaml (Add-on-Version); package.json bleibt fest, damit HA beim Einspielen den npm-Schritt aus dem Docker-Zwischenspeicher nimmt
  try { paketVersion = /^version:\s*"?([^"\s]+)"?/m.exec(fs.readFileSync(path.join(hier, '..', 'config.yaml'), 'utf8'))?.[1] ?? ''; } catch { /* egal */ }
  if (!paketVersion) try { paketVersion = JSON.parse(fs.readFileSync(path.join(hier, '..', 'package.json'), 'utf8')).version; } catch { /* egal */ }
  const lage = () => {
    const raum = SpielRaum.aktiv;
    return {
      einstellungen: oeffentlich(datei.werte), vorgaben: oeffentlich(vorgaben()),   // vorgaben: Werte für „↺“ (Vorgabe) auf der Verwaltungsseite
      karten: KARTEN, levelKatalog: LEVEL_KATALOG, zeitraffer: ZEITRAFFER,
      dinge: Object.entries(DINGE).filter(([, d]) => !d.intern).map(([id, d]) => ({ id, name: d.name, zeichen: d.zeichen })),
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
      version: paketVersion, eigeneVorlage: !!eigeneLesen(),
      stuetzpunkt: raum ? { zustand: raum.state.stuetzpunkt, tage: Math.round(raum.stuetzpunkt?.spieltage() * 10) / 10 } : null,
    };
  };
  // Antwort der Verwaltungs-API gzip-komprimiert (wird alle 5 s abgefragt), sonst unverändert
  const jsonKomprimiert = (req, res, daten) => {
    const roh = Buffer.from(JSON.stringify(daten));
    res.set('Vary', 'Accept-Encoding').type('application/json');
    if (roh.length > 1024 && /\bgzip\b/.test(req.get('accept-encoding') ?? '')) return res.set('Content-Encoding', 'gzip').send(zlib.gzipSync(roh, { level: 6 }));
    res.send(roh);
  };
  app.get('/verwaltung/api', nurIngress, (req, res) => jsonKomprimiert(req, res, lage()));
  // Vorlagen: eigene Vorlage in /data/vorlage_eigen.json (neben einstellungen.json), ohne Geheimnisse
  const eigenePfad = einstellungsDatei ? path.join(path.dirname(einstellungsDatei), 'vorlage_eigen.json') : null;
  let eigeneImSpeicher = null;
  const eigeneLesen = () => {
    if (!eigenePfad) return eigeneImSpeicher;
    try { return JSON.parse(fs.readFileSync(eigenePfad, 'utf8')); } catch { return null; }
  };
  app.post('/verwaltung/vorlage', nurIngress, express.json({ limit: '2kb' }), (req, res) => {
    const aktion = req.body?.aktion, quelle = req.body?.quelle === 'eigen' ? 'eigen' : 'mitgeliefert';
    if (aktion === 'sichern') {
      const v = ohneGeheimnisse(datei.werte);
      if (!eigenePfad) eigeneImSpeicher = v;
      else try { fs.mkdirSync(path.dirname(eigenePfad), { recursive: true }); fs.writeFileSync(eigenePfad + '.neu', JSON.stringify(v, null, 2)); fs.renameSync(eigenePfad + '.neu', eigenePfad); }
      catch (e) { return res.status(500).json({ fehler: 'Nicht gespeichert: ' + e.message }); }
      return res.json({ ...lage(), eigeneVorlage: true });
    }
    if (aktion === 'laden') {
      const v = quelle === 'eigen' ? eigeneLesen() : ohneGeheimnisse(vorgaben());
      if (!v) return res.status(404).json({ fehler: 'Keine eigene Vorlage gespeichert' });
      const neu = datei.aendern(ohneGeheimnisse(v));   // Zugangscode und Superuser bleiben, wie sie sind
      anwenden(neu);
      return res.json({ ...lage(), eigeneVorlage: !!eigeneLesen() });
    }
    res.status(400).json({ fehler: 'Unbekannte Aktion' });
  });
  app.get('/verwaltung/export', nurIngress, (req, res) => {
    res.set('Content-Disposition', 'attachment; filename="zombies-einstellungen.json"').type('application/json').send(JSON.stringify(ohneGeheimnisse(datei.werte), null, 2));
  });
  app.post('/verwaltung/api', nurIngress, express.json({ limit: '100kb' }), (req, res) => {
    const neu = datei.aendern(req.body ?? {});
    anwenden(neu);
    // Ton-Einstellungen sofort an laufende Spiele (sonst erst nach Neuladen der Seite)
    if ('zombieSicht' in (req.body ?? {})) { try { SpielRaum.aktiv?.broadcast('tonEinst', { zombieSicht: neu.zombieSicht }); } catch { /* kein Raum */ } }
    if (['radioStream', 'musik', 'toeneHorde', 'toene', 'geraeuschPause'].some(k => k in (req.body ?? {}))) {
      try { SpielRaum.aktiv?.broadcast('tonEinst', { radioStream: neu.radioStream, musik: neu.musik, toeneHorde: neu.toeneHorde, toene: neu.toene, geraeuschPause: neu.geraeuschPause }); } catch { /* kein Raum */ }
    }
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
    // optional: Anzeigename im Kopf x-anzeigename (URL-kodiert)
    let anzeige = '';
    try { anzeige = decodeURIComponent(req.get('x-anzeigename') ?? ''); } catch { /* ohne Namen */ }
    if (anzeige.trim()) anwenden(datei.aendern({ toeneNamen: { [name]: anzeige } }));
    res.json(lage());
  });
  app.delete('/verwaltung/ton/:datei', nurIngress, (req, res) => {
    const name = req.params.datei;
    if (!hochladeOrdner || !TON_DATEI.test(name)) return res.status(400).json({ fehler: 'Unbekannte Datei' });
    try { fs.unlinkSync(path.join(hochladeOrdner.pfad, path.basename(name))); } catch { return res.status(404).json({ fehler: 'Nur hochgeladene Dateien lassen sich löschen' }); }
    // aus allen Zuordnungen entfernen
    const toene = Object.fromEntries(Object.entries(datei.werte.toene).map(([id, t]) => [id, { ...t, dateien: t.dateien.filter(d => d !== name) }]));
    anwenden(datei.aendern({ toene, toeneNamen: { [name]: '' } }));   // auch ihr Anzeigename fällt weg
    res.json(lage());
  });
  app.post('/verwaltung/neustart', nurIngress, express.json({ limit: '2kb' }), (req, res) => {
    const raum = SpielRaum.aktiv;
    if (raum) raum.weltNeuStarten(!!req.body?.spielerLoeschen);
    else { SpielRaum.speicher?.loescheWelt(); if (req.body?.spielerLoeschen) SpielRaum.speicher?.loescheSpieler(); }
    res.json({ ok: true });
  });
  // Texte der Verwaltungsseite (de/en) als klassisches Skript, vor allen Skripten der Seite geladen (server/verwaltung_texte.mjs)
  app.get('/verwaltung_texte.js', (req, res) => res.set('Cache-Control', 'no-cache').type('text/javascript; charset=utf-8').send(verwaltungTexteSkript()));
  // In der Seitenleiste erscheint die Verwaltung; gespielt wird über die normale Adresse (oder ?spielen)
  app.get('/', (req, res, next) => req.get('x-ingress-path') && !('spielen' in req.query)
    ? res.set('Cache-Control', 'no-cache').sendFile(path.join(hier, '..', 'client', 'verwaltung.html')) : next());

  // Diagnose: Fehler und Kennzahlen echter Geräte (client/diagnose.mjs) → kompakte Zeilen im Log + Ringpuffer /data/diag.jsonl
  const diagnose = new Diagnose({
    an: () => datei.werte.diagnose !== false,
    sitzungOk: diagnosePruefung ?? (s => !!SpielRaum.aktiv?.clients?.some(c => c.sessionId === s)),
    datei: datenbank === ':memory:' ? null : path.join(path.dirname(datenbank), 'diag.jsonl'),
    log: z => console.log(z),
  });
  app.post('/diag', express.text({ type: () => true, limit: DIAG_MAX_BYTES }), (req, res) => {
    let body = null;
    try { body = JSON.parse(typeof req.body === 'string' ? req.body : ''); } catch { /* ungültig */ }
    res.status(diagnose.annehmen(body).status).end();
  });
  app.use('/diag', (err, req, res, next) => res.status(err?.status === 413 ? 413 : 400).end());

  app.get('/gesund', (req, res) => res.json({ ok: true }));
  // Impressum/Datenschutz: Text steht nur in den Einstellungen des jeweiligen Servers; leer = 404
  for (const [pfad, feld, titel] of [['/impressum', 'impressum', 'Impressum'], ['/datenschutz', 'datenschutz', 'Datenschutz']]) {
    app.get(pfad, (req, res) => {
      const t = String(datei.werte[feld] ?? '').trim();
      if (!t) return res.status(404).type('text/plain').send('Nicht vorhanden');
      res.set('Cache-Control', 'no-cache').type('html').send(rechtsseite(titel, t));
    });
  }
  const kulissenListe = () => { try { return fs.readdirSync(path.join(hier, '..', 'client', 'karten', 'kulisse'), { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name); } catch { return []; } };
  // sagt dem Client, ob er nach dem Zugangscode fragen muss
  app.get('/info', (req, res) => res.json({
    code: !!SpielRaum.einstellungen.zugangscode && !req.get('x-ingress-path'),
    version: paketVersion,                     // Client vergleicht mit der Version beim Laden der Seite (alter Code im Speicher → neu laden)
    wiki: datei.werte.wikiAdresse || '',
    impressum: !!String(datei.werte.impressum ?? '').trim(), datenschutz: !!String(datei.werte.datenschutz ?? '').trim(),   // Fußzeilen-Links der Startseite
    kulissen: kulissenListe(),   // Karten mit Kulisse-Daten (der Client fragt nur diese an)
    extern: String(optionen.externe_adresse ?? '').trim(),   // https-Adresse, unter der das Mikrofon geht
    diagnose: datei.werte.diagnose !== false,   // Client schickt Fehler/Kennzahlen nur, wenn an
    zombieSicht: datei.werte.zombieSicht,   // Client: Sichtkegel-Anzeige
    helden: { neu: datei.werte.heldenFigurenNeu !== false, aktive: hfAktive(datei.werte.helden?.figuren) },   // Startwahl: neue Mixamo-Helden an/aus und welche wählbar sind (Kennbuchstaben)
    toene: datei.werte.toene,
    toeneEn: toeneListe().map(t => t.datei).filter(n => /_en\.\w+$/i.test(n)),   // englische Sprachvarianten (Client: tonlogik.mjs sprachVariante)
    geraeuschPause: datei.werte.geraeuschPause,   // Mindestpause (s) zwischen zwei Zombie-Hintergrundgeräuschen
    toeneHorde: datei.werte.toeneHorde,   // Hordengeräusch: Schwellen und Hörweite (client/hordenlogik.mjs)
    musik: datei.werte.musik,             // Musik: laut (%), blende (s)
    radioStream: datei.werte.radioStream, // Autoradio als Live-Radio (Stream direkt vom Sender)
  }));
  // Luftbild-Kacheln der Kulisse (client/karten/kulisse): ändern sich selten, eine Stunde zwischenspeichern (spart Mobildaten beim Herumlaufen)
  app.use('/karten/kulisse', (req, res, next) => { res.set('Cache-Control', 'public, max-age=3600'); next(); }, express.static(path.join(hier, '..', 'client', 'karten', 'kulisse')));
  // Client: unter v/<version>/ unveränderlich zwischengespeichert + komprimiert, index.html und alte Pfade no-cache (server/statisch.mjs)
  const clientOrdner = path.join(hier, '..', 'client');
  const vendorDateien = {
    'phaser.min.js': require.resolve('phaser/dist/phaser.min.js'),
    'colyseus.js': path.join(path.dirname(require.resolve('@colyseus/sdk/package.json')), 'dist/colyseus.js'),
  };
  clientAuslieferung(app, {
    wurzel: clientOrdner, vendor: vendorDateien,
    version: auslieferungsVersion(clientOrdner, paketVersion, Object.values(vendorDateien)),
  });

  const httpServer = http.createServer(app);
  const spielServer = new Server({
    transport: new WebSocketTransport({ server: httpServer, maxPayload: 32 * 1024, perMessageDeflate: WS_KOMPRESSION }),   // Standard 4 KB: zu knapp für WebRTC-Signalisierung (SDP)
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

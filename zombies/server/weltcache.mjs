// Welt-Zwischenspeicher des Servers: Aufbau im Worker-Thread, Ergebnis im Speicher (höchstens MAX Welten, die jüngsten bleiben).
//  - weltVorbereiten(): nächstes Level schon während des Spiels bauen (Tick-Schleife läuft weiter)
//  - weltBeschaffen(): fertige/laufende Welt holen (unabhängige Kopie) oder im Worker bauen; nur bei Worker-Fehler Aufbau im Haupt-Thread
// Der Schlüssel enthält Karte (Prüfsumme), Seed, Autos-Faktor und WELT_VERSION (weltSchluessel).
import { Worker } from 'node:worker_threads';
import { baueWeltAusKarte } from '../client/osmwelt.mjs';
import { setzeKartengroesse } from '../client/welt.mjs';
import { weltSchluessel, weltKopieren } from '../client/weltkopie.mjs';

const MAX = 2;               // Welten im Speicher (je ca. 10–30 MB)
const LEERLAUF_MS = 60000;   // Worker beenden, wenn er so lange nichts zu tun hatte (gibt Speicher frei)
const speicher = new Map();  // Schlüssel → { welt } (fertig, unverändert) | { zusage } (läuft)
const offen = new Map();
let worker = null, naechsteId = 1, leerlauf = null;

function workerStarten() {
  if (worker) return worker;
  const w = new Worker(new URL('./weltworker.mjs', import.meta.url));
  w.on('message', ({ id, welt, fehler }) => {
    const a = offen.get(id); offen.delete(id); if (!a) return;
    if (fehler) a.nein(new Error(fehler)); else a.ja(welt);
    if (!offen.size) { w.unref(); clearTimeout(leerlauf); leerlauf = setTimeout(workerBeenden, LEERLAUF_MS); leerlauf.unref?.(); }
  });
  const aus = e => { for (const a of offen.values()) a.nein(e instanceof Error ? e : new Error('Worker beendet')); offen.clear(); if (worker === w) worker = null; };
  w.on('error', aus); w.on('exit', () => aus(new Error('Worker beendet')));
  w.unref();   // erst nach den Listenern: ein 'message'-Listener holt den Port sonst wieder in die Ereignisschleife (Prozess wartete bis zum Leerlauf-Ende)
  // Solange Aufträge offen sind, hält der Worker den Prozess am Leben (imWorker: ref, letzte Antwort: unref). Sonst endete z. B. ein
  // Skript/Testlauf ohne Server mitten im Aufbau – Node 22 meldet dann „Promise resolution is still pending“ (Node 26 hält den Testlauf selbst offen).
  worker = w;
  return w;
}
function workerBeenden() { const w = worker; worker = null; clearTimeout(leerlauf); w?.terminate(); }

function imWorker(karte, seed, autos) {
  clearTimeout(leerlauf);
  return new Promise((ja, nein) => {
    const id = naechsteId++;
    offen.set(id, { ja, nein });
    try { const w = workerStarten(); w.postMessage({ id, karte, seed, autos }); w.ref(); } catch (e) { offen.delete(id); nein(e); }
  });
}

function aufraeumen() {
  while (speicher.size > MAX) {
    const aelteste = [...speicher.keys()].find(k => speicher.get(k).welt);   // laufende Aufträge nie verwerfen
    if (!aelteste) break;
    speicher.delete(aelteste);
  }
}

// Eintrag anlegen bzw. den laufenden/fertigen wiederverwenden
function eintrag(karte, seed, autos) {
  const key = weltSchluessel(karte, seed, autos);
  let e = speicher.get(key);
  if (e) { speicher.delete(key); speicher.set(key, e); return e; }   // jüngster Zugriff nach hinten
  e = { zusage: null, welt: null };
  e.zusage = imWorker(karte, seed, autos).then(w => { e.welt = w; e.zusage = null; aufraeumen(); return w; },
    err => { speicher.delete(key); throw err; });
  e.zusage.catch(() => {});   // keine „unhandled rejection“, wenn niemand wartet
  speicher.set(key, e);
  return e;
}

// Im Hintergrund bauen lassen (Fehler werden verschluckt, weltBeschaffen baut dann selbst)
export function weltVorbereiten(karte, seed, autos) {
  if (!karte?.kacheln) return;
  try { eintrag(karte, seed, autos); } catch (e) { console.error('Welt vorbereiten:', e.message); }
}

// Fertige Welt mit `hole`, immer eine eigene Kopie (der Zwischenspeicher bleibt unverändert)
export async function weltBeschaffen(karte, seed, autos) {
  try {
    const e = eintrag(karte, seed, autos);
    return weltKopieren(e.welt ?? await e.zusage);
  } catch (err) {
    console.error('Welt im Worker fehlgeschlagen, baue im Haupt-Thread:', err.message);
    setzeKartengroesse(karte.breite, karte.hoehe);
    return baueWeltAusKarte(karte, seed, { autos });
  }
}

// Nur für Tests/Aufräumen
export function weltcacheBeenden() { speicher.clear(); workerBeenden(); }
export function weltcacheStand() { return { eintraege: speicher.size, worker: !!worker }; }

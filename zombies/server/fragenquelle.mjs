// Woher die Rätsel kommen: zuerst die Wiki-Seite (über /share eingebunden), sonst die mitgelieferte Kopie.
// Die Datei wird höchstens alle 60 s neu gelesen – Änderungen im Wiki gelten ohne Neustart.
// Je Sprache eine eigene Seite: Deutsch krisenvorsorge:spielfragen, Englisch en:krisenvorsorge:spielfragen
// (gleiche Spalten und Reihenfolge). Fehlt die englische Seite (und die mitgelieferte Kopie), gelten die deutschen Fragen.
// Englische Fragen übernehmen die IDs der deutschen in gleicher Reihenfolge, solange beide Listen gleich lang sind –
// so zählt „schon gestellt“ sprachübergreifend.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { leseSpielfragen } from './raetsel.mjs';

const hier = path.dirname(fileURLToPath(import.meta.url));
const WIKI = '/share/dokuwiki/data/pages';
const quellen = {
  de: { datei: process.env.ZOMBIES_FRAGEN || `${WIKI}/krisenvorsorge/spielfragen.txt`, mitgeliefert: path.join(hier, 'spielfragen.txt') },
  en: { datei: process.env.ZOMBIES_FRAGEN_EN || `${WIKI}/en/krisenvorsorge/spielfragen.txt`, mitgeliefert: path.join(hier, 'spielfragen_en.txt') },
};
const leer = () => ({ zeit: 0, mtime: 0, datei: '', fragen: [] });
const cache = { de: leer(), en: leer() };

// Testhilfe: Quelle einer Sprache umstellen (ohne mitgelieferte Kopie, wenn mitgeliefert === null)
export function setzeFragenquelle(datei, sprache = 'de', mitgeliefert) {
  quellen[sprache] = { datei, mitgeliefert: mitgeliefert === undefined ? quellen[sprache].mitgeliefert : mitgeliefert };
  cache[sprache] = leer();
  if (sprache === 'de') cache.en = leer();   // englische IDs hängen an der deutschen Liste
}

function lies(sprache) {
  const c = cache[sprache];
  if (Date.now() - c.zeit < 60000 && c.fragen.length) return c.fragen;
  c.zeit = Date.now();
  const q = quellen[sprache];
  for (const datei of [q.datei, q.mitgeliefert].filter(Boolean)) {
    try {
      const mtime = fs.statSync(datei).mtimeMs;
      if (datei === c.datei && mtime === c.mtime) return c.fragen;
      const { fragen, fehler } = leseSpielfragen(fs.readFileSync(datei, 'utf8'));
      if (!fragen.length) continue;
      if (fehler.length) console.warn(`Spielfragen ${datei}: ${fehler.length} Zeilen übersprungen`, fehler.slice(0, 5));
      cache[sprache] = { zeit: Date.now(), mtime, datei, fragen };
      console.log(`Spielfragen (${sprache}): ${fragen.length} aus ${datei}`);
      return fragen;
    } catch { /* nächste Quelle */ }
  }
  return c.fragen;
}

// Fragen in der Sprache des Spielers; unbekannte Sprache oder keine Fragen in dieser Sprache → Deutsch
export function holeFragen(sprache = 'de') {
  const de = lies('de');
  if (sprache !== 'en') return de;
  const en = lies('en');
  if (!en.length) return de;
  if (en.length === de.length) en.forEach((f, i) => { f.id = de[i].id; });
  return en;
}

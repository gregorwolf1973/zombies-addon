// Woher die Rätsel kommen: zuerst die Wiki-Seite (über /share eingebunden), sonst die mitgelieferte Kopie.
// Die Datei wird höchstens alle 60 s neu gelesen – Änderungen im Wiki gelten ohne Neustart.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { leseSpielfragen } from './raetsel.mjs';

const MITGELIEFERT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'spielfragen.txt');
let quelle = process.env.ZOMBIES_FRAGEN || '/share/dokuwiki/data/pages/krisenvorsorge/spielfragen.txt';
let cache = { zeit: 0, mtime: 0, datei: '', fragen: [] };

export function setzeFragenquelle(datei) { quelle = datei; cache = { zeit: 0, mtime: 0, datei: '', fragen: [] }; }

export function holeFragen() {
  if (Date.now() - cache.zeit < 60000 && cache.fragen.length) return cache.fragen;
  cache.zeit = Date.now();
  for (const datei of [quelle, MITGELIEFERT]) {
    try {
      const mtime = fs.statSync(datei).mtimeMs;
      if (datei === cache.datei && mtime === cache.mtime) return cache.fragen;
      const { fragen, fehler } = leseSpielfragen(fs.readFileSync(datei, 'utf8'));
      if (!fragen.length) continue;
      if (fehler.length) console.warn(`Spielfragen ${datei}: ${fehler.length} Zeilen übersprungen`, fehler.slice(0, 5));
      cache = { zeit: Date.now(), mtime, datei, fragen };
      console.log(`Spielfragen: ${fragen.length} aus ${datei}`);
      return fragen;
    } catch { /* nächste Quelle */ }
  }
  return cache.fragen;
}

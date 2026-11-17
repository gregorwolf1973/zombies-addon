// Rätsel: Quizfragen aus der DokuWiki-Seite krisenvorsorge:spielfragen
// (Entwurf von Mistral Codestral, von Claude korrigiert: Pipe im Link, Kopfzeile mit ^,
// Tabellen ohne Kopf, Formatierung entfernen)
import { createHash } from 'node:crypto';

const STANDARD_SPALTEN = ['thema', 'frage', 'richtig', 'falsch1', 'falsch2', 'seite'];

function entferneFormatierung(text) {
  return text
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\/\/(.*?)\/\//g, '$1')
    .replace(/__(.*?)__/g, '$1')
    .replace(/''(.*?)''/g, '$1')
    .trim();
}

function parseSeite(zelle) {
  const m = zelle.match(/\[\[\s*([^|\]#]+)/);
  return m ? m[1].trim() : '';
}

function berechneId(frage) {
  return 'f' + createHash('sha1').update(frage).digest('hex').substring(0, 8);
}

// Zeile an Trennzeichen zerlegen, aber nicht innerhalb von [[...]]
function zerlege(zeile, trenner) {
  const zellen = [];
  let tiefe = 0, aktuell = '';
  for (let i = 0; i < zeile.length; i++) {
    if (zeile.startsWith('[[', i)) { tiefe++; aktuell += '[['; i++; continue; }
    if (zeile.startsWith(']]', i) && tiefe > 0) { tiefe--; aktuell += ']]'; i++; continue; }
    const c = zeile[i];
    if ((c === '|' || c === '^') && tiefe === 0) { zellen.push(aktuell); aktuell = ''; continue; }
    aktuell += c;
  }
  zellen.push(aktuell);
  // erstes Element ist der Teil vor dem führenden Trenner, letztes der nach dem schließenden
  zellen.shift();
  if (zellen.length && zellen[zellen.length - 1].trim() === '') zellen.pop();
  return zellen.map(z => z.trim());
}

function validiereFrage(f) {
  if (!f.frage || !f.richtig || !f.falsch[0] || !f.falsch[1]) return 'Frage, richtige oder falsche Antwort fehlt';
  if (f.falsch.includes(f.richtig)) return 'Richtige Antwort steht auch bei den falschen';
  if (f.frage.length > 200) return 'Frage zu lang (höchstens 200 Zeichen)';
  if ([f.richtig, ...f.falsch].some(a => a.length > 80)) return 'Antwort zu lang (höchstens 80 Zeichen)';
  return null;
}

export function leseSpielfragen(text) {
  const zeilen = String(text ?? '').split(/\r?\n/);
  const fragen = [], fehler = [];
  const ids = new Set();
  let spalten = STANDARD_SPALTEN;

  for (let i = 0; i < zeilen.length; i++) {
    const zeile = zeilen[i].trim();
    if (zeile.startsWith('^')) {
      const kopf = zerlege(zeile).map(s => s.toLowerCase().replace(/\s+/g, ''));
      spalten = STANDARD_SPALTEN.every(s => kopf.includes(s)) ? kopf : STANDARD_SPALTEN;
      continue;
    }
    if (!zeile.startsWith('|')) continue;
    const zellen = zerlege(zeile);
    const wert = name => zellen[spalten.indexOf(name)] ?? '';
    const f = {
      thema: entferneFormatierung(wert('thema')),
      frage: entferneFormatierung(wert('frage')),
      richtig: entferneFormatierung(wert('richtig')),
      falsch: [entferneFormatierung(wert('falsch1')), entferneFormatierung(wert('falsch2'))],
      seite: parseSeite(wert('seite')),
    };
    const grund = validiereFrage(f);
    if (grund) { fehler.push({ zeile: i + 1, grund }); continue; }
    f.id = berechneId(f.frage);
    if (ids.has(f.id)) { fehler.push({ zeile: i + 1, grund: 'doppelt' }); continue; }
    ids.add(f.id);
    fragen.push({ id: f.id, ...f });
  }
  return { fragen, fehler };
}

export function mischeAntworten(frage, zufall = Math.random) {
  const antworten = [frage.richtig, ...frage.falsch];
  for (let i = antworten.length - 1; i > 0; i--) {
    const j = Math.floor(zufall() * (i + 1));
    [antworten[i], antworten[j]] = [antworten[j], antworten[i]];
  }
  return { antworten, richtigIndex: antworten.indexOf(frage.richtig) };
}

export function waehleFrage(fragen, schonGestellt = new Set(), zufall = Math.random) {
  if (!fragen?.length) return null;
  const offen = fragen.filter(f => !schonGestellt.has(f.id));
  const auswahl = offen.length ? offen : fragen;
  return auswahl[Math.floor(zufall() * auswahl.length)];
}

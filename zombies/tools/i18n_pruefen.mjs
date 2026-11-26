// Sucht in Client-Dateien nach verbliebenen deutschen Oberflächentexten (Heuristik für die Zweisprachigkeit).
// Aufruf (aus zombies/): node tools/i18n_pruefen.mjs [datei …]   – ohne Angabe: client/*.mjs und client/index.html
// Treffer = Zeichenkette (JS-Literal bzw. HTML-Text/Attribut) mit Umlaut/ß oder häufigem deutschem Wort.
// Ausgenommen: Kommentare, Kartendaten, Zeilen mit dem Marker `i18n-ok`, Werte aus AUSNAHMEN (Ortsnamen, Schlüssel …)
// und – in Phase 1 – Dateien/Bereiche, die erst später übersetzt werden (DATEI_AUSNAHMEN).
import { readFileSync, readdirSync } from 'node:fs';
import { join, basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const WOERTER = ['der', 'die', 'das', 'und', 'nicht', 'mit', 'für', 'ist', 'ein', 'eine', 'einen', 'auf', 'zu', 'im', 'den', 'dem', 'von',
  'wird', 'kein', 'keine', 'noch', 'bitte', 'oder', 'auch', 'nur', 'hier', 'jetzt', 'schon', 'wenn', 'dann', 'alle', 'alles', 'sich', 'sind',
  'dein', 'deine', 'deinen', 'du', 'wir', 'ihr', 'aus', 'bei', 'nach', 'vom', 'zum', 'zur', 'einem', 'einer', 'dich', 'mich', 'ich',
  'Knopf', 'Taste', 'Spieler', 'Spiel', 'Schließen', 'Abbrechen', 'Laden', 'Fehler', 'Verbindung', 'Einstellungen', 'Mitspielen', 'Waffe',
  'Rucksack', 'Tausch', 'Tauschen', 'Gegenstand', 'An', 'Aus', 'Hoch', 'Mittel', 'Niedrig', 'Karte', 'Luftbild', 'Blass', 'Deckend',
  'Leer', 'leer', 'Benutzen', 'Wegwerfen', 'Ablegen', 'Ausruhen', 'Durchsuchen', 'Öffnen', 'Tür', 'Zombies', 'Ja', 'Nein',
  'Dein', 'Deine', 'Du', 'Kein', 'Keine', 'Noch', 'Bitte', 'Nicht', 'Alle', 'Alles', 'Hier', 'Jetzt', 'Mit', 'Ohne', 'ohne', 'hat', 'haben', 'kann', 'gibt', 'geht',
  'werden', 'Name', 'Figur', 'Schuss', 'Munition', 'Spielerliste', 'Nachricht', 'Lautstärke', 'Neu', 'neu', 'Zurück', 'Fahrzeug', 'Lager'];
const WORT_RE = new RegExp('(^|[^\\p{L}])(' + WOERTER.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')(?=$|[^\\p{L}])', 'u');
const UMLAUT_RE = /[äöüÄÖÜß]/;

// Werte, die deutsch aussehen dürfen (Ortsnamen, Eigennamen, interne Schlüssel, Lizenznamen)
export const AUSNAHMEN = [
  /Oberbayern|Geretsried|Königsdorf|Kochel|Andermatt|Wolfratshausen|Isar|Loisach|Bad Tölz|Gelting|Münsing|Bayern|München/,
  /^[\p{L}_]+$/u,                // einzelnes Wort ohne Leerzeichen → meist Schlüssel/Bezeichner (z. B. 'tür', 'schlüssel'); UI-Wörter erkennt WORT_RE nicht hier
];
// Einzelwörter, die trotz /^\w+$/ als UI-Text gelten, wenn sie großgeschrieben sind und im WORT_RE stehen
const EINZEL_UI = new Set(['Schließen', 'Abbrechen', 'Mitspielen', 'Einstellungen', 'Rucksack', 'Tauschen', 'Benutzen', 'Wegwerfen', 'Ablegen',
  'Ausruhen', 'Durchsuchen', 'Öffnen', 'Hoch', 'Mittel', 'Niedrig', 'Luftbild', 'Blass', 'Deckend', 'Leer', 'Ja', 'Nein']);

// Phase 1: Dateien, die nicht geprüft werden (Weltdaten, Backend, Servertexte erst Phase 2/3)
export const DATEI_AUSNAHMEN = new Set([
  'verwaltung.html', 'osmwelt.mjs', 'innen.mjs', 'innen_fein.mjs', 'innen_fein_bild.mjs', 'innen_gross.mjs', 'stuetzpunkt.mjs', 'laendlich.mjs',
  'levelkatalog.mjs', 'zombiefiguren.mjs', 'sw.js', 'diagnose.mjs',
]);

function istDeutsch(s) {
  const t = s.replace(/\$\{[^}]*\}/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ').trim();
  if (!t || !/\p{L}{2}/u.test(t)) return false;
  if (/^[\p{L}_]+$/u.test(t)) return EINZEL_UI.has(t);
  if (/[#.]?[\w-]+\s*\{[^}]*:[^}]*;/.test(s) || /@media|@keyframes/.test(s)) return false;   // CSS-Block
  if (AUSNAHMEN.slice(0, -1).some(re => re.test(t)) && !WORT_RE.test(t.replace(AUSNAHMEN[0], ''))) return false;
  if (/^[a-z0-9_.\-/#:[\]=>"' ,()*]+$/.test(t)) return false;     // CSS-Selektoren, Pfade, Schlüssel
  return UMLAUT_RE.test(t) || WORT_RE.test(t);
}

// JS: String-Literale (', ", `) ohne Kommentare und Regex-Literale finden; Ausdrücke in `${…}` werden rekursiv als Code gelesen
export function jsLiterale(quelle) {
  const aus = [];
  const n = quelle.length;
  let i = 0, zeile = 1;
  const zeileBis = ende => { for (; i < ende; i++) if (quelle[i] === '\n') zeile++; };
  // liest Code ab i; bei bisKlammer endet er an der passenden schließenden geschweiften Klammer (i steht danach dahinter)
  function code(bisKlammer) {
    let tiefe = 0, letztes = '';
    const regexMoeglich = () => !letztes || /[(,=:[!&|?{};+\-*%<>~^]$/.test(letztes) || /(^|\W)(return|typeof|case|in|of|void|throw)$/.test(letztes);
    while (i < n) {
      const c = quelle[i], d = quelle[i + 1];
      if (c === '\n') { zeile++; i++; continue; }
      if (c === '/' && d === '/') { while (i < n && quelle[i] !== '\n') i++; continue; }
      if (c === '/' && d === '*') { const e = quelle.indexOf('*/', i + 2); zeileBis(e < 0 ? n : e + 2); continue; }
      if (c === '\'' || c === '"') {
        const z0 = zeile; let wert = ''; i++;
        while (i < n && quelle[i] !== c && quelle[i] !== '\n') { if (quelle[i] === '\\') { wert += quelle.slice(i, i + 2); i += 2; } else wert += quelle[i++]; }
        i++; aus.push({ wert, zeile: z0 }); letztes = 'x'; continue;
      }
      if (c === '`') { vorlage(); letztes = 'x'; continue; }
      if (c === '/' && regexMoeglich()) {
        i++; let klasse = false;
        while (i < n && quelle[i] !== '\n') {
          const x = quelle[i];
          if (x === '\\') { i += 2; continue; }
          if (x === '[') klasse = true; else if (x === ']') klasse = false; else if (x === '/' && !klasse) break;
          i++;
        }
        i++; letztes = 'x'; continue;
      }
      if (c === '{') tiefe++;
      if (c === '}') { if (bisKlammer && tiefe === 0) { i++; return; } tiefe--; }
      if (!/\s/.test(c)) letztes = (letztes + c).slice(-8);
      i++;
    }
  }
  function vorlage() {
    const z0 = zeile; let wert = ''; i++;
    while (i < n && quelle[i] !== '`') {
      const x = quelle[i];
      if (x === '\\') { wert += quelle.slice(i, i + 2); i += 2; continue; }
      if (x === '$' && quelle[i + 1] === '{') { i += 2; wert += '${}'; code(true); continue; }
      if (x === '\n') zeile++;
      wert += x; i++;
    }
    i++; aus.push({ wert, zeile: z0 });
  }
  code(false);
  return aus;
}

// HTML: Text zwischen Tags und Attribute title/placeholder/aria-label/alt (ohne <script>-Inhalt; Skripte werden als JS geprüft)
export function htmlTexte(quelle) {
  const aus = [];
  const zeileVon = pos => quelle.slice(0, pos).split('\n').length;
  const ohneKommentar = quelle.replace(/<!--[\s\S]*?-->/g, m => m.replace(/[^\n]/g, ' '));
  const skripte = [];
  ohneKommentar.replace(/<script\b[^>]*>([\s\S]*?)<\/script>/g, (m, inhalt, pos) => { skripte.push([pos, pos + m.length, inhalt, pos + m.indexOf(inhalt)]); return m; });
  const inSkript = pos => skripte.some(([a, b]) => pos >= a && pos < b);
  for (const m of ohneKommentar.matchAll(/>([^<]+)</g)) {
    if (inSkript(m.index)) continue;
    const t = m[1].replace(/\s+/g, ' ').trim();
    if (t) aus.push({ wert: t, zeile: zeileVon(m.index) });
  }
  for (const m of ohneKommentar.matchAll(/\s(title|placeholder|aria-label|alt)="([^"]*)"/g)) {
    if (!inSkript(m.index)) aus.push({ wert: m[2], zeile: zeileVon(m.index) });
  }
  for (const [, , inhalt, pos] of skripte) {
    const z0 = zeileVon(pos) - 1;
    for (const l of jsLiterale(inhalt)) aus.push({ wert: l.wert, zeile: l.zeile + z0 });
  }
  return aus;
}

export function pruefeQuelle(quelle, datei) {
  const zeilen = quelle.split('\n');
  const liste = datei.endsWith('.html') ? htmlTexte(quelle) : jsLiterale(quelle);
  return liste
    .filter(l => !/i18n-ok|console\.(log|warn|error|info|debug)/.test(zeilen[l.zeile - 1] || ''))
    .filter(l => istDeutsch(l.wert))
    .map(l => ({ datei, zeile: l.zeile, wert: l.wert.length > 90 ? l.wert.slice(0, 87) + '…' : l.wert }));
}

export function pruefeClient(dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'client')) {
  const dateien = readdirSync(dir).filter(f => (f.endsWith('.mjs') || f === 'index.html') && !DATEI_AUSNAHMEN.has(f));
  return dateien.flatMap(f => pruefeQuelle(readFileSync(join(dir, f), 'utf8'), f));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  const treffer = args.length ? args.flatMap(p => pruefeQuelle(readFileSync(p, 'utf8'), basename(p))) : pruefeClient();
  for (const t of treffer) console.log(`${t.datei}:${t.zeile}: ${t.wert}`);
  console.log(`${treffer.length} Treffer`);
  process.exit(treffer.length ? 1 : 0);
}

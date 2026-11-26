// Zweisprachigkeit (Deutsch/Englisch) für Client und Server – ohne Framework, ohne Build.
// t('gruppe.schluessel', { name: 'Sepp', n: 3 }) → Text in der aktuellen Sprache.
//   Platzhalter: {name}; einfache Mehrzahl: {n|Zombie|Zombies} (Einzahl, wenn werte.n === 1, sonst Mehrzahl).
//   Fehlt ein Schlüssel in der Sprache, gilt Deutsch, sonst der Schlüssel selbst.
// Sprache: im Browser aus localStorage 'zob_sprache' oder navigator.languages (erste Sprache beginnt mit „de“ → de, sonst en);
//   im Node-Server immer 'de', solange niemand setzeSprache() ruft (Servermeldungen bleiben in Phase 1 deutsch).
// Servermeldungen (ab Phase 2): { k: 'schluessel', w: { … } } – der Client übersetzt sie mit textAus(m); alte Form { text } geht weiter.
// DOM: Elemente mit data-i18n="schluessel" (textContent), data-i18n-html (innerHTML), data-i18n-title, data-i18n-placeholder,
//   data-i18n-aria-label übersetzt uebersetzeSeite(); nach setzeSprache() feuert das Ereignis 'sprachwechsel' (window) und beiSprachwechsel-Rückrufe.
import de from './i18n/de.mjs';
import en from './i18n/en.mjs';

export const SPRACHEN = ['de', 'en'];
export const SPEICHER_SCHLUESSEL = 'zob_sprache';

// verschachtelte Gruppen → flache Tabelle 'gruppe.schluessel'
export function flach(obj, vorne = '', aus = {}) {
  for (const [k, v] of Object.entries(obj)) {
    const s = vorne ? `${vorne}.${k}` : k;
    if (v && typeof v === 'object') flach(v, s, aus); else aus[s] = v;
  }
  return aus;
}
const TABELLEN = { de: flach(de), en: flach(en) };

// Sprachwahl aus der Browser-Liste: erste bevorzugte Sprache beginnt mit „de“ → Deutsch, sonst Englisch
export function spracheAus(liste) {
  const erste = (Array.isArray(liste) ? liste : [liste]).find(l => typeof l === 'string' && l);
  return erste && /^de(\b|[-_])/i.test(erste) ? 'de' : 'en';
}

// Node (Server, Tests – auch mit DOM-Attrappe): immer Deutsch, nichts am DOM; echter Browser/Worker sonst
const imNode = typeof process !== 'undefined' && !!process.versions?.node;
const imBrowser = !imNode && typeof window !== 'undefined' && typeof document !== 'undefined' && typeof document.querySelectorAll === 'function';
function gemerkt() {
  try { const s = globalThis.localStorage?.getItem(SPEICHER_SCHLUESSEL); return SPRACHEN.includes(s) ? s : null; } catch { return null; }
}
function startSprache() {
  if (!imBrowser) return 'de';
  return gemerkt() ?? spracheAus(navigator.languages?.length ? navigator.languages : [navigator.language]);
}

let aktuell = startSprache();
const rueckrufe = new Set();

export const sprache = () => aktuell;
export const istDeutsch = () => aktuell === 'de';

export function setzeSprache(s, { merken = true } = {}) {
  if (!SPRACHEN.includes(s)) return false;
  if (merken) { try { globalThis.localStorage?.setItem(SPEICHER_SCHLUESSEL, s); } catch { /* privat/gesperrt */ } }
  if (s === aktuell) return false;
  aktuell = s;
  if (imBrowser) {
    document.documentElement.lang = s;
    uebersetzeSeite();
    try { window.dispatchEvent(new CustomEvent('sprachwechsel', { detail: { sprache: s } })); } catch { /* alte Browser */ }
  }
  for (const f of rueckrufe) { try { f(s); } catch (e) { console.error(e); } }
  return true;
}
export function beiSprachwechsel(f) { rueckrufe.add(f); return () => rueckrufe.delete(f); }

// Platzhalter und Mehrzahl einsetzen
export function einsetzen(text, werte = {}) {
  return String(text).replace(/\{(\w+)(?:\|([^|}]*)\|([^}]*))?\}/g, (m, name, eins, mehr) => {
    if (eins !== undefined) return Number(werte[name]) === 1 ? eins : mehr;
    return name in werte && werte[name] != null ? String(werte[name]) : m;
  });
}

export function hat(schluessel, s = aktuell) { return schluessel in TABELLEN[s]; }

export function t(schluessel, werte) {
  const roh = TABELLEN[aktuell][schluessel] ?? TABELLEN.de[schluessel];
  if (roh === undefined) return schluessel;
  return werte ? einsetzen(roh, werte) : roh;
}
// in einer bestimmten Sprache (z. B. Server für einen Spieler mit bekannter Sprache)
export function tIn(s, schluessel, werte) {
  const roh = (TABELLEN[s] ?? TABELLEN.de)[schluessel] ?? TABELLEN.de[schluessel];
  if (roh === undefined) return schluessel;
  return werte ? einsetzen(roh, werte) : roh;
}

// Servernachricht → Anzeigetext: neue Form { k, w } (Werte, die selbst Schlüssel sind, als { k } verschachtelt), alte Form { text }
export function textAus(m) {
  if (m == null) return '';
  if (typeof m === 'string') return m;
  if (m.k) {
    const w = {};
    for (const [n, v] of Object.entries(m.w ?? {})) w[n] = v && typeof v === 'object' && v.k ? textAus(v) : v;
    return t(m.k, w);
  }
  return m.text ?? '';
}

// statische Texte im DOM (index.html und eingefügte Fenster)
const ATTRIBUTE = [['data-i18n-title', 'title'], ['data-i18n-placeholder', 'placeholder'], ['data-i18n-aria-label', 'aria-label']];
export function uebersetzeSeite(wurzel = imBrowser ? document : null) {
  if (!wurzel?.querySelectorAll) return;
  for (const el of wurzel.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  for (const el of wurzel.querySelectorAll('[data-i18n-html]')) el.innerHTML = t(el.dataset.i18nHtml);
  for (const [a, ziel] of ATTRIBUTE) for (const el of wurzel.querySelectorAll(`[${a}]`)) el.setAttribute(ziel, t(el.getAttribute(a)));
}

// Umschalter (Knöpfe DE/EN) in einen Behälter setzen; markiert die aktive Sprache
export function sprachUmschalter(behaelter) {
  if (!behaelter) return;
  behaelter.classList.add('sprachwahl');
  behaelter.setAttribute('role', 'group');
  behaelter.setAttribute('data-i18n-aria-label', 'allgemein.sprache');
  behaelter.setAttribute('aria-label', t('allgemein.sprache'));
  behaelter.innerHTML = SPRACHEN.map(s => `<button type="button" data-sprache="${s}" lang="${s}">${s === 'de' ? '🇩🇪 Deutsch' : '🇬🇧 English'}</button>`).join('');
  const markieren = () => { for (const b of behaelter.querySelectorAll('button')) b.classList.toggle('an', b.dataset.sprache === aktuell); };
  for (const b of behaelter.querySelectorAll('button')) b.addEventListener('click', () => setzeSprache(b.dataset.sprache));
  beiSprachwechsel(markieren);
  markieren();
}

// beim Laden sofort: Seitensprache und statische Texte (Module laufen erst nach dem Einlesen des Dokuments)
if (imBrowser) { document.documentElement.lang = aktuell; uebersetzeSeite(); }

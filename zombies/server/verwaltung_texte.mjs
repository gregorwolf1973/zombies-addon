// Texte der Verwaltungsseite als klassisches Skript (verwaltung.html lädt es vor allen anderen Skripten):
// Tabellen vw.* und ding.* aus client/i18n/de.mjs + en.mjs und die Übersetzungsschicht aus client/i18n_muster.mjs.
// Die Sprache wählt die Seite selbst wie das Spiel (client/i18n.mjs): gemerkt in localStorage „zob_sprache“, sonst nach Browser.
// Seite: window.vwSprache ('de'|'en'), vwT(schluessel, werte), vwText(deutscherText) → übersetzt oder unverändert, vwSpracheSetzen(s).
import de from '../client/i18n/de.mjs';
import en from '../client/i18n/en.mjs';
import { flach, spracheAus, SPRACHEN, SPEICHER_SCHLUESSEL } from '../client/i18n.mjs';
import { vwUebersetzer } from '../client/i18n_muster.mjs';

export const VW_PRAEFIXE = ['vw.', 'ding.'];
const auswahl = tab => Object.fromEntries(Object.entries(flach(tab)).filter(([k]) => VW_PRAEFIXE.some(p => k.startsWith(p))));
export const vwTabellen = () => ({ de: auswahl(de), en: auswahl(en) });

let skript = null;
export function verwaltungTexteSkript() {
  if (skript) return skript;
  const { de: d, en: e } = vwTabellen();
  skript = `// erzeugt aus client/i18n/de.mjs, en.mjs und client/i18n_muster.mjs (server/verwaltung_texte.mjs)
(function () {
  var DE = ${JSON.stringify(d)};
  var TAB = { de: DE, en: ${JSON.stringify(e)} };
  var SPRACHEN = ${JSON.stringify(SPRACHEN)}, SCHLUESSEL = ${JSON.stringify(SPEICHER_SCHLUESSEL)};
  var spracheAus = ${spracheAus.toString()};
  var vwUebersetzer = ${vwUebersetzer.toString()};
  var sp = null;
  try { var g = localStorage.getItem(SCHLUESSEL); if (SPRACHEN.indexOf(g) >= 0) sp = g; } catch (e) { /* gesperrt */ }
  if (!sp) sp = spracheAus(navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language]);
  var u = vwUebersetzer(DE, TAB[sp] || DE);
  window.vwSprache = sp;
  window.vwT = u.t;
  window.vwText = function (s) { if (sp === 'de') return s; var z = u.text(s); return z === null ? s : z; };
  window.vwSpracheSetzen = function (s) {
    if (SPRACHEN.indexOf(s) < 0) return;
    try { localStorage.setItem(SCHLUESSEL, s); } catch (e) { /* gesperrt */ }
    if (s !== sp) location.reload();   // die Seite baut ihre Texte beim Laden: neu laden statt umschreiben
  };
  document.documentElement.lang = sp;
  function umschalter() {
    var b = document.getElementById('vwSprachwahl');
    if (!b || b.firstChild) return;
    SPRACHEN.forEach(function (s) {
      var k = document.createElement('button');
      k.type = 'button'; k.lang = s; k.textContent = s === 'de' ? '🇩🇪 Deutsch' : '🇬🇧 English';
      k.className = s === sp ? 'an' : ''; k.setAttribute('aria-pressed', s === sp ? 'true' : 'false');
      k.addEventListener('click', function () { window.vwSpracheSetzen(s); });
      b.appendChild(k);
    });
  }
  if (sp === 'de') { document.addEventListener('DOMContentLoaded', umschalter); return; }
  // andere Sprache: alle Skripte der Seite bauen erst auf Deutsch (sie suchen teils Elemente über ihren Text);
  // nach dem Einlesen wird alles übersetzt, danach jede Änderung sofort. Bis dahin bleibt die Seite unsichtbar.
  var cl = document.documentElement.classList;
  cl.add('vw-uebersetzen');
  var st = document.createElement('style'); st.textContent = 'html.vw-uebersetzen body{visibility:hidden}';
  document.head.appendChild(st);
  var zeigen = function () { cl.remove('vw-uebersetzen'); };
  setTimeout(zeigen, 4000);   // Sicherheitsnetz
  ['alert', 'confirm', 'prompt'].forEach(function (f) {
    var o = window[f];
    if (typeof o === 'function') window[f] = function (m) { var a = [].slice.call(arguments); a[0] = window.vwText(String(m == null ? '' : m)); return o.apply(window, a); };
  });
  document.addEventListener('DOMContentLoaded', function () {
    umschalter();
    try { u.baum(document.documentElement); u.beobachten(document.documentElement); } finally { zeigen(); }
  });
})();
`;
  return skript;
}

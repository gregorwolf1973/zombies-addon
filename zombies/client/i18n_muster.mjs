// Übersetzung fertiger deutscher Texte für die Verwaltungsseite (client/verwaltung.html).
// Die Seite ist groß und baut viel per Skript (alte, klassische Skripte); statt jede Stelle umzuschreiben, übersetzt
// diese Schicht die angezeigten deutschen Texte über ihren Wortlaut in die Zielsprache:
//   - exakter Wortlaut: de-Text (Leerraum zusammengefasst) → Text der Zielsprache
//   - Muster mit Platzhaltern: de „{n} Dateien gewählt (zufällig)“ erkennt „3 Dateien gewählt (zufällig)“ → en „3 files selected (random)“;
//     erkannte Werte werden selbst nachgeschlagen (z. B. Fehlermeldungen des Servers) und Dezimalkommas werden zu Punkten
//   - reine Zahlen mit Einheit („3,5 min“, „×1,5“): nur Dezimalkomma → Punkt
// Quelle sind die Abschnitte vw.* (und ding.*) aus client/i18n/de.mjs und en.mjs; der Server liefert sie mit dieser Funktion
// als klassisches Skript aus (server/verwaltung_texte.mjs). Deshalb ist vwUebersetzer in sich geschlossen (keine Verweise nach außen).
export function vwUebersetzer(de, ziel) {
  var norm = function (s) { return String(s).replace(/\s+/g, ' ').trim(); };
  var esc = function (s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); };
  function einsetzen(text, werte) {
    return String(text).replace(/\{(\w+)(?:\|([^|}]*)\|([^}]*))?\}/g, function (m, name, eins, mehr) {
      if (eins !== undefined) return Number(werte[name]) === 1 ? eins : mehr;
      return name in werte && werte[name] != null ? String(werte[name]) : m;
    });
  }
  var exakt = new Map(), muster = [];
  Object.keys(de).forEach(function (k) {
    var d = norm(de[k]), z = ziel[k];
    if (typeof z !== 'string' || !d) return;
    if (!/\{\w+(\|[^}]*)?\}/.test(d)) { if (!exakt.has(d)) exakt.set(d, z); return; }
    var namen = [], teile = d.split(/(\{\w+(?:\|[^}]*)?\})/), quelle = '', fest = 0;
    teile.forEach(function (t) {
      var m = /^\{(\w+)(?:\|([^|}]*)\|([^}]*))?\}$/.exec(t);
      if (!m) { quelle += esc(t); fest += t.replace(/\s/g, '').length; return; }
      if (m[2] !== undefined) { quelle += '(?:' + esc(m[2]) + '|' + esc(m[3]) + ')'; return; }
      namen.push(m[1]); quelle += '(.+?)';
    });
    if (fest < 1) return;   // ohne festen Text wäre das Muster beliebig
    // zweimal: knapp (erste passende Stelle) und gierig (letzte) – „Musik (je Level, Lager) (10)“ braucht die letzte Klammer
    muster.push({ re: new RegExp('^' + quelle + '$'), gierig: new RegExp('^' + quelle.replace(/\(\.\+\?\)/g, '(.+)') + '$'), namen: namen, ziel: z, fest: fest });
  });
  muster.sort(function (a, b) { return b.fest - a.fest; });   // genauere Muster zuerst
  var EINHEIT = /(km\/h|°\/s|min|ms|KB|MB|px|Wh|h|s|m)(?![\p{L}])/gu;
  var komma = function (s) { return s.replace(/(\d),(\d)/g, '$1.$2'); };
  var nurZahl = function (s) { return /\d/.test(s) && !/\p{L}/u.test(s.replace(EINHEIT, '')); };
  function wert(name, v) {
    if (name === 'orte') {   // Kartennamen „A und B“ / „A + B“: Teile einzeln
      return v.split(/( und | \+ )/).map(function (x) { return x === ' und ' ? ' and ' : x === ' + ' ? x : (exakt.get(x) !== undefined ? exakt.get(x) : x); }).join('');
    }
    var t = text(v);
    return t !== null ? t : komma(v);
  }
  var tiefe = 0;
  var ausgewogen = function (v) { var t = 0; for (var i = 0; i < v.length; i++) { var c = v[i]; if (c === '(') t++; else if (c === ')' && --t < 0) return false; } return t === 0; };
  // Text (ein Textknoten, ein Attribut) → übersetzt oder null (keine Übersetzung bekannt)
  function text(s) {
    if (typeof s !== 'string' || !/\S/.test(s)) return null;
    var vorn = /^\s*/.exec(s)[0], hinten = /\s*$/.exec(s)[0], n = norm(s);
    var z = exakt.get(n);
    if (z === undefined && tiefe < 3) {
      for (var i = 0; i < muster.length && z === undefined; i++) {
        var m = muster[i].re.exec(n);
        if (!m) continue;
        if (!m.slice(1).every(ausgewogen)) { var g = muster[i].gierig.exec(n); if (g && g.slice(1).every(ausgewogen)) m = g; }
        var w = {};
        tiefe++;
        try { muster[i].namen.forEach(function (name, j) { w[name] = wert(name, m[j + 1]); }); } finally { tiefe--; }
        z = einsetzen(muster[i].ziel, w);
        if (z === n) z = undefined;   // Muster passte, aber nichts davon ist bekannt: weitersuchen
      }
    }
    if (z === undefined && nurZahl(n) && /\d,\d/.test(n)) z = komma(n);
    if (z === undefined && tiefe < 3) {   // Zeichen vorn („🔫 Waffen“, „💧 Wasser“): Rest übersetzen
      var sym = /^([^\p{L}\d\s]+)\s+(\S.*)$/u.exec(n);
      if (sym) { tiefe++; try { var r = text(sym[2]); if (r !== null) z = sym[1] + ' ' + r; } finally { tiefe--; } }
    }
    return z === undefined ? null : vorn + z + hinten;
  }
  function t(schluessel, werte) {
    var roh = ziel[schluessel] !== undefined ? ziel[schluessel] : de[schluessel];
    if (roh === undefined) return schluessel;
    return werte ? einsetzen(roh, werte) : roh;
  }
  // ---------- DOM ----------
  var ATTR = ['title', 'placeholder', 'aria-label', 'alt'];
  var AUSLASSEN = { SCRIPT: 1, STYLE: 1, TEXTAREA: 1, CODE: 1 };
  function knoten(n) {
    if (n.nodeType === 3) {
      var p = n.parentNode;
      if (p && (AUSLASSEN[p.nodeName] || (p.closest && p.closest('[data-vw-nicht]')))) return;
      var neu = text(n.nodeValue);
      if (neu !== null && neu !== n.nodeValue) n.nodeValue = neu;
    } else if (n.nodeType === 1) {
      if (AUSLASSEN[n.nodeName] || (n.closest && n.closest('[data-vw-nicht]'))) return;
      attribute(n);
    }
  }
  function attribute(e) {
    for (var i = 0; i < ATTR.length; i++) {
      var a = e.getAttribute(ATTR[i]);
      if (a === null) continue;
      var neu = text(a);
      if (neu !== null && neu !== a) e.setAttribute(ATTR[i], neu);
    }
  }
  function baum(w) {
    if (!w) return;
    if (w.nodeType === 3) { knoten(w); return; }
    if (w.nodeType !== 1 && w.nodeType !== 9 && w.nodeType !== 11) return;
    if (w.nodeType === 1) { if (AUSLASSEN[w.nodeName] || w.hasAttribute('data-vw-nicht')) return; attribute(w); }
    var doc = w.ownerDocument || w, it = doc.createTreeWalker(w, 5 /* Elemente + Text */, null), n;
    while ((n = it.nextNode())) {
      if (n.nodeType === 1 && (AUSLASSEN[n.nodeName] || n.hasAttribute('data-vw-nicht'))) continue;   // Inhalt wird beim Textknoten übersprungen
      knoten(n);
    }
  }
  function beobachten(wurzel) {
    var mo = new MutationObserver(function (liste) {
      for (var i = 0; i < liste.length; i++) {
        var r = liste[i];
        if (r.type === 'childList') for (var j = 0; j < r.addedNodes.length; j++) baum(r.addedNodes[j]);
        else if (r.type === 'characterData') knoten(r.target);
        else if (r.type === 'attributes') attribute(r.target);
      }
    });
    mo.observe(wurzel, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTR });
    return mo;
  }
  return { text: text, t: t, baum: baum, beobachten: beobachten, anzahl: { exakt: exakt.size, muster: muster.length } };
}

// Spendenknöpfe: die beiden Adressen stehen nur hier (kein Tracking, keine externen Skripte oder Bilder).
import { t as tr } from './i18n.mjs';
export const SPENDEN_LINKS = {
  bmc: { url: 'https://buymeacoffee.com/gregorwolf1973', text: '☕ Buy me a coffee' },
  lp: { url: 'https://liberapay.com/Gregor_Wolf/donate', text: '💛 Liberapay' },
};

// füllt jeden Container mit data-spenden unterhalb von wurzel mit Hinweiszeile und beiden Knöpfen
export function spendenFuellen(wurzel = document) {
  for (const c of wurzel.querySelectorAll('[data-spenden]')) {
    if (c.childElementCount) continue;
    const t = document.createElement('span'); t.className = 'spenden-text'; t.textContent = tr('spenden.frage');
    c.append(t);
    for (const [k, l] of Object.entries(SPENDEN_LINKS)) {
      const a = document.createElement('a');
      a.className = 'spende ' + k; a.href = l.url; a.target = '_blank'; a.rel = 'noopener'; a.textContent = l.text;
      c.append(a);
    }
  }
}

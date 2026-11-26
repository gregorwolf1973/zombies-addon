// Impressum/Datenschutz: einfache Auszeichnung (Absätze, # Überschriften, **fett**, [Text](https://…)) → sicheres HTML.
// Zuerst wird alles HTML-escaped, erst danach die Auszeichnung ersetzt; Links nur mit http(s)/mailto.
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

function inline(zeile) {
  let t = esc(zeile);
  t = t.replace(/\[([^\]\n]+)\]\(((?:https?:\/\/|mailto:)[^\s()]+)\)/gi, (m, text, url) => `<a href="${url}" rel="noopener noreferrer">${text}</a>`);
  t = t.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  return t;
}

export function rechtstextHtml(text) {
  const bloecke = String(text ?? '').replace(/\r\n?/g, '\n').split(/\n{2,}/);
  const aus = [];
  for (const b of bloecke) {
    const zeilen = b.split('\n').filter(z => z.trim() !== '');
    if (!zeilen.length) continue;
    let absatz = [];
    const leeren = () => { if (absatz.length) { aus.push(`<p>${absatz.map(inline).join('<br>')}</p>`); absatz = []; } };
    for (const z of zeilen) {
      const h = /^(#{1,3})\s+(.+)$/.exec(z.trim());
      if (h) { leeren(); aus.push(`<h${h[1].length + 1}>${inline(h[2])}</h${h[1].length + 1}>`); } else absatz.push(z.trim());
    }
    leeren();
  }
  return aus.join('\n');
}

export function rechtsseite(titel, text) {
  return `<!doctype html>
<html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex"><title>${esc(titel)} – Zombies in Oberbayern</title>
<style>
body{margin:0;background:#101810;color:#dfe8d8;font:16px/1.6 system-ui,sans-serif}
main{max-width:46rem;margin:0 auto;padding:1.5rem 1rem 3rem}
h1,h2,h3,h4{color:#cfe8b0;line-height:1.25}
a{color:#9fd47a}
.zurueck{display:inline-block;margin-bottom:1rem}
</style></head><body><main>
<a class="zurueck" href="./">&larr; Zurück zum Spiel</a>
<h1>${esc(titel)}</h1>
${rechtstextHtml(text)}
</main></body></html>`;
}

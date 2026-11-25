// Draufsichten der selbst gebauten Panzermodelle rendern (Headless-Chrome per CDP, three.js aus ../glb_draufsicht/lib, siehe LIESMICH.txt).
// Aufruf: node tools/panzer_modell/render.mjs <cdp-port> <ausgabe-ordner> [modell …]
// Schreibt je Modell <modell>_wanne.png, <modell>_turm.png (4-fach überabgetastet), <modell>_alles.png (Ansicht) und masse.json.
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { join, extname, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const [port = '9711', aus = 'panzer_bilder', ...modelle] = process.argv.slice(2);
const welche = modelle.length ? modelle : ['puma', 'leopard'];
const wurzel = resolve(dirname(fileURLToPath(import.meta.url)), '..');   // zombies/tools
mkdirSync(aus, { recursive: true });

const typen = { '.html': 'text/html', '.mjs': 'text/javascript', '.js': 'text/javascript' };
const server = createServer((req, res) => {
  const p = join(wurzel, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!p.startsWith(wurzel) || !existsSync(p) || !statSync(p).isFile()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': typen[extname(p)] || 'application/octet-stream' }); res.end(readFileSync(p));
});
await new Promise(ok => server.listen(0, '127.0.0.1', ok));
const basis = `http://127.0.0.1:${server.address().port}/panzer_modell/seite.html`;

async function rendere(url) {
  const ziel = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(ziel.webSocketDebuggerUrl);
  let id = 0; const warte = new Map();
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && warte.has(m.id)) { warte.get(m.id)(m); warte.delete(m.id); } };
  await new Promise(r => ws.onopen = r);
  const rufe = (method, params = {}) => new Promise(r => { const i = ++id; warte.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  await rufe('Page.navigate', { url });
  let text = '';
  for (let i = 0; i < 240; i++) {
    await new Promise(r => setTimeout(r, 500));
    const m = await rufe('Runtime.evaluate', { expression: "document.getElementById('out')?.textContent || ''", returnByValue: true });
    text = m.result?.result?.value || '';
    if (text && text !== 'LAEUFT') break;
  }
  ws.close();
  await fetch(`http://127.0.0.1:${port}/json/close/${ziel.id}`);
  if (!text.startsWith('BILD ')) throw new Error(url + '\n' + text.slice(0, 2000));
  const [kopf, daten] = text.split('\n');
  return { info: JSON.parse(kopf.slice(5)), png: Buffer.from(daten.replace(/^data:image\/png;base64,/, ''), 'base64') };
}

const masse = existsSync(join(aus, 'masse.json')) ? JSON.parse(readFileSync(join(aus, 'masse.json'), 'utf8')) : {};
for (const modell of welche) {
  masse[modell] = {};
  for (const teil of ['wanne', 'turm', 'alles']) {
    const { info, png } = await rendere(`${basis}?modell=${modell}&teil=${teil}&ss=4${teil === 'alles' ? '&turmwinkel=25' : ''}`);
    writeFileSync(join(aus, `${modell}_${teil}.png`), png);
    masse[modell][teil] = info;
    const r = info.rahmen;
    console.log(modell, teil, `${info.w}×${info.h} px`, teil === 'turm' ? `Drehpunkt im Bild (${(-r.x0 * info.px).toFixed(1)}, ${(-r.z0 * info.px).toFixed(1)}) px, Mündung ${r.x1} m` : '');
  }
}
writeFileSync(join(aus, 'masse.json'), JSON.stringify(masse, null, 1));
server.close();
process.exit(0);

// node cdp.mjs <url> <ausgabe-datei>: Seite in laufendem Headless-Chrome (Port 9333) öffnen, warten bis #out fertig, Text speichern
import { writeFileSync } from 'node:fs';
const [url, datei] = process.argv.slice(2);
const ziel = await (await fetch('http://127.0.0.1:9333/json/new?about:blank', { method: 'PUT' })).json();
const ws = new WebSocket(ziel.webSocketDebuggerUrl);
let id = 0; const warte = new Map();
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && warte.has(m.id)) { warte.get(m.id)(m); warte.delete(m.id); } };
await new Promise(r => ws.onopen = r);
const rufe = (method, params = {}) => new Promise(r => { const i = ++id; warte.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
await rufe('Page.navigate', { url });
let text = '';
for (let i = 0; i < 120; i++) {
  await new Promise(r => setTimeout(r, 500));
  const m = await rufe('Runtime.evaluate', { expression: "document.getElementById('out')?.textContent || ''", returnByValue: true });
  text = m.result?.result?.value || '';
  if (text && text !== 'LAEUFT') break;
}
writeFileSync(datei, text);
console.log(text.slice(0, 3000));
await fetch('http://127.0.0.1:9333/json/close/' + ziel.id);
process.exit(0);

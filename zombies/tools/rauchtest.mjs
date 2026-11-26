// Rauchtest: lädt das Spiel in einem Headless-Chrome (per CDP), wartet auf den Spielstart und meldet Konsolenfehler.
// Aufruf: node tools/rauchtest.mjs <cdp-port> <spiel-url> <bild.png>   (Spielername: Umgebungsvariable ZOMBIES_NAME, Vorgabe „Rauchtest“)
// Chrome vorher starten: google-chrome --headless=new --remote-debugging-port=<cdp-port> --user-data-dir=<tmp> --window-size=1400,900 about:blank
// Server und Chrome immer mit Speicherdeckel starten (systemd-run --user --scope -p MemoryMax=4G -p MemorySwapMax=0 …).
import { writeFileSync } from 'node:fs';

const [port = '9611', url = 'http://127.0.0.1:2611/', bild = 'rauchtest.png'] = process.argv.slice(2);
const warte = ms => new Promise(r => setTimeout(r, ms));

let ziel;
for (let i = 0; i < 30 && !ziel; i++) {
  try { ziel = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find(t => t.type === 'page'); } catch { /* Chrome startet noch */ }
  if (!ziel) await warte(500);
}
if (!ziel) { console.log('Fehler: kein Chrome auf Port', port); process.exit(2); }

const ws = new WebSocket(ziel.webSocketDebuggerUrl);
await new Promise((ok, nein) => { ws.onopen = ok; ws.onerror = nein; });
let nr = 0;
const offen = new Map(), fehler = [];
ws.onmessage = ev => {
  const m = JSON.parse(ev.data);
  if (m.id && offen.has(m.id)) { offen.get(m.id)(m); offen.delete(m.id); return; }
  if (m.method === 'Runtime.exceptionThrown') fehler.push('Ausnahme: ' + (m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text));
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') fehler.push('Konsole: ' + m.params.args.map(a => a.value ?? a.description ?? '').join(' '));
  if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') fehler.push('Log: ' + m.params.entry.text + ' ' + (m.params.entry.url ?? ''));
};
const cdp = (method, params = {}) => new Promise(ok => { const id = ++nr; offen.set(id, ok); ws.send(JSON.stringify({ id, method, params })); });
const js = async ausdruck => (await cdp('Runtime.evaluate', { expression: ausdruck, returnByValue: true, awaitPromise: true })).result?.result?.value;

await cdp('Runtime.enable'); await cdp('Log.enable'); await cdp('Page.enable');
const ziel_url = url + (url.includes('?') ? '&' : '?') + 'spielen&debug';
await cdp('Page.navigate', { url: ziel_url });
await warte(4000);
// Anmeldeseite: Namen eintragen, „Mitspielen“
await js(`(() => { const n = document.getElementById('name'), l = document.getElementById('los'); if (n) { n.value = ${JSON.stringify(process.env.ZOMBIES_NAME || 'Rauchtest')}; n.dispatchEvent(new Event('input', { bubbles: true })); } if (l) l.click(); return !!l; })()`);
await warte(5000);
// Startdialog (Heldenwahl) bestätigen, falls vorhanden
await js(`(() => { const k = document.querySelector('#swfenster button.los, #swfenster button[type=submit], #swfenster .start, #swfenster button'); if (k) k.click(); return !!k; })()`);
let bereit = false;
for (let i = 0; i < 40 && !bereit; i++) {
  bereit = !!(await js(`(() => { const c = document.querySelectorAll('canvas').length; const l = document.getElementById('laden'); return c > 0 && !(l && l.offsetParent && getComputedStyle(l).display !== 'none' && getComputedStyle(l).opacity !== '0'); })()`));
  if (!bereit) await warte(500);
}
await warte(4000);
const canvas = await js(`document.querySelectorAll('canvas').length`);
const start = await js(`(() => { const e = document.getElementById('los'); return !!(e && e.offsetParent); })()`);
if (start) { console.log('Fehler: Anmeldeseite noch sichtbar'); bereit = false; }
const waffen = await js(`document.querySelectorAll('.waffenfeld, [data-waffenplatz], .wplatz').length`);
const shot = await cdp('Page.captureScreenshot', { format: 'png' });
if (shot.result?.data) writeFileSync(bild, Buffer.from(shot.result.data, 'base64'));
console.log(`Bereit: ${bereit ? 'ja' : 'nein'} Canvas: ${canvas} Waffenfelder: ${waffen}`);
const echte = fehler.filter(f => !/favicon|ERR_ABORTED|net::ERR_FAILED.*stream|\/toene\/.*404|404.*\/toene\/|429.*\/diag|navigator.vibrate/i.test(f));   // Töne fehlen im Testordner absichtlich
console.log(echte.length ? 'Fehler:\n  ' + echte.slice(0, 20).join('\n  ') : 'Fehler: keine');
ws.close();
process.exit(echte.length || !bereit ? 1 : 0);

// Bildschirmfotos für docs/screenshots (Straße, Lager, Fahrzeug, Nacht) per CDP, Spielername „Survivor“ (ZOMBIES_NAME).
// Aufruf: node tools/bildschirmfotos.mjs <cdp-port> <spiel-url> <ausgabeordner> <superuser-passwort>
// Server mit einstellungen.json { "superuserPasswort": "<pw>" } im Datenordner starten; Chrome und Server nur mit Speicherdeckel (siehe rauchtest.mjs).
import { writeFileSync } from 'node:fs';

const [port = '9751', url = 'http://127.0.0.1:2751/', aus = '.', pw = 'testtest99'] = process.argv.slice(2);
const name = process.env.ZOMBIES_NAME || 'Survivor';
const warte = ms => new Promise(r => setTimeout(r, ms));
let ziel;
for (let i = 0; i < 30 && !ziel; i++) { try { ziel = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find(t => t.type === 'page'); } catch { /* Chrome startet */ } if (!ziel) await warte(500); }
const ws = new WebSocket(ziel.webSocketDebuggerUrl);
await new Promise((ok, nein) => { ws.onopen = ok; ws.onerror = nein; });
let nr = 0; const offen = new Map();
ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && offen.has(m.id)) { offen.get(m.id)(m); offen.delete(m.id); } };
const cdp = (method, params = {}) => new Promise(ok => { const id = ++nr; offen.set(id, ok); ws.send(JSON.stringify({ id, method, params })); });
const js = async a => (await cdp('Runtime.evaluate', { expression: a, returnByValue: true, awaitPromise: true })).result?.result?.value;
const foto = async datei => { await aufraeumen(); const s = await cdp('Page.captureScreenshot', { format: 'webp', quality: 78 }); writeFileSync(`${aus}/${datei}`, Buffer.from(s.result.data, 'base64')); console.log('Bild', datei); };
const aufraeumen = () => js(`document.querySelectorAll('body > div').forEach(d => { if (d.style.zIndex === '99') d.remove(); })`);   // FPS-Anzeige (?debug) ausblenden
const su = (o) => js(`window.raum.send('su', ${JSON.stringify(o)})`);

await cdp('Page.enable'); await cdp('Runtime.enable');
await cdp('Emulation.setDeviceMetricsOverride', { width: 1400, height: 813, deviceScaleFactor: 1, mobile: false });
await cdp('Page.navigate', { url: url + (url.includes('?') ? '&' : '?') + 'spielen&debug' });
await warte(4000);
await js(`(() => { const n = document.getElementById('name'), p = document.getElementById('testpw'), l = document.getElementById('los');
  n.value = ${JSON.stringify(name)}; n.dispatchEvent(new Event('input', { bubbles: true })); p.value = ${JSON.stringify(pw)}; l.click(); })()`);
await warte(6000);
await js(`(() => { const k = document.querySelector('#swfenster button.los, #swfenster button[type=submit], #swfenster .start, #swfenster button'); if (k) k.click(); })()`);
// Startwahl (Fähigkeiten + 2 Gegenstände) abschließen, falls sie erscheint
for (let i = 0; i < 20; i++) { if (await js(`!!document.querySelector('#swfenster .sw-los')`)) break; await warte(500); }
await js(`(() => { const f = document.getElementById('swfenster'); if (!f?.querySelector('.sw-los')) return;
  for (let n = 0; n < 5; n++) { const b = [...f.querySelectorAll('.sw-pm[data-d="1"]:not(:disabled)')][n % 2]; if (b) b.click(); }
  f.querySelectorAll('.sw-item input')[0]?.click(); })()`);
await js(`(() => { const f = document.getElementById('swfenster'); f?.querySelectorAll('.sw-item input')[2]?.click(); })()`);
await js(`document.querySelector('#swfenster .sw-los')?.click()`);
await warte(1500);
for (let i = 0; i < 60; i++) { if (await js(`!!(window.szene && window.raum && document.querySelectorAll('canvas').length)`)) break; await warte(500); }
await warte(6000);
const spieler = () => js(`(() => { const p = window.raum.state.spieler.get(window.meineId); return JSON.stringify({ x: p.x, y: p.y }); })()`);
console.log('Start', await spieler());
await su({ befehl: 'zeit', stunde: 12 }); await su({ befehl: 'hordeanzeige' }); await aufraeumen();

// 1) Straße: Evakuierungspunkt (liegt an Straße), Zombies in der Nähe
await su({ befehl: 'evak' }); await warte(5000);
await foto('03-strasse.webp');
// 2) Lager
await su({ befehl: 'bw' }); await warte(5000);
await foto('04-lager.webp');
// 3) Fahrzeug (Boxer): neben dem Evakuierungspunkt setzen, einsteigen
await su({ befehl: 'evak' }); await warte(2000);
await su({ befehl: 'fahrzeug', art: 'boxer' }); await warte(1500);
await js(`window.raum.send('aktion')`); await warte(2500);
await foto('05-fahrzeug.webp');
await js(`window.raum.send('aussteigen')`); await warte(1000);
// 4) Nacht mit Taschenlampe
await su({ befehl: 'zeit', stunde: 23 }); await su({ befehl: 'ding', name: 'taschenlampe' }); await warte(6000);
await foto('07-nacht.webp');
ws.close(); process.exit(0);

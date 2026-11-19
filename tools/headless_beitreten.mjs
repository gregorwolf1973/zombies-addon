// Spiel im EIGENEN Headless-Chrome prüfen (nie den Chrome des Nutzers benutzen – der friert beim Beitreten ein).
// Vorher starten:
//   cd zombies && PORT=8790 ZOMBIES_DB=:memory: ZOMBIES_OPTIONS=/nonexistent ZOMBIES_TOENE=$PWD/../toene-lokal node server/index.mjs
//   google-chrome --headless=new --remote-debugging-port=9333 --user-data-dir=<leerer tmp-Ordner> --no-first-run --enable-unsafe-swiftshader about:blank
// Aufruf: node tools/headless_beitreten.mjs "http://localhost:8790/?spielen&debug" [Held|Heldin|Mann|Frau|Survivor] [Sekunden]
// Gibt Ladezustand, FPS, Konsolenfehler und die teuersten Funktionen (Profiler) aus.
const [,, url, aussehen = 'Held', dauer = '18'] = process.argv;
const ziel = await (await fetch('http://127.0.0.1:9333/json/new?' + encodeURIComponent('about:blank'), { method: 'PUT' })).json();
const ws = new WebSocket(ziel.webSocketDebuggerUrl);
await new Promise(r => ws.onopen = r);
let id = 0; const offen = new Map(); const logs = [];
ws.onmessage = e => {
  const m = JSON.parse(e.data);
  if (m.id && offen.has(m.id)) { offen.get(m.id)(m); offen.delete(m.id); }
  else if (m.method === 'Runtime.exceptionThrown') logs.push('EXC ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text).slice(0, 300));
  else if (m.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(m.params.type)) logs.push(m.params.type + ' ' + m.params.args.map(a => a.value ?? a.description).join(' ').slice(0, 300));
};
const cdp = (method, params = {}, ms = 20000) => new Promise((ok, nein) => { const i = ++id; offen.set(i, ok); ws.send(JSON.stringify({ id: i, method, params })); setTimeout(() => nein(new Error('Zeitüberschreitung ' + method)), ms); });
const js = async (expr, ms) => (await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }, ms)).result?.result?.value;
const warte = s => new Promise(r => setTimeout(r, s * 1000));
await cdp('Runtime.enable'); await cdp('Page.enable'); await cdp('Profiler.enable');
await cdp('Page.navigate', { url }); await warte(6);
console.log('Lobby-Knöpfe:', await js("document.querySelectorAll('button').length"));
await js(`(()=>{const n=document.getElementById('name');n.value='Kopflos';n.dispatchEvent(new Event('input',{bubbles:true}));[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='${aussehen}')?.click();document.getElementById('los').click();return 1})()`);
await cdp('Profiler.start');
for (let t = 0; t < Number(dauer) / 1.5; t++) {
  await warte(1.5);
  try { console.log(t, await js("JSON.stringify({szene:!!window.szene,bereit:!!window.szene?.bereit,id:window.meineId||null,fps:Math.round(window.szene?.game?.loop?.actualFps||0),start:getComputedStyle(document.getElementById('start')).display,aussehen:window.raum?.state?.spieler?.get(window.meineId)?.aussehen,laden:document.getElementById('ladentext')?.textContent})", 4000)); }
  catch { console.log(t, 'HÄNGT'); }
}
const prof = await cdp('Profiler.stop', {}, 60000).catch(() => null);
if (prof?.result?.profile) {
  const p = prof.result.profile, nodes = new Map(p.nodes.map(n => [n.id, n])), zeit = new Map();
  p.samples.forEach((s, i) => { const cf = nodes.get(s).callFrame; const k = `${cf.functionName || '(anon)'} ${cf.url.split('/').pop()}:${cf.lineNumber + 1}`; zeit.set(k, (zeit.get(k) || 0) + (p.timeDeltas[i] || 0)); });
  console.log('Teuerste Funktionen:'); [...zeit].sort((a, b) => b[1] - a[1]).slice(0, 8).forEach(([k, v]) => console.log(Math.round(v / 1000), 'ms', k));
}
console.log(logs.slice(0, 10).join('\n') || 'keine Konsolenfehler');
process.exit(0);

// Misst die Datenmenge pro Spieler: Server mit echter Karte, ein Client, Horde erzeugen, Bytes je Sekunde zählen.
// Aufruf: node tools/netz/messen.mjs [sekunden] [hordeGroesse]
import { matchMaker } from '@colyseus/core';
import { Client } from '@colyseus/sdk';
import { starte } from '../../server/index.mjs';
import { SpielRaum } from '../../server/raum.mjs';
const SEK = Number(process.argv[2] || 10), HORDE = Number(process.argv[3] || 600);
const PORT = 27100 + Math.floor(Math.random() * 500);
const warte = ms => new Promise(r => setTimeout(r, ms));
const server = await starte({ port: PORT, leise: true, datenbank: ':memory:', optionen: {} });
const a = await new Client(`http://127.0.0.1:${PORT}`).joinOrCreate('zombies', { name: 'Messer' });
a.onMessage('*', () => {});
await warte(1500);
const raum = matchMaker.getLocalRoomById(a.roomId);
// Horde dazu (bis HORDE Zombies)
try { if (raum.welle) { Object.assign(SpielRaum.einstellungen, { welleMin: HORDE, welleMax: HORDE }); raum.welle.erzeugen('ost'); } } catch (e) { console.log('Horde:', e.message); }
let zaehler = 0, pakete = 0; const art = {};
if (process.argv[4] === 'mitte') {   // Spieler mitten in die Horde stellen
  const zs = [...raum.state.zombies.values()].filter(z => !z.ebene); const mx = zs.reduce((a, z) => a + z.x, 0) / zs.length, my = zs.reduce((a, z) => a + z.y, 0) / zs.length;
  const p = raum.state.spieler.get(a.sessionId); p.x = mx; p.y = my; p.ebene = '';
}
for (const c of raum.clients) {
  const ws = c.ref; const orig = ws.send.bind(ws);
  ws.send = (d, ...r) => { const n = d.byteLength ?? d.length ?? 0; zaehler += n; pakete++; const k = d[0] === 15 ? 'patch' : d[0] === 13 ? 'nachricht:' + ((d[1] & 0xe0) === 0xa0 ? Buffer.from(d.subarray(2, 2 + (d[1] & 31))).toString() : '#' + d[1]) : 'code' + d[0]; art[k] = (art[k] ?? 0) + n; return orig(d, ...r); };
}
// Spieler läuft hin und her
let rechts = true; const lauf = setInterval(() => { rechts = !rechts; a.send('eingabe', { dx: rechts ? 1 : -1, dy: 0, s: false }); }, 1500);
await warte(2000); zaehler = 0; pakete = 0;
const t0 = Date.now(); const proSek = [];
for (let i = 0; i < SEK; i++) { const z0 = zaehler; await warte(1000); proSek.push(zaehler - z0); }
clearInterval(lauf);
const s = raum.state;
console.log(JSON.stringify({ zombies: s.zombies.size, leichen: s.leichen.size, boden: s.boden.size, menschen: s.menschen?.size, fahrzeuge: s.fahrzeuge?.size,
  kBproSek: +(zaehler / 1024 / ((Date.now() - t0) / 1000)).toFixed(1), paketeProSek: +(pakete / SEK).toFixed(1), verlauf_kB: proSek.map(b => +(b / 1024).toFixed(1)), art: Object.fromEntries(Object.entries(art).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => [k, +(v / 1024 / SEK).toFixed(1)])) }));
await a.leave(); await server.gracefullyShutdown(false); process.exit(0);

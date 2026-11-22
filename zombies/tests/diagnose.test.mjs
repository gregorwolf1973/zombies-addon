// Diagnose: Client-Sammler (client/diagnose.mjs), Server-Annahme (server/diagnose.mjs) und die Route POST /diag
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { Sammler, geraetTyp, kuerzeStack } from '../client/diagnose.mjs';
import { Diagnose, bereinige, logzeile, DIAG_RATE, DIAG_EINTRAEGE } from '../server/diagnose.mjs';
import { starte } from '../server/index.mjs';
import { freierPort } from './hilfe.mjs';

test('geraetTyp: grob Plattform und Browser, ohne Feinheiten', () => {
  assert.equal(geraetTyp('Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1'), 'iOS Safari/17');
  assert.equal(geraetTyp('Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.6367.82 Mobile Safari/537.36'), 'Android Chrome/124');
  assert.equal(geraetTyp('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125.0.0.0 Safari/537.36 Edg/125.0.2535.51'), 'Windows Edge/125');
  assert.equal(geraetTyp('Mozilla/5.0 (X11; Linux x86_64; rv:126.0) Gecko/20100101 Firefox/126.0'), 'Linux Firefox/126');
  assert.equal(geraetTyp(''), '? ?');
});

test('kuerzeStack: höchstens 600 Zeichen, ohne Host', () => {
  const s = 'Error: x\n    at f (https://example.org/v/abc123/spiel.mjs:10:5)\n' + 'a'.repeat(2000);
  const k = kuerzeStack(s);
  assert.ok(k.length <= 600);
  assert.ok(!k.includes('example.org') && k.includes('spiel.mjs:10:5'));
});

test('Sammler: Fehler gedrosselt, gleiche Meldung gezählt statt wiederholt, Kennzahlen mit FPS/kB/s', async () => {
  let t = 1000; const gesendet = [];
  const s = new Sammler({ senden: b => gesendet.push(b), jetzt: () => t, geraet: 'Test Chrome/1', fehlerProMin: 3 });
  s.fehler({ meldung: 'A', quelle: 'https://h/v/1/spiel.mjs', zeile: 1, stack: 'x' });
  s.fehler({ meldung: 'A', quelle: 'https://h/v/1/spiel.mjs', zeile: 1, stack: 'x' });   // gleich: nur gezählt
  s.fehler({ meldung: 'B', quelle: '', zeile: 2 });
  s.fehler({ meldung: 'C', quelle: '', zeile: 3 });
  s.fehler({ meldung: 'D', quelle: '', zeile: 4 });   // über dem Limit
  await Promise.resolve();
  assert.equal(gesendet.length, 1, 'ein gebündelter Bericht');
  assert.deepEqual(gesendet[0].fehler.map(f => f.meldung), ['A', 'B', 'C']);
  assert.equal(gesendet[0].fehler[0].quelle, 'spiel.mjs');
  t += 61000;   // neue Minute
  s.fehler({ meldung: 'D', quelle: '', zeile: 4 });
  await Promise.resolve();
  assert.equal(gesendet.length, 2);

  // Kennzahlen: 600 Frames und 30 kB in 10 s
  const s2 = new Sammler({ senden: b => gesendet.push(b), jetzt: () => t, geraet: 'G' });
  t += 10000;
  for (let i = 0; i < 600; i++) s2.bild();
  s2.empfangen(30 * 1024);
  s2.pingSetzen(42.4); s2.tonZaehler(3, 2);
  const k = s2.kpi({ zoom: 1.5, bild: '800x600', karte: 'geretsried', drinnen: false, ton: 'running', zombies: 7 });
  assert.equal(k.fps, 60); assert.equal(k.kbs, 3); assert.equal(k.ping, 42); assert.equal(k.stumm, 3); assert.equal(k.verdraengt, 2);
  const b = gesendet.at(-1);
  assert.equal(b.kpi.dev, 'G'); assert.equal(b.kpi.karte, 'geretsried');
  assert.ok(JSON.stringify(b).length < 600, 'Bericht bleibt klein');
  assert.equal(s2.frames, 0, 'Zähler zurückgesetzt');
});

test('Sammler: aus = nichts gesammelt, kein Senden', async () => {
  const gesendet = [];
  const s = new Sammler({ senden: b => gesendet.push(b) });
  s.setzeAn(false);
  s.fehler({ meldung: 'x' }); s.tonProblem('ladefehler', 'a.mp3');
  assert.equal(s.kpi({}), null);
  await Promise.resolve();
  assert.equal(gesendet.length, 0);
});

test('bereinige/logzeile: Felder gekürzt, Logzeilen kompakt', () => {
  const e = bereinige({ fehler: [{ meldung: 'm'.repeat(500), stack: 's'.repeat(2000), quelle: 'a.mjs', zeile: 12.7 }], kpi: { fps: 59.96, ping: 31, kbs: 2.5, zoom: 1.25, dev: 'iOS Safari/17', drinnen: true, boese: 'x' }, ton: [{ was: 'ladefehler', detail: 'a.mp3' }] });
  assert.equal(e.length, 3);
  assert.equal(e[0].meldung.length, 200); assert.equal(e[0].stack.length, 600);
  assert.equal(logzeile('abc', e[1]), '[diag] abc kpi fps=60 ping=31 kbs=2.5 zoom=1.25 dev=iOS Safari/17 drinnen=1');
  assert.match(logzeile('abc', e[0]), /^\[diag\] abc fehler m+ @a\.mjs:13 \| s+$/);
  assert.equal(logzeile('abc', e[2]), '[diag] abc ton ladefehler a.mp3');
  assert.deepEqual(bereinige(null), []);
  assert.deepEqual(bereinige({ fehler: 'kaputt', kpi: 5 }), []);
});

test('Diagnose.annehmen: Rate, Sitzung, aus; Ringpuffer-Datei begrenzt', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zombies-diag-'));
  const datei = path.join(dir, 'diag.jsonl');
  let t = 0, an = true; const log = [];
  const d = new Diagnose({ an: () => an, sitzungOk: s => s !== 'fremd', datei, log: z => log.push(z), jetzt: () => t });
  const kpi = { fps: 60 };
  assert.equal(d.annehmen({ s: 'abc123', kpi }).status, 204);
  assert.equal(d.annehmen({ s: 'fremd', kpi }).status, 403);
  assert.equal(d.annehmen({ kpi }).status, 400);
  assert.equal(d.annehmen({ s: 'a b', kpi }).status, 400);
  for (let i = 1; i < DIAG_RATE; i++) assert.equal(d.annehmen({ s: 'abc123', kpi }).status, 204);
  assert.equal(d.annehmen({ s: 'abc123', kpi }).status, 429, 'Rate je Sitzung');
  assert.equal(d.annehmen({ s: 'zzz999', kpi }).status, 204, 'andere Sitzung unabhängig');
  t += 61000;
  assert.equal(d.annehmen({ s: 'abc123', kpi }).status, 204, 'nächste Minute');
  assert.match(log[0], /^\[diag\] abc123 kpi fps=60/);
  // Ringpuffer
  for (let i = 0; i < DIAG_EINTRAEGE + 80; i++) { t += 61000; d.annehmen({ s: 'abc123', fehler: [{ meldung: 'e' + i }] }); }
  d.schreiben();
  const zeilen = fs.readFileSync(datei, 'utf8').trim().split('\n');
  assert.equal(zeilen.length, DIAG_EINTRAEGE);
  assert.ok(JSON.parse(zeilen.at(-1)).meldung.startsWith('e'));
  assert.ok(!('name' in JSON.parse(zeilen[0])) && !('ip' in JSON.parse(zeilen[0])));
  // aus: nichts mehr
  an = false; const n = log.length;
  assert.equal(d.annehmen({ s: 'neu123', kpi }).status, 204);
  assert.equal(log.length, n);
  fs.rmSync(dir, { recursive: true, force: true });
});

// ---------- Route POST /diag ----------
const PORT = await freierPort();
const ordner = fs.mkdtempSync(path.join(os.tmpdir(), 'zombies-diagroute-'));
let server; const zeilenLog = []; const altLog = console.log;
before(async () => {
  console.log = (...a) => { if (String(a[0]).startsWith('[diag]')) zeilenLog.push(a[0]); else altLog(...a); };
  server = await starte({ port: PORT, optionen: { karte: 'dorf' }, leise: true, datenbank: path.join(ordner, 'spiel.db'), diagnosePruefung: s => s === 'sitzung1' });
});
after(async () => { console.log = altLog; await server.gracefullyShutdown(false); fs.rmSync(ordner, { recursive: true, force: true }); });

function post(pfad, body, typ = 'application/json') {
  return new Promise((ok, fehl) => {
    const q = http.request({ host: '127.0.0.1', port: PORT, path: pfad, method: 'POST', headers: { 'content-type': typ, 'content-length': Buffer.byteLength(body) } }, res => { res.resume(); res.on('end', () => ok(res.statusCode)); });
    q.on('error', fehl); q.end(body);
  });
}

test('POST /diag: nimmt an, schreibt Log und Datei; Größe, Sitzung und Rate begrenzt', async () => {
  const bericht = { s: 'sitzung1', fehler: [{ meldung: 'Boom', quelle: 'spiel.mjs', zeile: 5, stack: 'at x' }], kpi: { fps: 58, ping: 40, kbs: 3.2, zoom: 1, dev: 'Linux Chrome/125', drinnen: false } };
  assert.equal(await post('/diag', JSON.stringify(bericht), 'text/plain'), 204);
  assert.ok(zeilenLog.some(z => /^\[diag\] sitzung1 fehler Boom @spiel\.mjs:5/.test(z)));
  assert.ok(zeilenLog.some(z => /^\[diag\] sitzung1 kpi fps=58 ping=40 kbs=3\.2 zoom=1 dev=Linux Chrome\/125/.test(z)));
  assert.equal(await post('/diag', JSON.stringify({ ...bericht, s: 'fremd1' })), 403);
  assert.equal(await post('/diag', 'kein json'), 400);
  assert.equal(await post('/diag', JSON.stringify({ s: 'sitzung1', fehler: [{ meldung: 'x'.repeat(9000) }] })), 413);
  for (let i = 0; i < 12; i++) await post('/diag', JSON.stringify(bericht));
  assert.equal(await post('/diag', JSON.stringify(bericht)), 429);
  await new Promise(r => setTimeout(r, 50));
  assert.ok(fs.existsSync(path.join(ordner, 'diag.jsonl')), 'Ringpuffer-Datei neben der Datenbank');
});

test('Einstellung diagnose aus: Route ignoriert, nichts im Log', async () => {
  const roh = await new Promise(ok => http.get({ host: '127.0.0.1', port: PORT, path: '/info' }, res => { const t = []; res.on('data', d => t.push(d)); res.on('end', () => ok(JSON.parse(Buffer.concat(t)))); }));
  assert.equal(roh.diagnose, true);
  process.env.ZOMBIES_VERWALTUNG_LOKAL = '1';
  const aus = await new Promise((ok, fehl) => {
    const b = JSON.stringify({ diagnose: false });
    const q = http.request({ host: '127.0.0.1', port: PORT, path: '/verwaltung/api', method: 'POST', headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(b) } }, res => { res.resume(); res.on('end', () => ok(res.statusCode)); });
    q.on('error', fehl); q.end(b);
  });
  delete process.env.ZOMBIES_VERWALTUNG_LOKAL;
  assert.equal(aus, 200);
  const vorher = zeilenLog.length;
  assert.equal(await post('/diag', JSON.stringify({ s: 'sitzung1', fehler: [{ meldung: 'Still' }] })), 204);
  assert.equal(zeilenLog.length, vorher);
});

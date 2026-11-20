// Beim Laufen an einem Zombie vorbei muss die automatische Waffe sofort feuern (Schussfolge laut Waffe), nicht verzögert oder gar nicht.
// Der Test läuft wie ein echter Client: Eingabe alle 50 ms mit Nummer und Dauer (Netzschema 0.58).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { matchMaker } from '@colyseus/core';
import { Client } from '@colyseus/sdk';
import { starte } from '../server/index.mjs';
import { WAFFEN, WERTE as W, frei, sichtfrei, BREITE, HOEHE, KACHEL } from '../client/welt.mjs';

const PORT = 27300 + Math.floor(Math.random() * 200);
const URL_ = `http://127.0.0.1:${PORT}`;
let server;
const warte = ms => new Promise(r => setTimeout(r, ms));
before(async () => { server = await starte({ port: PORT, optionen: { karte: 'dorf' }, leise: true, datenbank: ':memory:' }); });
after(async () => { await server.gracefullyShutdown(false); });

// freier Streifen (Läufer) mit freier Zombie-Stelle seitlich davon und freier Sicht dazwischen
function ort(raum, laenge, seite) {
  const welt = raum.welt;
  for (let y = 200; y < HOEHE * KACHEL - 200; y += 12) for (let x = 200; x < BREITE * KACHEL - 200 - laenge; x += 12) {
    let ok = frei(welt, x + laenge / 2, y + seite, W.zombieRadius + 2);
    for (let d = 0; d <= laenge && ok; d += 8) ok = frei(welt, x + d, y, W.spielerRadius + 2) && sichtfrei(welt, x + d, y, x + laenge / 2, y + seite);
    if (ok) return { x, y };
  }
  return null;
}

async function lauf(waffe, mitMessung = true) {
  const w = WAFFEN[waffe];
  const c = await new Client(URL_).joinOrCreate('zombies', { name: 'Lauf' });
  c.onMessage('*', () => {});
  const raum = matchMaker.getLocalRoomById(c.roomId);
  raum.zombieFaktor = 0; raum.kriecherChance = 0;
  const p = raum.state.spieler.get(c.sessionId);
  const R = w.reichweite, seite = R * 0.35;
  const laenge = Math.min(R * 2.2, 700);
  const o = ort(raum, laenge, seite);
  assert.ok(o, 'keine freie Strecke');
  raum.state.zombies.clear(); raum.zombieInfo.clear();
  p.x = o.x; p.y = o.y; p.ebene = ''; p.infektion = 0; p.zombie = 0; p.unten = false; p.rucksack.clear();
  p.waffe = waffe; p.munition = 500; p.pfeile = 0; p.granaten = 0; p.magazin = w.magazin;
  const zid = raum.setzeZombie(o.x + laenge / 2, o.y + seite, '');
  const z = raum.state.zombies.get(zid), info = raum.zombieInfo.get(zid);
  z.hp = 1e6; info.steht = true; info.schlaeft = false; info.ziel = null; info.wechsel = 99;
  const zx = z.x, zy = z.y;
  await warte(200);
  p.x = o.x; p.y = o.y; p.magazin = w.magazin; p.nachladen = 0; raum.extra.get(c.sessionId).pause = 0;   // Warte-Schüsse im Stehen zählen nicht
  const festhalten = setInterval(() => { z.x = zx; z.y = zy; }, 5);   // der Zombie steht wirklich still (Schüsse locken ihn sonst)
  const schuesse = [];
  const alt = raum.broadcast.bind(raum);
  raum.broadcast = (typ, m, ...r) => { if (typ === 'schuss' || typ === 'stoss') schuesse.push({ t: performance.now(), x: p.x }); return alt(typ, m, ...r); };
  const inReichweite = () => Math.hypot(zx - p.x, zy - p.y) <= R;
  let eintritt = null, austritt = null, n = 0;
  const t0 = performance.now();
  let letzte = t0;
  while (p.x < o.x + laenge && performance.now() - t0 < 15000) {
    await warte(50 - ((performance.now() - letzte) % 50) * 0);   // Sendetakt wie der Client (50 ms)
    const jetzt = performance.now(), d = Math.min(0.25, (jetzt - letzte) / 1000); letzte = jetzt;
    c.send('eingabe', { dx: 1, dy: 0, s: false, n: ++n, d: +d.toFixed(3) });
    if (inReichweite()) { if (eintritt === null) eintritt = { t: performance.now(), x: p.x }; austritt = { t: performance.now(), x: p.x }; }
  }
  raum.broadcast = alt; clearInterval(festhalten);
  await c.leave();
  assert.ok(eintritt, 'nie in Reichweite');
  const innen = schuesse;   // Aufzeichnung beginnt erst beim Loslaufen
  const verzoegerung = innen.length ? Math.max(0, innen[0].t - eintritt.t) : Infinity;
  const dauer = austritt.t - eintritt.t;
  const erwartet = Math.floor(dauer / 1000 / w.pause) + 1;
  console.log(`# ${waffe}: Reichweite ${R}, in Reichweite ${dauer.toFixed(0)} ms, Schüsse ${innen.length} (ideal ${erwartet}), erster Schuss nach ${verzoegerung.toFixed(0)} ms`);
  return { schuesse: innen.length, erwartet, verzoegerung, dauer };
}

for (const waffe of ['pistole', 'gewehr']) {
  test(`Schuss im Lauf: ${waffe} feuert beim Vorbeilaufen sofort und in Schussfolge`, async () => {
    const r = await lauf(waffe);
    assert.ok(r.verzoegerung <= 250, `erster Schuss erst nach ${r.verzoegerung} ms`);
    assert.ok(r.schuesse >= Math.floor(r.erwartet * 0.75), `nur ${r.schuesse} von ${r.erwartet} Schüssen`);
  });
}

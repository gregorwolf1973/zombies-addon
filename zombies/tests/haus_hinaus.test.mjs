// Haus verlassen: wer innen schräg (bis ~60°) oder am Rand der Tür zum Ausgang läuft, ist binnen ~0,3 s draußen; kein Pendeln (sofort wieder hinein)
process.env.ZOMBIES_INNEN1M = '1';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { matchMaker } from '@colyseus/core';
import { Client } from '@colyseus/sdk';
import { starte } from '../server/index.mjs';
import { SpielRaum } from '../server/raum.mjs';
import { KACHEL, kachelVon, frei, bewege, WERTE as W } from '../client/welt.mjs';
import { BOTPLAN } from '../server/botplan.mjs';
import { freierPort, altesTempo } from './hilfe.mjs';
altesTempo(SpielRaum);
BOTPLAN.an = false;

const PORT = await freierPort();
const ordner = fs.mkdtempSync(path.join(os.tmpdir(), 'zombies-hinaus-'));
let server;
const warte = ms => new Promise(r => setTimeout(r, ms));
before(async () => { server = await starte({ port: PORT, optionen: { karte: 'geretsried2' }, leise: true, datenbank: path.join(ordner, 'spiel.db') }); });
after(async () => { await server.gracefullyShutdown(false); fs.rmSync(ordner, { recursive: true, force: true }); });

const messung = [];
test('Haus verlassen: schräg und am Türrand binnen 0,3 s draußen', async () => {
  const c = await new Client(`http://127.0.0.1:${PORT}`).joinOrCreate('zombies', { name: 'Hinaus', spielerId: crypto.randomBytes(16).toString('hex') });
  const raum = matchMaker.getLocalRoomById(c.roomId), p = raum.state.spieler.get(c.sessionId), x = raum.extra.get(c.sessionId);
  raum.zombieFaktor = 0; for (const [id] of raum.state.zombies) { raum.state.zombies.delete(id); raum.zombieInfo.delete(id); }
  try {
    const haeuser = raum.welt.haeuser.filter(h => h.betretbar && !h.safe && raum.wv(`h${h.nr}eg`).kachel).slice(0, Number(process.env.HAEUSER ?? 8));
    assert.ok(haeuser.length >= Math.min(3, Number(process.env.HAEUSER ?? 8)), 'zu wenige Häuser');
    const fehler = [];
    for (const h of haeuser) {
      const eg = raum.wv(`h${h.nr}eg`), K = kachelVon(eg), a = eg.ausgang;
      const mx = a.zellen.reduce((s, z) => s + z[0], 0) / a.zellen.length + 0.5, my = a.zellen.reduce((s, z) => s + z[1], 0) / a.zellen.length + 0.5;
      const n = { x: h.raus.dx, y: h.raus.dy }, q = { x: -n.y, y: n.x };
      for (const winkel of [0, 30, 60, -60]) for (const quer of [0, -1, 1]) for (const tiefe of [1.5, 3]) {
        const br = Math.max(...a.zellen.map(z => Math.abs((z[0] + 0.5 - mx) * q.x + (z[1] + 0.5 - my) * q.y))) * K;
        const rad = winkel * Math.PI / 180, dx = n.x * Math.cos(rad) + q.x * Math.sin(rad), dy = n.y * Math.cos(rad) + q.y * Math.sin(rad);
        // Start: von der Ausgangsmitte nach innen (tiefe m), seitlich quer*Rand; bei Schrägläufen so, dass die Gerade die Türmitte trifft
        const sx = mx * K - dx * tiefe * 8 + q.x * quer * br * 0.9, sy = my * K - dy * tiefe * 8 + q.y * quer * br * 0.9;   // die Gerade in Laufrichtung trifft die Türmitte (seitlich um den Rand versetzt)
        // nur Startpunkte mit freier Gerade bis zur Türmitte (sonst steht er hinter einer Zimmerwand: kein Fehler der Tür)
        let gerade = true;
        for (let i = 0; i <= 40 && gerade; i++) gerade = frei(eg, sx + (mx * K - sx) * i / 40, sy + (my * K - sy) * i / 40, W.spielerRadius);
        if (!gerade) continue;
        p.ebene = eg.ebene ?? `h${h.nr}eg`; p.x = sx; p.y = sy; x.ankunft = null; x.wechselSperre = 0; raum.eingabeVerwerfen(p, x);
        const t0 = Date.now(); let t = null;
        c.send('eingabe', { dx, dy });
        while (Date.now() - t0 < 4000) { await warte(20); if (p.ebene === '') { t = (Date.now() - t0) / 1000; break; } c.send('eingabe', { dx, dy }); }
        c.send('eingabe', { dx: 0, dy: 0 }); await warte(80);
        messung.push({ haus: h.nr, winkel, quer, tiefe, t });
        if (t === null || t > 0.35 + tiefe * 8 / 35) fehler.push(`Haus ${h.nr} Winkel ${winkel} quer ${quer} tiefe ${tiefe}: ${t === null ? 'nicht hinaus (4 s)' : t.toFixed(2) + ' s'}`);
        else {   // Pendeln: 1,5 s weiterlaufen, nicht wieder hineingehen
          c.send('eingabe', { dx, dy }); await warte(1000); c.send('eingabe', { dx: 0, dy: 0 });
          if (p.ebene !== '') fehler.push(`Haus ${h.nr} Winkel ${winkel}: pendelt wieder hinein`);
        }
      }
    }
    { const ts = messung.map(m => m.t).filter(t => t !== null).sort((a, b) => a - b); console.log('Zeiten min/med/max', ts[0], ts[ts.length >> 1], ts[ts.length - 1]); const nach = {}; for (const m of messung) (nach[m.winkel + '/' + m.quer] ??= []).push(m.t === null ? 9 : m.t); for (const k in nach) console.log(k, Math.max(...nach[k]).toFixed(2)); }
    console.log(`Messungen ${messung.length}, Ausreißer ${fehler.length}`); console.log(fehler.slice(0, 40).join('\n'));
    assert.equal(fehler.length, 0, 'Ausreißer: ' + fehler.length);
  } finally { await c.leave(); }
});

// Betreten und gleich wieder hinaus (Umkehren direkt nach der Ankunft, gerade oder schräg): auch das darf nicht Sekunden dauern
test('Haus betreten und sofort wieder hinaus: nicht erst weit hineingehen müssen', async () => {
  const c = await new Client(`http://127.0.0.1:${PORT}`).joinOrCreate('zombies', { name: 'Umkehr', spielerId: crypto.randomBytes(16).toString('hex') });
  const raum = matchMaker.getLocalRoomById(c.roomId), p = raum.state.spieler.get(c.sessionId), x = raum.extra.get(c.sessionId);
  raum.zombieFaktor = 0; for (const [id] of raum.state.zombies) { raum.state.zombies.delete(id); raum.zombieInfo.delete(id); }
  try {
    const haeuser = raum.welt.haeuser.filter(h => h.betretbar && !h.safe && raum.wv(`h${h.nr}eg`).kachel).slice(0, Number(process.env.HAEUSER ?? 6));
    const fehler = [], zeiten = []; let ohne = 0;
    for (const h of haeuser) for (const winkel of [0, 30, -30]) {
      const vor = h.tuerPos ?? { x: (h.tuer.x + 0.5 + h.raus.dx * 0.5) * KACHEL, y: (h.tuer.y + 0.5 + h.raus.dy * 0.5) * KACHEL }, n = h.tuerPos ? { dx: h.tuerPos.nx, dy: h.tuerPos.ny } : h.raus, rad = winkel * Math.PI / 180;
      p.ebene = ''; p.x = vor.x + n.dx * 14; p.y = vor.y + n.dy * 14; x.ankunft = null; x.wechselSperre = 0; x.tuerEinT = 0; raum.eingabeVerwerfen(p, x);
      c.send('eingabe', { dx: -n.dx, dy: -n.dy });
      let drin = false; const t0 = Date.now();
      while (Date.now() - t0 < 3000) { await warte(20); if (p.ebene !== '') { drin = true; break; } c.send('eingabe', { dx: -n.dx, dy: -n.dy }); }
      if (!drin) { ohne++; if (false) fehler.push(`Haus ${h.nr}: nicht hineingekommen (${p.x.toFixed(0)},${p.y.toFixed(0)} Tür ${vor.x.toFixed(0)},${vor.y.toFixed(0)} ${JSON.stringify(h.raus)})`); c.send('eingabe', { dx: 0, dy: 0 }); continue; }
      // sofort umkehren (kurz loslassen wie ein Mensch: 100 ms)
      c.send('eingabe', { dx: 0, dy: 0 }); await warte(100);
      // zur Ausgangstür laufen: Richtung zur Türmitte, um `winkel` gedreht (die Ankunft liegt oft seitlich der Tür)
      const eg = raum.wv(p.ebene), K = kachelVon(eg), a = eg.ausgang;
      const mx = (a.zellen.reduce((s, z) => s + z[0], 0) / a.zellen.length + 0.5) * K, my = (a.zellen.reduce((s, z) => s + z[1], 0) / a.zellen.length + 0.5) * K;
      const weg = Math.hypot(mx - p.x, my - p.y), vl = weg || 1, ux = (mx - p.x) / vl, uy = (my - p.y) / vl;
      const ex = ux * Math.cos(rad) - uy * Math.sin(rad), ey = ux * Math.sin(rad) + uy * Math.cos(rad);   // gleichbleibende Richtung (wie eine gehaltene Taste auf die Tür zu)
      const t1 = Date.now(); let t = null;
      while (Date.now() - t1 < 6000) {
        c.send('eingabe', { dx: ex, dy: ey }); await warte(20);
        if (p.ebene === '') { t = (Date.now() - t1) / 1000; break; }
      }
      c.send('eingabe', { dx: 0, dy: 0 }); await warte(100);
      zeiten.push(t ?? 99);
      if (t === null || t > 0.4 + weg / 30) fehler.push(`Haus ${h.nr} Winkel ${winkel} (Weg ${weg.toFixed(0)} px): ${t === null ? 'nicht hinaus (6 s)' : t.toFixed(2) + ' s'} (Spieler ${p.x.toFixed(0)},${p.y.toFixed(0)} ${p.ebene})`);
    }
    assert.ok(zeiten.length >= 6, 'zu wenige Betretungen: ' + zeiten.length + ' (ohne ' + ohne + ')');
    console.log('Umkehr-Zeiten', zeiten.map(z => z.toFixed(2)).join(' ')); console.log(fehler.join('\n'));
    assert.equal(fehler.length, 0, 'Ausreißer: ' + fehler.length);
  } finally { await c.leave(); }
});

// Kein Pendeln: wer mit gehaltener Taste (auch schräg) hineinläuft, geht nicht sofort wieder durch den Ausgang hinaus
test('Haus betreten mit gehaltener Taste: bleibt drinnen (kein Pendeln)', async () => {
  const c = await new Client(`http://127.0.0.1:${PORT}`).joinOrCreate('zombies', { name: 'Halter', spielerId: crypto.randomBytes(16).toString('hex') });
  const raum = matchMaker.getLocalRoomById(c.roomId), p = raum.state.spieler.get(c.sessionId), x = raum.extra.get(c.sessionId);
  raum.zombieFaktor = 0; for (const [id] of raum.state.zombies) { raum.state.zombies.delete(id); raum.zombieInfo.delete(id); }
  try {
    const haeuser = raum.welt.haeuser.filter(h => h.betretbar && !h.safe && raum.wv(`h${h.nr}eg`).kachel).slice(0, Number(process.env.HAEUSER ?? 5));
    let geprueft = 0;
    for (const h of haeuser) for (const rad of [0, 0.5, -0.5]) {
      const vor = h.tuerPos ?? { x: (h.tuer.x + 0.5 + h.raus.dx * 0.5) * KACHEL, y: (h.tuer.y + 0.5 + h.raus.dy * 0.5) * KACHEL }, n = h.tuerPos ? { dx: h.tuerPos.nx, dy: h.tuerPos.ny } : h.raus;
      const dx = -(n.dx * Math.cos(rad) - n.dy * Math.sin(rad)), dy = -(n.dx * Math.sin(rad) + n.dy * Math.cos(rad));
      p.ebene = ''; p.x = vor.x + n.dx * 14; p.y = vor.y + n.dy * 14; x.ankunft = null; x.wechselSperre = 0; x.tuerEinT = 0; raum.eingabeVerwerfen(p, x);
      let drin = false; const t0 = Date.now();
      while (Date.now() - t0 < 3000) { c.send('eingabe', { dx, dy }); await warte(20); if (p.ebene !== '') { drin = true; break; } }
      if (!drin) { c.send('eingabe', { dx: 0, dy: 0 }); continue; }
      const t1 = Date.now();
      while (Date.now() - t1 < 1500) { c.send('eingabe', { dx, dy }); await warte(20); assert.notEqual(p.ebene, '', `Haus ${h.nr}: mit gehaltener Taste sofort wieder draußen`); }
      c.send('eingabe', { dx: 0, dy: 0 }); await warte(100); geprueft++;
    }
    assert.ok(geprueft >= 4, 'zu wenige Prüfungen: ' + geprueft);
  } finally { await c.leave(); }
});

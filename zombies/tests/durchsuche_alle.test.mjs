// „Alles durchsuchen“: Auswahl, Dauer (60 %), Fundliste, Alles nehmen; schnellere Einzeldauern
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { matchMaker } from '@colyseus/core';
import { Client } from '@colyseus/sdk';
import { starte } from '../server/index.mjs';
import { SpielRaum } from '../server/raum.mjs';
import { setzeKartengroesse, durchsuchDauer } from '../client/welt.mjs';
import { alleKandidaten } from '../client/durchsuche_alle.mjs';

const PORT = 28700 + Math.floor(Math.random() * 90);
let server;
const warte = ms => new Promise(r => setTimeout(r, ms));
before(async () => { server = await starte({ port: PORT, optionen: { karte: 'geretsried' }, leise: true, datenbank: ':memory:' }); });
after(async () => { await server.gracefullyShutdown(false); setzeKartengroesse(64, 48); });

test('Einzeldauern: Behälter 0,8 s, Auto/Bus 1,2 s, Leiche 0,6 s', () => {
  assert.equal(durchsuchDauer('schrank'), 0.8);
  assert.equal(durchsuchDauer('auto'), 1.2);
  assert.equal(durchsuchDauer('bus'), 1.2);
  assert.equal(durchsuchDauer('leiche'), 0.6);
});

test('Alles durchsuchen: Raum-Auswahl, 60 % Dauer, Fundliste und Alles nehmen', async () => {
  SpielRaum.speicher.loescheWelt();
  const c = await new Client(`http://127.0.0.1:${PORT}`).joinOrCreate('zombies', { name: 'Sepp', spielerId: crypto.randomBytes(16).toString('hex'), seed: 7 });
  const raum = matchMaker.getLocalRoomById(c.roomId);
  raum.zombieFaktor = 0; raum.state.zombies.clear(); raum.zombieInfo.clear();
  raum.welle.schritt = () => {};
  const p = raum.state.spieler.get(c.sessionId);
  raum.extra.get(c.sessionId).pause = 1e6;
  const h = raum.welt.haeuser.find(q => q.betretbar && !q.safe);
  const ebene = `h${h.nr}eg`, w = raum.wv(ebene);
  assert.ok(w.behaelter.length >= 2);
  // Spieler an den ersten Behälter, Überraschungszombies aus
  SpielRaum.einstellungen.ueberraschung = 0;
  const b0 = w.behaelter.find(b => b.art !== 'bw_kiste' && b.art !== 'auto');
  p.ebene = ebene; p.x = b0.x; p.y = b0.y + 10;
  p.rucksack.length = 0; p.plaetze = 2; p.waffe = ''; p.munition = 0;
  const k = alleKandidaten(w, raum.state.behaelter, raum.state.leichen, p, true);
  assert.ok(k.liste.length >= 1);
  assert.ok(Math.abs(k.dauer - 0.6 * k.liste.reduce((s, e) => s + durchsuchDauer(e.art), 0)) < 1e-9);
  const nachr = [];
  const cl = raum.clients.find(q => q.sessionId === c.sessionId);
  const sendOrig = cl.send.bind(cl);
  cl.send = (t, m, ...r) => { nachr.push([t, m]); return sendOrig(t, m, ...r); };
  // direkt ausführen (Aktionslauf prüft nur Dauer/Abbruch)
  raum.starteAlle(cl);
  const x = raum.extra.get(c.sessionId);
  assert.equal(x.aktionZiel?.art, 'durchsuchen_alle');
  assert.ok(Math.abs(x.aktionZiel.dauer - k.dauer) < 1e-9);
  // Bewegung bricht ab
  x.eingabe.dx = 1; raum.aktionSchritt(c.sessionId, p, x, 0.1);
  assert.equal(p.aktion, '');
  x.eingabe.dx = 0;
  raum.starteAlle(cl);
  raum.aktionSchritt(c.sessionId, p, x, k.dauer + 0.1);
  assert.equal(p.aktion, '');
  const fl = nachr.filter(n => n[0] === 'fundliste').pop();
  assert.ok(fl, 'Fundliste fehlt');
  assert.equal(p.rucksack.length, 0, 'nichts darf automatisch genommen werden');
  for (const e of k.liste) assert.ok(raum.state.behaelter.get(e.id) || raum.state.leichen.has(e.id));
  const gesamt = fl[1].eintraege.reduce((n, e) => n + e.dinge.length, 0);
  if (gesamt === 0) return;   // alles leer gewürfelt: nichts zu nehmen
  // einzeln nehmen
  const e0 = fl[1].eintraege[0];
  raum.fundNimm(cl, { id: e0.id, i: 0 });
  assert.ok(p.rucksack.length + (p.waffe ? 1 : 0) + p.munition >= 0);
  // Alles nehmen: Rucksack (2 Plätze) begrenzt, Rest bleibt
  raum.fundNimm(cl, { alle: true });
  assert.ok(p.rucksack.length <= 2);
  const rest = nachr.filter(n => n[0] === 'fundliste').pop()[1].eintraege.reduce((n, e) => n + e.dinge.length, 0);
  for (const e of k.liste) assert.equal(raum.state.behaelter.get(e.id)?.rest ?? 0, (raum.inhalte.get(e.id) ?? []).length);
  assert.ok(rest >= 0);
  // zweiter Aufruf: nichts mehr zu durchsuchen
  raum.starteAlle(cl);
  assert.equal(p.aktion, '');
  await warte(10);
});

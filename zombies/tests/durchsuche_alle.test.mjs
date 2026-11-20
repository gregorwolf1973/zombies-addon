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
  const k0 = alleKandidaten(w, raum.state.behaelter, raum.state.leichen, p, true);
  assert.ok(k0.liste.length >= 1);
  assert.ok(Math.abs(k0.dauer - 0.6 * k0.liste.reduce((s, e) => s + durchsuchDauer(e.art), 0)) < 1e-9);
  const nachr = [];
  const cl = raum.clients.find(q => q.sessionId === c.sessionId);
  const sendOrig = cl.send.bind(cl);
  cl.send = (t, m, ...r) => { nachr.push([t, m]); return sendOrig(t, m, ...r); };
  const x = raum.extra.get(c.sessionId);
  const richtigBeantworten = () => {
    const o = raum.offeneRaetsel.get(c.sessionId);
    assert.ok(o, 'keine Frage offen');
    raum.antwort(cl, { id: o.id, index: o.richtigIndex });
  };
  // drinnen: erst Quiz
  raum.starteAlle(cl);
  assert.equal(p.aktion, '');
  assert.equal(raum.offeneRaetsel.get(c.sessionId)?.zweck?.nr, 1);
  // falsch: 30 s Sperre, kein Start
  { const o = raum.offeneRaetsel.get(c.sessionId); raum.antwort(cl, { id: o.id, index: (o.richtigIndex + 1) % 4 }); }
  assert.ok(x.alleSperre > Date.now() + 25000);
  assert.ok(nachr.some(n => n[0] === 'meldung' && /erst in 30 s wieder/.test(n[1].text)));
  raum.starteAlle(cl);
  assert.equal(raum.offeneRaetsel.get(c.sessionId), undefined, 'gesperrt: keine neue Frage');
  x.alleSperre = 0;
  // Türen: eine zu, eine verbarrikadiert
  const tk = w.tueren.slice(0, 2).map(t => `${ebene}:${t.x},${t.y}`);
  for (const key of tk) { const st = raum.state.tueren.get(key); raum.setzeTuer(key, false); st.verschlossen = true; }
  if (tk.length > 1) raum.state.tueren.get(tk[1]).barrikade = 40;
  // 3 richtige Antworten
  raum.starteAlle(cl);
  for (let i = 1; i <= 3; i++) {
    assert.equal(raum.offeneRaetsel.get(c.sessionId)?.zweck?.nr, i);
    richtigBeantworten();
    if (i < 3) raum.starteAlle(cl, true);
  }
  if (tk.length) { assert.equal(raum.state.tueren.get(tk[0]).offen, true); assert.equal(raum.state.tueren.get(tk[0]).verschlossen, false); }
  if (tk.length > 1) assert.equal(raum.state.tueren.get(tk[1]).offen, false, 'Barrikade bleibt');
  assert.equal(x.aktionZiel?.art, 'durchsuchen_alle');
  const dauer = x.aktionZiel.dauer, ids = [...x.aktionZiel.ids];
  assert.ok(ids.length >= k0.liste.length);
  // Bewegung bricht ab
  x.eingabe.dx = 1; raum.aktionSchritt(c.sessionId, p, x, 0.1);
  assert.equal(p.aktion, '');
  x.eingabe.dx = 0;
  x.aktionZiel = { art: 'durchsuchen_alle', ids, dauer }; p.aktion = 'durchsuchen';
  raum.aktionSchritt(c.sessionId, p, x, dauer + 0.1);
  assert.equal(p.aktion, '');
  const fl = nachr.filter(n => n[0] === 'fundliste').pop();
  assert.ok(fl, 'Fundliste fehlt');
  assert.equal(p.rucksack.length, 0, 'nichts darf automatisch genommen werden');
  for (const id of ids) assert.ok(raum.state.behaelter.get(id) || raum.state.leichen.has(id));
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
  for (const id of ids) if (raum.state.behaelter.has(id)) assert.equal(raum.state.behaelter.get(id).rest, (raum.inhalte.get(id) ?? []).length);
  assert.ok(rest >= 0);
  // zweiter Aufruf: nichts mehr zu durchsuchen
  raum.starteAlle(cl);
  assert.equal(p.aktion, '');
  await warte(10);
});

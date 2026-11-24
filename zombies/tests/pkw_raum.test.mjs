// Autos mit Autoschlüssel im echten Raum (Karte geretsried mit geparkten Autos): Schlüssel in Schrank/Kofferraum/Leiche, Einsteigen per
// Aktionstaste nur mit Schlüssel (sonst Kofferraum), das gemalte Auto verschwindet bei allen ('autosWeg'), Fahren/Aussteigen, Schlüssel bleibt;
// Unfallszene: Unfallauto der Verkehrssimulation → Tür auf, Mensch flieht, Zombie verfolgt ihn (Einstellung unfallTuer).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { matchMaker } from '@colyseus/core';
import { Client } from '@colyseus/sdk';
import { starte } from '../server/index.mjs';
import { SpielRaum } from '../server/raum.mjs';
import { setzeKartengroesse, frei } from '../client/welt.mjs';
import { PKW, PKW_VORGABE, parkWinkel, parkAutoFrei, pkwNah } from '../client/pkw.mjs';
import { aufParkAuto } from '../client/fzkollision.mjs';
import { freierPort } from './hilfe.mjs';

let server;
const PORT = await freierPort();
before(async () => { server = await starte({ port: PORT, optionen: { karte: 'geretsried' }, leise: true, datenbank: ':memory:' }); });
after(async () => { await server.gracefullyShutdown(false); setzeKartengroesse(64, 48); });
const warte = ms => new Promise(r => setTimeout(r, ms));
async function bis(bed, ms = 4000) { const e = Date.now() + ms; while (Date.now() < e) { if (bed()) return true; await warte(20); } return bed(); }

async function beitreten(name, einst = {}) {
  const alt = SpielRaum.einstellungen;
  SpielRaum.einstellungen = { ...alt, bots: 0, ...einst, auto: { ...PKW_VORGABE, ...(alt.auto ?? {}), ...(einst.auto ?? {}) } };
  const c = await new Client(`ws://127.0.0.1:${PORT}`).joinOrCreate('zombies', { name, spielerId: crypto.randomBytes(16).toString('hex') });
  const raum = matchMaker.getLocalRoomById(c.roomId);
  raum.zombieFaktor = 0; raum.state.zombies.clear(); raum.zombieInfo.clear(); raum.state.phase = 'spiel';
  const nachrichten = [];
  c.onMessage('*', (typ, m) => nachrichten.push([typ, m]));
  return { c, raum, nachrichten, ende: async () => { try { await c.leave(); } catch { /* weg */ } await bis(() => !SpielRaum.aktiv, 3000); SpielRaum.einstellungen = alt; } };
}

// geparktes Auto mit freiem Platz an der Seite (zum Einsteigen) und freier Fahrt nach vorn
function parkAuto(raum) {
  const w = raum.welt;
  for (const b of w.behaelter) {
    if (!parkAutoFrei(b, w, raum.state)) continue;
    const r = parkWinkel(b), c = Math.cos(r), s = Math.sin(r);
    for (const seite of [1, -1]) {
      const x = b.x - s * seite * (PKW.breite / 2 + 9), y = b.y + c * seite * (PKW.breite / 2 + 9);
      if (frei(w, x, y, 10) && !aufParkAuto(w, x, y, 2) && pkwNah({ x: b.x, y: b.y, richtung: r }, x, y)) return { b, x, y };
    }
  }
  return null;
}

test('Autoschlüssel: liegt in Schrank, Kofferraum und bei Leichen nach Backend-Wert; 0 % = nie', async () => {
  const { raum, ende } = await beitreten('Sucher', { beute: { moebel: 100 }, auto: { schluesselMoebel: 100, schluesselKofferraum: 100, schluesselLeiche: 100 } });
  try {
    raum.befuelle({ id: 'test:schrank', art: 'schrank' });
    raum.befuelle({ id: 'test:auto', art: 'auto' });
    raum.befuelle({ id: 'test:kuehl', art: 'kuehlschrank' });
    assert.ok(raum.inhalte.get('test:schrank').includes('autoschluessel'), 'Schrank');
    assert.ok(raum.inhalte.get('test:auto').includes('autoschluessel'), 'Kofferraum');
    assert.ok(!raum.inhalte.get('test:kuehl').includes('autoschluessel'), 'Kühlschrank');
    const lid = raum.neueLeiche({ x: 300, y: 300, richtung: 0, variante: 1, ebene: '' });
    assert.ok(raum.leichenInhalt.get(lid).includes('autoschluessel'), 'Leiche');
    SpielRaum.einstellungen.auto = { ...SpielRaum.einstellungen.auto, schluesselMoebel: 0, schluesselKofferraum: 0, schluesselLeiche: 0 };
    for (let i = 0; i < 30; i++) { raum.befuelle({ id: 'n:' + i, art: i % 2 ? 'auto' : 'spind' }); assert.ok(!raum.inhalte.get('n:' + i).includes('autoschluessel')); }
    // ein gefundener Schlüssel kommt in den Rucksack
    const p = [...raum.state.spieler.values()][0];
    const inhalt = ['autoschluessel'];
    raum.einpacken(p, inhalt);
    assert.ok([...p.rucksack].includes('autoschluessel'));
  } finally { await ende(); }
});

test('Einsteigen: ohne Schlüssel nur Kofferraum, mit Schlüssel fahren; Auto verschwindet bei allen, Aussteigen, Schlüssel bleibt', async () => {
  const { c, raum, nachrichten, ende } = await beitreten('Fahrerin');
  try {
    const ort = parkAuto(raum);
    assert.ok(ort, 'kein geparktes Auto mit freiem Platz');
    const p = raum.state.spieler.get(c.sessionId);
    p.ebene = ''; p.x = ort.x; p.y = ort.y; p.rucksack.splice(0, p.rucksack.length);
    nachrichten.length = 0;
    c.send('aktion');
    await warte(300);
    assert.ok(!p.imBoxer && !p.anBord, 'ohne Schlüssel eingestiegen');
    assert.ok(nachrichten.some(([t, m]) => t === 'meldung' && /Kofferraum/.test(m.text)), 'kein Kofferraum-Hinweis');
    assert.ok(!raum.fahrbare.liste.length);
    p.rucksack.push('autoschluessel');
    c.send('aktion');
    assert.ok(await bis(() => p.imBoxer && p.anBord), 'mit Schlüssel nicht eingestiegen');
    const fz = raum.fahrbare.von(c.sessionId);
    assert.equal(fz?.art, 'pkw');
    assert.equal(raum.state.fahrzeuge.get(fz.id)?.art, 'pkw');
    assert.ok(raum.welt.autosWeg.has(ort.b.id) && !aufParkAuto(raum.welt, ort.b.x, ort.b.y, 2));
    assert.ok(await bis(() => nachrichten.some(([t, m]) => t === 'autosWeg' && m.ids.includes(ort.b.id))), 'Nachricht autosWeg fehlt');
    assert.ok(await bis(() => nachrichten.some(([t, m]) => t === 'meldung' && /fährst das Auto/.test(m.text))));
    // fahren: Eingabe über die normale Eingabe des Spielers (wie beim Gehen)
    const x0 = fz.f.x, y0 = fz.f.y;
    raum.extra.get(c.sessionId).eingabe = { dx: Math.cos(fz.f.richtung), dy: Math.sin(fz.f.richtung), s: false };
    assert.ok(await bis(() => Math.hypot(fz.f.x - x0, fz.f.y - y0) > 6 || fz.v !== 0, 3000), 'Auto fährt nicht');
    raum.extra.get(c.sessionId).eingabe = { dx: 0, dy: 0, s: false };
    c.send('aktion');
    assert.ok(await bis(() => !p.imBoxer && !p.anBord), 'steigt nicht aus');
    assert.ok([...p.rucksack].includes('autoschluessel'), 'Schlüssel weg');
    assert.equal(raum.fahrbare.liste.length, 1, 'Auto bleibt stehen');
    // wieder einsteigen geht (ein Schlüssel = beliebig viele Fahrten)
    p.x = fz.f.x - Math.sin(fz.f.richtung) * (PKW.breite / 2 + 8); p.y = fz.f.y + Math.cos(fz.f.richtung) * (PKW.breite / 2 + 8);
    await warte(150);
    c.send('aktion');
    assert.ok(await bis(() => p.imBoxer), 'zweite Fahrt geht nicht');
    // neuer Mitspieler bekommt die Liste der weggefahrenen Autos beim Beitritt
    const c2 = await new Client(`ws://127.0.0.1:${PORT}`).joinOrCreate('zombies', { name: 'Neu', spielerId: crypto.randomBytes(16).toString('hex') });
    const n2 = []; c2.onMessage('autosWeg', m => n2.push(m));
    assert.ok(await bis(() => n2.some(m => m.ids.includes(ort.b.id))), 'Beitritt ohne autosWeg');
    await c2.leave();
  } finally { await ende(); }
});

test('Unfallszene: Unfallauto öffnet die Tür, ein Mensch flieht, ein Zombie verfolgt ihn; Einstellung 0 % = nie', async () => {
  const { raum, nachrichten, ende } = await beitreten('Zeuge', { unfallTuer: 100, unfall: 0 });
  try {
    const v = raum.verkehr, u = v.unfaelle, s = raum.state;
    const k = v.graph.knoten.find(n => n.nach.length && frei(raum.welt, n.x, n.y, 14));
    const id = v.neu('auto', k), f = s.fahrzeuge.get(id);
    const menschen0 = s.menschen.size;
    u.aufprall(id, f, v.info.get(id) ?? {}, null);
    assert.equal(f.art, 'wrack');
    assert.equal(s.menschen.size, menschen0 + 1, 'kein Mensch aus dem Auto');
    const [mid, m] = [...s.menschen].find(([i]) => raum.stadt.info.get(i)?.unfall);
    assert.ok(Math.hypot(m.x - f.x, m.y - f.y) < 50, 'Mensch nicht am Auto');
    assert.ok(m.sichtbar && !m.infiziert && raum.stadt.info.get(mid).ziel?.art === 'haus', 'Mensch will nicht zum Haus');
    const zs = [...s.zombies].filter(([, z]) => Math.hypot(z.x - f.x, z.y - f.y) < 60);
    assert.equal(zs.length, 1, 'kein Zombie am Auto');
    const info = raum.zombieInfo.get(zs[0][0]);
    assert.ok(info.mensch === mid || (info.punkt && Math.hypot(info.punkt.x - m.x, info.punkt.y - m.y) < 1), 'Zombie verfolgt nicht');
    assert.ok(await bis(() => nachrichten.some(([t]) => t === 'autotuer')), 'Tür-Animation fehlt');
    // ein paar Takte: der Mensch flieht (bewegt sich weg), der Zombie folgt
    const m0 = { x: m.x, y: m.y };
    for (let t = 0; t < 30; t++) { raum.stadt.schritt(0.05); raum.zombieSchritt?.(zs[0][0], zs[0][1], 0.05); }
    assert.ok(!s.menschen.has(mid) || Math.hypot(m.x - m0.x, m.y - m0.y) > 5 || m.infiziert, 'Mensch steht still');
    // 0 %: keine Szene
    SpielRaum.einstellungen.unfallTuer = 0;
    const id2 = v.neu('auto', k), f2 = s.fahrzeuge.get(id2), n0 = s.menschen.size, z0 = s.zombies.size;
    u.aufprall(id2, f2, v.info.get(id2) ?? {}, null);
    assert.equal(s.menschen.size, n0); assert.equal(s.zombies.size, z0);
  } finally { await ende(); }
});

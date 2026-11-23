// Zombie-Figuren: Server wählt beim Erzeugen nach Einstellung (aktiv, Anteil); Sonderfälle; Schalter aus = alte Typen; Verwaltung zeigt die Liste
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { matchMaker } from '@colyseus/core';
import { Client } from '@colyseus/sdk';
import { starte } from '../server/index.mjs';
import { SpielRaum } from '../server/raum.mjs';
import { zfFigur, zfFigurenEinst, ZF_LISTE } from '../client/zombiefiguren.mjs';
import { oeffentlich, vorgaben } from '../server/einstellungen.mjs';
import { freierPort } from './hilfe.mjs';

const PORT = await freierPort();
let server;
before(async () => { server = await starte({ port: PORT, optionen: { karte: 'dorf' }, leise: true, datenbank: ':memory:' }); });
after(async () => { await server.gracefullyShutdown(false); });

test('setzeZombie wählt nur aktive Figuren; Sonderfälle (Variante 20/0) bleiben; Schalter aus = alte Typenliste', async () => {
  const c = await new Client(`http://127.0.0.1:${PORT}`).create('schiessstand', { name: 'ZF' });
  const raum = matchMaker.getLocalRoomById(c.roomId);
  const alt = SpielRaum.einstellungen;
  try {
    const aus = { warzombie: { an: false }, copzombie: { an: false }, zombiegirl: { an: false }, yaku: { an: true, anteil: 100 }, romero: { an: false } };
    const setze = (figuren, neu = true) => { SpielRaum.einstellungen = { ...alt, zombieFigurenNeu: neu, zombieFiguren: zfFigurenEinst(figuren), zombieTypen: [3] }; };
    setze(aus);
    for (let i = 0; i < 20; i++) assert.equal(zfFigur(raum.state.zombies.get(raum.setzeZombie(10, 10)).variante), 'yaku');
    const z = raum.state.zombies.get(raum.setzeZombie(10, 10)); z.variante = 20;   // wie menschen.mjs/polizei.mjs
    assert.equal(zfFigur(z.variante), 'copzombie', 'verwandelter Polizist trotz deaktivierter Figur');
    z.variante = 0; assert.equal(zfFigur(z.variante), 'warzombie');
    // Anteile wirken: 100/0 → nur eine, gleichmäßig → mehrere
    setze({ ...aus, yaku: { an: true, anteil: 50 }, romero: { an: true, anteil: 50 } });
    const n = new Set(); for (let i = 0; i < 60; i++) n.add(zfFigur(raum.state.zombies.get(raum.setzeZombie(10, 10)).variante));
    assert.deepEqual([...n].sort(), ['romero', 'yaku']);
    setze(aus, false);
    assert.equal(raum.state.zombies.get(raum.setzeZombie(10, 10)).variante, 3, 'Schalter aus: alte Typenliste');
  } finally { SpielRaum.einstellungen = alt; await c.leave(); }
});

test('Einstellung: figuren kommt für jede Figur der Liste, Teiländerung je Figur, mindestens eine an', () => {
  const o = oeffentlich(vorgaben());
  assert.deepEqual(Object.keys(o.zombies.figuren), ZF_LISTE.map(f => f.id));
  assert.equal(o.zombies.figuren.warzombie.an, true);
});

test('Verwaltung: Figurenblock, Liste aus zombiefiguren.mjs, alte Typen eingeklappt', () => {
  const html = fs.readFileSync(new URL('../client/verwaltung.html', import.meta.url), 'utf8');
  for (const id of ['zfBlock', 'zfListe']) assert.ok(html.includes('id="' + id + '"'), id);
  assert.match(html, /import\('\.\/zombiefiguren\.mjs'\)/);
  assert.match(html, /Alte Zombiebilder/);
  assert.match(html, /grafik\/zombies_neu\.json/);
});

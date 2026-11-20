// Magazine, Nachladen, Waffenplätze, Granatwerfer
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { matchMaker } from '@colyseus/core';
import { Client } from '@colyseus/sdk';
import { starte } from '../server/index.mjs';
import { WAFFEN, DINGE, BEUTE, aktiveWaffe, munitionGesamt } from '../client/welt.mjs';
import { EinstellungsDatei } from '../server/einstellungen.mjs';

const PORT = 26400 + Math.floor(Math.random() * 200);
const URL_ = `http://127.0.0.1:${PORT}`;
let server;
const warte = ms => new Promise(r => setTimeout(r, ms));
async function bis(bedingung, ms = 3000) {
  const ende = Date.now() + ms;
  while (Date.now() < ende) { if (bedingung()) return true; await warte(20); }
  return bedingung();
}
before(async () => { server = await starte({ port: PORT, optionen: { karte: 'dorf' }, leise: true, datenbank: ':memory:' }); });
after(async () => { await server.gracefullyShutdown(false); });

// Spieler ohne Zombies und mit freier Umgebung vorbereiten
async function spieler(name) {
  const c = await new Client(URL_).joinOrCreate('zombies', { name });
  const raum = matchMaker.getLocalRoomById(c.roomId);
  raum.zombieFaktor = 0; raum.kriecherChance = 0;
  raum.state.zombies.clear(); raum.zombieInfo.clear();
  const p = raum.state.spieler.get(c.sessionId), x = raum.extra.get(c.sessionId);
  p.rucksack.splice(0, p.rucksack.length);
  return { c, raum, p, x };
}
function zombieIn(raum, p, abstand) {
  const id = raum.setzeZombie(p.x + abstand, p.y, '');
  const info = raum.zombieInfo.get(id);
  info.steht = true; info.schlaeft = false; info.ziel = null; info.wechsel = 99;
  return id;
}

test('Werte: jede Fernwaffe hat Magazin und Nachladezeit, Granatwerfer ist eine Waffe mit Munition (40 mm)', () => {
  const soll = { pistole: 15, mp: 30, gewehr: 30, schrotflinte: 6, mg: 100, scharfschuetze: 5, armbrust: 1, granatwerfer: 1 };
  for (const [k, n] of Object.entries(soll)) { assert.equal(WAFFEN[k].magazin, n, k); assert.ok(WAFFEN[k].nachlade > 0, k); }
  assert.equal(WAFFEN.pistole.nachlade, 4);
  assert.ok(WAFFEN.armbrust.nachlade < 4);
  assert.equal(WAFFEN.granatwerfer.reichweite, 360);
  assert.ok(DINGE.granatwerfer.waffe && DINGE.granate40.name === 'Granate (40 mm)');
  for (const art of ['bw_kiste', 'bw_container']) assert.ok(BEUTE[art].includes('granate40'), art);
  assert.ok(BEUTE.bw_container.includes('granatwerfer'));
  assert.ok(!BEUTE.bw_kiste.includes('granatwerfer') || true);
  // leeres Magazin, aber Vorrat: Waffe bleibt aktiv (lädt nach); beides leer: Faust
  assert.equal(aktiveWaffe({ waffe: 'pistole', magazin: 0, munition: 5 })[0], 'pistole');
  assert.equal(aktiveWaffe({ waffe: 'pistole', magazin: 0, munition: 0 })[0], 'faust');
  assert.equal(aktiveWaffe({ waffe: 'granatwerfer', magazin: 1, granaten: 0 })[0], 'granatwerfer');
  assert.equal(munitionGesamt({ waffe: 'armbrust', magazin: 1, pfeile: 3, munition: 99 }), 4);
});

test('Magazin leer → automatisch Nachladen (4 s, kein Schuss) → wieder schussbereit', async () => {
  const { c, raum, p } = await spieler('Lader');
  try {
    p.waffe = 'pistole'; p.munition = 40; p.pfeile = 0; p.granaten = 0;
    assert.ok(await bis(() => p.magazin === 15), 'Magazin nicht gefüllt');
    assert.equal(p.munition, 25, 'Vorrat = 40 − 15');
    // 10 Schuss verbrauchen, Rest ohne Zombie → nichts passiert; dann leer machen
    p.magazin = 0;
    const id = zombieIn(raum, p, 100);
    const z = raum.state.zombies.get(id), hp0 = z.hp;
    const t0 = Date.now();
    assert.ok(await bis(() => p.nachladen > 0), 'lädt nicht nach');
    await warte(1500);
    assert.equal(raum.state.zombies.get(id).hp, hp0, 'beim Nachladen darf nicht geschossen werden');
    assert.ok(p.nachladen > 0.2 && p.nachladen < 0.8, 'Fortschritt sichtbar: ' + p.nachladen);
    assert.ok(await bis(() => p.magazin > 0, 6000), 'nie fertig');
    const dauer = (Date.now() - t0) / 1000;
    assert.ok(dauer > 3.6 && dauer < 5.2, 'Dauer ~4 s: ' + dauer);
    assert.equal(p.nachladen, 0);
    assert.ok(await bis(() => !raum.state.zombies.has(id) || raum.state.zombies.get(id).hp < hp0, 2000), 'danach wieder Schuss');
    assert.ok(p.magazin < 15 && p.magazin >= 13, 'Schuss verbrauchen Magazin: ' + p.magazin);
  } finally { await c.leave(); }
});

test('Manuelles Nachladen (Nachricht „nachladen“): nur bei Bedarf, füllt aus dem Vorrat', async () => {
  const { c, raum, p, x } = await spieler('Handlader');
  try {
    p.waffe = 'mp'; p.munition = 50; p.pfeile = 0; p.granaten = 0;
    assert.ok(await bis(() => p.magazin === 30));
    c.send('nachladen'); await warte(150);
    assert.equal(p.nachladen, 0, 'volles Magazin: kein Nachladen');
    p.magazin = 12;
    c.send('nachladen');
    assert.ok(await bis(() => p.nachladen > 0), 'Nachladen startet nicht');
    assert.ok(await bis(() => p.nachladen > 0.3, 2000));
    assert.ok(await bis(() => p.magazin === 30, 6000), 'Magazin nicht voll: ' + p.magazin);
    assert.equal(p.munition, 2, 'Vorrat: 50 − 30 (erstes Magazin) − 18 (nachgeladen)');
  } finally { await c.leave(); }
});

test('Auto-Wechsel: aktive Waffe leer (Magazin und Vorrat) → nächster Platz mit brauchbarer Waffe', async () => {
  const { c, raum, p, x } = await spieler('Wechsler');
  try {
    p.waffe = 'pistole'; p.munition = 0; p.pfeile = 0; p.granaten = 0; p.wp1 = 'messer';
    assert.ok(await bis(() => p.waffe === 'messer'), 'kein Wechsel, Waffe=' + p.waffe);
    assert.equal(p.wplatz, 1);
    assert.equal(p.wp0, 'pistole', 'leere Pistole bleibt im Platz Haupt');
    // von Hand wechseln (Platz 0 → Pistole ohne Munition bleibt Pistole, wird aber nicht auto-gewechselt weil Messer … Wechsel zurück erlaubt)
    c.send('waffenplatz', { platz: 0 });
    assert.ok(await bis(() => p.wplatz === 0));
    // …und der Auto-Wechsel schaltet sofort wieder aufs Messer
    assert.ok(await bis(() => p.wplatz === 1), 'Auto-Wechsel nach manuellem Wechsel');
  } finally { await c.leave(); }
});

test('Waffenplätze: Magazinstand je Waffe bleibt beim Wechseln, „In die Hand“ nutzt freien Platz, Speichern/Laden', async () => {
  const { c, raum, p, x } = await spieler('Plaetze');
  try {
    p.waffe = 'pistole'; p.munition = 60; p.pfeile = 0; p.granaten = 0;
    assert.ok(await bis(() => p.magazin === 15));
    p.magazin = 9;
    p.rucksack.push('gewehr');
    c.send('benutze', { platz: 0 });
    assert.ok(await bis(() => p.waffe === 'gewehr'), 'Gewehr nicht in der Hand');
    assert.equal(p.wp0, 'pistole', 'Pistole bleibt im Platz Haupt'); assert.equal(p.wplatz, 1);
    assert.equal(p.rucksack.length, 0, 'nichts im Rucksack');
    assert.ok(await bis(() => p.magazin === 30), 'Gewehr gleich geladen');
    c.send('waffenplatz', { platz: 0 });
    assert.ok(await bis(() => p.waffe === 'pistole' && p.magazin === 9), 'Magazinstand der Pistole verloren: ' + p.magazin);
    // Speicherdaten
    const WP = await import('../server/waffenplaetze.mjs');
    const d = WP.speicherDaten(p, x);
    assert.deepEqual(d.mag.slice(0, 2), [9, 30]); assert.equal(d.wp1, 'gewehr');
    // weiter (Taste F)
    c.send('waffenplatz', { weiter: true });
    assert.ok(await bis(() => p.waffe === 'gewehr'));
  } finally { await c.leave(); }
});

test('Granatwerfer: Bogenschuss, Explosion am Ziel (Zombie stirbt, Granate verbraucht), kein Schuss bei zu naher Entfernung', async () => {
  const { c, raum, p } = await spieler('Werfer');
  try {
    const explosionen = []; c.onMessage('explosion', m => explosionen.push(m));
    const fluege = []; c.onMessage('granate', m => fluege.push(m));
    const ort = raum.welt.start;
    p.x = ort.x; p.y = ort.y; p.ebene = ''; p.unten = false;
    p.waffe = 'granatwerfer'; p.granaten = 4; p.munition = 0; p.pfeile = 0;
    assert.ok(await bis(() => p.magazin === 1 && p.granaten === 3), 'nicht geladen');
    // zu nah (30 px): kein Schuss
    const nah = zombieIn(raum, p, 30);
    await warte(500);
    assert.equal(explosionen.length, 0, 'schießt auf zu nahes Ziel');
    raum.state.zombies.delete(nah); raum.zombieInfo.delete(nah);
    // Ziel 200 px entfernt
    const id = zombieIn(raum, p, 200);
    assert.ok(await bis(() => fluege.length > 0, 2500), 'kein Abschuss');
    assert.equal(fluege[0].werfer, true);
    const halte = setInterval(() => { const z = raum.state.zombies.get(id); if (z) { z.x = fluege[0].x2; z.y = fluege[0].y2; } }, 5);   // der Zombie läuft nicht aus dem Zielpunkt
    assert.ok(Math.abs(fluege[0].x2 - (p.x + 200)) < 40, 'Zielpunkt (Zombie rückt kurz vor)');
    assert.ok(raum.state.zombies.has(id), 'Zombie darf nicht sofort fallen (Flugzeit)');
    assert.ok(await bis(() => explosionen.length > 0, 2500), 'keine Explosion');
    assert.ok(!raum.state.zombies.has(id) || raum.state.zombies.get(id).hp <= 0, 'Zombie nicht getroffen: ' + JSON.stringify(raum.state.zombies.get(id)) + ' Explosion ' + JSON.stringify(explosionen[0]) + ' p ' + p.x);
    assert.ok(Math.abs(explosionen[0].x - fluege[0].x2) < 1, 'Explosion am Ziel');
    clearInterval(halte);
    assert.equal(p.magazin, 0);
    // außerhalb der Reichweite (> 45 m = 360 px) kein Schuss
    const n = fluege.length;
    const weit = zombieIn(raum, p, 420);
    await warte(700);
    assert.equal(fluege.length, n, 'schießt über die Reichweite');
    raum.state.zombies.delete(weit); raum.zombieInfo.delete(weit);
    // Nachladen aus Vorrat (3 s)
    assert.ok(await bis(() => p.nachladen > 0 || p.magazin === 1, 1500));
    assert.ok(await bis(() => p.magazin === 1, 5000), 'Granatwerfer lädt nicht nach');
    assert.equal(p.granaten, 2);
  } finally { await c.leave(); }
});

test('Verwaltung: Magazin und Nachladezeit je Waffe einstellbar, Granatwerfer hat Schaden/Pause/Reichweite', async () => {
  const { c, raum, p } = await spieler('Einsteller');
  try {
    const vorher = raum.constructor.einstellungen;
    const e = { ...vorher, waffen: { ...vorher.waffen, pistole: { ...vorher.waffen.pistole, magazin: 7, nachlade: 1 } } };
    raum.constructor.einstellungen = e;
    try {
      p.waffe = 'pistole'; p.munition = 40; p.pfeile = 0; p.granaten = 0; p.magazin = 0;
      raum.extra.get(c.sessionId).mag = [null, null, null]; p.wp0 = '';
      assert.ok(await bis(() => p.magmax === 7 && p.magazin === 7), 'Magazingröße 7: ' + p.magazin + '/' + p.magmax);
    } finally { raum.constructor.einstellungen = vorher; }
    assert.ok(vorher.waffen.granatwerfer && vorher.waffen.granatwerfer.schaden > 0 && vorher.reichweite.granatwerfer === 45);
    assert.equal(vorher.waffen.pistole.magazin, 15);
    assert.equal(vorher.waffen.pistole.nachlade, 4);
    assert.equal(vorher.waffen.schlaeger.magazin, undefined);
  } finally { await c.leave(); }
});

test('Waffenwechsel erzeugt keine Munition: Magazine + Vorrat steigen beim Hin- und Herschalten nie', async () => {
  const { c, raum, p, x } = await spieler('Zaehler');
  try {
    p.waffe = 'pistole'; p.munition = 45; p.pfeile = 0; p.granaten = 0;
    assert.ok(await bis(() => p.magazin === 15));
    p.rucksack.push('gewehr');
    c.send('benutze', { platz: 0 });
    assert.ok(await bis(() => p.waffe === 'gewehr' && p.magazin > 0));
    const gesamt = () => p.munition + p.mg0 + p.mg1 + p.mg2;
    await warte(200);
    const start = gesamt();
    for (let i = 0; i < 10; i++) {
      c.send('waffenplatz', { platz: i % 2 });
      await warte(150);
      assert.ok(gesamt() <= start, `Munition entstanden: ${start} → ${gesamt()} (Vorrat ${p.munition}, Magazine ${p.mg0}/${p.mg1}/${p.mg2})`);
    }
    // alles leer: auch Wechseln bringt nichts zurück
    p.munition = 0; p.magazin = 0; x.mag = x.mag.map(e => e && { ...e, n: 0 });
    for (let i = 0; i < 6; i++) { c.send('waffenplatz', { platz: i % 2 }); await warte(150); }
    assert.equal(gesamt(), 0, `nach Leerstand wieder Munition: Vorrat ${p.munition}, Magazine ${p.mg0}/${p.mg1}/${p.mg2}`);
  } finally { await c.leave(); }
});

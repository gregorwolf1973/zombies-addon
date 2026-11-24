// Haustüren und Zimmertüren: Zombies kommen hinein, hämmern Türen und Barrikaden auf; Verbarrikadieren überall
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
import { KACHEL, T, frei, schlossArt, ladenArt } from '../client/welt.mjs';
import { freierPort } from './hilfe.mjs';

const PORT = await freierPort();
const URL_ = `http://127.0.0.1:${PORT}`;
const ordner = fs.mkdtempSync(path.join(os.tmpdir(), 'zombies-tueren-'));
let server;
const warte = ms => new Promise(r => setTimeout(r, ms));
async function bis(bedingung, ms = 3000) {
  const ende = Date.now() + ms;
  while (Date.now() < ende) { if (bedingung()) return true; await warte(20); }
  return bedingung();
}
const neueId = () => crypto.randomBytes(16).toString('hex');
const mitteK = k => ({ x: (k.x + 0.5) * KACHEL, y: (k.y + 0.5) * KACHEL });

before(async () => { server = await starte({ port: PORT, optionen: { karte: 'dorf' }, leise: true, datenbank: path.join(ordner, 'spiel.db') }); SpielRaum.einstellungen.innenMassstab = false; });   // prüft das grobe Innenraster (maßstäbliche Innenräume: innen_fein_spiel.test.mjs)
after(async () => { await server.gracefullyShutdown(false); fs.rmSync(ordner, { recursive: true, force: true }); });

async function beitreten(name, spielerId = neueId()) {
  const c = await new Client(URL_).joinOrCreate('zombies', { name, spielerId });
  const raum = matchMaker.getLocalRoomById(c.roomId);
  raum.zombieFaktor = 0; raum.state.zombies.clear(); raum.zombieInfo.clear();
  const meldungen = [];
  c.onMessage('meldung', m => meldungen.push(m.text));
  return { c, raum, p: raum.state.spieler.get(c.sessionId), meldungen, spielerId };
}

// n-tes normale (kein Safe Room) betretbare Haus
// betretbares Haus (kein Safe Room), vor dessen Tür drei Kacheln weit Platz ist (nicht am Kartenrand)
function normalesHaus(raum, n) {
  const safe = new Set(raum.welt.safeRooms.map(s => s.haus.nr));
  const platz = h => [1.2, 2, 3].every(f => { const q = vorDerTuer(h, f); return frei(raum.welt, q.x, q.y, 12); });
  return raum.welt.haeuser.filter(h => h.betretbar && !safe.has(h.nr) && platz(h))[n];
}
const ebeneVon = h => `h${h.nr}eg`;
function hinein(raum, p, h) {
  const w = raum.wv(ebeneVon(h)), ort = raum.nebenKachel(w, w.ausgang);
  p.ebene = ebeneVon(h); p.x = ort.x; p.y = ort.y;
  raum.state.zombies.clear(); raum.zombieInfo.clear();
  return w;
}
function vorDerTuer(h, faktor = 1.2) {
  const r = h.raus ?? { dx: 0, dy: 1 }, m = mitteK(h.tuer);
  return { x: m.x + r.dx * KACHEL * faktor, y: m.y + r.dy * KACHEL * faktor };
}
function zombieDraussen(raum, pos) {
  const id = raum.setzeZombie(pos.x, pos.y, '');
  const z = raum.state.zombies.get(id), info = raum.zombieInfo.get(id);
  info.schlaeft = false; info.steht = false;
  return { id, z, info };
}
function schritte(raum, id, z, n, bedingung) {
  for (let i = 0; i < n; i++) {
    raum.zombieSchritt(id, z, 0.05);
    if (bedingung?.()) return i + 1;
  }
  return n;
}

test('Offene Haustür: der Zombie folgt dem Gejagten ins Haus', async () => {
  const { c, raum, p } = await beitreten('Gejagter');
  try {
    const h = normalesHaus(raum, 0);
    hinein(raum, p, h);
    const { id, z, info } = zombieDraussen(raum, vorDerTuer(h, 3));
    info.ziel = c.sessionId;
    assert.equal(z.ebene, '');
    const start = { x: z.x, y: z.y };
    schritte(raum, id, z, 400, () => z.ebene === ebeneVon(h));
    assert.equal(z.ebene, ebeneVon(h), 'Zombie ist nicht hineingefolgt: ' + JSON.stringify({ start, z: { x: Math.round(z.x), y: Math.round(z.y) }, tuer: mitteK(h.tuer), raus: h.raus, info: { ziel: info.ziel, punkt: info.punkt, jagt: z.jagt, steht: info.steht }, tuerst: raum.state.tueren.get('haus:' + h.nr)?.toJSON?.() }));
  } finally { await c.leave(); }
});

test('Geschlossene Haustür: Zombie hämmert, Tür bricht, dann kommt er hinein', async () => {
  const { c, raum, p, meldungen } = await beitreten('Hausherr');
  try {
    const h = normalesHaus(raum, 1), key = 'haus:' + h.nr;
    hinein(raum, p, h);
    raum.setzeTuer(key, false);
    const st = raum.state.tueren.get(key);
    assert.equal(st.offen, false);
    const { id, z, info } = zombieDraussen(raum, vorDerTuer(h, 2));
    info.punkt = mitteK(h.tuer);
    // nach 10 s: noch zu, aber angeschlagen
    schritte(raum, id, z, 200, () => z.ebene !== '');
    assert.equal(z.ebene, '', 'Zombie ist durch die geschlossene Tür');
    assert.ok(st.hp < 100 && !st.kaputt, `Tür nicht angeschlagen (hp ${st.hp})`);
    // nach etwa 25 s Hämmern ist sie kaputt
    const n = schritte(raum, id, z, 1500, () => st.kaputt);
    assert.ok(st.kaputt && st.offen && st.hp === 0, 'Tür ist nicht zerbrochen');
    assert.ok(n < 600, `zu langsam: ${n} Schritte`);
    schritte(raum, id, z, 300, () => z.ebene !== '');
    assert.equal(z.ebene, ebeneVon(h), 'Zombie kommt nach dem Bruch nicht hinein');
    assert.ok(await bis(() => meldungen.some(m => m.includes('hämmern')) && meldungen.some(m => m.includes('zerbrochen'))), 'Meldungen fehlen: ' + meldungen);
    // zerbrochen: nicht mehr schließbar
    raum.setzeTuer(key, false);
    assert.equal(st.offen, true);
  } finally { await c.leave(); }
});

test('Barrikade hält zuerst, dann die Tür selbst; mehrere Zombies sind schneller', async () => {
  const { c, raum, p } = await beitreten('Barrikadenbauer');
  try {
    const h = normalesHaus(raum, 2), key = 'haus:' + h.nr;
    hinein(raum, p, h);
    raum.setzeTuer(key, false);
    raum.setzeBarrikade(key, 70);
    const st = raum.state.tueren.get(key);
    const a = zombieDraussen(raum, vorDerTuer(h, 2));
    a.info.punkt = mitteK(h.tuer);
    schritte(raum, a.id, a.z, 2000, () => raum.tuerBarrikade(key) <= 0);
    assert.equal(raum.tuerBarrikade(key), 0, 'Barrikade bleibt stehen');
    assert.equal(st.hp, 100, 'Tür wurde vor der Barrikade beschädigt');
    schritte(raum, a.id, a.z, 20);
    assert.ok(st.hp < 100, 'danach wird die Tür beschädigt');
    const einzeln = schritte(raum, a.id, a.z, 2000, () => st.kaputt);
    assert.ok(st.kaputt);
    // zu zweit: doppelt so schnell (Barrikade + Tür zusammen gemessen)
    raum.state.zombies.clear(); raum.zombieInfo.clear();
    st.kaputt = false; st.hp = 100; raum.setzeTuer(key, false); raum.setzeBarrikade(key, 0);
    const z1 = zombieDraussen(raum, vorDerTuer(h, 2)), z2 = zombieDraussen(raum, vorDerTuer(h, 2.7));
    for (const q of [z1, z2]) { q.info.punkt = mitteK(h.tuer); q.info.tempo = 1; }   // gemessen wird das Aufbrechen, nicht das (zufällige) Lauftempo
    let zu2 = 0;
    for (; zu2 < 3000 && !st.kaputt; zu2++) { raum.zombieSchritt(z1.id, z1.z, 0.05); raum.zombieSchritt(z2.id, z2.z, 0.05); }
    assert.ok(st.kaputt, 'zu zweit bricht die Tür nicht');
    assert.ok(zu2 < 520, `zu zweit nicht schneller: ${zu2} Schritte`);
  } finally { await c.leave(); }
});

// zwei gegenüberliegende Bodenkacheln neben einer Zimmertür
function seitenDerTuer(w, t) {
  for (const [dx, dy] of [[1, 0], [0, 1]]) {
    if (w.hole(t.x + dx, t.y + dy) === T.BODEN && w.hole(t.x - dx, t.y - dy) === T.BODEN) return [mitteK({ x: t.x - dx, y: t.y - dy }), mitteK({ x: t.x + dx, y: t.y + dy })];
  }
  return null;
}

test('Jagender Zombie bricht eine geschlossene (auch verschlossene) Zimmertür auf', async () => {
  const { c, raum, p } = await beitreten('Eingesperrter');
  try {
    let gefunden = null;
    for (let n = 3; !gefunden && n < 40; n++) {
      const h = normalesHaus(raum, n);
      if (!h) break;
      const w = raum.wv(ebeneVon(h));
      for (const t of w.tueren) { const s = seitenDerTuer(w, t); if (s) { gefunden = { h, w, t, s }; break; } }
    }
    assert.ok(gefunden, 'keine passende Zimmertür');
    const { h, w, t, s } = gefunden, key = `${ebeneVon(h)}:${t.x},${t.y}`;
    for (const verschlossen of [false, true]) {
      raum.state.zombies.clear(); raum.zombieInfo.clear();
      raum.state.tueren.get(key).kaputt = false; raum.state.tueren.get(key).hp = 100;
      raum.setzeTuer(key, true); raum.setzeTuer(key, false);
      raum.state.tueren.get(key).verschlossen = verschlossen;
      const st = raum.state.tueren.get(key);
      p.ebene = ebeneVon(h); p.x = s[1].x; p.y = s[1].y;
      const id = raum.setzeZombie(s[0].x, s[0].y, ebeneVon(h));
      const z = raum.state.zombies.get(id), info = raum.zombieInfo.get(id);
      info.schlaeft = false; info.ziel = c.sessionId;
      let n = 0;
      for (; n < 2500 && !st.kaputt; n++) {
        if (n % 10 === 0) raum.baueFeld(ebeneVon(h));
        p.hp = 100; p.x = s[1].x; p.y = s[1].y;
        raum.zombieSchritt(id, z, 0.05);
      }
      assert.ok(st.kaputt, `Tür (verschlossen=${verschlossen}) nicht aufgebrochen`);
      assert.equal(w.hole(t.x, t.y), T.TUER_OFFEN, 'Kachel nicht offen');
      assert.equal(st.offen, true);
      assert.equal(st.verschlossen, false);
      if (verschlossen) assert.ok(n > 450, 'verschlossene Tür hält nicht länger');
    }
  } finally { await c.leave(); }
});

test('Verbarrikadieren: Zimmertür, Haustür von innen und von außen; zweite Taste schließt', async () => {
  const { c, raum, p } = await beitreten('Tischler');
  try {
    const h = normalesHaus(raum, 3), key = 'haus:' + h.nr;
    const w = hinein(raum, p, h);
    p.rucksack.clear(); for (let i = 0; i < 6; i++) p.rucksack.push('bretter');
    // Haustür von innen (am Ausgang)
    assert.equal(raum.tuerKontext(p, 'zu').art, 'barrikade');
    assert.equal(raum.tuerKontext(p, 'zweit').art, 'tuer_zu');
    c.send('aktion2');
    assert.ok(await bis(() => raum.state.tueren.get(key)?.offen === false), 'Haustür geht nicht zu');
    assert.equal(raum.tuerKontext(p, 'zweit').art, 'barrikade', 'bei geschlossener Tür ist Barrikade die zweite Möglichkeit');
    c.send('aktion2');
    assert.ok(await bis(() => raum.tuerBarrikade(key) >= 35, 5000), 'keine Barrikade an der Haustür');
    assert.equal(p.rucksack.length, 5);
    assert.equal(raum.state.tueren.get(key).barrikade, 35);
    // von außen
    p.ebene = ''; const v = vorDerTuer(h, 1.2); p.x = v.x; p.y = v.y;
    const k = raum.kontext(p);
    assert.equal(k?.art, 'tuer_auf', 'draußen vor der geschlossenen Tür: öffnen');
    c.send('aktion2');
    assert.ok(await bis(() => raum.tuerBarrikade(key) >= 70, 5000), 'keine Barrikade von außen');
    // Zimmertür
    const w2 = raum.wv(ebeneVon(h));
    const t = w2.tueren.find(t => seitenDerTuer(w2, t));
    if (t) {
      const ik = `${ebeneVon(h)}:${t.x},${t.y}`, s = seitenDerTuer(w2, t);
      raum.setzeTuer(ik, true);
      p.ebene = ebeneVon(h); p.x = s[0].x; p.y = s[0].y;
      assert.equal(raum.kontext(p)?.art, 'barrikade');
      c.send('aktion');
      assert.ok(await bis(() => raum.tuerBarrikade(ik) >= 35, 5000), 'keine Barrikade an der Zimmertür');
      assert.equal(raum.state.tueren.get(ik).barrikade, 35);
    }
  } finally { await c.leave(); }
});

test('Menschen gehen durch geschlossene, verbarrikadierte Haustüren (Tür geht dabei auf)', async () => {
  const { c, raum, p } = await beitreten('Durchgänger');
  try {
    const h = normalesHaus(raum, 4), key = 'haus:' + h.nr, r = h.raus ?? { dx: 0, dy: 1 };
    raum.setzeTuer(key, false); raum.setzeBarrikade(key, 100);
    const v = vorDerTuer(h, 1.3); p.ebene = ''; p.x = v.x; p.y = v.y;
    c.send('eingabe', { dx: -r.dx, dy: -r.dy });
    assert.ok(await bis(() => p.ebene === ebeneVon(h), 4000), 'kommt nicht hinein');
    c.send('eingabe', { dx: 0, dy: 0 });
    assert.equal(raum.state.tueren.get(key).offen, true);
    assert.equal(raum.tuerBarrikade(key), 100, 'Barrikade bleibt für Zombies');
    // eine Zombie bleibt davon unbeeindruckt draußen
    const z = zombieDraussen(raum, vorDerTuer(h, 2));
    z.info.punkt = mitteK(h.tuer);
    schritte(raum, z.id, z.z, 100);
    assert.equal(z.z.ebene, '');
  } finally { await c.leave(); }
});

test('Bots bleiben an geschlossenen Haustüren nicht hängen und bauen keine Barrikaden ab', async () => {
  const { c, raum, p } = await beitreten('Gastgeber');
  try {
    const h = normalesHaus(raum, 5), key = 'haus:' + h.nr;
    raum.setzeTuer(key, false); raum.setzeBarrikade(key, 50);
    const x = { wechselSperre: 0, bot: { uebergangZiel: mitteK(h.tuer) } };
    const q = { x: mitteK(h.tuer).x, y: mitteK(h.tuer).y, ebene: '', aktion: '', fortschritt: 0 };
    raum.uebergang(null, q, x, 0.05);
    assert.equal(q.ebene, ebeneVon(h), 'Bot kommt nicht durch die Tür');
    assert.equal(raum.tuerBarrikade(key), 50);
  } finally { await c.leave(); }
});

test('Speichern: Haustür und Zimmertür mit Barrikade, Haltbarkeit und Bruch bleiben erhalten; Safe-Barrikade ist die der Haustür', async () => {
  let { c, raum, p } = await beitreten('Speicherer');
  const h = normalesHaus(raum, 6), h2 = normalesHaus(raum, 7), key = 'haus:' + h.nr, key2 = 'haus:' + h2.nr;
  const s = raum.welt.safeRooms[0], skey = 'haus:' + s.haus.nr;
  const w = raum.wv(ebeneVon(h));
  const t = w.tueren[0], ik = `${ebeneVon(h)}:${t.x},${t.y}`;
  raum.setzeTuer(key, false); raum.setzeBarrikade(key, 55);
  raum.state.tueren.get(key).hp = 40;
  raum.setzeTuer(key2, true); raum.state.tueren.get(key2).kaputt = true; raum.state.tueren.get(key2).hp = 0;
  raum.setzeTuer(ik, true); raum.setzeBarrikade(ik, 35); raum.state.tueren.get(ik).kaputt = true;
  raum.state.safes.get(s.id).barrikade = 66;
  raum.spiegleSafeTueren();
  assert.equal(raum.state.tueren.get(skey).barrikade, 66, 'Haustür des Safe Rooms spiegelt die Safe-Barrikade');
  assert.equal(raum.tuerBarrikade(skey), 66);
  raum.setzeBarrikade(skey, 90);
  assert.equal(raum.state.safes.get(s.id).barrikade, 90, 'Barrikade der Safe-Haustür landet im Safe');
  await c.leave();
  assert.ok(await bis(() => !matchMaker.getLocalRoomById(raum.roomId), 3000), 'Raum bleibt bestehen');
  const neu = await beitreten('Speicherer2');
  try {
    const tu = neu.raum.state.tueren;
    assert.equal(tu.get(key).offen, false);
    assert.equal(tu.get(key).barrikade, 55);
    assert.equal(Math.round(tu.get(key).hp), 40);
    assert.equal(tu.get(key).kaputt, false);
    assert.equal(tu.get(key2).kaputt, true);
    assert.equal(tu.get(key2).offen, true);
    assert.equal(neu.raum.state.safes.get(s.id).barrikade, 90);
    assert.equal(neu.raum.tuerBarrikade(skey), 90);
    neu.raum.wv(ebeneVon(h));
    const st = tu.get(ik);
    assert.ok(st, 'Zimmertür nicht geladen');
    assert.equal(st.barrikade, 35);
    assert.equal(st.kaputt, true);
    assert.equal(st.offen, true);
    assert.equal(neu.raum.wv(ebeneVon(h)).hole(t.x, t.y), T.TUER_OFFEN);
  } finally { await neu.c.leave(); }
});

test('Schlossart: deterministisch, Anteile wirken, 0 % kommt nie vor', () => {
  const zaehle = (a, seed = 1234) => {
    const n = { frei: 0, raetsel: 0, schluessel: 0 };
    for (let i = 0; i < 3000; i++) n[schlossArt(`h${i % 40}eg:${i},${i * 7 % 50}`, seed, a)]++;
    return n;
  };
  assert.equal(schlossArt('h1eg:3,4', 99, { frei: 1, raetsel: 1, schluessel: 1 }), schlossArt('h1eg:3,4', 99, { frei: 1, raetsel: 1, schluessel: 1 }));
  const v = zaehle({ frei: 50, raetsel: 25, schluessel: 25 });
  assert.ok(Math.abs(v.frei / 3000 - 0.5) < 0.05 && Math.abs(v.raetsel / 3000 - 0.25) < 0.05 && Math.abs(v.schluessel / 3000 - 0.25) < 0.05, JSON.stringify(v));
  assert.deepEqual(zaehle({ frei: 0, raetsel: 100, schluessel: 0 }), { frei: 0, raetsel: 3000, schluessel: 0 });
  assert.deepEqual(zaehle({ frei: 0, raetsel: 0, schluessel: 100 }), { frei: 0, raetsel: 0, schluessel: 3000 });
  assert.deepEqual(zaehle({ frei: 100, raetsel: 0, schluessel: 0 }), { frei: 3000, raetsel: 0, schluessel: 0 });
  assert.notDeepEqual(zaehle({ frei: 1, raetsel: 1, schluessel: 1 }, 1), zaehle({ frei: 1, raetsel: 1, schluessel: 1 }, 2), 'Seed ohne Wirkung');
});

test('Schlossart auf dem Server: Anteile aus den Einstellungen, Kontext je Art, Brechstange öffnet nichts', async () => {
  const { c, raum, p } = await beitreten('Schlosser');
  try {
    const h = normalesHaus(raum, 0), w = hinein(raum, p, h);
    w.behaelter = [];
    const t = w.tueren[0], key = `${w.ebene}:${t.x},${t.y}`;
    const st = raum.state.tueren.get(key);
    const nebenTuer = [[0, 1], [0, -1], [1, 0], [-1, 0]].map(([dx, dy]) => ({ x: (t.x + dx + 0.5) * KACHEL, y: (t.y + dy + 0.5) * KACHEL, k: w.hole(t.x + dx, t.y + dy) })).find(o => o.k === T.BODEN);
    Object.assign(p, { x: nebenTuer.x, y: nebenTuer.y });
    st.offen = false; st.verschlossen = true;
    const art = (f, r, s) => Object.assign(raum.state, { tuerFrei: f, tuerRaetsel: r, tuerSchluessel: s });
    p.rucksack.clear(); p.rucksack.push('brechstange');
    art(100, 0, 0);
    assert.equal(raum.tuerKontext(p).art, 'tuer_auf');
    art(0, 100, 0);
    assert.equal(raum.tuerKontext(p).art, 'schlossraetsel');
    p.rucksack.push('schluessel');
    assert.equal(raum.tuerKontext(p).art, 'schlossraetsel', 'Schlüssel öffnet Rätsel-Tür');
    art(0, 0, 100);
    assert.equal(raum.tuerKontext(p).art, 'aufschliessen');
    p.rucksack.clear(); p.rucksack.push('brechstange');
    assert.equal(raum.tuerKontext(p).art, 'schluessel_noetig', 'Brechstange öffnet Schlüssel-Tür');
    // Haustüren sind nie betroffen
    assert.equal(raum.tuerArt('haus:3'), 'frei');
    // Einstellung -> Spielstand
    SpielRaum.einstellungen = { ...SpielRaum.einstellungen, tueren: { frei: 10, raetsel: 20, schluessel: 70 } };
    raum.tuerAnteileUebernehmen();
    assert.deepEqual([raum.state.tuerFrei, raum.state.tuerRaetsel, raum.state.tuerSchluessel], [10, 20, 70]);
  } finally { SpielRaum.einstellungen = { ...SpielRaum.einstellungen, tueren: { frei: 50, raetsel: 25, schluessel: 25 } }; await c.leave(); }
});

test('Rätsel-Tür: wird im echten Haus gefunden, löst die Frage aus und geht per Rätsel auf', async () => {
  const { c, raum, p } = await beitreten('Raetsler');
  const gesehen = [];
  c.onMessage('raetsel', m => gesehen.push(m));
  try {
    // erste Zimmertür aller Häuser, die laut Seed nur per Rätsel aufgeht
    let fund = null;
    for (const h of raum.welt.haeuser.filter(q => q.betretbar)) {
      const w = raum.wv(ebeneVon(h));
      const t = w.tueren.find(q => raum.state.tueren.get(`${w.ebene}:${q.x},${q.y}`)?.verschlossen && raum.tuerArt(`${w.ebene}:${q.x},${q.y}`) === 'raetsel');
      if (t) { fund = { h, w, t, key: `${w.ebene}:${t.x},${t.y}` }; break; }
    }
    assert.ok(fund, 'keine Rätsel-Tür in der Welt');
    const { h, w, t, key } = fund;
    hinein(raum, p, h);
    const nebenTuer = [[0, 1], [0, -1], [1, 0], [-1, 0]].map(([dx, dy]) => ({ x: (t.x + dx + 0.5) * KACHEL, y: (t.y + dy + 0.5) * KACHEL, k: w.hole(t.x + dx, t.y + dy) })).find(o => o.k === T.BODEN);
    Object.assign(p, { x: nebenTuer.x, y: nebenTuer.y });
    w.behaelter = [];
    p.rucksack.clear();
    const k = raum.kontext(p);
    assert.equal(k?.art, 'schlossraetsel');
    raum.starteAktion(c.client ?? { sessionId: c.sessionId, send: (typ, m) => { if (typ === 'raetsel') gesehen.push(m); } });
    assert.ok(await bis(() => gesehen.length > 0), 'keine Rätselfrage angekommen');
    assert.equal(gesehen[0].tuer, true);
    const offen = raum.offeneRaetsel.get(c.sessionId);
    assert.ok(offen);
    c.send('antwort', { id: offen.id, index: offen.richtigIndex });
    assert.ok(await bis(() => raum.state.tueren.get(key).offen), 'Tür blieb zu');
    assert.equal(raum.state.tueren.get(key).verschlossen, false);
  } finally { await c.leave(); }
});

test('Tote in Wohnungen: ca. 20 % der Wohnhaus-Ebenen, fest, durchsuchbar, nicht in Safe Rooms und Läden', async () => {
  const { c, raum, p } = await beitreten('Leichenfinder');
  try {
    const haeuser = raum.welt.haeuser.filter(q => q.betretbar);
    let ebenen = 0, mit = 0;
    for (const h of haeuser) {
      const ebene = ebeneVon(h), vorher = raum.state.leichen.size;
      raum.wv(ebene);
      const neu = [...raum.state.leichen].filter(([, l]) => l.ebene === ebene);
      if (h.safe || ladenArt(h)) { assert.equal(neu.length, 0, 'Leiche in Safe Room/Laden ' + ebene); continue; }
      ebenen++;
      assert.ok(neu.length <= 1);
      if (neu.length) { mit++; assert.equal(neu[0][1].fest, true); }
    }
    assert.ok(ebenen >= 8, 'zu wenige Häuser: ' + ebenen);
    if (ebenen >= 40) assert.ok(mit / ebenen > 0.08 && mit / ebenen < 0.35, `Anteil ${mit}/${ebenen}`);   // (Dorf: Zahl der Häuser hängt vom Seed ab)
    const orte = [...raum.state.leichen.values()].map(l => `${l.ebene}@${Math.round(l.x)},${Math.round(l.y)}`).sort();
    // feste Tote altern nicht und fallen nicht dem Limit zum Opfer
    for (const l of raum.state.leichen.values()) l.alter = 0;
    raum.leichenAltern(10000);
    for (let i = 0; i < 40; i++) raum.neueLeiche({ x: 100, y: 100, richtung: 0, variante: 0, ebene: '' });
    assert.equal([...raum.state.leichen.values()].filter(l => l.fest).length, orte.length, 'feste Tote verschwunden');
    // durchsuchbar wie Leichen draußen
    if (![...raum.state.leichen.values()].some(q => q.fest)) {   // kleine Welt ohne Zufallstreffer: eine feste Leiche selbst legen
      const h0 = haeuser.find(q => !q.safe && !ladenArt(q)), w0 = raum.wv(ebeneVon(h0));
      raum.neueLeiche({ x: w0.start.x, y: w0.start.y, richtung: 0, variante: 0, ebene: ebeneVon(h0) }, true);
    }
    const [id, l] = [...raum.state.leichen].find(([, q]) => q.fest);
    l.rest = 1; raum.leichenInhalt.set(id, ['wasser']);   // (leere Leichen sind nicht durchsuchbar, auch draußen nicht)
    const w = raum.wv(l.ebene);
    Object.assign(p, { ebene: l.ebene, x: l.x + 10, y: l.y });
    w.behaelter = [];
    const k = raum.kontext(p);
    assert.equal(k?.art, 'durchsuchen');
    assert.equal(k.behaelter.art, 'leiche');
  } finally { await c.leave(); }
});

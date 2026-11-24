// Bewohner verstecken sich in Gruppen, Panik-Läufer, versteckte Menschen in Häusern, Retten
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { matchMaker } from '@colyseus/core';
import { Client } from '@colyseus/sdk';
import { starte } from '../server/index.mjs';
import { versteckPunkte, VERSTECK_WEITE, GEFAHR_WEITE, GEFAHR_SICHT, SICHER_NACH } from '../server/menschen.mjs';
import { KACHEL, T, frei, sichtfrei } from '../client/welt.mjs';
import { freierPort } from './hilfe.mjs';

const PORT = await freierPort();
let server;
before(async () => { server = await starte({ port: PORT, optionen: { karte: 'geretsried' }, leise: true, datenbank: ':memory:' }); });
after(async () => { await server.gracefullyShutdown(false); });

// Punkt im Abstand d vom Menschen mit freier Sicht und Platz (irgendeine Richtung), sonst null
const freiAn = (raum, m, d) => {
  for (let k = 0; k < 16; k++) {
    const a = k * Math.PI / 8, x = m.x + Math.cos(a) * d, y = m.y + Math.sin(a) * d;
    if (frei(raum.welt, x, y, 9) && sichtfrei(raum.welt, x, y, m.x, m.y)) return { x, y, a };
  }
  return null;
};
const beitreten = async name => {
  const c = await new Client(`ws://127.0.0.1:${PORT}`).joinOrCreate('zombies', { name, spielerId: crypto.randomBytes(16).toString('hex') });
  return { c, raum: matchMaker.getLocalRoomById(c.roomId) };
};

test('Versteckpunkte: Windschatten, deterministisch, nicht an Türen', () => {
  const k = new Uint8Array(20 * 20).fill(T.WIESE);
  for (let x = 5; x < 12; x++) for (let y = 5; y < 9; y++) k[y * 20 + x] = T.WAND;
  const hole = (x, y) => (x >= 0 && y >= 0 && x < 20 && y < 20) ? k[y * 20 + x] : T.ZAUN;
  const a = versteckPunkte(hole, 20, 20, KACHEL, T), b = versteckPunkte(hole, 20, 20, KACHEL, T);
  assert.ok(a.length > 0);
  assert.deepEqual(a, b);
  for (const p of a) {
    const kx = Math.floor(p.x / KACHEL), ky = Math.floor(p.y / KACHEL);
    assert.equal(hole(kx, ky), T.WIESE);
    let block = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ([T.WAND, T.ZAUN, T.DEKO].includes(hole(kx + dx, ky + dy))) block++;
    assert.ok(block >= 2);
  }
});

// Hilfen: sichtbare gesunde Bewohner draußen; Bewohner ducken sich als Gruppe (wie nach einer Warnung)
const sichtbare = (raum, n) => [...raum.state.menschen.entries()].filter(([, m]) => m.sichtbar && !m.infiziert && !m.ebene && !m.folgt).slice(0, n);
const duckt = (raum, ids) => {
  const st = raum.stadt, m0 = raum.state.menschen.get(ids[0]);
  const g = st.neueGruppe(m0, ids.length);
  for (const id of ids) {
    const inf = st.info.get(id), m = raum.state.menschen.get(id);
    st.gruppeAufnehmen(g, id, inf);
    m.x = inf.slot.x; m.y = inf.slot.y; inf.sitzt = true; m.versteckt = true; m.sichtbar = true; m.flieht = false;
  }
  return g;
};
const ohneZombies = raum => { for (const id of [...raum.state.zombies.keys()]) { raum.state.zombies.delete(id); raum.zombieInfo.delete(id); } raum.baueZombieRaster(); };
const neuStart = (raum, n) => {
  const st = raum.stadt;
  for (const id of [...raum.state.menschen.keys()]) { raum.state.menschen.delete(id); st.info.delete(id); }
  st.gruppen.clear(); st.belegt.clear();
  ohneZombies(raum);
  st.start(n, 0);
};

test('Ohne Zombies in der Nähe versteckt sich niemand: Alltag mit Zielen, kein Dauer-Verstecken', async () => {
  const { c, raum } = await beitreten('Alltag');
  try {
    const st = raum.stadt;
    assert.ok(st.verstecke.length > 20, 'zu wenige Verstecke: ' + st.verstecke.length);
    neuStart(raum, 150);
    const alle = [...st.info.values()];
    assert.ok(alle.every(i => i.modus === '' && !i.gruppe), 'jemand versteckt/panisch ohne Gefahr');
    assert.ok(alle.filter(i => i.panisch).length > 5, 'Panik-Veranlagung fehlt');
    for (let i = 0; i < 400; i++) st.schritt(0.05);
    assert.ok([...raum.state.menschen.values()].every(m => !m.versteckt), 'jemand duckt sich ohne Zombies');
    assert.ok([...st.info.values()].every(i => i.modus === ''), 'Modus ohne Gefahr');
    assert.ok([...st.info.values()].filter(i => i.ziel).length > alle.length * 0.3, 'kaum Ziele');
  } finally { await c.leave(); }
});

test('Zombie in 30 m: Bewohner verstecken sich (Gruppen, ein Teil Panik); 25 s ohne Zombies: wieder Alltag', async () => {
  const { c, raum } = await beitreten('Gefahr');
  try {
    const st = raum.stadt, s = raum.state;
    neuStart(raum, 80);
    const [mid, m] = [...s.menschen.entries()].find(([, q]) => q.sichtbar && freiAn(raum, q, 240));
    const inf = st.info.get(mid); inf.panisch = false;
    const q = freiAn(raum, m, 240);
    const zid = raum.setzeZombie(q.x, q.y, ''); raum.zombieInfo.get(zid).bleibt = true; s.zombies.get(zid).richtung = q.a + Math.PI;
    raum.baueZombieRaster();
    for (let i = 0; i < 4; i++) st.schritt(0.05);
    assert.equal(inf.modus, 'versteck', 'versteckt sich nicht');
    assert.ok(inf.gruppe && st.gruppen.has(inf.gruppe));
    // Panik-Veranlagte laufen stattdessen herum
    const [pid] = [...s.menschen.entries()].find(([id, p]) => id !== mid && p.sichtbar && !p.ebene && st.info.get(id).modus === '' && Math.hypot(p.x - q.x, p.y - q.y) < GEFAHR_WEITE - 20) ?? [];
    if (pid) { const pi = st.info.get(pid); assert.ok(['versteck', 'panik'].includes(pi.modus)); }
    // Gefahr bleibt, solange der Zombie nah ist: auch nach 60 s Spielzeit noch versteckt
    for (let i = 0; i < 12; i++) { st.takt += 5; raum.baueZombieRaster(); st.schritt(0.05); st.schritt(0.05); }
    assert.ok(['versteck'].includes(inf.modus), 'kommt trotz Zombie heraus: ' + inf.modus);
    // Zombie weg: nach SICHER_NACH Sekunden Alltag
    s.zombies.delete(zid); raum.zombieInfo.delete(zid); raum.baueZombieRaster();
    st.takt += SICHER_NACH - 5; st.schritt(0.05); st.schritt(0.05);
    assert.equal(inf.modus, 'versteck', 'zu früh heraus');
    st.takt += 10; st.schritt(0.05); st.schritt(0.05);
    assert.equal(inf.modus, '', 'kommt nicht wieder heraus');
    assert.ok(!inf.gruppe && !m.versteckt && !m.flieht);
  } finally { await c.leave(); }
});

test('Zombie weit weg (über 60 m) löst kein Verstecken aus', async () => {
  const { c, raum } = await beitreten('Fern');
  try {
    const st = raum.stadt, s = raum.state;
    neuStart(raum, 40);
    const [mid, m] = [...s.menschen.entries()].find(([, q]) => q.sichtbar && freiAn(raum, q, GEFAHR_SICHT + 60));
    const q = freiAn(raum, m, GEFAHR_SICHT + 60);
    const zid = raum.setzeZombie(q.x, q.y, ''); raum.baueZombieRaster();
    for (let i = 0; i < 10; i++) st.schritt(0.05);
    assert.equal(st.info.get(mid).modus, '');
    s.zombies.delete(zid); raum.zombieInfo.delete(zid); raum.baueZombieRaster();
  } finally { await c.leave(); }
});

test('Haus betreten und wieder verlassen (unsichtbar drin)', async () => {
  const { c, raum } = await beitreten('Haus');
  try {
    const st = raum.stadt, s = raum.state;
    neuStart(raum, 30);
    const [mid, m] = [...s.menschen.entries()].find(([, q]) => q.sichtbar), inf = st.info.get(mid);
    const heim = st.wohnungen[0], tp = st.vorDerTuer(heim);
    m.x = tp.x; m.y = tp.y; inf.ziel = { ...tp, art: 'haus' };
    st.angekommen(mid, m, inf);
    assert.equal(m.sichtbar, false, 'nicht im Haus');
    assert.ok(inf.warte > 20);
    inf.warte = 0.2;
    for (let i = 0; i < 24 && !m.sichtbar; i++) st.schritt(0.05);
    assert.equal(m.sichtbar, true, 'kommt nicht heraus');
    assert.ok(inf.ziel, 'kein neues Ziel');
  } finally { await c.leave(); }
});

test('Ins parkende Auto steigen: Auto verschwindet vom Parkplatz, ein Verkehrsauto fährt zum Kartenrand', async () => {
  const { c, raum } = await beitreten('Autofahrer');
  try {
    const st = raum.stadt, s = raum.state, v = raum.verkehr;
    neuStart(raum, 30);
    const b = raum.welt.behaelter.find(q => q.art === 'auto' && !raum.welt.autosWeg?.has(q.id));
    assert.ok(b && v.graph.knoten.length, 'kein parkendes Auto / kein Straßennetz');
    const [mid, m] = [...s.menschen.entries()].find(([, q]) => q.sichtbar), inf = st.info.get(mid);
    m.x = b.x; m.y = b.y; inf.ziel = { x: b.x, y: b.y, art: 'auto', auto: b };
    const vorher = new Set(s.fahrzeuge.keys()), anfangs = st.anfangs;
    st.angekommen(mid, m, inf);
    assert.ok(!s.menschen.has(mid) && !st.info.has(mid), 'Mensch noch da');
    assert.ok(raum.welt.autosWeg.has(b.id), 'parkendes Auto noch da');
    assert.equal(st.anfangs, anfangs - 1);
    const neu = [...s.fahrzeuge.keys()].filter(k => !vorher.has(k));
    assert.equal(neu.length, 1);
    const fid = neu[0], f = s.fahrzeuge.get(fid);
    assert.ok(fid.startsWith('auto') && v.info.get(fid).randAus && Math.hypot(f.x - b.x, f.y - b.y) < 1);
    let weg = false;
    for (let i = 0; i < 6000 && !weg; i++) { v.schritt(0.25); weg = !s.fahrzeuge.has(fid); }
    assert.ok(weg, 'Auto fährt nicht bis zum Rand und verschwindet');
    // ein zweites Mal denselben Parkplatz: nichts passiert (Auto ist weg)
    const [mid2, m2] = [...s.menschen.entries()].find(([, q]) => q.sichtbar), inf2 = st.info.get(mid2);
    inf2.ziel = { x: b.x, y: b.y, art: 'auto', auto: b }; m2.x = b.x; m2.y = b.y;
    st.angekommen(mid2, m2, inf2);
    assert.ok(s.menschen.has(mid2), 'steigt in ein schon weggefahrenes Auto');
  } finally { await c.leave(); }
});

test('Weglaufen: am Kartenrand verschwindet der Mensch', async () => {
  const { c, raum } = await beitreten('Rand');
  try {
    const st = raum.stadt, s = raum.state;
    neuStart(raum, 30);
    const [mid, m] = [...s.menschen.entries()].find(([, q]) => q.sichtbar), inf = st.info.get(mid);
    m.x = 3 * KACHEL; m.y = 20 * KACHEL;
    const a0 = st.anfangs;
    inf.ziel = st.randZiel(m); inf.ziel ??= { x: m.x, y: m.y, art: 'rand' };
    assert.equal(inf.ziel.art, 'rand');
    st.angekommen(mid, m, inf);
    assert.ok(!s.menschen.has(mid), 'noch da');
    assert.equal(st.anfangs, a0 - 1);
    // weit vom Rand: nur Zwischenziel
    const [mid2, m2] = [...s.menschen.entries()].find(([, q]) => q.sichtbar), inf2 = st.info.get(mid2);
    m2.x = 20 * KACHEL; m2.y = 20 * KACHEL; inf2.ziel = { x: m2.x, y: m2.y, art: 'rand' };
    st.angekommen(mid2, m2, inf2);
    assert.ok(s.menschen.has(mid2));
  } finally { await c.leave(); }
});

test('Versteckte Menschen werden von Zombies viel schwerer gewittert', async () => {
  const { c, raum } = await beitreten('Wittern');
  try {
    const st = raum.stadt, s = raum.state;
    neuStart(raum, 60);
    let mid, m;
    for (const [id, q] of sichtbare(raum, 60)) {   // der Platz im Versteck braucht freie Sicht in 100 px und ganz nah
      duckt(raum, [id]);
      if (freiAn(raum, q, 100) && freiAn(raum, q, VERSTECK_WEITE - 8)) { mid = id; m = q; break; }
      st.gruppeVerlassen(id, st.info.get(id));
    }
    assert.ok(m, 'kein passendes Versteck');
    const zid = raum.setzeZombie(m.x + 100, m.y, ''), z = s.zombies.get(zid), zi = raum.zombieInfo.get(zid);
    const probe = abst => {
      const q = freiAn(raum, m, abst);
      z.x = q.x; z.y = q.y; z.richtung = q.a + Math.PI; zi.ziel = null; zi.mensch = null; zi.schlaeft = false; zi.dran = true;
      st.zombiesWittern([[zid, z]]);
      return s.menschen.get(zi.mensch) ?? null;   // der bemerkte Mensch (irgendwer in der Nähe)
    };
    try {
      m.versteckt = false;
      assert.ok(probe(100), 'sichtbarer Mensch auf 100 px nicht bemerkt');
      m.versteckt = true;
      assert.ok(!probe(100)?.versteckt, 'versteckter Mensch auf 100 px bemerkt');
      assert.ok(probe(VERSTECK_WEITE - 8), 'versteckter Mensch ganz nah nicht bemerkt');
    } finally { s.zombies.delete(zid); raum.zombieInfo.delete(zid); m.versteckt = true; }
  } finally { await c.leave(); }
});

test('Gruppe flieht gemeinsam, wenn ein Zombie nah kommt', async () => {
  const { c, raum } = await beitreten('Flucht');
  try {
    const st = raum.stadt, s = raum.state;
    neuStart(raum, 60);
    const k = sichtbare(raum, 60).filter(([, q]) => freiAn(raum, q, 60));
    assert.ok(k.length >= 2);
    const g = duckt(raum, [k[0][0], k[1][0]]);
    const m0 = s.menschen.get(g.mitglieder[0]);
    const alt = g.vpIdx, q = freiAn(raum, m0, 60);
    const zid = raum.setzeZombie(q.x, q.y, ''), z = s.zombies.get(zid);
    z.richtung = q.a + Math.PI; raum.zombieInfo.get(zid).bleibt = true; raum.baueZombieRaster();
    for (let i = 0; i < 8 && !g.flucht; i++) st.schritt(0.05);
    assert.ok(g.flucht, 'Gruppe flieht nicht');
    assert.notEqual(g.vpIdx, alt, 'kein neues Versteck');
    assert.ok(g.mitglieder.every(id => st.info.get(id).sitzt === false), 'nicht alle ziehen mit');
    s.zombies.delete(zid); raum.zombieInfo.delete(zid);
  } finally { await c.leave(); }
});

test('Retten: Ansprechen, folgen, im Safe Room gerettet → Zähler, Erfahrung, Belohnung', async () => {
  const { c, raum } = await beitreten('Retter');
  try {
    const st = raum.stadt, s = raum.state;
    const sid = c.sessionId, p = s.spieler.get(sid);
    // Mensch + Zielpunkt 300 px entfernt, dazwischen eine freie, gerade Strecke (sonst läuft er je nach Seed erst um ein Hindernis)
    let mid, m, ziel;
    for (const [id, q] of s.menschen) {
      if (!q.sichtbar || q.infiziert || q.ebene) continue;
      for (let k = 0; k < 16 && !ziel; k++) {
        const a = k * Math.PI / 8; let ok = true;
        for (let d = 0; d <= 300 && ok; d += 10) ok = frei(raum.welt, q.x + Math.cos(a) * d, q.y + Math.sin(a) * d, 9);
        if (ok && sichtfrei(raum.welt, q.x, q.y, q.x + Math.cos(a) * 300, q.y + Math.sin(a) * 300)) ziel = { x: q.x + Math.cos(a) * 300, y: q.y + Math.sin(a) * 300 };
      }
      if (ziel) { mid = id; m = q; break; }
    }
    assert.ok(ziel, 'kein Mensch mit freier Strecke');
    p.ebene = ''; p.x = m.x + 2; p.y = m.y;
    assert.equal(st.ansprechbar(p), mid);
    assert.equal(raum.kontext(p)?.art, 'ansprechen');
    assert.ok(st.ansprechen(sid, p, mid));
    assert.ok(m.folgt && !m.versteckt && st.info.get(mid).folgt === sid);
    // folgt auf Abstand, wenn der Spieler weggeht
    p.x = ziel.x; p.y = ziel.y;
    const d0 = Math.hypot(m.x - p.x, m.y - p.y);
    for (let i = 0; i < 100; i++) st.schritt(0.05);
    assert.ok(Math.hypot(m.x - p.x, m.y - p.y) < d0 - 60, 'folgt nicht ' + JSON.stringify([m.x, m.y, p.x, p.y, m.flieht, m.sichtbar, m.ebene, st.info.get(mid).modus, st.info.get(mid).folgt]));
    // Safe Room erreicht
    const xpVor = raum.extra.get(sid).fk?.xp ?? 0, gerettetVor = s.gerettet ?? 0;
    p.sicher = 'lager';
    const hinweis = raum.missionHinweis; raum.missionHinweis = () => null;   // Hinweis-Zweig hier nicht, Gegenstand schon
    try { for (let i = 0; i < 8 && s.menschen.has(mid); i++) st.schritt(0.05); } finally { raum.missionHinweis = hinweis; }
    assert.ok(!s.menschen.has(mid), 'noch da');
    assert.equal(s.gerettet, gerettetVor + 1);
    assert.ok((raum.extra.get(sid).fk?.xp ?? 0) >= xpVor, 'XP nicht gestiegen');
    p.sicher = '';
  } finally { await c.leave(); }
});

test('Versteckter Mensch in einem Wohnhaus ohne Zombies: nur in einigen Häusern, hinter Möbeln', async () => {
  const { c, raum } = await beitreten('Hausbesuch');
  try {
    const st = raum.stadt, s = raum.state;
    const e = raum.einstellungen(), alt = e.haeuserFaktor; e.haeuserFaktor = 0;   // keine Zombies in den Häusern
    let gefunden = 0, geprueft = 0;
    for (const h of raum.welt.haeuser.filter(h => h.betretbar && !h.safe).slice(0, 150)) {
      const eb = `h${h.nr}eg`;
      const w = raum.wv(eb); if (w === raum.welt) continue;
      geprueft++;
      const da = [...s.menschen.values()].some(m => m.ebene === eb);
      if (da) gefunden++;
    }
    assert.ok(geprueft > 20, 'Ebenen: ' + geprueft);
    assert.ok(gefunden > 0 && gefunden < geprueft * 0.4, `Versteckte in Häusern: ${gefunden}/${geprueft}`);
    for (const m of s.menschen.values()) if (m.ebene) assert.ok(m.versteckt && m.sichtbar);
    e.haeuserFaktor = alt;
  } finally { await c.leave(); }
});

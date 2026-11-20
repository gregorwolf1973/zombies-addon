// Bewohner verstecken sich in Gruppen, Panik-Läufer, versteckte Menschen in Häusern, Retten
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { matchMaker } from '@colyseus/core';
import { Client } from '@colyseus/sdk';
import { starte } from '../server/index.mjs';
import { versteckPunkte, VERSTECK_WEITE } from '../server/menschen.mjs';
import { KACHEL, T, frei, sichtfrei } from '../client/welt.mjs';

const PORT = 25900 + Math.floor(Math.random() * 100);
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

test('Die Mehrheit der Bewohner versteckt sich in Gruppen, ein kleiner Teil rennt in Panik', async () => {
  const { c, raum } = await beitreten('Spaeher');
  try {
    const st = raum.stadt;
    assert.ok(st.verstecke.length > 20, 'zu wenige Verstecke: ' + st.verstecke.length);
    for (const id of [...raum.state.menschen.keys()]) { raum.state.menschen.delete(id); st.info.delete(id); }
    st.gruppen.clear(); st.belegt.clear();
    st.start(300, 0);
    const alle = [...st.info.values()];
    const versteck = alle.filter(i => i.modus === 'versteck').length, panik = alle.filter(i => i.modus === 'panik').length;
    assert.ok(versteck / alle.length > 0.75, 'Versteckte: ' + versteck + '/' + alle.length);
    assert.ok(panik / alle.length > 0.04 && panik / alle.length < 0.25, 'Panik: ' + panik);
    const gr = [...st.gruppen.values()];
    assert.ok(gr.every(g => g.mitglieder.length >= 1 && g.mitglieder.length <= 4));
    assert.ok(gr.filter(g => g.mitglieder.length >= 2).length > gr.length * 0.5, 'kaum Gruppen');
    const sitzt = [...raum.state.menschen.values()].filter(m => m.versteckt && m.sichtbar);
    assert.ok(sitzt.length >= versteck * 0.95);
  } finally { await c.leave(); }
});

test('Versteckte Menschen werden von Zombies viel schwerer gewittert', async () => {
  const { c, raum } = await beitreten('Wittern');
  try {
    const st = raum.stadt, s = raum.state;
    const [mid, m] = [...s.menschen.entries()].find(([id, q]) => q.versteckt && q.sichtbar && st.info.get(id).gruppe && freiAn(raum, q, 100) && freiAn(raum, q, VERSTECK_WEITE - 8));
    const zid = raum.setzeZombie(m.x + 100, m.y, ''), z = s.zombies.get(zid), zi = raum.zombieInfo.get(zid);
    const probe = abst => {
      const q = freiAn(raum, m, abst);
      z.x = q.x; z.y = q.y; z.richtung = q.a + Math.PI; zi.ziel = null; zi.mensch = null; zi.schlaeft = false; zi.dran = true;
      st.zombiesWittern([[zid, z]]);
      return s.menschen.get(zi.mensch) ?? null;   // der bemerkte Mensch (irgendwer in der Nähe, z. B. ein Panik-Läufer)
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
    const g = [...st.gruppen.values()].find(q => q.mitglieder.length >= 2 && q.mitglieder.every(id => st.info.get(id)?.sitzt) && freiAn(raum, s.menschen.get(q.mitglieder[0]), 60));
    assert.ok(g);
    const m0 = s.menschen.get(g.mitglieder[0]);
    const alt = g.vpIdx, q = freiAn(raum, m0, 60);
    const zid = raum.setzeZombie(q.x, q.y, ''), z = s.zombies.get(zid);
    z.richtung = q.a + Math.PI; raum.zombieInfo.get(zid).bleibt = true;
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
    const [mid, m] = [...s.menschen.entries()].find(([id, q]) => q.sichtbar && !q.infiziert && st.info.get(id).gruppe);
    p.ebene = ''; p.x = m.x + 2; p.y = m.y;
    assert.equal(st.ansprechbar(p), mid);
    assert.equal(raum.kontext(p)?.art, 'ansprechen');
    assert.ok(st.ansprechen(sid, p, mid));
    assert.ok(m.folgt && !m.versteckt && st.info.get(mid).folgt === sid);
    // folgt auf Abstand, wenn der Spieler weggeht
    p.x += 300;
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

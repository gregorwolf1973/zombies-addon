// Paket F: Verkehr ohne Überlappung (Abstand, Kreuzungsvorrang, Festgefahren) und Verkehrsunfälle (Rauch → Feuer → Explosion)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { matchMaker } from '@colyseus/core';
import { Client } from '@colyseus/sdk';
import { starte } from '../server/index.mjs';
import { setzeKartengroesse, frei } from '../client/welt.mjs';
import { LAENGE, BREITE_FZ } from '../server/verkehr.mjs';
import { UNFALL_RADIUS } from '../server/unfall.mjs';
import { befehl, SU_BEFEHLE } from '../server/superuser.mjs';

let server;
const PORT = 28100 + Math.floor(Math.random() * 90);
before(async () => { server = await starte({ port: PORT, optionen: { karte: 'geretsried' }, leise: true, datenbank: ':memory:' }); });
after(async () => { await server.gracefullyShutdown(false); setzeKartengroesse(64, 48); });

async function beitreten(name) {
  const c = await new Client(`ws://127.0.0.1:${PORT}`).joinOrCreate('zombies', { name, spielerId: crypto.randomBytes(16).toString('hex') });
  const raum = matchMaker.getLocalRoomById(c.roomId);
  for (const id of [...raum.state.fahrzeuge.keys()]) { raum.state.fahrzeuge.delete(id); raum.verkehr.info.delete(id); }
  return { c, raum };
}

// Rechteck eines Fahrzeugs (Mitte, Richtung, Länge × Breite), leicht verkleinert
function ecken(f, schrumpf = 1) {
  const a = f.art === 'wrack' ? 'auto' : f.art, l = (LAENGE[a] ?? 46) / 2 - schrumpf, b = (BREITE_FZ[a] ?? 18) / 2 - schrumpf, c = Math.cos(f.richtung), s = Math.sin(f.richtung);
  return [[l, b], [l, -b], [-l, -b], [-l, b]].map(([u, v]) => [f.x + u * c - v * s, f.y + u * s + v * c]);
}
function ueberlappt(f, g) {
  const A = ecken(f), B = ecken(g);
  for (const P of [A, B]) for (let i = 0; i < 4; i++) {
    const [x1, y1] = P[i], [x2, y2] = P[(i + 1) % 4], nx = y2 - y1, ny = x1 - x2;
    const pr = Q => Q.map(([x, y]) => x * nx + y * ny), a = pr(A), b = pr(B);
    if (Math.max(...a) < Math.min(...b) || Math.max(...b) < Math.min(...a)) return false;
  }
  return true;
}
function ueberlappungen(s) {
  const l = [...s.fahrzeuge.values()], n = [];
  for (let i = 0; i < l.length; i++) for (let j = i + 1; j < l.length; j++) if (ueberlappt(l[i], l[j])) n.push([i, j]);
  return n;
}

// Kreuzung mit mindestens drei langen Straßen, deren Richtungen verschieden sind
function kreuzungFinden(graph) {
  for (const k of graph.knoten) {
    const arme = k.nach.filter(e => e.laenge >= 150).map(e => ({ w: Math.atan2(e.ziel.y - k.y, e.ziel.x - k.x), e }));
    if (arme.length < 3) continue;
    for (const a of arme) for (const b of arme) for (const c of arme) {
      const d = (p, q) => Math.abs(Math.atan2(Math.sin(p - q), Math.cos(p - q)));
      if (d(a.w, b.w) > 1.2 && d(a.w, c.w) > 1.2 && d(b.w, c.w) > 1.2) return { k, a, b, c };
    }
  }
  return null;
}
const punkt = (k, w, d) => ({ x: k.x + Math.cos(w) * d, y: k.y + Math.sin(w) * d });

function auto(raum, weg) {
  const v = raum.verkehr, id = v.neu('auto', weg[0]), f = raum.state.fahrzeuge.get(id), inf = v.info.get(id);
  inf.weg = weg.map(p => ({ ...p })); inf.pos = 0;
  f.x = weg[0].x; f.y = weg[0].y; f.richtung = Math.atan2(weg[1].y - weg[0].y, weg[1].x - weg[0].x);
  return { id, f, inf };
}

test('Kreuzung: zwei Autos wollen gleichzeitig hinein – keine Überlappung über 60 s, beide kommen durch', async () => {
  const { c, raum } = await beitreten('Kreuzer');
  try {
    const kr = kreuzungFinden(raum.verkehr.graph);
    assert.ok(kr, 'Kreuzung gefunden');
    const K = { x: kr.k.x, y: kr.k.y };
    const A = auto(raum, [punkt(K, kr.a.w, 130), K, punkt(K, kr.b.w, 130)]);
    const B = auto(raum, [punkt(K, kr.c.w, 130), K, punkt(K, kr.b.w, 130)]);
    raum.verkehr.unfaelle.uhr = 1e9;
    let naheA = 1e9, naheB = 1e9, ueber = 0;
    for (let t = 0; t < 1200; t++) {   // 60 s
      raum.verkehr.schritt(0.05);
      ueber += ueberlappungen(raum.state).length;
      naheA = Math.min(naheA, Math.hypot(A.f.x - K.x, A.f.y - K.y)); naheB = Math.min(naheB, Math.hypot(B.f.x - K.x, B.f.y - K.y));
    }
    assert.equal(ueber, 0, 'Fahrzeuge überlappten sich');
    assert.ok(naheA < 25 && naheB < 25, `beide durch die Kreuzung (${naheA.toFixed(0)}, ${naheB.toFixed(0)})`);
  } finally { await c.leave(); }
});

test('Abstand: Fahrzeug hinter einem stehenden bremst mit Lücke und überlappt nicht', async () => {
  const { c, raum } = await beitreten('Kolonne');
  try {
    const kr = kreuzungFinden(raum.verkehr.graph), K = { x: kr.k.x, y: kr.k.y };
    const vorn = auto(raum, [punkt(K, kr.a.w, 80), punkt(K, kr.a.w, 400)]);
    vorn.inf.halt = 1e9; vorn.f.haelt = true;   // steht (Panne)
    const hinten = auto(raum, [punkt(K, kr.a.w, 300), punkt(K, kr.a.w, 700)]);
    hinten.f.richtung = vorn.f.richtung = kr.a.w; hinten.inf.weg = [punkt(K, kr.a.w, 380), punkt(K, kr.a.w, 60)];
    hinten.f.x = punkt(K, kr.a.w, 380).x; hinten.f.y = punkt(K, kr.a.w, 380).y; hinten.f.richtung = kr.a.w + Math.PI;
    vorn.f.x = punkt(K, kr.a.w, 200).x; vorn.f.y = punkt(K, kr.a.w, 200).y;
    for (let t = 0; t < 200; t++) { raum.verkehr.schritt(0.05); assert.equal(ueberlappungen(raum.state).length, 0, 'Überlappung bei ' + t); }
    const luecke = Math.hypot(hinten.f.x - vorn.f.x, hinten.f.y - vorn.f.y) - LAENGE.auto;
    assert.ok(luecke >= 2 && luecke < 40, 'bremst mit Abstand: ' + luecke.toFixed(1));
  } finally { await c.leave(); }
});

test('Festgefahren: nach 8 s wenden, ohne Ausweg nach 15 s das Hindernis zur Seite schieben – nie durcheinander', async () => {
  const { c, raum } = await beitreten('Stau');
  try {
    const v = raum.verkehr, welt = raum.welt;
    // gerade, lange Kante mit freiem Platz neben der Straße
    let kante = null;
    for (const k of v.graph.knoten) for (const e of k.nach) {
      if (e.laenge < 260 || k.nach.length < 3) continue;
      const w = Math.atan2(e.ziel.y - k.y, e.ziel.x - k.x), m = { x: (k.x + e.ziel.x) / 2, y: (k.y + e.ziel.y) / 2 };
      const nx = -Math.sin(w), ny = Math.cos(w);
      if ([-1, 1].every(sd => frei(welt, m.x + nx * sd * 46, m.y + ny * sd * 46, 8)) && frei(welt, m.x, m.y, 8)) { kante = { k, w, m }; break; }
    }
    assert.ok(kante, 'Straße mit Seitenraum gefunden');
    const { m, w } = kante, vorwaerts = d => ({ x: m.x + Math.cos(w) * d, y: m.y + Math.sin(w) * d });
    const wrack = auto(raum, [vorwaerts(0), vorwaerts(300)]);
    wrack.f.art = 'wrack'; v.info.delete(wrack.id); wrack.f.richtung = w + 1.2;   // quer auf der Straße
    // 1) wenden: Fahrer hat einen Ausweg (Route vom Knoten hinter ihm)
    const fahrer = auto(raum, [vorwaerts(-120), vorwaerts(250)]);
    fahrer.inf.zielKnoten = kante.k;
    const richtung0 = fahrer.f.richtung;
    let gewendet = false, ueber = 0;
    for (let t = 0; t < 20 * 14; t++) {   // 14 s
      v.schritt(0.05); ueber += ueberlappungen(raum.state).length;
      if (Math.abs(Math.atan2(Math.sin(fahrer.f.richtung - richtung0), Math.cos(fahrer.f.richtung - richtung0))) > 2) gewendet = true;
    }
    assert.equal(ueber, 0, 'beim Warten und Wenden keine Überlappung');
    assert.ok(gewendet || !v.info.has(fahrer.id), 'nach 8 s Stillstand gewendet (oder keine Route: dann steht er)');
    // 2) kein Ausweg: Schieben nach 15 s
    for (const id of [...raum.state.fahrzeuge.keys()]) if (id !== wrack.id) { raum.state.fahrzeuge.delete(id); v.info.delete(id); }
    const wrackPos0 = { x: wrack.f.x, y: wrack.f.y };
    v.wenden = () => false;
    const treiber = auto(raum, [vorwaerts(-120), vorwaerts(250)]);
    const nachrichten = []; const alt = raum.broadcast.bind(raum); raum.broadcast = (typ, ...r) => { nachrichten.push(typ); return alt(typ, ...r); };
    ueber = 0;
    let durch = false;
    for (let t = 0; t < 20 * 40; t++) {   // 40 s
      v.schritt(0.05); ueber += ueberlappungen(raum.state).length;
      if ((treiber.f.x - m.x) * Math.cos(w) + (treiber.f.y - m.y) * Math.sin(w) > 60) { durch = true; break; }
    }
    raum.broadcast = alt;
    assert.equal(ueber, 0, 'beim Schieben keine Überlappung');
    assert.ok(Math.hypot(wrack.f.x - wrackPos0.x, wrack.f.y - wrackPos0.y) > 12, 'Wrack wurde zur Seite geschoben');
    assert.ok(durch, 'Fahrzeug fährt danach weiter');
    assert.ok(nachrichten.includes('blech'), 'Blechgeräusch-Ereignis gesendet');
  } finally { await c.leave(); }
});

test('Unfall: Rauch → Feuer → Explosion mit Schaden im Radius, Wrack bleibt', async () => {
  const { c, raum } = await beitreten('Unfallzeuge');
  const SR = raum.constructor, e = SR.einstellungen, alt = { m: e.unfallMinuten, x: e.unfallExplosion, s: e.unfallSchaden, f: e.feuerMinuten };
  try {
    Object.assign(e, { unfallMinuten: 0, unfallExplosion: 100, unfallSchaden: 30, feuerMinuten: 0 });
    raum.kriecherChance = 0;
    const v = raum.verkehr, u = v.unfaelle, s = raum.state, p = s.spieler.get(c.sessionId);
    const nachrichten = []; const altB = raum.broadcast.bind(raum); raum.broadcast = (typ, ...r) => { nachrichten.push(typ); return altB(typ, ...r); };
    let ok = false;
    const orte = v.graph.knoten.filter((_, i) => i % 7 === 0);
    for (const n of orte) { if (u.ausloesen({ x: n.x, y: n.y }, { erzeugen: true, nah: true })) { ok = true; break; } }
    assert.ok(ok, 'Unfall ließ sich irgendwo auslösen');
    // Fahrt bis zum Aufprall
    for (let t = 0; t < 400 && !u.liste.size; t++) v.schritt(0.05);
    assert.equal(u.liste.size, 1, 'Aufprall eingetreten');
    const [id] = u.liste.keys(), w = s.fahrzeuge.get(id);
    assert.equal(w.art, 'wrack'); assert.ok(w.rauch, 'raucht');
    assert.ok(nachrichten.includes('krach'), 'Krach-Ereignis');
    assert.equal(s.feuer.size, 0, 'noch kein Feuer');
    // Spieler und Zombie am Rand der Druckwelle, außerhalb des Feuerkreises
    const abst = UNFALL_RADIUS - 3;
    p.ebene = ''; p.unten = false; p.hp = 100; p.zombie = 0; p.anBord = false; p.x = w.x + abst; p.y = w.y;
    const zid = raum.setzeZombie(w.x - abst, w.y, ''), z = s.zombies.get(zid);
    z.hp = 100;
    let feuerT = -1, expT = -1;
    for (let t = 0; t < 1200; t++) {   // 120 s
      raum.brand.schritt(0.1); v.schritt(0.1);
      if (feuerT < 0 && s.feuer.size) feuerT = t / 10;
      if (expT < 0 && nachrichten.includes('explosion')) expT = t / 10;
    }
    assert.ok(feuerT >= 9 && feuerT <= 21, 'Feuer nach 10–20 s: ' + feuerT);
    assert.ok(expT > feuerT, 'Explosion nach dem Feuerbeginn');
    assert.ok(p.hp < 100 && p.hp >= 100 - 30, 'Spielerschaden moderat: ' + p.hp);
    assert.ok(!s.zombies.has(zid), 'Zombie im Radius erledigt');
    assert.equal(w.art, 'wrack'); assert.ok(!w.rauch, 'ausgebrannt: kein Rauch mehr');
    assert.equal(u.liste.size, 0);
    raum.broadcast = altB;
  } finally { Object.assign(e, { unfallMinuten: alt.m, unfallExplosion: alt.x, unfallSchaden: alt.s, feuerMinuten: alt.f }); await c.leave(); }
});

test('Unfall: Einstellung 0 = nie, Wahrscheinlichkeit 0 % = kein Knall', async () => {
  const { c, raum } = await beitreten('Ruhig');
  const e = raum.constructor.einstellungen, alt = { m: e.unfallMinuten, x: e.unfallExplosion };
  try {
    const v = raum.verkehr, s = raum.state, p = s.spieler.get(c.sessionId);
    e.unfallMinuten = 0;
    v.start([], 40);
    const k = v.graph.haupt[0]; p.ebene = ''; p.x = k.x; p.y = k.y;
    const wracks0 = [...s.fahrzeuge.values()].filter(f => f.art === 'wrack').length;
    for (let t = 0; t < 4000; t++) v.schritt(0.5);   // gut eine halbe Spielstunde
    assert.equal(v.unfaelle.liste.size, 0);
    assert.ok(![...v.info.values()].some(i => i.unfall), 'kein Auto im Unfall');
    assert.equal([...s.fahrzeuge.values()].filter(f => f.art === 'wrack').length, wracks0);
    // 0 % Explosion: Feuer ja, Knall nein
    e.unfallExplosion = 0;
    const nachrichten = []; const altB = raum.broadcast.bind(raum); raum.broadcast = (typ, ...r) => { nachrichten.push(typ); return altB(typ, ...r); };
    const f = v.neu('auto', k); s.fahrzeuge.get(f).art = 'wrack';
    v.unfaelle.liste.clear();
    v.unfaelle.liste.set(f, { phase: 'rauch', t: 0, rauchBis: 1 });
    for (let t = 0; t < 400; t++) { raum.brand.schritt(0.5); v.schritt(0.5); }
    assert.ok(!nachrichten.includes('explosion'), 'keine Explosion bei 0 %');
    raum.broadcast = altB;
  } finally { e.unfallMinuten = alt.m; e.unfallExplosion = alt.x; await c.leave(); }
});

test('Superuser-Befehl „unfall“ löst einen Unfall in der Nähe aus', async () => {
  assert.ok(SU_BEFEHLE.includes('unfall'));
  const { c, raum } = await beitreten('Tester');
  try {
    const x = raum.extra.get(c.sessionId), p = raum.state.spieler.get(c.sessionId), client = raum.clients.find(q => q.sessionId === c.sessionId);
    x.superuser = true; p.ebene = '';
    let antwort = null;
    for (const n of raum.verkehr.graph.knoten.filter((_, i) => i % 9 === 0)) {
      p.x = n.x; p.y = n.y;
      antwort = befehl(raum, client, { befehl: 'unfall' });
      if (antwort?.startsWith('💥')) break;
    }
    assert.match(antwort, /^💥/);
    assert.ok([...raum.verkehr.info.values()].some(i => i.unfall), 'ein Auto fährt in den Unfall');
    x.superuser = false;
    assert.equal(befehl(raum, client, { befehl: 'unfall' }), null, 'ohne Superuser passiert nichts');
  } finally { await c.leave(); }
});

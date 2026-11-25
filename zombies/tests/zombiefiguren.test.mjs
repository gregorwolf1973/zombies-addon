// Neue Zombie-Figuren (Mixamo): Zuordnung Typ → Figur, Zustand → Clip, Bildnummern und Atlas/JSON-Stimmigkeit.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ZF_FIGUREN, ZF_CLIPS, ZF_TODE, ZF_BILDER, zfFigur, zfClip, zfAngriff, zfBild, zfName, zfLeiche, zfZerrBild, ZF_ZERREN, zfGang, zfAnzahl, ZF_GANG, ZF_OPTIONAL, zkKlasse, ZK_ANTEILE, ZK_KRIECHER, ZK_LAEUFER, ZK_SCHLURFER, ZF_SCHRITT, ZF_REF } from '../client/zombiefiguren.mjs';

const dir = new URL('../client/grafik/', import.meta.url);

test('Figur je Zombietyp: Soldat, Polizisten, Dirndl, alle 25 Typen gültig', () => {
  assert.equal(zfFigur(0), 'warzombie');
  assert.equal(zfFigur(20), 'copzombie');
  assert.equal(zfFigur(21), 'copzombie');
  assert.equal(zfFigur(1), 'zombiegirl');
  for (let v = 0; v < 25; v++) assert.ok(ZF_FIGUREN.includes(zfFigur(v)), 'Typ ' + v);
  assert.equal(zfFigur(7), zfFigur(7), 'deterministisch');
  const benutzt = new Set(Array.from({ length: 25 }, (_, v) => zfFigur(v)));
  assert.equal(benutzt.size, 5, 'alle fünf Figuren kommen vor');
});

test('Clip je Zustand', () => {
  assert.equal(zfClip({ geht: true, jagt: false }), 'walk');
  assert.equal(zfClip({ geht: true, jagt: true }), 'run');
  assert.equal(zfClip({ geht: false, jagt: true }), 'idle');
  assert.equal(zfClip({ geht: false }), 'idle');
  assert.equal(zfClip({ geht: true, jagt: true, nah: true }), 'attack');
  assert.equal(zfClip({ kriecht: true, geht: true, jagt: true }), 'crawl');
  assert.equal(zfClip({ kriecht: true, nah: true }), 'crawl');
  assert.equal(zfClip({ tot: true, kriecht: true, nah: true }), 'dying');
  const a = new Set(); for (let t = 0; t < 20000; t += 100) a.add(zfAngriff(t, 0.3));
  assert.deepEqual([...a].sort(), ['attack', 'neckbite']);
});

test('Bildnummern: Weg, Zeit, Sterben einmalig', () => {
  for (const clip of ['walk', 'run', 'crawl']) {
    const nummern = new Set(); for (let l = 0; l < 100; l += 0.1) nummern.add(zfBild(clip, { lauf: l }));
    assert.equal(nummern.size, ZF_BILDER, clip);
  }
  assert.equal(zfBild('walk', { lauf: 0 }), 0);
  assert.equal(zfBild('dying', { seit: 0 }), 0);
  assert.equal(zfBild('dying', { seit: 99999 }), ZF_BILDER - 1);
  const idle = new Set(); for (let t = 0; t < 5000; t += 50) idle.add(zfBild('idle', { zeitMs: t }));
  assert.equal(idle.size, ZF_BILDER);
  assert.ok(zfBild('attack', { zeitMs: 123456, versatz: 777 }) < ZF_BILDER);
});

test('Atlas: JSON passt zu den Bildern, Kantenlänge ≤ 4096, alle Rahmen im Atlas, Pflicht-Clips vollständig', () => {
  const j = JSON.parse(fs.readFileSync(new URL('zombies_neu.json', dir)));
  assert.deepEqual(j.figuren, ZF_FIGUREN);
  assert.ok(j.groesse[0] <= 4096 && j.groesse[1] <= 4096);
  let soll = 0;
  for (const c of ZF_CLIPS) {
    if (!j.clips[c]) { assert.ok(ZF_OPTIONAL.has(c), 'Pflicht-Clip fehlt: ' + c); continue; }
    assert.equal(j.clips[c].n, zfAnzahl(c), 'Bildzahl ' + c);
    soll += j.clips[c].n;
  }
  for (const f of ZF_FIGUREN) {
    assert.ok(fs.statSync(new URL(j.atlas[f], dir)).size > 10000, f);
    for (const c of ZF_CLIPS) for (let i = 0; i < (j.clips[c]?.n ?? 0); i++) {
      const r = j.bilder[zfName(f, c, i)]; assert.ok(r, zfName(f, c, i));
      assert.ok(r[0] + r[2] <= j.groesse[0] && r[1] + r[3] <= j.groesse[1]);
    }
  }
  assert.equal(Object.keys(j.bilder).length, ZF_FIGUREN.length * soll);
  // Rahmen überlappen nicht (fließend gepackt)
  const f0 = ZF_FIGUREN[0], rs = Object.entries(j.bilder).filter(([n]) => n.startsWith(f0 + '_')).map(([, r]) => r);
  for (let a = 0; a < rs.length; a++) for (let b = a + 1; b < rs.length; b++) {
    const p = rs[a], q = rs[b];
    assert.ok(p[0] + p[2] <= q[0] || q[0] + q[2] <= p[0] || p[1] + p[3] <= q[1] || q[1] + q[3] <= p[1], 'Rahmen überlappen');
  }
});

test('Gangart je Zombie: fest aus der Id, alle Varianten kommen vor, Bildnummern im Clip', () => {
  assert.deepEqual(zfGang('z17'), zfGang('z17'));
  const w = {}, r = {};
  for (let i = 0; i < 1000; i++) {
    const g = zfGang('z' + i);
    w[g.walk] = (w[g.walk] ?? 0) + 1; r[g.run] = (r[g.run] ?? 0) + 1;
  }
  for (const v of ZF_GANG.walk) assert.ok(w[v] > 200, v + ' ' + w[v]);
  for (const v of ZF_GANG.run) assert.ok(r[v] > 350, v + ' ' + r[v]);
  for (const c of ['walk2', 'walk3', 'run2']) {
    const nr = new Set(); for (let l = 0; l < 200; l += 0.25) nr.add(zfBild(c, { lauf: l }));
    assert.equal(nr.size, zfAnzahl(c), c); assert.ok(Math.max(...nr) < zfAnzahl(c));
  }
});

import { ZF_LISTE, ZF_VARIANTE_AB, zfVariante, zfFigurenEinst, zfWaehle } from '../client/zombiefiguren.mjs';

test('Figurenliste: Atlas für jede Figur vorhanden, Variante 100+Index bildet direkt auf die Figur ab', () => {
  const j = JSON.parse(fs.readFileSync(new URL('zombies_neu.json', dir), 'utf8'));
  ZF_LISTE.forEach((f, i) => {
    assert.ok(j.atlas[f.id], f.id); assert.ok(j.bilder[f.id + '_walk_00'], f.id);
    assert.equal(zfFigur(ZF_VARIANTE_AB + i), f.id); assert.equal(zfVariante(f.id), ZF_VARIANTE_AB + i);
  });
  assert.equal(zfFigur(ZF_VARIANTE_AB + 99), ZF_LISTE[0].id, 'ungültig fällt auf erste Figur');
});

test('Auswahl: nur aktive Figuren, Anteile wirken, mindestens eine bleibt an', () => {
  const e = zfFigurenEinst({ warzombie: { an: false }, copzombie: { an: true, anteil: 75 }, zombiegirl: { an: true, anteil: 25 }, yaku: { an: false }, romero: { an: false } });
  const n = {}; for (let i = 0; i < 1000; i++) { const f = zfWaehle(e, i / 1000); n[f] = (n[f] ?? 0) + 1; }
  assert.deepEqual(Object.keys(n).sort(), ['copzombie', 'zombiegirl']);
  assert.equal(n.copzombie, 750); assert.equal(n.zombiegirl, 250);
  const alle = zfFigurenEinst({ warzombie: { an: false }, copzombie: { an: false }, zombiegirl: { an: false }, yaku: { an: false }, romero: { an: false } });
  assert.equal(Object.values(alle).filter(q => q.an).length, 1);
  const nullen = Object.fromEntries(ZF_LISTE.map(f => [f.id, { an: true, anteil: 0 }]));
  assert.ok(ZF_LISTE.some(f => f.id === zfWaehle(nullen, 0.5)), 'Anteil 0 überall = gleich verteilt');
  assert.equal(zfWaehle(e, 1), 'zombiegirl'); assert.equal(zfWaehle(e, -1), 'copzombie');
});

test('Leichen: drei Sterbebewegungen, Drehung und Spiegelung fest je Id und gut gestreut', () => {
  assert.deepEqual(zfLeiche('l17'), zfLeiche('l17'), 'deterministisch');
  const clips = {}, dreh = new Set(); let gespiegelt = 0;
  for (let i = 0; i < 600; i++) {
    const l = zfLeiche('l' + i);
    assert.ok(ZF_TODE.includes(l.clip)); assert.ok(l.dreh >= 0 && l.dreh < 2 * Math.PI);
    clips[l.clip] = (clips[l.clip] ?? 0) + 1; dreh.add(Math.floor(l.dreh / (Math.PI / 4))); if (l.spiegeln) gespiegelt++;
  }
  for (const c of ZF_TODE) assert.ok(clips[c] > 120, c + ' ' + clips[c]);
  assert.equal(dreh.size, 8, 'alle Achtel der Drehung kommen vor');
  assert.ok(gespiegelt > 200 && gespiegelt < 400, 'gespiegelt ' + gespiegelt);
  for (const c of ZF_TODE) { assert.equal(zfBild(c, { seit: 0 }), 0); assert.equal(zfBild(c, { seit: 99999 }), ZF_BILDER - 1); }
});

test('Im Draht: Kriech-Clip langsam (Zerren), ein Zug ~5 s mit Haltephase, kein schnelles Durchlaufen', () => {
  for (const h of [0, 0.37, 0.9]) {
    let wechsel = 0, halt = 0, alt = zfZerrBild(0, h);
    for (let t = 50; t <= 10000; t += 50) { const b = zfZerrBild(t, h); assert.ok(b >= 0 && b < ZF_BILDER); if (b !== alt) wechsel++; else halt++; alt = b; }
    assert.ok(wechsel <= 2 * ZF_BILDER * 10000 / (ZF_ZERREN * 0.85) / 2 + 4, 'zu schnell: ' + wechsel + ' Bildwechsel in 10 s');
    assert.ok(halt > wechsel, 'keine Haltephasen');
  }
});

test('Bewegungsklassen: fest aus der Id, Anteile wie eingestellt, Läufer-Bonus geht vom Schlurfer ab', () => {
  assert.equal(zkKlasse('z5'), zkKlasse('z5'));
  const zaehle = (anteile, bonus = 0) => { const n = [0, 0, 0]; for (let i = 0; i < 5000; i++) n[zkKlasse('z' + i, anteile, bonus)]++; return n.map(x => x / 5000); };
  const v = zaehle(ZK_ANTEILE);
  assert.ok(Math.abs(v[ZK_KRIECHER] - 0.1) < 0.02 && Math.abs(v[ZK_SCHLURFER] - 0.6) < 0.03 && Math.abs(v[ZK_LAEUFER] - 0.3) < 0.03, JSON.stringify(v));
  const b = zaehle(ZK_ANTEILE, 0.2);
  assert.ok(Math.abs(b[ZK_LAEUFER] - 0.5) < 0.03 && Math.abs(b[ZK_KRIECHER] - 0.1) < 0.02, JSON.stringify(b));
  assert.deepEqual(zaehle({ kriecher: 0, schlurfer: 0, laeufer: 5 }), [0, 1, 0]);
  // Schlurfer gehen auch beim Jagen, Läufer rennen
  assert.equal(zfClip({ geht: true, jagt: true, laeufer: false }), 'walk');
  assert.equal(zfClip({ geht: true, jagt: true, laeufer: true }), 'run');
});

test('Kein Rutschen: Weg je Bildzyklus = gemessene Schrittlänge der Mixamo-Clips × Anzeigemaßstab (16,44 px je m × 0,7)', () => {
  const m = { walk: 1.37, walk2: 0.78, walk3: 1.37, run: 1.91, run2: 1.57, crawl: 0.43 };   // tools/mixamo/seite.html ?nur=tempo (Mittel aus romero/warzombie)
  for (const [c, meter] of Object.entries(m)) assert.ok(Math.abs(ZF_SCHRITT[c] - meter * 16.44 * ZF_REF) < 1, c + ' ' + ZF_SCHRITT[c]);
});

test('zfBlut: je Leiche fest aus der Id, Lache und Spritzer kommen beide vor', async () => {
  const { zfBlut } = await import('../client/zombiefiguren.mjs');
  const a = Array.from({ length: 200 }, (_, i) => zfBlut('l' + i));
  assert.deepEqual(zfBlut('l7'), zfBlut('l7'));
  const lachen = a.filter(q => q.art === 'lache').length;
  assert.ok(lachen > 60 && lachen < 140, 'Verteilung ' + lachen);
  for (const q of a) assert.ok(q.nr >= 0 && q.nr <= 2 && q.groesse >= 0.85 && q.groesse <= 1.15);
});

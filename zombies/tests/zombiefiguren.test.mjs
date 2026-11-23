// Neue Zombie-Figuren (Mixamo): Zuordnung Typ → Figur, Zustand → Clip, Bildnummern und Atlas/JSON-Stimmigkeit.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ZF_FIGUREN, ZF_CLIPS, ZF_BILDER, zfFigur, zfClip, zfAngriff, zfBild, zfName } from '../client/zombiefiguren.mjs';

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
    const nummern = new Set(); for (let l = 0; l < 100; l += 0.5) nummern.add(zfBild(clip, { lauf: l }));
    assert.equal(nummern.size, ZF_BILDER, clip);
  }
  assert.equal(zfBild('walk', { lauf: 0 }), 0);
  assert.equal(zfBild('dying', { seit: 0 }), 0);
  assert.equal(zfBild('dying', { seit: 99999 }), ZF_BILDER - 1);
  const idle = new Set(); for (let t = 0; t < 5000; t += 50) idle.add(zfBild('idle', { zeitMs: t }));
  assert.equal(idle.size, ZF_BILDER);
  assert.ok(zfBild('attack', { zeitMs: 123456, versatz: 777 }) < ZF_BILDER);
});

test('Atlas: JSON passt zu den Bildern, Kantenlänge ≤ 4096, alle Rahmen im Atlas', () => {
  const j = JSON.parse(fs.readFileSync(new URL('zombies_neu.json', dir)));
  assert.deepEqual(j.figuren, ZF_FIGUREN);
  assert.ok(j.groesse[0] <= 4096 && j.groesse[1] <= 4096);
  for (const f of ZF_FIGUREN) {
    assert.ok(fs.statSync(new URL(j.atlas[f], dir)).size > 10000, f);
    for (const c of ZF_CLIPS) for (let i = 0; i < ZF_BILDER; i++) {
      const r = j.bilder[zfName(f, c, i)]; assert.ok(r, zfName(f, c, i));
      assert.ok(r[0] + r[2] <= j.groesse[0] && r[1] + r[3] <= j.groesse[1]);
    }
  }
  assert.equal(Object.keys(j.bilder).length, ZF_FIGUREN.length * ZF_CLIPS.length * ZF_BILDER);
});

// Neue Helden-Figuren (Mixamo): Waffe → Gruppe → Clip, Bildnummern, Mündung, Atlas/JSON-Stimmigkeit.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { HF_FIGUREN, HF_GRUPPEN, HF_GRUPPE, hfGruppe, hfClip, hfBild, hfMuendung, FIG_PX_JE_M, HF_GROESSE } from '../client/heldenfiguren.mjs';
import { ZF_GROESSE } from '../client/zombiefiguren.mjs';
import { WAFFEN } from '../client/welt.mjs';

const dir = new URL('../client/grafik/', import.meta.url);
const j = JSON.parse(fs.readFileSync(new URL('helden_neu.json', dir)));

test('Waffe → Gruppe: alle Waffen aus welt.mjs haben eine Gruppe, Gewehr-artige gleich', () => {
  for (const w of Object.keys(WAFFEN)) assert.ok(HF_GRUPPEN.includes(hfGruppe(w)), w);
  for (const w of ['gewehr', 'mp', 'mg', 'scharfschuetze', 'granatwerfer', 'jagdgewehr']) assert.equal(hfGruppe(w), 'gewehr', w);
  assert.equal(hfGruppe('schrotflinte'), 'schrot');
  assert.equal(hfGruppe('pistole'), 'pistole');
  for (const w of ['schlaeger', 'brechstange', 'sense']) assert.equal(hfGruppe(w), 'schlaeger', w);
  assert.equal(hfGruppe('messer'), 'messer');
  for (const w of ['faust', 'handgranate', 'unbekannt', undefined]) assert.equal(hfGruppe(w), 'ohne', String(w));
});

test('Gruppe + Zustand → Clip, jeder Clip existiert im Atlas', () => {
  assert.equal(hfClip('ohne', 'gehen'), 'gehen');
  assert.equal(hfClip('pistole', 'rennen'), 'pistole_rennen');
  assert.equal(hfClip('gewehr', 'schiessen'), 'gewehr_schiessen');
  assert.equal(hfClip('messer', 'nahkampf'), 'messer_stechen');
  assert.equal(hfClip('schlaeger', 'nahkampf'), 'schlaeger_schlagen');
  assert.equal(hfClip('ohne', 'nahkampf'), 'faust_schlagen');
  assert.equal(hfClip('messer', 'schiessen'), 'messer_stechen');
  for (const g of HF_GRUPPEN) for (const a of ['stehen', 'gehen', 'rennen', 'schiessen', 'nahkampf', 'tod']) assert.ok(j.clips[hfClip(g, a)], g + ' ' + a);
});

test('Bildnummern: Weg, Zeit, einmalige Clips', () => {
  const geh = j.clips.gehen, nr = new Set(); for (let l = 0; l < 200; l += 0.5) nr.add(hfBild(geh, { lauf: l }));
  assert.equal(nr.size, geh.n);
  assert.equal(hfBild(geh, { lauf: 0 }), 0);
  const steh = j.clips.stehen, z = new Set(); for (let t = 0; t < steh.dauer * 1000; t += 20) z.add(hfBild(steh, { zeitMs: t }));
  assert.equal(z.size, steh.n);
  const tod = j.clips.tod; assert.equal(hfBild(tod, { seit: 0, ms: 1400 }), 0); assert.equal(hfBild(tod, { seit: 99999, ms: 1400 }), tod.n - 1);
  assert.ok(j.clips.rennen.weg > j.clips.gehen.weg * 0.8);
});

test('Mündung: Waffenachse zeigt nach Drehung zum Ziel, Versatz dreht mit', () => {
  const m = [50, -40, -1.0], o = hfMuendung(m, 0.5, 0.2);
  assert.ok(Math.abs(o.rot + m[2] * 0 - (0.5 + 1.0)) < 1e-9);
  assert.ok(Math.abs(Math.hypot(o.x, o.y) - Math.hypot(50, 40) * 0.2) < 1e-9);
});

test('Atlas: gleicher Maßstab wie Zombies, Kantenlänge ≤ 4096, Clips im Atlas, Mündung je Schussclip', () => {
  assert.equal(HF_GROESSE, ZF_GROESSE); assert.equal(FIG_PX_JE_M, 40);
  assert.deepEqual(j.figuren, HF_FIGUREN);
  assert.ok(j.groesse[0] <= 4096 && j.groesse[1] <= 4096);
  for (const f of HF_FIGUREN) assert.ok(fs.statSync(new URL(j.atlas[f], dir)).size > 10000, f);
  for (const [c, k] of Object.entries(j.clips)) {
    assert.ok(k.y + k.feld <= j.groesse[1] && k.n * k.feld <= j.groesse[0], c);
    assert.equal(k.feld, c === 'tod' ? 200 : 160, c);
    if (/_schiessen$/.test(c)) for (const f of HF_FIGUREN) assert.equal(k.mund[f].length, k.n, c + f);
    if (/gehen$|rennen$/.test(c)) assert.ok(k.weg > 0, c);
  }
  assert.ok(Object.keys(HF_GRUPPE).length >= 12);
});

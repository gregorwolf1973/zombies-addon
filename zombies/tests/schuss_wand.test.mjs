// Kein Schuss durch Hauswände: Held (automatisches Zielen), Boxer-Turm, Puma (inkl. Flächenschaden) und Leopard-MG/Kanone
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SpielRaum } from '../server/raum.mjs';
import { Fahrbar, FahrbarPuma } from '../server/fahrbar.mjs';
import { Leopard } from '../server/leopard.mjs';
import { haufenZiel } from '../server/zielwahl.mjs';
import { sichtfrei, T, KACHEL } from '../client/welt.mjs';

// Welt: alles Wiese, senkrechte Wand (eine Kachel dick) bei Kachelspalte 5; hole() wie in der echten Welt
const wand = new Set(['5,0', '5,1', '5,2', '5,3']);
const welt = { hole: (x, y) => wand.has(x + ',' + y) ? T.WAND : T.WIESE };
const K = KACHEL, y0 = K * 1.5;
const links = { x: K * 3.5, y: y0 }, rechts = { x: K * 7.5, y: y0 }, nah = { x: K * 4.5, y: y0 };
const zom = (z) => ({ ...z, hp: 100, ebene: '' });
function zustand(...zs) { const m = new Map(); zs.forEach((z, i) => m.set('z' + i, zom(z))); return m; }

test('Hilfe: Wand trennt, freie Strecke nicht (Feinraster)', () => {
  assert.equal(sichtfrei(welt, links.x, y0, rechts.x, y0), false);
  assert.equal(sichtfrei(welt, links.x, y0, nah.x, y0), true);
  // feine Innenwelt (welt.kachel klein): schräge Linie darf eine dünne Wand nicht überspringen
  const fein = { kachel: 8, hole: (x, y) => x === 10 ? T.WAND : T.WIESE };
  assert.equal(sichtfrei(fein, 40, 20, 160, 70), false);
});

test('Held: Zombie hinter der Wand wird nicht anvisiert, freie Sicht schon', () => {
  const raum = { state: { zombies: zustand(rechts), spieler: new Map() }, zombieInfo: new Map(), wv: () => welt };
  assert.equal(SpielRaum.prototype.naechsterZombie.call(raum, links.x, y0, 400, { ebene: '' }), null);
  raum.state.zombies = zustand(rechts, nah);
  const z = SpielRaum.prototype.naechsterZombie.call(raum, links.x, y0, 400, { ebene: '' });
  assert.ok(z && z[1].x === nah.x);
});

function fahrzeug(proto, zombies) {
  const f = Object.create(proto);
  f.raum = { welt, state: { zombies: zustand(...zombies) } };
  return f;
}
test('Boxer/Puma: Turm wählt keinen Zombie hinter der Wand', () => {
  const pv = { x: links.x, y: y0 };
  assert.equal(fahrzeug(Fahrbar.prototype, [rechts]).naechsterZombie(pv, 400), null);
  assert.equal(fahrzeug(FahrbarPuma.prototype, [rechts]).naechsterZombie(pv, 400), null);
  assert.ok(fahrzeug(FahrbarPuma.prototype, [rechts, nah]).naechsterZombie(pv, 400));
});

test('Leopard: Kanonen-Haufen hinter der Wand wird nicht gewählt, davor schon', () => {
  const s = { zombies: zustand(rechts, { x: rechts.x + 4, y: y0 }, { x: rechts.x - 4, y: y0 }), spieler: new Map() };
  const sicht = (x, y) => sichtfrei(welt, links.x, y0, x, y);
  const opt = { rmin: 0, rmax: 1000, R: 40, min: 2, sicher: 1, sicht };
  assert.equal(haufenZiel(s, links, opt), null);
  assert.ok(haufenZiel(s, rechts, { ...opt, sicht: (x, y) => sichtfrei(welt, rechts.x + 30, y0, x, y) }));
  assert.ok(haufenZiel(s, links, { ...opt, sicht: undefined }), 'ohne Sichtprüfung (alt) wäre er gewählt worden');
});

test('Leopard-MG und Kanonensplitter respektieren die Wand', () => {
  const sendet = [];
  const raum = { welt, state: { zombies: zustand(rechts), spieler: new Map(), besiegt: 0 }, broadcast: (a, b) => sendet.push(a), rnd: () => 0, zombieInfo: new Map(), schaden: () => assert.fail('Treffer durch Wand'), laerm() {} };
  const l = new Leopard(raum, 'Leopard');
  const f = { x: links.x, y: y0, richtung: 0, turm: 0 };
  l.fahrzeug = f;
  for (let i = 0; i < 40; i++) l.schritt(f, 0.1, { reichweite: 400, kanone: false, mgPause: 0.1, trefferChance: 1, mgSchaden: 50, kanonePause: 8, kanoneMin: 2 });
  assert.ok(!sendet.includes('bwschuss'), 'MG schoss durch die Wand');
  l.kanonenSchuss(f, { x: f.x, y: f.y }, { x: nah.x, y: y0 });   // Einschlag diesseits, Zombie jenseits der Wand
  assert.ok(true);
});

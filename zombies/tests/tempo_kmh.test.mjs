// Held-/Zombietempo in km/h (8 px = 1 m): Vorgaben, Einstellungen, gemeinsame Spielwerte
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WERTE as W, tempoWerteSetzen } from '../client/welt.mjs';
import { bereinige, vorgaben } from '../server/einstellungen.mjs';

test('Vorgaben: 20 / 9 km/h Held, 15 / 4 km/h Zombie', () => {
  assert.ok(Math.abs(W.tempoGehen - 20 / 3.6 * 8) < 1e-9);
  assert.ok(Math.abs(W.tempoSchleichen - 9 / 3.6 * 8) < 1e-9);
  assert.ok(Math.abs(W.zombieTempoJagen - 15 / 3.6 * 8) < 1e-9);
  assert.ok(Math.abs(W.zombieTempoWandern - 4 / 3.6 * 8) < 1e-9);
});

test('tempoWerteSetzen übernimmt Einstellungen und fängt Unsinn ab', () => {
  const w = {};
  tempoWerteSetzen(w, { gehen: 36, schleichen: 18, jagen: 18, wandern: 9 });
  assert.equal(w.tempoGehen, 80); assert.equal(w.tempoSchleichen, 40); assert.equal(w.zombieTempoJagen, 40); assert.equal(w.zombieTempoWandern, 20);
  tempoWerteSetzen(w, { gehen: 'x' });
  assert.ok(Math.abs(w.tempoGehen - 20 / 3.6 * 8) < 1e-9);
});

test('Einstellungen: Vorgabe und Grenzen', () => {
  const v = vorgaben();
  assert.deepEqual([v.tempoHeldGehen, v.tempoHeldSchleichen, v.tempoZombieJagen, v.tempoZombieWandern], [20, 9, 15, 4]);
  assert.equal(bereinige({ tempoHeldGehen: 999 }, v).tempoHeldGehen, 999);
});

test('Bewegungsklassen: Kriecher 1 km/h, Schlurfer 2,4 km/h umherziehend / 7 km/h jagend (eigener Regler), Läufer bis „jagt“; Vorgabe-Anteile 5/45/50', async () => {
  const { SpielRaum } = await import('../server/raum.mjs');
  const { ZK_KRIECHER, ZK_LAEUFER, ZK_SCHLURFER } = await import('../client/zombiefiguren.mjs');
  const kmh = px => px / 8 * 3.6, kt = (z, e) => kmh(SpielRaum.prototype.klassenTempo.call({}, z, e));
  assert.ok(Math.abs(kt({ kriecht: true, kl: ZK_KRIECHER }, true) - 1) < 1e-9);
  assert.ok(Math.abs(kt({ kl: ZK_SCHLURFER }, true) - 7) < 1e-9 && Math.abs(kt({ kl: ZK_SCHLURFER }, false) - 2.4) < 1e-9);
  // eigener Regler „Schlurfer jagt“: Vorgabe 7 km/h, ohne harte Grenzen, aber nie schneller als „Zombie jagt“
  const v = vorgaben(); assert.equal(v.tempoSchlurferJagen, 7);
  assert.equal(bereinige({ tempoSchlurferJagen: 12 }, v).tempoSchlurferJagen, 12, 'empfohlene Spanne ist keine Grenze');
  const w = {}; tempoWerteSetzen(w, { jagen: 15, wandern: 4, schlurfer: 9 }); assert.ok(Math.abs(w.zombieTempoSchlurfer - 20) < 1e-9);
  const alt = { ...W }; try {
    tempoWerteSetzen(W, { jagen: 6, wandern: 4, schlurfer: 9 });
    assert.ok(Math.abs(kt({ kl: ZK_SCHLURFER }, true) - 6) < 1e-9, 'Schlurfer höchstens so schnell wie „Zombie jagt“');
  } finally { Object.assign(W, alt); }
  assert.ok(Math.abs(kt({ kl: ZK_LAEUFER }, true) - 15) < 1e-9);
  assert.ok(kt({ kriecht: true, kl: ZK_LAEUFER }, true) <= 1, 'angeschossener Läufer robbt nur noch');
  const z = vorgaben().zombies;
  assert.deepEqual([z.anteilKriecher, z.anteilSchlurfer, z.anteilLaeufer], [5, 45, 50]);
});

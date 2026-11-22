// Nach dem Verlassen eines Hauses darf man sofort ein anderes Haus betreten (Ankunftssperre gilt nur an der eigenen Haustür).
// Früher war der Bezugspunkt die Ausgangskachel in Innenraum-Koordinaten (oben links auf der Karte): Häuser, die näher an
// der linken oberen Ecke lagen als das verlassene, ließen sich dann nicht betreten (Intersport Reiser, 20.11.2026).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { setzeKartengroesse, KACHEL } from '../client/welt.mjs';
import { baueWeltAusKarte } from '../client/osmwelt.mjs';
import { innenraumFuer } from '../client/innen.mjs';
import { SpielRaum } from '../server/raum.mjs';

test('Haustür: nach dem Hinausgehen sofort ein anderes Haus betreten, die eigene Tür erst nach Weggehen', () => {
  const karte = JSON.parse(fs.readFileSync(new URL('../client/karten/isarauen.json', import.meta.url)));
  setzeKartengroesse(karte.breite, karte.hoehe);
  const welt = baueWeltAusKarte(karte, 1, { autos: 1 });
  const ebenen = new Map();
  const r = Object.create(SpielRaum.prototype);
  // state/clients sind bei Colyseus Zugriffsfunktionen: als eigene Werte überdecken
  for (const [k, v] of Object.entries({ state: { seed: 1, tueren: new Map() }, clients: [] })) Object.defineProperty(r, k, { value: v, writable: true });
  Object.assign(r, {
    welt, brand: null,
    wv: e => (!e ? welt : ebenen.get(e) ?? ebenen.set(e, innenraumFuer(1, welt, e)).get(e)),
    freierPlatz: ort => ({ x: ort.x, y: ort.y }),
  });
  const offen = welt.haeuser.filter(h => h.betretbar && !h.safe);
  // A weit unten rechts, B nahe der linken oberen Ecke (dort lag der falsche Bezugspunkt)
  const A = offen.reduce((a, h) => (h.tuer.x + h.tuer.y > a.tuer.x + a.tuer.y ? h : a));
  const B = offen.reduce((a, h) => (h.tuer.x + h.tuer.y < a.tuer.x + a.tuer.y ? h : a));
  const mitte = k => ({ x: (k.x + 0.5) * KACHEL, y: (k.y + 0.5) * KACHEL });
  const p = { ebene: `h${A.nr}eg`, ...mitte(innenraumFuer(1, welt, `h${A.nr}eg`).ausgang) };
  const x = {};
  // Betreten: an die Wandlinie der Tür stellen und 0,4 s gezielt hineinlaufen (Haustür-Regel: Wandlinie + Eingaberichtung ≥ 0,3 s)
  const eintreten = h => {
    const q = h.tuerPos;
    Object.assign(p, { x: q.x + q.nx * 3, y: q.y + q.ny * 3 });
    x.eingabe = { dx: -q.nx, dy: -q.ny, s: false };
    r.uebergang('s1', p, x, 0.2); r.uebergang('s1', p, x, 0.2);
  };
  r.uebergang('s1', p, x, 0.05);
  assert.equal(p.ebene, '', 'aus Haus A hinausgegangen');
  r.uebergang('s1', p, x, 0.3);   // Wechselsperre läuft ab
  // zur Haustür von B (weit weg von A): muss sofort klappen
  eintreten(B);
  assert.equal(p.ebene, `h${B.nr}eg`, `Haus ${B.nr} ließ sich nach dem Verlassen von Haus ${A.nr} nicht betreten`);

  // eigene Tür: direkt nach dem Hinausgehen gesperrt (gehaltene Taste), nach Weggehen wieder offen
  r.uebergang('s1', p, x, 0.3);
  x.ankunft = null;   // drinnen herumgelaufen (die Sperre am Ausgang drinnen ist hier nicht Gegenstand)
  Object.assign(p, mitte(innenraumFuer(1, welt, `h${B.nr}eg`).ausgang));
  r.uebergang('s1', p, x, 0.05);
  assert.equal(p.ebene, '');
  r.uebergang('s1', p, x, 0.3);
  const vor = { x: p.x, y: p.y };
  eintreten(B);
  assert.equal(p.ebene, '', 'direkt zurück durch die eigene Tür ist gesperrt');
  Object.assign(p, { x: vor.x + B.raus.dx * KACHEL * 3, y: vor.y + B.raus.dy * KACHEL * 3 });
  r.uebergang('s1', p, x, 0.05);   // weggegangen: Sperre fällt
  eintreten(B);
  assert.equal(p.ebene, `h${B.nr}eg`, 'nach dem Weggehen geht die eigene Tür wieder');
});

// Paket 0.89 (Teil 1): Zombie-Geräuschpause (Einstellung + Client), keine Blumenbeete, Kletterzone, weiche Rauchteilchen, Eckkarte, Namensabstand
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { vorgaben, bereinige } from '../server/einstellungen.mjs';
import { WELT_VERSION } from '../client/welt.mjs';
import { weichSkala } from '../client/weichkreis.mjs';
import { RauchPool, RAUCH_MAX } from '../client/kanonenrauch.mjs';
import { BLUT_GROESSE } from '../client/effekte.mjs';

const lies = p => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');

test('geraeuschPause: Vorgabe 5 s, empfohlen 0–30, größere Werte bleiben erlaubt, Verwaltung hat das Feld', () => {
  assert.equal(vorgaben().geraeuschPause, 5);
  assert.equal(bereinige({ geraeuschPause: 12 }, {}).geraeuschPause, 12);
  assert.equal(bereinige({ geraeuschPause: 0 }, {}).geraeuschPause, 0);
  assert.equal(bereinige({ geraeuschPause: 100 }, {}).geraeuschPause, 100);   // keine harten Limits im empfohlenen Bereich
  assert.equal(bereinige({}, {}).geraeuschPause, 5);
  assert.ok(lies('client/verwaltung.html').includes('id="tnGeraeusch"'));
  assert.ok(/geraeuschPause/.test(lies('server/index.mjs')), 'geht über /info an den Client');
});

test('Keine Blumenbeete mehr in den Karten, Weltversion erhöht', () => {
  assert.ok(WELT_VERSION >= 36);
  for (const f of fs.readdirSync(new URL('../client/karten/', import.meta.url)).filter(n => n.endsWith('.json'))) {
    const k = JSON.parse(lies('client/karten/' + f));
    assert.equal((k.objekte ?? []).filter(o => o.a === 'beet').length, 0, f);
  }
});

test('Blut halb so groß, Rauch aus kleineren Teilchen', () => {
  assert.equal(BLUT_GROESSE, 0.5);
  assert.ok(weichSkala(2) < weichSkala(4));
  const p = new RauchPool(RAUCH_MAX, () => 0.5);
  p.schuss(0, 0, 0, -400, 0);
  const r = Math.max(...p.p.filter(q => q.an).map(q => q.r1));
  assert.ok(r <= 14, 'größtes Rauchteilchen höchstens 14 px Radius: ' + r);
  assert.ok(p.aktiv() >= 60, 'mehr, dafür kleinere Teilchen: ' + p.aktiv());
});

test('Eckkarte: Textanzeige steht im großen Zustand über dem Maßstabsbalken', () => {
  assert.match(lies('client/stil.css'), /#kartenbox\.gross #kartenunten \{[^}]*bottom: (2[4-9]|[3-9]\d)px/);
});

test('Name und Lebensbalken: Abstand = Figurradius + fester Bildschirmabstand (keine Festwerte mehr)', () => {
  const s = lies('client/spiel.mjs');
  assert.match(s, /f\.name\.setScale\(k\)\.setY\(-\(R \+ 20 \* k\)\)/);
  assert.ok(!/setY\(-28 \* fp\)/.test(s));
});

test('Zombie im Draht zappelt ruhig (Zerren statt Dauerzittern)', () => { const s = lies('client/spiel.mjs'); assert.ok(/haengZerren\(this\.time\.now/.test(s)); assert.ok(!/this\.time\.now \/ 80 \+ z\.x \* 0\.7/.test(s)); });

test('Superuser-Menü schließt nicht nach einer Auswahl', () => { const s = lies('client/spiel.mjs'); assert.ok(!/if \(!bt\.dataset\.schalter && !bt\.dataset\.zr\) zu\(\);/.test(s)); });

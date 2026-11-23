// Straßenränder: Breitenstufen weich verjüngt, Gehweg-Teilstücke folgen derselben Randverschiebung wie Asphalt und Bordstein
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { setzeKartengroesse } from '../client/welt.mjs';
import { baueWeltAusKarte } from '../client/osmwelt.mjs';
import { _randTest as R } from '../client/vektor.mjs';

const karte = JSON.parse(fs.readFileSync(new URL('../client/karten/kochel.json', import.meta.url)));
setzeKartengroesse(karte.breite, karte.hoehe);
const welt = baueWeltAusKarte(karte, 1, { autos: 0 });
const v = R.vorbereiten(welt);

test('Breitenstufe 3 → 2 Spuren (Schmied-von-Kochel-Platz): Kante springt am Anschlusspunkt nicht', () => {
  const a = v.linien[153], b = v.linien[223];   // endet bzw. beginnt bei (301.4, 165.1)
  const da = R.dichtL(a, v), db = R.dichtL(b, v);
  assert.ok(da.tap && db.tap, 'beide Linien werden verjüngt');
  const ja = da.n - 1, jb = 0;
  const fa = R.fahrbahn(a), fb = R.fahrbahn(b);
  assert.notEqual(fa, fb);
  for (const seite of [1, -1]) {
    const ea = R.wandern(da, seite * fa / 2, [])[ja], eb = R.wandern(db, seite * fb / 2, [])[jb];
    assert.ok(Math.hypot(ea[0] - eb[0], ea[1] - eb[1]) < 0.01, 'Randpunkte am Knoten fallen zusammen');
  }
  // entlang der Linie: Abstand zur Mittellinie ändert sich nur stetig (< 1,5 px je ~6-px-Schritt)
  for (const [d, f] of [[da, fa], [db, fb]]) {
    const r = R.wandern(d, f / 2, []); let max = 0;
    for (let j = 1; j < r.length; j++) max = Math.max(max, Math.abs(Math.hypot(r[j][0] - d.x[j], r[j][1] - d.y[j]) - Math.hypot(r[j - 1][0] - d.x[j - 1], r[j - 1][1] - d.y[j - 1])));
    assert.ok(max < 1.5, 'kein Sprung im Rand: ' + max);
  }
});

test('Gehweg-Teilstücke nutzen Bogenlänge, Ausblendung und Beule der Elternlinie', () => {
  let geprueft = 0;
  for (const l of v.linien) {
    if (!l.gehTeile || l.gl !== undefined || l.gr !== undefined) continue;
    const d = R.dichtL(l, v);
    for (const t of l.gehTeile) {
      const e = R.teilAusschnitt(l, t, d); if (!e) continue;
      const j0 = d.s.findIndex(s => Math.abs(s - e.s[0]) < 1e-6);
      assert.ok(j0 >= 0);
      for (let j = 0; j < e.n; j += 5) { assert.equal(e.s[j], d.s[j0 + j]); assert.equal(e.f[j], d.f[j0 + j]); }
      for (const seite of [1, -1]) {
        const comp = [R.beule(l, seite)];
        const p = R.wandern(d, seite * 20, comp), q = R.wandern(e, seite * 20, comp);
        // innerhalb des Teilstücks (ohne auslaufende Enden) gleiche Randverschiebung wie die Elternlinie
        const m = e.n >> 1, dist = Math.min(e.s[m] - e.s[0], e.s[e.n - 1] - e.s[m]);
        if (dist > 60) { assert.ok(Math.hypot(p[j0 + m][0] - q[m][0], p[j0 + m][1] - q[m][1]) < 1e-6); geprueft++; }
      }
    }
  }
  assert.ok(geprueft > 0, 'mindestens ein Teilstück geprüft');
});

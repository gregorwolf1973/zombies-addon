import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ausbeulung, BEULE_MAX, BEULE_ABSTAND } from '../client/strassenrand.mjs';

test('Ausbeulung: deterministisch, begrenzt, glatt, Beulen alle ~20-35 m', () => {
  const a = ausbeulung(123, 1), b = ausbeulung(123, 1), c = ausbeulung(124, 1), m = ausbeulung(123, -1);
  let diff = 0, vorher = 0, beulen = 0, ein = false;
  const N = 4000;
  for (let s = 0; s < N * 8; s += 4) {
    const v = a(s);
    assert.equal(v, b(s));
    assert.ok(v >= 0 && v <= BEULE_MAX + 1e-9, 'Betrag begrenzt');
    assert.equal(m(s), -v, 'andere Seite spiegelt vorzeichenrichtig');
    assert.ok(Math.abs(v - vorher) < 1.6, "kein Sprung");
    vorher = v;
    if (v !== c(s)) diff++;
    if (v > 0.05 && !ein) { beulen++; ein = true; } else if (v <= 0.05) ein = false;
  }
  assert.ok(diff > 100, 'anderer Seed gibt andere Beulen');
  const meter = N * 8 / 8, abstand = meter / beulen;
  assert.ok(abstand > 15 && abstand < 45, 'mittlerer Abstand ' + abstand + ' m');
  assert.ok(BEULE_ABSTAND === 200);
});

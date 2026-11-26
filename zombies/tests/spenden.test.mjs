import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SPENDEN_LINKS } from '../client/spenden.mjs';

test('Spenden: Adressen zentral, Startseite/Einstellungen haben Container, Abspann füllt sie', () => {
  assert.equal(SPENDEN_LINKS.bmc.url, 'https://buymeacoffee.com/gregorwolf1973');
  assert.equal(SPENDEN_LINKS.lp.url, 'https://liberapay.com/Gregor_Wolf/donate');
  const html = readFileSync(new URL('../client/index.html', import.meta.url), 'utf8');
  assert.match(html, /data-spenden="start"/);
  assert.match(html, /data-spenden="einstellungen"/);
  assert.doesNotMatch(html, /buymeacoffee|liberapay/);
  assert.match(readFileSync(new URL('../client/finale.mjs', import.meta.url), 'utf8'), /data-spenden|dataset\.spenden = 'abspann'/);
});

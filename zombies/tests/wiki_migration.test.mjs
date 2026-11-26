import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EinstellungsDatei, ausOptionen, bereinigeUrl } from '../server/einstellungen.mjs';

const tmp = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'wiki-')), 'e.json');

test('bereinigeUrl: nur http(s) oder leer', () => {
  assert.equal(bereinigeUrl(' https://wiki.example.org '), 'https://wiki.example.org');
  assert.equal(bereinigeUrl('javascript:alert(1)'), '');
  assert.equal(bereinigeUrl(undefined), '');
});
test('Wiki-Adresse: ohne Angabe leer, Optionen werden nicht mehr migriert', () => {
  assert.equal(ausOptionen({ wiki_adresse: 'https://w.example' }).wikiAdresse, '');
  const f = tmp();
  fs.writeFileSync(f, JSON.stringify({ karte: 'level1' }));
  const d = new EinstellungsDatei(f, { wiki_adresse: 'https://wiki.biker633.org' });
  assert.equal(d.werte.wikiAdresse, '');
  d.aendern({ wikiAdresse: 'https://wiki.example.org' });
  assert.equal(new EinstellungsDatei(f).werte.wikiAdresse, 'https://wiki.example.org');
});

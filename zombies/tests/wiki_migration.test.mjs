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
test('erster Start übernimmt wiki_adresse; alte Optionen fehlen tolerant', () => {
  assert.equal(ausOptionen({ wiki_adresse: 'https://w.example' }).wikiAdresse, 'https://w.example');
  assert.equal(ausOptionen({}).wikiAdresse, '');
});
test('Migration: gespeicherte Einstellungen ohne wikiAdresse übernehmen den Wert einmalig und speichern ihn', () => {
  const f = tmp();
  fs.writeFileSync(f, JSON.stringify({ karte: 'level1' }));
  const d = new EinstellungsDatei(f, { wiki_adresse: 'https://wiki.biker633.org' });
  assert.equal(d.werte.wikiAdresse, 'https://wiki.biker633.org');
  assert.equal(JSON.parse(fs.readFileSync(f, 'utf8')).wikiAdresse, 'https://wiki.biker633.org');
  // später geleert: bleibt leer, wird nicht erneut aus den Optionen geholt
  d.aendern({ wikiAdresse: '' });
  const d2 = new EinstellungsDatei(f, { wiki_adresse: 'https://wiki.biker633.org' });
  assert.equal(d2.werte.wikiAdresse, '');
});

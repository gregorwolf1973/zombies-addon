// Tests für den Rätsel-Parser (Grundgerüst von Mistral Codestral, von Claude korrigiert)
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { leseSpielfragen, mischeAntworten, waehleFrage } from '../server/raetsel.mjs';

const text = `
====== Beispieltabelle ======
^ Thema ^ Frage ^ Richtig ^ Falsch 1 ^ Falsch 2 ^ Seite ^
| Feuer | Fett brennt in der Pfanne. Was tun? | Deckel drauf | Wasser drauf | Pusten | [[ueberlebenshandbuch:de:k16a_brand]] |
| Wasser | Wie wird Bachwasser trinkbar? | 1 Minute sprudelnd kochen | 10 Sekunden erhitzen | Durch ein Tuch gießen | [[ueberlebenshandbuch:de:k07_wasser|Kapitel Wasser]] |
`;

test('Beispieltabelle: zwei Fragen, Seite ohne Linktext', () => {
  const { fragen, fehler } = leseSpielfragen(text);
  assert.equal(fehler.length, 0);
  assert.equal(fragen.length, 2);
  assert.deepEqual(fragen[0], {
    id: fragen[0].id, thema: 'Feuer', frage: 'Fett brennt in der Pfanne. Was tun?', richtig: 'Deckel drauf',
    falsch: ['Wasser drauf', 'Pusten'], seite: 'ueberlebenshandbuch:de:k16a_brand',
  });
  assert.equal(fragen[1].seite, 'ueberlebenshandbuch:de:k07_wasser');
  assert.match(fragen[0].id, /^f[0-9a-f]{8}$/);
  assert.equal(leseSpielfragen(text).fragen[0].id, fragen[0].id, 'Id nicht stabil');
});

test('Spalten in anderer Reihenfolge und ohne Kopfzeile', () => {
  const anders = `^ Frage ^ Richtig ^ Falsch 1 ^ Falsch 2 ^ Thema ^ Seite ^
| Fett brennt? | Deckel drauf | Wasser drauf | Pusten | Feuer | [[a:b]] |`;
  const f = leseSpielfragen(anders).fragen[0];
  assert.equal(f.thema, 'Feuer'); assert.equal(f.frage, 'Fett brennt?'); assert.equal(f.seite, 'a:b');
  const ohneKopf = '| Feuer | Fett brennt? | Deckel drauf | Wasser drauf | Pusten | [[a:b#anker|Text]] |';
  const g = leseSpielfragen(ohneKopf).fragen[0];
  assert.equal(g.thema, 'Feuer'); assert.equal(g.seite, 'a:b');
});

test('Formatierung entfernt, Pipe im Link in einer mittleren Spalte', () => {
  const t = `^ Thema ^ Frage ^ Richtig ^ Falsch 1 ^ Falsch 2 ^ Seite ^
| **Feuer** | //Fett// brennt __jetzt__? | ''Deckel'' drauf | Siehe [[x:y|hier]] | Pusten | |`;
  const { fragen, fehler } = leseSpielfragen(t);
  assert.equal(fehler.length, 0);
  assert.equal(fragen[0].thema, 'Feuer');
  assert.equal(fragen[0].frage, 'Fett brennt jetzt?');
  assert.equal(fragen[0].richtig, 'Deckel drauf');
  assert.equal(fragen[0].falsch[0], 'Siehe [[x:y|hier]]');
  assert.equal(fragen[0].seite, '');
});

test('Fehlerfälle mit Zeilennummer', () => {
  const t = `
^ Thema ^ Frage ^ Richtig ^ Falsch 1 ^ Falsch 2 ^ Seite ^
| Feuer | | Deckel drauf | Wasser drauf | Pusten | [[a:b]] |
| W | Gleich? | Kochen | Kochen | Tuch | [[a:b]] |
| W | Gut? | Kochen | Erhitzen | Tuch | [[a:b]] |
| W | Gut? | Kochen | Erhitzen | Tuch | [[a:b]] |
| W | ${'a'.repeat(201)} | Kochen | Erhitzen | Tuch | [[a:b]] |
| W | Lang? | ${'a'.repeat(81)} | Erhitzen | Tuch | [[a:b]] |
| W | Kurz? | Kochen | Erhitzen |`;
  const { fragen, fehler } = leseSpielfragen(t);
  assert.equal(fragen.length, 1);
  assert.deepEqual(fehler.map(f => f.zeile), [3, 4, 6, 7, 8, 9]);
  assert.match(fehler[0].grund, /fehlt/);
  assert.match(fehler[1].grund, /auch bei den falschen/);
  assert.equal(fehler[2].grund, 'doppelt');
  assert.match(fehler[3].grund, /Frage zu lang/);
  assert.match(fehler[4].grund, /Antwort zu lang/);
});

test('mischeAntworten mit fester Zufallsfunktion', () => {
  const frage = { richtig: 'Deckel drauf', falsch: ['Wasser drauf', 'Pusten'] };
  const { antworten, richtigIndex } = mischeAntworten(frage, () => 0.5);
  assert.deepEqual(antworten, ['Deckel drauf', 'Pusten', 'Wasser drauf']);
  assert.equal(antworten[richtigIndex], 'Deckel drauf');
  const zwei = mischeAntworten(frage, () => 0);
  assert.equal(zwei.antworten[zwei.richtigIndex], 'Deckel drauf');
  assert.deepEqual([...zwei.antworten].sort(), ['Deckel drauf', 'Pusten', 'Wasser drauf']);
});

test('waehleFrage meidet gestellte, sonst alle, leer → null', () => {
  const fragen = [{ id: 'f1' }, { id: 'f2' }];
  assert.equal(waehleFrage(fragen, new Set(['f1']), () => 0.1).id, 'f2');
  assert.ok(['f1', 'f2'].includes(waehleFrage(fragen, new Set(['f1', 'f2']), () => 0.9).id));
  assert.equal(waehleFrage([]), null);
});

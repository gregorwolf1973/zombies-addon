// Weltfingerabdruck je Karte und Seed (Weltaufbau muss auf Server und Client bit-gleich sein, siehe ARCHITEKTUR.md).
// Aufruf: node tools/fp_vergleich.mjs <absoluter Pfad zum Ordner mit client/>
//   oder per stdin: node --input-type=module - <Pfad> < tools/fp_vergleich.mjs
// Ausgabe: je Zeile "<Karte> <Seed> <Fingerabdruck>"; zwei Läufe (lokal/Zielsystem) werden mit diff verglichen.
const B = process.argv[2];
if (!B) { console.error('Aufruf: fp_vergleich.mjs <Ordner mit client/>'); process.exit(2); }
const { setzeKartengroesse, weltFingerabdruck } = await import(B + '/client/welt.mjs');
const { baueWeltAusKarte } = await import(B + '/client/osmwelt.mjs');
const fs = await import('node:fs');
const KARTEN = ['koenigsdorf', 'kochel', 'andermatt', 'geretsried', 'isarauen', 'geretsried2'];
for (const k of KARTEN) for (const seed of [12345, 987654321]) {
  const karte = JSON.parse(fs.readFileSync(B + '/client/karten/' + k + '.json', 'utf8'));
  setzeKartengroesse(karte.breite, karte.hoehe);
  console.log(k, seed, weltFingerabdruck(baueWeltAusKarte(karte, seed)));
}

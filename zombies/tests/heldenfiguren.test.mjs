// Neue Helden-Figuren (Mixamo, Waffen als eigene Sprites): Held-Liste, Waffe → Gruppe → Clip, Bildnummern, Waffen-/Lampenlage, Mündung, Atlas/JSON-Stimmigkeit.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { HF_LISTE, HF_FIGUREN, HF_BUCHSTABEN, HF_GRUPPEN, HF_GRUPPE, HF_WAFFE_SPRITE, hfGruppe, hfClip, hfBild, hfLage, hfLampeAmLauf, hfMuendung, hfWaffeSprite, hfFigurVon, hfBuchstabeVon, hfFigurenEinst, hfAktive, hfZufall, FIG_PX_JE_M, HF_GROESSE } from '../client/heldenfiguren.mjs';
import { ZF_GROESSE } from '../client/zombiefiguren.mjs';
import { WAFFEN } from '../client/welt.mjs';

const dir = new URL('../client/grafik/', import.meta.url);
const j = JSON.parse(fs.readFileSync(new URL('helden_neu.json', dir)));

test('Helden-Liste: acht Helden, eindeutige Ids und Kennbuchstaben, Held/Heldin behalten h/f', () => {
  assert.equal(HF_LISTE.length, 8);
  assert.equal(new Set(HF_FIGUREN).size, 8); assert.equal(new Set(HF_BUCHSTABEN).size, 8);
  assert.equal(hfBuchstabeVon('swatguy'), 'h'); assert.equal(hfBuchstabeVon('jennifer'), 'f');
  assert.equal(hfFigurVon('h'), 'swatguy'); assert.equal(hfFigurVon('f'), 'jennifer'); assert.equal(hfFigurVon('s'), null); assert.equal(hfFigurVon('m'), null);
  for (const f of HF_LISTE) { assert.match(f.g, /^[a-z]$/); assert.ok(f.name.length > 1); assert.notEqual(f.g, 's'); assert.ok(!'mwp'.includes(f.g), f.g); }   // s = Survivor, m/w = alt, p = Polizist
});

test('Einstellung: fehlend = an, mindestens ein Held bleibt an, aktive Liste und Zufall', () => {
  assert.deepEqual(hfAktive(), [...HF_BUCHSTABEN]);
  const alleAus = Object.fromEntries(HF_FIGUREN.map(id => [id, { an: false }]));
  assert.equal(hfAktive(alleAus).length, 1);
  const zwei = hfFigurenEinst({ ...alleAus, remy: { an: true }, brute: { an: true } });
  assert.deepEqual(Object.keys(zwei), HF_FIGUREN);
  assert.deepEqual(hfAktive(zwei), ['r', 'b']);
  const gesehen = new Set(); for (let r = 0; r < 1; r += 0.05) gesehen.add(hfZufall(zwei, r));
  assert.deepEqual([...gesehen].sort(), ['b', 'r']);
  assert.ok(HF_BUCHSTABEN.includes(hfZufall(undefined, 0.999)));
  assert.equal(hfFigurenEinst('quatsch').remy.an, true);
});

test('Waffe → Gruppe: alle Waffen aus welt.mjs haben eine Gruppe, Gewehr-artige gleich', () => {
  for (const w of Object.keys(WAFFEN)) assert.ok(HF_GRUPPEN.includes(hfGruppe(w)), w);
  for (const w of ['gewehr', 'mp', 'mg', 'scharfschuetze', 'granatwerfer', 'jagdgewehr', 'schrotflinte', 'armbrust']) assert.equal(hfGruppe(w), 'gewehr', w);
  assert.equal(hfGruppe('pistole'), 'pistole');
  for (const w of ['schlaeger', 'brechstange', 'sense']) assert.equal(hfGruppe(w), 'schlag', w);
  assert.equal(hfGruppe('messer'), 'messer');
  for (const w of ['faust', 'handgranate', 'unbekannt', undefined]) assert.equal(hfGruppe(w), 'ohne', String(w));
});

test('Waffen-Sprites: jede Waffe in der Hand hat ihr eigenes Sprite im Waffen-Atlas', () => {
  for (const w of ['pistole', 'gewehr', 'mp', 'mg', 'scharfschuetze', 'granatwerfer', 'armbrust', 'schrotflinte', 'messer', 'schlaeger', 'brechstange', 'sense']) {
    assert.ok(hfWaffeSprite(w), w); assert.ok(j.waffen[HF_WAFFE_SPRITE[w]], w);
  }
  const eigene = ['mp', 'mg', 'scharfschuetze', 'granatwerfer', 'armbrust', 'brechstange', 'sense', 'schrotflinte']; assert.equal(new Set(eigene.map(hfWaffeSprite)).size, eigene.length);
  for (const w of ['faust', 'handgranate', undefined]) assert.equal(hfWaffeSprite(w), null);
  assert.ok(j.waffen.lampe_l, 'Taschenlampe');
});

test('Gruppe + Zustand → Clip, jeder Clip existiert im Atlas', () => {
  assert.equal(hfClip('ohne', 'gehen'), 'gehen');
  assert.equal(hfClip('messer', 'rennen'), 'rennen');
  assert.equal(hfClip('schlag', 'stehen'), 'stehen');
  assert.equal(hfClip('pistole', 'rennen'), 'pistole_rennen');
  assert.equal(hfClip('gewehr', 'schiessen'), 'gewehr_schiessen');
  assert.equal(hfClip('messer', 'nahkampf'), 'messer_stechen');
  assert.equal(hfClip('schlag', 'nahkampf'), 'schlaeger_schlagen');
  assert.equal(hfClip('ohne', 'nahkampf'), 'faust_schlagen');
  assert.equal(hfClip('gewehr', 'nahkampf'), 'faust_schlagen');
  assert.equal(hfClip('messer', 'schiessen'), 'messer_stechen');
  assert.equal(hfClip('pistole', 'schiessen'), 'pistole_stehen', 'Pistole: Haltung im Stehen + Rückstoß statt seitlichem Schussclip');
  assert.equal(j.clips.pistole_schiessen, undefined);
  for (const g of HF_GRUPPEN) assert.equal(hfClip(g, 'werfen'), 'werfen', g);
  for (const g of HF_GRUPPEN) for (const a of ['stehen', 'gehen', 'rennen', 'schiessen', 'nahkampf', 'werfen', 'tod']) assert.ok(j.clips[hfClip(g, a)], g + ' ' + a);
});

test('Bildnummern: Weg, Zeit, einmalige Clips', () => {
  const geh = j.clips.gehen, nr = new Set(); for (let l = 0; l < 200; l += 0.5) nr.add(hfBild(geh, { lauf: l }));
  assert.equal(nr.size, geh.n);
  assert.equal(hfBild(geh, { lauf: 0 }), 0);
  const steh = j.clips.stehen, z = new Set(); for (let t = 0; t < steh.dauer * 1000; t += 20) z.add(hfBild(steh, { zeitMs: t }));
  assert.equal(z.size, steh.n);
  const tod = j.clips.tod; assert.equal(hfBild(tod, { seit: 0, ms: 1400 }), 0); assert.equal(hfBild(tod, { seit: 99999, ms: 1400 }), tod.n - 1);
  for (const c of ['werfen', 'faust_schlagen', 'gewehr_schiessen']) assert.equal(j.clips[c].einmal, 1, c);
  assert.ok(j.clips.rennen.weg > j.clips.gehen.weg * 0.8);
});

test('Waffenlage: Versatz dreht mit dem Körper, Sprite dreht mit, Neigung verkürzt', () => {
  const l0 = hfLage([30, 0, 0.5, 0.8], 0, 0.5);
  assert.ok(Math.abs(l0.x - 15) < 1e-9 && Math.abs(l0.y) < 1e-9 && Math.abs(l0.rot - 0.5) < 1e-9 && Math.abs(l0.sx - 0.4) < 1e-9 && l0.sy === 0.5);
  const l1 = hfLage([30, 0, 0, 1], Math.PI / 2, 1);   // Körper nach unten gedreht: Versatz nach unten
  assert.ok(Math.abs(l1.x) < 1e-9 && Math.abs(l1.y - 30) < 1e-9);
});

test('Taschenlampe am Lauf: nur Zweihandwaffen mit Montagepunkt, vorwärts entlang der Waffenachse', () => {
  const p = [10, 20, Math.PI / 2, 1];   // Waffe zeigt nach unten
  const lp = hfLampeAmLauf(p, { lampe: [30, 5] });
  assert.ok(Math.abs(lp[0] - (10 - 5)) < 1e-9 && Math.abs(lp[1] - (20 + 30)) < 1e-9 && lp[2] === p[2]);
  assert.equal(hfLampeAmLauf(p, {}), null);
  for (const w of ['gewehr', 'mp', 'mg', 'scharfschuetze', 'granatwerfer', 'armbrust', 'schrotflinte']) assert.ok(j.waffen[w].lampe, w + ' braucht einen Lampenplatz');
  for (const w of ['pistole', 'messer', 'schlaeger', 'brechstange']) assert.equal(j.waffen[w].lampe, undefined, w + ': Lampe in der linken Hand');
});

test('Mündung: Waffenachse zeigt nach Drehung zum Ziel, Versatz dreht mit', () => {
  const pose = [50, -40, -1.0, 1], meta = { laenge: 100, griff: 0.4 };
  const o = hfMuendung(pose, meta, 0.5, 0.2);
  assert.ok(Math.abs(o.rot - 1.5) < 1e-9);
  // Mündung im Bild = Griff + 60 entlang der Achse; nach Drehung um rot zeigt die Achse genau zum Ziel (Winkel 0,5)
  const mx = 50 + Math.cos(-1.0) * 60, my = -40 + Math.sin(-1.0) * 60, r = Math.hypot(mx, my) * 0.2;
  assert.ok(Math.abs(Math.hypot(o.x, o.y) - r) < 1e-9);
  const o2 = hfMuendung([0, 0, 0.3, 1], meta, 0.3, 1);   // Griff in der Mitte, Waffe schon zum Ziel gerichtet: Mündung 60 voraus
  assert.ok(Math.abs(o2.x - Math.cos(0.3) * 60) < 1e-9 && Math.abs(o2.y - Math.sin(0.3) * 60) < 1e-9);
});

test('Atlas: gleicher Maßstab wie Zombies, ≤ 4096 je Textur, alle Helden, Posen je Bild, Waffen-Sprites', () => {
  assert.ok(Math.abs(HF_GROESSE / ZF_GROESSE - 1.4) < 1e-9); assert.equal(FIG_PX_JE_M, 40);
  assert.deepEqual(j.figuren, HF_FIGUREN);
  assert.ok(j.groesse[0] <= 4096 && j.groesse[1] <= 4096);
  for (const f of HF_FIGUREN) { assert.ok(fs.statSync(new URL(j.atlas[f], dir)).size > 10000, f); assert.equal(j.atlas[f], `helden_${f}.webp`); }
  assert.ok(fs.existsSync(new URL('helden_vorschau.webp', dir)) && j.vorschau.datei === 'helden_vorschau.webp');
  for (const [c, k] of Object.entries(j.clips)) {
    assert.ok(k.y + k.feld <= j.groesse[1] && k.n * k.feld <= j.groesse[0], c);
    if (/gehen$|rennen$/.test(c)) assert.ok(k.weg > 0, c);
  }
  // Posen: je Held, Clip und Waffe genau ein Eintrag je Bild, vier endliche Zahlen
  for (const f of HF_FIGUREN) for (const [c, ws] of Object.entries(j.pos[f])) {
    assert.ok(j.clips[c], c);
    for (const [w, liste] of Object.entries(ws)) { assert.ok(j.waffen[w], w); assert.equal(liste.length, j.clips[c].n, f + c + w); for (const p of liste) { assert.equal(p.length, 4); assert.ok(p.every(Number.isFinite)); assert.ok(p[3] > 0 && p[3] <= 1.001); } }
  }
  // jede Waffe hat in den passenden Clips eine Pose, die Lampe in allen Clips mit Waffe oder Hand
  for (const f of HF_FIGUREN) {
    for (const g of ['gewehr_stehen', 'gewehr_gehen', 'gewehr_rennen', 'gewehr_schiessen']) for (const w of ['gewehr', 'mp', 'mg', 'scharfschuetze', 'granatwerfer', 'armbrust', 'schrotflinte']) assert.ok(j.pos[f][g][w], `${f} ${g} ${w}`);
    for (const g of ['pistole_stehen', 'pistole_gehen', 'pistole_rennen']) assert.ok(j.pos[f][g].pistole && j.pos[f][g].lampe_l, f + g);
    for (const w of ['messer', 'schlaeger', 'brechstange', 'sense', 'lampe_l']) for (const g of ['stehen', 'gehen', 'rennen']) assert.ok(j.pos[f][g][w], `${f} ${g} ${w}`);
    assert.ok(j.pos[f].messer_stechen.messer && j.pos[f].schlaeger_schlagen.sense && j.pos[f].faust_schlagen.lampe_l && j.pos[f].werfen.lampe_l, f);
    assert.equal(j.pos[f].tod, undefined);
  }
  // Waffen-Sprites: Größe im Atlas = echte Länge + 10 % (80 Atlas-px je Meter); Sprites liegen im Atlasbild
  const echt = { mp: 0.66, mg: 1.3, scharfschuetze: 1.3, granatwerfer: 0.77, armbrust: 0.94, brechstange: 0.83, sense: 1.65, lampe_l: 0.28 };
  for (const [w, m] of Object.entries(echt)) assert.ok(Math.abs(j.waffen[w].laenge / 80 - m) < 0.01, `${w}: ${j.waffen[w].laenge / 80} m statt ${m} m`);
  assert.ok(fs.statSync(new URL(j.waffenAtlas, dir)).size > 1000);
  for (const [w, m] of Object.entries(j.waffen)) assert.ok(m.laenge < m.w && m.ox > 0 && m.ox < m.w && m.griff > 0 && m.griff < 1, w);
  assert.ok(Object.keys(HF_GRUPPE).length >= 12);
});

test('Gesamtgröße der Atlanten bleibt im Rahmen (Mobilgeräte: Speicher je Held nur bei Bedarf)', () => {
  const grafikMB = j.groesse[0] * j.groesse[1] * 4 / 1048576;
  assert.ok(grafikMB < 20, `Körper-Atlas ${grafikMB.toFixed(1)} MB Grafikspeicher je Held`);
  let datei = 0; for (const f of HF_FIGUREN) datei += fs.statSync(new URL(j.atlas[f], dir)).size;
  assert.ok(datei < 4.5 * 1048576, `alle Held-Atlanten ${(datei / 1048576).toFixed(1)} MB`);
  assert.ok(fs.statSync(new URL('helden_neu.json', dir)).size < 200 * 1024);
});

test('Waffenlage: Langwaffen liegen mit dem Kolben an der rechten Schulter und zeigen nach vorn, Pistole steht vor der Brust', () => {
  for (const fig of HF_FIGUREN) for (const clip of ['gewehr_stehen', 'gewehr_gehen', 'gewehr_rennen', 'gewehr_schiessen']) {
    for (const w of ['gewehr', 'mp', 'mg', 'scharfschuetze', 'granatwerfer', 'armbrust', 'schrotflinte']) {
      const m = j.waffen[w];
      for (const p of j.pos[fig][clip][w]) {
        const kolben = p[0] - m.laenge * m.griff * p[3];   // Kolbenende in Atlas-px ab Bildmitte
        assert.ok(Math.abs(kolben) < 8, `${fig}/${clip}/${w}: Kolben x=${kolben}`);
        assert.ok(p[1] > 4 && p[1] < 18, `${fig}/${clip}/${w}: y=${p[1]}`);
        assert.equal(p[2], 0, `${fig}/${clip}/${w}: zeigt nicht nach vorn`);
      }
    }
  }
  for (const fig of HF_FIGUREN) for (const clip of ['pistole_stehen', 'pistole_gehen', 'pistole_rennen'])
    for (const p of j.pos[fig][clip].pistole) assert.ok(p[0] > 8 && p[1] > 0 && p[1] < 24, `${fig}/${clip}: Pistole ${p}`);
});

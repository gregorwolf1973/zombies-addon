// Einrichtung großer Gebäude im Feinraster (Büro, Supermarkt, Werkstatt, Möbelhaus, Lagerhalle), aufgerufen aus innen_fein.mjs.
// Eine Halle ist ein großer Raum (plus kleiner Nebenraum); Möbel stehen mit mindestens 1,5 m Gang (6 Zellen), Inseln per Raster-Suche.
// Weltcode (Server und Browser bauen getrennt): nur + − × ÷, Ganzzahlen und der übergebene Zufall rng, keine Winkelfunktionen.

// Maße in Zellen (4 Zellen = 1 m), b × h
export const GROSS_MASSE = {
  aktenschrank: [4, 2], kopierer: [4, 3], pflanze: [2, 2], besprechungstisch: [12, 5], schreibtischinsel: [18, 6],
  kuehlregal: [8, 2], wagenecke: [4, 3],
  werkbank: [8, 3], werkzeugschrank: [5, 2], oelfass: [2, 2], drehbank: [10, 3], fraese: [5, 4], standbohrmaschine: [3, 3], hebebuehne: [16, 8],
  ausstellungsschrank: [5, 2], kuechenzeile: [12, 3], couchgruppe: [12, 8],
  hochregal: [16, 3], regalzeile: [16, 3], palette: [5, 4], kartonstapel: [4, 3], gabelstapler: [4, 8],
};
// durchsuchbare Behälter (Beute: welt.mjs BEUTE, Namen: BEHAELTER_NAME)
export const GROSS_BEHAELTER = ['aktenschrank', 'kuehlregal', 'wagenecke', 'werkbank', 'werkzeugschrank', 'ausstellungsschrank', 'hochregal', 'kartonstapel'];
export const GROSS_ARTEN = ['buero', 'supermarkt', 'werkstatt', 'moebelhaus', 'lagerhalle'];

const RAND = 6;   // Gang: 1,5 m

// ctx: { halle, r, k, T, idx, freiVon, platzieren, setze, rng, moebel, behaelter, zelleZ, erreichbar, startZ, tueren, treppen, ausgang }
export function halleEinrichten(ctx) {
  const { halle, r, k, T, idx, freiVon, platzieren, setze, ri, moebel, behaelter, zelleZ } = ctx;
  const n0 = moebel.length;
  const sf = (art, opt) => { setze(ri, art, opt ?? {}); };
  // Platz mit Gang rundherum (alle Zellen im Ring müssen freier Boden sein: also auch Abstand zu Wänden, Möbeln, Türen)
  const mitGang = (x, y, b, h, g) => {
    if (x - g < r.x || y - g < r.y || x + b + g > r.x + r.b || y + h + g > r.y + r.h) return false;
    for (let dy = -g; dy < h + g; dy++) for (let dx = -g; dx < b + g; dx++) if (k[idx(x + dx, y + dy)] !== T.BODEN) return false;
    return true;
  };
  // Raster-Suche: nacheinander Typen aus der Liste (reihum) an die ersten passenden Plätze, mit Obergrenze je Typ und gesamt
  const fuelle = (liste, gesamt = 999, schritt = 2) => {
    const n = liste.map(() => 0);
    let platziert = 0, rot = 0;
    for (let y = r.y + RAND; y < r.y + r.h && platziert < gesamt; y += schritt) {
      for (let x = r.x + RAND; x < r.x + r.b && platziert < gesamt; x += schritt) {
        if (k[idx(x, y)] !== T.BODEN) continue;
        for (let v = 0; v < liste.length; v++) {
          const i = (rot + v) % liste.length, e = liste[i];
          if (n[i] >= (e.max ?? 999)) continue;
          const g = e.gang ?? RAND;
          for (const [b, h] of e.dreh ? [[e.b, e.h], [e.h, e.b]] : [[e.b, e.h]]) {
            if (!mitGang(x, y, b, h, g) || !freiVon(x, y, b, h)) continue;
            const art = e.wahl ? e.wahl(n[i]) : e.art;
            if (!platzieren(art, x, y, b, h, true)) continue;
            if (e.sp !== undefined) moebel[moebel.length - 1].sp = typeof e.sp === 'function' ? e.sp(n[i]) : e.sp;
            n[i]++; platziert++; rot = i + 1;
            v = liste.length;   // nächster Platz
            break;
          }
        }
      }
    }
    return platziert;
  };

  if (halle === 'buero') {
    for (let i = 0; i < 6; i++) sf('aktenschrank');
    for (let i = 0; i < 2; i++) sf('kopierer');
    for (let i = 0; i < 5; i++) sf('pflanze');
    sf('besprechungstisch', { frei: true });
    fuelle([{ art: 'schreibtischinsel', b: 18, h: 6, max: 10 }, { art: 'schreibtischinsel', b: 12, h: 6, max: 6 }, { art: 'schreibtischinsel', b: 6, h: 12, max: 6, dreh: false }], 22);
  } else if (halle === 'supermarkt') {
    // Regalreihen und erste Kasse stehen schon (Läden-Code); hier: Kassenzone, Kühlregale, Einkaufswagen-Ecke
    for (let i = 0; i < 2; i++) sf('kasse', { tuerAbst: 7, nah: ctx.ausgang });
    for (let i = 0; i < 4; i++) sf('kuehlregal');
    for (let i = 0; i < 2; i++) sf('wagenecke', { nah: ctx.ausgang });
  } else if (halle === 'werkstatt') {
    for (let i = 0; i < 4; i++) sf('werkbank');
    for (let i = 0; i < 3; i++) sf('werkzeugschrank');
    for (let i = 0; i < 5; i++) sf('oelfass');
    fuelle([{ art: 'hebebuehne', b: 16, h: 8, max: 2 }, { art: 'drehbank', b: 10, h: 3, max: 4, dreh: true }, { art: 'fraese', b: 5, h: 4, max: 3 }, { art: 'standbohrmaschine', b: 3, h: 3, max: 3 }], 12);
  } else if (halle === 'moebelhaus') {
    for (let i = 0; i < 4; i++) sf('ausstellungsschrank');
    for (let i = 0; i < 2; i++) sf('kuechenzeile');
    sf('kasse', { nah: ctx.ausgang, tuerAbst: 7 });
    fuelle([{ art: 'couchgruppe', b: 12, h: 8, max: 8, dreh: true, gang: 5 }, { art: 'bett', b: 8, h: 6, max: 5, dreh: true, gang: 5 }, { art: 'esstisch', b: 5, h: 3, max: 3, dreh: true, gang: 5 }, { art: 'ausstellungsschrank', b: 5, h: 2, max: 3, dreh: true, gang: 5 }], 18);
  } else if (halle === 'lagerhalle') {
    for (let i = 0; i < 4; i++) sf('palette');
    for (let i = 0; i < 4; i++) sf('kartonstapel');
    // Hochregalreihen mit 2-m-Gängen; höchstens 10 durchsuchbare Regale, gleichmäßig verteilt
    let nb = 0;
    fuelle([{ b: 16, h: 3, gang: 8, max: 40, wahl: i => (i % 3 === 0 && nb++ < 10) ? 'hochregal' : 'regalzeile' }], 40, 2);
    fuelle([{ art: 'gabelstapler', b: 4, h: 8, max: 2, dreh: true, gang: 4 }], 2);
  }

  // Prüfung: Haustür, Zimmertüren und Treppen müssen erreichbar bleiben (sonst Einrichtung zurückbauen); unerreichbare Behälter fallen weg
  const meine = moebel.slice(n0);
  const raus = m => {
    for (let dy = 0; dy < m.h; dy++) for (let dx = 0; dx < m.b; dx++) k[idx(m.x + dx, m.y + dy)] = T.BODEN;
    moebel.splice(moebel.indexOf(m), 1);
    const i = behaelter.findIndex(q => q.rect && q.rect.x0 === m.x * zelleZ && q.rect.y0 === m.y * zelleZ && q.rect.x1 === (m.x + m.b) * zelleZ);
    if (i >= 0) behaelter.splice(i, 1);
  };
  if (!meine.length) return 0;
  const s = ctx.erreichbar(ctx.startZ[0], ctx.startZ[1]);
  const nahe = zellen => zellen.some(([zx, zy]) => [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, c]) => s[idx(zx + a, zy + c)]));
  let ok = s[idx(ctx.startZ[0], ctx.startZ[1])] === 1;
  if (ok && ctx.ausgang && ctx.ausgang.zellen && !nahe(ctx.ausgang.zellen)) ok = false;
  if (ok) for (const t of ctx.tueren) if (!nahe(t.zellen)) { ok = false; break; }
  if (ok) for (const t of ctx.treppen) if (!nahe(t.zellen)) { ok = false; break; }
  if (!ok) { for (const m of meine) raus(m); return 0; }
  for (const m of meine) {
    if (!GROSS_BEHAELTER.includes(m.art)) continue;
    let zug = false;
    for (let dy = -3; dy < m.h + 3 && !zug; dy++) for (let dx = -3; dx < m.b + 3; dx++) if (s[idx(m.x + dx, m.y + dy)]) { zug = true; break; }
    if (!zug) raus(m);
  }
  return moebel.length - n0;
}

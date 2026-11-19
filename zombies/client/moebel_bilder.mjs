// Möbel als Bilder (grafik/moebel.webp, tools/gemini_moebel_schneiden.py). Ohne geladenen Bogen (Server, Tests) oder bei
// abweichender Größe bleibt die gezeichnete Fassung. Nur Zeichnung – hat keinen Einfluss auf Weltaufbau/Kollision.
let bogen = null, liste = null;
export function setzeMoebelBilder(bild, l) { bogen = bild && l?.moebel ? bild : null; liste = bogen ? l : null; }

// Möbel, deren Rückseite (im Bild oben) an die Wand soll
const WANDSEITE = new Set(['bett', 'schrank', 'alter_schrank', 'kommode', 'herd', 'spuele', 'kuehlschrank', 'safe_kuehlschrank', 'waschbecken',
  'klo', 'heizung', 'regal', 'lagerregal', 'regal_lang', 'kasse', 'sofa', 'vorratsregal', 'funktisch', 'feldbett', 'badewanne', 'garderobe']);

// Bildart zu einer Möbelart (Regale in Keller/Lager sind Lagerregale)
export function bildArt(art, raumTyp) {
  if (art === 'regal' && ['kellerraum', 'vorratskeller', 'lager', 'abstellraum', 'heizungsraum'].includes(raumTyp)) return 'lagerregal';
  return art;
}

// Viertelschritte im Uhrzeigersinn, bei denen die Rückseite nach oben/rechts/unten/links zeigt.
// wand: { oben, rechts, unten, links } (true = Wand daneben) oder null.
function drehung(art, b, h, cb, ch, wand) {
  let erlaubt;
  if (b === cb && h === ch) erlaubt = cb === ch ? [0, 1, 2, 3] : [0, 2];
  else if (b === ch && h === cb) erlaubt = [1, 3];
  else return -1;
  if (wand && WANDSEITE.has(art)) {
    const seite = ['oben', 'rechts', 'unten', 'links'];
    for (const k of erlaubt) if (wand[seite[k]]) return k;
  }
  return erlaubt[0];
}

// true, wenn das Bild gezeichnet wurde. m: { art, x, y, b, h } in Kacheln; opt: { raumTyp, wand }
export function zeichneMoebelBild(ctx, m, KACHEL, opt = {}) {
  if (!bogen) return false;
  const art = bildArt(m.art, opt.raumTyp), e = liste.moebel[art];
  if (!e) return false;
  const k = drehung(art, m.b, m.h, e.b, e.h, opt.wand ?? null);
  if (k < 0) return false;
  const px = liste.px, cw = e.b * KACHEL, chh = e.h * KACHEL;
  ctx.save();
  ctx.translate((m.x + m.b / 2) * KACHEL, (m.y + m.h / 2) * KACHEL);
  ctx.rotate(k * Math.PI / 2);
  ctx.shadowColor = 'rgba(0,0,0,.4)'; ctx.shadowBlur = 3; ctx.shadowOffsetX = 2; ctx.shadowOffsetY = 3;   // Versatz wird mitgedreht → gegendrehen
  const c = Math.cos(-k * Math.PI / 2), s = Math.sin(-k * Math.PI / 2);
  ctx.shadowOffsetX = Math.round(2 * c - 3 * s); ctx.shadowOffsetY = Math.round(2 * s + 3 * c);
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bogen, e.x, e.y, e.b * px, e.h * px, -cw / 2, -chh / 2, cw, chh);
  ctx.restore();
  return true;
}

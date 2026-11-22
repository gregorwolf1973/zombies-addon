// Zeichnung der maßstäblichen Innenräume (siehe innen_fein.mjs). Maße in Weltpixeln (8 px = 1 m, eine Zelle = INNEN_Z px = 0,25 m);
// die Bildfläche wird mit BILD_SKALA-facher Auflösung gezeichnet, damit dünne Wände und kleine Möbel beim Heranzoomen scharf bleiben.
// Vektormöbel in echten Proportionen mit etwas Detail (Holzmaserung, Polster, Fliesen); Behälter tragen einen zarten goldenen Rand,
// damit man sie als durchsuchbar erkennt. Nur Zeichnung – nichts davon ist Weltcode (Server und Client bauen den Raum unabhängig).
import { T } from './welt.mjs';
import { INNEN_Z } from './innen_fein.mjs';

export const BILD_SKALA = 4;
export const INNEN_ZOOM_FEIN = 3.4;   // Kamera-Zoom drinnen (8 px = 1 m): ein Haus von 14 m ≈ 380 Bildschirm-px bei Grundzoom 1

// Boden je Zimmerart: [Grundfarbe, Muster]
const BODEN = {
  flur: ['#cbb592', 'fliese'], kueche: ['#e3dac6', 'schach'], bad: ['#a9cbdc', 'fliese_klein'],
  wohnzimmer: ['#a9794d', 'parkett'], schlafzimmer: ['#b38559', 'parkett'], kinderzimmer: ['#bf9566', 'parkett'],
  abstellraum: ['#908677', 'beton'], kellerraum: ['#7b7b78', 'beton'], heizungsraum: ['#6f6f6c', 'beton'],
  vorratskeller: ['#80786c', 'beton'], dachboden: ['#8a6a48', 'dielen'], verkaufsraum: ['#dcd6c8', 'fliese'], lager: ['#8f8a80', 'beton'],
  notlager: ['#9a9e92', 'linoleum'],
};
// Verkaufsraum je Ladenart (leichte Tönung des Bodens)
const LADEN_BODEN = { lebensmittel: '#e0dccd', apotheke: '#e6ece6', kaufhaus: '#d9d4c8', gaststaette: '#b99567', polizei: '#cdd0d2' };

// deterministischer Zufall aus Zellkoordinaten (nur Zeichnung)
const hs = (x, y, n = 0) => { let h = Math.imul(x * 73856093 ^ y * 19349663 ^ n * 83492791, 0x9e3779b1); h ^= h >>> 15; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; return (h >>> 0) / 4294967296; };

function mischung(hex, f) {   // Farbe heller (f > 0) oder dunkler (f < 0)
  const n = parseInt(hex.slice(1), 16), c = s => Math.max(0, Math.min(255, Math.round(((n >> s) & 255) + f * 255)));
  return `rgb(${c(16)},${c(8)},${c(0)})`;
}

function rund(ctx, f, x, y, b, h, r = 0.5) {
  ctx.fillStyle = f; ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, b, h, r); else ctx.rect(x, y, b, h);
  ctx.fill();
}
const kreis = (ctx, f, x, y, r) => { ctx.fillStyle = f; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); };
const linie = (ctx, f, lw, x0, y0, x1, y1) => { ctx.strokeStyle = f; ctx.lineWidth = lw; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); };

// Holzmaserung: dünne dunkle Längslinien (L = Länge, S = Breite, in lokalen px), deterministisch aus dem Ort
function maserung(ctx, L, S, sx, sy, farbe = 'rgba(60,35,15,.22)') {
  const n = Math.max(2, Math.round(S / 0.9));
  for (let i = 1; i < n; i++) {
    const y = i * S / n + (hs(sx, sy, i) - 0.5) * 0.25, a = hs(sx, sy, i + 9) * L * 0.3, b = L - hs(sx, sy, i + 17) * L * 0.3;
    linie(ctx, farbe, 0.12, a, y, b, y);
  }
}

const GOLD = 'rgba(255,213,79,.55)';

// Möbel proportional zum Rechteck (Weltpixel); lange Achse waagrecht oder senkrecht; w: Raum (für die Wandseite und Ladenart)
function moebel(ctx, m, w) {
  const Z = INNEN_Z, x = m.x * Z, y = m.y * Z, b = m.b * Z, h = m.h * Z;
  const quer = b >= h, L = quer ? b : h, S = quer ? h : b;   // L = lange Seite, S = kurze Seite
  // Rückseite zur Wand: Zeichnung hat die Rückseite oben (lokal y = 0); gibt es dort keine Wand, an der gegenüberliegenden aber schon, spiegeln
  const wand = (a, c) => w.hole(a, c) === T.WAND;
  let oben = 0, unten = 0;
  if (quer) { for (let i = 0; i < m.b; i++) { if (wand(m.x + i, m.y - 1)) oben++; if (wand(m.x + i, m.y + m.h)) unten++; } }
  else { for (let j = 0; j < m.h; j++) { if (wand(m.x + m.b, m.y + j)) oben++; if (wand(m.x - 1, m.y + j)) unten++; } }   // senkrecht: lokal oben = rechts
  const spiegeln = unten > oben;
  ctx.save();
  ctx.translate(x, y);
  if (!quer) { ctx.translate(b, 0); ctx.rotate(Math.PI / 2); }
  if (spiegeln) { ctx.translate(0, S); ctx.scale(1, -1); }
  // weicher Schatten
  ctx.fillStyle = 'rgba(0,0,0,.20)'; ctx.fillRect(0.45, 0.55, L, S);
  ctx.fillStyle = 'rgba(0,0,0,.12)'; ctx.fillRect(0.2, 0.25, L + 0.5, S + 0.5);
  const k = (f, rx, ry, rb, rh, r) => rund(ctx, f, rx, ry, rb, rh, r ?? Math.min(0.5, S * 0.15));
  const sx = m.x, sy = m.y;
  const behaelter = ['schrank', 'alter_schrank', 'kommode', 'garderobe', 'kiste', 'kuehlschrank', 'herd', 'spuele', 'klo', 'waschbecken', 'regal_lang', 'vorratsregal', 'erstehilfe'].includes(m.art);
  switch (m.art) {
    case 'bett': case 'einzelbett': case 'feldbett': {
      const feld = m.art === 'feldbett';
      k(feld ? '#5b4a2e' : '#5d4037', 0, 0, L, S, 0.5);                                             // Rahmen / Kopfteil
      if (!feld) k('#3e2a22', 0, 0, L * 0.05, S, 0.3);
      k(feld ? '#6b7b3a' : '#eef0f2', S * 0.07, S * 0.07, L - S * 0.14, S - S * 0.14, 0.6);        // Matratze bzw. Segeltuch
      const kissen = (cy, ch) => { k('#ffffff', S * 0.1 + L * 0.03, cy, L * 0.17, ch, 0.8); linie(ctx, 'rgba(0,0,0,.14)', 0.1, S * 0.1 + L * 0.03 + L * 0.085, cy + 0.3, S * 0.1 + L * 0.03 + L * 0.085, cy + ch - 0.3); };
      if (m.art === 'bett') { kissen(S * 0.14, S * 0.32); kissen(S * 0.54, S * 0.32); } else kissen(S * 0.18, S * 0.62);
      const dk = feld ? '#7e6f56' : m.art === 'einzelbett' ? '#d8744f' : '#5c8fd6';
      k(dk, L * 0.34, S * 0.07, L * 0.62, S - S * 0.14, 0.4);                                         // Decke
      k(mischung(dk.length === 7 ? dk : '#5c8fd6', 0.12), L * 0.34, S * 0.07, L * 0.07, S - S * 0.14, 0.3);   // Umschlag
      for (let i = 0; i < 3; i++) linie(ctx, 'rgba(255,255,255,.18)', 0.18, L * 0.47 + i * L * 0.16, S * 0.12, L * 0.47 + i * L * 0.16, S * 0.88);   // Steppnähte
      if (feld) { ctx.fillStyle = '#3e3a30'; for (const [a, c] of [[0.2, 0.2], [L - 0.7, 0.2], [0.2, S - 0.7], [L - 0.7, S - 0.7]]) ctx.fillRect(a, c, 0.5, 0.5); }   // Füße
      break;
    }
    case 'sofa': {
      k('#5a4388', 0, 0, L, S, 1);                                                                    // Gestell
      k('#6a4f9c', 0.3, 0.3, L - 0.6, S * 0.28, 0.8);                                                 // Rückenlehne
      k('#7b5eb3', S * 0.12, S * 0.3, L - S * 0.24, S * 0.62, 0.8);                                   // Sitzfläche
      k('#5a4388', 0, S * 0.12, S * 0.14, S * 0.84, 0.8); k('#5a4388', L - S * 0.14, S * 0.12, S * 0.14, S * 0.84, 0.8);   // Armlehnen
      for (let i = 1; i < 3; i++) linie(ctx, 'rgba(0,0,0,.28)', 0.14, S * 0.12 + i * (L - S * 0.24) / 3, S * 0.32, S * 0.12 + i * (L - S * 0.24) / 3, S * 0.9);   // Polsternähte
      for (let i = 0; i < 3; i++) kreis(ctx, 'rgba(255,255,255,.18)', S * 0.12 + (i + 0.5) * (L - S * 0.24) / 3, S * 0.6, 0.35);
      k('#e8b84a', L * 0.2, S * 0.34, S * 0.2, S * 0.2, 0.4);                                         // Kissen
      break;
    }
    case 'couchtisch': {
      k('#7d5f4f', 0, 0, L, S, 0.5); k('#a1887f', 0.35, 0.35, L - 0.7, S - 0.7, 0.4);
      maserung(ctx, L, S, sx, sy, 'rgba(70,45,30,.22)');
      kreis(ctx, '#eceff1', L * 0.3, S * 0.5, 0.55); kreis(ctx, '#6d4c41', L * 0.3, S * 0.5, 0.35);   // Tasse
      k('#c62828', L * 0.55, S * 0.3, L * 0.22, S * 0.4, 0.2);                                        // Zeitschrift
      break;
    }
    case 'esstisch': {
      ctx.fillStyle = '#6d4c41';   // Stühle (ragen aus dem freien Ring heraus)
      for (const cx of [L * 0.22, L * 0.62]) { rund(ctx, '#7b5a4a', cx, -1.7, 2, 1.6, 0.4); rund(ctx, '#7b5a4a', cx, S + 0.1, 2, 1.6, 0.4); }
      k('#8d6e63', 0, 0, L, S, 0.5); k('#a9907f', 0.4, 0.4, L - 0.8, S - 0.8, 0.4);
      maserung(ctx, L, S, sx, sy);
      for (const cx of [L * 0.27, L * 0.67]) for (const cy of [S * 0.22, S * 0.62]) { kreis(ctx, '#f5f5f5', cx + 0.5, cy + 0.4, 0.75); kreis(ctx, '#e0e0e0', cx + 0.5, cy + 0.4, 0.45); }   // Teller
      break;
    }
    case 'schrank': case 'alter_schrank': {
      const alt = m.art === 'alter_schrank';
      k(alt ? '#5a3f33' : '#7b5a4a', 0, 0, L, S, 0.4); k(alt ? '#6b4b3d' : '#8a6a5a', 0.35, 0.35, L - 0.7, S - 0.7, 0.3);
      maserung(ctx, L, S, sx, sy, 'rgba(40,22,12,.28)');
      linie(ctx, 'rgba(0,0,0,.5)', 0.18, L / 2, 0.3, L / 2, S - 0.3);                                  // Türspalt
      kreis(ctx, '#ffd54f', L / 2 - 0.6, S * 0.72, 0.28); kreis(ctx, '#ffd54f', L / 2 + 0.6, S * 0.72, 0.28);
      if (alt) { ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 0.14; ctx.strokeRect(0.7, 0.7, L / 2 - 1.1, S - 1.4); ctx.strokeRect(L / 2 + 0.4, 0.7, L / 2 - 1.1, S - 1.4); }
      break;
    }
    case 'kommode': {
      k('#7b5a4a', 0, 0, L, S, 0.4); k('#946f5d', 0.35, 0.35, L - 0.7, S - 0.7, 0.3);
      maserung(ctx, L, S, sx, sy, 'rgba(40,22,12,.25)');
      for (let i = 1; i < 3; i++) linie(ctx, 'rgba(0,0,0,.4)', 0.15, L * i / 3, 0.35, L * i / 3, S - 0.35);   // Schubladen
      for (let i = 0; i < 3; i++) { ctx.fillStyle = '#d4b36a'; ctx.fillRect(L * (i + 0.5) / 3 - 0.45, S * 0.55, 0.9, 0.25); }
      k('#e0d6c8', L * 0.1, S * 0.12, L * 0.2, S * 0.3, 0.2);                                          // Deckchen / Foto
      break;
    }
    case 'garderobe': {
      k('#6d4c41', 0, 0, L, S, 0.4); k('#8a6a5a', 0.35, 0.35, L - 0.7, S - 0.7, 0.3);
      const farben = ['#455a64', '#8d6e63', '#37474f', '#a1887f'];
      for (let i = 0; i < 4; i++) { kreis(ctx, '#d4b36a', L * (i + 0.5) / 4, 0.55, 0.28); k(farben[i], L * (i + 0.5) / 4 - 0.7, 0.9, 1.4, S - 1.3, 0.5); }   // Haken mit Jacken
      break;
    }
    case 'regal': case 'lagerregal': {
      k('#6d4c41', 0, 0, L, S, 0.3);
      const bunt = ['#c62828', '#1565c0', '#2e7d32', '#f9a825', '#6a1b9a', '#ef6c00'];
      for (let i = 0, a = 0.3; a < L - 0.5; i++) { const bw = 0.35 + hs(sx + i, sy, 3) * 0.35; ctx.fillStyle = bunt[Math.floor(hs(sx + i, sy, 4) * bunt.length)]; ctx.fillRect(a, 0.25, bw, S - 0.5); a += bw + 0.05; }   // Buchrücken
      break;
    }
    case 'heizung': {
      k('#cfd8dc', 0, 0, L, S, 0.3); ctx.fillStyle = '#90a4ae';
      for (let i = 0.7; i < L - 0.5; i += 0.8) ctx.fillRect(i, 0.15, 0.35, S - 0.3);
      break;
    }
    case 'regal_lang': {
      const kat = m.kat ?? '';
      if (kat === 'polizei') {   // Waffenschrank / Spind: Stahl mit Gewehren
        k('#546e7a', 0, 0, L, S, 0.3); k('#78909c', 0.3, 0.3, L - 0.6, S - 0.6, 0.2);
        for (let i = 0; i < 4; i++) { const cx = 0.5 + i * (L - 1) / 4; ctx.strokeStyle = 'rgba(0,0,0,.4)'; ctx.lineWidth = 0.14; ctx.strokeRect(cx, 0.45, (L - 1) / 4 - 0.25, S - 0.9); k('#263238', cx + 0.5, S * 0.28, (L - 1) / 4 - 1.25, S * 0.44, 0.15); kreis(ctx, '#ffca28', cx + (L - 1) / 4 - 0.75, S / 2, 0.22); }
      } else if (kat === 'apotheke') {   // Medikamentenschrank: weiß mit grünem Kreuz und Schubladen
        k('#eceff1', 0, 0, L, S, 0.3);
        for (let i = 0; i < 6; i++) { const cx = 0.4 + i * (L - 0.8) / 6; ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.lineWidth = 0.1; ctx.strokeRect(cx, 0.4, (L - 0.8) / 6 - 0.1, S - 0.8); ctx.fillStyle = '#43a047'; ctx.fillRect(cx + 0.55, 1.0, 0.7, 0.2); ctx.fillRect(cx + 0.8, 0.75, 0.2, 0.7); }
      } else if (kat === 'gaststaette') {   // Theke / Anrichte mit Gläsern
        k('#5d4037', 0, 0, L, S, 0.4); k('#8d6e63', 0.4, 0.4, L - 0.8, S - 0.8, 0.3); maserung(ctx, L, S, sx, sy, 'rgba(40,22,12,.25)');
        for (let i = 0; i < 6; i++) { kreis(ctx, 'rgba(200,230,245,.85)', 1 + i * (L - 2) / 5, S * 0.5, 0.45); kreis(ctx, 'rgba(120,170,200,.6)', 1 + i * (L - 2) / 5, S * 0.5, 0.25); }
      } else if (kat === 'kaufhaus') {   // Kleiderständer / Warentisch: Stoffballen
        k('#9e9e9e', 0, 0, L, S, 0.3);
        const waren = ['#c62828', '#1565c0', '#2e7d32', '#f9a825', '#6a1b9a', '#00838f'];
        for (let i = 0; i < 7; i++) { ctx.fillStyle = waren[Math.floor(hs(sx + i, sy, 6) * waren.length)]; ctx.fillRect(0.3 + i * (L - 0.6) / 7, 0.3, (L - 0.6) / 7 - 0.2, S - 0.6); ctx.fillStyle = 'rgba(255,255,255,.2)'; ctx.fillRect(0.3 + i * (L - 0.6) / 7, 0.3, (L - 0.6) / 7 - 0.2, 0.25); }
      } else {   // Lebensmittel (und unbekannt): Regal mit Dosen, Packungen, Flaschen
        k('#8d9498', 0, 0, L, S, 0.3); k('#b0b7ba', 0.25, 0.25, L - 0.5, S - 0.5, 0.2);
        const waren = ['#e53935', '#fdd835', '#43a047', '#1e88e5', '#fb8c00', '#8e24aa'];
        for (let i = 0; i < 8; i++) {
          const cx = 0.6 + i * (L - 1.2) / 8, c = waren[Math.floor(hs(sx * 3 + i, sy, 5) * waren.length)];
          if (i % 3 === 0) { kreis(ctx, c, cx + 0.45, S * 0.28, 0.4); kreis(ctx, c, cx + 0.45, S * 0.72, 0.4); }
          else { ctx.fillStyle = c; ctx.fillRect(cx, 0.45, (L - 1.2) / 8 - 0.25, S * 0.4); ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.fillRect(cx, 0.45, (L - 1.2) / 8 - 0.25, 0.2); ctx.fillStyle = c; ctx.fillRect(cx, S * 0.55, (L - 1.2) / 8 - 0.25, S * 0.35); }
        }
      }
      break;
    }
    case 'kasse': {
      k('#5d4037', 0, 0, L, S, 0.4); k('#8d6e63', 0.35, 0.35, L - 0.7, S - 0.7, 0.3);
      k('#263238', L * 0.58, S * 0.2, L * 0.3, S * 0.6, 0.3); k('#80cbc4', L * 0.62, S * 0.3, L * 0.22, S * 0.22, 0.2);   // Kasse mit Display
      for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) { ctx.fillStyle = '#90a4ae'; ctx.fillRect(L * 0.62 + i * 0.7, S * 0.58 + j * 0.45, 0.5, 0.3); }
      k('#37474f', L * 0.08, S * 0.25, L * 0.36, S * 0.5, 0.2); linie(ctx, '#78909c', 0.15, L * 0.12, S * 0.5, L * 0.4, S * 0.5);   // Warenband
      break;
    }
    case 'kiste': {
      k('#a1887f', 0, 0, L, S, 0.3); ctx.strokeStyle = '#6d4c41'; ctx.lineWidth = 0.28; ctx.strokeRect(0.3, 0.3, L - 0.6, S - 0.6);
      linie(ctx, '#6d4c41', 0.28, 0.3, 0.3, L - 0.3, S - 0.3); linie(ctx, '#6d4c41', 0.28, L - 0.3, 0.3, 0.3, S - 0.3);
      for (const [a, c] of [[0.5, 0.5], [L - 0.5, 0.5], [0.5, S - 0.5], [L - 0.5, S - 0.5]]) kreis(ctx, '#4e342e', a, c, 0.18);
      break;
    }
    case 'vorratskiste': {   // Safe Room: große Feldkiste aus Holz mit Beschlägen und aufgemaltem Kreuz
      k('#4f5d2f', 0, 0, L, S, 0.4); k('#66763b', 0.35, 0.35, L - 0.7, S - 0.7, 0.3);
      ctx.fillStyle = '#3a3f2a'; ctx.fillRect(0.35, 0.35, 0.7, S - 0.7); ctx.fillRect(L - 1.05, 0.35, 0.7, S - 0.7);   // Spangen
      ctx.fillStyle = '#e8e4d4'; ctx.fillRect(L / 2 - 0.3, S * 0.2, 0.6, S * 0.6); ctx.fillRect(L / 2 - S * 0.3, S / 2 - 0.3, S * 0.6, 0.6);
      kreis(ctx, '#ffd54f', L * 0.2, S / 2, 0.35); kreis(ctx, '#ffd54f', L * 0.8, S / 2, 0.35);
      break;
    }
    case 'kuehlschrank': case 'safe_kuehlschrank': {
      k('#dfe5e8', 0, 0, L, S, 0.4); k('#eef2f4', 0.3, 0.3, L - 0.6, S - 0.6, 0.3);
      linie(ctx, 'rgba(0,0,0,.28)', 0.14, 0.3, S * 0.4, L - 0.3, S * 0.4);                            // Gefrierfach
      k('#90a4ae', L - 0.9, S * 0.12, 0.35, S * 0.22, 0.15); k('#90a4ae', L - 0.9, S * 0.5, 0.35, S * 0.35, 0.15);
      break;
    }
    case 'herd': {
      k('#cfd8dc', 0, 0, L, S, 0.3); k('#eceff1', 0.3, 0.3, L - 0.6, S - 0.6, 0.3);
      for (const [a, c, r] of [[0.27, 0.27, 0.17], [0.73, 0.27, 0.13], [0.27, 0.73, 0.13], [0.73, 0.73, 0.17]]) { kreis(ctx, '#37474f', L * a, S * c, Math.min(L, S) * r); kreis(ctx, '#546e7a', L * a, S * c, Math.min(L, S) * r * 0.6); }
      for (let i = 0; i < 4; i++) kreis(ctx, '#263238', L * (0.2 + i * 0.2), S * 0.93, 0.18);   // Knöpfe
      break;
    }
    case 'spuele': case 'waschbecken': {
      k('#cfd8dc', 0, 0, L, S, 0.4); k('#eceff1', 0.3, 0.3, L - 0.6, S - 0.6, 0.3);
      const wb = m.art === 'waschbecken';
      if (wb) { ctx.fillStyle = '#b0bec5'; ctx.beginPath(); ctx.ellipse(L / 2, S * 0.55, L * 0.36, S * 0.34, 0, 0, Math.PI * 2); ctx.fill(); kreis(ctx, '#78909c', L / 2, S * 0.55, 0.25); }
      else { k('#b0bec5', L * 0.08, S * 0.2, L * 0.38, S * 0.62, 0.5); k('#b0bec5', L * 0.54, S * 0.2, L * 0.36, S * 0.62, 0.5); kreis(ctx, '#78909c', L * 0.27, S * 0.5, 0.22); kreis(ctx, '#78909c', L * 0.72, S * 0.5, 0.22); }
      linie(ctx, '#90a4ae', 0.3, L / 2, 0.45, L / 2, S * 0.28);                                        // Hahn
      break;
    }
    case 'badewanne': {
      k('#f5f5f5', 0, 0, L, S, 1.3); k('#c9e9f7', 0.7, 0.7, L - 1.4, S - 1.4, 1.1);
      ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 0.14; ctx.beginPath(); ctx.arc(L * 0.4, S * 0.5, S * 0.18, 0, Math.PI * 1.4); ctx.stroke();
      kreis(ctx, '#90a4ae', L - 1.0, S / 2, 0.38); linie(ctx, '#90a4ae', 0.3, L - 0.35, S * 0.35, L - 0.35, S * 0.65);
      break;
    }
    case 'klo': {
      k('#fafafa', 0, 0, L * 0.3, S, 0.3);                                                              // Spülkasten
      ctx.fillStyle = '#f5f5f5'; ctx.beginPath(); ctx.ellipse(L * 0.64, S / 2, L * 0.32, S * 0.4, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,.3)'; ctx.lineWidth = 0.15; ctx.stroke();
      ctx.fillStyle = '#d7e3ea'; ctx.beginPath(); ctx.ellipse(L * 0.66, S / 2, L * 0.2, S * 0.26, 0, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'funktisch': {
      k('#7b5a4a', 0, 0, L, S, 0.4); k('#a1887f', 0.35, 0.35, L - 0.7, S - 0.7, 0.3); maserung(ctx, L, S, sx, sy);
      k('#33402b', L * 0.08, S * 0.18, L * 0.42, S * 0.52, 0.3);                                       // Funkgerät
      ctx.fillStyle = '#9ccc65'; ctx.fillRect(L * 0.12, S * 0.26, L * 0.16, S * 0.16);                   // Anzeige
      kreis(ctx, '#ffeb3b', L * 0.38, S * 0.34, 0.3); kreis(ctx, '#212121', L * 0.38, S * 0.56, 0.3);
      linie(ctx, '#cfd8dc', 0.2, L * 0.46, S * 0.2, L * 0.52, -0.4); kreis(ctx, '#f44336', L * 0.52, -0.4, 0.22);   // Antenne
      k('#eceff1', L * 0.62, S * 0.2, L * 0.16, S * 0.5, 0.15); for (let i = 0; i < 3; i++) linie(ctx, 'rgba(0,0,0,.3)', 0.1, L * 0.64, S * (0.32 + i * 0.12), L * 0.76, S * (0.32 + i * 0.12));   // Notizblock
      ctx.strokeStyle = '#212121'; ctx.lineWidth = 0.2; ctx.beginPath(); ctx.arc(L * 0.88, S * 0.5, S * 0.22, Math.PI * 0.6, Math.PI * 1.4); ctx.stroke();   // Headset
      break;
    }
    case 'generator': {
      k('#37474f', 0, 0, L, S, 0.4); k('#ef6c00', 0.4, 0.4, L - 0.8, S - 0.8, 0.5); k('#bf360c', 0.4, 0.4, L - 0.8, 0.6, 0.3);
      k('#212121', L * 0.12, S * 0.3, L * 0.3, S * 0.4, 0.3); kreis(ctx, '#ffd54f', L * 0.7, S * 0.35, 0.4); kreis(ctx, '#212121', L * 0.7, S * 0.7, 0.3);
      linie(ctx, '#111', 0.25, L - 0.4, S * 0.8, L + 0.3, S + 0.2);
      break;
    }
    case 'kanister': {
      const f1 = (sx + sy) % 2 ? '#1565c0' : '#fbc02d', f2 = (sx + sy) % 2 ? '#fbc02d' : '#1565c0';
      k(f1, 0.2, 0.2, L * 0.48, S - 0.4, 0.4); k(f2, L * 0.5, 0.35, L * 0.45, S - 0.5, 0.4);
      kreis(ctx, '#0d47a1', L * 0.2, 0.45, 0.28); kreis(ctx, '#bf8f00', L * 0.62, 0.55, 0.28);
      ctx.strokeStyle = 'rgba(0,0,0,.4)'; ctx.lineWidth = 0.12; ctx.strokeRect(0.5, 0.8, L * 0.42, S - 1.3); ctx.strokeRect(L * 0.55, 0.9, L * 0.36, S - 1.4);
      break;
    }
    case 'erstehilfe': {
      k('#fafafa', 0, 0, L, S, 0.35); ctx.strokeStyle = '#9e9e9e'; ctx.lineWidth = 0.16; ctx.strokeRect(0.25, 0.25, L - 0.5, S - 0.5);
      ctx.fillStyle = '#d32f2f'; ctx.fillRect(L / 2 - 0.3, 0.55, 0.6, S - 1.1); ctx.fillRect(0.55, S / 2 - 0.3, L - 1.1, 0.6);
      break;
    }
    default:
      k('#8d6e63', 0, 0, L, S, 0.3);
  }
  if (behaelter) { ctx.strokeStyle = GOLD; ctx.lineWidth = 0.22; ctx.strokeRect(0.12, 0.12, L - 0.24, S - 0.24); }   // durchsuchbar
  ctx.restore();
}

// ---------- Boden ----------
function boden(ctx, w) {
  const Z = INNEN_Z, B = w.breite, H = w.hoehe;
  const raumAn = (x, y) => w.raeume.find(r => x >= r.x && x < r.x + r.b && y >= r.y && y < r.y + r.h);
  // Zimmerart je Zelle einmal bestimmen
  const art = new Array(B * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < B; x++) {
    const t = w.hole(x, y);
    if (t === T.LEER || t === T.WAND) continue;
    art[y * B + x] = raumAn(x, y) ?? raumAn(x - 3, y) ?? raumAn(x + 3, y) ?? raumAn(x, y - 3) ?? raumAn(x, y + 3) ?? { typ: 'flur' };
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < B; x++) {
    const r = art[y * B + x];
    if (!r) continue;
    let [farbe, muster] = BODEN[r.typ] ?? ['#b08a62', 'parkett'];
    if (r.typ === 'verkaufsraum' && w.laden) farbe = LADEN_BODEN[w.laden] ?? farbe;
    const px = x * Z, py = y * Z;
    if (muster === 'parkett' || muster === 'dielen') {
      // Dielen quer zur x-Achse: Streifen von 3 Zellen (0,75 m)? nein – Dielenbreite 0,19 m ≈ 1,5 px; Zelle hat 2 px: je Zelle eine Diele, Stöße versetzt
      const reihe = y, stoss = Math.floor((x + hs(reihe, 7) * 24) / 12);
      const t = (hs(stoss, reihe, 1) - 0.5) * 0.09;
      ctx.fillStyle = mischung(farbe, t); ctx.fillRect(px, py, Z + 0.02, Z + 0.02);
      ctx.fillStyle = 'rgba(0,0,0,.20)'; ctx.fillRect(px, py + Z - 0.14, Z + 0.02, 0.14);                      // Fuge längs
      if (Math.floor((x + hs(reihe, 7) * 24) % 12) === 0) { ctx.fillStyle = 'rgba(0,0,0,.2)'; ctx.fillRect(px, py, 0.14, Z); }   // Stoß
      if (hs(x, y, 2) > 0.8) { ctx.fillStyle = 'rgba(60,35,15,.10)'; ctx.fillRect(px + 0.3, py + 0.8, Z * 0.7, 0.18); }   // Maserung
    } else if (muster === 'fliese' || muster === 'fliese_klein' || muster === 'schach') {
      const T4 = muster === 'fliese_klein' ? 2 : 4;   // Fliese 0,5 m bzw. 0,25 m
      const fx = Math.floor(x / T4), fy = Math.floor(y / T4);
      let f = mischung(farbe, (hs(fx, fy, 3) - 0.5) * 0.05);
      if (muster === 'schach' && (fx + fy) % 2) f = mischung(farbe, -0.07);
      ctx.fillStyle = f; ctx.fillRect(px, py, Z + 0.02, Z + 0.02);
      if (x % T4 === 0) { ctx.fillStyle = 'rgba(0,0,0,.13)'; ctx.fillRect(px, py, 0.16, Z + 0.02); }
      if (y % T4 === 0) { ctx.fillStyle = 'rgba(0,0,0,.13)'; ctx.fillRect(px, py, Z + 0.02, 0.16); }
    } else if (muster === 'linoleum') {
      ctx.fillStyle = mischung(farbe, (hs(x >> 2, y >> 2, 4) - 0.5) * 0.04); ctx.fillRect(px, py, Z + 0.02, Z + 0.02);
      if (y % 16 === 0) { ctx.fillStyle = 'rgba(0,0,0,.08)'; ctx.fillRect(px, py, Z + 0.02, 0.14); }
    } else {   // Beton
      ctx.fillStyle = mischung(farbe, (hs(x, y, 5) - 0.5) * 0.06); ctx.fillRect(px, py, Z + 0.02, Z + 0.02);
      if (hs(x, y, 6) > 0.93) { ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.fillRect(px + hs(x, y, 8), py + hs(x, y, 9), 0.35, 0.35); }
      if (x % 12 === 0 || y % 12 === 0) { ctx.fillStyle = 'rgba(0,0,0,.07)'; ctx.fillRect(px, py, x % 12 === 0 ? 0.14 : Z, y % 12 === 0 ? 0.14 : Z); }   // Plattenfugen
    }
  }
}

// ---------- Wände ----------
function waende(ctx, w) {
  const Z = INNEN_Z, B = w.breite, H = w.hoehe;
  const wand = (a, c) => w.hole(a, c) === T.WAND;
  const bo = (a, c) => { const t = w.hole(a, c); return t !== T.WAND && t !== T.LEER; };
  const leer = (a, c) => w.hole(a, c) === T.LEER;
  // weicher Schatten der Wände auf den Boden
  for (let y = 0; y < H; y++) for (let x = 0; x < B; x++) {
    if (!bo(x, y)) continue;
    let s = 0;
    if (wand(x, y - 1)) s += 1; if (wand(x - 1, y)) s += 0.6;
    if (s) { ctx.fillStyle = `rgba(0,0,0,${0.16 * s})`; ctx.fillRect(x * Z, y * Z, Z + 0.02, Z + 0.02); }
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < B; x++) {
    if (!wand(x, y)) continue;
    const aussen = leer(x + 1, y) || leer(x - 1, y) || leer(x, y + 1) || leer(x, y - 1) || leer(x, y - 2) || leer(x, y + 2) || leer(x - 2, y) || leer(x + 2, y);
    ctx.fillStyle = aussen ? '#3f342d' : '#54463d'; ctx.fillRect(x * Z, y * Z, Z + 0.02, Z + 0.02);
  }
  // Wandkanten: heller Rand zur Bodenseite
  ctx.fillStyle = '#8a7a6e';
  for (let y = 0; y < H; y++) for (let x = 0; x < B; x++) {
    if (!wand(x, y)) continue;
    if (bo(x, y + 1)) ctx.fillRect(x * Z, y * Z + Z - 0.4, Z + 0.02, 0.4);
    if (bo(x, y - 1)) ctx.fillRect(x * Z, y * Z, Z + 0.02, 0.4);
    if (bo(x + 1, y)) ctx.fillRect(x * Z + Z - 0.4, y * Z, 0.4, Z + 0.02);
    if (bo(x - 1, y)) ctx.fillRect(x * Z, y * Z, 0.4, Z + 0.02);
  }
  // Fenster in geraden Außenwänden (Positionen: fensterPositionen)
  for (const f of fensterPositionen(w)) {
    const quer = f.richtung === 'n' || f.richtung === 's';
    for (let i = 0; i < f.n; i++) {
      const px = (f.x + (quer ? i : 0)) * Z, py = (f.y + (quer ? 0 : i)) * Z;
      ctx.fillStyle = '#b3dff2'; ctx.fillRect(px, py, Z + 0.02, Z + 0.02);
      ctx.fillStyle = 'rgba(255,255,255,.55)'; if (quer) ctx.fillRect(px, py + 0.2, Z + 0.02, 0.35); else ctx.fillRect(px + 0.2, py, 0.35, Z + 0.02);
    }
  }
}

// Fensterpositionen einer Ebene (Raster aus 0,25-m-Zellen): etwa alle 6 m ein Fenster von 1,25 m (5 Zellen) in geraden
// Außenwänden, mindestens 1 m von Ecken und Türen entfernt, Wandstücke unter 2,5 m ohne Fenster.
// Liefert [{ x, y, richtung, n }]: erste Zelle, Blickrichtung nach draußen ('n' 's' 'w' 'o'), Länge in Zellen
// (waagrecht n/s: Zellen x..x+n-1, senkrecht w/o: y..y+n-1). Rein ganzzahlig, damit Licht durch Fenster später dieselben Orte nutzt.
export const FENSTER_ZELLEN = 5, FENSTER_ABSTAND = 24, FENSTER_RAND = 4, FENSTER_MIN_WAND = 10;
export function fensterPositionen(w) {
  const B = w.breite, H = w.hoehe;
  const wand = (a, c) => w.hole(a, c) === T.WAND;
  const leer = (a, c) => w.hole(a, c) === T.LEER;
  const aus = [];
  // Lauf (Zellen l0..l1-1 entlang der Wand) -> Fenster gleichmäßig verteilt
  const lauf = (l0, l1, fest, quer, richtung) => {
    const L = l1 - l0;
    if (L < FENSTER_MIN_WAND) return;
    const nutz = L - 2 * FENSTER_RAND;
    if (nutz < FENSTER_ZELLEN) return;
    const n = Math.floor((nutz - FENSTER_ZELLEN) / FENSTER_ABSTAND) + 1;
    const start = l0 + FENSTER_RAND + Math.floor((nutz - FENSTER_ZELLEN - (n - 1) * FENSTER_ABSTAND) / 2);
    for (let i = 0; i < n; i++) {
      const p = start + i * FENSTER_ABSTAND;
      aus.push(quer ? { x: p, y: fest, richtung, n: FENSTER_ZELLEN } : { x: fest, y: p, richtung, n: FENSTER_ZELLEN });
    }
  };
  // Seite einer Zelle: 1 = draußen oben/links, 2 = unten/rechts, 0 = kein gerader Außenwandabschnitt
  const seiteQ = (x, y) => {
    if (!wand(x, y) || leer(x - 1, y) || leer(x + 1, y)) return 0;
    const o = leer(x, y - 1) || leer(x, y - 2), u = leer(x, y + 1) || leer(x, y + 2);
    return o ? 1 : u ? 2 : 0;
  };
  const seiteS = (x, y) => {
    if (!wand(x, y) || leer(x, y - 1) || leer(x, y + 1)) return 0;
    const l = leer(x - 1, y) || leer(x - 2, y), r = leer(x + 1, y) || leer(x + 2, y);
    return l ? 1 : r ? 2 : 0;
  };
  for (let y = 2; y < H - 2; y++) {
    let x = 2;
    while (x < B - 2) {
      const s = seiteQ(x, y);
      if (!s) { x++; continue; }
      let e = x; while (e < B - 2 && seiteQ(e, y) === s) e++;
      lauf(x, e, y, true, s === 1 ? 'n' : 's');
      x = e;
    }
  }
  for (let x = 2; x < B - 2; x++) {
    let y = 2;
    while (y < H - 2) {
      const s = seiteS(x, y);
      if (!s) { y++; continue; }
      let e = y; while (e < H - 2 && seiteS(x, e) === s) e++;
      lauf(y, e, x, false, s === 1 ? 'w' : 'o');
      y = e;
    }
  }
  return aus;
}

// Innenraum zeichnen; die Zeichenfläche beginnt bei (0, 0) = Zelle (0, 0) des Rasters
export function zeichneInnenFein(ctx, w) {
  const Z = INNEN_Z;
  ctx.save();
  ctx.scale(BILD_SKALA, BILD_SKALA);
  boden(ctx, w);
  waende(ctx, w);
  // Türrahmen (offener Durchgang, die Türblätter zeichnet das Spiel), Haustür, Treppen
  for (const t of w.tueren) {
    const zs = t.zellen, x0 = Math.min(...zs.map(c => c[0])), y0 = Math.min(...zs.map(c => c[1])), x1 = Math.max(...zs.map(c => c[0])), y1 = Math.max(...zs.map(c => c[1]));
    ctx.fillStyle = '#c9b79c'; ctx.fillRect(x0 * Z, y0 * Z, (x1 - x0 + 1) * Z, (y1 - y0 + 1) * Z);
    ctx.fillStyle = '#5d4037';
    if (t.senkrecht) { ctx.fillRect(x0 * Z - 0.2, y0 * Z - 0.5, Z + 0.4, 0.5); ctx.fillRect(x0 * Z - 0.2, (y1 + 1) * Z, Z + 0.4, 0.5); }
    else { ctx.fillRect(x0 * Z - 0.5, y0 * Z - 0.2, 0.5, Z + 0.4); ctx.fillRect((x1 + 1) * Z, y0 * Z - 0.2, 0.5, Z + 0.4); }
  }
  if (w.ausgang) {
    const r = w.ausgang.rect;
    ctx.fillStyle = '#5d4037'; ctx.fillRect(r.x * Z, r.y * Z, r.b * Z, r.h * Z);
    ctx.fillStyle = '#6d4c41'; const quer = r.b > r.h;
    for (let i = 1; i < 4; i++) { if (quer) ctx.fillRect(r.x * Z + i * r.b * Z / 4 - 0.1, r.y * Z, 0.2, r.h * Z); else ctx.fillRect(r.x * Z, r.y * Z + i * r.h * Z / 4 - 0.1, r.b * Z, 0.2); }
    ctx.strokeStyle = '#3e2723'; ctx.lineWidth = 0.3; ctx.strokeRect(r.x * Z, r.y * Z, r.b * Z, r.h * Z);
    ctx.fillStyle = '#ffd54f'; ctx.font = 'bold 4px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const pf = { unten: '⬇', oben: '⬆', links: '⬅', rechts: '➡' }[w.ausgang.seite] ?? '⬇';
    ctx.fillText(pf, (r.x + r.b / 2) * Z, (r.y + r.h / 2) * Z);
  }
  for (const tr of w.treppen) {
    const r = tr.rect, quer = r.b > r.h;
    ctx.fillStyle = '#b7b2a8'; ctx.fillRect(r.x * Z, r.y * Z, r.b * Z, r.h * Z);
    const n = Math.round((quer ? r.b : r.h) / 2);   // Stufen von 0,5 m? hier Auftritt 0,5 m = 4 px
    for (let i = 0; i < n; i++) {
      ctx.fillStyle = i % 2 ? '#a39e94' : '#c4bfb5';
      if (quer) ctx.fillRect((r.x + i * 2) * Z, r.y * Z, 2 * Z, r.h * Z); else ctx.fillRect(r.x * Z, (r.y + i * 2) * Z, r.b * Z, 2 * Z);
      ctx.fillStyle = 'rgba(0,0,0,.28)';
      if (quer) ctx.fillRect((r.x + i * 2) * Z, r.y * Z, 0.3, r.h * Z); else ctx.fillRect(r.x * Z, (r.y + i * 2) * Z, r.b * Z, 0.3);
    }
    ctx.strokeStyle = '#6d6a63'; ctx.lineWidth = 0.4; ctx.strokeRect(r.x * Z, r.y * Z, r.b * Z, r.h * Z);   // Geländer
    ctx.fillStyle = '#37474f'; ctx.font = 'bold 5px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(tr.art === 'runter' ? '▼' : '▲', (r.x + r.b / 2) * Z, (r.y + r.h / 2) * Z);
  }
  // Teppiche unter Sofa/Couchtisch im Wohnzimmer (reine Optik)
  for (const m of w.moebel) {
    if (m.art !== 'couchtisch') continue;
    const cx = (m.x + m.b / 2) * Z, cy = (m.y + m.h / 2) * Z, rb = (m.b + 6) * Z, rh = (m.h + 6) * Z;
    ctx.fillStyle = 'rgba(150,60,60,.55)'; ctx.fillRect(cx - rb / 2, cy - rh / 2, rb, rh);
    ctx.strokeStyle = 'rgba(240,220,170,.7)'; ctx.lineWidth = 0.3; ctx.strokeRect(cx - rb / 2 + 0.6, cy - rh / 2 + 0.6, rb - 1.2, rh - 1.2);
  }
  for (const m of w.moebel) moebel(ctx, m, w);
  ctx.restore();
}

// Türblatt (Graphics in Weltpixeln): zu = Holzfläche über dem Durchgang (mit Schloss-Symbol), offen = schmales Blatt, aufgeschwungen
export function zeichneTuerFein(g, sp, a, w, t, zustand, zusText) {
  const Z = INNEN_Z, zs = t.zellen;
  const x0 = Math.min(...zs.map(c => c[0])) * Z, y0 = Math.min(...zs.map(c => c[1])) * Z;
  const x1 = (Math.max(...zs.map(c => c[0])) + 1) * Z, y1 = (Math.max(...zs.map(c => c[1])) + 1) * Z;
  if (zustand === 'o') {
    g.fillStyle(0x6d4c41, 1);
    if (t.senkrecht) { g.fillRect(x0, y0, zs.length * Z, 0.7); g.fillStyle(0xffd54f, 1).fillRect(x0 + zs.length * Z - 0.9, y0 - 0.1, 0.5, 0.5); }
    else { g.fillRect(x0, y0, 0.7, zs.length * Z); g.fillStyle(0xffd54f, 1).fillRect(x0 - 0.1, y0 + zs.length * Z - 0.9, 0.5, 0.5); }
  } else {
    const dunkel = zustand === 'r' || zustand === 's';
    g.fillStyle(dunkel ? 0x5d4037 : 0x8d6e63, 1).fillRect(x0, y0, x1 - x0, y1 - y0);
    g.lineStyle(0.4, 0x3e2723, 1).strokeRect(x0 + 0.2, y0 + 0.2, x1 - x0 - 0.4, y1 - y0 - 0.4);
    g.lineStyle(0.15, 0x3e2723, 0.7);   // Füllungen
    if (t.senkrecht) for (let i = 1; i < 3; i++) g.lineBetween(x0 + i * (x1 - x0) / 3, y0 + 0.3, x0 + i * (x1 - x0) / 3, y1 - 0.3);
    else for (let i = 1; i < 3; i++) g.lineBetween(x0 + 0.3, y0 + i * (y1 - y0) / 3, x1 - 0.3, y0 + i * (y1 - y0) / 3);
    g.fillStyle(0xffd54f, 1).fillCircle(t.senkrecht ? x0 + Z / 2 : x1 - 1.5, t.senkrecht ? y1 - 1.5 : y0 + Z / 2, 0.45);
    if (dunkel) a.symbole.add(sp.add.text((x0 + x1) / 2, (y0 + y1) / 2, zustand === 'r' ? '❓' : '🔑', { fontSize: '16px' }).setOrigin(0.5).setScale(0.4));
  }
  const brett = parseInt(zusText) || 0;
  for (let i = 0; i < brett; i++) {
    g.fillStyle(0xa1887f, 1).lineStyle(0.3, 0x4e342e, 1);
    if (t.senkrecht) { g.fillRect(x0 - 0.5, y0 + 1 + i * 2.2, x1 - x0 + 1, 1.2); g.strokeRect(x0 - 0.5, y0 + 1 + i * 2.2, x1 - x0 + 1, 1.2); }
    else { g.fillRect(x0 + 1 + i * 2.2, y0 - 0.5, 1.2, y1 - y0 + 1); g.strokeRect(x0 + 1 + i * 2.2, y0 - 0.5, 1.2, y1 - y0 + 1); }
  }
  if (String(zusText).includes('k')) {   // zerbrochen: Splitter
    g.fillStyle(0x5d4037, 1).fillTriangle(x0 + 0.5, y0 + 0.5, x0 + 2.5, y0 + 1.2, x0 + 1.2, y0 + 3).fillTriangle(x1 - 0.5, y1 - 0.5, x1 - 2.5, y1 - 1.2, x1 - 1.2, y1 - 3);
  }
}

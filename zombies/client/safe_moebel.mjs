import { zeichneMoebelBild } from './moebel_bilder.mjs';
// Notlager-Möbel für Safe Rooms (Canvas 2D, von oben) und Sandsäcke vor der Haustür
export const SAFE_ARTEN = new Set(['feldbett', 'vorratsregal', 'funktisch', 'generator', 'kanister', 'erstehilfe']);

function rund(ctx, f, x, y, b, h, r = 3) {
  ctx.fillStyle = f; ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, b, h, r); else ctx.rect(x, y, b, h);
  ctx.fill();
}

// zeichnet in einem Rahmen mit langer Achse nach unten (Breite W, Länge L), Mitte im Ursprung
function gedreht(ctx, x, y, bw, bh, fn) {
  ctx.save();
  ctx.translate(x + bw / 2, y + bh / 2);
  if (bw > bh) { ctx.rotate(Math.PI / 2); fn(bh, bw); } else fn(bw, bh);
  ctx.restore();
}

// Rückgabe true, wenn die Art hier gezeichnet wurde. m: { art, x, y, b, h } in Kacheln
export function zeichneSafeMoebel(ctx, m, KACHEL) {
  if (!SAFE_ARTEN.has(m.art)) return false;
  if (zeichneMoebelBild(ctx, m, KACHEL)) return true;   // Bild (Gemini) statt gezeichnet
  const x = m.x * KACHEL, y = m.y * KACHEL, bw = m.b * KACHEL, bh = m.h * KACHEL;
  ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(x + 5, y + 6, bw - 6, bh - 6);
  switch (m.art) {
    case 'feldbett':
      gedreht(ctx, x, y, bw, bh, (W, L) => {
        rund(ctx, '#4e342e', -W / 2 + 3, -L / 2 + 2, W - 6, L - 4, 2);                       // Holzrahmen
        rund(ctx, '#6b7b3a', -W / 2 + 5, -L / 2 + 4, W - 10, L - 8, 3);                      // olivgrüne Liege
        rund(ctx, '#e8e4d4', -W / 2 + 7, -L / 2 + 6, W - 14, 11, 3);                         // Kissen
        rund(ctx, '#8d6e63', -W / 2 + 5, -L / 2 + 22, W - 10, L - 30, 2);                    // graue-braune Wolldecke
        ctx.strokeStyle = 'rgba(0,0,0,.3)'; ctx.lineWidth = 1;
        for (let i = -L / 2 + 28; i < L / 2 - 8; i += 7) { ctx.beginPath(); ctx.moveTo(-W / 2 + 6, i); ctx.lineTo(W / 2 - 6, i); ctx.stroke(); }
        ctx.fillStyle = '#3e2723'; for (const [a, c] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) ctx.fillRect(a * (W / 2 - 4) - 2, c * (L / 2 - 4) - 2, 4, 4);   // Füße
      });
      break;
    case 'vorratsregal':
      gedreht(ctx, x, y, bw, bh, (W, L) => {
        rund(ctx, '#5d4037', -W / 2 + 2, -L / 2 + 2, W - 4, L - 4, 2);
        rund(ctx, '#3e2723', -W / 2 + 5, -L / 2 + 5, W - 10, L - 10, 1);
        const n = Math.max(3, Math.round(L / 11));
        for (let i = 0; i < n; i++) {
          const yy = -L / 2 + 7 + i * (L - 14) / n;
          ctx.fillStyle = '#6d4c41'; ctx.fillRect(-W / 2 + 4, yy + (L - 14) / n - 2, W - 8, 2);   // Brett
          for (let j = 0; j < 3; j++) {                                                            // Dosen und Flaschen
            const cx = -W / 2 + 9 + j * ((W - 18) / 2);
            if ((i + j + m.x + m.y) % 3 === 0) { ctx.fillStyle = '#29b6f6'; ctx.beginPath(); ctx.arc(cx, yy + 5, 3.2, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#e1f5fe'; ctx.fillRect(cx - 1, yy + 1, 2, 2); }
            else { ctx.fillStyle = ['#c62828', '#f9a825', '#8d9a9f'][(i + j) % 3]; ctx.beginPath(); ctx.arc(cx, yy + 5, 3.4, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,.4)'; ctx.lineWidth = 1; ctx.stroke(); }
          }
        }
      });
      break;
    case 'funktisch':
      gedreht(ctx, x, y, bw, bh, (W, L) => {
        rund(ctx, '#8d6e63', -W / 2 + 3, -L / 2 + 5, W - 6, L - 10, 3);
        rund(ctx, '#a1887f', -W / 2 + 6, -L / 2 + 8, W - 12, L - 16, 2);
        rund(ctx, '#33402b', -W / 2 + 8, -L / 2 + 11, W - 16, 17, 2);                          // Funkgerät
        ctx.fillStyle = '#9ccc65'; ctx.fillRect(-W / 2 + 10, -L / 2 + 13, 10, 5);              // Anzeige
        ctx.fillStyle = '#ffeb3b'; ctx.beginPath(); ctx.arc(W / 2 - 13, -L / 2 + 20, 2, 0, Math.PI * 2); ctx.fill();   // Knopf
        ctx.fillStyle = '#212121'; ctx.beginPath(); ctx.arc(W / 2 - 18, -L / 2 + 20, 2, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#cfd8dc'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(W / 2 - 10, -L / 2 + 11); ctx.lineTo(W / 2 - 4, -L / 2 + 2); ctx.stroke();   // Antenne
        ctx.fillStyle = '#f44336'; ctx.beginPath(); ctx.arc(W / 2 - 4, -L / 2 + 2, 1.6, 0, Math.PI * 2); ctx.fill();
        rund(ctx, '#eceff1', -W / 2 + 8, L / 2 - 18, 11, 8, 1);                                // Notizblock
      });
      break;
    case 'generator':
      rund(ctx, '#bf360c', x + 3, y + 5, bw - 6, bh - 9, 3);
      rund(ctx, '#ef6c00', x + 6, y + 8, bw - 12, bh - 17, 3);
      ctx.fillStyle = '#37474f'; ctx.fillRect(x + 8, y + bh - 14, bw - 16, 5);                  // Griffrahmen
      ctx.fillStyle = '#212121'; ctx.fillRect(x + 8, y + 11, 8, 8); ctx.fillStyle = '#ffd54f'; ctx.fillRect(x + bw - 15, y + 11, 6, 4);
      ctx.strokeStyle = '#111'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x + bw - 6, y + bh - 8); ctx.bezierCurveTo(x + bw + 2, y + bh, x + bw - 2, y + bh + 6, x + bw - 10, y + bh + 4); ctx.stroke();   // Kabel
      break;
    case 'kanister': {
      const farbe = (m.x + m.y) % 2 ? '#1565c0' : '#fbc02d';
      rund(ctx, farbe, x + 6, y + 8, 13, 17, 3); rund(ctx, '#0d47a1', x + 8, y + 5, 5, 5, 1);
      rund(ctx, (m.x + m.y) % 2 ? '#fbc02d' : '#1565c0', x + 15, y + 10, 12, 16, 3); rund(ctx, '#bf8f00', x + 17, y + 7, 5, 5, 1);
      ctx.strokeStyle = 'rgba(0,0,0,.4)'; ctx.lineWidth = 1; ctx.strokeRect(x + 6.5, y + 8.5, 12, 16); ctx.strokeRect(x + 15.5, y + 10.5, 11, 15);
      break;
    }
    case 'erstehilfe':
      rund(ctx, '#fafafa', x + 5, y + 5, bw - 10, bh - 10, 3);
      ctx.strokeStyle = '#9e9e9e'; ctx.lineWidth = 1.5; ctx.strokeRect(x + 5.5, y + 5.5, bw - 11, bh - 11);
      ctx.fillStyle = '#d32f2f'; ctx.fillRect(x + bw / 2 - 2.5, y + 9, 5, bh - 18); ctx.fillRect(x + 9, y + bh / 2 - 2.5, bw - 18, 5);
      break;
  }
  return true;
}

// Sandsack-Wall links und rechts der Tür. Ursprung = Türmitte an der Hauswand, +y zeigt nach draußen, Türbreite 48 bleibt frei.
export function zeichneSandsaecke(ctx) {
  // je Seite drei geschlossene Reihen (unten/innen an der Wand, nach außen schmaler), Säcke gleich breit, jede zweite Reihe um einen halben Sack versetzt;
  // die Reihen enden bündig 26 px von der Türmitte (Durchgang ±24 bleibt frei)
  const sack = (cx, cy, rb, rh) => {
    const f = ['#c8b27a', '#bfa86c', '#d2bd88'][Math.abs(Math.round(cx * 7 + cy * 3)) % 3];
    ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.beginPath(); ctx.ellipse(cx + 1.2, cy + 1.8, rb, rh, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = f; ctx.beginPath(); ctx.ellipse(cx, cy, rb, rh, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(80,60,20,.55)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx - rb * 0.4, cy); ctx.lineTo(cx + rb * 0.4, cy); ctx.stroke();
  };
  const reihe = (x0, x1, cy, n, halb) => {
    const bw = (x1 - x0) / n;
    if (halb) { for (let i = 0; i < n - 1; i++) sack(x0 + bw * (i + 1), cy, bw / 2 + 0.5, 4.2); }
    else for (let i = 0; i < n; i++) sack(x0 + bw * (i + 0.5), cy, bw / 2 + 0.5, 4.2);
  };
  for (const [a, b] of [[-62, -26], [26, 62]]) {
    reihe(a, b, 18, 3, false);
    reihe(a, b, 24, 3, true);
    reihe(a, b, 30, 3, false);
  }
}

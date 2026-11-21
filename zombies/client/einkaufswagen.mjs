// Einkaufswagen vor Supermärkten und Läden: durchsuchbare Behälter (art 'einkaufswagen', Beute BEUTE.einkaufswagen in welt.mjs).
// baueEinkaufswagen läuft als Weltcode auf Client UND Server und ist deterministisch (eigener Seed-Zufall, keine Math.random-Aufrufe).
// zeichneEinkaufswagen malt einen Wagen von oben (Kartenstück-Ebene, aussehen.mjs). Die Wagen blockieren nichts (kein Kachelwert, kein Feinraster).
import { KACHEL, BREITE, HOEHE, T, zufall, frei } from './welt.mjs';

const TAU = Math.PI * 2;
// Anzahl je Ladenart: [min, max]. Große Märkte haben mehr Wagen, kleine Läden und Gewerbe weniger.
const GROSS = [3, 5], MITTEL = [2, 4], KLEIN = [2, 3];
const LADEN = {
  supermarket: GROSS, department_store: GROSS, mall: GROSS, wholesale: GROSS, doityourself: GROSS, garden_centre: MITTEL,
  convenience: KLEIN, variety_store: KLEIN, beverages: KLEIN, greengrocer: KLEIN, general: KLEIN, kiosk: KLEIN, chemist: KLEIN,
};
const GEWERBE = { supermarket: GROSS, retail: KLEIN, commercial: KLEIN, warehouse: KLEIN };   // Gebäudeart (building=*), wenn kein passender shop=* da ist

export function baueEinkaufswagen(welt, karte, seed) {
  const r = zufall((seed ^ 0x3c6ef372) >>> 0);
  const bauart = new Map((karte.gebaeude ?? []).map(g => [g.x + ',' + g.y + ',' + g.b + ',' + g.h, g.building ?? '']));
  const garten = karte.garten;
  const imGarten = (x, y) => { const g = garten?.[y * BREITE + x]; return !!g && g !== '.'; };
  const tonnen = welt.muell?.tonnen ?? [];
  let nr = 0, laeden = 0;
  for (const h of welt.haeuser) {
    if (!h.tuer || h.safe) continue;
    const spanne = LADEN[h.art] ?? (h.art ? null : GEWERBE[bauart.get(h.x + ',' + h.y + ',' + h.b + ',' + h.h) ?? '']);
    if (!spanne) continue;
    const vx = h.tuer.x + h.raus.dx, vy = h.tuer.y + h.raus.dy;   // Kachel direkt vor der Tür
    const tx = (vx + 0.5) * KACHEL, ty = (vy + 0.5) * KACHEL;
    // Mittelpunkt des Wagenpulks: freie Platz-/Wiesenkachel 2–6 Kacheln vor dem Laden, möglichst nah
    let best = null;
    for (let y = vy - 6; y <= vy + 6; y++) for (let x = vx - 6; x <= vx + 6; x++) {
      if (x < 2 || y < 2 || x >= BREITE - 2 || y >= HOEHE - 2) continue;
      const t = welt.hole(x, y);
      if (t !== T.PLATZ && t !== T.WIESE) continue;
      if (imGarten(x, y)) continue;
      const cx = (x + 0.5) * KACHEL, cy = (y + 0.5) * KACHEL, d = Math.hypot(cx - tx, cy - ty) / KACHEL;
      if (d < 2 || d > 6.5) continue;
      if (!frei(welt, cx, cy, 8)) continue;
      const s = d + (t === T.PLATZ ? 0 : 1.2) + r() * 1.5;   // Platz bevorzugt (Parkplatz, Vorplatz)
      if (!best || s < best.s) best = { s, x: cx, y: cy };
    }
    const wert = r();   // Zufall immer ziehen, damit die Folge nicht von Treffern abhängt
    if (!best) continue;
    const n = spanne[0] + Math.floor(wert * (spanne[1] - spanne[0] + 1));
    const mine = [];
    for (let versuch = 0; versuch < 60 && mine.length < n; versuch++) {
      const a = r() * TAU, d = mine.length === 0 ? 0 : 8 + r() * 30;
      const x = best.x + Math.cos(a) * d, y = best.y + Math.sin(a) * d;
      const winkel = r() * TAU, um = r() < 0.3;
      if (!frei(welt, x, y, 6)) continue;
      const t = welt.hole(Math.floor(x / KACHEL), Math.floor(y / KACHEL));
      if (t !== T.PLATZ && t !== T.WIESE) continue;
      if (Math.hypot(x - tx, y - ty) < KACHEL * 1.8) continue;   // Türvorplatz bleibt frei
      if (mine.some(m => Math.hypot(m.x - x, m.y - y) < 11)) continue;
      if (welt.behaelter.some(b => Math.hypot(b.x - x, b.y - y) < (b.art === 'auto' ? 36 : 22))) continue;
      if (tonnen.some(g => Math.hypot(g.x - x, g.y - y) < 24)) continue;
      mine.push({ id: 'ew' + nr++, art: 'einkaufswagen', x, y, winkel, umgekippt: um });
    }
    if (mine.length) laeden++;
    for (const m of mine) welt.behaelter.push(m);
  }
  welt.einkaufswagenLaeden = laeden;
  return welt;
}

// Einkaufswagen von oben, in der Mitte (0, 0), Fahrtrichtung nach +x (Griff hinten bei -x).
export function zeichneEinkaufswagen(ctx, b) {
  ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.winkel ?? 0);
  const metall = '#b0bec5', dunkel = '#607d8b', hell = '#eceff1';
  if (!b.umgekippt) {
    ctx.fillStyle = 'rgba(0,0,0,.26)'; ctx.beginPath(); ctx.roundRect(-8 + 2, -6 + 2.5, 18, 13, 2); ctx.fill();
    // Räder (je Ecke ein dunkler Punkt, vorn kleiner Abstand)
    ctx.fillStyle = '#263238';
    for (const [x, y] of [[-6, -5.6], [-6, 5.6], [6.4, -5], [6.4, 5]]) { ctx.beginPath(); ctx.arc(x, y, 1.5, 0, TAU); ctx.fill(); }
    // Korb: vorn schmaler (Trapez), Gitterstäbe, Rand
    ctx.fillStyle = hell;
    ctx.beginPath(); ctx.moveTo(-6.5, -5.6); ctx.lineTo(7.8, -4.4); ctx.lineTo(7.8, 4.4); ctx.lineTo(-6.5, 5.6); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = metall; ctx.lineWidth = 0.9;
    for (let x = -4.5; x <= 6; x += 2.1) { ctx.beginPath(); ctx.moveTo(x, -5.2 + (x + 6.5) * 0.06); ctx.lineTo(x, 5.2 - (x + 6.5) * 0.06); ctx.stroke(); }
    for (const y of [-2.2, 0, 2.2]) { ctx.beginPath(); ctx.moveTo(-6.3, y * 1.05); ctx.lineTo(7.6, y * 0.8); ctx.stroke(); }
    ctx.strokeStyle = dunkel; ctx.lineWidth = 1.3;
    ctx.beginPath(); ctx.moveTo(-6.5, -5.6); ctx.lineTo(7.8, -4.4); ctx.lineTo(7.8, 4.4); ctx.lineTo(-6.5, 5.6); ctx.closePath(); ctx.stroke();
    // Kindersitz-Klappe und Schiebegriff hinten (Bügel über die ganze Breite, zwei Streben)
    ctx.fillStyle = metall; ctx.fillRect(-4.2, -3.2, 3.6, 6.4);
    ctx.strokeStyle = dunkel; ctx.lineWidth = 1.1; ctx.strokeRect(-4.2, -3.2, 3.6, 6.4);
    ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(-6.5, -5.6); ctx.lineTo(-9.6, -5.8); ctx.lineTo(-9.6, 5.8); ctx.lineTo(-6.5, 5.6); ctx.stroke();
    ctx.fillStyle = '#e53935'; ctx.fillRect(-10.4, -2.4, 1.6, 4.8);   // Kunststoffgriff
  } else {
    // umgekippt: Wagen liegt auf der Seite (Gitterwand oben, Räder zeigen zur Seite), Korb leicht verdreht
    ctx.fillStyle = 'rgba(0,0,0,.26)'; ctx.beginPath(); ctx.ellipse(1.5, 2.5, 10.5, 6.5, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = hell;
    ctx.beginPath(); ctx.moveTo(-6, -3.6); ctx.lineTo(8, -5.2); ctx.lineTo(8, 4.6); ctx.lineTo(-6, 3.6); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = metall; ctx.lineWidth = 0.9;
    for (let x = -4; x <= 7; x += 2.2) { ctx.beginPath(); ctx.moveTo(x, -3.4 - (x + 6) * 0.1); ctx.lineTo(x, 3.4 + (x + 6) * 0.08); ctx.stroke(); }
    for (const y of [-1.8, 0, 1.8]) { ctx.beginPath(); ctx.moveTo(-5.8, y); ctx.lineTo(7.8, y * 1.3); ctx.stroke(); }
    ctx.strokeStyle = dunkel; ctx.lineWidth = 1.3;
    ctx.beginPath(); ctx.moveTo(-6, -3.6); ctx.lineTo(8, -5.2); ctx.lineTo(8, 4.6); ctx.lineTo(-6, 3.6); ctx.closePath(); ctx.stroke();
    // Gestell mit zwei sichtbaren Rädern an der Unterseite, Griff ragt nach hinten-oben
    ctx.strokeStyle = dunkel; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(-6, 3.6); ctx.lineTo(-10.5, 7); ctx.moveTo(8, 4.6); ctx.lineTo(9.5, 8); ctx.stroke();
    ctx.fillStyle = '#263238';
    ctx.beginPath(); ctx.arc(-10.5, 7.4, 1.8, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.arc(9.5, 8.4, 1.8, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(-3, 6.4, 1.5, 0, TAU); ctx.fill();
    ctx.strokeStyle = dunkel; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(-6, -3.6); ctx.lineTo(-10.5, -6.5); ctx.stroke();
    ctx.fillStyle = '#e53935'; ctx.fillRect(-12, -8.2, 3, 1.8);
  }
  ctx.restore();
}

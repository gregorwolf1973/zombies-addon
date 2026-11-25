// Vom Panzer plattgewalztes Autowrack (Fahrzeug.art 'platt', server/panzercrash.mjs): flache, breitgedrückte, verrußte Karosserie mit
// Knicken, Glassplittern und zwei Kettenabdrücken längs darüber. Nur Darstellung: einmal als Textur gezeichnet (Front nach rechts),
// liegt flach am Boden (Tiefe PLATT_TIEFE, ohne Schatten). Keine Zufallszahlen, alle Clients sehen dasselbe Bild.
export const PLATT_TIEFE = 1.06;   // wie die plattgefahrenen Autos der B11-Szene (client/szene_b11.mjs): unter Figuren und Fahrzeugen

// Zeichenfläche c (Canvas 2D) der Größe breit × hoch, Wrack mittig: 36 × 16 px Auto, breitgedrückt auf ~39 × 19 px
export function plattWrackZeichnen(c, breit, hoch) {
  const cx = breit / 2, cy = hoch / 2, hl = 19.5, hb = 9.5;
  const rund = (l, b, r) => { c.beginPath(); c.roundRect(cx - l, cy - b, 2 * l, 2 * b, r); };
  // Ölfleck/Ruß darunter
  c.fillStyle = 'rgba(12,9,6,.45)'; c.beginPath(); c.ellipse(cx, cy, hl + 3, hb + 3, 0, 0, Math.PI * 2); c.fill();
  // flachgedrückte Karosserie: ausgefranster Umriss (feste Zacken)
  c.fillStyle = '#2b2a29';
  c.beginPath();
  const n = 22;
  for (let i = 0; i < n; i++) {
    const a = i / n * Math.PI * 2, z = 1 + 0.08 * (((i * 7919) % 13) / 13 - 0.5);
    const x = cx + Math.cos(a) * hl * z, y = cy + Math.sin(a) * hb * z;
    if (i) c.lineTo(x, y); else c.moveTo(x, y);
  }
  c.closePath(); c.fill();
  rund(hl - 2, hb - 2, 5); c.fillStyle = '#3d3a37'; c.fill();
  rund(hl - 4, hb - 3.5, 4); c.fillStyle = '#4a3f36'; c.fill();                       // verbrannter Lack
  rund(7, hb - 3, 3); c.fillStyle = 'rgba(0,0,0,.45)'; c.fill();                      // eingedrückte Fahrgastzelle
  // Knicke quer
  c.strokeStyle = 'rgba(0,0,0,.7)'; c.lineWidth = 1;
  for (const [x1, x2] of [[-12, -9], [-2, 1], [9, 12]]) { c.beginPath(); c.moveTo(cx + x1, cy - hb + 2); c.lineTo(cx + x2, cy + hb - 2); c.stroke(); }
  c.strokeStyle = 'rgba(255,255,255,.12)';
  for (const [x1, x2] of [[-7, -5], [5, 7]]) { c.beginPath(); c.moveTo(cx + x1 + 1, cy - hb + 2); c.lineTo(cx + x2 + 1, cy + hb - 2); c.stroke(); }
  // Glassplitter und Rostflecken an festen Stellen
  c.fillStyle = 'rgba(207,216,220,.85)';
  for (let i = 0; i < 7; i++) c.fillRect(cx - 15 + i * 5 + ((i * 37) % 5) - 2, cy - 6 + ((i * 53) % 13), 1.6, 1.2);
  c.fillStyle = 'rgba(120,60,20,.5)';
  for (let i = 0; i < 6; i++) c.fillRect(cx - 14 + ((i * 7919 + 13) % 997) / 997 * 28, cy - 6 + ((i * 4177 + 5) % 991) / 991 * 12, 2.5, 2.5);
  // Kettenabdrücke längs (der Panzer fuhr in Fahrzeugrichtung darüber)
  c.fillStyle = 'rgba(20,17,14,.38)';
  for (const v of [-6, 4]) { c.fillRect(cx - hl - 2, cy + v, 2 * hl + 4, 2.5); for (let x = -hl; x < hl; x += 3) c.fillRect(cx + x, cy + v - 0.5, 1, 3.5); }
}

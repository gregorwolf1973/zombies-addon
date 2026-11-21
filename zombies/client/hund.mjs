// Begleiter-Hund im Client: Bildwahl (Richtung/Laufbild), Größe im richtigen Verhältnis zu den Figuren, Darstellung der Hunde aus state.hunde.
// Grafik: „Top-down Dog + Simple Animation“ von harrison-lord (OpenGameArt, CC-BY 3.0), grafik/hund.webp + hund.json.
// Der Bogen hat 4 Spalten (Richtung: oben, rechts, unten, links) und 6 Zeilen (Laufbilder); Bild = zeile * 4 + spalte.

export const HUND_RICHTUNGEN = 4, HUND_BILDER = 6;
// Schulterbreite der Menschen auf dem Bildschirm bei Größe 100 % (client/groessen.mjs: 25,7 px × Maßstab 0,42); der Hund ist echt etwa doppelt so lang wie ein Mensch breit
export const SCHULTER_PX = 25.7 * 0.42;
export const HUND_LAUFSCHRITT = 10;   // so viele Pixel Weg je Laufbild

// Winkel (Bogenmaß, 0 = rechts, y nach unten) -> Spalte 0 oben, 1 rechts, 2 unten, 3 links; die bisherige Richtung bleibt bis ~54° Abweichung (kein Flackern)
export function hundRichtung(winkel, alt = null) {
  const mitte = [-Math.PI / 2, 0, Math.PI / 2, Math.PI];
  const diff = (a, b) => { let d = Math.abs(a - b) % (2 * Math.PI); if (d > Math.PI) d = 2 * Math.PI - d; return d; };
  if (alt != null && diff(winkel, mitte[alt]) < 0.95) return alt;
  let best = 0, bd = 9;
  for (let i = 0; i < 4; i++) { const d = diff(winkel, mitte[i]); if (d < bd) { bd = d; best = i; } }
  return best;
}

// Bildnummer im Bogen; im Stand das erste Laufbild
export function hundBild(richtung, laeuft, lauf = 0) {
  const zeile = laeuft ? Math.floor(Math.max(0, lauf) / HUND_LAUFSCHRITT) % HUND_BILDER : 0;
  return zeile * HUND_RICHTUNGEN + richtung;
}

// Skalierung: Hundelänge = 2 × Schulterbreite × mg (mg = Menschengröße × Gesamtgröße, dieselbe Formel wie die Figuren); laenge = Hundelänge im Bogen in px
export function hundSkala(mg, laenge) { return 2 * SCHULTER_PX * mg / Math.max(1, laenge); }

// Hund des Spielers `id` (Besitzer) in state.hunde, sonst null
export function eigenerHund(hunde, id) {
  if (!hunde || !id) return null;
  for (const h of hunde.values()) if (h.besitzer === id) return h;
  return null;
}

// Darstellung aller Hunde (Phaser); `szene` liefert add, tweens, time, aktEbene
export class HundAnzeige {
  constructor(szene, json) {
    this.szene = szene; this.json = json ?? { zelle: 100, laenge: 68 };
    this.objekte = new Map();   // Hund-ID -> { bild, x, y, richtung, lauf }
  }

  aktualisieren(hunde, dt, mg, ebene, sicht) {
    const sz = this.szene, glatt = Math.min(1, dt * 12), skala = hundSkala(mg, this.json.laenge);
    for (const [id, h] of hunde ?? []) {
      let o = this.objekte.get(id);
      if (!o) {
        const bild = sz.add.image(h.x, h.y, 'hund', 0).setDepth(3.4).setTint(0xd09a62);   // warmes Braun: hebt sich von Asphalt und Wiese ab (Vorlage ist blaugrau)
        o = { bild, x: h.x, y: h.y, richtung: hundRichtung(h.richtung ?? 0), lauf: 0 };
        this.objekte.set(id, o);
      }
      const x0 = o.x, y0 = o.y;
      o.x += (h.x - o.x) * glatt; o.y += (h.y - o.y) * glatt;
      if (Math.hypot(h.x - o.x, h.y - o.y) > 150) { o.x = h.x; o.y = h.y; o.lauf = 0; }   // Sprung (Teleport, Haus): nicht gleiten
      const weg = Math.hypot(o.x - x0, o.y - y0);
      o.lauf += weg;
      o.richtung = hundRichtung(h.richtung ?? 0, o.richtung);
      const laeuft = !!h.laeuft && weg > 0.05;
      // Winseln: kurzes Zittern
      const zittern = h.winselt ? Math.sin(sz.time.now / 28) * 1.2 : 0;
      o.bild.setFrame(hundBild(o.richtung, laeuft, o.lauf)).setScale(skala).setPosition(o.x + zittern, o.y);
      const sichtbar = (h.ebene ?? '') === (ebene ?? '') && (!sicht || (o.x >= sicht.x0 && o.x <= sicht.x1 && o.y >= sicht.y0 && o.y <= sicht.y1));
      o.bild.setVisible(sichtbar);
    }
    for (const [id, o] of this.objekte) if (!hunde?.has(id)) { o.bild.destroy(); this.objekte.delete(id); }
  }
}

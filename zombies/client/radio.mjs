// Radio-Gegenstand (Lockmittel) auf dem Boden: kleines Radio mit Schallwellen, solange es spielt; danach grau (kaputt).
// Der Server schickt 'radio' (einzeln), 'radios' (alle, alle 10 s) und 'radioWeg'; hier wird gezeichnet und der Ton gelenkt.
import * as ton from './ton.mjs';

export const RADIO_HOERWEITE = 900;   // px, so weit ist es zu hören

export class RadioAnzeige {
  constructor(scene) {
    this.scene = scene;
    this.liste = new Map();   // id → { x, y, ebene, aus, bis (ms, Szenenzeit), h (Tonhandle) }
    this.gfx = scene.add.graphics().setDepth(4.2);
  }

  setze(m) {
    const jetzt = this.scene.time.now;
    const alt = this.liste.get(m.id) ?? {};
    this.liste.set(m.id, { ...alt, x: m.x, y: m.y, ebene: m.ebene ?? '', aus: !!m.aus, bis: jetzt + (m.rest ?? 0) * 1000 });
    if (m.aus && alt.h) { ton.sireneStoppen(alt.h); this.liste.get(m.id).h = null; }
  }

  alle(m) {
    const ids = new Set((m.liste ?? []).map(q => q.id));
    for (const id of [...this.liste.keys()]) if (!ids.has(id)) this.weg({ id });
    for (const q of m.liste ?? []) this.setze(q);
  }

  weg(m) {
    const q = this.liste.get(m.id);
    if (q?.h) ton.sireneStoppen(q.h);
    this.liste.delete(m.id);
  }

  // jedes Bild: zeichnen, Ton nach Entfernung zum Zuhörer lenken
  update(ebene, hx, hy) {
    const g = this.gfx.clear(), t = this.scene.time.now / 1000;
    for (const q of this.liste.values()) {
      const hier = q.ebene === ebene;
      if (!q.aus && !q.h && hier) q.h = ton.radioStarten();
      if (q.h) ton.sireneLage(q.h, q.x, q.y, 0, RADIO_HOERWEITE, !hier || q.aus);
      if (!hier) continue;
      g.fillStyle(0x000000, 0.3).fillEllipse(q.x + 1, q.y + 5, 15, 6);
      const farbe = q.aus ? 0x6b6b6b : 0x2d5da8;
      g.fillStyle(0x222222, 1).fillRoundedRect(q.x - 7, q.y - 5, 14, 10, 2);
      g.fillStyle(farbe, 1).fillRoundedRect(q.x - 6, q.y - 4, 12, 8, 1.5);
      g.fillStyle(0xd8d8c8, 1).fillCircle(q.x - 2.5, q.y, 2.4);
      g.fillStyle(0x222222, 1).fillCircle(q.x - 2.5, q.y, 1.1);
      g.fillStyle(0xd8d8c8, 1).fillRect(q.x + 1, q.y - 3, 4, 1).fillRect(q.x + 1, q.y - 1, 4, 1);
      g.lineStyle(1, 0x222222, 1).lineBetween(q.x + 4, q.y - 5, q.x + 9, q.y - 11);   // Antenne
      if (q.aus) { g.lineStyle(1.5, 0xc62828, 1).lineBetween(q.x - 6, q.y - 4, q.x + 6, q.y + 4).lineBetween(q.x - 6, q.y + 4, q.x + 6, q.y - 4); continue; }
      for (let i = 0; i < 3; i++) {   // Schallwellen: laufen nach außen und blenden aus
        const k = ((t * 0.9 + i / 3) % 1), r = 8 + k * 26;
        g.lineStyle(1.6, 0xffe08a, (1 - k) * 0.85).beginPath().arc(q.x, q.y - 1, r, -Math.PI * 0.8, -Math.PI * 0.2).strokePath();
        g.beginPath().arc(q.x, q.y - 1, r, Math.PI * 0.2, Math.PI * 0.8).strokePath();
      }
    }
  }
}

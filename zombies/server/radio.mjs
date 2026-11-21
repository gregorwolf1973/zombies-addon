// Radio als Lockmittel: „Benutzen“ schaltet es ein und stellt es vor die Füße. Es spielt RADIO.dauer Sekunden Musik/Rauschen
// und macht dabei alle RADIO.takt Sekunden weithin Lärm (laerm mit großer Weite): normale Zombies laufen hin, die Horde
// (welle.laermHoeren, Schwelle weite >= 600) kann umgelenkt werden. Danach ist das Radio kaputt und liegt noch kurz da.
import { dingId, nimmEins } from '../client/stapel.mjs';
import { frei } from '../client/welt.mjs';

export const RADIO = { dauer: 75, takt: 4, weite: 700, kaputt: 25, abstand: 22 };

export class Radios {
  constructor(raum) {
    this.raum = raum;
    this.liste = [];   // { id, x, y, ebene, t, laermT, aus, kaputtT, von }
    this.naechste = 1;
    this.syncT = 0;
  }

  // Nachricht 'benutze' mit einem Radio im Rucksack (Platz i): einschalten und ablegen; false = geht gerade nicht
  aufstellen(client, i) {
    const r = this.raum, p = r.state.spieler.get(client.sessionId);
    if (!p || p.unten || p.zombie > 0 || p.aktion || r.state.phase !== 'spiel' || dingId(p.rucksack[i]) !== 'radio') return false;
    const welt = r.wv(p.ebene);
    let x = p.x + Math.cos(p.richtung) * RADIO.abstand, y = p.y + Math.sin(p.richtung) * RADIO.abstand;
    if (!frei(welt, x, y, 4)) { x = p.x; y = p.y; }
    nimmEins(p.rucksack, i);
    const radio = { id: 'r' + this.naechste++, x, y, ebene: p.ebene ?? '', t: 0, laermT: 0, aus: false, kaputtT: 0, von: p.name };
    this.liste.push(radio);
    r.broadcast('radio', this.paket(radio));
    return true;
  }

  paket(q) { return { id: q.id, x: Math.round(q.x), y: Math.round(q.y), ebene: q.ebene, rest: Math.max(0, RADIO.dauer - q.t), aus: q.aus }; }

  schritt(dt) {
    if (!this.liste.length) return;
    const r = this.raum;
    for (let n = this.liste.length - 1; n >= 0; n--) {
      const q = this.liste[n];
      if (q.aus) {
        q.kaputtT += dt;
        if (q.kaputtT >= RADIO.kaputt) { this.liste.splice(n, 1); r.broadcast('radioWeg', { id: q.id }); }
        continue;
      }
      q.t += dt;
      q.laermT -= dt;
      if (q.laermT <= 0) { q.laermT = RADIO.takt; r.laerm(q.x, q.y, RADIO.weite, true, q.ebene); }
      if (q.t >= RADIO.dauer) { q.aus = true; r.broadcast('radio', this.paket(q)); }
    }
    // für später Beigetretene: alle 10 s der Stand aller Radios
    this.syncT -= dt;
    if (this.syncT <= 0) { this.syncT = 10; r.broadcast('radios', { liste: this.liste.map(q => this.paket(q)) }); }
  }
}

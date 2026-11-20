// Glättung fremder Figuren (Zombies, Mitspieler, Bewohner).
// Der Server schickt etwa 10× je Sekunde Positionen, dazu seine Uhr state.takt (ms). Der Client zeigt alles um eine kleine,
// sich selbst anpassende Verzögerung versetzt und bewegt die Figuren dazwischen gleichmäßig – so fallen ungleichmäßig
// ankommende Pakete (WLAN, Mobilfunk, Paketverlust) kaum noch auf. Reißt der Strom ab, rechnet er kurz weiter und bleibt dann stehen.

const SPUR_MAX = 12;          // so viele Stände je Figur
const WEITER_MAX = 120;       // ms: so lange über den letzten Stand hinaus weiterrechnen
const SPRUNG = 200;           // px: größere Sprünge zwischen zwei Ständen (Ebenenwechsel, Teleport) nicht gleiten
export const VERZ_MIN = 110, VERZ_MAX = 450;

export class NetzPuffer {
  constructor() {
    this.spuren = new Map();
    this.versatz = null;      // Server-Uhr minus eigene Uhr beim schnellsten Paket
    this.schwank = 30;        // wie viel später als das schnellste Pakete gerade ankommen (ms, geglättet)
    this.abstand = 100;       // Abstand der Server-Stände (ms, geglättet)
    this.verz = 180;          // aktuelle Anzeigeverzögerung (ms)
    this.letzterTakt = -1;
  }

  // nach jedem neuen Zustand vom Server; true = neuer Stand (dann die Positionen mit merke() eintragen)
  patch(takt, jetzt) {
    if (typeof takt !== 'number' || takt === this.letzterTakt) return false;
    if (this.letzterTakt >= 0 && takt > this.letzterTakt) this.abstand += (Math.min(500, takt - this.letzterTakt) - this.abstand) * 0.1;
    if (takt < this.letzterTakt) this.versatz = null;   // Server neu gestartet
    this.letzterTakt = takt;
    const o = takt - jetzt;
    if (this.versatz === null || o > this.versatz) this.versatz = o;   // das schnellste Paket bestimmt den Versatz
    else this.versatz += (o - this.versatz) * 0.002;                    // langsam nachziehen (Uhren laufen leicht auseinander)
    const spaet = this.versatz - o;
    this.schwank += (spaet - this.schwank) * (spaet > this.schwank ? 0.3 : 0.02);   // schnell hoch, langsam wieder runter
    const ziel = Math.max(VERZ_MIN, this.abstand * 1.2, Math.min(VERZ_MAX, this.abstand + this.schwank * 1.5));
    this.verz += (ziel - this.verz) * 0.1;
    return true;
  }

  merke(id, x, y, takt) {
    let s = this.spuren.get(id);
    if (!s) this.spuren.set(id, s = []);
    const l = s[s.length - 1];
    if (l && l.t >= takt) { if (l.t === takt) { l.x = x; l.y = y; } return; }
    s.push({ t: takt, x, y });
    if (s.length > SPUR_MAX) s.shift();
  }

  vergiss(id) { this.spuren.delete(id); }

  // Anzeigezeit in Server-Uhr (null = noch kein Stand)
  zeit(jetzt) { return this.versatz === null ? null : jetzt + this.versatz - this.verz; }

  // Position zur Anzeigezeit rt in ziel schreiben; false = keine Daten
  pos(id, rt, ziel) {
    const s = this.spuren.get(id);
    if (!s || !s.length || rt === null) return false;
    const n = s.length, last = s[n - 1];
    if (rt >= last.t) {
      if (n >= 2) {
        const a = s[n - 2], dtv = last.t - a.t, ex = Math.min(rt - last.t, WEITER_MAX);
        if (dtv > 0 && dtv < 400 && Math.hypot(last.x - a.x, last.y - a.y) < SPRUNG * 0.4) {
          ziel.x = last.x + (last.x - a.x) / dtv * ex; ziel.y = last.y + (last.y - a.y) / dtv * ex;
          return true;
        }
      }
      ziel.x = last.x; ziel.y = last.y;
      return true;
    }
    if (rt <= s[0].t) { ziel.x = s[0].x; ziel.y = s[0].y; return true; }
    for (let i = n - 1; i > 0; i--) {
      const a = s[i - 1];
      if (rt < a.t) continue;
      const b = s[i];
      if (Math.hypot(b.x - a.x, b.y - a.y) > SPRUNG) { ziel.x = b.x; ziel.y = b.y; return true; }
      const k = (rt - a.t) / (b.t - a.t);
      ziel.x = a.x + (b.x - a.x) * k; ziel.y = a.y + (b.y - a.y) * k;
      return true;
    }
    ziel.x = last.x; ziel.y = last.y;
    return true;
  }
}

// Laufende Nummer n liegt nach der bestätigten Nummer ack (16 Bit mit Überlauf)
export const nachSeq = (n, ack) => { const d = (n - ack) & 0xffff; return d > 0 && d < 0x8000; };

// Richtung aus 256 Stufen (Server: rq) in Bogenmaß
export const ausStufe = q => q * (Math.PI * 2 / 256);

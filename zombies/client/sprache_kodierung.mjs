// Kodierung für den Ausweichweg der Sprachübertragung über den Server (reine Funktionen, ohne Browser testbar).
// Paket vom Client zum Server:   [Format 1 B][laufende Nummer 2 B, big endian][Nutzdaten]
// Paket vom Server zum Empfänger: [Absender-Nr. 1 B][Format 1 B][laufende Nummer 2 B][Nutzdaten]
export const FORMAT_OPUS = 0, FORMAT_MULAW = 1;
export const PAKET_MAX = 2048;          // größtes Paket in Bytes (Server verwirft mehr)
export const KOPF = 3;                  // Länge des Paketkopfs
export const OPUS_RATE = 16000, OPUS_RAHMEN = 320;       // 20 ms bei 16 kHz
export const MULAW_RATE = 8000, MULAW_RAHMEN = 320;      // 40 ms bei 8 kHz → 320 Bytes (64 kbit/s)

export function paketBauen(format, nr, nutz) {
  const p = new Uint8Array(KOPF + nutz.length);
  p[0] = format; p[1] = (nr >> 8) & 255; p[2] = nr & 255;
  p.set(nutz, KOPF);
  return p;
}
// → { format, nr, nutz } oder null bei Fehlerrahmen (zu kurz, unbekanntes Format, keine Nutzdaten)
export function paketLesen(bytes, ab = 0) {
  if (!bytes || bytes.length < ab + KOPF + 1) return null;
  const format = bytes[ab];
  if (format !== FORMAT_OPUS && format !== FORMAT_MULAW) return null;
  return { format, nr: (bytes[ab + 1] << 8) | bytes[ab + 2], nutz: bytes.subarray(ab + KOPF) };
}
// Reihenfolge laufender Nummern (16 Bit, mit Überlauf): ist b neuer als a?
export const neuerAls = (b, a) => b !== a && ((b - a) & 0xffff) < 0x8000;
// Server → Empfänger: Absender-Nr. voranstellen
export function relaisPaket(absenderNr, paket) {
  const r = new Uint8Array(paket.length + 1);
  r[0] = absenderNr & 255; r.set(paket, 1);
  return r;
}

// ---- G.711 μ-law ----
const BIAS = 0x84, KLEMME = 32635;
export function mulawByte(f) {
  let s = Math.max(-1, Math.min(1, Number.isFinite(f) ? f : 0)) * 32768;
  const vorz = s < 0 ? 0x80 : 0;
  if (s < 0) s = -s;
  if (s > KLEMME) s = KLEMME;
  s += BIAS;
  let exp = 7;
  for (let m = 0x4000; (s & m) === 0 && exp > 0; m >>= 1) exp--;
  const mant = (s >> (exp + 3)) & 0x0f;
  return ~(vorz | (exp << 4) | mant) & 0xff;
}
export function mulawFloat(b) {
  b = ~b & 0xff;
  const exp = (b >> 4) & 7, mant = b & 15;
  const s = (((mant << 3) + BIAS) << exp) - BIAS;
  return ((b & 0x80) ? -s : s) / 32768;
}
export function mulawKodieren(floats) {
  const o = new Uint8Array(floats.length);
  for (let i = 0; i < floats.length; i++) o[i] = mulawByte(floats[i]);
  return o;
}
export function mulawDekodieren(bytes) {
  const o = new Float32Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) o[i] = mulawFloat(bytes[i]);
  return o;
}

// ---- Herunterrechnen (Mittelwert über das Quellfenster = einfacher Tiefpass), fortlaufend über Blöcke ----
export class Abtaster {
  constructor(von, nach) { this.schritt = von / nach; this.summe = 0; this.gewicht = 0; this.rest = this.schritt; }
  // nimmt Float32-Block mit Rate "von", liefert Float32Array mit Rate "nach"
  push(eingang) {
    const aus = [];
    for (let i = 0; i < eingang.length; i++) {
      let nochDa = 1;
      while (nochDa > 0) {
        const nimm = Math.min(nochDa, this.rest);
        this.summe += eingang[i] * nimm; this.gewicht += nimm;
        this.rest -= nimm; nochDa -= nimm;
        if (this.rest <= 1e-9) { aus.push(this.summe / this.gewicht); this.summe = 0; this.gewicht = 0; this.rest = this.schritt; }
      }
    }
    return Float32Array.from(aus);
  }
}

// Code des AudioWorklets (Mikrofon → Blöcke an den Hauptthread); als Blob-URL geladen
export const WORKLET_CODE = `class SpracheAufnahme extends AudioWorkletProcessor {
  process(eingaenge) { const k = eingaenge[0]?.[0]; if (k && k.length) this.port.postMessage(k.slice(0)); return true; }
}
registerProcessor('sprache-aufnahme', SpracheAufnahme);`;

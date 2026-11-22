// Netzposition getrennt von der Rechenposition.
// Der Server rechnet mit Kommazahlen (z.x += 0.37 …); ein int16-Feld im Schema gilt aber schon bei jeder Zuweisung eines anderen
// Werts als geändert (auch wenn es auf dieselben ganzen Pixel rundet (abgeschnitten wie bisher auf der Leitung)) und geht dann in den Patch. entkoppeln() ersetzt die
// Zugriffsmethoden der Felder: Schreiben merkt sich nur den genauen Wert, Lesen liefert ihn zurück. Ins Schema (und damit auf die
// Leitung) kommt er erst durch netzKopie(), das SpielRaum.netzAbgleich() vor jedem Versand aufruft: nur als ganze Zahl und nur,
// wenn er um mindestens `schwelle` Pixel vom bisher gesendeten abweicht. Große Sprünge (Spawn, Teleport, Ebenenwechsel) gehen sofort durch,
// damit ein neu Hinzukommender nie kurz bei (0, 0) steht.
export const SPRUNG_SOFORT = 48;
const ORIG = Symbol('schemaZugriff');
const SYM = new Map();
const roh = f => { let s = SYM.get(f); if (!s) SYM.set(f, s = Symbol('roh_' + f)); return s; };

export function entkoppeln(klass, felder) {
  const proto = klass.prototype;
  proto[ORIG] = { ...(proto[ORIG] ?? {}) };
  for (const feld of felder) {
    const orig = Object.getOwnPropertyDescriptor(proto, feld);
    if (!orig?.set || !orig.get) throw new Error('entkoppeln: kein Schema-Feld ' + feld);
    proto[ORIG][feld] = orig;
    const s = roh(feld);
    Object.defineProperty(proto, feld, {
      enumerable: true, configurable: true,
      get() { return this[s] ?? orig.get.call(this); },
      set(v) {
        this[s] = v;
        if (typeof v !== 'number' || !Number.isFinite(v)) { orig.set.call(this, v); return; }
        const alt = orig.get.call(this);
        if (alt === undefined || Math.abs(v - alt) >= SPRUNG_SOFORT) orig.set.call(this, Math.floor(v));
      },
    });
  }
}

// Genauen Wert ins Schema übernehmen, wenn er sich um mindestens `schwelle` Pixel vom gesendeten unterscheidet; true = kopiert
export function netzKopie(o, felder, schwelle = 1) {
  let kopiert = false;
  for (const feld of felder) {
    const v = o[roh(feld)];
    if (typeof v !== 'number' || !Number.isFinite(v)) continue;
    const orig = o[ORIG][feld];
    const alt = orig.get.call(o);
    if (alt === undefined || Math.abs(v - alt) >= schwelle) { orig.set.call(o, Math.floor(v)); kopiert = true; }
  }
  return kopiert;
}

// Gesendeter (ganzzahliger) Wert, wie ihn der Client sieht (für Tests und Messungen)
export function netzWert(o, feld) { return o[ORIG][feld].get.call(o); }

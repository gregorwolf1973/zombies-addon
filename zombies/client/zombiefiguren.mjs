// Neue Zombie-Figuren (Mixamo, exakt von oben gerendert, Atlas grafik/zombies_<figur>.webp + zombies_neu.json, Bau: tools/mixamo/atlas_bauen.py).
// Reine Logik (ohne Phaser): welche Figur, welcher Clip, welche Bildnummer. Alter Zombiebogen bleibt als Rückfall (Backend „Neue Zombie-Figuren“).
// Figurenliste: EINZIGE Stelle für neue Figuren (plus Atlas grafik/zombies_<id>.webp + Eintrag in zombies_neu.json). Server (Auswahl beim Erzeugen)
// und Verwaltung (Zeile mit Häkchen, Vorschau, Anteil) lesen dieselbe Liste. anteil = empfohlener Anteil in %.
export const ZF_LISTE = [
  { id: 'warzombie', name: 'Soldat', anteil: 20 },
  { id: 'copzombie', name: 'Polizist', anteil: 10 },
  { id: 'zombiegirl', name: 'Frau', anteil: 25 },
  { id: 'yaku', name: 'Bürger', anteil: 25 },
  { id: 'romero', name: 'Ausgemergelter', anteil: 20 },
];
export const ZF_FIGUREN = ZF_LISTE.map(f => f.id);
// state.variante ab diesem Wert = Figur direkt (100 + Index in ZF_LISTE); darunter der alte Zombietyp 0–24
export const ZF_VARIANTE_AB = 100;
export const zfVariante = id => ZF_VARIANTE_AB + Math.max(0, ZF_FIGUREN.indexOf(id));
export const ZF_CLIPS = ['walk', 'run', 'idle', 'attack', 'neckbite', 'crawl', 'dying', 'tod2', 'tod3'];
// Sterbebewegungen (Mixamo „Zombie Dying“, „Falling Back Death“, „Dying“); fehlen tod2/tod3 im Atlas, gilt dying
export const ZF_TODE = ['dying', 'tod2', 'tod3'];
export const ZF_BILDER = 16;
// Maßstab je Atlas-Pixel relativ zu ZOMBIE_GROESSE (0,42): wie das bisherige Sprite zombie_hemd (0,699) mit der Figurengröße der Renderung (0,7)
export const ZF_GROESSE = 0.699 * 0.7;
// Weglänge (Spielpixel, 8 px = 1 m) je Schrittzyklus (16 Bilder)
export const ZF_SCHRITT = { walk: 13, run: 26, crawl: 9 };
// Zeit je Durchlauf (ms) der zeitgesteuerten Clips
export const ZF_DAUER = { idle: 2600, attack: 1100, neckbite: 1500, dying: 1400, tod2: 1700, tod3: 2200 };

// Zombietyp (state variante, Reihenfolge ZOMBIE_TYPEN) → Figur: Soldat (0) warzombie, Polizisten (20 streife, 21 wachtmeister) copzombie, Dirndl/Langhaar zombiegirl, Rest gemischt
export function zfFigur(variante) {
  const v = Math.max(0, Math.floor(Number(variante) || 0));
  if (v >= ZF_VARIANTE_AB) return ZF_FIGUREN[v - ZF_VARIANTE_AB] ?? ZF_FIGUREN[0];
  if (v === 0) return 'warzombie';
  if (v === 20 || v === 21) return 'copzombie';
  if (v === 1 || v === 24) return 'zombiegirl';
  return ['yaku', 'romero', 'warzombie', 'zombiegirl', 'yaku'][v % 5];
}

// Clip nach Zustand: { kriecht, jagt, geht (bewegt sich), nah (am Opfer), tot }
export function zfClip(z) {
  if (z.tot) return 'dying';
  if (z.kriecht) return 'crawl';
  if (z.nah) return 'attack';
  if (!z.geht) return 'idle';
  return z.jagt ? 'run' : 'walk';
}

// Angriff: abwechselnd Schlag und Biss in den Hals (je nach Durchlauf und Zombie-Hash h 0..1)
export function zfAngriff(zeitMs, h) {
  const durchlauf = Math.floor(zeitMs / (ZF_DAUER.attack + ZF_DAUER.neckbite) * 2 + h * 7);
  return durchlauf % 3 === 0 ? 'neckbite' : 'attack';
}

// Bildnummer 0..15: Gehen/Kriechen nach Weg (lauf in Pixeln, zs = Schrittfrequenz-Faktor), sonst nach Zeit
export function zfBild(clip, { lauf = 0, zs = 1, zeitMs = 0, versatz = 0, seit = 0 } = {}) {
  const n = ZF_BILDER;
  if (ZF_TODE.includes(clip)) return Math.max(0, Math.min(n - 1, Math.floor(seit / ZF_DAUER[clip] * n)));
  if (ZF_SCHRITT[clip]) return Math.floor(lauf * zs / ZF_SCHRITT[clip] * n) % n;
  const d = ZF_DAUER[clip] ?? 2000;
  return Math.floor(((zeitMs + versatz) / d) * n) % n;
}

// Leiche: Sterbebewegung, Zusatzdrehung (Bogenmaß 0..2π) und Spiegelung fest aus der Leichen-Id (gleich auf allen Geräten, nur Darstellung)
export function zfLeiche(id) {
  let h = 2166136261;
  const s = String(id ?? '');
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0; h = Math.imul(h ^ (h >>> 13), 3266489909) >>> 0; h = (h ^ (h >>> 16)) >>> 0;
  return { clip: ZF_TODE[h % 3], dreh: ((h >>> 8) % 360) * Math.PI / 180, spiegeln: ((h >>> 2) & 1) === 1 };
}

export const zfName = (fig, clip, i) => `${fig}_${clip}_${String(i).padStart(2, '0')}`;

// Einstellung bereinigen: { id: { an: bool, anteil: 0..100 } } für jede Figur der Liste (fehlend = an, empfohlener Anteil); mindestens eine bleibt an
export function zfFigurenEinst(e) {
  const r = {};
  for (const f of ZF_LISTE) {
    const q = e && typeof e === 'object' ? e[f.id] : null;
    const a = Number(q?.anteil);
    r[f.id] = { an: typeof q?.an === 'boolean' ? q.an : true, anteil: Number.isFinite(a) ? Math.max(0, Math.min(100, Math.round(a))) : f.anteil };
  }
  if (!Object.values(r).some(q => q.an)) r[ZF_LISTE[0].id].an = true;
  return r;
}

// Gewichtete Auswahl unter den aktiven Figuren (r = Zufallszahl 0..1, z. B. this.rnd()); Anteil 0 überall = gleich verteilt. Ergebnis: Figur-Id
export function zfWaehle(einst, r) {
  const e = zfFigurenEinst(einst);
  let aktiv = ZF_FIGUREN.filter(id => e[id].an);
  const gew = aktiv.map(id => aktiv.every(i => e[i].anteil <= 0) ? 1 : e[id].anteil);
  const summe = gew.reduce((a, b) => a + b, 0);
  let x = Math.max(0, Math.min(0.999999999, Number(r) || 0)) * summe;
  for (let i = 0; i < aktiv.length; i++) { if (x < gew[i]) return aktiv[i]; x -= gew[i]; }
  return aktiv[aktiv.length - 1];
}

// Neue Zombie-Figuren (Mixamo, exakt von oben gerendert, Atlas grafik/zombies_<figur>.webp + zombies_neu.json, Bau: tools/mixamo/atlas_bauen.py).
// Reine Logik (ohne Phaser): welche Figur, welcher Clip, welche Bildnummer. Alter Zombiebogen bleibt als Rückfall (Backend „Neue Zombie-Figuren“).
export const ZF_FIGUREN = ['warzombie', 'copzombie', 'zombiegirl', 'yaku', 'romero'];
export const ZF_CLIPS = ['walk', 'run', 'idle', 'attack', 'neckbite', 'crawl', 'dying'];
export const ZF_BILDER = 16;
// Maßstab je Atlas-Pixel relativ zu ZOMBIE_GROESSE (0,42): wie das bisherige Sprite zombie_hemd (0,699) mit der Figurengröße der Renderung (0,7)
export const ZF_GROESSE = 0.699 * 0.7;
// Weglänge (Spielpixel, 8 px = 1 m) je Schrittzyklus (16 Bilder)
export const ZF_SCHRITT = { walk: 13, run: 26, crawl: 9 };
// Zeit je Durchlauf (ms) der zeitgesteuerten Clips
export const ZF_DAUER = { idle: 2600, attack: 1100, neckbite: 1500, dying: 1400 };

// Zombietyp (state variante, Reihenfolge ZOMBIE_TYPEN) → Figur: Soldat (0) warzombie, Polizisten (20 streife, 21 wachtmeister) copzombie, Dirndl/Langhaar zombiegirl, Rest gemischt
export function zfFigur(variante) {
  const v = Math.max(0, Math.floor(Number(variante) || 0));
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
  if (clip === 'dying') return Math.max(0, Math.min(n - 1, Math.floor(seit / ZF_DAUER.dying * n)));
  if (ZF_SCHRITT[clip]) return Math.floor(lauf * zs / ZF_SCHRITT[clip] * n) % n;
  const d = ZF_DAUER[clip] ?? 2000;
  return Math.floor(((zeitMs + versatz) / d) * n) % n;
}

export const zfName = (fig, clip, i) => `${fig}_${clip}_${String(i).padStart(2, '0')}`;

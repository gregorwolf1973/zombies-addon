// Weiche Rauchteilchen: ein Bild mit weich auslaufendem Farbverlauf (Radialverlauf) statt eines harten Kreises → feiner, nicht grobkörnig.
// Das Bild hat 64 px Durchmesser; weichKreis() setzt es auf den Radius r (Welt-px), Farbe und Deckkraft. Tweens mit `scale` sind relativ zu k.scale zu formulieren.
export const WEICH_SCHLUESSEL = 'weichrauch';
export function weichTextur(scene) {
  if (scene.textures.exists(WEICH_SCHLUESSEL)) return;
  const t = scene.textures.createCanvas(WEICH_SCHLUESSEL, 64, 64), c = t.getContext(), g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,0.9)'); g.addColorStop(0.35, 'rgba(255,255,255,0.55)'); g.addColorStop(0.7, 'rgba(255,255,255,0.15)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = g; c.fillRect(0, 0, 64, 64); t.refresh();
}
// Bild-Skala für den Radius r (der Verlauf reicht bis zum Rand, sichtbar ist ~70 % davon → r wird entsprechend vergrößert)
export const weichSkala = r => r * 2 * 1.3 / 64;
export function weichKreis(scene, x, y, r, farbe, alpha = 1) {
  weichTextur(scene);
  return scene.add.image(x, y, WEICH_SCHLUESSEL).setTint(farbe).setAlpha(alpha).setScale(weichSkala(r));
}

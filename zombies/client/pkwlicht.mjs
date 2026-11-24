// Licht der von Spielern gefahrenen Autos (Darstellung: client/pkwdarstellung.mjs, Nachtdecke: spiel.mjs aussenLicht):
// nachts (Dämmerung wie bei der Taschenlampe: dunkel ≥ 0,3) mit Fahrer zwei Scheinwerferkegel nach vorn, rote Rücklichter,
// beim Rückwärtsfahren weiße Rückfahrlichter. Ein ausgebranntes Auto (art 'wrack') hat nie Licht.
import { helligkeit } from './welt.mjs';

export const PKW_LICHT_DUNKEL = 0.3;
export const dunkelVon = uhr => 1 - helligkeit(uhr ?? 480);

// Licht an? f = Fahrzeug aus state.fahrzeuge, fahrer = sitzt jemand drin, dunkel 0…1
// Taschenlampe leuchtet nur zu Fuß: wer in einem Fahrzeug sitzt (Auto, Streifenwagen, Boxer/Puma/Leopard, Evakuierung), hat keinen Kegel und keine Lampe an der Figur (die Scheinwerfer übernehmen)
export const lampeAn = p => !!p && p.lampe > 0 && !p.imBoxer && !p.anBord;
export const pkwLichtAn = (f, fahrer, dunkel) => !!f && f.art === 'pkw' && !(f.leben <= 0) && !!fahrer && dunkel >= PKW_LICHT_DUNKEL;

// Rückwärts? Bewegung (dx, dy) in einem Bild gegen die Blickrichtung r (Bogenmaß), Tempo in px/s
export function pkwRueckwaerts(dx, dy, r, v) {
  if (!(v > 2)) return false;
  return dx * Math.cos(r) + dy * Math.sin(r) < 0;
}

// Lage der Lichter in Weltkoordinaten: Scheinwerfer an den Frontecken, Rücklichter an den Heckecken (Fahrzeug Länge l, Breite b)
export function pkwLichtPunkte(x, y, r, l, b) {
  const c = Math.cos(r), s = Math.sin(r), p = (u, v) => ({ x: x + c * u - s * v, y: y + s * u + c * v });
  return { vorn: [p(l / 2, -b * 0.3), p(l / 2, b * 0.3)], hinten: [p(-l / 2, -b * 0.3), p(-l / 2, b * 0.3)] };
}

// Scheinwerferkegel in die Nachtdecke schneiden (gleicher Pinsel wie die Taschenlampe: `lampe`-Bild, Ursprung links), je Auto zwei Kegel
// leicht nach außen gespreizt, ein Rest-Schein hinten (Rücklicht). kegel(ziel, x, y, winkel, alpha) = scene.pkwKegel
export function pkwKegelZeichnen(rt, ox, oy, pinsel, weich, licht) {
  const { punkte, r, rueck } = licht;
  for (const p of punkte.vorn) {
    pinsel.setRotation(r).setScale(1.3).setAlpha(0.9);
    rt.erase(pinsel, p.x - ox, p.y - oy);
  }
  for (const p of punkte.hinten) {
    weich.setScale(rueck ? 0.22 : 0.12).setAlpha(rueck ? 0.55 : 0.3);
    rt.erase(weich, p.x - ox, p.y - oy);
  }
}

// Rücklichter/Rückfahrlichter als Grafik im Fahrzeug-Container (lokale Koordinaten, Front nach +x)
export function pkwLampenMalen(g, l, b, rueck) {
  for (const v of [-1, 1]) {
    g.fillStyle(0xff1744, 0.28).fillCircle(-l / 2 + 1, v * b * 0.3, 3.2);
    g.fillStyle(0xff1744, 1).fillCircle(-l / 2 + 1, v * b * 0.3, 1.5);
    if (rueck) {
      g.fillStyle(0xffffff, 0.35).fillCircle(-l / 2, v * b * 0.14, 3.4);
      g.fillStyle(0xffffff, 1).fillCircle(-l / 2 + 0.6, v * b * 0.14, 1.3);
    }
    g.fillStyle(0xfff3c0, 1).fillCircle(l / 2 - 1, v * b * 0.3, 1.5);   // Scheinwerfer selbst leuchten
  }
}

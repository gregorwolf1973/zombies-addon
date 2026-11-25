// Kampfpanzer Leopard 2A7 – eigenes, vereinfachtes 3D-Modell aus Grundformen (tools/panzer_modell/teile.mjs), nur für die
// Draufsichten im Spiel (client/grafik/leopard_wanne.webp, leopard_turm.webp). Maße nach öffentlichen Eckdaten: Wanne 7,7 × 3,75 m,
// Turm mit keilförmiger Frontpanzerung, 120-mm-Glattrohrkanone L/55 (Gesamtlänge mit Rohr nach vorn ~10,9 m), Fahrer vorn rechts,
// Kommandant rechts, Ladeschütze mit MG links, Staukorb am Turmheck, Triebwerksdeck mit Kühlergittern hinten.
// Einheiten Meter; x = vorn, y = oben, z = rechts. Turm-Drehpunkt = Ursprung der Turm-Gruppe.
import { bausteine } from './teile.mjs';

// Bildausschnitte (Meter) und Auflösung (80/3 px je Meter: im Spiel 8 px/m bei Skala 0,3): Wanne 208 × 104 px um die Wannenmitte,
// Turm 266 × 96 px um den Drehpunkt; turmOrt = Drehpunkt relativ zur Wannenmitte (vorn, rechts). Werte in LEOPARD (client/evak.mjs).
export const RAHMEN = {
  px: 80 / 3,
  wanne: { x0: -3.9, x1: 3.9, z0: -1.95, z1: 1.95 },
  turm: { x0: -4.15, x1: 6.06, z0: -2.05, z1: 2.05 },   // 0,25 m Rand für den weichen Schatten (tools/panzer_bilder.py)
  turmOrt: [8.1 / 8, 0],
  // Lukenplätze im Turm-Rahmen (vorn, rechts), dort zeichnet das Spiel Kommandant und Ladeschütze
  kommandant: [-0.06, 0.75], lader: [-0.51, -0.94],
};

export function baue(THREE) {
  const B = bausteine(THREE, { tarnSeed: 12 }), M = B.mat;
  const wanne = new THREE.Group(), turm = new THREE.Group();
  const hl = 3.85, D = 1.75;   // halbe Länge, Deckhöhe

  // ---- Laufwerk: 7 Laufrollen je Seite, Kette 63,5 cm breit
  for (const s of [-1, 1]) B.kette(wanne, { x0: -3.5, x1: 3.5, z: s * 1.5, breite: 0.635, yOben: 0.95, r: 0.36, rollen: 7, rolleR: 0.35, glieder: 0.18 });

  // ---- Wanne: langer flacher Bugkeil, gerades Deck, abgeschrägte Heckkante
  wanne.add(B.profil(M.tarn, [[-hl, 0.62], [-3.6, 0.42], [3.35, 0.42], [hl, 0.95], [hl, 1.15], [2.55, D], [-3.72, D], [-hl, D - 0.12]], -1.22, 1.22));
  // Kettenabdeckungen links und rechts, etwas tiefer als das Deck
  for (const s of [-1, 1]) {
    const [z0, z1] = s < 0 ? [-1.68, -1.22] : [1.22, 1.68];
    wanne.add(B.profil(M.tarn, [[-hl, 1.22], [hl, 1.1], [hl, 1.2], [2.6, D - 0.1], [-3.8, D - 0.1]], z0, z1));
  }
  // Kettenschürzen: vorn schwere Panzerschürzen (drei Abschnitte), hinten leichtere Schürzen mit Gummilappen
  for (const s of [-1, 1]) {
    const zi = s * 1.66, za = s * 1.875;
    const schuerze = (a, b, yo, ya, schwer) => {
      wanne.add(B.koerper(M.tarn, [[a, 0.62, zi], [b, 0.62, zi], [b, 0.62, za], [a, 0.62, za]], [[a, yo, zi], [b, yo, zi], [b, yo - 0.04, za], [a, yo - 0.04, za]]));
      wanne.add(B.quader(M.schwarz, a - 0.012, a + 0.012, yo - 0.06, yo + 0.005, Math.min(zi, za), Math.max(zi, za)));
      if (schwer) for (const x of [a + 0.15, b - 0.15]) wanne.add(B.zyl(M.stahl, 0.04, 0.03, [x, yo, s * 1.77], 'y', 8));
    };
    for (const [a, b] of [[1.15, 1.95], [1.95, 2.75], [2.75, 3.55]]) schuerze(a, b, D - 0.02, 0, true);
    for (let a = -3.8; a < 1.1; a += 0.82) schuerze(a, Math.min(a + 0.82, 1.15), D - 0.14, 0, false);
    wanne.add(B.koerper(M.tarn, [[3.55, 0.75, zi], [3.8, 0.95, zi], [3.8, 0.95, za], [3.55, 0.75, za]], [[3.55, D - 0.02, zi], [3.8, 1.25, zi], [3.8, 1.25, za], [3.55, D - 0.02, za]]));   // Bugstück der Schürze
  }

  // ---- Bug: Fahrerluke vorn rechts mit Winkelspiegeln, Scheinwerfer, Abschleppösen, Schlepphaken
  B.luke(wanne, 2.25, 0.7, D - 0.02, 0.3);
  for (const dz of [-0.28, 0, 0.28]) B.spiegel(wanne, 2.68, 0.7 + dz, D - 0.12, dz);
  for (const s of [-1, 1]) {
    wanne.add(B.quader(M.dunkel, 3.25, 3.6, 1.2, 1.4, s * 1.0 - 0.16, s * 1.0 + 0.16));
    wanne.add(B.quader(M.glas, 3.6, 3.62, 1.23, 1.37, s * 1.0 - 0.12, s * 1.0 + 0.12));
    wanne.add(B.zyl(M.stahl, 0.08, 0.14, [hl + 0.03, 1.0, s * 0.55], 'z', 10));
  }
  for (let x = 2.8; x < 3.7; x += 0.3) wanne.add(B.quader(M.dunkel, x - 0.01, x + 0.01, D - (x - 2.55) * 0.48, D - (x - 2.55) * 0.48 + 0.012, -1.1, 1.1));   // Plattenfugen Bugkeil
  wanne.add(B.zyl(M.dunkel, 1.28, 0.04, [RAHMEN.turmOrt[0], D + 0.02, RAHMEN.turmOrt[1]], 'y', 56));   // Turmring

  // ---- Triebwerksdeck: Kühlergitter links und rechts, Wartungsklappen in der Mitte, Auspuffgitter hinten an den Seiten
  for (const s of [-1, 1]) {
    const [z0, z1] = s < 0 ? [-1.15, -0.3] : [0.3, 1.15];
    B.gitter(wanne, -3.55, -2.1, z0, z1, D + 0.01, false, 0.075);
    B.gitter(wanne, -1.95, -1.35, z0, z1, D + 0.01, true, 0.07);
    B.gitter(wanne, -hl + 0.02, -3.6, s < 0 ? -1.62 : 1.24, s < 0 ? -1.24 : 1.62, D - 0.08, false, 0.06);
  }
  wanne.add(B.quader(M.tarn, -3.55, -1.35, D, D + 0.05, -0.24, 0.24, 0.02));
  for (const x of [-2.9, -2.1]) wanne.add(B.quader(M.stahl, x - 0.12, x + 0.12, D + 0.05, D + 0.08, -0.03, 0.03));   // Griffe
  // Staukästen auf den hinteren Kettenabdeckungen, Abschleppseile längs der Kotflügel, Werkzeug
  for (const s of [-1, 1]) {
    const [z0, z1] = s < 0 ? [-1.62, -1.26] : [1.26, 1.62];
    B.kiste(wanne, -3.5, -2.55, D - 0.1, D + 0.25, z0, z1);
    B.kiste(wanne, -2.45, -1.75, D - 0.1, D + 0.2, z0, z1);
    wanne.add(B.zyl(M.stahl, 0.035, 2.6, [0.0, D - 0.06, s * 1.36], 'x', 8));
    wanne.add(B.zyl(M.stahl, 0.035, 2.6, [0.0, D - 0.06, s * 1.47], 'x', 8));
    for (const x of [-1.2, 1.2]) wanne.add(B.zyl(M.stahl, 0.06, 0.12, [x, D - 0.06, s * 1.415], 'x', 10));   // Seilösen
  }
  B.spaten(wanne, 0.35, -1.56, D - 0.06, 1.1);
  B.hacke(wanne, 0.4, 1.57, D - 0.06, 0.95);
  for (const s of [-1, 1]) wanne.add(B.quader(M.dunkel, -hl - 0.02, -hl + 0.1, 1.35, 1.55, s * 1.45 - 0.13, s * 1.45 + 0.13));   // Rückleuchten

  // ---- Turm (Ursprung = Drehpunkt)
  const T0 = D, T1 = D + 0.8;
  turm.add(B.prisma(M.tarn, [[-2.35, -1.5], [-1.2, -1.6], [1.25, -1.6], [1.25, 1.6], [-1.2, 1.6], [-2.35, 1.5]], T0, T1, 0.1));
  // Turmheck (Munitionsbunker) und Staukorb
  turm.add(B.prisma(M.tarn, [[-2.95, -1.3], [-2.3, -1.45], [-2.3, 1.45], [-2.95, 1.3]], T0 + 0.25, T1 - 0.08, 0.05));
  turm.add(B.quader(M.gitter, -3.85, -2.95, T0 + 0.25, T0 + 0.3, -1.42, 1.42));
  for (const z of [-1.42, 1.38]) turm.add(B.quader(M.stahl, -3.85, -2.95, T0 + 0.6, T0 + 0.64, z, z + 0.04));
  turm.add(B.quader(M.stahl, -3.88, -3.84, T0 + 0.6, T0 + 0.64, -1.42, 1.42));
  for (const z of [-1.0, -0.5, 0, 0.5, 1.0]) turm.add(B.quader(M.stahl, -3.88, -2.95, T0 + 0.3, T0 + 0.62, z - 0.012, z + 0.012));
  turm.add(B.zyl(M.plane, 0.2, 1.7, [-3.3, T0 + 0.5, -0.35], 'z', 16));   // eingerollte Plane
  B.kiste(turm, -3.75, -3.15, T0 + 0.3, T0 + 0.62, 0.65, 1.32, M.oliv);
  B.kanister(turm, -3.65, 0.25, T0 + 0.3, 0);
  B.kanister(turm, -3.65, 0.45, T0 + 0.3, 0);
  // Staukästen an den Turmseiten
  for (const s of [-1, 1]) turm.add(B.quader(M.tarn, -2.25, -0.35, T0 + 0.2, T1 - 0.12, s < 0 ? -1.78 : 1.58, s < 0 ? -1.58 : 1.78, 0.03));
  // Keilpanzerung vorn (Pfeilform), dazwischen die Kanonenblende
  const keil = s => B.prisma(M.tarn, [[1.2, s * 1.62], [2.05, s * 0.52], [2.05, s * 0.42], [1.2, s * 0.42]].map(([x, z]) => [x, z]), T0 + 0.12, (x) => T1 - 0.02 - (x - 1.2) * 0.32, 0.02);
  turm.add(keil(-1), keil(1));
  turm.add(B.quader(M.tarn, 1.05, 1.85, T0 + 0.25, T1 - 0.12, -0.4, 0.4, 0.05));
  // 120-mm-Kanone L/55: Wärmeschutzhülle, Rauchabsauger, Mündung mit Mündungsreferenzsystem
  const gy = T0 + 0.47;
  turm.add(B.zyl(M.oliv, 0.15, 0.5, [2.05, gy, 0], 'x', 20));
  turm.add(B.zyl(M.tarn, 0.105, 4.2, [4.0, gy, 0], 'x', 18));
  turm.add(B.zyl(M.oliv, 0.155, 0.6, [3.5, gy, 0], 'x', 20));
  for (const x of [2.7, 4.3, 5.1]) turm.add(B.zyl(M.dunkel, 0.112, 0.04, [x, gy, 0], 'x', 18));
  turm.add(B.zyl(M.dunkel, 0.115, 0.1, [6.01, gy, 0], 'x', 18));
  turm.add(B.quader(M.dunkel, 5.78, 5.92, gy + 0.08, gy + 0.16, -0.05, 0.05));
  // Luken: Kommandant rechts, Ladeschütze links (offen, dort stehen die Figuren), MG3 vor der Ladeschützenluke
  B.luke(turm, RAHMEN.kommandant[0], RAHMEN.kommandant[1], T1, 0.33, true);
  B.luke(turm, RAHMEN.lader[0], RAHMEN.lader[1], T1, 0.33, true);
  turm.add(B.zyl(M.dunkel, 0.03, 0.9, [RAHMEN.lader[0] + 0.75, T1 + 0.32, RAHMEN.lader[1]], 'x', 8));
  turm.add(B.quader(M.dunkel, RAHMEN.lader[0] + 0.2, RAHMEN.lader[0] + 0.45, T1 + 0.25, T1 + 0.38, RAHMEN.lader[1] - 0.06, RAHMEN.lader[1] + 0.06));
  // Optiken: Rundblickperiskop des Kommandanten, Hauptzielfernrohr des Richtschützen (vorn rechts)
  turm.add(B.zyl(M.tarn, 0.22, 0.3, [0.55, T1 + 0.15, 0.35], 'y', 20));
  turm.add(B.quader(M.dunkel, 0.33, 0.82, T1 + 0.3, T1 + 0.58, 0.17, 0.53, 0.03));
  turm.add(B.quader(M.glas, 0.82, 0.84, T1 + 0.35, T1 + 0.53, 0.22, 0.48));
  turm.add(B.quader(M.tarn, 0.55, 1.2, T1, T1 + 0.28, 0.88, 1.42, 0.04));
  turm.add(B.quader(M.glas, 1.2, 1.22, T1 + 0.05, T1 + 0.22, 0.95, 1.35));
  // Nebelwurfbecher, Windsensor, Antennenfüße, Kranösen, Dachplatten
  B.nebelwerfer(turm, 0.05, -1.68, T0 + 0.55, -1, 4, 0.13);
  B.nebelwerfer(turm, 0.05, 1.68, T0 + 0.55, 1, 4, 0.13);
  turm.add(B.zyl(M.dunkel, 0.03, 0.4, [-1.9, T1 + 0.2, 0.15], 'y', 8));
  turm.add(B.quader(M.dunkel, -1.98, -1.82, T1 + 0.38, T1 + 0.44, 0.0, 0.3));
  for (const s of [-1, 1]) { turm.add(B.zyl(M.dunkel, 0.07, 0.12, [-2.05, T1 + 0.05, s * 1.1], 'y', 10)); turm.add(B.zyl(M.schwarz, 0.012, 0.3, [-2.05, T1 + 0.25, s * 1.1], 'y', 6)); }
  for (const [x, z] of [[1.0, -1.35], [-1.9, -1.3], [-1.9, 0.9]]) turm.add(B.quader(M.stahl, x - 0.08, x + 0.08, T1, T1 + 0.08, z - 0.03, z + 0.03));
  for (const x of [-1.05, 0.35]) turm.add(B.quader(M.dunkel, x - 0.008, x + 0.008, T1, T1 + 0.006, -1.4, -0.2));
  turm.add(B.quader(M.tarn, -1.55, -0.95, T1, T1 + 0.04, -0.25, 0.4, 0.02));   // Lüfterdeckel

  B.tarnUV(wanne, [0, 0]); B.tarnUV(turm, [1.7, 2.4]);
  return { wanne, turm };
}

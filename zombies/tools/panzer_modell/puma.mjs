// Schützenpanzer Puma – eigenes, vereinfachtes 3D-Modell aus Grundformen (tools/panzer_modell/teile.mjs), nur für die Draufsichten
// im Spiel (client/grafik/puma_wanne.webp, puma_turm.webp). Maße nach öffentlichen Eckdaten: 7,3 × 3,7 m (Schutzstufe C mit
// Seitenschutzmodulen), Turm unbemannt, links hinter der Mitte, 30-mm-Maschinenkanone rechts im Turm, Startgerät links.
// Einheiten Meter; x = vorn, y = oben, z = rechts. Turm-Drehpunkt = Ursprung der Turm-Gruppe.
import { bausteine } from './teile.mjs';

// Bildausschnitte (Meter) und Auflösung: Wanne symmetrisch um die Wannenmitte (353 × 188 px), Turm um den Drehpunkt;
// turmOrt = Drehpunkt relativ zur Wannenmitte (vorn, rechts). Werte landen in PUMA_BILD (client/stuetzpunkt.mjs).
export const RAHMEN = {
  px: 48,
  wanne: { x0: -353 / 96, x1: 353 / 96, z0: -188 / 96, z1: 188 / 96 },
  turm: { x0: -1.55, x1: 3.64, z0: -1.41, z1: 1.31 },   // 0,25 m Rand für den weichen Schatten (tools/panzer_bilder.py)
  turmOrt: [-1.27, -0.42],
};

export function baue(THREE) {
  const B = bausteine(THREE, { tarnSeed: 31 }), M = B.mat;
  const wanne = new THREE.Group(), turm = new THREE.Group();
  const hl = 3.65, D = 2.0;   // halbe Länge, Dachhöhe

  // ---- Laufwerk (wird von Seitenschutz und Kotflügeln fast ganz verdeckt, vorn und hinten sichtbar)
  for (const s of [-1, 1]) B.kette(wanne, { x0: -3.3, x1: 3.25, z: s * 1.33, breite: 0.5, yOben: 0.98, r: 0.34, rollen: 6, rolleR: 0.32 });

  // ---- Wanne: Seitenprofil mit flachem Bugkeil und abgeschrägter Heckkante
  wanne.add(B.profil(M.tarn, [[-hl, 0.7], [-hl + 0.25, 0.42], [3.1, 0.42], [hl, 0.95], [hl, 1.22], [2.2, D], [-hl + 0.18, D], [-hl, D - 0.15]], -1.08, 1.08));
  // Wannenbreite über den Ketten (Kettenabdeckungen), etwas tiefer als das Dach
  for (const s of [-1, 1]) {
    const z0 = s < 0 ? -1.6 : 1.08, z1 = s < 0 ? -1.08 : 1.6;
    wanne.add(B.profil(M.tarn, [[-hl, 1.05], [hl - 0.25, 1.05], [hl, 1.18], [2.3, D - 0.08], [-hl + 0.15, D - 0.08], [-hl, D - 0.2]], z0, z1));
  }
  // Seitenschutzmodule (Schutzstufe C): dicke Platten in Abschnitten, oben leicht abgeschrägt
  const abschnitte = [[-3.55, -2.18], [-2.18, -0.8], [-0.8, 0.58], [0.58, 1.96], [1.96, 3.1]];
  for (const s of [-1, 1]) for (const [a, b] of abschnitte) {
    const zi = s * 1.6, za = s * 1.85;
    wanne.add(B.koerper(M.tarn, [[a, 0.55, zi], [b, 0.55, zi], [b, 0.55, za], [a, 0.55, za]], [[a, 1.86, zi], [b, 1.86, zi], [b, 1.8, za - s * 0.05], [a, 1.8, za - s * 0.05]]));
    for (const x of [a + 0.18, b - 0.18]) wanne.add(B.zyl(M.stahl, 0.035, 0.03, [x, 1.86, s * 1.72], 'y', 8));   // Befestigungsbolzen
    if (a > -3.5) wanne.add(B.quader(M.schwarz, a - 0.012, a + 0.012, 1.7, 1.87, Math.min(zi, za), Math.max(zi, za)));   // Fuge zum Nachbarmodul
  }
  // vorderer Kotflügel mit Schmutzfänger
  for (const s of [-1, 1]) wanne.add(B.koerper(M.tarn, [[3.1, 1.05, s * 1.6], [hl - 0.02, 0.95, s * 1.6], [hl - 0.02, 0.95, s * 1.84], [3.1, 1.05, s * 1.84]], [[3.1, 1.72, s * 1.6], [hl - 0.02, 1.15, s * 1.6], [hl - 0.02, 1.15, s * 1.84], [3.1, 1.72, s * 1.84]]));

  // ---- Bug: Fahrerluke vorn links mit Winkelspiegeln, Triebwerksdeck vorn rechts mit Gittern
  B.luke(wanne, 1.55, -0.72, D, 0.3);
  for (const dz of [-0.3, 0, 0.3]) B.spiegel(wanne, 1.98, -0.72 + dz, D, dz * 0.8);
  B.gitter(wanne, 0.55, 1.95, 0.12, 0.98, D + 0.01, true, 0.075);
  B.gitter(wanne, 0.55, 1.95, 1.12, 1.52, D - 0.07, false, 0.07);
  wanne.add(B.quader(M.tarn, -0.1, 0.45, D, D + 0.05, 0.2, 1.0, 0.02));   // Wartungsklappe
  // Bugkeil: Scheinwerfergruppen, Abschleppösen, Zusatzpanzerplatte
  for (const s of [-1, 1]) {
    wanne.add(B.quader(M.dunkel, 3.2, 3.48, 1.42, 1.56, s * 1.2 - 0.16, s * 1.2 + 0.16));
    wanne.add(B.quader(M.glas, 3.48, 3.5, 1.44, 1.54, s * 1.2 - 0.12, s * 1.2 + 0.12));
    wanne.add(B.zyl(M.stahl, 0.07, 0.12, [hl + 0.03, 0.98, s * 0.7], 'z', 10));
  }
  wanne.add(B.koerper(M.tarn, [[2.3, D - 0.02, -0.95], [3.3, 1.47, -0.95], [3.3, 1.47, 0.95], [2.3, D - 0.02, 0.95]], [[2.3, D + 0.04, -0.9], [3.28, 1.53, -0.9], [3.28, 1.53, 0.9], [2.3, D + 0.04, 0.9]]));
  for (let x = 2.45; x < 3.2; x += 0.24) wanne.add(B.zyl(M.stahl, 0.03, 0.03, [x, D + 0.05 - (x - 2.3) * 0.5, -0.82], 'y', 8));

  // ---- Heck: Dachluken des Kampfraums, Staukiste, Kanister, Abschleppseil, Werkzeug
  B.luke(wanne, -2.85, 0.75, D, 0.32);
  wanne.add(B.quader(M.tarn, -3.4, -2.35, D, D + 0.04, 0.2, 1.4, 0.02));   // Deckplatte unter der Luke
  B.kiste(wanne, -3.5, -2.85, D, D + 0.42, -1.5, -0.95);
  B.kanister(wanne, -2.6, -1.33, D, Math.PI / 2);
  B.kanister(wanne, -2.6, -1.13, D, Math.PI / 2);
  for (const s of [-1, 1]) wanne.add(B.quader(M.dunkel, -hl - 0.02, -hl + 0.12, 1.5, 1.7, s * 1.25 - 0.14, s * 1.25 + 0.14));   // Rückleuchten
  // Abschleppseil in Schlaufen auf dem Heckdach
  for (let i = 0; i < 2; i++) { const t = new THREE.TorusGeometry(0.32 - i * 0.05, 0.035, 6, 24); t.rotateX(Math.PI / 2); t.scale(1.6, 1, 1); t.translate(-3.25, D + 0.05, 0.05); const m = new THREE.Mesh(t, M.stahl); m.castShadow = true; wanne.add(m); }
  // Werkzeug rechts neben dem Turm
  B.spaten(wanne, -1.3, 1.38, D + 0.03, 1.1);
  B.hacke(wanne, -0.2, 1.22, D + 0.03, 0.95);
  for (const x of [-1.75, -0.9, -0.55, 0.25]) B.halter(wanne, x, 1.3, D + 0.03);
  // Antennenfüße und Turmring
  for (const [x, z] of [[-3.3, 1.45], [-0.2, -1.42]]) { wanne.add(B.zyl(M.dunkel, 0.07, 0.12, [x, D + 0.06, z], 'y', 10)); wanne.add(B.zyl(M.schwarz, 0.012, 0.25, [x, D + 0.2, z], 'y', 6)); }
  wanne.add(B.zyl(M.dunkel, 1.12, 0.04, [RAHMEN.turmOrt[0], D + 0.02, RAHMEN.turmOrt[1]], 'y', 48));
  // Plattenfugen auf dem Dach
  for (const x of [-1.95, 0.48, 2.15]) wanne.add(B.quader(M.dunkel, x - 0.008, x + 0.008, D, D + 0.006, -1.05, 1.05));

  // ---- Turm (Ursprung = Drehpunkt): flacher, kantiger Körper, Kanone rechts, Startgerät links, Optiken oben
  const T0 = D, T1 = D + 0.62;
  turm.add(B.koerper(M.tarn,
    [[-1.22, T0, -0.92], [1.05, T0, -0.92], [1.42, T0, -0.5], [1.42, T0, 0.8], [1.08, T0, 1.0], [-1.22, T0, 1.0]].map(p => p),
    [[-1.12, T1, -0.82], [0.95, T1, -0.82], [1.22, T1 - 0.12, -0.45], [1.22, T1 - 0.12, 0.72], [0.98, T1, 0.9], [-1.12, T1, 0.9]]));
  // Kanonenblende und 30-mm-Maschinenkanone (rechts)
  turm.add(B.quader(M.tarn, 0.95, 1.78, D + 0.2, D + 0.55, 0.22, 0.72, 0.03));
  turm.add(B.zyl(M.oliv, 0.1, 0.75, [2.1, D + 0.38, 0.47], 'x', 16));
  turm.add(B.zyl(M.dunkel, 0.058, 1.3, [2.95, D + 0.38, 0.47], 'x', 14));
  turm.add(B.zyl(M.schwarz, 0.085, 0.16, [3.56, D + 0.38, 0.47], 'x', 14));
  turm.add(B.zyl(M.dunkel, 0.035, 0.45, [1.95, D + 0.3, 0.29], 'x', 8));   // koaxiales MG
  // Startgerät (zwei Lenkflugkörper) links am Turm
  turm.add(B.quader(M.tarn, -0.75, 1.05, D + 0.22, D + 0.68, -1.15, -0.85, 0.02));
  for (const dz of [-1.07, -0.93]) turm.add(B.zyl(M.dunkel, 0.06, 0.02, [1.06, D + 0.45, dz], 'x', 12));
  // Optiken: Rundblickperiskop des Kommandanten (hinten links) und Richtschützenvisier (vorn links)
  turm.add(B.zyl(M.tarn, 0.17, 0.3, [-0.55, T1 + 0.15, -0.38], 'y', 18));
  turm.add(B.quader(M.dunkel, -0.75, -0.33, T1 + 0.3, T1 + 0.5, -0.55, -0.21, 0.02));
  turm.add(B.quader(M.glas, -0.33, -0.31, T1 + 0.33, T1 + 0.47, -0.5, -0.26));
  turm.add(B.quader(M.dunkel, 0.45, 0.85, T1, T1 + 0.26, -0.62, -0.25, 0.02));
  turm.add(B.quader(M.glas, 0.85, 0.87, T1 + 0.05, T1 + 0.22, -0.58, -0.29));
  // Wartungsklappen, Haltegriffe, Nebelwurfbecher, Antennen
  turm.add(B.quader(M.tarn, -0.95, -0.15, T1, T1 + 0.03, 0.05, 0.7, 0.02));
  turm.add(B.quader(M.tarn, 0.05, 0.75, T1, T1 + 0.03, 0.1, 0.6, 0.02));
  for (const [x, z] of [[-1.05, -0.6], [-1.05, 0.6], [0.7, 0.82]]) turm.add(B.quader(M.stahl, x - 0.1, x + 0.1, T1, T1 + 0.05, z - 0.02, z + 0.02));
  B.nebelwerfer(turm, -1.05, -0.98, D + 0.4, -1, 3, 0.14);
  B.nebelwerfer(turm, -1.05, 1.06, D + 0.4, 1, 3, 0.14);
  for (const z of [-0.65, 0.65]) { turm.add(B.zyl(M.dunkel, 0.06, 0.1, [-1.0, T1 + 0.05, z], 'y', 10)); }

  B.tarnUV(wanne, [0, 0]); B.tarnUV(turm, [2.3, 1.1]);
  return { wanne, turm };
}

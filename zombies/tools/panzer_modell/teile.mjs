// Bausteine für die selbst gebauten Panzermodelle (three.js): konvexe Körper aus Eckpunkt-Ringen, Prismen aus Draufsicht-Umrissen,
// Seitenprofile, Zylinder, Laufwerk (Kette mit Rollen) und ein prozedurales Flecktarn (dreifarbiger Bundeswehr-Tarnanstrich) als
// nahtlos kachelnde Textur. Alles wird hier aus Grundformen erzeugt – keine fremden Modelle oder Texturen.
// Einheiten: Meter; x = nach vorn (Bug), y = nach oben, z = nach rechts (in der Draufsicht: Bug rechts, rechte Seite unten).

// deterministischer Zufall (mulberry32), damit jeder Lauf dasselbe Bild ergibt
export function zufall(seed) {
  return () => {
    seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// Flecktarn-Textur: Grundton Bronzegrün, darüber große braune und schwarze Flecken mit weichen, runden Rändern.
// Die Flecken entstehen als Zufallspfade aus Kreisen, werden weichgezeichnet und an einer Schwelle hart geschnitten (glatte Kurven);
// gezeichnet wird mit Umlauf (3 × 3 Kopien), damit die Kachel nahtlos wiederholt werden kann.
export function tarnCanvas(seed, { N = 1024, gruen = '#5b6440', braun = '#664d37', schwarz = '#2a2b24', groesse = 1 } = {}) {
  const r = zufall(seed);
  const pad = 96, G = N + 2 * pad;
  const ergebnis = document.createElement('canvas'); ergebnis.width = ergebnis.height = N;
  const e = ergebnis.getContext('2d');
  e.fillStyle = gruen; e.fillRect(0, 0, N, N);
  const lage = (farbe, anzahl, rad, schritte) => {
    const roh = document.createElement('canvas'); roh.width = roh.height = G;
    const c = roh.getContext('2d'); c.fillStyle = '#fff';
    for (let i = 0; i < anzahl; i++) {
      let x = r() * N, y = r() * N, w = r() * Math.PI * 2;
      const n = schritte[0] + Math.floor(r() * (schritte[1] - schritte[0]));
      for (let k = 0; k < n; k++) {
        const rr = rad * groesse * (0.45 + r() * 0.75);
        for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) { c.beginPath(); c.arc(pad + x + ox * N, pad + y + oy * N, rr, 0, Math.PI * 2); c.fill(); }
        x += Math.cos(w) * rr * 0.95; y += Math.sin(w) * rr * 0.95; w += (r() - 0.5) * 1.6;
        x = (x + N) % N; y = (y + N) % N;
      }
    }
    const weich = document.createElement('canvas'); weich.width = weich.height = G;
    const wc = weich.getContext('2d'); wc.filter = `blur(${Math.round(rad * groesse * 0.35)}px)`; wc.drawImage(roh, 0, 0);
    const d = wc.getImageData(pad, pad, N, N), p = d.data;
    const [fr, fg, fb] = [1, 3, 5].map(i => parseInt(farbe.slice(i, i + 2), 16));
    for (let i = 0; i < p.length; i += 4) { const an = p[i] > 128; p[i] = fr; p[i + 1] = fg; p[i + 2] = fb; p[i + 3] = an ? 255 : 0; }
    const maske = document.createElement('canvas'); maske.width = maske.height = N;
    maske.getContext('2d').putImageData(d, 0, 0);
    e.drawImage(maske, 0, 0);
  };
  lage(braun, 9, 46, [5, 10]);
  lage(schwarz, 6, 26, [4, 8]);
  // feine Körnung und Staub (heller/dunkler), damit die Flächen nicht wie Plastik wirken
  for (let i = 0; i < 26000; i++) {
    e.fillStyle = r() < 0.5 ? `rgba(0,0,0,${0.05 + r() * 0.07})` : `rgba(200,190,150,${0.04 + r() * 0.06})`;
    e.fillRect(r() * N, r() * N, 1 + r() * 2, 1 + r() * 2);
  }
  return ergebnis;
}

export function bausteine(THREE, { tarnSeed = 7, tarnKachel = 6 } = {}) {
  const tex = new THREE.CanvasTexture(tarnCanvas(tarnSeed));
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.08, ...o });
  const mat = {
    tarn: std(0xffffff, { map: tex, roughness: 0.9 }),
    gruen: std(0x4f5835),        // ungetarnte Anbauteile (Werkzeughalter, Kisten)
    oliv: std(0x5b5f40),
    dunkel: std(0x2a2b26, { roughness: 0.95 }),   // Kette, Gummi, Öffnungen
    schwarz: std(0x121210, { roughness: 1 }),
    stahl: std(0x55554e, { metalness: 0.45, roughness: 0.55 }),
    gitter: std(0x30332b, { metalness: 0.3 }),
    glas: std(0x6fa2bd, { metalness: 0.35, roughness: 0.15, emissive: 0x0d1a22 }),
    holz: std(0x7b5b38),
    plane: std(0x5f5b3d, { roughness: 1 }),
    sand: std(0x8a7d58),
    rot: std(0x8a2a22),
    weiss: std(0xd8d6c8),
  };
  for (const m of Object.values(mat)) m.flatShading = true;
  mat.tarn.userData.tarn = true;

  // Körper aus zwei gleich langen Punkt-Ringen (je [x, y, z]): Deckel, Boden und Seitenvierecke; konvex, Flächen nach außen gedreht
  function koerper(m, unten, oben) {
    const n = unten.length, pos = [];
    const mitte = [0, 1, 2].map(k => (unten.reduce((s, p) => s + p[k], 0) + oben.reduce((s, p) => s + p[k], 0)) / (2 * n));
    const tri = (a, b, c) => {
      const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      const nn = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      const s = [(a[0] + b[0] + c[0]) / 3 - mitte[0], (a[1] + b[1] + c[1]) / 3 - mitte[1], (a[2] + b[2] + c[2]) / 3 - mitte[2]];
      if (nn[0] * nn[0] + nn[1] * nn[1] + nn[2] * nn[2] < 1e-14) return;
      if (nn[0] * s[0] + nn[1] * s[1] + nn[2] * s[2] < 0) pos.push(...a, ...c, ...b); else pos.push(...a, ...b, ...c);
    };
    for (let i = 1; i < n - 1; i++) { tri(unten[0], unten[i], unten[i + 1]); tri(oben[0], oben[i], oben[i + 1]); }
    for (let i = 0; i < n; i++) { const j = (i + 1) % n; tri(unten[i], unten[j], oben[j]); tri(unten[i], oben[j], oben[i]); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(new Array(pos.length / 3 * 2).fill(0), 2));
    g.computeVertexNormals();
    const mesh = new THREE.Mesh(g, m); mesh.castShadow = mesh.receiveShadow = true;
    return mesh;
  }
  // Prisma aus einem konvexen Draufsicht-Umriss [[x, z], …] von y0 bis y1; y1 darf eine (lineare) Funktion (x, z) => y sein (schräge Deckel).
  // einzug: Deckel um so viel nach innen versetzt (abgeschrägte Kanten)
  function prisma(m, umriss, y0, y1, einzug = 0) {
    const h = typeof y1 === 'function' ? y1 : () => y1;
    let oben = umriss;
    if (einzug) {
      const cx = umriss.reduce((s, p) => s + p[0], 0) / umriss.length, cz = umriss.reduce((s, p) => s + p[1], 0) / umriss.length;
      oben = umriss.map(([x, z]) => { const dx = x - cx, dz = z - cz, l = Math.hypot(dx, dz) || 1; return [x - dx / l * einzug, z - dz / l * einzug]; });
    }
    return koerper(m, umriss.map(([x, z]) => [x, y0, z]), oben.map(([x, z]) => [x, h(x, z), z]));
  }
  // Quader von [x0, x1] × [y0, y1] × [z0, z1]
  const quader = (m, x0, x1, y0, y1, z0, z1, einzug = 0) => prisma(m, [[x0, z0], [x1, z0], [x1, z1], [x0, z1]], y0, y1, einzug);
  // Seitenprofil [[x, y], …] (konvex), von z0 bis z1 ausgedehnt
  const profil = (m, punkte, z0, z1) => koerper(m, punkte.map(([x, y]) => [x, y, z0]), punkte.map(([x, y]) => [x, y, z1]));
  // Zylinder (Achse x, y oder z) mit Mittelpunkt p
  function zyl(m, r, l, p, achse = 'y', seg = 20, r2 = r) {
    const g = new THREE.CylinderGeometry(r2, r, l, seg);
    if (achse === 'x') g.rotateZ(-Math.PI / 2); else if (achse === 'z') g.rotateX(Math.PI / 2);
    g.translate(p[0], p[1], p[2]);
    const mesh = new THREE.Mesh(g, m); mesh.castShadow = mesh.receiveShadow = true;
    return mesh;
  }
  // Laufwerk einer Seite: Kette (oberes und unteres Trum mit Querstegen, Rundungen an Leit- und Triebrad) und Laufrollen
  function kette(gruppe, { x0, x1, z, breite, yOben, r, rollen, rolleR = 0.3, glieder = 0.16 }) {
    const hz = breite / 2, d = 0.07;
    gruppe.add(quader(mat.dunkel, x0, x1, yOben - d, yOben, z - hz, z + hz));
    gruppe.add(quader(mat.dunkel, x0 + r * 0.6, x1 - r * 0.6, 0, d, z - hz, z + hz));
    for (const x of [x0, x1]) gruppe.add(zyl(mat.dunkel, r, breite, [x, yOben - r, z], 'z', 24));
    for (let x = x0; x <= x1; x += glieder) gruppe.add(quader(mat.schwarz, x, x + glieder * 0.45, yOben, yOben + 0.025, z - hz, z + hz));   // Stege
    for (let x = x0; x <= x1; x += glieder * 2) gruppe.add(quader(mat.stahl, x + glieder * 0.5, x + glieder * 0.8, yOben, yOben + 0.03, z - 0.04, z + 0.04));   // Führungszähne
    for (const x of [x0, x1]) gruppe.add(zyl(mat.oliv, r * 0.75, breite + 0.04, [x, yOben - r, z], 'z', 18));   // Leit- und Triebrad
    for (let i = 0; i < rollen; i++) {
      const x = x0 + r + (x1 - x0 - 2 * r) * (i + 0.5) / rollen;
      gruppe.add(zyl(mat.oliv, rolleR, breite * 0.8, [x, rolleR + 0.05, z], 'z', 18));
    }
  }
  // Kanister (Draufsicht: Rechteck mit Griffen), Kiste mit Deckel, Werkzeug
  function kanister(gruppe, x, z, y0, drehung = 0, m = mat.oliv) {
    const g = new THREE.Group();
    g.add(quader(m, -0.17, 0.17, 0, 0.47, -0.08, 0.08, 0.01));
    for (const dx of [-0.08, 0, 0.08]) g.add(quader(mat.dunkel, dx - 0.015, dx + 0.015, 0.47, 0.5, -0.04, 0.04));
    g.position.set(x, y0, z); g.rotation.y = drehung; gruppe.add(g);
  }
  function kiste(gruppe, x0, x1, y0, y1, z0, z1, m = mat.gruen) {
    gruppe.add(quader(m, x0, x1, y0, y1, z0, z1, 0.02));
    gruppe.add(quader(mat.dunkel, x0 + 0.03, x1 - 0.03, y1 - 0.005, y1 + 0.005, (z0 + z1) / 2 - 0.006, (z0 + z1) / 2 + 0.006));   // Deckelfuge
    for (const x of [x0 + 0.08, x1 - 0.08]) gruppe.add(quader(mat.stahl, x - 0.02, x + 0.02, y1 - 0.01, y1 + 0.015, z0 - 0.01, z0 + 0.06));   // Verschlüsse
  }
  // Spaten / Axt / Spitzhacke längs der x-Achse (Mitte x, z; Stiel liegt flach)
  function spaten(gruppe, x, z, y, l = 1.1) {
    gruppe.add(zyl(mat.holz, 0.022, l * 0.72, [x - l * 0.14, y, z], 'x', 8));
    gruppe.add(quader(mat.stahl, x + l * 0.22, x + l * 0.5, y - 0.01, y + 0.01, z - 0.09, z + 0.09));
    gruppe.add(quader(mat.stahl, x - l * 0.5, x - l * 0.44, y - 0.015, y + 0.015, z - 0.06, z + 0.06));
  }
  function hacke(gruppe, x, z, y, l = 0.95) {
    gruppe.add(zyl(mat.holz, 0.025, l, [x, y, z], 'x', 8));
    gruppe.add(quader(mat.stahl, x + l * 0.42, x + l * 0.5, y - 0.02, y + 0.02, z - 0.25, z + 0.25));
  }
  function halter(gruppe, x, z, y) { gruppe.add(quader(mat.stahl, x - 0.03, x + 0.03, y - 0.04, y + 0.04, z - 0.07, z + 0.07)); }
  // Lüftungsgitter: dunkle Wanne mit Lamellen quer oder längs
  function gitter(gruppe, x0, x1, z0, z1, y, quer = true, abstand = 0.07) {
    gruppe.add(quader(mat.schwarz, x0, x1, y - 0.03, y + 0.005, z0, z1));
    if (quer) for (let x = x0 + abstand / 2; x < x1; x += abstand) gruppe.add(quader(mat.gitter, x - 0.012, x + 0.012, y - 0.02, y + 0.012, z0, z1));
    else for (let z = z0 + abstand / 2; z < z1; z += abstand) gruppe.add(quader(mat.gitter, x0, x1, y - 0.02, y + 0.012, z - 0.012, z + 0.012));
    gruppe.add(quader(mat.stahl, x0 - 0.03, x1 + 0.03, y, y + 0.015, z0 - 0.03, z0));
    gruppe.add(quader(mat.stahl, x0 - 0.03, x1 + 0.03, y, y + 0.015, z1, z1 + 0.03));
  }
  // runder Lukendeckel mit Scharnier und Griff (geschlossen) bzw. offene Luke (dunkles Loch, Deckel hochgeklappt nach hinten)
  function luke(gruppe, x, z, y, r = 0.32, offen = false) {
    gruppe.add(zyl(mat.tarn, r + 0.06, 0.05, [x, y + 0.025, z], 'y', 28));   // Lukenring
    if (offen) {
      gruppe.add(zyl(mat.schwarz, r, 0.02, [x, y + 0.055, z], 'y', 28));
      gruppe.add(quader(mat.tarn, x - r - 0.14, x - r - 0.06, y + 0.05, y + 0.05 + 2 * r, z - r, z + r));   // aufrecht stehender Deckel
    } else {
      gruppe.add(zyl(mat.tarn, r, 0.06, [x, y + 0.08, z], 'y', 28));
      gruppe.add(quader(mat.stahl, x - r - 0.05, x - r + 0.06, y + 0.06, y + 0.12, z - 0.12, z + 0.12));   // Scharnier
      gruppe.add(quader(mat.stahl, x + r * 0.35, x + r * 0.55, y + 0.11, y + 0.14, z - 0.1, z + 0.1));      // Griff
    }
  }
  // Winkelspiegel (kleiner Block mit Glas nach vorn bzw. in Richtung w)
  function spiegel(gruppe, x, z, y, w = 0) {
    const g = new THREE.Group();
    g.add(quader(mat.dunkel, -0.06, 0.06, 0, 0.09, -0.1, 0.1));
    g.add(quader(mat.glas, 0.06, 0.075, 0.02, 0.075, -0.08, 0.08));
    g.position.set(x, y, z); g.rotation.y = -w; gruppe.add(g);
  }
  // Nebelwurfbecher: Reihe schräg nach außen/vorn gerichteter Rohre
  function nebelwerfer(gruppe, x, z, y, seite, n = 4, schritt = 0.13) {
    for (let i = 0; i < n; i++) {
      const g = new THREE.CylinderGeometry(0.05, 0.05, 0.3, 12);
      g.rotateZ(-Math.PI / 2); g.rotateZ(0.5); g.rotateY(-seite * 0.6);
      g.translate(x + i * schritt, y, z);
      const m = new THREE.Mesh(g, mat.dunkel); m.castShadow = true; gruppe.add(m);
    }
  }
  // Flecktarn-Koordinaten: Textur von oben projiziert (u, v = Welt-x, -z je Kachel), versatz verschiebt das Muster je Bauteil
  function tarnUV(gruppe, versatz = [0, 0]) {
    gruppe.updateMatrixWorld(true);
    const v = new THREE.Vector3();
    gruppe.traverse(o => {
      if (!o.isMesh || !o.material.userData.tarn) return;
      const p = o.geometry.attributes.position, uv = o.geometry.attributes.uv, nrm = o.geometry.attributes.normal;
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld);
        // senkrechte Flächen: zusätzlich die Höhe einrechnen, damit Seiten nicht zu Streifen verschmieren
        const steil = nrm ? 1 - Math.abs(nrm.getY(i)) : 0;
        uv.setXY(i, (v.x + versatz[0]) / tarnKachel + steil * v.y * 0.1, (-v.z + versatz[1]) / tarnKachel + steil * v.y * 0.12);
      }
      uv.needsUpdate = true;
    });
  }
  return { mat, koerper, prisma, quader, profil, zyl, kette, kanister, kiste, spaten, hacke, halter, gitter, luke, spiegel, nebelwerfer, tarnUV };
}

// Platzierung der Missionsorte (Funktion von DeepSeek, geprüft): weit auseinander, möglichst passende Gebäudeart
// ES-Modul (Node 22), reines JavaScript
// Exportiert genau eine reine Funktion: waehleOrte

export function waehleOrte({ kandidaten, wuensche, rng, breite, anteil = 0.4, versuche = 40 }) {
  // Mindestabstand zwischen zwei gewählten Orten
  const mindestabstand = anteil * breite;

  // Kandidaten deterministisch nach nr aufsteigend sortieren
  // (Eingabereihenfolge soll egal sein, keine Zufallsquelle verwenden)
  const kk = kandidaten
    .slice()
    .sort((a, b) => (a.nr < b.nr ? -1 : a.nr > b.nr ? 1 : 0));

  // Falls weniger Kandidaten als Wünsche: so viele wie möglich bedienen,
  // Ergebnisreihenfolge bleibt die der Wünsche (nur vorhandene Einträge).
  const anzahlWuensche = wuensche.length;
  const maxMoeglich = Math.min(anzahlWuensche, kk.length);

  // Hilfsfunktion: Typ-Rang eines Kandidaten für einen Wunsch.
  // Rang = Index in wuensche[i].typen; passt nichts, ist Rang = typen.length.
  function rangFuer(wunsch, kandidat) {
    const typen = wunsch.typen && Array.isArray(wunsch.typen) ? wunsch.typen : [];
    const idx = typen.indexOf(kandidat.typ);
    return idx === -1 ? typen.length : idx;
  }

  // Quadratischer Abstand (kein sqrt nötig)
  function dist2(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return dx * dx + dy * dy;
  }

  // Fisher-Yates-Mischung mit übergebenem rng(), gibt neues Array zurück.
  function mische(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const t = a[i];
      a[i] = a[j];
      a[j] = t;
    }
    return a;
  }

  // Abstands-Lockerungsfaktoren für einen Wunsch
  const faktoren = [1, 0.75, 0.5, 0.25, 0];

  // Ein einzelner Durchlauf: gibt Bewertung + Auswahl zurück.
  function durchlauf() {
    // Reihenfolge der Wünsche mischen
    const reihenfolge = mische(
      Array.from({ length: anzahlWuensche }, (_, i) => i)
    );

    // Auswahl: Map wunschIndex -> Kandidat
    const auswahl = new Map();
    // Bereits verwendete Kandidaten (nach nr, um Duplikate zu vermeiden)
    const benutzt = new Set();

    // Anzahl mit voller Abstandsforderung gesetzter Wünsche
    let volleTreffer = 0;

    for (const wi of reihenfolge) {
      // Schon genug Kandidaten verbraucht?
      if (auswahl.size >= maxMoeglich) break;

      const wunsch = wuensche[wi];
      let gewaehlt = null;

      for (let fi = 0; fi < faktoren.length; fi++) {
        const faktor = faktoren[fi];
        const schwelle = mindestabstand * faktor;
        const schwelle2 = schwelle * schwelle;

        // Kandidaten sammeln, die Abstand erfüllen und noch frei sind
        // und deren Rang wir kennen.
        let besterRang = Infinity;
        let besteKandidaten = [];

        for (let ki = 0; ki < kk.length; ki++) {
          const k = kk[ki];
          if (benutzt.has(k.nr)) continue;

          // Abstand zu allen schon gesetzten Orten prüfen
          let ok = true;
          for (const gew of auswahl.values()) {
            if (dist2(k, gew) < schwelle2) {
              ok = false;
              break;
            }
          }
          if (!ok) continue;

          const r = rangFuer(wunsch, k);
          if (r < besterRang) {
            besterRang = r;
            besteKandidaten = [k];
          } else if (r === besterRang) {
            besteKandidaten.push(k);
          }
        }

        if (besteKandidaten.length > 0) {
          // Unter gleichem Rang zufällig per rng
          const idx = Math.floor(rng() * besteKandidaten.length);
          gewaehlt = besteKandidaten[idx];
          // volle Abstandsforderung nur bei faktor === 1
          if (faktor === 1) volleTreffer++;
          break;
        }
        // sonst: nächster, lockerer Faktor
      }

      if (gewaehlt) {
        auswahl.set(wi, gewaehlt);
        benutzt.add(gewaehlt.nr);
      }
    }

    // Bewertung berechnen
    // (1) volleTreffer (mehr = besser)
    // (2) Summe der Typränge (kleiner = besser)
    let summeRaenge = 0;
    for (const [wi, k] of auswahl) {
      summeRaenge += rangFuer(wuensche[wi], k);
    }

    // (3) kleinster paarweiser Abstand (größer = besser)
    let minDist2 = Infinity;
    const gewaehlteListe = Array.from(auswahl.values());
    for (let i = 0; i < gewaehlteListe.length; i++) {
      for (let j = i + 1; j < gewaehlteListe.length; j++) {
        const d2 = dist2(gewaehlteListe[i], gewaehlteListe[j]);
        if (d2 < minDist2) minDist2 = d2;
      }
    }
    // Bei weniger als 2 gewählten: keine Paare -> MinDist gilt als "unendlich",
    // aber praktisch egal, da dann volleTreffer/Anzahl entscheidet.
    if (gewaehlteListe.length < 2) minDist2 = Infinity;

    return { auswahl, volleTreffer, summeRaenge, minDist2 };
  }

  // Mehrere Durchläufe, besten auswählen (Gleichstand: früherer).
  let bestes = null;

  const anzahlDurchlaeufe = Math.max(1, versuche);
  for (let t = 0; t < anzahlDurchlaeufe; t++) {
    const ergebnis = durchlauf();

    if (bestes === null) {
      bestes = ergebnis;
      continue;
    }

    // Vergleich: (1) mehr volleTreffer besser
    if (ergebnis.volleTreffer > bestes.volleTreffer) {
      bestes = ergebnis;
      continue;
    }
    if (ergebnis.volleTreffer < bestes.volleTreffer) continue;

    // (2) kleinere Summe Raenge besser
    if (ergebnis.summeRaenge < bestes.summeRaenge) {
      bestes = ergebnis;
      continue;
    }
    if (ergebnis.summeRaenge > bestes.summeRaenge) continue;

    // (3) größerer kleinster Abstand besser
    if (ergebnis.minDist2 > bestes.minDist2) {
      bestes = ergebnis;
      continue;
    }
    // Gleichstand: früherer (bestes) bleibt.
  }

  // Ergebnis in Reihenfolge der Wünsche aufbauen.
  const result = [];
  for (let wi = 0; wi < anzahlWuensche; wi++) {
    const k = bestes ? bestes.auswahl.get(wi) : undefined;
    if (k) {
      result.push({ id: wuensche[wi].id, nr: k.nr, x: k.x, y: k.y });
    }
  }
  return result;
}

// Katalog der Level-Karten (gemeinsam für Server, Verwaltung und Client). Neue Karte = ein Eintrag hier (plus Kartendatei in karten/).
//   id: Schlüssel des Levels = Name der Kartendatei (Tabellen je Karte wie bissSpielerLevel, Missionen, Evakuierungsart hängen an der Karte)
//   nr: ursprüngliche Levelnummer der Karte (Musik- und Durchsage-Zuordnung „Level n“ wandert mit der Karte; Geretsried 2 teilt sich Nr. 1 mit Geretsried 1)
// Jeder Eintrag ist ein eigenes Level mit genau einer Karte (früher: 'geretsried' = Zufall aus Geretsried und Geretsried 2, siehe migriereFolge).
export const LEVEL_KATALOG = [
  { id: 'geretsried', nr: 1, name: 'Geretsried 1' },
  { id: 'geretsried2', nr: 1, name: 'Geretsried 2' },
  { id: 'isarauen', nr: 2, name: 'Isarauen' },
  { id: 'koenigsdorf', nr: 3, name: 'Flugplatz Königsdorf' },
  { id: 'kochel', nr: 4, name: 'Kochel am See' },
  { id: 'andermatt', nr: 5, name: 'Andermatt (Finale)' },
];

export const katalogEintrag = id => LEVEL_KATALOG.find(k => k.id === id) ?? null;
// Eintrag einer Kartendatei; unbekannt (z. B. 'dorf') = null
export const eintragVon = karte => katalogEintrag(karte);
export const levelSchluessel = karte => eintragVon(karte)?.id ?? karte;
// Levelnummer der Karte im ursprünglichen Katalog (für Musik/Durchsage); unbekannt = fallback
export const kartenNr = (karte, fallback = 1) => eintragVon(karte)?.nr ?? fallback;

export const folgeVorgabe = () => LEVEL_KATALOG.map(k => ({ karte: k.id, aktiv: true }));

// Alte Reihenfolge (bis 5 Einträge, 'geretsried' = Zufall aus Geretsried 1 und 2): steht 'geretsried', aber noch nicht 'geretsried2' in der
// Liste, kommt 'geretsried2' direkt dahinter mit demselben aktiv-Wert dazu. Andere Listen bleiben unverändert.
export function migriereFolge(roh) {
  if (!Array.isArray(roh)) return roh;
  const id = x => (typeof x === 'string' ? x : x?.karte);
  const i = roh.findIndex(x => id(x) === 'geretsried');
  if (i < 0 || roh.some(x => id(x) === 'geretsried2')) return roh;
  const x = roh[i], aktiv = typeof x === 'object' && x !== null ? x.aktiv !== false : true;
  return [...roh.slice(0, i + 1), { karte: 'geretsried2', aktiv }, ...roh.slice(i + 1)];
}

// Reihenfolge der Level: [{ karte: id, aktiv }] – unbekannte und doppelte fallen weg, fehlende Karten des Katalogs kommen hinten (aktiv) dazu,
// mindestens ein Level bleibt aktiv. roh = neue Eingabe, alt = bisherige Liste (wenn roh keine Liste ist)
export function bereinigeFolge(roh, alt) {
  const quelle = migriereFolge(Array.isArray(roh) ? roh : Array.isArray(alt) ? alt : []);
  const gesehen = new Set(), aus = [];
  for (const x of quelle) {
    const id = typeof x === 'string' ? x : x?.karte;
    if (!katalogEintrag(id) || gesehen.has(id)) continue;
    gesehen.add(id);
    aus.push({ karte: id, aktiv: typeof x === 'object' && x !== null ? x.aktiv !== false : true });
  }
  for (const k of LEVEL_KATALOG) if (!gesehen.has(k.id)) aus.push({ karte: k.id, aktiv: true });
  if (!aus.some(x => x.aktiv)) aus[0].aktiv = true;
  return aus;
}
// aktive Level (Katalog-ids) in Reihenfolge; Position + 1 = Levelnummer (Schwierigkeit, Tabellen je Level)
export const aktiveFolge = folge => bereinigeFolge(folge).filter(x => x.aktiv).map(x => x.karte);
// nächstes Level nach einer Karte (Wechsel am Ende wieder zum ersten); unbekannte/abgeschaltete Karte → erstes aktives Level
export function naechsterEintrag(folge, karte) {
  const liste = aktiveFolge(folge), i = liste.indexOf(levelSchluessel(karte));
  return liste[i < 0 ? 0 : (i + 1) % liste.length];
}

// Katalog der Level-Karten (gemeinsam für Server, Verwaltung und Client). Neue Karte = ein Eintrag hier (plus Kartendatei in karten/).
//   id: Schlüssel des Levels (Tabellen je Karte wie bissSpielerLevel, Missionen, Evakuierungsart hängen an der Karte)
//   nr: ursprüngliche Levelnummer der Karte (Musik- und Durchsage-Zuordnung „Level n“ wandert mit der Karte)
//   karten: Kartendateien des Eintrags; mehrere = Zufallswahl (Level 1: Geretsried oder Geretsried 2)
export const LEVEL_KATALOG = [
  { id: 'geretsried', nr: 1, name: 'Geretsried (zufällig 1 oder 2)', karten: ['geretsried', 'geretsried2'] },
  { id: 'isarauen', nr: 2, name: 'Isarauen', karten: ['isarauen'] },
  { id: 'koenigsdorf', nr: 3, name: 'Flugplatz Königsdorf', karten: ['koenigsdorf'] },
  { id: 'kochel', nr: 4, name: 'Kochel am See', karten: ['kochel'] },
  { id: 'andermatt', nr: 5, name: 'Andermatt (Finale)', karten: ['andermatt'] },
];

export const katalogEintrag = id => LEVEL_KATALOG.find(k => k.id === id) ?? null;
// Eintrag, zu dem eine konkrete Kartendatei gehört (geretsried2 → geretsried); unbekannt (z. B. 'dorf') = null
export const eintragVon = karte => LEVEL_KATALOG.find(k => k.id === karte || k.karten.includes(karte)) ?? null;
export const levelSchluessel = karte => eintragVon(karte)?.id ?? karte;
// Levelnummer der Karte im ursprünglichen Katalog (für Musik/Durchsage); unbekannt = fallback
export const kartenNr = (karte, fallback = 1) => eintragVon(karte)?.nr ?? fallback;

export const folgeVorgabe = () => LEVEL_KATALOG.map(k => ({ karte: k.id, aktiv: true }));

// Reihenfolge der Level: [{ karte: id, aktiv }] – unbekannte und doppelte fallen weg, fehlende Karten des Katalogs kommen hinten (aktiv) dazu,
// mindestens ein Level bleibt aktiv. roh = neue Eingabe, alt = bisherige Liste (wenn roh keine Liste ist)
export function bereinigeFolge(roh, alt) {
  const quelle = Array.isArray(roh) ? roh : Array.isArray(alt) ? alt : [];
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
// konkrete Karte eines Eintrags: mehrere Karten = fest gewählte (pin, wenn sie zum Eintrag gehört), sonst Zufall
export function karteAufloesen(id, pin = '', zufall = Math.random) {
  const k = katalogEintrag(id);
  if (!k) return id;
  if (pin && k.karten.includes(pin)) return pin;
  return k.karten[Math.min(k.karten.length - 1, Math.floor(zufall() * k.karten.length))];
}

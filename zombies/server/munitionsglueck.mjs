// Munitionsglück: wer bei Durchsuchungen keine Munition findet, hat beim nächsten Mal bessere Chancen (reine Rechenfunktionen).
// Je Spieler zählt eine Pechserie; jede Durchsuchung ohne Munition erhöht den Faktor multiplikativ, ein Munitionsfund setzt ihn zurück.
export const MUNITIONSGLUECK = {
  schritt: 20,        // % mehr Gewicht je Durchsuchung ohne Munition (multiplikativ)
  max: 300,           // höchster Faktor in % (300 = ×3)
  lebenUnter: 30,     // Leben in % darunter: Zusatzfaktor
  lebenFaktor: 150,   // % (150 = ×1,5)
  notUnter: 25,       // Durst oder Hunger in % darunter: Zusatzfaktor
  notFaktor: 130,     // % (130 = ×1,3)
};

// Munitionsarten, die zur Waffe des Spielers passen (Gewehrmunition immer, Pfeile/40-mm nur mit passender Waffe)
export function munitionsDinge(p) {
  const r = p?.rucksack ?? [], hat = d => p?.waffe === d || r.includes(d);
  return ['munition', 'munitionskiste', ...(hat('armbrust') ? ['pfeil'] : []), ...(hat('granatwerfer') ? ['granate40'] : [])];
}

// Gesamtfaktor (1 = normal) aus Pechserie und Lage des Spielers
export function munitionsFaktor(p, serie, c = MUNITIONSGLUECK) {
  const e = { ...MUNITIONSGLUECK, ...c };
  let f = Math.min(e.max / 100, Math.pow(1 + e.schritt / 100, Math.max(0, serie | 0)));
  if ((p?.hp ?? 100) < e.lebenUnter) f *= e.lebenFaktor / 100;
  if ((p?.durst ?? 100) < e.notUnter || (p?.hunger ?? 100) < e.notUnter) f *= e.notFaktor / 100;
  return f;
}

// Neue Pechserie nach einer Durchsuchung
export const naechsteSerie = (serie, fandMunition) => fandMunition ? 0 : (serie | 0) + 1;

// Fundfaktoren (Gegenstand → 10 = normal) mit dem Munitionsfaktor für die passenden Munitionsarten
export function mitMunitionsglueck(faktoren, p, serie, c) {
  const f = munitionsFaktor(p, serie, c);
  if (f === 1) return faktoren;
  const aus = { ...faktoren };
  for (const d of munitionsDinge(p)) aus[d] = (faktoren?.[d] ?? 10) * f;
  return aus;
}

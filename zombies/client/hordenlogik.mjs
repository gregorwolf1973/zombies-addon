// Hordengeräusch: reine Logik (ohne Audio) – Zählen, Schwellen mit Hysterese, Lautstärke, Einzelschreie, Akzent.
// Alle Zahlen in Zombies; Entfernungen in Metern (8 Pixel = 1 m).

export const PIXEL_JE_METER = 8;
export const HORDE_VORGABE = { ab: 8, nurHorde: 20, voll: 40, aus: 5, hoerweite: 30 };
export const START_PEGEL = 0.25;        // Lautstärkeanteil bei Erreichen der Schwelle „ab“
export const AKZENT_ANSTIEG = 10;       // so viele Zombies mehr innerhalb von 3 s = neue Horde
export const AKZENT_FENSTER = 3000;     // ms
export const AKZENT_PAUSE = 30000;      // ms zwischen zwei Akzenten
export const NAH_METER = 5, NAH_ABSTAND = 4000;   // ab „nurHorde“: nur Zombies < 5 m, höchstens alle 4 s

const zahl = (v, d) => Number.isFinite(Number(v)) && v !== null && v !== '' ? Number(v) : d;

// Einstellungen aus /info prüfen und widerspruchsfrei machen (aus < ab ≤ nurHorde, voll > ab)
export function hordeEinstellung(e = {}) {
  const V = HORDE_VORGABE;
  const ab = Math.max(1, zahl(e?.ab, V.ab));
  const aus = Math.max(0, Math.min(zahl(e?.aus, V.aus), ab - 1));
  return {
    ab, aus,
    nurHorde: Math.max(ab, zahl(e?.nurHorde, V.nurHorde)),
    voll: Math.max(ab + 1, zahl(e?.voll, V.voll)),
    hoerweite: Math.max(1, zahl(e?.hoerweite, V.hoerweite)),
  };
}

// Hörbare Zombies: gleiche Ebene wie der Spieler oder draußen (Ebene ''), innerhalb der Hörweite.
// Liefert Anzahl und Schwerpunkt (Pixel); ohne Zombies sx/sy = null.
export function zaehleHoerbare(zombies, ich, hoerweiteMeter) {
  const r = hoerweiteMeter * PIXEL_JE_METER, r2 = r * r, eb = ich?.ebene ?? '';
  let n = 0, sx = 0, sy = 0;
  for (const z of zombies) {
    const ze = z.ebene ?? '';
    if (ze !== eb && ze !== '') continue;
    const dx = z.x - ich.x, dy = z.y - ich.y, d2 = dx * dx + dy * dy;
    if (!(d2 <= r2)) continue;
    n++; sx += z.x; sy += z.y;
  }
  return { n, sx: n ? sx / n : null, sy: n ? sy / n : null };
}

// ein Schritt (etwa jede Sekunde): neuer Zustand mit
//   aktiv  – Schleife läuft (Hysterese: ein bei n ≥ ab, aus bei n ≤ aus)
//   pegel  – 0…1 (linear von START_PEGEL bei „ab“ bis 1 bei „voll“), 0 wenn nicht aktiv
//   halb   – Einzelschreie nur halb so oft (aktiv)
//   nur    – Einzelschreie nur noch aus der Nähe (n ≥ nurHorde, mit kleiner Hysterese)
export function hordeSchritt(alt, n, einst) {
  const e = einst;
  const aktiv = alt?.aktiv ? n > e.aus : n >= e.ab;
  const nur = aktiv && (alt?.nur ? n >= e.nurHorde - 2 : n >= e.nurHorde);
  let pegel = 0;
  if (aktiv) {
    const t = (n - e.ab) / (e.voll - e.ab);
    pegel = Math.max(0.1, Math.min(1, START_PEGEL + (1 - START_PEGEL) * t));
  }
  return { aktiv, pegel, halb: aktiv, nur, n };
}

// Darf dieser Einzelschrei jetzt kommen? abstandMeter = Entfernung des Zombies, letzter = Zeit (ms) des letzten Nah-Schreis,
// zufall = Zufallszahl 0…1 (zum Testen übergebbar)
export function einzelschreiOk(horde, { abstandMeter, jetzt, letzter, zufall = Math.random() }) {
  if (!horde?.aktiv) return true;
  if (horde.nur) return abstandMeter < NAH_METER && jetzt - (letzter ?? -1e9) >= NAH_ABSTAND;
  return zufall < 0.5;
}

// Akzent bei Ankunft einer neuen Horde: Zahl steigt innerhalb von 3 s um ≥ 10 (und liegt mindestens bei „ab“), höchstens alle 30 s.
// Zustand { verlauf: [[ms, n]…], letzter } wird verändert zurückgegeben (neues Objekt); spiele = true → Akzent abspielen
export function akzentSchritt(alt, n, jetzt, einst) {
  const verlauf = [...(alt?.verlauf ?? []), [jetzt, n]].filter(([t]) => jetzt - t <= AKZENT_FENSTER);
  const tiefster = Math.min(...verlauf.map(([, k]) => k));
  const frei = jetzt - (alt?.letzter ?? -1e9) >= AKZENT_PAUSE;
  const spiele = frei && n >= einst.ab && n - tiefster >= AKZENT_ANSTIEG;
  return { verlauf: spiele ? [[jetzt, n]] : verlauf, letzter: spiele ? jetzt : (alt?.letzter ?? null), spiele };
}

// Zahlen-Bereinigung der Einstellungen (Server, nebel.mjs, zombiesicht.mjs): „von–bis“ sind nur EMPFOHLENE Werte (Verwaltung zeigt sie an),
// erlaubt ist jeder Wert, der technisch Sinn ergibt:
//   endlich; untere Grenze = lo, wenn lo ≤ 1 (0, 0,05, 0,5 …), sonst 1 (kein Wert 0 bei Zeiten/Faktoren, Teiler); obere Grenze SICHER
//   o.min / o.max ersetzen diese Grenzen (Anzahlen, die Server oder Speicher sprengen könnten, bekommen ein eigenes o.max)
//   o.fest: lo/hi sind echte Grenzen (Wahrscheinlichkeiten und Lautstärken in %, Uhrzeiten, Winkel)
export const SICHER = 1e6;
export function zahl(v, lo, hi, vorgabe, o = {}) {
  const n = Number(v);
  if (!Number.isFinite(n)) return vorgabe;
  if (o.fest) return Math.max(lo, Math.min(hi, n));
  return Math.max(o.min ?? (lo > 1 ? 1 : lo), Math.min(o.max ?? SICHER, n));
}
export const fest = (v, lo, hi, vorgabe) => zahl(v, lo, hi, vorgabe, { fest: true });

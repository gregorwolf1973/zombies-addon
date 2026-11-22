// Ordner, aus dem die Module geladen wurden (index.html lädt sie unter v/<version>/, unveränderlich zwischengespeichert).
// Dateien aus dem Client-Ordner (Karten, Grafiken, Kulisse) werden darüber geholt; Töne und Schnittstellen (info, toene/) bleiben seitenrelativ.
// Ohne Browser (Tests, Server) bleibt es leer, also alles wie bisher.
export const ASSETS = (typeof document !== 'undefined' && import.meta.url.startsWith('http')) ? new URL('./', import.meta.url).href : '';

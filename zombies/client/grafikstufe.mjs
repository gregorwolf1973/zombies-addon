// Grafikstufe (je Gerät, Zahnrad-Menü): Hoch, Mittel, Niedrig oder Automatisch. Reine Logik ohne Phaser (testbar); spiel.mjs hängt sie nur ein.
//  - Mittel/Niedrig laden die halb aufgelösten Figuren-Atlanten (*_klein.webp, tools/grafik_klein.py); Koordinaten halbiert rahmenHalb, Größe gleicht Faktor GRAFIK.k aus
//  - Niedrig: zusätzlich weniger Rauch/Fetzen, kein Luftbild-Boden, keine Kulisse-Schatten
//  - Ladeliste: welche Bilder beim Start gebraucht werden (alte Figurenbögen nur, wenn die Optionsbits 256/512 sie noch verlangen; Helden nur die benötigten)
import { ZF_FIGUREN } from './zombiefiguren.mjs';
import { HF_FIGUREN } from './heldenfiguren.mjs';

export const GRAFIK_SCHLUESSEL = 'zob_grafik';
export const GRAFIK_WAHL = ['auto', 'hoch', 'mittel', 'niedrig'];
export const GRAFIK_STUFEN = ['hoch', 'mittel', 'niedrig'];
export const OPT_ZOMBIE_NEU = 256, OPT_HELDEN_NEU = 512;

// gespeicherten Wert prüfen; unbekannt = Automatisch
export const grafikWahlLesen = roh => (GRAFIK_WAHL.includes(roh) ? roh : 'auto');

// Automatik: Handy/Tablet (grober Zeiger ohne Maus oder Mobil-Kennung), wenig Arbeitsspeicher (deviceMemory <= 4 GB) oder kleiner Bildschirm (kürzere Seite < 700 px) → Mittel, sonst Hoch
export function grafikAutomatik({ mobil = false, grob = false, speicherGB = null, breite = 1920, hoehe = 1080 } = {}) {
  if (mobil || grob) return 'mittel';
  if (Number.isFinite(speicherGB) && speicherGB > 0 && speicherGB <= 4) return 'mittel';
  if (Math.min(breite, hoehe) < 700) return 'mittel';
  return 'hoch';
}

// wirksame Stufe aus Wahl + Umgebung
export function grafikStufe(wahl, umgebung) {
  const w = grafikWahlLesen(wahl);
  return w === 'auto' ? grafikAutomatik(umgebung) : w;
}

// Eigenschaften je Stufe
export function grafikEinstellung(stufe) {
  const s = GRAFIK_STUFEN.includes(stufe) ? stufe : 'hoch';
  const halb = s !== 'hoch';
  return {
    stufe: s,
    halb,                     // halb aufgelöste Figuren-Atlanten
    k: halb ? 2 : 1,          // Darstellungsfaktor, gleicht die halbe Auflösung aus
    partikel: s === 'niedrig' ? 0.5 : 1,   // Anteil von Rauch-Pool und Fetzen
    luftbild: s !== 'niedrig',
    schatten: s !== 'niedrig',             // Kulisse-Schatten (und damit dunklere Figuren im Schatten)
  };
}

// Umgebung des Browsers lesen (ohne Browser: Standardwerte = Hoch)
export function umgebungLesen() {
  const n = typeof navigator !== 'undefined' ? navigator : {}, w = typeof window !== 'undefined' ? window : {};
  let grob = false; try { grob = !!w.matchMedia?.('(pointer: coarse)')?.matches && !w.matchMedia?.('(any-pointer: fine)')?.matches; } catch { /* egal */ }
  const mobil = !!(n.userAgentData?.mobile) || /Android|iPhone|iPad|iPod|Mobile/i.test(n.userAgent ?? '');
  return { mobil, grob, speicherGB: Number(n.deviceMemory) || null, breite: w.screen?.width || w.innerWidth || 1920, hoehe: w.screen?.height || w.innerHeight || 1080 };
}
export function grafikWahlGespeichert() {
  try { return grafikWahlLesen(localStorage.getItem(GRAFIK_SCHLUESSEL)); } catch { return 'auto'; }
}
export const GRAFIK = grafikEinstellung(grafikStufe(grafikWahlGespeichert(), umgebungLesen()));   // gilt bis zum Neuladen der Seite

// Pfad einer Atlas-Datei: bei halber Auflösung <name>_klein.webp
export const atlasPfad = (pfad, halb) => (halb ? pfad.replace(/\.webp$/, '_klein.webp') : pfad);
// Rahmen [x, y, b, h] eines Atlas für die halbe Auflösung (Koordinaten der Atlanten sind gerade → exakt)
export const rahmenHalb = (r, halb) => (halb ? r.map(v => Math.round(v / 2)) : r);

// Heldenfigur (Id) aus dem Aussehen-String ('h,0,0' …) – Kennbuchstabe vorn; null: kein Mixamo-Held
export const heldenIdAusAussehen = (aussehen, hfFigurVon) => hfFigurVon(String(aussehen ?? '')[0]);

// Helden, die beim Beitritt sofort geladen werden: der eigene (Aussehen aus dem Zustand, sonst das lokal gewählte) und alle schon anwesenden Spieler/Bots; nur Mixamo-Helden, ohne Doppelte
export function heldenBenoetigt({ aussehen = [], eigenes = null, hfFigurVon }) {
  const ids = [];
  for (const a of [eigenes, ...aussehen]) {
    const id = a ? heldenIdAusAussehen(a, hfFigurVon) : null;
    if (id && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

// Ladeliste für die Figuren: [{ art: 'bild' | 'bogen', key, url }] ('bogen' = Spritesheet mit 160er-Feldern)
// optionen = state.optionen (Bit 256 neue Zombies, 512 neue Helden); alte Bögen nur, wenn das jeweilige Bit fehlt; helden = Ids der Helden, die jetzt gebraucht werden
export function figurenLadeliste({ optionen = 0, halb = false, helden = [] } = {}) {
  const liste = [];
  for (const f of ZF_FIGUREN) liste.push({ art: 'bild', key: 'zf_' + f, url: atlasPfad('grafik/zombies_' + f + '.webp', halb) });
  liste.push({ art: 'bild', key: 'hf_waffen', url: atlasPfad('grafik/helden_waffen.webp', halb) });
  for (const id of helden) if (HF_FIGUREN.includes(id)) liste.push({ art: 'bild', key: 'hf_' + id, url: atlasPfad('grafik/helden_' + id + '.webp', halb) });
  if (!(optionen & OPT_ZOMBIE_NEU)) liste.push({ art: 'bogen', key: 'figuren3', url: 'grafik/figuren3.webp' });
  if (!(optionen & OPT_HELDEN_NEU)) liste.push({ art: 'bogen', key: 'helden160', url: 'grafik/helden160.webp' });
  return liste;
}
// Alte Bögen, die bei diesen Optionsbits zusätzlich gebraucht werden (zum Nachladen beim Umschalten im laufenden Spiel): { figuren3, helden160 }
export const altBoegenNoetig = optionen => ({ figuren3: !(optionen & OPT_ZOMBIE_NEU), helden160: !(optionen & OPT_HELDEN_NEU) });

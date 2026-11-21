#!/usr/bin/env python3
"""Objekte aus dem Luftbild per Gemini lesen (Autos, Bäume, Pools, Schuppen, Hecken, Beläge) und als Felder in die Karten-JSON schreiben.
Quelle: Bayerische Vermessungsverwaltung, DOP (CC BY 4.0), WMTS by_dop Zoom 19 (öffentliche amtliche Luftbilder, nichts Privates).
Aufruf:  python3 tools/luftbild_gemini.py <karte> kacheln            Fotokacheln laden (Cache tools/luftbild/cache, nicht im Repo)
         python3 tools/luftbild_gemini.py <karte> fenster            Fensterliste + Prioritäten anzeigen
         python3 tools/luftbild_gemini.py <karte> lesen [N] [autos|rest]   Gemini lesen lassen (sequenziell, Ergebnisse in tools/luftbild/cache/gemini_<karte>/)
         python3 tools/luftbild_gemini.py <karte> auswerten          Rohlisten prüfen, Dubletten entfernen -> tools/luftbild/cache/auswertung_<karte>.json
Fenster: 80 m × 80 m (Nord oben), 0,125 m/px (640 px), Schritt 70 m."""
import io, json, math, os, pathlib, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kulisse as KU
from PIL import Image

WURZEL = KU.WURZEL; KARTEN = KU.KARTEN
CACHE = KU.CACHE
MODELLE = os.environ.get("GEMINI_MODELLE", "gemini-3.6-flash,gemini-3.7-flash,gemini-3-flash-preview,gemini-3.8-flash,gemini-3.5-flash").split(",")   # Reihenfolge der Ausweichmodelle (Tageskontingent 20 Anfragen je Modell)
MODELL = MODELLE[0]   # eigenes Tageskontingent je Modell (gemini-3.5-flash war nach ~25 Fenstern leer, die Ausweichmodelle liefern unbrauchbare Boxen)
BILDER = pathlib.Path(os.environ.get("FENSTERBILDER", "/tmp/luftbild_fenster")); BILDER.mkdir(parents=True, exist_ok=True)   # nicht unter .claude (Sperrliste der Bridge)
FENSTER_M, SCHRITT_M, PXM = 80, 70, 8      # Meter, Meter, Pixel je Meter im Fensterbild
KM = 4.0                                    # Meter je Kachel

def fenster_liste(karte):
    B, H = karte["breite"] * KM, karte["hoehe"] * KM
    nx, ny = math.ceil((B - FENSTER_M) / SCHRITT_M) + 1, math.ceil((H - FENSTER_M) / SCHRITT_M) + 1
    sx = (B - FENSTER_M) / max(1, nx - 1); sy = (H - FENSTER_M) / max(1, ny - 1)
    return [(i, j, round(i * sx, 1), round(j * sy, 1)) for j in range(ny) for i in range(nx)]

def gewicht(karte, x0, y0):
    """wie viel „Parkgelegenheit“ im Fenster: Parkplatzfläche (zählt stark), Häuser, Straßenlänge"""
    w = 0.0; x1, y1 = x0 + FENSTER_M, y0 + FENSTER_M
    for f in karte["flaechen"]:
        if f["a"] == "parkplatz":
            xs = [v * KM for v in f["p"][0::2]]; ys = [v * KM for v in f["p"][1::2]]
            if max(xs) > x0 and min(xs) < x1 and max(ys) > y0 and min(ys) < y1: w += 30
    for g in karte["gebaeude"]:
        if x0 <= g["x"] * KM < x1 and y0 <= g["y"] * KM < y1: w += 1
    return w

def foto_fenster(K, mos, tx0, ty0, x0m, y0m):
    W = FENSTER_M * PXM
    ax, ay = x0m / KM, y0m / KM; kk = FENSTER_M / KM
    (px, py), (qx, qy), (rx, ry) = K.merc(ax, ay), K.merc(ax + kk, ay), K.merc(ax, ay + kk)
    a, b, d, e = (qx - px) / W, (rx - px) / W, (qy - py) / W, (ry - py) / W
    return mos.transform((W, W), Image.AFFINE, (a, b, px - tx0 * 256, d, e, py - ty0 * 256), Image.BICUBIC)

def mosaik_laden(name, karte, K):
    return KU.mosaik(K, karte["breite"], karte["hoehe"])

# Gemini liefert Objekterkennung am genauesten als box_2d [ymin, xmin, ymax, xmax] normalisiert auf 0 bis 1000 (Pixelangaben waren stark verschoben)
PROMPT_AUTOS = """Luftbild (senkrechte Draufsicht, Norden oben) eines Wohngebiets, 80 m x 80 m. Finde alle geparkten Pkw und Transporter (auf Parkplätzen, in Parkbuchten am Straßenrand, in Einfahrten und Höfen; auch am Fahrbahnrand parkende). Keine Dächer, Container, Schatten, keine Anhänger. Antworte NUR mit JSON: [{"box_2d":[ymin,xmin,ymax,xmax],"label":"auto","farbe":"weiss|schwarz|grau|silber|rot|blau|gruen|gelb|braun"}] mit Koordinaten normalisiert auf 0 bis 1000 (wie bei Objekterkennung üblich)."""
PROMPT_REST = """Luftbild (senkrechte Draufsicht, Norden oben) eines Wohngebiets, 80 m x 80 m. Finde und antworte NUR mit JSON, Koordinaten normalisiert auf 0 bis 1000 (box_2d = [ymin,xmin,ymax,xmax], Punkte = [y,x]):
{"baeume":[{"box_2d":[..],"art":"laub|nadel"}],
 "pools":[{"box_2d":[..]}],
 "schuppen":[{"box_2d":[..]}],
 "hecken":[[[y,x],[y,x]]],
 "belaege":[[[y,x],[y,x],[y,x]]]}
baeume: jede einzelne Baumkrone (Draufsicht) und große Sträucher; bei dichtem Wald einzelne erkennbare Kronen. pools: Schwimmbecken. schuppen: Gartenhäuser, Carports, Garagen, Schuppen (kleine Nebengebäude, nicht die Wohnhäuser). hecken: lange schmale dichte Heckenstreifen als Mittellinie (mindestens 8 m lang). belaege: gepflasterte oder geschotterte Einfahrten, Höfe, Stellflächen an Häusern als Umriss-Polygon (keine Straße, keine Dächer, keine Wiese). Nur sicher Erkanntes; leere Listen sind erlaubt. Keine Kommentare im JSON."""
PROMPTS = {"autos": PROMPT_AUTOS, "rest": PROMPT_REST}

def lesen(name, karte, K, n_max, art="autos"):
    """art: autos | rest. Je Fenster eine Datei <i>_<j>_<art>.json. Sequenziell, bei Ratenlimit warten."""
    out = CACHE / f"gemini_{name}"; out.mkdir(parents=True, exist_ok=True)
    fl = sorted(fenster_liste(karte), key=lambda f: (-gewicht(karte, f[2], f[3]), f[1], f[0]))
    fl = [f for f in fl if gewicht(karte, f[2], f[3]) > 0]
    mos, tx0, ty0 = mosaik_laden(name, karte, K)
    from bridge import Bridge
    br = Bridge(); getan = 0
    global MODELL
    for i, j, x0, y0 in fl[:n_max]:
        pf = out / f"{i}_{j}_{art}.json"
        if pf.exists(): continue
        bp = BILDER / f"{i}_{j}.jpg"
        if not bp.exists(): foto_fenster(K, mos, tx0, ty0, x0, y0).save(bp, "JPEG", quality=88)
        antwort = None
        for versuch in range(6):
            try: antwort = br.call("ask_model", {"provider": "gemini", "prompt": PROMPTS[art], "images": [str(bp)], "model": MODELL, "temperature": 0.1, "max_tokens": 16000})
            except Exception as e: antwort = f"Fehler {e}"
            if antwort.startswith("Bild ") or antwort.startswith("Abgeblockt"): print("Fehler:", antwort[:150]); return
            if "429" in antwort or "Ausgewichen" in antwort or (antwort.startswith("[Gemini") and MODELL not in antwort[:60]) or "Ratenlimit" in antwort or antwort.startswith("Fehler") or "quota" in antwort.lower():
                print("  Kontingent leer:", MODELL, flush=True)
                if "per day" in antwort or "Ausgewichen" in antwort or antwort.startswith("[Gemini"):
                    if len(MODELLE) > 1: MODELLE.pop(0); MODELL = MODELLE[0]; print("  weiter mit", MODELL, flush=True); antwort = None; continue
                time.sleep(20 + 20 * versuch); antwort = None; continue
            break
        getan += 1
        if antwort is None: print("aufgegeben", i, j); continue
        pf.write_text(json.dumps({"i": i, "j": j, "x0": x0, "y0": y0, "art": art, "antwort": antwort}, ensure_ascii=False))
        print("Fenster", i, j, art, len(antwort), flush=True); time.sleep(3)

def main():
    name, was = sys.argv[1], sys.argv[2]
    karte = json.loads((KARTEN / f"{name}.json").read_text()); K = KU.Karte(karte)
    if was == "kacheln": mosaik_laden(name, karte, K)
    elif was == "fenster":
        fl = fenster_liste(karte); g = [gewicht(karte, f[2], f[3]) for f in fl]
        print(len(fl), "Fenster,", sum(1 for x in g if x > 0), "mit Gewicht,", sum(1 for x in g if x >= 5), "mit >= 5")
    elif was == "lesen": lesen(name, karte, K, int(sys.argv[3]) if len(sys.argv) > 3 else 9999, sys.argv[4] if len(sys.argv) > 4 else "autos")

if __name__ == "__main__":
    main()

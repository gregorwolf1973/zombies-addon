#!/usr/bin/env python3
"""Auto-Bogen: „Red Car (top-down)“ (simple-travel-car-top_view.svg, OpenGameArt, CC0 1.0) wird mit Chrome zu PNG gerendert,
auf Spielgröße (46×21 px Welt, Feld in 2-facher Auflösung) verkleinert und in 8 Lackfarben umgefärbt (gleiche Farben wie
AUTO_FARBEN in client/aussehen.mjs). Fahrtrichtung nach rechts.
Ergebnis: zombies/client/grafik/autos.webp + autos.json (feldB, feldH, spalten, autos: [{art, laenge, farbe, nr}]).
Aufruf: PYTHONPATH=~/code/ahnen-werkzeuge/pil python3 tools/autos_schneiden.py <simple-travel-car-top_view.svg>
Weitere Arten (kombi, kleinbus, taxi, polizei, krankenwagen, laster) fehlen mangels eindeutig freier Bilder; der Client zeichnet sie selbst."""
import json, pathlib, subprocess, sys, tempfile
from PIL import Image

QUELLE = pathlib.Path(sys.argv[1]).expanduser().resolve()
ZIEL = pathlib.Path(__file__).resolve().parent.parent / "zombies" / "client" / "grafik"
MASS = 2                      # Auflösung gegenüber der Welt
LANG, BREIT = 46, 21          # Weltgröße eines PKW in px
FELD_B, FELD_H = (LANG + 4) * MASS, (BREIT + 4) * MASS
FARBEN = ['#c62828', '#1565c0', '#eeeeee', '#2e7d32', '#424242', '#f9a825', '#6d4c41', '#90a4ae']   # = AUTO_FARBEN

with tempfile.TemporaryDirectory() as tmp:
    png = pathlib.Path(tmp) / "auto.png"
    subprocess.run(["google-chrome", "--headless=new", "--disable-gpu", f"--screenshot={png}", "--window-size=960,476",
                    "--default-background-color=00000000", f"file://{QUELLE}"], check=True, capture_output=True)
    roh = Image.open(png).convert("RGBA")
box = roh.getbbox()
roh = roh.crop(box)
auto = roh.resize((LANG * MASS, BREIT * MASS), Image.LANCZOS)

def hex2(h): return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))
BASIS = (200, 0, 0)           # Lack des Originals

def faerben(im, ziel):
    """Rote Lackpixel (Rotanteil dominiert) auf die Zielfarbe umrechnen; Scheiben, Kontur, Reifen bleiben."""
    ziel = hex2(ziel); out = im.copy(); p = out.load()
    for y in range(out.height):
        for x in range(out.width):
            r, g, b, a = p[x, y]
            if a and r > 60 and r > 2.2 * max(g, b, 1):
                k = r / BASIS[0]
                p[x, y] = (min(255, round(ziel[0] * k)), min(255, round(ziel[1] * k)), min(255, round(ziel[2] * k)), a)
    return out

autos = []
bogen = Image.new("RGBA", (FELD_B * len(FARBEN), FELD_H), (0, 0, 0, 0))
for i, f in enumerate(FARBEN):
    bogen.alpha_composite(faerben(auto, f), (i * FELD_B + (FELD_B - auto.width) // 2, (FELD_H - auto.height) // 2))
    autos.append({"art": "pkw", "laenge": LANG, "farbe": i, "nr": i})
assert bogen.width <= 4096 and bogen.height <= 4096
bogen.save(ZIEL / "autos.webp", quality=90, method=6)
(ZIEL / "autos.json").write_text(json.dumps({"feldB": FELD_B, "feldH": FELD_H, "spalten": len(FARBEN), "mass": MASS, "autos": autos}, ensure_ascii=False, indent=1))
print(f"{len(autos)} Autos, Bogen {bogen.size}, {(ZIEL / 'autos.webp').stat().st_size // 1024} KB")

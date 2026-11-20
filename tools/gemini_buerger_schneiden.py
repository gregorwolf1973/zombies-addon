#!/usr/bin/env python3
"""Bewohner-Typen aus einem Gemini-Bogen (2 Zeilen × 4 Spalten, weißer Grund, von oben, Blick nach rechts):
  dick, oma, jogger, geschaeftsfrau, teenager, bauarbeiter, opa, rucksack.
Stellt frei (Flutfüllung vom Rand, Komponenten je Zelle, eingeschlossene weiße Löcher weg wie in gemini_helden_waffen.py)
und schreibt grafik/buerger160.webp + buerger160.json (160er Felder, Drehpunkt = Körpermitte, ein Bild je Typ).
Alle Typen behalten ihr Größenverhältnis zueinander (ein gemeinsamer Maßstab), der dicke Mann bleibt also sichtbar breiter.
Dritter Parameter = Schlüssel-Endung (z. B. _versteckt): dann wird der Bogen (gleiche 8 Typen, gleiche Reihenfolge) als zusätzliche
Felder an die vorhandenen 8 Normalbilder angehängt (dick_versteckt …); ohne Endung werden die 8 Normalbilder neu geschrieben
(und eine vorhandene Versteckt-Reihe dabei verworfen – danach den Versteckt-Bogen erneut mit Endung einspielen).
Aufruf: PYTHONPATH=~/code/ahnen-werkzeuge/pil python3 tools/gemini_buerger_schneiden.py [Bogen.jpeg] [Ausgabeordner] [Endung]
Beispiel: ... tools/quellen/buerger_versteckt.jpeg zombies/client/grafik _versteckt"""
import json, math, pathlib, sys
from PIL import Image, ImageFilter

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from gemini_held_schneiden import freistellen, komponenten      # noqa: E402
from gemini_helden_waffen import loecher_weg                    # noqa: E402

QUELLE = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "~/Downloads/weitere Zombies von Gemini/buerger/buerger_8.jpeg").expanduser()
AUS = pathlib.Path(sys.argv[2] if len(sys.argv) > 2 else pathlib.Path(__file__).resolve().parent.parent / "zombies" / "client" / "grafik").expanduser()
ENDUNG = sys.argv[3] if len(sys.argv) > 3 else ""
NAMEN = ["dick", "oma", "jogger", "geschaeftsfrau", "teenager", "bauarbeiter", "opa", "rucksack"]
FELD = 160
MASSSTAB = 0.42         # Bogen-Pixel → Feldpixel (gleich für alle; Hände rechts brauchen Platz im Feld)


def zellen(im):
    W, H = im.size
    maske = freistellen(im)
    teile = {}
    for n, bbox, (cx, cy), pix in komponenten(maske):
        if n < 250: continue
        teile.setdefault((min(1, int(cy / (H / 2))), min(3, int(cx / (W / 4)))), []).append(pix)
    k = maske.load()
    aus = []
    for z in range(2):
        for s in range(4):
            pix = [p for t in teile[(z, s)] for p in t]
            x0 = min(p[0] for p in pix); y0 = min(p[1] for p in pix); x1 = max(p[0] for p in pix) + 1; y1 = max(p[1] for p in pix) + 1
            m = Image.new("L", (x1 - x0, y1 - y0), 0); mp = m.load()
            for x, y in pix: mp[x - x0, y - y0] = k[x, y]
            weich = m.filter(ImageFilter.GaussianBlur(0.8)).point(lambda v: 0 if v < 70 else min(255, int((v - 70) * 255 / 130)))
            b = im.crop((x0, y0, x1, y1)).convert("RGBA"); b.putalpha(weich)
            loecher_weg(b)
            aus.append(b)
    return aus


def koerpermitte(b):
    """Schwerpunkt der linken zwei Drittel der Figur (ohne die nach rechts ausgestreckten Hände)."""
    a = b.getchannel("A").load(); w, h = b.size
    sx = sy = n = 0
    for y in range(h):
        for x in range(int(w * 0.66)):
            if a[x, y] > 128: sx += x; sy += y; n += 1
    return sx / n, sy / n


def main():
    bilder = zellen(Image.open(QUELLE).convert("RGB"))
    n0 = len(NAMEN) if ENDUNG else 0          # Zahl der schon vorhandenen Normalfelder (davor bleibt alles stehen)
    atlas = Image.new("RGBA", ((n0 + len(NAMEN)) * FELD, FELD), (0, 0, 0, 0))
    liste = {}
    if ENDUNG:
        alt = Image.open(AUS / "buerger160.webp").convert("RGBA")
        atlas.alpha_composite(alt.crop((0, 0, n0 * FELD, FELD)), (0, 0))
        liste = {k: v for k, v in json.loads((AUS / "buerger160.json").read_text())["bilder"].items() if v[0] < n0}
    for i, (name, b) in enumerate(zip(NAMEN, bilder), start=n0):
        mx, my = koerpermitte(b)
        k = b.resize((max(1, round(b.width * MASSSTAB)), max(1, round(b.height * MASSSTAB))), Image.LANCZOS)
        f = Image.new("RGBA", (FELD, FELD), (0, 0, 0, 0))
        ox, oy = round(FELD / 2 - mx * MASSSTAB), round(FELD / 2 - my * MASSSTAB)
        if ox < 0 or oy < 0 or ox + k.width > FELD or oy + k.height > FELD:
            print("WARNUNG:", name, "passt nicht ins Feld", (ox, oy, k.size))
        f.alpha_composite(k, (ox, oy))
        atlas.alpha_composite(f, (i * FELD, 0))
        liste[name + ENDUNG] = [i]
        print(name, b.size, "Mitte", round(mx), round(my))
    atlas.save(AUS / "buerger160.webp", lossless=True)
    (AUS / "buerger160.json").write_text(json.dumps({"feld": FELD, "spalten": n0 + len(NAMEN), "bilder": liste}, indent=1))


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Stellt die 18 Zombies aus drei Gemini-Bögen (JPEG, weißer Grund, grauer Schattenkreis; je 2 Zeilen × 3 Spalten,
von oben, Blick nach rechts, abgetrennte Hände gehören zur Figur) frei und legt sie als Bildbogen
client/grafik/figuren3.webp (Felder 160 px, Drehpunkt = Körpermitte) plus figuren3.json ab.
Freistellen: Flutfüllung von den Bildrändern über helle, ungesättigte Pixel (Weiß, Hellgrau); weiße Kleidung
innerhalb der schwarzen Umrisse bleibt dadurch erhalten. Danach JPEG-Saum entfernen, Rand weich.
Aufruf: PYTHONPATH=~/code/ahnen-werkzeuge/pil python3 tools/gemini_zombies_schneiden.py [Ordner] [Kontaktbogen.png]"""
import json, pathlib, sys
from PIL import Image, ImageFilter

QUELLE = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "~/Downloads/weitere Zombies von Gemini").expanduser()
KONTAKT = sys.argv[2] if len(sys.argv) > 2 else None
ZIEL = pathlib.Path(__file__).resolve().parent.parent / "zombies" / "client" / "grafik"
FELD = 160
GROESSE = 112       # Zielgröße (längste Seite inkl. Hände) im Feld, wie die vorhandenen Zombies (~105 px)

# Reihenfolge je Bogen: Zeile für Zeile, links nach rechts (Dateiname-Teil → Typnamen)
BOEGEN = [
    ("jpdf68", ["kaminkehrer", "bauarbeiter", "koch", "holzfaeller", "mechaniker", "brandmeister"]),
    ("kvj01j", ["kehrer", "strassenarbeiter", "baecker", "flanell", "werkstatt", "vogelscheuche"]),
    ("ynoppy", ["postbote", "streife", "wachtmeister", "landstreicher", "mantel", "langhaar"]),
]

def freistellen(im):
    """Gibt (RGB, Maske L) zurück; Maske 255 = Figur."""
    w, h = im.size
    px = im.load()
    def hell(x, y):
        r, g, b = px[x, y]
        return min(r, g, b) >= 200 and max(r, g, b) - min(r, g, b) <= 34
    bg = bytearray(w * h)
    stapel = [(x, y) for x in range(w) for y in (0, h - 1)] + [(x, y) for y in range(h) for x in (0, w - 1)]
    while stapel:
        x, y = stapel.pop()
        if not (0 <= x < w and 0 <= y < h) or bg[y * w + x] or not hell(x, y): continue
        bg[y * w + x] = 1
        stapel += [(x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)]
    # JPEG-Saum: helle bis mittlere Randpixel neben dem Grund ebenfalls zum Grund (2 Durchgänge)
    for _ in range(2):
        neu = []
        for y in range(1, h - 1):
            for x in range(1, w - 1):
                if bg[y * w + x]: continue
                if bg[y * w + x - 1] or bg[y * w + x + 1] or bg[(y - 1) * w + x] or bg[(y + 1) * w + x]:
                    r, g, b = px[x, y]
                    if (r + g + b) / 3 > 105 and max(r, g, b) - min(r, g, b) <= 60 and min(r, g, b) > 90: neu.append(y * w + x)
        for i in neu: bg[i] = 1
    maske = Image.new("L", (w, h))
    maske.putdata([0 if v else 255 for v in bg])
    return maske

def komponenten(maske):
    """Zusammenhängende Teile der Maske → Liste von (Fläche, bbox, Schwerpunkt, Pixelmenge)."""
    w, h = maske.size
    k = maske.load()
    gesehen = bytearray(w * h)
    aus = []
    for y0 in range(h):
        for x0 in range(w):
            if k[x0, y0] < 128 or gesehen[y0 * w + x0]: continue
            st = [(x0, y0)]; gesehen[y0 * w + x0] = 1
            n = sx = sy = 0; bx0 = bx1 = x0; by0 = by1 = y0
            while st:
                x, y = st.pop(); n += 1; sx += x; sy += y
                bx0 = min(bx0, x); bx1 = max(bx1, x); by0 = min(by0, y); by1 = max(by1, y)
                for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                    if 0 <= nx < w and 0 <= ny < h and not gesehen[ny * w + nx] and k[nx, ny] >= 128:
                        gesehen[ny * w + nx] = 1; st.append((nx, ny))
            aus.append((n, (bx0, by0, bx1 + 1, by1 + 1), (sx / n, sy / n)))
    return aus

def figuren(datei):
    im = Image.open(datei).convert("RGB")
    w, h = im.size
    maske = freistellen(im)
    rest = []
    for n, bbox, (cx, cy) in komponenten(maske):
        if n < 300: continue     # Krümel
        rest.append((n, bbox, cx, cy))
    zellen = {}
    for n, bbox, cx, cy in rest:
        z, s = min(1, int(cy / (h / 2))), min(2, int(cx / (w / 3)))
        zellen.setdefault((z, s), []).append((n, bbox, cx, cy))
    aus = []
    for z in range(2):
        for s in range(3):
            teile = zellen[(z, s)]
            kern = max(teile)                       # größtes Teil = Körper (Drehpunkt)
            x0 = min(t[1][0] for t in teile); y0 = min(t[1][1] for t in teile)
            x1 = max(t[1][2] for t in teile); y1 = max(t[1][3] for t in teile)
            # nur Teile dieser Zelle behalten (kleine, nicht zugeordnete Krümel fallen weg)
            sb = (x0 - 3, y0 - 3, x1 + 3, y1 + 3)
            m = Image.new("L", im.size, 0)
            mp = m.load(); k = maske.load()
            for t in teile:
                b = t[1]
                for y in range(b[1], b[3]):
                    for x in range(b[0], b[2]): mp[x, y] = k[x, y]
            # unzugeordnete Pixel zwischen den Teilen (Löcher in der Figur) stehen schon in der Maske
            rgb = Image.composite(im, Image.new("RGB", im.size, (20, 20, 20)), m)
            weich = m.filter(ImageFilter.GaussianBlur(0.8)).point(lambda v: 0 if v < 70 else min(255, int((v - 70) * 255 / 130)))
            rgba = rgb.convert("RGBA"); rgba.putalpha(weich)
            aus.append((rgba.crop(sb), (kern[2] - sb[0], kern[3] - sb[1])))
    return aus

alle = []
for kennung, namen in BOEGEN:
    datei = next(QUELLE.glob(f"*{kennung}*.jpeg"))
    for name, (bild, mitte) in zip(namen, figuren(datei)): alle.append((name, bild, mitte))

mass = GROESSE / sorted(max(b.size) for _, b, _ in alle)[len(alle) // 2]     # ein gemeinsamer Maßstab (Median)
SPALTEN = 6
zeilen = (len(alle) + SPALTEN - 1) // SPALTEN
bogen = Image.new("RGBA", (SPALTEN * FELD, zeilen * FELD), (0, 0, 0, 0))
liste = {}
for i, (name, bild, (mx, my)) in enumerate(alle):
    st = bild.resize((round(bild.width * mass), round(bild.height * mass)), Image.LANCZOS)
    ox, oy = round(FELD / 2 - mx * mass), round(FELD / 2 - my * mass)
    feld = Image.new("RGBA", (FELD, FELD), (0, 0, 0, 0))
    feld.alpha_composite(st, (ox, oy)) if ox >= 0 and oy >= 0 and ox + st.width <= FELD and oy + st.height <= FELD else feld.paste(st, (ox, oy))
    if min(ox, oy) < 0 or ox + st.width > FELD or oy + st.height > FELD: print("WARNUNG: ragt aus dem Feld:", name, (ox, oy, st.size))
    bogen.paste(feld, ((i % SPALTEN) * FELD, (i // SPALTEN) * FELD))
    liste[name] = [i]
ZIEL.mkdir(parents=True, exist_ok=True)
bogen.save(ZIEL / "figuren3.webp", quality=88, method=6)
(ZIEL / "figuren3.json").write_text(json.dumps({"feld": FELD, "bilder": liste}, ensure_ascii=False, indent=1))
print(f"{len(alle)} Bilder, Maßstab {mass:.3f}, Bogen {bogen.size}, {(ZIEL / 'figuren3.webp').stat().st_size // 1024} KB")
if KONTAKT:
    k = Image.new("RGBA", bogen.size, (96, 120, 70, 255)); k.alpha_composite(bogen); k.convert("RGB").save(KONTAKT)

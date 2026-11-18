#!/usr/bin/env python3
"""Schneidet die KI-Figurenbögen (ChatGPT/Copilot, transparente PNGs) in gleich große Einzelbilder und legt sie
als Bildbogen client/grafik/figuren.png (Felder FELD×FELD, Drehpunkt = Feldmitte) plus figuren.json ab.
Aufruf: PYTHONPATH=~/code/ahnen-werkzeuge/pil python3 tools/figuren_schneiden.py [~/Downloads]"""
import json, pathlib, sys
from PIL import Image

QUELLE = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "~/Downloads").expanduser()
ZIEL = pathlib.Path(__file__).resolve().parent.parent / "zombies" / "client" / "grafik"
FELD = 160          # Feldgröße im Bogen (Pixel)
SPALTEN = 8

def figuren(datei, zeilen, spalten):
    """Figuren eines Bogens als {(zeile, spalte): (Ausschnitt RGBA, Maske)} – über Zusammenhangskomponenten der Deckkraft."""
    im = Image.open(QUELLE / datei).convert("RGBA")
    w, h = im.size
    a = im.getchannel("A")
    k = 2                                   # Komponenten auf halber Auflösung suchen
    klein = a.resize((w // k, h // k))
    kw, kh = klein.size
    px = klein.load()
    marke = [[-1] * kw for _ in range(kh)]
    komp = []
    for y in range(kh):
        for x in range(kw):
            if marke[y][x] != -1 or px[x, y] < 100: continue
            n = len(komp); stapel = [(x, y)]; marke[y][x] = n
            x0 = x1 = x; y0 = y1 = y; zahl = 0; sx = sy = 0
            while stapel:
                cx, cy = stapel.pop(); zahl += 1; sx += cx; sy += cy
                x0 = min(x0, cx); x1 = max(x1, cx); y0 = min(y0, cy); y1 = max(y1, cy)
                for nx, ny in ((cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)):
                    if 0 <= nx < kw and 0 <= ny < kh and marke[ny][nx] == -1 and px[nx, ny] >= 100:
                        marke[ny][nx] = n; stapel.append((nx, ny))
            komp.append({"bbox": (x0 * k, y0 * k, (x1 + 1) * k, (y1 + 1) * k), "zahl": zahl, "mx": sx / zahl * k, "my": sy / zahl * k})
    zellen = {}
    for c in komp:
        if c["zahl"] < 30: continue          # Krümel
        z = min(zeilen - 1, int(c["my"] / (h / zeilen))); s = min(spalten - 1, int(c["mx"] / (w / spalten)))
        b = zellen.setdefault((z, s), list(c["bbox"]))
        b[0] = min(b[0], c["bbox"][0]); b[1] = min(b[1], c["bbox"][1]); b[2] = max(b[2], c["bbox"][2]); b[3] = max(b[3], c["bbox"][3])
    aus = {}
    for (z, s), b in zellen.items():
        stueck = im.crop(tuple(b))
        # nur Pixel behalten, die zu dieser Zelle gehören (Nachbarfiguren, die in den Rahmen ragen, ausblenden)
        aus[(z, s)] = stueck
    return aus

def mitte(stueck, art):
    """Drehpunkt im Ausschnitt: Menschen = roter Haarschopf, sonst Schwerpunkt der Deckkraft."""
    w, h = stueck.size; p = stueck.load(); sx = sy = n = 0
    for y in range(0, h, 2):
        for x in range(0, w, 2):
            r, g, b, a = p[x, y]
            if a < 128: continue
            if art == "mensch" and not (r > 150 and g < 90 and b < 90): continue
            sx += x; sy += y; n += 1
    if not n: return w / 2, h / 2
    return sx / n, sy / n

def ins_feld(stueck, art, massstab):
    st = stueck.resize((max(1, round(stueck.width * massstab)), max(1, round(stueck.height * massstab))), Image.LANCZOS)
    mx, my = mitte(st, art)
    feld = Image.new("RGBA", (FELD, FELD), (0, 0, 0, 0))
    feld.alpha_composite(st, (round(FELD / 2 - mx), round(FELD / 2 - my)))
    # unsichtbare Farbe unter Alpha 0 löschen (spart Platz, kein dunkler Saum beim Skalieren)
    d = feld.load()
    for y in range(FELD):
        for x in range(FELD):
            if d[x, y][3] < 8: d[x, y] = (0, 0, 0, 0)
    return feld

UNTOTE = figuren("Zombie-Sprite-Sheet mit vier Untoten.png", 4, 6)
COMIC = figuren("Zombie-Survivor-Sprite-Sheet im Comic-Stil.png", 7, 4)
DESIGNER = figuren("Designer.png", 7, 4)

bilder, liste = [], {}
def neu(name, stueck, art, massstab):
    liste.setdefault(name, []).append(len(bilder))
    bilder.append(ins_feld(stueck, art, massstab))

M = 0.5   # alle Bögen haben 256-px-Felder → Figuren etwa 100–130 px
# laufende Zombies (echt von oben, je 6 Gehbilder) + Angriff aus dem Comic-Bogen
for nr, typ in enumerate(["tarn", "dirndl", "feuerwehr", "hemd"]):
    for s in range(6):
        if (nr, s) in UNTOTE: neu(f"zombie_{typ}", UNTOTE[(nr, s)], "zombie", M)
for typ, zeile in (("dirndl", 1), ("feuerwehr", 2), ("lederhose", 0)):
    if (zeile, 3) in COMIC: neu(f"zombie_{typ}_angriff", COMIC[(zeile, 3)], "zombie", M)
for s in range(3):   # Lederhosen-Zombie: drei Gehbilder aus dem Comic-Bogen
    if (0, s) in COMIC: neu("zombie_lederhose", COMIC[(0, s)], "zombie", M)
# Kriecher: Comic (2 Typen × 2 Bilder), Designer (2 × 2)
for s in range(4):
    if (3, s) in COMIC: neu(f"kriecher_{'a' if s < 2 else 'b'}", COMIC[(3, s)], "zombie", M)
for s in range(4):
    if (3, s) in DESIGNER: neu(f"kriecher_{'c' if s < 2 else 'd'}", DESIGNER[(3, s)], "zombie", M * 0.85)
# tote Zombies: Comic passend zu den Läufern, Designer als Zusatz
for s, typ in enumerate(["lederhose", "dirndl", "feuerwehr", "hemd"]):
    if (4, s) in COMIC: neu(f"leiche_{typ}", COMIC[(4, s)], "zombie", M)
for s, typ in enumerate(["lederhose2", "dirndl2", "feuerwehr2", "tarn"]):
    if (4, s) in DESIGNER: neu(f"leiche_{typ}", DESIGNER[(4, s)], "zombie", M * 0.85)
# Menschen: Mann (Reihe 6), Frau (Reihe 7); ohne Waffe, Pistole, Schläger, Messer
for zeile, wer in ((5, "mann"), (6, "frau")):
    for s, waffe in enumerate(["hand", "pistole", "schlaeger", "messer"]):
        if (zeile, s) in COMIC: neu(f"{wer}_{waffe}", COMIC[(zeile, s)], "mensch", M)

zeilen = (len(bilder) + SPALTEN - 1) // SPALTEN
bogen = Image.new("RGBA", (SPALTEN * FELD, zeilen * FELD), (0, 0, 0, 0))
for i, b in enumerate(bilder): bogen.paste(b, ((i % SPALTEN) * FELD, (i // SPALTEN) * FELD))
ZIEL.mkdir(parents=True, exist_ok=True)
bogen.save(ZIEL / "figuren.png", optimize=True)
(ZIEL / "figuren.json").write_text(json.dumps({"feld": FELD, "bilder": liste}, ensure_ascii=False, indent=1))
print(f"{len(bilder)} Bilder, Bogen {bogen.size}, {(ZIEL / 'figuren.png').stat().st_size // 1024} KB")
for n, l in liste.items(): print(f"  {n}: {len(l)}")
print("Gefunden: Untote", sorted(UNTOTE), "\nComic", sorted(COMIC), "\nDesigner", sorted(DESIGNER))

#!/usr/bin/env python3
"""Möbel aus den zwei Gemini-Bögen (moebel_wohnen.jpeg, moebel_laden_safe.jpeg) freistellen und als Bildbogen
client/grafik/moebel.webp + moebel.json ablegen.
Jedes Möbel steht in Grundausrichtung (Rückseite/Kopfende oben) in der Kachelgröße b×h des Spiels, 64 px je Kachel
(2× KACHEL 32). Der Client dreht in Viertelschritten (Rückseite zur Wand) und fällt bei abweichender Größe auf die
gezeichnete Fassung zurück.
Aufruf: PYTHONPATH=~/code/ahnen-werkzeuge/pil python3 tools/gemini_moebel_schneiden.py [Ordner mit den Bögen]
(nicht mit -I: das ignoriert PYTHONPATH)"""
import json, pathlib, sys
sys.path.insert(0, str(pathlib.Path("~/code/ahnen-werkzeuge/pil").expanduser()))
from PIL import Image, ImageChops, ImageFilter

ORDNER = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "~/Downloads/weitere Zombies von Gemini/moebel").expanduser()
AUS = pathlib.Path(__file__).resolve().parent.parent / "zombies" / "client" / "grafik"
PX = 64            # Pixel je Kachel im Bogen
STRECK = 1.25      # so viel darf eine Achse gegenüber gleichmäßiger Skalierung gestreckt werden
RAND = 2           # Luft zum Kachelrand (Bogen-px)

# Reihenfolge = zeilenweise im Bogen; (Name, b, h) in Kacheln
WOHNEN = [("bett", 2, 3), ("schrank", 2, 1), ("kommode", 1, 1), ("garderobe", 1, 1),
          ("sofa", 3, 1), ("couchtisch", 2, 1), ("esstisch", 2, 2), ("herd", 1, 1),
          ("spuele", 1, 1), ("kuehlschrank", 1, 1), ("badewanne", 2, 1), ("klo", 1, 1),
          ("waschbecken", 1, 1), ("heizung", 2, 1), ("regal", 1, 2), ("alter_schrank", 2, 1)]
LADEN = [("regal_lang", 1, 3), ("kasse", 2, 1), ("kiste", 1, 1), ("lagerregal", 1, 2),
         ("vorratsregal", 2, 1), ("feldbett", 1, 2), ("funktisch", 2, 1), ("generator", 1, 1),
         ("kanister", 1, 1), ("erstehilfe", 1, 1), ("safe_kuehlschrank", 1, 1), ("bw_kiste", 1, 1)]
BOEGEN = [("moebel_wohnen.jpeg", WOHNEN, 4, 4), ("moebel_laden_safe.jpeg", LADEN, 4, 3)]


def freistellen(im):
    """Maske (255 = Möbel): Flutfüllung über helle, ungesättigte Pixel von den Rändern her."""
    w, h = im.size
    px = im.load()
    def hell(x, y):
        r, g, b = px[x, y]
        return min(r, g, b) >= 200 and max(r, g, b) - min(r, g, b) <= 34
    bg = bytearray(w * h)
    st = [(x, y) for x in range(w) for y in (0, h - 1)] + [(x, y) for y in range(h) for x in (0, w - 1)]
    while st:
        x, y = st.pop()
        if not (0 <= x < w and 0 <= y < h) or bg[y * w + x] or not hell(x, y): continue
        bg[y * w + x] = 1
        st += [(x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)]
    for _ in range(2):          # hellen JPEG-Saum am Rand mit abtragen
        neu = []
        for y in range(1, h - 1):
            for x in range(1, w - 1):
                if bg[y * w + x]: continue
                if bg[y * w + x - 1] or bg[y * w + x + 1] or bg[(y - 1) * w + x] or bg[(y + 1) * w + x]:
                    r, g, b = px[x, y]
                    if (r + g + b) / 3 > 105 and max(r, g, b) - min(r, g, b) <= 60 and min(r, g, b) > 90: neu.append(y * w + x)
        for i in neu: bg[i] = 1
    m = Image.new("L", (w, h))
    m.putdata([0 if v else 255 for v in bg])
    return m


def gruppen(maske, Q=4, dil=21):
    """Teile eines Möbels (Stühle, Kabel …) zusammenfassen: Maske verdicken, grob beschriften.
    Gibt (Beschriftungsbild L in Voll­größe, Anzahl) zurück; Beschriftung 1..n, nur Gruppen > 600 px Fläche."""
    w, h = maske.size
    dick = maske.filter(ImageFilter.MaxFilter(dil)).resize((w // Q, h // Q), Image.NEAREST)
    kw, kh = dick.size; k = dick.load()
    lab = [[0] * kw for _ in range(kh)]; n = 0; flaechen = {}
    for y0 in range(kh):
        for x0 in range(kw):
            if k[x0, y0] < 128 or lab[y0][x0]: continue
            n += 1; lab[y0][x0] = n; st = [(x0, y0)]; c = 0
            while st:
                x, y = st.pop(); c += 1
                for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                    if 0 <= nx < kw and 0 <= ny < kh and not lab[ny][nx] and k[nx, ny] >= 128:
                        lab[ny][nx] = n; st.append((nx, ny))
            flaechen[n] = c
    gross = [i for i, c in flaechen.items() if c * Q * Q > 600]
    neu = {alt: i + 1 for i, alt in enumerate(gross)}
    bild = Image.new("L", (kw, kh))
    bild.putdata([neu.get(v, 0) for row in lab for v in row])
    return bild.resize((w, h), Image.NEAREST), len(gross)


def teile(im, maske, zeilen, spalten, erwartet):
    lab, n = gruppen(maske)
    ausgabe = []
    for i in range(1, n + 1):
        gm = ImageChops.multiply(lab.point(lambda v, i=i: 255 if v == i else 0), maske)
        bb = gm.getbbox()
        if not bb: continue
        ausgabe.append((gm, bb, (bb[1] + bb[3]) / 2, (bb[0] + bb[2]) / 2))
    if len(ausgabe) != erwartet:
        raise SystemExit(f"{len(ausgabe)} Möbel erkannt, erwartet {erwartet}")
    zh = im.height / zeilen
    reihen = [[] for _ in range(zeilen)]
    for t in ausgabe: reihen[min(zeilen - 1, int(t[2] // zh))].append(t)
    geordnet = []
    for r in reihen:
        if len(r) != spalten: raise SystemExit(f"Zeile mit {len(r)} statt {spalten} Möbeln")
        geordnet += sorted(r, key=lambda t: t[3])
    return geordnet


def zuschnitt(im, gm, bb, b, h):
    """Möbel ausschneiden und in eine b×h-Kachelfläche (PX je Kachel) einpassen."""
    weich = gm.filter(ImageFilter.GaussianBlur(0.8)).point(lambda v: 0 if v < 70 else min(255, int((v - 70) * 255 / 130)))
    rgba = im.convert("RGBA"); rgba.putalpha(weich)
    teil = rgba.crop(bb)
    if b != h and (teil.width > teil.height) != (b > h) and max(teil.width, teil.height) / min(teil.width, teil.height) > 1.3:
        teil = teil.transpose(Image.ROTATE_90)       # Bogen zeigt das Möbel quer zur gewünschten Lage (z. B. Couchtisch)
    zw, zh = b * PX - 2 * RAND, h * PX - 2 * RAND
    s = min(zw / teil.width, zh / teil.height)
    sx = min(zw / teil.width, s * STRECK); sy = min(zh / teil.height, s * STRECK)
    nw, nh = max(1, round(teil.width * sx)), max(1, round(teil.height * sy))
    teil = teil.resize((nw, nh), Image.LANCZOS)
    kachel = Image.new("RGBA", (b * PX, h * PX), (0, 0, 0, 0))
    kachel.alpha_composite(teil, ((b * PX - nw) // 2, (h * PX - nh) // 2))
    return kachel


def main():
    kacheln = []
    for datei, liste, sp, ze in BOEGEN:
        im = Image.open(ORDNER / datei).convert("RGB")
        gt = teile(im, freistellen(im), ze, sp, len(liste))
        for (name, b, h), (gm, bb, _, _) in zip(liste, gt):
            kacheln.append((name, b, h, zuschnitt(im, gm, bb, b, h)))
    # Regalpacken: Zeilen mit 1024 px Breite, hohe zuerst
    kacheln.sort(key=lambda k: (-k[2], k[0]))
    BREITE = 1024
    x = y = zh = 0; ort = {}
    for name, b, h, bild in kacheln:
        if x + bild.width > BREITE: x, y, zh = 0, y + zh, 0
        ort[name] = {"x": x, "y": y, "b": b, "h": h}
        x += bild.width; zh = max(zh, bild.height)
    bogen = Image.new("RGBA", (BREITE, y + zh), (0, 0, 0, 0))
    for name, b, h, bild in kacheln: bogen.alpha_composite(bild, (ort[name]["x"], ort[name]["y"]))
    bogen.save(AUS / "moebel.webp", quality=88, method=6)
    (AUS / "moebel.json").write_text(json.dumps({"px": PX, "moebel": ort}, ensure_ascii=False, indent=1) + "\n")
    print("OK", len(ort), "Möbel, Bogen", bogen.size)
    # Vorschau (nicht im Spiel): auf grauem Grund
    vor = Image.new("RGBA", bogen.size, (150, 120, 90, 255)); vor.alpha_composite(bogen)
    vor.convert("RGB").save(ORDNER / "moebel_vorschau.png")


main()

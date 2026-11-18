#!/usr/bin/env python3
"""Auto-Bogen aus freien OpenGameArt-Bildern (Quellen und Lizenzen: zombies/client/grafik/LIZENZ.txt).
Alle Fahrzeuge werden freigestellt, mit der Front nach rechts gedreht und auf Spielgröße verkleinert (Feld in 2-facher
Auflösung; PKW 46 px lang). Der „Red Car“ wird zusätzlich in 8 Lackfarben umgefärbt (= AUTO_FARBEN in client/aussehen.mjs).
Ergebnis: zombies/client/grafik/autos.webp + autos.json
  {feldB, feldH, spalten, zeilen, mass, autos: [{art, laenge, breite, farbe, nr, anim?}]}; nr zählt zeilenweise (Spalte nr % spalten).
  art: pkw, sport, taxi, kleinbus, transporter, laster, polizei, krankenwagen; anim = 1..3 sind Blaulicht-Bilder von polizei/krankenwagen.
Aufruf: PYTHONPATH=~/code/ahnen-werkzeuge/pil python3 tools/autos_schneiden.py [<Ordner mit den Downloads, Standard ~/Downloads>]
Benötigt in dem Ordner: simple-travel-car-top_view.svg, Topdown_vehicle_sprites_pack_Unluckystudio.zip, „TRBRYcars [Converted] sedan.svg“,
„Car Sprite.png“, topdowncar_2.svg, topdowncar_3.svg, topdowncar_4.svg. Chrome rendert die SVGs."""
import warnings; warnings.simplefilter("ignore")
import io, json, pathlib, re, subprocess, sys, tempfile, zipfile
from PIL import Image

DL = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "~/Downloads").expanduser().resolve()
ZIEL = pathlib.Path(__file__).resolve().parent.parent / "zombies" / "client" / "grafik"
MASS = 2                      # Auflösung gegenüber der Welt
LANG, BREIT = 46, 21          # Weltgröße eines PKW in px
FARBEN = ['#c62828', '#1565c0', '#eeeeee', '#2e7d32', '#424242', '#f9a825', '#6d4c41', '#90a4ae']   # = AUTO_FARBEN
MAX_LANG, MAX_BREIT = 90, 44  # größte Fahrzeuge (Laster, Weltpixel) – bestimmt die Feldgröße
FELD_B, FELD_H = (MAX_LANG + 4) * MASS, (MAX_BREIT + 4) * MASS
tmp = pathlib.Path(tempfile.mkdtemp(prefix="autos_"))

def chrome(svg_text, name, groesse):
    """SVG mit Chrome zu PNG mit durchsichtigem Hintergrund rendern."""
    s = tmp / (name + ".svg"); s.write_text(svg_text)
    png = tmp / (name + ".png")
    subprocess.run(["google-chrome", "--headless=new", "--disable-gpu", f"--screenshot={png}", f"--window-size={groesse[0]},{groesse[1]}",
                    "--default-background-color=00000000", f"file://{s}"], check=True, capture_output=True)
    return Image.open(png).convert("RGBA")

def weit(svg, ohne_hintergrund):
    """Die A4-Seite der looneybits-Dateien ist zu klein für die Autos: großen Ausschnitt rendern, blaue Fläche entfernen."""
    t = re.sub(r'(<svg[^>]*?)\s(width|height)="[^"]*"', r'\1', svg, count=1, flags=re.S)
    t = re.sub(r'(<svg[^>]*?)\s(width|height)="[^"]*"', r'\1', t, count=1, flags=re.S)
    t = t.replace('<svg', '<svg width="2400" height="1800" viewBox="-1200 -900 4000 3000"', 1)
    if ohne_hintergrund:
        t = re.sub(r'<rect\b[^>]*>', lambda m: re.sub(r'fill:#[0-9a-f]{6}', 'fill:none', m.group(0), count=1)
                   if re.search(r'width="(1[0-9]{3}|[5-9][0-9]{2})', m.group(0)) else m.group(0), t, flags=re.S)
    return t

def klar(im, schwelle=60):
    """Schwache Alphawerte (Schatten) entfernen."""
    r, g, b, a = im.split()
    return Image.merge("RGBA", (r, g, b, a.point(lambda v: 0 if v < schwelle else v)))

def zerlegen(im, luecke=8, min_breite=60):
    """Autos nebeneinander an leeren Spalten trennen; liefert zugeschnittene Einzelbilder von links nach rechts."""
    a = im.split()[3].point(lambda v: 255 if v > 60 else 0)
    w, h = im.size; spalten = [a.crop((x, 0, x + 1, h)).getbbox() is not None for x in range(w)]
    teile, start, leer = [], None, 0
    for x, belegt in enumerate(spalten + [False] * (luecke + 1)):
        if belegt:
            if start is None: start = x
            leer = 0
        elif start is not None:
            leer += 1
            if leer >= luecke:
                if x - leer + 1 - start >= min_breite: teile.append(im.crop((start, 0, x - leer + 1, h)))
                start = None
    return teile

def stelle(im, laenge, drehen, box=None, schwelle=60):
    """Drehen (Grad, gegen den Uhrzeigersinn) damit die Front nach rechts zeigt, zuschneiden, auf Länge (Weltpixel) skalieren."""
    im = klar(im, schwelle).rotate(drehen, expand=True)
    box = box or im.getbbox()
    im = im.crop(box)
    breite = max(2, round(im.height * laenge * MASS / im.width))
    return im.resize((laenge * MASS, min(breite, MAX_BREIT * MASS)), Image.LANCZOS), box

def hex2(h): return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))

def faerben(im, ziel):
    """Rote Lackpixel (Rotanteil dominiert) auf die Zielfarbe umrechnen; Scheiben, Kontur, Reifen bleiben."""
    ziel = hex2(ziel); out = im.copy(); p = out.load()
    for y in range(out.height):
        for x in range(out.width):
            r, g, b, a = p[x, y]
            if a and r > 60 and r > 2.2 * max(g, b, 1):
                k = r / 200
                p[x, y] = (min(255, round(ziel[0] * k)), min(255, round(ziel[1] * k)), min(255, round(ziel[2] * k)), a)
    return out

def naechste_farbe(im):
    """Index der AUTO_FARBEN, die dem Lack (kräftigste Pixel) am nächsten liegt."""
    px = [p for p in im.getdata() if p[3] > 200 and max(p[:3]) - min(p[:3]) > 40] or [p for p in im.getdata() if p[3] > 200]
    m = [sum(p[i] for p in px) / len(px) for i in range(3)]
    return min(range(len(FARBEN)), key=lambda i: sum((m[k] - hex2(FARBEN[i])[k]) ** 2 for k in range(3)))

eintraege = []   # (bild, art, laenge, farbe, anim)
def add(bild, art, laenge, farbe=None, anim=None):
    eintraege.append((bild, art, laenge, naechste_farbe(bild) if farbe is None else farbe, anim))

# 1. Red Car (CC0): 8 Lackfarben
roh = chrome((DL / "simple-travel-car-top_view.svg").read_text(), "red", (960, 476))
auto = roh.crop(roh.getbbox()).resize((LANG * MASS, BREIT * MASS), Image.LANCZOS)
for i, f in enumerate(FARBEN): add(faerben(auto, f), "pkw", LANG, i)

# 2. Unlucky Studio (CC0): Front zeigt nach oben -> 90° im Uhrzeigersinn
with zipfile.ZipFile(DL / "Topdown_vehicle_sprites_pack_Unluckystudio.zip") as z:
    def png(n): return Image.open(io.BytesIO(z.read("Topdown_vehicle_sprites_pack/" + n))).convert("RGBA")
    for n, art, l in [("Car", "sport", 46), ("Audi", "sport", 46), ("Black_viper", "sport", 46), ("taxi", "taxi", 46), ("Mini_van", "kleinbus", 54),
                      ("truck", "laster", 90), ("Mini_truck", "laster", 90)]:
        add(stelle(png(n + ".png"), l, -90)[0], art, l)
    for n, art, l, d in [("Police", "polizei", 50, "Police_animation"), ("Ambulance", "krankenwagen", 56, "ambulance_animation")]:
        bild, box = stelle(png(n + ".png"), l, -90)
        add(bild, art, l, 2 if art == "polizei" else 2)
        for k in (1, 2, 3): add(stelle(png(f"{d}/{k}.png"), l, -90, box)[0], art, l, 2, k)

# 3. TRBRY „Car Sedan“ (CC-BY 3.0, Front rechts)
add(stelle(chrome((DL / "TRBRYcars [Converted] sedan.svg").read_text(), "sedan", (840, 400)), LANG, 0)[0], "pkw", LANG)

# 4. Cliipso „Top Down Car Sprite“ (CC-BY 3.0): nur das gerade Bild (Reihe 4, Spalte 1), Front rechts
cl = Image.open(DL / "Car Sprite.png").convert("RGBA")
zh = cl.height // 6; zb = cl.width // 3
add(stelle(cl.crop((0, 3 * zh + 20, zb - 8, 4 * zh - 25)), LANG, 0)[0], "pkw", LANG)

# 5. looneybits „TopDownCar 2/3/4“ (CC0): Front zeigt nach unten -> 90° gegen den Uhrzeigersinn; offene Türen auslassen
for datei, nutze in [("topdowncar_2.svg", [(0, "transporter", 56), (2, "transporter", 56)]),
                     ("topdowncar_3.svg", [(0, "pkw", 46), (2, "pkw", 46)]),
                     ("topdowncar_4.svg", [(0, "pkw", 46), (1, "pkw", 46), (2, "pkw", 46)])]:
    teile = zerlegen(chrome(weit((DL / datei).read_text(), True), datei[:-4], (2400, 1800)))
    assert len(teile) == 3, (datei, len(teile))
    for i, art, l in nutze: add(stelle(teile[i], l, 90, None, 150)[0], art, l)   # hoher Schwellwert: weicher Schlagschatten fällt weg

SPALTEN = 21
ZEILEN = -(-len(eintraege) // SPALTEN)
bogen = Image.new("RGBA", (FELD_B * min(SPALTEN, len(eintraege)), FELD_H * ZEILEN), (0, 0, 0, 0))
autos = []
for nr, (bild, art, laenge, farbe, anim) in enumerate(eintraege):
    x, y = (nr % SPALTEN) * FELD_B, (nr // SPALTEN) * FELD_H
    bogen.alpha_composite(bild, (x + (FELD_B - bild.width) // 2, y + (FELD_H - bild.height) // 2))
    e = {"art": art, "laenge": laenge, "breite": round(bild.height / MASS), "farbe": farbe, "nr": nr}
    if anim: e["anim"] = anim
    autos.append(e)
assert bogen.width <= 4096 and bogen.height <= 4096
bogen.save(ZIEL / "autos.webp", quality=90, method=6)
(ZIEL / "autos.json").write_text(json.dumps({"feldB": FELD_B, "feldH": FELD_H, "spalten": min(SPALTEN, len(eintraege)), "zeilen": ZEILEN, "mass": MASS, "autos": autos}, ensure_ascii=False, indent=1))
arten = {}
for a in autos: arten[a["art"]] = arten.get(a["art"], 0) + 1
print(f"{len(autos)} Bilder {arten}, Bogen {bogen.size}, {(ZIEL / 'autos.webp').stat().st_size // 1024} KB")

#!/usr/bin/env python3
"""Zweiter Figurenbogen aus OpenGameArt-Paketen: Survivor (Riley Gombart, CC-BY 3.0), Zombies (Riley Gombart: tds_zombie CC0,
zombie_01 OGA-BY 3.0), Bürger (KonitaTutorials, CC-BY 3.0), Waffen und Mündungsblitz (Survivor Spine, CC-BY 3.0).
Ergebnis: zombies/client/grafik/figuren2.png (Felder FELD×FELD, Drehpunkt = Feldmitte, Blick nach rechts) + figuren2.json.
Aufruf: PYTHONPATH=~/code/ahnen-werkzeuge/pil python3 tools/figuren2_schneiden.py <Ordner mit entpackten Paketen>"""
import glob, json, pathlib, re, sys
from PIL import Image

QUELLE = pathlib.Path(sys.argv[1]).expanduser()
ZIEL = pathlib.Path(__file__).resolve().parent.parent / "zombies" / "client" / "grafik"
FELD, SPALTEN = 224, 12

def zahl(f): m = re.findall(r'(\d+)\.png$', str(f)); return int(m[-1]) if m else 0
def dateien(muster): return sorted(glob.glob(str(QUELLE / muster)), key=zahl)
def auswahl(liste, n): return liste if len(liste) <= n else [liste[round(i * (len(liste) - 1) / (n - 1))] for i in range(n)]

def schwerpunkt(im, bed):
    p = im.load(); w, h = im.size; sx = sy = n = 0
    for y in range(0, h, 2):
        for x in range(0, w, 2):
            if bed(*p[x, y]): sx += x; sy += y; n += 1
    return (sx / n, sy / n) if n else (w / 2, h / 2)

bilder, liste = [], {}
def ins_feld(im, massstab, mitte, drehen=0):
    """im um mitte (in Originalpixeln) in ein Feld setzen; drehen in Grad (Blick nach rechts angleichen)"""
    if drehen:
        im = im.rotate(drehen, resample=Image.BICUBIC, expand=True, center=None)
    st = im.resize((max(1, round(im.width * massstab)), max(1, round(im.height * massstab))), Image.LANCZOS)
    feld = Image.new("RGBA", (FELD, FELD), (0, 0, 0, 0))
    feld.alpha_composite(st, (round(FELD / 2 - mitte[0] * massstab), round(FELD / 2 - mitte[1] * massstab)))
    return feld

def gruppe(name, liste_dateien, massstab, mitte_fn, drehen=0):
    for f in liste_dateien:
        im = Image.open(f).convert("RGBA")
        liste.setdefault(name, []).append(len(bilder))
        bilder.append(ins_feld(im, massstab, mitte_fn(im, f), drehen))

dunkel = lambda r, g, b, a: a > 128 and r + g + b < 200

# ---------- Survivor: Drehpunkt = dunkler Kopf/Rucksack im linken Teil, je Gruppe aus dem ersten Bild ----------
SV = "survivor/Top_Down_Survivor"
for waffe, unser in (("handgun", "pistole"), ("rifle", "gewehr"), ("shotgun", "schrot"), ("knife", "messer"), ("flashlight", "lampe")):
    for art, n in (("idle", 8), ("move", 10), ("shoot", 3), ("meleeattack", 8), ("reload", 8)):
        fs = auswahl(dateien(f"{SV}/{waffe}/{art}/*.png"), n)
        if not fs: continue
        erst = Image.open(fs[0]).convert("RGBA")
        w = erst.width
        m = schwerpunkt(erst, lambda r, g, b, a, w=w: False)   # Platzhalter
        # Kopfbereich: dunkle Pixel in den linken 55 %
        p = erst.load(); sx = sy = k = 0
        for y in range(0, erst.height, 2):
            for x in range(0, int(w * 0.55), 2):
                if dunkel(*p[x, y]): sx += x; sy += y; k += 1
        m = (sx / k, sy / k) if k else (w * 0.3, erst.height / 2)
        gruppe(f"sv_{unser}_{art}", fs, 0.5, lambda im, f, m=m: m)
for art, n in (("walk", 10), ("run", 10), ("idle", 1)):
    fs = auswahl(dateien(f"{SV}/../../survivor/Top_Down_Survivor/feet/{art}/*.png") or dateien(f"{SV}/feet/{art}/*.png"), n)
    if not fs: continue
    erst = Image.open(fs[0]).convert("RGBA")
    m = schwerpunkt(erst, lambda r, g, b, a: a > 128)
    gruppe(f"sv_fuesse_{art}", fs, 0.5, lambda im, f, m=m: m)

# ---------- Zombies von Riley Gombart ----------
# tds_zombie: Drehpunkt = Mitte des Kopfes (rötlicher Fleck in der Mitte) ≈ Schwerpunkt; je Gruppe fest
for art, unser, n in (("move", "laufen", 10), ("attack", "angriff", 6), ("idle", "stehen", 6)):
    fs = auswahl(dateien(f"tds_zombie/export/skeleton-{art}_*.png"), n)
    if not fs: continue
    m = schwerpunkt(Image.open(fs[0]).convert("RGBA"), lambda r, g, b, a: a > 128)
    gruppe(f"z6_{unser}", fs, 0.42, lambda im, f, m=m: m)
# zombie_01: Figur klein in 256er-Bildern → eng zuschneiden (gemeinsamer Rahmen je Gruppe), vergrößern
for art, unser, n in (("walk", "laufen", 12), ("attack01", "angriff", 6), ("idle", "stehen", 6), ("death01", "sterben", 6), ("death02", "sterben2", 6)):
    fs = auswahl(dateien(f"zombie01/{art}/*.png"), n)
    if not fs: continue
    m = schwerpunkt(Image.open(fs[0]).convert("RGBA"), lambda r, g, b, a: a > 128)
    gruppe(f"z7_{unser}", fs, 1.35, lambda im, f, m=m: (im.width - m[0], im.height - m[1]), drehen=180)   # blickt nach links → umdrehen

# ---------- Bürger: Bilder verschieden groß → jedes Bild am Haar ausrichten ----------
haar = lambda r, g, b, a: a > 128 and r > 95 and g < 85 and b > 60 and r > b
for civ in (1, 2, 3):
    fs = [str(QUELLE / f"citizens/Citizens/Walk{i}Civ{civ}.png") for i in range(1, 7)]
    gruppe(f"buerger{civ}", fs, 0.55, lambda im, f: schwerpunkt(im, haar))

# ---------- Waffen und Mündungsblitz aus Survivor Spine (als Einzelbilder für die eigenen Figuren) ----------
for teil, massstab in (("rifle", 0.5), ("shotgun", 0.5), ("knife", 0.5), ("flashlight", 0.5)):
    fs = dateien(f"Survivor_Spine/Survivor Spine/images/{teil}.png")
    if fs: gruppe(f"waffe_{teil}", fs, massstab, lambda im, f: (im.width * 0.15, im.height / 2))
blitz = dateien("Survivor_Spine/Survivor Spine/images/muzzle_flash_01.png")
if blitz: gruppe("muendungsblitz", blitz, 0.5, lambda im, f: (im.width * 0.2, im.height / 2))

zeilen = (len(bilder) + SPALTEN - 1) // SPALTEN
bogen = Image.new("RGBA", (SPALTEN * FELD, zeilen * FELD), (0, 0, 0, 0))
for i, b in enumerate(bilder): bogen.paste(b, ((i % SPALTEN) * FELD, (i // SPALTEN) * FELD))
bogen.save(ZIEL / "figuren2.png", optimize=True)
(ZIEL / "figuren2.json").write_text(json.dumps({"feld": FELD, "spalten": SPALTEN, "bilder": liste}, ensure_ascii=False, indent=1))
print(f"{len(bilder)} Bilder, Bogen {bogen.size}, {(ZIEL / 'figuren2.png').stat().st_size // 1024} KB")
for n, l in liste.items(): print(f"  {n}: {len(l)}")

#!/usr/bin/env python3
"""Zweiter Figurenbogen aus OpenGameArt-Paketen: Survivor (Riley Gombart, CC-BY 3.0), Zombies (Riley Gombart: tds_zombie CC0,
zombie_01 OGA-BY 3.0), Bürger und Polizisten (KonitaTutorials, CC-BY 3.0), Waffen und Mündungsblitz (Survivor Spine, CC-BY 3.0).
Ergebnis: zombies/client/grafik/figuren2.webp (Felder FELD×FELD, Drehpunkt = Feldmitte, Blick nach rechts) + figuren2.json.
Aufruf: PYTHONPATH=~/code/ahnen-werkzeuge/pil python3 tools/figuren2_schneiden.py <Ordner mit entpackten Paketen>"""
import glob, json, pathlib, re, sys
from PIL import Image

QUELLE = pathlib.Path(sys.argv[1]).expanduser()
ZIEL = pathlib.Path(__file__).resolve().parent.parent / "zombies" / "client" / "grafik"
FELD, SPALTEN = 160, 25   # Bogen höchstens 4096 px breit/hoch (Handy-GPUs), Maßstäbe unten beziehen sich auf 224er Felder

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
    massstab *= FELD / 224
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
    gruppe(f"z7_{unser}", fs, 1.35, lambda im, f, m=m: m)   # blickt schon nach rechts (Arme vorn)

# ---------- Bürger: Bilder verschieden groß → jedes Bild am Haar ausrichten ----------
haar = lambda r, g, b, a: a > 128 and r > 95 and g < 85 and b > 60 and r > b
for civ in (1, 2, 3):
    fs = [str(QUELLE / f"citizens/Citizens/Walk{i}Civ{civ}.png") for i in range(1, 7)]
    gruppe(f"buerger{civ}", fs, 0.55, lambda im, f: schwerpunkt(im, haar))

# Polizisten (KonitaTutorials, gleiches Paket): Drehpunkt = dunkelblaue Dienstmütze
muetze = lambda r, g, b, a: a > 128 and b > 70 and r < 60 and b > 1.6 * r and g < 90
gruppe("polizist", [str(QUELLE / f"police/Police/Walk{i}.png") for i in range(1, 7)], 0.55, lambda im, f: schwerpunkt(im, muetze))

# ---------- Waffen und Mündungsblitz aus Survivor Spine (als Einzelbilder für die eigenen Figuren) ----------
for teil, massstab in (("rifle", 0.5), ("shotgun", 0.5), ("knife", 0.5), ("flashlight", 0.5)):
    fs = dateien(f"Survivor_Spine/Survivor Spine/images/{teil}.png")
    if fs: gruppe(f"waffe_{teil}", fs, massstab, lambda im, f: (im.width * 0.15, im.height / 2))
blitz = dateien("Survivor_Spine/Survivor Spine/images/muzzle_flash_01.png")
if blitz: gruppe("muendungsblitz", blitz, 0.5, lambda im, f: (im.width * 0.2, im.height / 2))


# ---------- Bundeswehr-Stützpunkt: Soldaten (Survivor mit Gewehr in Flecktarn), Ärzte (Bürger im weißen Kittel), Verwundete ----------
import random
from PIL import ImageDraw, ImageFilter

def gruppe_bilder(name, ims, massstab, mitte):
    for im in ims:
        liste.setdefault(name, []).append(len(bilder))
        bilder.append(ins_feld(im, massstab, mitte))

def kopf_mitte(erst):
    """wie bei den Survivor-Gruppen: Mittelpunkt der dunklen Pixel (Kopf/Rucksack) im linken Teil"""
    p = erst.load(); sx = sy = k = 0
    for y in range(0, erst.height, 2):
        for x in range(0, int(erst.width * 0.55), 2):
            if dunkel(*p[x, y]): sx += x; sy += y; k += 1
    return (sx / k, sy / k) if k else (erst.width * 0.3, erst.height / 2)

def rauschfeld(w, h, zelle, saat):
    """weiches Zufallsfeld 0..255 (Flecken von etwa 'zelle' Pixeln), je Saat fest"""
    rnd = random.Random(saat)
    klein = Image.new("L", (w // zelle + 3, h // zelle + 3))
    klein.putdata([rnd.randrange(256) for _ in range(klein.width * klein.height)])
    return klein.resize((w + 3 * zelle, h + 3 * zelle), Image.BICUBIC).load()

# Flecktarn: dunkelgrün, grün, braun, hell, schwarz (Bundeswehr-Muster grob nachempfunden)
TARN = [(54, 70, 38), (88, 108, 52), (112, 86, 52), (138, 140, 84), (34, 36, 26)]
def flecktarn(im, saat=11):
    """Kleidung und Rucksack grün-braun gefleckt; Haut, Haare, Gewehr und schwarze Umrisse bleiben"""
    im = im.convert("RGBA"); p = im.load(); w, h = im.size
    n1 = rauschfeld(w, h, 14, saat); n2 = rauschfeld(w, h, 7, saat + 1)
    for y in range(h):
        for x in range(w):
            r, g, b, a = p[x, y]
            if a < 128: continue
            lum = (r * 30 + g * 59 + b * 11) / 100
            haut = r > 150 and r > g + 25 and g > b + 12
            stoff = 40 < lum < 185 and g >= r - 12 and not haut and not (r > 150 and g < 110)
            if not stoff: continue
            v = 0.62 * n1[x, y] + 0.38 * n2[x, y]
            f = TARN[0] if v < 80 else TARN[1] if v < 120 else TARN[2] if v < 158 else TARN[3] if v < 186 else TARN[4]
            k = max(0.55, min(1.35, lum / 92))
            p[x, y] = (min(255, round(f[0] * k)), min(255, round(f[1] * k)), min(255, round(f[2] * k)), a)
    return im

def kittel(im):
    """Bürger-Schultern (braun, links vom Kopf) weiß färben; Kopf und blauer Bügel bleiben"""
    im = im.convert("RGBA"); p = im.load(); w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = p[x, y]
            if a < 128 or ((x - 0.74 * w) ** 2 + (y - 0.5 * h) ** 2) ** 0.5 < 0.25 * w: continue   # Kopf (Haar) bleibt
            lum = (r * 30 + g * 59 + b * 11) / 100
            braun = r > g and g >= b - 4 and 26 < lum < 210
            arm = b > r + 18 and lum > 26 and not (x < 0.5 * w and abs(y - 0.5 * h) < 0.3 * h)   # blaue Ärmel (der blaue Bügel am Kopf bleibt)
            if braun or arm:
                v = max(150, min(250, 160 + (lum - 40) * 1.15)); p[x, y] = (round(v), round(v), round(min(255, v * 1.02)), a)
    return im

def verwundet(civ, art):
    """liegende Figur (Kopf rechts, Körper nach links) unter Wolldecke mit weißem Verband, aus dem Bürgerbild"""
    q = Image.open(QUELLE / f"citizens/Citizens/Walk1Civ{civ}.png").convert("RGBA")
    W, H = 330, 180
    c = Image.new("RGBA", (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(c)
    kx, ky = W - 60, H // 2          # Kopfmitte
    # Körper: Hemd/Schulter aus dem Bürgerbild, dahinter Rumpf und Beine unter der Decke
    d.rounded_rectangle((kx - 190, ky - 40, kx - 30, ky + 40), 26, fill=(120, 98, 84, 255), outline=(30, 24, 20, 255), width=4)   # Decke
    for i in range(1, 6):
        xx = kx - 190 + i * 27
        d.line((xx, ky - 34, xx, ky + 34), fill=(98, 78, 66, 255), width=2)
    d.rounded_rectangle((kx - 190, ky - 40, kx - 160, ky + 40), 20, outline=(30, 24, 20, 255), width=4, fill=(104, 84, 72, 255))   # Fußende
    c.alpha_composite(q.crop((0, 0, q.width, q.height)), (kx - 50 - 0, ky - q.height // 2))   # Kopf mit Schultern
    d = ImageDraw.Draw(c)
    rot = (200, 40, 40, 255); weiss = (245, 245, 240, 255); rand = (60, 50, 46, 255)
    if art == 0:   # Kopfverband
        d.rounded_rectangle((kx - 4, ky - 40, kx + 28, ky + 40), 8, fill=weiss, outline=rand, width=3)
        d.ellipse((kx + 6, ky - 22, kx + 20, ky - 8), fill=rot)
    else:          # Verband um die Brust und Arm
        d.rounded_rectangle((kx - 85, ky - 44, kx - 48, ky + 44), 8, fill=weiss, outline=rand, width=3)
        d.line((kx - 85, ky - 14, kx - 48, ky - 8), fill=(190, 190, 185, 255), width=2)
        d.ellipse((kx - 74, ky + 8, kx - 58, ky + 24), fill=rot)
    return c, (kx, ky)

sv = lambda art: auswahl(dateien(f"{SV}/rifle/{art}/*.png"), {"idle": 8, "shoot": 3}[art])
for art, name in (("idle", "soldat_idle"), ("shoot", "soldat_schuss")):
    fs = sv(art); m = kopf_mitte(Image.open(fs[0]).convert("RGBA"))
    gruppe_bilder(name, [flecktarn(Image.open(f)) for f in fs], 0.5, m)
gruppe_bilder("arzt", [kittel(Image.open(QUELLE / f"citizens/Citizens/Walk{i}Civ2.png")) for i in range(1, 7)], 0.55, schwerpunkt(Image.open(QUELLE / "citizens/Citizens/Walk1Civ2.png").convert("RGBA"), haar))
for civ, art in ((1, 0), (2, 1), (3, 0), (1, 1), (2, 0), (3, 1)):
    bild, mitte = verwundet(civ, art)
    gruppe_bilder("verwundet", [bild], 0.55, mitte)

zeilen = (len(bilder) + SPALTEN - 1) // SPALTEN
bogen = Image.new("RGBA", (SPALTEN * FELD, zeilen * FELD), (0, 0, 0, 0))
for i, b in enumerate(bilder): bogen.paste(b, ((i % SPALTEN) * FELD, (i // SPALTEN) * FELD))
bogen.save(ZIEL / "figuren2.webp", quality=88, method=6)   # WebP: ein Drittel der PNG-Größe, Alpha verlustfrei
(ZIEL / "figuren2.json").write_text(json.dumps({"feld": FELD, "spalten": SPALTEN, "bilder": liste}, ensure_ascii=False, indent=1))
print(f"{len(bilder)} Bilder, Bogen {bogen.size}, {(ZIEL / 'figuren2.webp').stat().st_size // 1024} KB")
for n, l in liste.items(): print(f"  {n}: {len(l)}")

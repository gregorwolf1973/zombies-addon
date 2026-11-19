#!/usr/bin/env python3
"""Stellt die 18 Zombies aus drei Gemini-Bögen (JPEG, weißer Grund, grauer Schattenkreis; je 2 Zeilen × 3 Spalten,
von oben, Blick nach rechts, abgetrennte Hände gehören zur Figur) frei und legt sie als Bildbogen
client/grafik/figuren3.webp (Felder 160 px, Drehpunkt = Körpermitte) plus figuren3.json ab.
Freistellen: Flutfüllung von den Bildrändern über helle, ungesättigte Pixel (Weiß, Hellgrau); weiße Kleidung
innerhalb der schwarzen Umrisse bleibt dadurch erhalten. Danach JPEG-Saum entfernen, Rand weich.
Die lebenden Bögen liegen im Unterordner „alt“ des Ordners. Dazu zwei Bögen mit liegenden Toten (Blutlache gehört dazu,
Kopf oben = Vorderansicht): sie werden um 90° gedreht (Kopf nach links, wie die alten Leichenbilder), auf eine
gemeinsame Körperlänge gebracht und als Felder 18 ff. hinter die lebenden Typen gesetzt (Schlüssel „leiche_<typ>“).
Aufruf: PYTHONPATH=~/code/ahnen-werkzeuge/pil python3 tools/gemini_zombies_schneiden.py [Ordner] [Kontaktbogen.png]"""
import json, math, pathlib, statistics, sys
from PIL import Image, ImageDraw, ImageFilter

QUELLE = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "~/Downloads/weitere Zombies von Gemini").expanduser()
KONTAKT = sys.argv[2] if len(sys.argv) > 2 else None
ZIEL = pathlib.Path(__file__).resolve().parent.parent / "zombies" / "client" / "grafik"
FELD = 160
GROESSE = 76        # Zielgröße (längste Seite inkl. Hände) im Feld; Rumpfbreite ~70 px = etwas unter den alten Zombies (~82), über z6 (~55)

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
            kb = kern[1]
            haende = [(t[2] - sb[0], t[3] - sb[1], (t[1][0] - sb[0], t[1][1] - sb[1], t[1][2] - sb[0], t[1][3] - sb[1]))
                      for t in teile if t is not kern and not (kb[0] <= t[2] <= kb[2] and kb[1] <= t[3] <= kb[3])]
            aus.append((rgba.crop(sb), (kern[2] - sb[0], kern[3] - sb[1]), ((kb[0] - sb[0], kb[1] - sb[1], kb[2] - sb[0], kb[3] - sb[1]), (kern[2] - sb[0], kern[3] - sb[1]), haende)))
    return aus

def median_farbe(px, punkte):
    if not punkte: return (90, 90, 90)
    return tuple(int(statistics.median(p[i] for p in punkte)) for i in range(3))

def arme_ergaenzen(bild, info, mass):
    """Zeichnet für jede abgetrennte Hand einen Arm (Ärmel, dann Haut) unter die Figur. bild/info im skalierten Maßstab."""
    kb, (cx, cy), haende = info
    if not haende: return bild
    S = 4                                    # Überabtastung
    px = bild.load(); w, h = bild.size
    ebene = Image.new("RGBA", (w * S, h * S), (0, 0, 0, 0)); d = ImageDraw.Draw(ebene)
    arme = []
    for hx, hy, hb in haende:
        hbreit = min(hb[2] - hb[0], hb[3] - hb[1])
        vz = 1 if hy > cy else -1
        # Schulter: Rumpfrand (oben/unten) in einer Spalte etwas hinter der Mitte, einige px nach innen
        sx = int(cx - 0.04 * (kb[2] - kb[0]))
        ys = [y for y in range(max(0, kb[1]), min(h, kb[3])) if px[sx, y][3] > 128]
        if not ys: continue
        rand = max(ys) if vz > 0 else min(ys)
        sy = rand - vz * 4
        ha = [px[x, y][:3] for x in range(hb[0], hb[2]) for y in range(hb[1], hb[3]) if 0 <= x < w and 0 <= y < h and px[x, y][3] > 200 and sum(px[x, y][:3]) > 150]
        haut = median_farbe(px, ha)
        sl = [px[x, y][:3] for x in range(sx - 5, sx + 6) for y in range(sy - 5, sy + 6) if 0 <= x < w and 0 <= y < h and px[x, y][3] > 200 and sum(px[x, y][:3]) > 60]
        aermel = median_farbe(px, sl)
        arme.append((sx, sy, hx, hy, hbreit, vz, haut, aermel))
    for passe in ("umriss", "fuell"):
        for sx, sy, hx, hy, hbreit, vz, haut, aermel in arme:
            L = math.hypot(hx - sx, hy - sy)
            nx, ny = -(hy - sy) / L, (hx - sx) / L           # Senkrechte, nach außen (weg von der Körperachse)
            if ny * vz < 0: nx, ny = -nx, -ny
            ex, ey = (sx + hx) / 2 + nx * 0.18 * L, (sy + hy) / 2 + ny * 0.18 * L
            br = max(3.0, hbreit * 0.5) / 2
            for i in range(61):
                t = i / 60
                x = (1 - t) ** 2 * sx + 2 * t * (1 - t) * ex + t * t * hx
                y = (1 - t) ** 2 * sy + 2 * t * (1 - t) * ey + t * t * hy
                r = br + 1.3 if passe == "umriss" else br - 0.6
                f = (14, 14, 14, 255) if passe == "umriss" else (*(aermel if t < 0.5 else haut), 255)
                d.ellipse(((x - r) * S, (y - r) * S, (x + r) * S, (y + r) * S), fill=f)
    ebene = ebene.resize((w, h), Image.LANCZOS)
    ebene.alpha_composite(bild)
    return ebene

alle = []
for kennung, namen in BOEGEN:
    datei = next(max(QUELLE / "alt", QUELLE, key=lambda o: o.is_dir() and any(o.glob(f"*{kennung}*.jpeg"))).glob(f"*{kennung}*.jpeg"))
    for name, (bild, mitte, info) in zip(namen, figuren(datei)): alle.append((name, bild, mitte, info))


# ---------- Tote (liegend, auf Blutlache) ----------
KOERPER = 100       # Länge Kopf bis Fuß der Leiche im Feld (alte Leichenbilder: ~100–112 px)
TOTE_BOEGEN = [   # (Dateiteil, Zeilen, Namen)
    ("8rw53x", 2, ["kaminkehrer", "bauarbeiter", "koch", "holzfaeller", "mechaniker", "vogelscheuche"]),
    ("g26ab8", 1, ["tarn", "streife", "postbote"]),
]
# lebender Typ → Totenbild
LEICHE_VON = {"kaminkehrer": "kaminkehrer", "kehrer": "kaminkehrer", "bauarbeiter": "bauarbeiter", "strassenarbeiter": "bauarbeiter",
              "koch": "koch", "baecker": "koch", "holzfaeller": "holzfaeller", "flanell": "holzfaeller",
              "mechaniker": "mechaniker", "werkstatt": "mechaniker", "vogelscheuche": "vogelscheuche",
              "streife": "streife", "wachtmeister": "streife", "postbote": "postbote", "tarn": "tarn"}

def blutfrei(px, x, y):
    r, g, b = px[x, y][:3]
    return not (r > 50 and g < 0.4 * r and b < 0.4 * r and r < 190)

def tote_figuren(datei, zeilen, namen):
    im = Image.open(datei).convert("RGB")
    w, h = im.size
    maske = freistellen(im)
    k = maske.load(); px = im.load()
    spalten = 3
    zellen = {}
    for n, bbox, (cx, cy) in komponenten(maske):
        if n < 300: continue
        zellen.setdefault((min(zeilen - 1, int(cy / (h / zeilen))), min(spalten - 1, int(cx / (w / spalten)))), []).append(bbox)
    aus = []
    for z in range(zeilen):
        for s in range(spalten):
            teile = zellen[(z, s)]
            x0 = min(b[0] for b in teile); y0 = min(b[1] for b in teile); x1 = max(b[2] for b in teile); y1 = max(b[3] for b in teile)
            m = Image.new("L", im.size, 0); mp = m.load()
            for b in teile:
                for y in range(b[1], b[3]):
                    for x in range(b[0], b[2]): mp[x, y] = k[x, y]
            # Ausdehnung der Figur ohne Blutlache
            fx0 = fy0 = 10 ** 6; fx1 = fy1 = -1
            for y in range(y0, y1):
                for x in range(x0, x1):
                    if mp[x, y] > 128 and blutfrei(px, x, y):
                        fx0 = min(fx0, x); fx1 = max(fx1, x); fy0 = min(fy0, y); fy1 = max(fy1, y)
            rgb = Image.composite(im, Image.new("RGB", im.size, (20, 20, 20)), m)
            weich = m.filter(ImageFilter.GaussianBlur(0.8)).point(lambda v: 0 if v < 70 else min(255, int((v - 70) * 255 / 130)))
            rgba = rgb.convert("RGBA"); rgba.putalpha(weich)
            mass_t = KOERPER / (fy1 - fy0 + 1)
            c = ((fx0 + fx1) / 2, (fy0 + fy1) / 2)
            rgba = rgba.crop((x0 - 3, y0 - 3, x1 + 3, y1 + 3))
            c = (c[0] - x0 + 3, c[1] - y0 + 3)
            rgba = rgba.resize((round(rgba.width * mass_t), round(rgba.height * mass_t)), Image.LANCZOS)
            c = (c[0] * mass_t, c[1] * mass_t)
            # um 90° gegen den Uhrzeigersinn: Kopf (oben) → links wie bei den alten Leichen; Punkt (x, y) → (y, B − x)
            rgba = rgba.rotate(90, expand=True)
            c = (c[1], rgba.height - c[0])
            feld = Image.new("RGBA", (FELD, FELD), (0, 0, 0, 0))
            ox, oy = round(FELD / 2 - c[0]), round(FELD / 2 - c[1])
            if min(ox, oy) < 0 or ox + rgba.width > FELD or oy + rgba.height > FELD: print("WARNUNG: Leiche ragt aus dem Feld:", namen[z * spalten + s], (ox, oy, rgba.size))
            feld.paste(rgba, (ox, oy))
            aus.append(feld)
    return aus

tote = []
for kennung, zeilen, namen in TOTE_BOEGEN:
    datei = next(QUELLE.glob(f"*{kennung}*.jpeg"))
    tote += list(zip(namen, tote_figuren(datei, zeilen, namen)))

mass = GROESSE / sorted(max(b.size) for _, b, _, _ in alle)[len(alle) // 2]     # ein gemeinsamer Maßstab (Median)
SPALTEN = 6
zeilen = (len(alle) + len(tote) + SPALTEN - 1) // SPALTEN
bogen = Image.new("RGBA", (SPALTEN * FELD, zeilen * FELD), (0, 0, 0, 0))
liste = {}
for i, (name, bild, (mx, my), info) in enumerate(alle):
    st = bild.resize((round(bild.width * mass), round(bild.height * mass)), Image.LANCZOS)
    sk = lambda v: tuple(round(a * mass) for a in v)
    st = arme_ergaenzen(st, (sk(info[0]), sk(info[1]), [(hx * mass, hy * mass, sk(hb)) for hx, hy, hb in info[2]]), mass)
    ox, oy = round(FELD / 2 - mx * mass), round(FELD / 2 - my * mass)
    feld = Image.new("RGBA", (FELD, FELD), (0, 0, 0, 0))
    feld.alpha_composite(st, (ox, oy)) if ox >= 0 and oy >= 0 and ox + st.width <= FELD and oy + st.height <= FELD else feld.paste(st, (ox, oy))
    if min(ox, oy) < 0 or ox + st.width > FELD or oy + st.height > FELD: print("WARNUNG: ragt aus dem Feld:", name, (ox, oy, st.size))
    bogen.paste(feld, ((i % SPALTEN) * FELD, (i // SPALTEN) * FELD))
    liste[name] = [i]
for j, (name, feld) in enumerate(tote):
    i = len(alle) + j
    bogen.paste(feld, ((i % SPALTEN) * FELD, (i // SPALTEN) * FELD))
    for typ, von in LEICHE_VON.items():
        if von == name: liste["leiche_" + typ] = [i]
ZIEL.mkdir(parents=True, exist_ok=True)
bogen.save(ZIEL / "figuren3.webp", quality=88, method=6)
(ZIEL / "figuren3.json").write_text(json.dumps({"feld": FELD, "bilder": liste}, ensure_ascii=False, indent=1))
print(f"{len(alle)} + {len(tote)} Tote, Bilder, Maßstab {mass:.3f}, Bogen {bogen.size}, {(ZIEL / 'figuren3.webp').stat().st_size // 1024} KB")
if KONTAKT:
    k = Image.new("RGBA", bogen.size, (96, 120, 70, 255)); k.alpha_composite(bogen); k.convert("RGB").save(KONTAKT)

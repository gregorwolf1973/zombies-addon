#!/usr/bin/env python3
"""Held aus dem Gemini-Bogen (wjo51t…): rechte Spalte, oben mit Kappe, unten ohne. Von oben, Blick nach rechts,
Hände abgetrennt. Das Werkzeug stellt beide frei, setzt die Hände unter die Ärmelbündchen und zeichnet Stiefel mit
Hosenbein darunter – als Schrittfolge zum Gehen und Laufen plus Stehen.
Ausgabe (Ordner held/ neben dem Quellbild):
  held_<name>_koerper.png            Körper ohne Füße (volle Auflösung, Drehpunkt = Bildmitte)
  held_<name>_stiefel_<art>_<i>.png  Füße allein (gleiche Größe/Drehpunkt), art = stehen|gehen|laufen
  held_<name>_<art>_<i>.png          Körper + Füße zusammen
  held_<name>_<art>.gif              Vorschau-Animation, held_bogen.png Kontaktbogen
  held160.webp / held160.json        Bildbogen 160er Felder wie figuren3 (Körper und Füße getrennt)
Aufruf: PYTHONPATH=~/code/ahnen-werkzeuge/pil python3 tools/gemini_held_schneiden.py [Quellbild]"""
import json, math, pathlib, random, sys
from PIL import Image, ImageChops, ImageDraw, ImageFilter

QUELLE = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else
                      "~/Downloads/weitere Zombies von Gemini/Gemini_Generated_Image_wjo51twjo51twjo5.jpeg").expanduser()
ZIEL = QUELLE.parent / "held"
FELD, GROESSE = 160, 76      # wie figuren3: längste Seite (Körper + Hände) 76 px im 160er Feld
N_GEHEN, N_LAUFEN = 8, 8


def freistellen(im):
    """Maske L (255 = Figur) per Flutfüllung über helle, ungesättigte Pixel von den Rändern (wie gemini_zombies_schneiden)."""
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
    """Zusammenhängende Teile → Liste (Fläche, bbox, (cx, cy), Pixelliste)."""
    w, h = maske.size
    k = maske.load()
    gesehen = bytearray(w * h)
    aus = []
    for y0 in range(h):
        for x0 in range(w):
            if k[x0, y0] < 128 or gesehen[y0 * w + x0]: continue
            st = [(x0, y0)]; gesehen[y0 * w + x0] = 1; pix = []
            while st:
                x, y = st.pop(); pix.append((x, y))
                for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                    if 0 <= nx < w and 0 <= ny < h and not gesehen[ny * w + nx] and k[nx, ny] >= 128:
                        gesehen[ny * w + nx] = 1; st.append((nx, ny))
            xs = [p[0] for p in pix]; ys = [p[1] for p in pix]
            aus.append((len(pix), (min(xs), min(ys), max(xs) + 1, max(ys) + 1), (sum(xs) / len(pix), sum(ys) / len(pix)), pix))
    return aus


def teil_bild(im, maske, pix, bbox):
    """RGBA-Ausschnitt eines Teils (weicher Rand)."""
    m = Image.new("L", im.size, 0); mp = m.load(); k = maske.load()
    for x, y in pix: mp[x, y] = k[x, y]
    # Löcher (eingeschlossene helle Stellen) gehören zur Figur: Maske innerhalb füllen
    weich = m.filter(ImageFilter.GaussianBlur(0.8)).point(lambda v: 0 if v < 70 else min(255, int((v - 70) * 255 / 130)))
    rgba = im.convert("RGBA"); rgba.putalpha(weich)
    return rgba.crop(bbox)


def figur(im, maske, teile):
    """Körper + angesetzte Hände. Gibt (RGBA, Drehpunkt (x, y), Körper-bbox) in Quellauflösung zurück."""
    teile = sorted(teile, key=lambda t: -t[0])
    koerper, haende = teile[0], [t for t in teile[1:] if t[0] > 1500]
    # Drehpunkt = Schwerpunkt des Rumpfs ohne Handbereich (eine Hand kann am Ärmel kleben)
    grenze = min([h[1][0] for h in haende] + [koerper[1][2]]) - 10
    rumpf = [(x, y) for x, y in koerper[3] if x < grenze]
    kcx = sum(x for x, y in rumpf) / len(rumpf); kcy = sum(y for x, y in rumpf) / len(rumpf)
    lagen = []                                   # (bild, x, y) in Quellkoordinaten
    for n, hb, (hcx, hcy), hpix in haende:
        # Handgelenk = linke Spalten der Hand
        hx0 = hb[0]
        wy = [y for x, y in hpix if x < hx0 + 22]
        wy = sum(wy) / len(wy)
        # Bündchen = rechte Enden des Körpers auf Höhe des Handgelenks
        band = [(x, y) for x, y in koerper[3] if abs(y - wy) < 70 and x > kcx]
        bx = max(x for x, y in band)
        bund = [y for x, y in band if x > bx - 28]
        by = sum(bund) / len(bund)
        dx = (bx - 26) - hx0                     # Handgelenk 26 px unter das Bündchen schieben
        dy = max(-30, min(30, by - wy))
        lagen.append((teil_bild(im, maske, hpix, hb), hb[0] + dx, hb[1] + round(dy)))
    kb = koerper[1]
    kbild = teil_bild(im, maske, koerper[3], kb)
    x0 = min([kb[0]] + [x for b, x, y in lagen]); y0 = min([kb[1]] + [y for b, x, y in lagen])
    x1 = max([kb[2]] + [x + b.width for b, x, y in lagen]); y1 = max([kb[3]] + [y + b.height for b, x, y in lagen])
    bild = Image.new("RGBA", (x1 - x0, y1 - y0), (0, 0, 0, 0))
    for b, x, y in lagen: bild.alpha_composite(b, (x - x0, y - y0))     # Hände unter dem Körper
    bild.alpha_composite(kbild, (kb[0] - x0, kb[1] - y0))
    return bild, (kcx - x0, kcy - y0), (kb[0] - x0, kb[1] - y0, kb[2] - x0, kb[3] - y0)


# ---------- Stiefel ----------
UMRISS = (16, 14, 14, 255)
HOSE, HOSE_HELL = (52, 58, 70), (74, 82, 96)
SOHLE = (38, 30, 26)
LEDER, LEDER_HELL, LEDER_DUNKEL = (104, 70, 44), (142, 100, 64), (74, 50, 32)
SENKEL = (196, 170, 120)


def poly_ellipse(cx, cy, rx, ry, n=48):
    return [(cx + rx * math.cos(2 * math.pi * i / n), cy + ry * math.sin(2 * math.pi * i / n)) for i in range(n)]


def stiefel_form(lang, breit, aussen=0.0):
    """Umriss eines Stiefels von oben, Spitze in +x, Ferse bei x = 0, Mitte y = 0 (lokale Koordinaten).
    aussen (±1) wölbt den Ballen etwas nach außen (linker/rechter Fuß)."""
    def b(t):   # halbe Breite: Ferse schmal, Ballen breit, Spitze rund
        if t < 0.8: return breit * (0.36 + 0.14 * math.sin(math.pi / 2 * min(1, t / 0.6)))
        return breit * 0.5 * math.sqrt(max(0, 1 - ((t - 0.8) / 0.2) ** 2))
    def wulst(t): return aussen * math.sin(math.pi * t) * breit * 0.06
    n = 60
    oben = [(i / n * lang, -b(i / n) - wulst(i / n)) for i in range(n + 1)]
    unten = [(i / n * lang, b(i / n) - wulst(i / n)) for i in range(n, -1, -1)]
    # Ferse abrunden
    ferse = [(-breit * 0.36 * math.sin(math.pi * k / 12) * 0.5, breit * 0.36 * math.cos(math.pi * k / 12)) for k in range(1, 12)]
    return oben + unten + ferse


def dreh(pts, x0, y0, w, s):
    c, sn = math.cos(w), math.sin(w)
    return [((x0 + (x * c - y * sn) * s), (y0 + (x * sn + y * c) * s)) for x, y in pts]


def schrumpf(pts, d):
    """Polygon grob nach innen versetzen (Richtung Schwerpunkt)."""
    mx = sum(p[0] for p in pts) / len(pts); my = sum(p[1] for p in pts) / len(pts)
    aus = []
    for x, y in pts:
        l = math.hypot(x - mx, y - my) or 1
        aus.append((x - (x - mx) / l * d, y - (y - my) / l * d))
    return aus


def stiefel_zeichnen(ebene, S, hx, hy, fx, fy, lang, breit, seite, gross=1.0, zufall=None):
    """Hosenbein von der Hüfte (hx, hy) bis zum Knöchel, dann Stiefel mit Ferse bei (fx, fy), Spitze nach +x.
    Koordinaten in Quellpixeln, gezeichnet in S-facher Auflösung auf ebene. seite = -1 links (oben), +1 rechts (unten)."""
    L = lang * gross; B = breit * gross
    o = 5.0 * S                                   # Umrissbreite
    lage = Image.new("RGBA", ebene.size, (0, 0, 0, 0)); d = ImageDraw.Draw(lage)
    w = seite * 0.10                              # Fußspitzen zeigen etwas nach außen
    c, sn = math.cos(w), math.sin(w)
    def lok(x, y): return (fx + (x * c - y * sn)) * S, (fy + (x * sn + y * c)) * S
    ax, ay = [v / S for v in lok(L * 0.14, 0)]     # Knöchel (Schaftöffnung)
    # 1) Hosenbein: Hüfte → Knöchel
    hb = B * 0.40
    def bein(r, farbe):
        for i in range(31):
            t = i / 30
            x, y = (hx + (ax - hx) * t) * S, (hy + (ay - hy) * t) * S
            d.ellipse((x - r, y - r, x + r, y + r), fill=farbe)
    bein(hb * S + o, UMRISS); bein(hb * S, HOSE)
    # 2) Stiefel
    sohle = dreh(stiefel_form(L, B, aussen=seite), fx, fy, w, 1.0)
    pS = lambda pts: [(x * S, y * S) for x, y in pts]
    mx = sum(p[0] for p in sohle) / len(sohle); my = sum(p[1] for p in sohle) / len(sohle)
    def auf(pts, dd): return [(x + (x - mx) / (math.hypot(x - mx, y - my) or 1) * dd, y + (y - my) / (math.hypot(x - mx, y - my) or 1) * dd) for x, y in pts]
    d.polygon(pS(auf(sohle, 5.0)), fill=UMRISS)
    d.polygon(pS(sohle), fill=SOHLE)
    oben = schrumpf(sohle, 5.0)                    # Oberleder etwas kleiner → Sohlenrand sichtbar
    d.polygon(pS(oben), fill=LEDER)
    # Einzelheiten auf eigener Ebene, auf das Oberleder beschnitten
    det = Image.new("RGBA", ebene.size, (0, 0, 0, 0)); dd = ImageDraw.Draw(det)
    for (u, v, rx, ry, f) in ((0.84, 0.10 * seite, 0.14, 0.30, LEDER_DUNKEL), (0.74, -0.16, 0.13, 0.10, LEDER_HELL),
                              (0.30, -0.20, 0.12, 0.07, LEDER_HELL)):
        cx, cy = lok(L * u, B * v)
        dd.ellipse((cx - L * rx * S, cy - B * ry * S, cx + L * rx * S, cy + B * ry * S), fill=f)
    pts = [lok(L * 0.68 + math.cos(a) * L * 0.06, math.sin(a) * B * 0.46) for a in [math.pi / 2 + i * math.pi / 12 for i in range(13)]]
    dd.line(pts, fill=(40, 28, 20, 255), width=int(2.4 * S))          # Naht der Zehenkappe
    dd.line([lok(L * 0.22, 0), lok(L * 0.62, 0)], fill=LEDER_DUNKEL, width=int(B * 0.22 * S))   # Schnürleiste
    for i in range(5):
        u = 0.27 + i * 0.07
        dd.line([lok(L * u, -B * 0.13), lok(L * (u + 0.022), B * 0.13)], fill=SENKEL, width=int(2.4 * S))
    if zufall:
        for _ in range(8):
            u, v = zufall.uniform(0.1, 0.95), zufall.uniform(-0.35, 0.35)
            cx, cy = lok(L * u, B * v); r = zufall.uniform(2.5, 6) * S
            dd.ellipse((cx - r, cy - r * 0.7, cx + r, cy + r * 0.7), fill=(84, 64, 44, 230))
    m = Image.new("L", ebene.size, 0); ImageDraw.Draw(m).polygon(pS(oben), fill=255)
    det.putalpha(ImageChops.multiply(det.getchannel("A"), m))
    lage.alpha_composite(det)
    # 3) Hosensaum auf dem Schaft, Ferse bleibt sichtbar
    sx, sy = lok(L * 0.15, 0)
    rx, ry = L * 0.10 * S, B * 0.42 * S
    d = ImageDraw.Draw(lage)
    d.ellipse((sx - rx - o, sy - ry - o, sx + rx + o, sy + ry + o), fill=UMRISS)
    d.ellipse((sx - rx, sy - ry, sx + rx, sy + ry), fill=HOSE)
    d.ellipse((sx - rx * 0.6, sy - ry * 0.75, sx + rx * 0.3, sy - ry * 0.2), fill=HOSE_HELL)
    ebene.alpha_composite(lage)


def fuesse_bild(groesse, mitte, art, i, n, masz):
    """Füße allein als RGBA (gleiche Größe wie das Figurbild). masz = Körpertiefe für Stiefelgröße/Schritt."""
    S = 4
    w, h = groesse
    ebene = Image.new("RGBA", (w * S, h * S), (0, 0, 0, 0))
    cx, cy = mitte
    lang, breit = masz * 0.55, masz * 0.25
    spur = masz * 0.15                           # halber Fußabstand quer
    if art == "stehen":
        stand = {-1: (masz * 0.25, 1.0), 1: (masz * 0.19, 1.0)}
    else:
        A = masz * (0.45 if art == "gehen" else 0.62)
        ph = 2 * math.pi * i / n
        # links vorne bei sin > 0; das gerade schwingende Bein ist etwas größer (näher an der Kamera)
        hub = 0.07 if art == "gehen" else 0.13
        stand = {-1: (A * math.sin(ph), 1 + hub * max(0, math.cos(ph))),
                 1: (-A * math.sin(ph), 1 + hub * max(0, -math.cos(ph)))}
    zufall = random.Random(7)
    # zuerst das Bein, das weiter hinten/unten ist (kleiner), dann das größere
    for seite in sorted(stand, key=lambda s: stand[s][1]):
        off, g = stand[seite]
        fx = cx + off - lang * g * 0.5            # Ferse; off = Lage der Fußmitte zur Hüfte
        fy = cy + seite * spur
        stiefel_zeichnen(ebene, S, cx - masz * 0.05, fy, fx, fy, lang, breit, seite, gross=g, zufall=random.Random(7 + seite))
    return ebene.resize((w, h), Image.LANCZOS)


def main():
    im = Image.open(QUELLE).convert("RGB")
    W, H = im.size
    maske = freistellen(im)
    rechts = [t for t in komponenten(maske) if t[0] > 300 and t[2][0] > W * 0.68]
    figuren = {"kappe": [t for t in rechts if t[2][1] < H / 2], "ohne": [t for t in rechts if t[2][1] >= H / 2]}
    ZIEL.mkdir(exist_ok=True)
    bogen_teile = {}
    vorschau = []
    for name, teile in figuren.items():
        bild, (pcx, pcy), kb = figur(im, maske, teile)
        masz = (kb[3] - kb[1]) * 0.75             # Maßstab aus der Schulterbreite (robust gegen angeklebte Hände)
        # Leinwand: Drehpunkt in die Mitte, Platz für Füße
        rand = int(masz * 0.9)
        halb_w = int(max(pcx, bild.width - pcx) + rand); halb_h = int(max(pcy, bild.height - pcy) + 20)
        leinw = (2 * halb_w, 2 * halb_h)
        ox, oy = int(halb_w - pcx), int(halb_h - pcy)
        koerper = Image.new("RGBA", leinw, (0, 0, 0, 0)); koerper.alpha_composite(bild, (ox, oy))
        mitte = (halb_w, halb_h)
        koerper.save(ZIEL / f"held_{name}_koerper.png")
        # Maßstab für 160er Felder: längste Seite von Körper + Händen = GROESSE
        s160 = GROESSE / max(bild.size)
        bogen_teile[f"held_{name}"] = [koerper]
        for art, n in (("stehen", 1), ("gehen", N_GEHEN), ("laufen", N_LAUFEN)):
            frames = []
            fl = []
            for i in range(n):
                fu = fuesse_bild(leinw, mitte, art, i, n, masz)
                fu.save(ZIEL / f"held_{name}_stiefel_{art}_{i}.png")
                fl.append(fu)
                ganz = fu.copy(); ganz.alpha_composite(koerper)
                ganz.save(ZIEL / f"held_{name}_{art}_{i}.png")
                frames.append(ganz)
            bogen_teile[f"held_{name}_stiefel_{art}"] = fl
            # GIF auf grauem Grund, verkleinert
            gk = []
            for f in frames:
                g = Image.new("RGBA", f.size, (70, 78, 64, 255)); g.alpha_composite(f)
                gk.append(g.convert("RGB").resize((f.width // 2, f.height // 2), Image.LANCZOS))
            gk[0].save(ZIEL / f"held_{name}_{art}.gif", save_all=True, append_images=gk[1:], duration=110 if art == "gehen" else 80, loop=0)
            vorschau.append((f"{name} {art}", frames))
        bogen_teile[f"held_{name}"] = [koerper]
        bogen_teile[f"_s_{name}"] = s160
    # Kontaktbogen: je Zeile eine Animation (halbe Größe)
    zellen = [(t, [f.resize((f.width // 3, f.height // 3), Image.LANCZOS) for f in fr]) for t, fr in vorschau]
    zw = max(f.width for t, fr in zellen for f in fr); zh = max(f.height for t, fr in zellen for f in fr)
    kb_ = Image.new("RGB", (zw * 8, zh * len(zellen)), (70, 78, 64))
    for r, (t, fr) in enumerate(zellen):
        for c, f in enumerate(fr): kb_.paste(f, (c * zw, r * zh), f)
    kb_.save(ZIEL / "held_bogen.png")
    # 160er Bildbogen (Körper und Füße getrennt, Drehpunkt = Feldmitte)
    felder, liste = [], {}
    for name in figuren:
        s = bogen_teile[f"_s_{name}"]
        for key in (f"held_{name}", f"held_{name}_stiefel_stehen", f"held_{name}_stiefel_gehen", f"held_{name}_stiefel_laufen"):
            liste[key] = []
            for b in bogen_teile[key]:
                k = b.resize((max(1, round(b.width * s)), max(1, round(b.height * s))), Image.LANCZOS)
                f = Image.new("RGBA", (FELD, FELD), (0, 0, 0, 0))
                f.alpha_composite(k, ((FELD - k.width) // 2, (FELD - k.height) // 2))
                liste[key].append(len(felder)); felder.append(f)
    sp = min(len(felder), 4096 // FELD)
    zl = math.ceil(len(felder) / sp)
    atlas = Image.new("RGBA", (sp * FELD, zl * FELD), (0, 0, 0, 0))
    for i, f in enumerate(felder): atlas.alpha_composite(f, ((i % sp) * FELD, (i // sp) * FELD))
    atlas.save(ZIEL / "held160.webp", lossless=True)
    (ZIEL / "held160.json").write_text(json.dumps({"feld": FELD, "spalten": sp, "bilder": liste}, indent=1))
    print("fertig:", ZIEL, len(felder), "Felder")


if __name__ == "__main__":
    main()

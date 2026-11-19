#!/usr/bin/env python3
"""Spielerfiguren (Mann, Frau) aus zwei Gemini-Bögen mit je 2 × 4 Haltungen, von oben, Blick nach rechts, weißer Grund:
  Reihe 1: leer, Pistole, Gewehr, Messer – Reihe 2: Lampe, Pistole+Lampe, Gewehr+Lampe, Messer+Lampe.
Das Werkzeug stellt frei, setzt Farbschlüssel wie in grafik/figuren.png (Haare → reines Rot, Jacke → reines Blau, Helligkeit
bleibt; so färbt client/figurbild.mjs › umgefaerbt() sie in die gewählten Farben um) und legt je Geschlecht eine eigene
Stiefel-Ebene an (stehen, gehen 8, laufen 8; dreht im Spiel mit der Laufrichtung, wie sv_fuesse beim Survivor).
Ausgabe in <Ordner>:
  helden160.webp/.json   Bildbogen 160er Felder, Drehpunkt = Feldmitte, Schlüssel held_<m|w>_<haltung>, held_<m|w>_stiefel_<art>
  helden_vorschau.png    alle Haltungen in Originalfarben und in drei Beispiel-Farbwahlen, mit Stiefeln
  helden_<m|w>_<art>.gif Lauf-Vorschau
Aufruf: PYTHONPATH=~/code/ahnen-werkzeuge/pil python3 tools/gemini_helden_waffen.py [Ordner]"""
import colorsys, json, math, pathlib, statistics, sys
from PIL import Image, ImageFilter

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from gemini_held_schneiden import freistellen, komponenten, fuesse_bild   # noqa: E402

ORDNER = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "~/Downloads/weitere Zombies von Gemini/held").expanduser()
BOEGEN = {"m": "gemini_mann_waffen.jpeg", "w": "gemini_frau_waffen.jpeg"}
HALTUNGEN = ["leer", "pistole", "gewehr", "messer", "lampe", "pistole_lampe", "gewehr_lampe", "messer_lampe"]
FELD, GROESSE = 160, 76          # längste Seite der leeren Haltung im 160er Feld (wie figuren3)
N = 8

# Beispiel-Farbwahlen (aus figurbild.mjs): (Haar-RGB, Kleid-RGB)
BEISPIELE = [((226, 186, 102), (190, 40, 40)), ((40, 34, 32), (50, 140, 60)), ((196, 62, 34), (230, 190, 40))]


def hsv(p):
    h, s, v = colorsys.rgb_to_hsv(p[0] / 255, p[1] / 255, p[2] / 255)
    return h * 360, s, v * 255


def zellen_teilen(datei):
    im = Image.open(datei).convert("RGB")
    W, H = im.size
    maske = freistellen(im)
    zellen = {}
    for n, bbox, (cx, cy), pix in komponenten(maske):
        if n < 250: continue
        zellen.setdefault((min(1, int(cy / (H / 2))), min(3, int(cx / (W / 4)))), []).append(pix)
    k = maske.load()
    aus = []
    for z in range(2):
        for s in range(4):
            pix = [p for teil in zellen[(z, s)] for p in teil]
            x0 = min(p[0] for p in pix); y0 = min(p[1] for p in pix); x1 = max(p[0] for p in pix) + 1; y1 = max(p[1] for p in pix) + 1
            m = Image.new("L", (x1 - x0, y1 - y0), 0); mp = m.load()
            for x, y in pix: mp[x - x0, y - y0] = k[x, y]
            weich = m.filter(ImageFilter.GaussianBlur(0.8)).point(lambda v: 0 if v < 70 else min(255, int((v - 70) * 255 / 130)))
            bild = im.crop((x0, y0, x1, y1)).convert("RGBA"); bild.putalpha(weich)
            loecher_weg(bild)
            aus.append(bild)
    return aus


def loecher_weg(bild):
    """Eingeschlossener weißer Grund (z. B. zwischen beiden Armen und der Pistole) → durchsichtig."""
    px = bild.load(); w, h = bild.size
    def weiss(x, y):
        r, g, b, a = px[x, y]
        return a > 0 and min(r, g, b) >= 222 and max(r, g, b) - min(r, g, b) <= 30
    gesehen = bytearray(w * h)
    for y0 in range(h):
        for x0 in range(w):
            if gesehen[y0 * w + x0] or not weiss(x0, y0): continue
            st = [(x0, y0)]; gesehen[y0 * w + x0] = 1; teil = []
            while st:
                x, y = st.pop(); teil.append((x, y))
                for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                    if 0 <= nx < w and 0 <= ny < h and not gesehen[ny * w + nx] and weiss(nx, ny):
                        gesehen[ny * w + nx] = 1; st.append((nx, ny))
            if len(teil) < 300: continue          # kleine Glanzlichter bleiben
            loch = set(teil)
            for x, y in teil:                    # Loch plus 2 px Saum (JPEG-Rand)
                for dx in range(-2, 3):
                    for dy in range(-2, 3):
                        xx, yy = x + dx, y + dy
                        if 0 <= xx < w and 0 <= yy < h:
                            r, g, b, a = px[xx, yy]
                            if (xx, yy) in loch: px[xx, yy] = (r, g, b, 0)
                            elif (r + g + b) / 3 > 150: px[xx, yy] = (r, g, b, a // 3)


def ist_jacke(p):
    h, s, v = hsv(p)
    return 185 <= h <= 250 and 0.08 <= s <= 0.6 and 38 <= v <= 215


def ist_haar_farbe(p):
    h, s, v = hsv(p)
    return 8 <= h <= 48 and s >= 0.3 and 35 <= v <= 178


def analysieren(bild):
    """Drehpunkt (Schwerpunkt der Jacke), Schulterbreite (y-Ausdehnung der Jacke)."""
    px = bild.load(); w, h = bild.size
    jx = jy = n = 0; ys = []
    for y in range(h):
        for x in range(w):
            p = px[x, y]
            if p[3] > 200 and ist_jacke(p): jx += x; jy += y; n += 1; ys.append(y)
    ys.sort()
    return (jx / n, jy / n), ys[int(len(ys) * 0.01)], ys[int(len(ys) * 0.99)]


def schluesseln(bild, mitte, schulter):
    """Haare → Rot (Farbton 0), Jacke → Blau (Farbton 228), Helligkeit gestreckt, damit figurbild.mjs sie erkennt."""
    px = bild.load(); w, h = bild.size
    cx, cy = mitte
    haar, jacke = [], []
    for y in range(h):
        for x in range(w):
            p = px[x, y]
            if p[3] < 30: continue
            if ist_jacke(p): jacke.append((x, y))
            elif ist_haar_farbe(p):
                # nur Kopfbereich (Pferdeschwanz liegt hinten = links): nicht die Hände vorne
                dx, dy = x - cx, y - cy
                if dx < schulter * 0.20 and abs(dy) < schulter * 0.30 and dx > -schulter * 0.75: haar.append((x, y))
    def faerben(punkte, ton, ziel_median):
        if not punkte: return
        vs = [hsv(px[x, y])[2] for x, y in punkte]
        g = ziel_median / max(1, statistics.median(vs))
        for (x, y), v in zip(punkte, vs):
            r, gg, b = colorsys.hsv_to_rgb(ton / 360, 0.85, min(255, v * g) / 255)
            px[x, y] = (round(r * 255), round(gg * 255), round(b * 255), px[x, y][3])
    faerben(jacke, 228, 175)
    faerben(haar, 2, 175)
    return len(haar), len(jacke)


def umfaerben(bild, haar_rgb, kleid_rgb):
    """Nachbau von umgefaerbt() aus figurbild.mjs (für die Vorschau)."""
    b = bild.copy(); px = b.load()
    for y in range(b.height):
        for x in range(b.width):
            p = px[x, y]
            if p[3] < 16: continue
            h, s, v = hsv(p)
            if s < 0.45 or v < 40: continue
            ziel = haar_rgb if (h < 14 or h > 345) else kleid_rgb if 205 < h < 255 else None
            if not ziel: continue
            k = min(1.25, v / 225)
            px[x, y] = (min(255, int(ziel[0] * k)), min(255, int(ziel[1] * k)), min(255, int(ziel[2] * k)), p[3])
    return b


def main():
    felder, liste, vorschau_zeilen = [], {}, []
    def feld_dazu(key, bild, mitte, s):
        k = bild.resize((max(1, round(bild.width * s)), max(1, round(bild.height * s))), Image.LANCZOS)
        f = Image.new("RGBA", (FELD, FELD), (0, 0, 0, 0))
        f.alpha_composite(k, (round(FELD / 2 - mitte[0] * s), round(FELD / 2 - mitte[1] * s)))
        liste.setdefault(key, []).append(len(felder)); felder.append(f)
    for g, datei in BOEGEN.items():
        bilder = zellen_teilen(ORDNER / datei)
        mitte0, sy0, sy1 = analysieren(bilder[0])
        schulter = sy1 - sy0
        s = GROESSE / max(bilder[0].size)
        # gemeinsame Leinwand je Geschlecht: Drehpunkt in der Mitte, groß genug für alle Haltungen + Stiefel
        info = []
        for nr, b in enumerate(bilder):
            m, _, _ = analysieren(b)
            info.append((b, m))
        halb = int(max(max(m[0], b.width - m[0], m[1], b.height - m[1]) for b, m in info) + schulter * 0.6)
        lein = (2 * halb, 2 * halb)
        natur, schl = [], []
        for (b, m), name in zip(info, HALTUNGEN):
            l = Image.new("RGBA", lein, (0, 0, 0, 0)); l.alpha_composite(b, (round(halb - m[0]), round(halb - m[1])))
            natur.append(l)
            k = l.copy(); nh, nj = schluesseln(k, (halb, halb), schulter); schl.append(k)
            print(g, name, "Haar-Pixel", nh, "Jacken-Pixel", nj)
            feld_dazu(f"held_{g}_{name}", k, (halb, halb), s)
        masz = schulter * 0.75
        fuesse = {}
        for art, n in (("stehen", 1), ("gehen", N), ("laufen", N)):
            fuesse[art] = [fuesse_bild(lein, (halb, halb), art, i, n, masz) for i in range(n)]
            for f in fuesse[art]: feld_dazu(f"held_{g}_stiefel_{art}", f, (halb, halb), s)
            frames = []
            for f in fuesse[art]:
                x = Image.new("RGBA", lein, (70, 78, 64, 255)); x.alpha_composite(f); x.alpha_composite(natur[0])
                frames.append(x.convert("RGB").resize((lein[0] // 2, lein[1] // 2), Image.LANCZOS))
            if n > 1: frames[0].save(ORDNER / f"helden_{g}_{art}.gif", save_all=True, append_images=frames[1:], duration=110 if art == "gehen" else 80, loop=0)
        # Vorschau: Originalfarben + drei Farbwahlen, jeweils mit Stiefeln (gehen, Bild 2)
        st = fuesse["gehen"][2]
        for titel, quelle in [("natur", natur)] + [(f"farbe{i}", [umfaerben(k, h, c) for k in schl]) for i, (h, c) in enumerate(BEISPIELE)]:
            zeile = []
            for b in quelle:
                x = st.copy(); x.alpha_composite(b); zeile.append(x)
            vorschau_zeilen.append(zeile)
    # alle Zellen auf denselben Inhaltsrahmen zuschneiden, halbe Größe
    rahmen = [b.getbbox() for z in vorschau_zeilen for b in z]
    r0 = (min(r[0] for r in rahmen) - 10, min(r[1] for r in rahmen) - 10, max(r[2] for r in rahmen) + 10, max(r[3] for r in rahmen) + 10)
    vorschau_zeilen = [[b.crop(r0).resize(((r0[2] - r0[0]) // 2, (r0[3] - r0[1]) // 2), Image.LANCZOS) for b in z] for z in vorschau_zeilen]
    zw = max(b.width for z in vorschau_zeilen for b in z); zh = max(b.height for z in vorschau_zeilen for b in z)
    v = Image.new("RGB", (zw * 8, zh * len(vorschau_zeilen)), (70, 78, 64))
    for r, z in enumerate(vorschau_zeilen):
        for c, b in enumerate(z): v.paste(b, (c * zw, r * zh), b)
    v.save(ORDNER / "helden_vorschau.png")
    sp = min(len(felder), 4096 // FELD); zl = math.ceil(len(felder) / sp)
    atlas = Image.new("RGBA", (sp * FELD, zl * FELD), (0, 0, 0, 0))
    for i, f in enumerate(felder): atlas.alpha_composite(f, ((i % sp) * FELD, (i // sp) * FELD))
    atlas.save(ORDNER / "helden160.webp", lossless=True)
    (ORDNER / "helden160.json").write_text(json.dumps({"feld": FELD, "spalten": sp, "bilder": liste}, indent=1))
    print("fertig:", len(felder), "Felder")


if __name__ == "__main__":
    main()

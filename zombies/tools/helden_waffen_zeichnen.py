#!/usr/bin/env python3
"""Ergänzt den Heldenbogen helden160 um zehn weitere Haltungen (je Held m / Heldin w) und macht die Heldin schlanker.

Hintergrund: Die Bild-Erzeugung von Gemini läuft über die llm-bridge nicht (nur Text-Antworten; das Gratis-Kontingent der
Bildmodelle ist 0). Darum werden die neuen Haltungen aus den vorhandenen gemalt (gleicher Stil, Größe, Drehpunkt):
  * Langwaffen (schrotflinte, mp, mg, armbrust, scharfschuetze, granatwerfer): Gewehr-Haltung, das Gewehr wird entfernt,
    die neue Waffe entlang derselben Achse neu gezeichnet, die Hände (Hautfarbe samt Umriss) kommen wieder darüber.
  * schlaeger, sense: Messer-Haltung, Klinge entfernt, Stiel durch die untere Hand.
  * handgranate: Leer-Haltung, Granate in der unteren Hand. faust: Leer-Haltung, beide Hände zu Fäusten.
  * Lampen-Varianten gibt es für die neuen Haltungen nicht (spiel.mjs fällt auf die Haltung ohne Lampe zurück).
Heldin (held_w_*): alle Bilder (auch Stiefel) werden quer (y) um SCHLANK gestaucht, Drehpunkt = Feldmitte.
Aufruf (aus zombies/): python3 tools/helden_waffen_zeichnen.py <alter Bogen .webp> <alte .json> [Ausgabe-Ordner=client/grafik]
Nutzt das ALTE Original als Eingabe, damit mehrfaches Ausführen dasselbe liefert.
"""
import colorsys, json, math, os, sys
sys.path.insert(0, os.path.expanduser('~/code/ahnen-werkzeuge/pil'))
from PIL import Image, ImageDraw, ImageFilter

F, S = 160, 4
SCHLANK = 0.86
OUT = (16, 14, 14, 255)
DUNKEL, MITTEL, HELL = (40, 42, 46, 255), (68, 72, 78, 255), (112, 116, 122, 255)
HOLZ, HOLZ_D, HOLZ_H = (126, 86, 52, 255), (88, 58, 36, 255), (162, 116, 74, 255)
OLIV, OLIV_D = (84, 92, 58, 255), (58, 66, 40, 255)
STAHL, STAHL_H = (150, 156, 164, 255), (214, 220, 226, 255)
NEU = ['schrotflinte', 'mp', 'mg', 'armbrust', 'scharfschuetze', 'granatwerfer', 'sense', 'schlaeger', 'handgranate', 'faust']
ALT = ['leer', 'pistole', 'gewehr', 'messer', 'lampe', 'pistole_lampe', 'gewehr_lampe', 'messer_lampe']


def hsv(p):
    h, s, v = colorsys.rgb_to_hsv(p[0] / 255, p[1] / 255, p[2] / 255)
    return h * 360, s, v * 255


def ist_haut(p):
    if p[3] < 60: return False
    h, s, v = hsv(p)
    return 8 <= h <= 48 and 0.10 <= s <= 0.62 and v >= 135


def ist_waffenfarbe(p):
    """dunkel/grau/braun/silbern, nicht Haut, nicht Jacke (blau), nicht Haar (rot)."""
    if p[3] == 0 or ist_haut(p): return False
    h, s, v = hsv(p)
    if 190 <= h <= 260 and s >= 0.3: return False
    if (h < 22 or h > 340) and s >= 0.5 and v >= 60: return False
    return True


class Waffe:
    """Zeichnet in S-facher Auflösung Teile entlang einer Achse: Punkt (u, v) = start + u·achse + v·quer (v>0 = rechts/unten)."""
    def __init__(self, start, winkel):
        self.ebene = Image.new('RGBA', (F * S, F * S), (0, 0, 0, 0)); self.d = ImageDraw.Draw(self.ebene)
        self.x0, self.y0 = start; self.c, self.s = math.cos(math.radians(winkel)), math.sin(math.radians(winkel))

    def p(self, u, v):
        return ((self.x0 + u * self.c - v * self.s) * S, (self.y0 + u * self.s + v * self.c) * S)

    def rect(self, u0, u1, v0, v1, fill, rand=True):
        pts = [self.p(u0, v0), self.p(u1, v0), self.p(u1, v1), self.p(u0, v1)]
        self.d.polygon(pts, fill=fill, outline=OUT if rand else None, width=int(1.0 * S) if rand else 1)

    def poly(self, uv, fill, rand=True):
        self.d.polygon([self.p(u, v) for u, v in uv], fill=fill, outline=OUT if rand else None, width=int(1.0 * S) if rand else 1)

    def kreis(self, u, v, r, fill, rand=True):
        x, y = self.p(u, v)
        self.d.ellipse((x - r * S, y - r * S, x + r * S, y + r * S), fill=fill, outline=OUT if rand else None, width=int(1.0 * S))

    def linie(self, a, b, fill, w=1.0):
        self.d.line([self.p(*a), self.p(*b)], fill=fill, width=max(1, int(w * S)))

    def bogen(self, mitte, r, a0, a1, fill, w=1.0):
        pts = [self.p(mitte[0] + r * math.cos(math.radians(a)), mitte[1] + r * math.sin(math.radians(a))) for a in range(a0, a1 + 1, 6)]
        self.d.line(pts, fill=fill, width=max(1, int(w * S)), joint='curve')

    def fertig(self):
        return self.ebene.resize((F, F), Image.LANCZOS)


# ---------------- Langwaffen auf der Achse des Gewehrs ----------------
ACHSE = {'m': ((75.0, 101.0), -22.0), 'w': ((74.0, 98.0), -20.5)}   # (Schaftende, Winkel) je Geschlecht     # Schaftende, Richtung der Gewehr-Haltung (aus helden160 gemessen)


def w_schrotflinte(w):
    w.rect(0, 22, -2.2, 3.6, HOLZ)                      # Schaft
    w.rect(2, 20, -1.0, 1.2, HOLZ_H, rand=False)
    w.rect(20, 40, -2.4, 2.4, DUNKEL)                   # Gehäuse
    w.rect(40, 84, -1.6, 1.6, MITTEL)                   # Lauf
    w.rect(40, 80, 1.6, 3.2, DUNKEL)                    # Röhrenmagazin
    w.rect(44, 64, -3.0, 3.6, HOLZ_D)                   # Vorderschaft (Pumpe)
    w.rect(46, 62, -2.0, 0.0, HOLZ_H, rand=False)
    w.rect(82, 85, -1.2, 1.2, DUNKEL)


def w_mp(w):
    w.rect(0, 16, -0.9, 0.9, DUNKEL)                    # eingeklappte Schulterstütze
    w.rect(16, 50, -3.0, 3.0, DUNKEL)                   # Gehäuse
    w.rect(18, 48, -1.6, -0.4, HELL, rand=False)
    w.rect(28, 36, 3.0, 14.5, MITTEL)                   # Magazin nach unten
    w.rect(29, 35, 3.0, 13.0, HELL, rand=False)
    w.rect(50, 64, -1.5, 1.5, MITTEL)                   # Lauf
    w.rect(62, 66, -2.0, 2.0, DUNKEL)
    w.rect(38, 46, 3.0, 7.0, DUNKEL)                    # Griff


def w_mg(w):
    w.rect(0, 24, -2.6, 3.6, OLIV_D)                    # Schaft
    w.rect(24, 52, -3.4, 3.4, OLIV)                     # Gehäuse
    w.rect(26, 50, -2.2, -0.6, HELL, rand=False)
    w.rect(34, 50, 3.4, 12.0, OLIV_D)                   # Gurtkasten unten
    w.rect(36, 48, 3.4, 10.5, (120, 126, 78, 255), rand=False)
    w.rect(52, 92, -1.9, 1.9, MITTEL)                   # langer Lauf
    w.rect(56, 78, -3.0, 3.0, DUNKEL)                   # Laufmantel
    w.linie((70, 3), (80, 9), OUT, 1.3); w.linie((70, -3), (80, -9), OUT, 1.3)   # Zweibein
    w.rect(90, 94, -2.5, 2.5, DUNKEL)
    w.rect(40, 48, -5.0, -3.4, DUNKEL)                  # Tragegriff


def w_scharfschuetze(w):
    w.rect(0, 26, -2.4, 3.6, OLIV_D)                    # Schaft
    w.rect(3, 24, -1.0, 1.2, (110, 120, 78, 255), rand=False)
    w.rect(26, 48, -2.4, 2.4, DUNKEL)                   # Gehäuse
    w.rect(48, 96, -1.4, 1.4, MITTEL)                   # sehr langer Lauf
    w.rect(94, 98, -2.0, 2.0, DUNKEL)                   # Mündungsbremse
    w.rect(30, 56, -6.6, -3.2, DUNKEL)                  # Zielfernrohr
    w.kreis(30, -4.9, 2.3, (90, 150, 190, 255)); w.kreis(56, -4.9, 1.9, (90, 150, 190, 255))
    w.rect(36, 50, -3.2, -2.4, MITTEL)
    w.rect(34, 42, 2.4, 9.0, DUNKEL)                    # Magazin
    w.linie((70, 1.4), (80, 8), OUT, 1.2); w.linie((70, 1.4), (80, 8), MITTEL, 0.5)  # Zweibein


def w_granatwerfer(w):
    w.rect(0, 20, -2.0, 3.2, OLIV_D)                    # Schulterstütze
    w.rect(20, 76, -4.4, 4.4, OLIV)                     # dickes Rohr
    w.rect(22, 74, -3.0, -1.6, (118, 128, 82, 255), rand=False)
    w.rect(46, 58, 4.4, 9.5, DUNKEL)                    # Vordergriff
    w.rect(36, 44, -6.4, -4.4, DUNKEL)                  # Visier
    w.poly([(76, -4.4), (84, -3.0), (84, 3.0), (76, 4.4)], OLIV_D)          # aufgesetzte Granate
    w.kreis(86, 0, 3.4, (150, 60, 44, 255))
    w.rect(16, 22, -4.8, 4.8, DUNKEL)


def w_armbrust(w):
    w.rect(0, 16, -2.0, 3.4, HOLZ)                      # Schaft
    w.rect(16, 66, -2.0, 2.0, HOLZ_D)                   # Schiene
    w.rect(18, 64, -0.9, 0.6, HOLZ_H, rand=False)
    w.rect(44, 52, 2.0, 5.5, DUNKEL)                    # Abzugsbügel
    # Bogenarme quer, vorn bei u = 60
    w.poly([(56, -17), (59, -17), (62, -1.4), (62, 1.4), (59, 17), (56, 17), (58, 0)], MITTEL)
    w.linie((57.5, -16), (44, 0), (216, 206, 180, 255), 0.9); w.linie((57.5, 16), (44, 0), (216, 206, 180, 255), 0.9)   # Sehne
    w.rect(24, 62, -0.5, 0.5, STAHL, rand=False)       # Bolzen
    w.poly([(62, -1.4), (70, 0), (62, 1.4)], STAHL_H, rand=True)


LANG = {'schrotflinte': w_schrotflinte, 'mp': w_mp, 'mg': w_mg, 'armbrust': w_armbrust, 'scharfschuetze': w_scharfschuetze,
        'granatwerfer': w_granatwerfer}


def abstand_achse(x, y, start, winkel):
    c, s = math.cos(math.radians(winkel)), math.sin(math.radians(winkel))
    dx, dy = x - start[0], y - start[1]
    return dx * c + dy * s, -dx * s + dy * c      # (u, v)


def haut_ebene(bild, pad=1):
    """Hände mit Umrissring: Pixel der Haut plus Nachbarn (Umriss) → eigene Ebene, die wieder über die Waffe kommt."""
    px = bild.load(); w, h = bild.size
    haut = [[ist_haut(px[x, y]) for x in range(w)] for y in range(h)]
    ebene = Image.new('RGBA', bild.size, (0, 0, 0, 0)); ep = ebene.load()
    for y in range(h):
        for x in range(w):
            ok = haut[y][x]
            if not ok:
                for dy in range(-pad, pad + 1):
                    for dx in range(-pad, pad + 1):
                        if 0 <= x + dx < w and 0 <= y + dy < h and haut[y + dy][x + dx]:
                            r, g, b, a = px[x, y]
                            if a > 30 and (r + g + b) < 200: ok = True    # dunkler Handumriss
            if ok: ep[x, y] = px[x, y]
    return kleine_weg(ebene)


def kleine_weg(ebene, mind=30):
    """Streupixel (Reste von Klinge/Lauf, die wie Haut aussehen) entfernen: nur zusammenhängende Teile >= mind Pixel behalten."""
    px = ebene.load(); w, h = ebene.size
    gesehen = set()
    for y0 in range(h):
        for x0 in range(w):
            if px[x0, y0][3] == 0 or (x0, y0) in gesehen: continue
            st = [(x0, y0)]; gesehen.add((x0, y0)); teil = []
            while st:
                x, y = st.pop(); teil.append((x, y))
                for dx in (-1, 0, 1):
                    for dy in (-1, 0, 1):
                        n = (x + dx, y + dy)
                        if 0 <= n[0] < w and 0 <= n[1] < h and n not in gesehen and px[n][3] > 0:
                            gesehen.add(n); st.append(n)
            if len(teil) < mind:
                for x, y in teil: px[x, y] = (0, 0, 0, 0)
    return ebene


def langwaffe(basis, name, start, winkel, breite=11.0):
    """Gewehr entfernen (Band um die Achse), neue Waffe zeichnen, Hände darüber."""
    b = basis.copy(); px = b.load()
    haende = haut_ebene(basis)
    for y in range(F):
        for x in range(F):
            p = px[x, y]
            u, v = abstand_achse(x, y, start, winkel)
            if 14 <= u <= 84 and abs(v) <= 3.5 and p[3] > 0 and not ist_haut(p) and not (hsv(p)[0] < 22 or hsv(p)[0] > 340):
                px[x, y] = (0, 0, 0, 0); continue          # blaue Lichter/Falten im Gewehr
            if not ist_waffenfarbe(p): continue
            if (-5 <= u <= 84 and abs(v) <= breite) or (22 <= u <= 64 and 0 < v <= 17): px[x, y] = (0, 0, 0, 0)
    kleine_weg(b, 14)                                      # abgesprengte Reste
    w = Waffe(start, winkel); LANG[name](w)
    b.alpha_composite(w.fertig()); b.alpha_composite(haende)
    return b


# ---------------- Nahkampf: Messer-Haltung ----------------
def messer_weg(basis, bereich):
    b = basis.copy(); px = b.load()
    haende = haut_ebene(basis)
    x0, y0, x1, y1 = bereich
    for y in range(y0, y1):
        for x in range(x0, x1):
            if ist_waffenfarbe(px[x, y]): px[x, y] = (0, 0, 0, 0)
    return b, haende


def schwingen(basis, name):
    b, haende = messer_weg(basis, (100, 76, 140, 124))
    hx, hy = 112.0, 103.0                # untere Hand (Handwurzel)
    if name == 'schlaeger':
        w = Waffe((hx - 8, hy + 4), -33.0)
        w.poly([(0, -1.4), (22, -1.7), (40, -2.6), (47, -3.4), (48, 0), (47, 3.4), (40, 2.6), (22, 1.7), (0, 1.4)], HOLZ)
        w.poly([(24, -1.0), (44, -1.9), (45, -0.6), (24, -0.1)], HOLZ_H, rand=False)
        w.rect(-2, 3, -1.8, 1.8, DUNKEL)                # Griffband
        w.rect(6, 9, -1.8, 1.8, DUNKEL, rand=False)
    else:   # sense: langer Stiel, Blatt oben
        w = Waffe((hx - 20, hy + 12), -40.0)
        w.rect(0, 76, -1.2, 1.2, HOLZ)
        w.rect(30, 33, -3.0, 3.0, DUNKEL); w.rect(16, 19, -3.0, 3.0, DUNKEL)   # Griffe (Hände greifen)
        w.poly([(74, -1.0), (76, -8), (80, -16), (86, -22), (92, -24), (88, -19), (86, -12), (84, -5), (80, 1.2), (76, 1.4)], STAHL)   # gebogenes Blatt
        w.poly([(78, -5), (82, -13), (87, -20), (90, -22), (86, -14), (82, -6)], STAHL_H, rand=False)
        w.rect(70, 78, -2.4, 2.4, DUNKEL)
    b.alpha_composite(w.fertig()); b.alpha_composite(haende)
    return b


def granate(basis):
    b = basis.copy()
    haende = haut_ebene(basis)
    w = Waffe((0, 0), 0)
    w.kreis(120.0, 99.0, 6.6, OLIV)                     # Granatenkörper
    w.d.arc((114.5 * S, 93.5 * S, 125.5 * S, 104.5 * S), 200, 280, fill=(120, 130, 84, 255), width=int(1.4 * S))
    for gx in (-3, 0, 3):
        w.d.line([((120.0 + gx) * S, 94.0 * S), ((120.0 + gx) * S, 104.0 * S)], fill=OLIV_D, width=int(0.8 * S))
    w.d.line([(114.0 * S, 99.0 * S), (126.0 * S, 99.0 * S)], fill=OLIV_D, width=int(0.8 * S))
    w.kreis(118.0, 92.6, 2.0, STAHL)                    # Zünder
    w.d.arc((120 * S, 87 * S, 127 * S, 94 * S), 0, 360, fill=OUT, width=int(1.1 * S))   # Splintring
    b.alpha_composite(w.fertig()); b.alpha_composite(haende)    # Finger greifen darüber
    return b


def faeuste(basis):
    b = basis.copy(); px = b.load()
    for y in range(F):                    # offene Hände samt Umriss entfernen (außerhalb der Ärmel)
        for x in range(103, F):
            if ist_waffenfarbe(px[x, y]) or ist_haut(px[x, y]): px[x, y] = (0, 0, 0, 0)
    w = Waffe((0, 0), 0)
    HAUT, HAUT_D, HAUT_H = (226, 178, 140, 255), (170, 118, 86, 255), (246, 212, 176, 255)
    for cx, cy in ((107.5, 54.0), (108.5, 105.0)):
        rx, ry = 9.0, 7.0
        w.d.ellipse(((cx - rx - 1.1) * S, (cy - ry - 1.1) * S, (cx + rx + 1.1) * S, (cy + ry + 1.1) * S), fill=OUT)
        w.d.ellipse(((cx - rx) * S, (cy - ry) * S, (cx + rx) * S, (cy + ry) * S), fill=HAUT)
        w.d.ellipse(((cx - rx + 2) * S, (cy - ry + 1) * S, (cx + 2) * S, (cy - 1) * S), fill=HAUT_H)
        for k in (-4.2, -1.4, 1.4, 4.2):                # Finger, vorn eingerollt
            w.d.line([((cx + 0.5) * S, (cy + k) * S), ((cx + rx - 0.4) * S, (cy + k) * S)], fill=(120, 80, 56, 255), width=int(1.1 * S))
        w.d.arc(((cx - 1.0) * S, (cy - ry + 0.6) * S, (cx + rx - 0.2) * S, (cy + ry - 0.6) * S), 270, 90, fill=(120, 80, 56, 255), width=int(1.0 * S))   # Fingerkuppen
        w.d.line([((cx - 6.0) * S, (cy + ry - 1.8) * S), ((cx + 1.0) * S, (cy + ry - 1.8) * S)], fill=HAUT_D, width=int(1.1 * S))   # Daumen
    b.alpha_composite(w.fertig())
    return b


# ---------------- Heldin schlanker ----------------
def schlanker(feld):
    """y-Stauchung um die Feldmitte (Drehpunkt bleibt)."""
    nh = round(F * SCHLANK)
    k = feld.resize((F, nh), Image.LANCZOS)
    out = Image.new('RGBA', (F, F), (0, 0, 0, 0)); out.alpha_composite(k, (0, F // 2 - nh // 2))
    return out


def main():
    quelle, js = sys.argv[1], sys.argv[2]
    ziel = sys.argv[3] if len(sys.argv) > 3 else os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'client', 'grafik')
    atlas = Image.open(quelle).convert('RGBA'); d = json.load(open(js)); sp = d['spalten']
    def feld(nr): return atlas.crop(((nr % sp) * F, (nr // sp) * F, (nr % sp) * F + F, (nr // sp) * F + F))
    felder, liste = [], {}
    def dazu(key, bild): liste.setdefault(key, []).append(len(felder)); felder.append(bild)
    ergebnis = {}                         # (g, name) -> Bild vor dem Schlankermachen
    for g in ('m', 'w'):
        bas = {n: feld(d['bilder'][f'held_{g}_{n}'][0]) for n in ALT}
        for n in ALT: ergebnis[(g, n)] = bas[n]
        for n in NEU:
            if n in LANG: ergebnis[(g, n)] = langwaffe(bas['gewehr'], n, *ACHSE[g])
            elif n in ('schlaeger', 'sense'): ergebnis[(g, n)] = schwingen(bas['messer'], n)
            elif n == 'handgranate': ergebnis[(g, n)] = granate(bas['leer'])
            else: ergebnis[(g, n)] = faeuste(bas['leer'])
    for g in ('m', 'w'):
        for n in ALT + NEU:
            b = ergebnis[(g, n)]
            dazu(f'held_{g}_{n}', schlanker(b) if g == 'w' else b)
        for art in ('stehen', 'gehen', 'laufen'):
            for nr in d['bilder'][f'held_{g}_stiefel_{art}']:
                b = feld(nr); dazu(f'held_{g}_stiefel_{art}', schlanker(b) if g == 'w' else b)
    # Spaltenzahl bleibt 25 (spiel.mjs liest den Bogen mit fester Spaltenzahl)
    n_sp = 25; zl = math.ceil(len(felder) / n_sp)
    neu = Image.new('RGBA', (n_sp * F, zl * F), (0, 0, 0, 0))
    for i, f in enumerate(felder): neu.alpha_composite(f, ((i % n_sp) * F, (i // n_sp) * F))
    neu.save(os.path.join(ziel, 'helden160.webp'), lossless=True)
    json.dump({'feld': F, 'spalten': n_sp, 'bilder': liste}, open(os.path.join(ziel, 'helden160.json'), 'w'), indent=1)
    print('Felder', len(felder), 'Größe', neu.size)


if __name__ == '__main__':
    main()

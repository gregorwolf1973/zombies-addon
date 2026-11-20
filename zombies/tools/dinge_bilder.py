#!/usr/bin/env python3
"""Gegenstands-Icons aus den Gemini-Bögen schneiden (Magenta-Hintergrund → transparent) und zu einem Bogen packen.

Aufruf:  python3 -I tools/dinge_bilder.py <ordner mit ergebnis_1…4_*.jpeg> [ausgabe-ordner]
Ergebnis: client/grafik/dinge.webp (Felder FELD × FELD) und client/grafik/dinge.json ({name: [x, y]}).
Pillow liegt in ~/code/ahnen-werkzeuge/pil (kein pip auf dem PC).
Bögen und Reihenfolge wie in ~/Downloads/Gemini-Icons/PROMPTS.md.
"""
import json
import os
import sys

sys.path.insert(0, os.path.expanduser('~/code/ahnen-werkzeuge/pil'))
from PIL import Image  # noqa: E402

FELD = 128          # Kantenlänge eines Icons im fertigen Bogen
RAND = 6            # Pixel Luft um das Motiv
SPALTEN = 8

BOEGEN = [
    ('ergebnis_1_schusswaffen', 3, ['pistole', 'mp', 'schrotflinte', 'gewehr', 'scharfschuetze', 'mg', 'granatwerfer', 'armbrust', 'munition']),
    ('ergebnis_2_nahkampf_wurf', 3, ['messer', 'schlaeger', 'brechstange', 'sense', 'granate', 'granate40', 'pfeil', 'bretter', 'seil']),
    ('ergebnis_3_versorgung', 3, ['wasser', 'essen', 'schokoriegel', 'verband', 'spritze', 'kleidung', 'taschenlampe', 'radio', 'funkgeraet']),
    ('ergebnis_4_taschen', 2, ['tasche', 'trekking', 'schluessel', 'faust']),
]
# einzelne Zellen aus einer Nachbesserung (Datei, Raster, Zelle 0-basiert) statt aus dem Bogen
ERSATZ = {
    'wasser': ('ergebnis_3b_versorgung', 3, 0),
    'taschenlampe': ('ergebnis_3b_versorgung', 3, 6),
}


def finde(ordner, stamm):
    for endung in ('.png', '.jpeg', '.jpg', '.webp'):
        p = os.path.join(ordner, stamm + endung)
        if os.path.exists(p):
            return p
    return None


def freistellen(zelle):
    """Magenta → durchsichtig, Magenta-Saum an den Kanten entfernen."""
    zelle = zelle.convert('RGBA')
    px = zelle.load()
    w, h = zelle.size
    for y in range(h):
        for x in range(w):
            r, g, b, _ = px[x, y]
            m = min(r, b) - g                        # wie stark magenta (Hintergrund: ~255)
            if r > 235 and b > 235 and g < 60:       # weiße Rasterlinien liegen außerhalb, reines Magenta
                a = 0
            elif m >= 170:
                a = 0
            elif m <= 70:
                a = 255
            else:
                a = int(255 * (170 - m) / 100)
            if m > 0 and a > 0:                      # Saum: Rot und Blau auf Grün-Niveau herunterziehen
                k = min(1.0, m / 120)
                r = int(r - (r - max(g, 0)) * k * 0.85)
                b = int(b - (b - max(g, 0)) * k * 0.85)
            px[x, y] = (r, g, b, a)
    return zelle


def zuschneiden(bild):
    """auf das Motiv zuschneiden (kleine Krümel ignorieren), quadratisch auf FELD bringen"""
    alpha = bild.split()[3].point(lambda v: 255 if v > 60 else 0)
    box = alpha.getbbox()
    if not box:
        return Image.new('RGBA', (FELD, FELD), (0, 0, 0, 0))
    motiv = bild.crop(box)
    s = max(motiv.size)
    quadrat = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    quadrat.paste(motiv, ((s - motiv.width) // 2, (s - motiv.height) // 2))
    innen = FELD - 2 * RAND
    quadrat = quadrat.resize((innen, innen), Image.LANCZOS)
    feld = Image.new('RGBA', (FELD, FELD), (0, 0, 0, 0))
    feld.paste(quadrat, (RAND, RAND))
    return feld


def zelle_aus(ordner, stamm, n, i):
    p = finde(ordner, stamm)
    if not p:
        return None
    bogen = Image.open(p).convert('RGB')
    groesse = bogen.width / n
    x, y = i % n, i // n
    inset = max(8, int(groesse * 0.025))            # weiße Rasterlinien weglassen
    return bogen.crop((int(x * groesse) + inset, int(y * groesse) + inset, int((x + 1) * groesse) - inset, int((y + 1) * groesse) - inset))


def main():
    ordner = sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser('~/Downloads/Gemini-Icons')
    hier = os.path.dirname(os.path.abspath(__file__))
    aus = sys.argv[2] if len(sys.argv) > 2 else os.path.join(hier, '..', 'client', 'grafik')
    namen, felder = [], []
    for stamm, n, dinge in BOEGEN:
        for i, ding in enumerate(dinge):
            quelle = ERSATZ.get(ding)
            zelle = zelle_aus(ordner, *quelle) if quelle and finde(ordner, quelle[0]) else None
            if zelle is None:
                zelle = zelle_aus(ordner, stamm, n, i)
            if zelle is None:
                print('fehlt:', stamm, ding)
                continue
            namen.append(ding)
            felder.append(zuschneiden(freistellen(zelle)))
    zeilen = (len(felder) + SPALTEN - 1) // SPALTEN
    atlas = Image.new('RGBA', (SPALTEN * FELD, zeilen * FELD), (0, 0, 0, 0))
    liste = {}
    for k, (ding, feld) in enumerate(zip(namen, felder)):
        x, y = (k % SPALTEN) * FELD, (k // SPALTEN) * FELD
        atlas.paste(feld, (x, y))
        liste[ding] = [x, y]
    atlas.save(os.path.join(aus, 'dinge.webp'), 'WEBP', quality=90, method=6)
    with open(os.path.join(aus, 'dinge.json'), 'w') as f:
        json.dump({'feld': FELD, 'breite': atlas.width, 'hoehe': atlas.height, 'dinge': liste}, f, ensure_ascii=False)
    print(len(liste), 'Icons →', os.path.join(aus, 'dinge.webp'), atlas.size)


if __name__ == '__main__':
    main()

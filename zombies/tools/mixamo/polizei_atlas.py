#!/usr/bin/env python3
"""Polizisten-Atlas aus dem SWAT-Helden (Mixamo „SWAT“, keine eigene Polizei-Figur bei Mixamo): Uniform dunkelblau umgefärbt,
Pistole fest ins Bild gesetzt (Pose je Bild aus helden_neu.json), Clips stehen (Pistole im Anschlag), gehen (mit Pistole), tod.
Aufruf: PYTHONPATH=<pil> python3 tools/mixamo/polizei_atlas.py   (liest/schreibt client/grafik; danach tools/grafik_klein.py --neu)
Ergebnis: grafik/polizei.webp + polizei.json { clips: { name: { y, feld, n, dauer, weg, einmal } } } (gleicher Maßstab wie die Helden)."""
import json, math, colorsys
from pathlib import Path
from PIL import Image

G = Path(__file__).resolve().parents[2] / 'client' / 'grafik'
HELD = 'swat'
j = json.load(open(G / 'helden_neu.json'))
koerper = Image.open(G / f'helden_{HELD}.webp').convert('RGBA')
waffen = Image.open(G / 'helden_waffen.webp').convert('RGBA')
wm = j['waffen']['pistole']
pistole = waffen.crop((0, wm['y'], wm['w'], wm['y'] + wm['h']))
CLIPS = [('stehen', 'pistole_stehen'), ('gehen', 'pistole_gehen'), ('tod', 'tod')]

def blau(im):
    """Uniform dunkelblau (Polizei Bayern): wenig gesättigte Flächen bekommen Farbton 218°, abgedunkelt; Kräftiges bleibt"""
    px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = px[x, y]
            if a == 0: continue
            h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
            if s < 0.4:
                v2 = min(1.0, 0.06 + v * 0.62)
                r2, g2, b2 = colorsys.hsv_to_rgb(218 / 360, 0.58 - 0.25 * max(0, v - 0.75), v2)
                px[x, y] = (round(r2 * 255), round(g2 * 255), round(b2 * 255), a)
    return im

def mit_pistole(bild, pose):
    """Pistole wie spiel.mjs/hfLage: Ursprung (ox, oy) der Waffe bei Bildmitte + (pose[0], pose[1]), gedreht um pose[2], Länge × pose[3]"""
    F = bild.width; tx, ty = F / 2 + pose[0], F / 2 + pose[1]; a, s = pose[2], pose[3] or 1
    c, n = math.cos(a), math.sin(a)
    w = pistole.transform((F, F), Image.AFFINE, (c / s, n / s, wm['ox'] - (c / s) * tx - (n / s) * ty, -n, c, wm['oy'] + n * tx - c * ty), resample=Image.BICUBIC)
    out = bild.copy(); out.alpha_composite(w); return out

zeilen, clips, breite, y = [], {}, 0, 0
for name, quelle in CLIPS:
    k = j['clips'][quelle]; F, n = k['feld'], k['n'] - (1 if quelle == 'tod' else 0)   # tod: das letzte gerenderte Bild springt in die Ausgangslage zurück
    posen = j['pos'][HELD].get(quelle, {}).get('pistole')
    bilder = []
    for i in range(n):
        b = blau(koerper.crop((i * F, k['y'], (i + 1) * F, k['y'] + F)))
        if posen: b = mit_pistole(b, posen[i])
        bilder.append(b)
    zeilen.append((F, bilder)); clips[name] = {'y': y, 'feld': F, 'n': n, 'dauer': k['dauer'], 'weg': k['weg'], 'einmal': k['einmal']}
    breite = max(breite, F * n); y += F
atlas = Image.new('RGBA', (breite, y), (0, 0, 0, 0))
for (F, bilder), (name, _) in zip(zeilen, CLIPS):
    for i, b in enumerate(bilder): atlas.alpha_composite(b, (i * F, clips[name]['y']))
atlas.save(G / 'polizei.webp', quality=86, alpha_quality=92, method=6)
json.dump({'held': HELD, 'groesse': [breite, y], 'clips': clips}, open(G / 'polizei.json', 'w'), separators=(',', ':'))
print('polizei.webp', atlas.size, (G / 'polizei.webp').stat().st_size // 1024, 'kB')

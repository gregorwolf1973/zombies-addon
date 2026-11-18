#!/usr/bin/env python3
"""Schneidet die benötigten Grafiken aus dem Kenney-Paket „Topdown Shooter“ (CC0, kenney.nl) aus.
Aufruf: PYTHONPATH=~/code/ahnen-werkzeuge/pil python3 tools/kenney_ausschneiden.py <entpackt-ordner> <ziel-ordner>"""
import sys, pathlib, shutil
from PIL import Image
quelle, ziel = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
ziel.mkdir(parents=True, exist_ok=True)
# Figuren: je Person stehend (ohne Waffe), mit Pistole, haltend (Nahkampf/Lampe)
for ordner, name in [("Man Blue", "manBlue"), ("Man Brown", "manBrown"), ("Man Old", "manOld"), ("Woman Green", "womanGreen"),
                     ("Survivor 1", "survivor1"), ("Hitman 1", "hitman1"), ("Soldier 1", "soldier1"), ("Zombie 1", "zoimbie1")]:
    for pose in ("stand", "gun", "hold"):
        q = quelle / "PNG" / ordner / f"{name}_{pose}.png"
        shutil.copyfile(q, ziel / f"{name.replace('zoimbie1', 'zombie')}_{pose}.png")
# Bäume, Büsche, Felsen, Kisten aus dem Gesamtbild (64-px-Raster)
blatt = Image.open(quelle / "Tilesheet" / "tilesheet_complete.png").convert("RGBA")
teile = {
    "baum_gross": (1152, 384, 128, 128), "baum_klein": (1280, 384, 64, 64),
    "baum_herbst": (1344, 384, 128, 128), "baum_herbst_klein": (1472, 384, 64, 64),
    "busch": (1152, 512, 64, 64), "busch_herbst": (1216, 512, 64, 64),
    "fels1": (1280, 512, 64, 64), "fels2": (1344, 512, 64, 64), "kiste": (1280, 256, 64, 64),
}
for name, (x, y, b, h) in teile.items():
    stueck = blatt.crop((x, y, x + b, y + h))
    bbox = stueck.getbbox()
    (stueck.crop(bbox) if bbox else stueck).save(ziel / f"{name}.png")
(ziel / "LIZENZ.txt").write_text("Grafiken: Kenney „Topdown Shooter“ (www.kenney.nl), Lizenz CC0 1.0 (Public Domain).\n", encoding="utf-8")
print(sorted(p.name for p in ziel.iterdir()))

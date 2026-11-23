#!/usr/bin/env python3
"""Ausgabe von cdp.mjs (Zeile 1 BILD, Zeile 2 Streifen-PNG, Zeile 3 Schlussbild) -> PNG-Streifen + Nahtprüfung.
Aufruf: PYTHONPATH=<pil> python3 zusammenbau.py <cdp-ausgabe.txt> <name> [feld_px=160]"""
import sys, base64, io, json
from PIL import Image, ImageChops
txt = open(sys.argv[1]).read().split('\n'); name = sys.argv[2]; fp = int(sys.argv[3]) if len(sys.argv) > 3 else 160
kopf = json.loads(txt[0][5:]); W, N = kopf['W'], kopf['N']
dec = lambda s: Image.open(io.BytesIO(base64.b64decode(s.split(',', 1)[1]))).convert('RGBA')
streifen = dec(txt[1]); letztes = dec(txt[2]) if len(txt) > 2 and txt[2].startswith('data:') else streifen.crop((0, 0, W, W))
bilder = [streifen.crop((i * W, 0, (i + 1) * W, W)) for i in range(N)]
d = lambda a, b: sum(ImageChops.difference(a.convert('RGB'), b.convert('RGB')).convert('L').histogram()[i] * i for i in range(256)) / (W * W)
naht = d(bilder[0], letztes); nach = d(bilder[0], bilder[1])
print(name, 'Naht Bild N vs 0:', round(naht, 3), ' Nachbarbild 0 vs 1:', round(nach, 3))
neu = Image.new('RGBA', (fp * N, fp))
for i, b in enumerate(bilder): neu.paste(b.resize((fp, fp), Image.LANCZOS), (i * fp, 0))
neu.save(name + '_streifen.png')

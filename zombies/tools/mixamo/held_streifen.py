#!/usr/bin/env python3
"""Ausgabe von held.html (cdp.mjs) -> je Auftrag <praefix>_<name>_streifen.png (+ Kontaktbild) und _meta.json (Dauer, Weg, Waffenposen 'pos' in Atlas-Pixeln ab Bildmitte).
Aufruf: PYTHONPATH=<pil> python3 held_streifen.py <ausgabe.txt> <zielordner> <praefix> [bildpx=160] [kontakt=1]"""
import sys, io, base64, json
from PIL import Image
txt = open(sys.argv[1]).read().split('\n'); ziel = sys.argv[2]; pre = sys.argv[3]; fp = int(sys.argv[4]) if len(sys.argv) > 4 else 160; kont = len(sys.argv) <= 5 or sys.argv[5] == '1'
if not txt[0].startswith('FERTIG'): print(txt[0][:600]); sys.exit(1)
for i in range(1, len(txt) - 1, 2):
    k = json.loads(txt[i][4:]); s = Image.open(io.BytesIO(base64.b64decode(txt[i + 1].split(',', 1)[1]))).convert('RGBA'); W, N = k['W'], k['N']; f = round(fp * W / 320)   # 80 px/Welteinheit gerendert -> fp px je 4 Einheiten Feld, andere Felder entsprechend
    neu = Image.new('RGBA', (f * N, f))
    for j in range(N): neu.paste(s.crop((j * W, 0, (j + 1) * W, W)).resize((f, f), Image.LANCZOS), (j * f, 0))
    # Randprüfung: berührt die Figur den Bildrand, ist das Feld zu klein
    rand = 0
    for j in range(N):
        a = neu.crop((j * f, 0, (j + 1) * f, f)).split()[3]
        for xy in [(x, y) for x in (0, f - 1) for y in range(f)] + [(x, y) for y in (0, f - 1) for x in range(f)]:
            if a.getpixel(xy) > 40: rand += 1
    neu.save(f"{ziel}/{pre}_{k['name']}_streifen.png")
    if kont:
        sh = Image.new('RGBA', (f * 8, f * ((N + 7) // 8)), (104, 146, 70, 255))
        for j in range(N): sh.alpha_composite(neu.crop((j * f, 0, (j + 1) * f, f)), ((j % 8) * f, (j // 8) * f))
        sh.save(f"{ziel}/{pre}_{k['name']}_kontakt.png")
    sk = f / W
    pos = {w: [[round(p[0] * sk, 1), round(p[1] * sk, 1), p[2], p[3]] for p in v] for w, v in k.get('pos', {}).items()}
    json.dump({'dauer': k['dauer'], 'N': N, 'f': f, 'einmal': k.get('einmal', 0), 'feld_m': W / 80, 'weg_m': k.get('weg', 0), 'pos': pos, 'hoehe': k.get('hoehe')}, open(f"{ziel}/{pre}_{k['name']}_meta.json", 'w'))
    print(k['name'], 'dauer', round(k['dauer'], 2), 'gier', round(k['gier']), 'sek', k['sek'], 'RAND' if rand else '', rand or '')

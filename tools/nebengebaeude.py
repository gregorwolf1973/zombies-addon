#!/usr/bin/env python3
"""Nebengebäude (Garagen, Gartenhäuser, Carports …) aus dem amtlichen 3D-Gebäudemodell LoD2 (Bayerische Vermessungsverwaltung, CC BY 4.0):
alle LoD2-Gebäude, die KEINEM OSM-Gebäude der Karte entsprechen, als Karten-Feld "nebengebaeude" in die Karten-JSON.
Aufruf: python3 tools/nebengebaeude.py <karte>
Eintrag: {"u": [x, y, …] Grundriss in Kachelkoordinaten (1/16 gerundet), "h": Höhe in dm, "art": garage|gartenhaus|carport|neben, "dach": [Dachflächen wie in daecher.json, Spielpixel], "farbe": "#rrggbb"?}
Art nach Fläche, Höhe und Lage: Carport = offen wirkend (Dachfläche flach, Höhe < 3,2 m, Fläche 10–40 m², keine Wand erkennbar ist nicht prüfbar → nur Flachdach), Garage = 12–60 m², Höhe < 4 m, Abstand zur Straße < 12 m;
Gartenhaus = < 30 m² abseits der Straße; sonst neben. Dachfarbe aus dem Luftbild (Median im Dachumriss, Cache tools/luftbild/cache/by)."""
import io, json, math, os, pathlib, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kulisse as KU
import xml.etree.ElementTree as ET
from PIL import Image, ImageDraw

SP = 32; NS = KU.NS

def flaeche(p):
    n = len(p) // 2
    return abs(sum(p[2 * i] * p[(2 * i + 3) % (2 * n)] - p[(2 * i + 2) % (2 * n)] * p[2 * i + 1] for i in range(n))) / 2

def main(name):
    karte = json.loads((KU.KARTEN / f"{name}.json").read_text()); K = KU.Karte(karte); B, H = karte["breite"], karte["hoehe"]
    zu = K.utm_zu_kachel(0, 0, B, H); roh = []
    for n in KU.lod2_kacheln(K, B, H):
        pfad = KU.CACHE / "lod2" / f"{n}.gml"
        print("LoD2-Kachel", n, "(vorhanden)" if pfad.exists() else "(lade)", flush=True)
        KU.laden(KU.LOD2.format(n=n), pfad)
        for ev, el in ET.iterparse(pfad, events=("end",)):
            if not el.tag.endswith("}Building"): continue
            at = {a.get("name"): a.findtext("n:value", namespaces=NS) for a in el.findall("n:stringAttribute", NS)}
            grund = float(at.get("HoeheGrund") or 0)
            boden = []
            for gs in el.iter("{%s}GroundSurface" % NS["b"]):
                for pl in gs.iter("{%s}Polygon" % NS["g"]):
                    ex = pl.find("g:exterior//g:posList", NS)
                    if ex is None: continue
                    v = [float(t) for t in ex.text.split()]; xy = []
                    for i in range(0, len(v) - 2, 3):
                        tx, ty = zu(v[i], v[i + 1]); xy += [tx, ty]
                    boden.append(xy[:-2])
            fl = []
            for rs in el.iter("{%s}RoofSurface" % NS["b"]):
                sa = {a.get("name"): a.findtext("n:value", namespaces=NS) for a in rs.findall("n:stringAttribute", NS)}
                neig, ori = float(sa.get("Dachneigung") or 0), float(sa.get("Dachorientierung") or -1)
                for pl in rs.iter("{%s}Polygon" % NS["g"]):
                    ex = pl.find("g:exterior//g:posList", NS)
                    if ex is None: continue
                    v = [float(t) for t in ex.text.split()]; xy = []; zs = []
                    for i in range(0, len(v) - 2, 3):
                        tx, ty = zu(v[i], v[i + 1]); xy += [tx * SP, ty * SP]; zs.append(v[i + 2] - grund)
                    xy, zs = xy[:-2], zs[:-1]
                    if len(zs) < 3: continue
                    fl.append({"p": [round(c) for c in xy], "n": round(neig), "a": round(ori), "e": round(min(zs) * 10)})
            el.clear()
            if not fl: continue
            if boden: u = max(boden, key=lambda p: flaeche(p))
            else:   # ohne Grundfläche: konvexe Hülle der Dachpunkte wäre aufwendig → Rechteck der Dachpunkte
                xs = [c / SP for f in fl for c in f["p"][0::2]]; ys = [c / SP for f in fl for c in f["p"][1::2]]
                u = [min(xs), min(ys), max(xs), min(ys), max(xs), max(ys), min(xs), max(ys)]
            cx, cy = sum(u[0::2]) / (len(u) // 2), sum(u[1::2]) / (len(u) // 2)
            if not (0 < cx < B and 0 < cy < H): continue
            tr = float(at.get("HoeheTraufe") or at.get("HoeheDach") or 0)
            roh.append({"u": u, "c": (cx, cy), "h": round((float(at.get("HoeheDach") or 0) - grund) * 10), "t": round((tr - grund) * 10), "f": fl})
    print("LoD2 in der Karte:", len(roh), flush=True)
    # OSM-Gebäude zuordnen: Schwerpunkt im Umriss, oder ein OSM-Umriss überdeckt mindestens 40 % der Grundfläche (Stichprobe)
    geb = [g["umriss"] for g in karte["gebaeude"] if g.get("umriss") and len(g["umriss"]) >= 6]
    rost = {}
    for i, u in enumerate(geb):
        for gx in range(int(min(u[0::2])) // 8 - 1, int(max(u[0::2])) // 8 + 2):
            for gy in range(int(min(u[1::2])) // 8 - 1, int(max(u[1::2])) // 8 + 2): rost.setdefault((gx, gy), []).append(i)
    def abgedeckt(b):
        u = b["u"]; xs, ys = u[0::2], u[1::2]; n = hit = 0
        for a in range(5):
            for c in range(5):
                px, py = min(xs) + (max(xs) - min(xs)) * (a + 0.5) / 5, min(ys) + (max(ys) - min(ys)) * (c + 0.5) / 5
                if not KU.im_polygon(px, py, u): continue
                n += 1
                if any(KU.im_polygon(px, py, geb[i]) for i in rost.get((int(px) // 8, int(py) // 8), [])): hit += 1
        return n and hit / n >= 0.4
    str_ = []
    for s in karte["strassen"]:
        if s["t"] in KU.ART_BREITE and s["t"] != "service":
            p = s["p"]
            for i in range(0, len(p) - 3, 2): str_.append((p[i], p[i + 1], p[i + 2], p[i + 3]))
    def strassenabstand(x, y):
        best = 1e9
        for ax, ay, bx, by in str_:
            if max(ax, bx) + 4 < x or min(ax, bx) - 4 > x or max(ay, by) + 4 < y or min(ay, by) - 4 > y: continue
            dx, dy = bx - ax, by - ay; l2 = dx * dx + dy * dy or 1e-9; t = max(0, min(1, ((x - ax) * dx + (y - ay) * dy) / l2))
            best = min(best, math.hypot(ax + t * dx - x, ay + t * dy - y) * 4)
        return best
    neben = []; ohne_farbe = 0
    mos = None
    for b in sorted(roh, key=lambda b: (b["c"][1], b["c"][0])):
        if abgedeckt(b): continue
        m2 = flaeche(b["u"]) * 16
        if m2 < 4 or m2 > 120 or b["h"] > 80: continue   # winzig/riesig: kein Nebengebäude (große unbekannte Gebäude fehlen in OSM, bleiben ohne Hindernis)
        dach_flach = all(f["n"] < 12 for f in b["f"])
        d = strassenabstand(*b["c"])
        if b["h"] < 32 and dach_flach and 10 <= m2 <= 40: art = "carport"
        elif 12 <= m2 <= 60 and b["h"] < 40 and d < 12: art = "garage"
        elif m2 < 30 and b["h"] < 40: art = "gartenhaus"
        else: art = "neben"
        # einfacher Umriss: 1/16 Kachel runden, doppelte Punkte entfernen
        u = []
        for i in range(0, len(b["u"]), 2):
            q = (round(b["u"][i] * 16) / 16, round(b["u"][i + 1] * 16) / 16)
            if not u or u[-1] != q: u.append(q)
        if len(u) > 2 and u[0] == u[-1]: u.pop()
        if len(u) < 3: continue
        neben.append({"u": [v for q in u for v in q], "h": b["h"], "art": art, "dach": [{"p": f["p"], "n": f["n"], "a": f["a"], "e": f["e"]} for f in b["f"]]})
    # Dachfarbe: Median der Luftbild-Pixel in der Mitte des Grundrisses (Mosaik Zoom 19 aus dem Cache)
    mos, tx0, ty0 = KU.mosaik(K, B, H)
    for n in neben:
        u = n["u"]; xs, ys = u[0::2], u[1::2]; px = []
        for a in range(5):
            for c in range(5):
                x, y = min(xs) + (max(xs) - min(xs)) * (a + 0.5) / 5, min(ys) + (max(ys) - min(ys)) * (c + 0.5) / 5
                if not KU.im_polygon(x, y, u): continue
                mx, my = K.merc(x, y); px.append(mos.getpixel((int(mx - tx0 * 256), int(my - ty0 * 256))))
        if px:
            px.sort(key=sum); r, g, b = px[len(px) // 2]; n["dach_farbe"] = "#%02x%02x%02x" % (r, g, b)
    karte["nebengebaeude"] = neben
    (KU.KARTEN / f"{name}.json").write_text(json.dumps(karte, ensure_ascii=False))
    from collections import Counter
    print("nebengebaeude:", len(neben), dict(Counter(n["art"] for n in neben)))

if __name__ == "__main__":
    main(sys.argv[1])

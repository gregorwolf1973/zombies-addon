#!/usr/bin/env python3
"""Holt OpenStreetMap-Daten (Overpass) für ein Gebiet und rechnet sie in das Kachelraster des Spiels um.
Daten © OpenStreetMap-Mitwirkende, Lizenz ODbL 1.0 – die erzeugte Karte steht ebenfalls unter ODbL.
Aufruf: python3 tools/osm_karte.py <süd> <west> <nord> <ost> <meter_pro_kachel> <ausgabe.json> [--neu]"""
import json, math, sys, urllib.request, urllib.parse, pathlib, collections

sued, west, nord, ost, mpk = map(float, sys.argv[1:6]); ausgabe = pathlib.Path(sys.argv[6])
roh = pathlib.Path(__file__).parent / "osm" / f"roh_{sued}_{west}_{nord}_{ost}.json"
if not roh.exists() or "--neu" in sys.argv:
    q = f"""[out:json][timeout:60];
(way["building"]({sued},{west},{nord},{ost}); way["highway"]({sued},{west},{nord},{ost});
 way["landuse"]({sued},{west},{nord},{ost}); way["leisure"]({sued},{west},{nord},{ost});
 way["natural"]({sued},{west},{nord},{ost}); way["waterway"]({sued},{west},{nord},{ost});
 way["amenity"]({sued},{west},{nord},{ost}); node["amenity"]({sued},{west},{nord},{ost});
 node["shop"]({sued},{west},{nord},{ost}); way["shop"]({sued},{west},{nord},{ost}););
out body; >; out skel qt;"""
    req = urllib.request.Request("https://overpass-api.de/api/interpreter", data=urllib.parse.urlencode({"data": q}).encode(),
                                 headers={"User-Agent": "zombies-karte/0.1"})
    roh.write_bytes(urllib.request.urlopen(req, timeout=120).read())
daten = json.loads(roh.read_text())["elements"]
knoten = {e["id"]: (e["lat"], e["lon"]) for e in daten if e["type"] == "node" and "lat" in e}
wege = [e for e in daten if e["type"] == "way" and "tags" in e]
punkte = [e for e in daten if e["type"] == "node" and "tags" in e]

# Projektion: Meter um die Gebietsmitte, dann Kacheln (y nach Süden)
mlat, mlon = (sued + nord) / 2, (west + ost) / 2
kx = lambda lon: (lon - west) * 111320 * math.cos(math.radians(mlat)) / mpk
ky = lambda lat: (nord - lat) * 110540 / mpk
B = int(math.ceil(kx(ost))); H = int(math.ceil(ky(sued)))
WIESE, STRASSE, WAND, BODEN, TUER, WASSER, BAUM, PLATZ, ZAUN = 0, 1, 2, 3, 4, 5, 6, 7, 8
k = [[WIESE] * B for _ in range(H)]

def poly(w): return [(kx(knoten[n][1]), ky(knoten[n][0])) for n in w["nodes"] if n in knoten]
def innen(px, py, pts):
    drin = False
    for i in range(len(pts)):
        x1, y1 = pts[i]; x2, y2 = pts[i - 1]
        if (y1 > py) != (y2 > py) and px < (x2 - x1) * (py - y1) / (y2 - y1) + x1: drin = not drin
    return drin
def fuelle(pts, wert, nur=None):
    if len(pts) < 3: return []
    xs, ys = [p[0] for p in pts], [p[1] for p in pts]
    belegt = []
    for y in range(max(0, int(min(ys))), min(H, int(max(ys)) + 1)):
        for x in range(max(0, int(min(xs))), min(B, int(max(xs)) + 1)):
            if innen(x + 0.5, y + 0.5, pts) and (nur is None or k[y][x] in nur):
                k[y][x] = wert; belegt.append((x, y))
    return belegt
def linie(pts, breite, wert, nur=None):
    r = breite / 2
    for (x1, y1), (x2, y2) in zip(pts, pts[1:]):
        n = int(max(abs(x2 - x1), abs(y2 - y1)) * 2) + 1
        for i in range(n + 1):
            x, y = x1 + (x2 - x1) * i / n, y1 + (y2 - y1) * i / n
            for yy in range(int(y - r), int(y + r) + 1):
                for xx in range(int(x - r), int(x + r) + 1):
                    if 0 <= xx < B and 0 <= yy < H and (xx + .5 - x) ** 2 + (yy + .5 - y) ** 2 <= r * r + .25:
                        if nur is None or k[yy][xx] in nur: k[yy][xx] = wert

# 1. Flächen: Wald/Bäume, Wasser, Plätze/Parkplätze
for w in wege:
    t = w["tags"]
    if t.get("natural") in ("wood", "scrub") or t.get("landuse") == "forest": fuelle(poly(w), BAUM)
    elif t.get("natural") == "water" or t.get("waterway") == "riverbank": fuelle(poly(w), WASSER)
    elif t.get("amenity") == "parking" or t.get("highway") == "pedestrian" and w["nodes"][0] == w["nodes"][-1] or t.get("place") == "square":
        fuelle(poly(w), PLATZ)
for w in wege:
    if w["tags"].get("waterway") in ("river", "stream", "canal"): linie(poly(w), 3 if w["tags"]["waterway"] == "river" else 1.5, WASSER)
# 2. Straßen und Wege
BREITEN = {"primary": 4, "secondary": 3.5, "tertiary": 3, "residential": 2.5, "unclassified": 2.5, "living_street": 2,
           "service": 1.5, "pedestrian": 2, "footway": 1, "path": 1, "cycleway": 1, "track": 1.2}
for w in wege:
    hw = w["tags"].get("highway")
    if hw in BREITEN and w["nodes"][0] != w["nodes"][-1] or hw in ("footway", "path"):
        if hw in BREITEN: linie(poly(w), BREITEN[hw] * 4 / mpk if mpk else BREITEN[hw], STRASSE if hw not in ("footway", "path", "cycleway", "track") else PLATZ)
# 3. Gebäude (Rand = Wand, innen Boden), Tür zur nächsten Straße
gebaeude = []
punkt_infos = [(kx(p["lon"]), ky(p["lat"]), p["tags"]) for p in punkte]
for w in wege:
    t = w["tags"]
    if "building" not in t: continue
    pts = poly(w)
    zellen = fuelle(pts, BODEN, nur={WIESE, PLATZ, BAUM})
    if len(zellen) < 4: continue
    menge = set(zellen)
    for (x, y) in zellen:
        if any((x + dx, y + dy) not in menge for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))): k[y][x] = WAND
    # Name/Art aus den Tags oder aus Punkten im Gebäude
    info = {key: t[key] for key in ("name", "amenity", "shop", "building", "addr:street", "addr:housenumber") if key in t}
    for (px, py, pt) in punkt_infos:
        if innen(px, py, pts):
            for key in ("name", "amenity", "shop"):
                if key in pt and key not in info: info[key] = pt[key]
    # Tür: Wandkachel mit Straße/Platz möglichst nah davor
    beste, bd = None, 1e9
    for (x, y) in zellen:
        if k[y][x] != WAND: continue
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ix, iy = x - dx, y - dy
            if (ix, iy) not in menge or k[iy][ix] != BODEN: continue
            for s in range(1, 8):
                ax, ay = x + dx * s, y + dy * s
                if not (0 <= ax < B and 0 <= ay < H): break
                if k[ay][ax] in (STRASSE, PLATZ):
                    if s < bd: bd, beste = s, (x, y)
                    break
                if k[ay][ax] in (WAND, WASSER): break
    if beste: k[beste[1]][beste[0]] = TUER
    xs, ys = [z[0] for z in zellen], [z[1] for z in zellen]
    gebaeude.append({"x": min(xs), "y": min(ys), "b": max(xs) - min(xs) + 1, "h": max(ys) - min(ys) + 1,
                     "tuer": {"x": beste[0], "y": beste[1]} if beste else None, "flaeche": len(zellen), **info})
# 4. Ränder: Zaun
for x in range(B): k[0][x] = k[H - 1][x] = ZAUN
for y in range(H): k[y][0] = k[y][B - 1] = ZAUN

zaehl = collections.Counter(v for zeile in k for v in zeile)
benannt = [g for g in gebaeude if g.get("name") or g.get("amenity") or g.get("shop")]
ausgabe.write_text(json.dumps({"quelle": "© OpenStreetMap-Mitwirkende (ODbL 1.0)", "bbox": [sued, west, nord, ost],
                               "meterProKachel": mpk, "breite": B, "hoehe": H,
                               "kacheln": "".join("0123456789"[v] for zeile in k for v in zeile), "gebaeude": gebaeude},
                              ensure_ascii=False))
print(f"{B}×{H} Kacheln ({mpk} m), Gebäude {len(gebaeude)} (mit Tür {sum(1 for g in gebaeude if g['tuer'])}), benannt {len(benannt)}")
print("Kacheln:", {n: zaehl[v] for n, v in [("Wiese", WIESE), ("Straße", STRASSE), ("Wand", WAND), ("Boden", BODEN), ("Tür", TUER), ("Wasser", WASSER), ("Baum", BAUM), ("Platz", PLATZ)]})
print("Benannte Gebäude:", sorted({(g.get('name') or g.get('shop') or g.get('amenity')) for g in benannt})[:40])

#!/usr/bin/env python3
"""Holt OpenStreetMap-Daten (Overpass) für ein Gebiet und rechnet sie in das Kachelraster des Spiels um.
Daten © OpenStreetMap-Mitwirkende, Lizenz ODbL 1.0 – die erzeugte Karte steht ebenfalls unter ODbL.
Aufruf: python3 tools/osm_karte.py <süd> <west> <nord> <ost> <meter_pro_kachel> <ausgabe.json> [--neu] [--fluss=<Meter>] [--hausumringe=<Datei>]
  --hausumringe=<Datei>: Gebäude aus den amtlichen Hausumringen (tools/hausumringe.py) statt aus OSM-Umrissen; OSM-Angaben (Name, Art, Adresse) per Überlappung übertragen.
  --fluss=<Meter>: waterway=river (Linie) mindestens so breit zeichnen (für große Flüsse wie die Isar); ohne Angabe bleibt es bei 3 Kacheln.
  Umgebungsvariable OVERPASS_URL: anderer Overpass-Server."""
import json, math, sys, os, urllib.request, urllib.parse, pathlib, collections

sued, west, nord, ost, mpk = map(float, sys.argv[1:6]); ausgabe = pathlib.Path(sys.argv[6])
roh = pathlib.Path(__file__).parent / "osm" / f"roh_{sued}_{west}_{nord}_{ost}.json"
if not roh.exists() or "--neu" in sys.argv:
    q = f"""[out:json][timeout:60];
(way["building"]({sued},{west},{nord},{ost}); way["highway"]({sued},{west},{nord},{ost});
 way["landuse"]({sued},{west},{nord},{ost}); way["leisure"]({sued},{west},{nord},{ost});
 way["natural"]({sued},{west},{nord},{ost}); way["waterway"]({sued},{west},{nord},{ost});
 way["amenity"]({sued},{west},{nord},{ost}); node["amenity"]({sued},{west},{nord},{ost});
 node["shop"]({sued},{west},{nord},{ost}); way["shop"]({sued},{west},{nord},{ost});
 way["barrier"]({sued},{west},{nord},{ost}); node["barrier"]({sued},{west},{nord},{ost});
 node["natural"]({sued},{west},{nord},{ost}); node["highway"="bus_stop"]({sued},{west},{nord},{ost});
 node["leisure"]({sued},{west},{nord},{ost}); way["man_made"]({sued},{west},{nord},{ost}););
out body; >; out skel qt;"""
    req = urllib.request.Request(os.environ.get("OVERPASS_URL", "https://overpass-api.de/api/interpreter"), data=urllib.parse.urlencode({"data": q}).encode(),
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
FLUSS_M = next((float(a[8:]) for a in sys.argv if a.startswith("--fluss=")), 0.0)
B = int(math.ceil(kx(ost))); H = int(math.ceil(ky(sued)))
WIESE, STRASSE, WAND, BODEN, TUER, WASSER, BAUM, PLATZ, ZAUN = 0, 1, 2, 3, 4, 5, 6, 7, 8
k = [[WIESE] * B for _ in range(H)]

def flach(pts, stellen=1): return [round(v, stellen) for p in pts for v in p]   # Umriss für die Darstellung: [x0, y0, x1, y1, …] in Kacheln
def poly(w): return [(kx(knoten[n][1]), ky(knoten[n][0])) for n in w["nodes"] if n in knoten]
def innen(px, py, pts):
    drin = False
    for i in range(len(pts)):
        x1, y1 = pts[i]; x2, y2 = pts[i - 1]
        if (y1 > py) != (y2 > py) and px < (x2 - x1) * (py - y1) / (y2 - y1) + x1: drin = not drin
    return drin
def fuelle(pts, wert, nur=None, trocken=False):
    """füllt das Polygon im Raster (trocken=True: nur zählen, Raster unverändert); gibt die betroffenen Kacheln zurück"""
    if len(pts) < 3: return []
    xs, ys = [p[0] for p in pts], [p[1] for p in pts]
    belegt = []
    for y in range(max(0, int(min(ys))), min(H, int(max(ys)) + 1)):
        for x in range(max(0, int(min(xs))), min(B, int(max(xs)) + 1)):
            if innen(x + 0.5, y + 0.5, pts) and (nur is None or k[y][x] in nur):
                if not trocken: k[y][x] = wert
                belegt.append((x, y))
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
    if w["tags"].get("waterway") in ("river", "stream", "canal"): linie(poly(w), max(3 if w["tags"]["waterway"] == "river" else 1.5, FLUSS_M / mpk if w["tags"]["waterway"] == "river" else 0), WASSER)
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
INFO_KEYS = ("name", "amenity", "shop", "building", "addr:street", "addr:housenumber")
NAMENS_KEYS = ("name", "amenity", "shop")

def umringe_mit_tags(datei):
    """--hausumringe=<Datei> (tools/hausumringe.py): Gebäude = amtliche Hausumringe statt OSM-Umrisse. Die OSM-Angaben (Name, Art,
    Adresse) gehen per Flächenüberlappung an die Hausumringe: jeder Umring bekommt die Angaben des OSM-Gebäudes, das ihn am meisten
    überdeckt (mindestens 30 % der kleineren der beiden Flächen); Name, Art (amenity/shop) und Adresse nur bei mindestens halber Überdeckung und nicht
    viel kleiner als der größte Umring dieses OSM-Gebäudes (kleine Anbauten bleiben „Gebäude“). OSM-Gebäude mit Name/Art, zu denen
    kein Umring passt (Neubauten, Fehler), bleiben als OSM-Umriss erhalten."""
    ringe = [[(u[i], u[i + 1]) for i in range(0, len(u), 2)] for u in (h["u"] for h in json.loads(pathlib.Path(datei).read_text())["haeuser"])]
    osm = []
    for w in wege:
        if "building" not in w["tags"]: continue
        pts = poly(w)
        if len(pts) > 1 and pts[0] == pts[-1]: pts = pts[:-1]
        if len(pts) < 3: continue
        t = {key: w["tags"][key] for key in INFO_KEYS if key in w["tags"]}
        for (px, py, pt) in punkt_infos:       # Name/Art aus POI-Punkten im OSM-Gebäude (wie beim reinen OSM-Kartenbau)
            if innen(px, py, pts):
                for key in NAMENS_KEYS:
                    if key in pt and key not in t: t[key] = pt[key]
        osm.append((pts, t))
    GR = 8
    rost = {}
    for i, (pts, _) in enumerate(osm):
        for gx in range(int(min(p[0] for p in pts)) // GR, int(max(p[0] for p in pts)) // GR + 1):
            for gy in range(int(min(p[1] for p in pts)) // GR, int(max(p[1] for p in pts)) // GR + 1): rost.setdefault((gx, gy), []).append(i)
    osm_n = [abs(sum(p[j][0] * p[(j + 1) % len(p)][1] - p[(j + 1) % len(p)][0] * p[j][1] for j in range(len(p)))) / 2 / 0.125 ** 2 for p, _ in osm]   # Stichproben je OSM-Gebäude
    SCHRITT = 0.125     # Stichprobenraster in Kacheln (0,5 m)
    treffer = []        # je Umring: {OSM-Index: Anzahl Stichproben}, Gesamtzahl
    for ring in ringe:
        xs, ys = [p[0] for p in ring], [p[1] for p in ring]; zaehl = {}; n = 0
        y = min(ys) + SCHRITT / 2
        while y < max(ys):
            x = min(xs) + SCHRITT / 2
            while x < max(xs):
                if innen(x, y, ring):
                    n += 1
                    for i in rost.get((int(x) // GR, int(y) // GR), []):
                        if innen(x, y, osm[i][0]): zaehl[i] = zaehl.get(i, 0) + 1
                x += SCHRITT
            y += SCHRITT
        treffer.append((zaehl, n))
    # größter Umring je OSM-Gebäude (nach überdeckten Stichproben)
    groesster = {}
    for zaehl, n in treffer:
        for i, c in zaehl.items(): groesster[i] = max(groesster.get(i, 0), c)
    ergebnis, benutzt = [], set()
    for ring, (zaehl, n) in zip(ringe, treffer):
        info = {"building": "yes"}
        # Kandidaten nach Überlappung; Überlappung zur kleineren der beiden Flächen (OSM-Umriss liegt oft nur teilweise im Hausumring)
        kand = [(c, i) for i, c in sorted(zaehl.items(), key=lambda kv: (-kv[1], kv[0])) if n and c >= 0.3 * min(n, osm_n[i])]
        if kand:
            c0, i0 = kand[0]; benutzt.add(i0)
            info = {key: osm[i0][1][key] for key in INFO_KEYS if key in osm[i0][1]}
            for key in NAMENS_KEYS + ("addr:street", "addr:housenumber"): info.pop(key, None)
            # Name/Art/Adresse vom besten Kandidaten, der sie hat, bei mindestens halber Überdeckung und nicht viel kleinerem Umring als sein größter
            for c, i in kand:
                t = osm[i][1]
                if any(key in t for key in NAMENS_KEYS) and c >= 0.5 * min(n, osm_n[i]) and c >= 0.25 * groesster[i]:
                    benutzt.add(i)
                    for key in NAMENS_KEYS + ("addr:street", "addr:housenumber"):
                        if key in t: info[key] = t[key]
                    break
            else:
                t = osm[i0][1]
                if c0 >= 0.5 * min(n, osm_n[i0]) and c0 >= 0.25 * groesster[i0]:    # reine Adresse ohne Namen
                    for key in ("addr:street", "addr:housenumber"):
                        if key in t: info[key] = t[key]
        ergebnis.append((ring, info))
    verwaist = 0
    for i, (pts, t) in enumerate(osm):
        if i in benutzt or not any(key in t for key in NAMENS_KEYS): continue
        ueber = sum(1 for zaehl, n in treffer if i in zaehl)
        if ueber == 0: ergebnis.append((pts, {key: t[key] for key in INFO_KEYS if key in t})); verwaist += 1
    print(f"Hausumringe: {len(ringe)} Umringe, {sum(1 for _, i in ergebnis if i.get('name') or i.get('amenity') or i.get('shop'))} mit Name/Art, "
          f"{len(osm)} OSM-Gebäude, {verwaist} benannte OSM-Gebäude ohne Umring behalten")
    return ergebnis

HAUSUMRINGE = next((a[14:] for a in sys.argv if a.startswith("--hausumringe=")), None)
if HAUSUMRINGE:
    bauten = umringe_mit_tags(HAUSUMRINGE)
else:
    bauten = []
    for w in wege:
        t = w["tags"]
        if "building" not in t: continue
        bauten.append((poly(w), {key: t[key] for key in INFO_KEYS if key in t}))
for pts, info in bauten:
    if HAUSUMRINGE and len(fuelle(pts, BODEN, nur={WIESE, PLATZ, BAUM}, trocken=True)) < 4: continue   # kleine Bauten bleiben Nebengebäude: keine verwaisten Bodenkacheln
    zellen = fuelle(pts, BODEN, nur={WIESE, PLATZ, BAUM})
    if len(zellen) < 4: continue
    menge = set(zellen)
    for (x, y) in zellen:
        if any((x + dx, y + dy) not in menge for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))): k[y][x] = WAND
    # Name/Art aus den Tags oder aus Punkten im Gebäude
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
            # zur Straße zeigen; ein Fußweg oder Platz zählt nur, wenn keine Straße in der Nähe ist (sonst stehen
            # sich zwei Haustüren am Fußweg zwischen den Häusern gegenüber)
            for s in range(1, 12):
                ax, ay = x + dx * s, y + dy * s
                if not (0 <= ax < B and 0 <= ay < H): break
                if k[ay][ax] in (STRASSE, PLATZ):
                    kosten = s if k[ay][ax] == STRASSE else s + 6
                    if kosten < bd: bd, beste = kosten, (x, y)
                    break
                if k[ay][ax] in (WAND, WASSER): break
    if beste: k[beste[1]][beste[0]] = TUER
    xs, ys = [z[0] for z in zellen], [z[1] for z in zellen]
    gebaeude.append({"x": min(xs), "y": min(ys), "b": max(xs) - min(xs) + 1, "h": max(ys) - min(ys) + 1,
                     "tuer": {"x": beste[0], "y": beste[1]} if beste else None, "flaeche": len(zellen), **info,
                     "umriss": flach(pts[:-1] if pts and pts[0] == pts[-1] else pts, 2 if HAUSUMRINGE else 1)})
# 3b. Vektordaten nur fürs Aussehen (Kollision bleibt beim Raster): Straßenlinien und Flächen
strassen, flaechen = [], []
for w in wege:
    t, hw = w["tags"], w["tags"].get("highway")
    if hw in BREITEN and not (w["nodes"][0] == w["nodes"][-1] and t.get("area") == "yes"):
        if w["nodes"][0] == w["nodes"][-1] and hw == "pedestrian": continue
        zusatz = {kk: t[ok] for kk, ok in (("n", "name"), ("ref", "ref"), ("spuren", "lanes"), ("breite", "width")) if t.get(ok)}
        strassen.append({"t": hw, "b": BREITEN[hw] * 4 / mpk, "p": flach(poly(w)), **zusatz})
    art = ("wald" if t.get("natural") in ("wood", "scrub") or t.get("landuse") == "forest" else
           "parkplatz" if t.get("amenity") == "parking" else
           "platz" if (hw == "pedestrian" and w["nodes"][0] == w["nodes"][-1]) or t.get("place") == "square" else
           "gruen" if t.get("landuse") in ("grass", "meadow", "village_green", "recreation_ground") or t.get("leisure") in ("park", "garden") else
           "acker" if t.get("landuse") in ("farmland", "orchard", "allotments") else
           "spielplatz" if t.get("leisure") == "playground" else
           "laufbahn" if t.get("leisure") == "track" else
           "sport" if t.get("leisure") in ("pitch", "sports_centre") else
           "gewerbe" if t.get("landuse") in ("commercial", "retail", "industrial", "garages") else
           "friedhof" if t.get("landuse") == "cemetery" or t.get("amenity") == "grave_yard" else None)
    if art and w["nodes"][0] == w["nodes"][-1] and len(w["nodes"]) > 3:
        flaechen.append({"a": art, "p": flach(poly(w)[:-1]), **({"s": t["sport"]} if t.get("sport") else {})})
# 3c. Details, die in OSM fehlen (fest gesät, damit jede Erzeugung gleich ausfällt):
#     Gärten mit Hecke/Zaun/Mauer und Gartentor, Gartenhaus, Pool, Trampolin, Beete, Obstbäume,
#     Alleebäume, Bänke und Kübel auf Plätzen, Bushaltestellen und Bäume aus OSM.
import random
zufall = random.Random(20261118)
R4 = ((1, 0), (-1, 0), (0, 1), (0, -1))
def drin(x, y): return 0 < x < B - 1 and 0 < y < H - 1
garten = [[-1] * B for _ in range(H)]          # Besitzer (Index in gebaeude) je Wiesenkachel
zaunart = [['.'] * B for _ in range(H)]
objekte = []
WOHN = {"yes", "house", "detached", "residential", "semidetached_house", "terrace", "bungalow"}
GARTEN_MIN = 11 if HAUSUMRINGE else 12   # amtliche Umringe sind genauer (kleiner) als die OSM-Umrisse
haeuser_g = [i for i, g in enumerate(gebaeude) if g["tuer"] and GARTEN_MIN <= g["flaeche"] <= 140
             and not (g.get("name") or g.get("shop") or g.get("amenity")) and g.get("building", "yes") in WOHN]
# Mehrquellen-Breitensuche: jede Wiesenkachel bis 4 Schritte vom Haus gehört dem nächsten Haus
from collections import deque
q = deque(); abstand = {}
for i in haeuser_g:
    g = gebaeude[i]
    for y in range(g["y"], g["y"] + g["h"]):
        for x in range(g["x"], g["x"] + g["b"]):
            if k[y][x] in (WAND, TUER):
                for dx, dy in R4:
                    nx, ny = x + dx, y + dy
                    if drin(nx, ny) and k[ny][nx] in (WIESE, BAUM) and garten[ny][nx] == -1:
                        garten[ny][nx] = i; abstand[(nx, ny)] = 1; q.append((nx, ny))
while q:
    x, y = q.popleft(); d = abstand[(x, y)]
    if d >= 4: continue
    for dx, dy in R4:
        nx, ny = x + dx, y + dy
        if drin(nx, ny) and k[ny][nx] in (WIESE, BAUM) and garten[ny][nx] == -1:
            garten[ny][nx] = garten[y][x]; abstand[(nx, ny)] = d + 1; q.append((nx, ny))
# Gartentor: von der Haustür geradeaus nach draußen
tor_frei = set()
for i in haeuser_g:
    t = gebaeude[i]["tuer"]; tx, ty = t["x"], t["y"]
    for dx, dy in R4:
        if k[ty - dy][tx - dx] == BODEN and k[ty + dy][tx + dx] not in (WAND, BODEN):
            x, y = tx + dx, ty + dy
            for _ in range(8):
                if not drin(x, y): break
                tor_frei.add((x, y)); tor_frei.add((x - dy, y - dx)) if zufall.random() < 0.5 else None
                if garten[y][x] != i: break
                x += dx; y += dy
            break
# Grenze des Gartens wird Hecke, Zaun oder Mauer
ARTEN = "hhhhzzzmmw"
art_von = {i: zufall.choice(ARTEN) for i in haeuser_g}
for y in range(1, H - 1):
    for x in range(1, B - 1):
        i = garten[y][x]
        if i < 0 or (x, y) in tor_frei: continue
        g = gebaeude[i]
        def eigen(nx, ny): return garten[ny][nx] == i or (g["x"] <= nx < g["x"] + g["b"] and g["y"] <= ny < g["y"] + g["h"] and k[ny][nx] in (WAND, TUER, BODEN))
        # an der Grenze zu einem Nachbargarten setzt nur einer der beiden den Zaun (sonst doppelt)
        fremd = [(x + dx, y + dy) for dx, dy in R4 if not eigen(x + dx, y + dy)]
        if fremd and any(not (garten[ny][nx] >= 0 and garten[ny][nx] < i and k[ny][nx] == ZAUN) for nx, ny in fremd):
            if all(garten[ny][nx] >= 0 and garten[ny][nx] < i for nx, ny in fremd) and any(k[ny][nx] == ZAUN for nx, ny in fremd): continue
            k[y][x] = ZAUN; zaunart[y][x] = art_von[i]
# Gartenausstattung
def innen_frei(x, y, b, h, i):
    for yy in range(y - 1, y + h + 1):
        for xx in range(x - 1, x + b + 1):
            if not drin(xx, yy) or (xx, yy) in tor_frei or k[yy][xx] == TUER: return False
            innen = x <= xx < x + b and y <= yy < y + h
            if innen and (garten[yy][xx] != i or k[yy][xx] not in (WIESE, BAUM)): return False
    return True
for i in haeuser_g:
    zellen = [(x, y) for y in range(gebaeude[i]["y"] - 4, gebaeude[i]["y"] + gebaeude[i]["h"] + 4)
              for x in range(gebaeude[i]["x"] - 4, gebaeude[i]["x"] + gebaeude[i]["b"] + 4) if drin(x, y) and garten[y][x] == i]
    zufall.shuffle(zellen)
    wuensche = []
    if zufall.random() < 0.10: wuensche.append(("pool", 3, 2))
    if zufall.random() < 0.22: wuensche.append(("gartenhaus", 1, 1))
    if zufall.random() < 0.12: wuensche.append(("trampolin", 1, 1))
    if zufall.random() < 0.30: wuensche.append(("beet", 2, 1))
    if zufall.random() < 0.18: wuensche.append(("sitzgruppe", 1, 1))
    for _ in range(zufall.choice((0, 1, 1, 2))): wuensche.append(("obstbaum", 1, 1))
    for art, b, h in wuensche:
        if zufall.random() < 0.5: b, h = h, b
        for (x, y) in zellen:
            if innen_frei(x, y, b, h, i):
                if art == "pool":
                    for yy in range(y, y + h):
                        for xx in range(x, x + b): k[yy][xx] = WASSER
                elif art == "gartenhaus": k[y][x] = WAND
                elif art == "obstbaum": k[y][x] = BAUM
                if art != "obstbaum": objekte.append({"a": art, "x": x, "y": y, "b": b, "h": h})
                for yy in range(y, y + h):
                    for xx in range(x, x + b): garten[yy][xx] = -2   # belegt (nicht nochmal verwenden)
                break
# Bäume aus OSM, Bänke, Bushaltestellen
for (px, py, pt) in punkt_infos:
    x, y = int(px), int(py)
    if not drin(x, y): continue
    if pt.get("natural") == "tree" and k[y][x] == WIESE: k[y][x] = BAUM
    elif pt.get("amenity") == "bench": objekte.append({"a": "bank", "x": round(px, 1), "y": round(py, 1)})
    elif pt.get("highway") == "bus_stop": objekte.append({"a": "haltestelle", "x": round(px, 1), "y": round(py, 1), "n": pt.get("name", "")})
    elif pt.get("amenity") in ("waste_basket", "recycling"): objekte.append({"a": "muell", "x": round(px, 1), "y": round(py, 1)})
# Alleebäume an größeren Straßen
for w in wege:
    hw = w["tags"].get("highway")
    if hw not in ("secondary", "tertiary", "primary"): continue
    pts = poly(w); off = BREITEN[hw] / 2 + 1.3
    rest = 3.0
    for (x1, y1), (x2, y2) in zip(pts, pts[1:]):
        L = math.hypot(x2 - x1, y2 - y1)
        if L < 0.5: continue
        nx, ny = -(y2 - y1) / L, (x2 - x1) / L
        d = rest
        while d < L:
            for seite in (1, -1):
                tx, ty = int(x1 + (x2 - x1) * d / L + nx * off * seite), int(y1 + (y2 - y1) * d / L + ny * off * seite)
                if drin(tx, ty) and k[ty][tx] == WIESE and garten[ty][tx] == -1: k[ty][tx] = BAUM
            d += 6
        rest = d - L
# Plätze: Bänke und Blumenkübel am Rand der Fußgängerflächen
for w in wege:
    t = w["tags"]
    if not ((t.get("highway") == "pedestrian" and w["nodes"][0] == w["nodes"][-1]) or t.get("place") == "square"): continue
    pts = poly(w); n = 0
    for (x1, y1), (x2, y2) in zip(pts, pts[1:]):
        L = math.hypot(x2 - x1, y2 - y1); d = 2.0
        while d < L - 1 and n < 14:
            # leicht nach innen versetzt
            cx, cy = x1 + (x2 - x1) * d / L, y1 + (y2 - y1) * d / L
            mx, my = sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts)
            l2 = math.hypot(mx - cx, my - cy) or 1
            ox, oy = cx + (mx - cx) / l2 * 1.2, cy + (my - cy) / l2 * 1.2
            objekte.append({"a": "bank" if n % 3 else "kuebel", "x": round(ox, 1), "y": round(oy, 1), "w": round(math.atan2(y2 - y1, x2 - x1), 2)})
            n += 1; d += 5
# Kein Haus darf durch Zäune abgeschnitten sein: von den Straßen aus erreichbar machen (Zaun-Kacheln auf dem kürzesten Weg öffnen)
GEHBAR = {WIESE, STRASSE, PLATZ, BAUM, TUER}
erreicht = [[False] * B for _ in range(H)]
q = deque((x, y) for y in range(H) for x in range(B) if k[y][x] == STRASSE)
for (x, y) in q: erreicht[y][x] = True
while q:
    x, y = q.popleft()
    for dx, dy in R4:
        nx, ny = x + dx, y + dy
        if drin(nx, ny) and not erreicht[ny][nx] and k[ny][nx] in GEHBAR:
            erreicht[ny][nx] = True; q.append((nx, ny))
geoeffnet = 0
for i in haeuser_g:
    t = gebaeude[i]["tuer"]
    if erreicht[t["y"]][t["x"]]: continue
    # 0-1-Suche: Zaun kostet 1
    start = (t["x"], t["y"]); kosten = {start: 0}; vor = {}; dq = deque([start]); ziel = None
    while dq:
        x, y = dq.popleft()
        if erreicht[y][x] and (x, y) != start: ziel = (x, y); break
        for dx, dy in R4:
            nx, ny = x + dx, y + dy
            if not drin(nx, ny) or k[ny][nx] not in GEHBAR | {ZAUN}: continue
            c = kosten[(x, y)] + (1 if k[ny][nx] == ZAUN else 0)
            if c < kosten.get((nx, ny), 1e9):
                kosten[(nx, ny)] = c; vor[(nx, ny)] = (x, y)
                (dq.append if k[ny][nx] == ZAUN else dq.appendleft)((nx, ny))
    while ziel and ziel != start:
        x, y = ziel
        if k[y][x] == ZAUN: k[y][x] = WIESE; zaunart[y][x] = '.'; geoeffnet += 1
        ziel = vor.get(ziel)
# Zaunlinien fürs Aussehen: Zaunfelder je Garten zu Ketten verbinden und mit Douglas-Peucker begradigen
def dp(punkte, eps):
    if len(punkte) < 3: return punkte
    (x1, y1), (x2, y2) = punkte[0], punkte[-1]
    L = math.hypot(x2 - x1, y2 - y1) or 1e-9
    beste, bi = -1, 0
    for i in range(1, len(punkte) - 1):
        px, py = punkte[i]
        d = abs((x2 - x1) * (y1 - py) - (x1 - px) * (y2 - y1)) / L
        if d > beste: beste, bi = d, i
    if beste <= eps: return [punkte[0], punkte[-1]]
    return dp(punkte[:bi + 1], eps)[:-1] + dp(punkte[bi:], eps)
zaeune = []
NACHBARN = [(1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (1, -1), (-1, 1), (-1, -1)]
for i in haeuser_g:
    g = gebaeude[i]
    felder = {(x, y) for y in range(g["y"] - 6, g["y"] + g["h"] + 6) for x in range(g["x"] - 6, g["x"] + g["b"] + 6)
              if drin(x, y) and k[y][x] == ZAUN and zaunart[y][x] != '.' and garten[y][x] == i}
    offen = set(felder)
    def nachbarn(f): return [(f[0] + dx, f[1] + dy) for dx, dy in NACHBARN if (f[0] + dx, f[1] + dy) in felder]
    while offen:
        ende = [f for f in offen if len([n for n in nachbarn(f) if n in offen]) <= 1]
        start = min(ende) if ende else min(offen)
        kette = [start]; offen.discard(start); f = start
        while True:
            kand = [n for n in nachbarn(f) if n in offen]
            if not kand: break
            kand.sort(key=lambda n: (abs(n[0] - f[0]) + abs(n[1] - f[1]), n))   # gerade Nachbarn zuerst
            f = kand[0]; kette.append(f); offen.discard(f)
        punkte = [(x + 0.5, y + 0.5) for x, y in kette]
        if len(kette) > 2 and max(abs(kette[0][0] - kette[-1][0]), abs(kette[0][1] - kette[-1][1])) <= 1: punkte.append(punkte[0])   # geschlossen
        punkte = dp(punkte, 0.75)
        if len(punkte) >= 2: zaeune.append({"a": art_von[i], "p": flach(punkte)})
print(f"Zaunlinien: {len(zaeune)}")
gartenzeichen = [['.' if garten[y][x] < 0 else "01234"[garten[y][x] % 5] for x in range(B)] for y in range(H)]
print(f"Details: {len(haeuser_g)} Gärten, {sum(r.count('h') + r.count('z') + r.count('m') + r.count('w') for r in zaunart)} Zaunkacheln, "
      f"{len(objekte)} Objekte, {geoeffnet} Zaunlücken für erreichbare Türen")

# 4. Ränder: Zaun
for x in range(B): k[0][x] = k[H - 1][x] = ZAUN
for y in range(H): k[y][0] = k[y][B - 1] = ZAUN

zaehl = collections.Counter(v for zeile in k for v in zeile)
benannt = [g for g in gebaeude if g.get("name") or g.get("amenity") or g.get("shop")]
erg = {"quelle": "© OpenStreetMap-Mitwirkende (ODbL 1.0)" + ("; Gebäudeumrisse: © Bayerische Vermessungsverwaltung, Hausumringe (CC BY 4.0)" if HAUSUMRINGE else ""),
       "bbox": [sued, west, nord, ost], "meterProKachel": mpk, "breite": B, "hoehe": H,
       "kacheln": "".join("0123456789"[v] for zeile in k for v in zeile), "gebaeude": gebaeude,
       "strassen": strassen, "flaechen": flaechen,
       "zaunart": "".join("".join(r) for r in zaunart), "garten": "".join("".join(r) for r in gartenzeichen),
       "objekte": objekte, "zaeune": zaeune}
if HAUSUMRINGE and ausgabe.exists():
    # Felder, die spätere Werkzeuge ergänzt haben (Luftbild-Klassen, Autos/Bäume/Pools aus dem Luftbild, Nebengebäude), bleiben erhalten;
    # Dachfarben je Gebäude und Nebengebäude müssen danach neu berechnet werden (tools/luftbild.py-Dächer, tools/nebengebaeude.py)
    for key, wert in json.loads(ausgabe.read_text()).items(): erg.setdefault(key, wert)
ausgabe.write_text(json.dumps(erg, ensure_ascii=False))
print(f"{B}×{H} Kacheln ({mpk} m), Gebäude {len(gebaeude)} (mit Tür {sum(1 for g in gebaeude if g['tuer'])}), benannt {len(benannt)}")
print("Kacheln:", {n: zaehl[v] for n, v in [("Wiese", WIESE), ("Straße", STRASSE), ("Wand", WAND), ("Boden", BODEN), ("Tür", TUER), ("Wasser", WASSER), ("Baum", BAUM), ("Platz", PLATZ)]})
print(f"Vektor: {len(strassen)} Straßen, {len(flaechen)} Flächen")
print("Benannte Gebäude:", sorted({(g.get('name') or g.get('shop') or g.get('amenity')) for g in benannt})[:40])

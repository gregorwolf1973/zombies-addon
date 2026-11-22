#!/usr/bin/env python3
"""Kulisse „Echt“: amtliche Luftbilder und 3D-Gebäudemodelle als Darstellung einer Karte (reine Optik, die Spielwelt bleibt gleich).
Quellen (Bayerische Vermessungsverwaltung, CC BY 4.0, https://geodaten.bayern.de/opengeodata/):
  DOP   Digitales Orthophoto, WMTS by_dop, Zoom 19 (~0,2 m/Pixel)
  LoD2  3D-Gebäudemodell, CityGML-Kacheln 2×2 km (UTM32)
Aufruf: python3 tools/kulisse.py <karte> [foto|daecher|alle]      (z. B. geretsried2 alle)
Ergebnis in zombies/client/karten/kulisse/<karte>/:
  <kx>_<ky>.webp + index.json   Luftbild-Bodenkacheln: 128 m × 128 m = 512 px (0,25 m/px), Kachel (kx, ky) beginnt bei Spielkachel (kx*32, ky*32)
                                lagegenau im Raster der Karte (Projektion wie tools/osm_karte.py), leicht entsättigt/abgedunkelt (eingebacken),
                                Autos auf Fahrbahnen/Parkplätzen per Median abgeschwächt (das Spiel zeichnet eigene Autos)
  daecher.json                  Dachflächen der LoD2-Gebäude, den Gebäuden der Karte zugeordnet (Schlüssel = x,y des Gebäudes; geretsried2: amtliche Hausumringe):
                                {"g":[{"k":[x,y],"h":Firsthöhe dm,"t":Traufhöhe dm,"f":[{"p":[x,y,…],"n":Neigung°,"a":Richtung°,"e":Höhe der tiefsten Ecke dm}]}]}
                                x, y in Spielpixeln (32 je Kachel, 8 je Meter), ganzzahlig
Rohdaten (Foto-Kacheln, GML) liegen unter tools/luftbild/cache/ (nicht im Repo). Höflich: sequenziell, Pausen, eigener User-Agent."""
import gzip, io, json, math, os, pathlib, sys, time, urllib.request
import xml.etree.ElementTree as ET
sys.path.insert(0, os.path.expanduser("~/code/ahnen-werkzeuge/pil"))
from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageEnhance

WURZEL = pathlib.Path(__file__).resolve().parent.parent
KARTEN = WURZEL / "zombies" / "client" / "karten"
CACHE = pathlib.Path(__file__).resolve().parent / "luftbild" / "cache"
UA = "zombies-spielkarte-kulisse/1.0 (Hobby-Spiel, Luftbild und Gebaeudemodell als Darstellung)"
ZOOM = 19
DOP = "https://wmtsod1.bayernwolke.de/wmts/by_dop/smerc/{z}/{x}/{y}"
LOD2 = "https://download1.bayernwolke.de/a/lod2/citygml/{n}.gml"
QUELLE = "© Bayerische Vermessungsverwaltung, Digitales Orthophoto und 3D-Gebäudemodell LoD2 (CC BY 4.0)"
KACHEL_KK = 32          # Spielkacheln je Bildkachel (128 m)
PX = 512                # Pixel je Bildkachel
PPK = PX / KACHEL_KK    # Pixel je Spielkachel (16)
SAETTIGUNG, HELLIGKEIT = 0.85, 0.88
QUALITAET = 68
RAND = 16               # Rand beim Rechnen (Median), wird abgeschnitten
SP = 32                 # Spielpixel je Kachel
# Autos im Luftbild erkennen (--autos): belegte Stellplätze (kulisse_plaetze.mjs) → autosLuftbild in der Karten-JSON, Foto-Autos dort abgeschwächt.
# Aus, solange die Erkennung ungenau ist (Stellplätze des Spiels liegen nicht genau auf den echten Plätzen): dann werden Autos auf Parkplätzen und
# Fahrbahnen im Foto verwischt (Median) und das Spiel zeichnet die eigenen Autos.
AUTOS_ERKENNEN = '--autos' in sys.argv

def utm32(lat, lon):
    a = 6378137.0; f = 1 / 298.257222101; k0 = 0.9996; e2 = f * (2 - f); ep2 = e2 / (1 - e2)
    phi = math.radians(lat); lam = math.radians(lon - 9)
    N = a / math.sqrt(1 - e2 * math.sin(phi) ** 2); T = math.tan(phi) ** 2; C = ep2 * math.cos(phi) ** 2; A = lam * math.cos(phi)
    e4 = e2 * e2; e6 = e4 * e2
    M = a * ((1 - e2 / 4 - 3 * e4 / 64 - 5 * e6 / 256) * phi - (3 * e2 / 8 + 3 * e4 / 32 + 45 * e6 / 1024) * math.sin(2 * phi)
             + (15 * e4 / 256 + 45 * e6 / 1024) * math.sin(4 * phi) - (35 * e6 / 3072) * math.sin(6 * phi))
    x = k0 * N * (A + (1 - T + C) * A ** 3 / 6 + (5 - 18 * T + T * T + 72 * C - 58 * ep2) * A ** 5 / 120) + 500000
    y = k0 * (M + N * math.tan(phi) * (A * A / 2 + (5 - T + 9 * C + 4 * C * C) * A ** 4 / 24 + (61 - 58 * T + T * T + 600 * C - 330 * ep2) * A ** 6 / 720))
    return x, y

class Karte:
    def __init__(self, k):
        self.sued, self.west, self.nord, self.ost = k["bbox"]; self.mpk = k["meterProKachel"]
        self.mlat = (self.sued + self.nord) / 2
    def lon(self, tx): return self.west + tx * self.mpk / (111320 * math.cos(math.radians(self.mlat)))
    def lat(self, ty): return self.nord - ty * self.mpk / 110540
    def merc(self, tx, ty, z=ZOOM):
        n = 2 ** z * 256; lat, lon = self.lat(ty), self.lon(tx)
        return (lon + 180) / 360 * n, (1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n
    def utm(self, tx, ty): return utm32(self.lat(ty), self.lon(tx))
    def utm_zu_kachel(self, x0, y0, x1, y1):
        """affine Umkehrung UTM -> Kachel aus drei Stützpunkten (über wenige km praktisch exakt)"""
        u = [self.utm(*q) for q in [(x0, y0), (x1, y0), (x0, y1)]]
        (e0, n0), (e1, n1), (e2, n2) = u
        det = (e1 - e0) * (n2 - n0) - (e2 - e0) * (n1 - n0)
        def lose(v0, v1, v2):
            a = ((v1 - v0) * (n2 - n0) - (v2 - v0) * (n1 - n0)) / det
            b = ((e1 - e0) * (v2 - v0) - (e2 - e0) * (v1 - v0)) / det
            return a, b, v0 - a * e0 - b * n0
        ax, bx, cx = lose(x0, x1, x0); ay, by, cy = lose(y0, y0, y1)
        return lambda E, N: (ax * E + bx * N + cx, ay * E + by * N + cy)

def laden(url, pfad, pause=0.2):
    if pfad.exists() and pfad.stat().st_size > 0: return pfad.read_bytes()
    d = None
    for versuch in range(4):
        try:
            d = urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=120).read(); break
        except Exception as e:
            print("  Wiederholung", url, e, file=sys.stderr, flush=True); time.sleep(3 + 4 * versuch)
    if d is None: raise SystemExit("nicht ladbar: " + url)
    pfad.parent.mkdir(parents=True, exist_ok=True); pfad.write_bytes(d); time.sleep(pause)
    return d

# ---------- Luftbild ----------
def mosaik(K, breite, hoehe):
    ecken = [K.merc(x, y) for x in (0, breite) for y in (0, hoehe)]
    tx0, tx1 = int(min(e[0] for e in ecken) // 256), int(max(e[0] for e in ecken) // 256)
    ty0, ty1 = int(min(e[1] for e in ecken) // 256), int(max(e[1] for e in ecken) // 256)
    gesamt = (tx1 - tx0 + 1) * (ty1 - ty0 + 1); print(f"Luftbild: {gesamt} Kacheln Zoom {ZOOM}", flush=True)
    mos = Image.new("RGB", ((tx1 - tx0 + 1) * 256, (ty1 - ty0 + 1) * 256)); n = 0
    for ty in range(ty0, ty1 + 1):
        for tx in range(tx0, tx1 + 1):
            d = laden(DOP.format(z=ZOOM, x=tx, y=ty), CACHE / "by" / str(ZOOM) / str(tx) / f"{ty}.jpg")
            mos.paste(Image.open(io.BytesIO(d)).convert("RGB"), ((tx - tx0) * 256, (ty - ty0) * 256)); n += 1
            if n % 100 == 0: print(f"  {n}/{gesamt}", flush=True)
    return mos, tx0, ty0

ART_BREITE = {"primary": 7.5, "secondary": 6.5, "tertiary": 6, "unclassified": 5, "residential": 5, "living_street": 4, "service": 3}
def fahrbahn_m(s):
    b = str(s.get("breite") or "0")
    br = float(b) if b.replace(".", "").isdigit() else 0
    if br >= 2.5: return min(10, br)
    sp = int(s.get("spuren") or 0)
    if sp: return min(4, sp) * 3
    return ART_BREITE.get(s["t"], 5)

def maske(karte, x0, y0, W, H, nur_mitte_m=1.0):
    """Fahrbahnen und Parkplätze im Ausschnitt; ein Rand bleibt unberührt, damit der Straßenrand scharf bleibt"""
    m = Image.new("L", (W, H), 0); dr = ImageDraw.Draw(m)
    pp = lambda p: [((p[i] - x0) * PPK, (p[i + 1] - y0) * PPK) for i in range(0, len(p), 2)]
    mpp = PPK / karte["meterProKachel"]
    for s in karte["strassen"]:
        if s["t"] not in ART_BREITE: continue
        pts = pp(s["p"])
        if len(pts) >= 2: dr.line(pts, fill=255, width=max(1, round((fahrbahn_m(s) - 2 * nur_mitte_m) * mpp)), joint="curve")
    pk = False
    for f in karte["flaechen"]:
        if f["a"] == "parkplatz" and len(f["p"]) >= 6: dr.polygon(pp(f["p"]), fill=255); pk = True
    if pk: m = m.filter(ImageFilter.MinFilter(max(3, round(nur_mitte_m * mpp) | 1)))
    return m

def gebaeude_maske(karte, x0, y0, W, H):
    m = Image.new("L", (W, H), 0); dr = ImageDraw.Draw(m)
    for g in karte["gebaeude"]:
        u = g.get("umriss")
        if u and len(u) >= 6 and x0 - 4 < max(u[0::2]) and min(u[0::2]) < x0 + W / PPK + 4 and y0 - 4 < max(u[1::2]) and min(u[1::2]) < y0 + H / PPK + 4:
            dr.polygon([((u[i] - x0) * PPK, (u[i + 1] - y0) * PPK) for i in range(0, len(u), 2)], fill=255)
    return m

# ---------- Autos im Luftbild ----------
AUTO_FARBEN = [(198, 40, 40), (21, 101, 192), (238, 238, 238), (46, 125, 50), (66, 66, 66), (249, 168, 37), (109, 76, 65), (144, 164, 174)]   # wie AUTO_FARBEN in aussehen.mjs
def auto_farbe(rgb):
    r, g, b = rgb
    best, bi = 1e9, 0
    for i, (cr, cg, cb) in enumerate(AUTO_FARBEN):
        d = (r - cr) ** 2 + (g - cg) ** 2 + (b - cb) ** 2
        if d < best: best, bi = d, i
    return bi

def plaetze_laden(name):
    """Stellplätze der Karte (dieselben, die das Spiel zeichnet: Parkplatz-Buchten und Straßen-Parkbuchten) per Node aus vektor.mjs"""
    import subprocess
    r = subprocess.run(["node", str(WURZEL / "tools" / "kulisse_plaetze.mjs"), name], capture_output=True, text=True, check=True)
    return json.loads(r.stdout)

def belegte_plaetze(img, plaetze, ax, ay, bauten):
    """Welche Stellplätze (Mittelpunkt im Kern des Fensters) sind im Luftbild belegt? Ein Platz ist belegt, wenn der Kern der Bucht (3,8 × 1,6 m)
    überwiegend vom Untergrund (Median 10 m ringsum) abweicht, nicht grün (Baum, Gebüsch), nicht nur ein dunklerer Schatten und kein Dach ist.
    Rückgabe: Liste (cx, cy, winkel, (r,g,b), L, B) in Fensterpixeln (0,25 m)."""
    W = img.size[0]; S = W // 2
    kl = img.resize((S, S), Image.BOX); bg = kl.filter(ImageFilter.MedianFilter(21)); bgp = bg.load(); ip = img.load()
    bm = bauten.load(); aus = []
    for p in plaetze:
        wx, wy = (p["x"] / SP - ax) * PPK, (p["y"] / SP - ay) * PPK
        if not (RAND <= wx < RAND + PX and RAND <= wy < RAND + PX): continue
        if bm[int(wx), int(wy)]: continue
        c, s = math.cos(p["winkel"]), math.sin(p["winkel"]); n = grun = abw = schatten = 0; farben = []
        for i in range(-9, 10, 2):
            for j in range(-3, 4, 2):
                u, v = i * 0.2 * 4, j * 0.2 * 4          # i, j in 0,2-m-Schritten → Pixel (4 je Meter)
                x, y = int(wx + c * u - s * v), int(wy + s * u + c * v)
                if not (0 <= x < W and 0 <= y < W): continue
                r, g, b = ip[x, y]; br, bgc, bb = bgp[min(S - 1, x // 2), min(S - 1, y // 2)]
                n += 1
                if g - r >= 8 and g - b >= 8 or (g - r >= 4 and g - b >= 25): grun += 1; continue
                if max(abs(r - br), abs(g - bgc), abs(b - bb)) >= 22:
                    lum, bl = 0.299 * r + 0.587 * g + 0.114 * b, 0.299 * br + 0.587 * bgc + 0.114 * bb
                    if lum < 0.62 * bl and max(r / (br or 1), g / (bgc or 1), b / (bb or 1)) - min(r / (br or 1), g / (bgc or 1), b / (bb or 1)) < 0.14: schatten += 1; continue
                    abw += 1; farben.append((r, g, b))
        if n < 20 or grun > 0.25 * n or schatten > 0.3 * n or abw < 0.6 * n: continue
        farben.sort(key=sum); col = farben[len(farben) // 2]
        w = p["winkel"] if -math.pi / 2 < p["winkel"] <= math.pi / 2 else (p["winkel"] - math.pi if p["winkel"] > 0 else p["winkel"] + math.pi)
        aus.append((wx, wy, w, col, 4.5, 2.0))
    return aus

def autos_abschwaechen(img, bg_gross, autos):
    """erkannte Autos im Foto leicht abschwächen (das Spiel zeichnet genau darüber ein Auto): 55 % des Untergrunds einblenden"""
    m = Image.new("L", img.size, 0); d = ImageDraw.Draw(m)
    for cx, cy, w, _, L, B in autos:
        ux, uy = math.cos(w), math.sin(w); hl, hb = (L / 2 + 0.3) * 4, (B / 2 + 0.2) * 4
        d.polygon([(cx + ux * a - uy * b, cy + uy * a + ux * b) for a, b in ((-hl, -hb), (hl, -hb), (hl, hb), (-hl, hb))], fill=140)
    return Image.composite(bg_gross, img, m.filter(ImageFilter.GaussianBlur(1.2)))

def aufbereiten(img):
    return ImageEnhance.Brightness(ImageEnhance.Color(img).enhance(SAETTIGUNG)).enhance(HELLIGKEIT)

def index_schreiben(ziel, neu):
    idx = ziel / "index.json"
    alt = json.loads(idx.read_text()) if idx.exists() else {}
    alt.update(neu); idx.write_text(json.dumps(alt, indent=1))

def foto(name, karte, K):
    B, H = karte["breite"], karte["hoehe"]
    mos, tx0, ty0 = mosaik(K, B, H)
    ziel = KARTEN / "kulisse" / name; ziel.mkdir(parents=True, exist_ok=True)
    for f in ziel.glob("*.webp"): f.unlink()
    nx, ny = math.ceil(B / KACHEL_KK), math.ceil(H / KACHEL_KK); summe = 0; gefunden = []; plaetze = plaetze_laden(name) if AUTOS_ERKENNEN else None
    for ky in range(ny):
        for kx in range(nx):
            r = RAND / PPK; ax, ay = kx * KACHEL_KK - r, ky * KACHEL_KK - r; W = PX + 2 * RAND
            (px, py), (qx, qy), (rx, ry) = K.merc(ax, ay), K.merc(ax + W / PPK, ay), K.merc(ax, ay + W / PPK)
            a, b, d, e = (qx - px) / W, (rx - px) / W, (qy - py) / W, (ry - py) / W
            img = mos.transform((W, W), Image.AFFINE, (a, b, px - tx0 * 256, d, e, py - ty0 * 256), Image.BICUBIC)
            m = maske(karte, ax, ay, W, W)
            roh = img
            autos = belegte_plaetze(roh, plaetze, ax, ay, gebaeude_maske(karte, ax, ay, W, W)) if AUTOS_ERKENNEN else []
            for cx, cy, w, col, L, B in autos:
                if True:
                    gefunden.append({"x": round((ax + cx / PPK) * SP * 64) / 64, "y": round((ay + cy / PPK) * SP * 64) / 64, "winkel": round(w, 4), "farbe": auto_farbe(col)})
            if m.getbbox():
                med = img.filter(ImageFilter.MedianFilter(15))
                img = Image.composite(med, img, m.filter(ImageFilter.GaussianBlur(2)))
            if autos: img = autos_abschwaechen(img, roh.filter(ImageFilter.MedianFilter(15)), autos)
            img = aufbereiten(img).crop((RAND, RAND, RAND + PX, RAND + PX))
            pu = io.BytesIO(); img.save(pu, "WEBP", quality=QUALITAET, method=6)
            (ziel / f"{kx}_{ky}.webp").write_bytes(pu.getvalue()); summe += pu.tell()
        print(f"Reihe {ky + 1}/{ny}, bisher {summe // 1024} KB", flush=True)
    index_schreiben(ziel, {"kachel": KACHEL_KK, "px": PX, "nx": nx, "ny": ny, "breite": B, "hoehe": H, "meterProPixel": karte["meterProKachel"] / PPK,
                           "quelle": QUELLE, "format": "webp", "foto": True})
    print(f"Luftbild: {nx * ny} Bildkacheln, {summe / 1e6:.2f} MB, {len(gefunden)} Autos erkannt")
    if AUTOS_ERKENNEN: autos_in_karte(name, gefunden)

def autos_in_karte(name, autos):
    """erkannte Autos als Feld autosLuftbild in die Karten-JSON schreiben (Doppelte innerhalb 1,5 m entfernen)"""
    pfad = KARTEN / f"{name}.json"; text = pfad.read_text(); k = json.loads(text)
    fest = []
    for a in sorted(autos, key=lambda a: (a["y"], a["x"])):
        if any(abs(b["x"] - a["x"]) < 12 and abs(b["y"] - a["y"]) < 12 for b in fest[-400:]): continue
        fest.append(a)
    k["autosLuftbild"] = fest
    stil = dict(ensure_ascii=False)
    if json.dumps(json.loads(text), **stil) != text.strip(): print("Hinweis: Karten-JSON wird neu formatiert", file=sys.stderr)
    pfad.write_text(json.dumps(k, **stil))
    print(f"autosLuftbild: {len(fest)} Autos in {name}.json")

# ---------- LoD2 ----------
NS = {"b": "http://www.opengis.net/citygml/building/1.0", "g": "http://www.opengis.net/gml", "n": "http://www.opengis.net/citygml/generics/1.0"}
def lod2_kacheln(K, B, H):
    ecken = [K.utm(x, y) for x in (0, B) for y in (0, H)]
    namen = set()
    for E in (min(e[0] for e in ecken) - 20, max(e[0] for e in ecken) + 20):
        for N in (min(e[1] for e in ecken) - 20, max(e[1] for e in ecken) + 20):
            namen.add(f"{int(E // 2000) * 2}_{int(N // 2000) * 2}")
    return sorted(namen)

def im_polygon(px, py, pts):
    r = False; n = len(pts) // 2; j = n - 1
    for i in range(n):
        xi, yi, xj, yj = pts[2 * i], pts[2 * i + 1], pts[2 * j], pts[2 * j + 1]
        if (yi > py) != (yj > py) and px < (xj - xi) * (py - yi) / (yj - yi) + xi: r = not r
        j = i
    return r

def daecher(name, karte, K):
    B, H = karte["breite"], karte["hoehe"]; zu = K.utm_zu_kachel(0, 0, B, H); roh = []
    for n in lod2_kacheln(K, B, H):
        pfad = CACHE / "lod2" / f"{n}.gml"
        print("LoD2-Kachel", n, "(vorhanden)" if pfad.exists() else "(lade)", flush=True)
        laden(LOD2.format(n=n), pfad)
        for ev, el in ET.iterparse(pfad, events=("end",)):
            if not el.tag.endswith("}Building"): continue
            at = {a.get("name"): a.findtext("n:value", namespaces=NS) for a in el.findall("n:stringAttribute", NS)}
            grund = float(at.get("HoeheGrund") or 0); fl = []; sx = sy = cnt = 0; ok = False
            for rs in el.iter("{%s}RoofSurface" % NS["b"]):
                sa = {a.get("name"): a.findtext("n:value", namespaces=NS) for a in rs.findall("n:stringAttribute", NS)}
                neig, ori = float(sa.get("Dachneigung") or 0), float(sa.get("Dachorientierung") or -1)
                for pl in rs.iter("{%s}Polygon" % NS["g"]):
                    ex = pl.find("g:exterior//g:posList", NS)
                    if ex is None: continue
                    v = [float(t) for t in ex.text.split()]; xy = []; zs = []
                    for i in range(0, len(v) - 2, 3):
                        tx, ty = zu(v[i], v[i + 1]); xy += [tx * SP, ty * SP]; zs.append(v[i + 2] - grund)
                    xy, zs = xy[:-2], zs[:-1]     # letzter Punkt = erster
                    if len(zs) < 3: continue
                    fl.append({"p": [round(c) for c in xy], "n": round(neig), "a": round(ori), "e": round(min(zs) * 10)})
                    sx += sum(xy[0::2]); sy += sum(xy[1::2]); cnt += len(zs)
                    ok = ok or (-2 < xy[0] / SP < B + 2 and -2 < xy[1] / SP < H + 2)
            el.clear()
            if fl and ok:
                tr = float(at.get("HoeheTraufe") or at.get("HoeheDach") or 0)
                roh.append({"c": (sx / cnt, sy / cnt), "h": round((float(at.get("HoeheDach") or 0) - grund) * 10), "t": round((tr - grund) * 10), "f": fl})
    print(f"LoD2: {len(roh)} Gebäude in der Karte", flush=True)
    # den Gebäuden der Karte zuordnen. Umringe der Karte (Hausumringe, tools/hausumringe.py) und LoD2 stammen aus derselben amtlichen Quelle:
    # Schwerpunkt der Dachflächen im Umriss trifft fast immer. Sonst: die meisten Dachflächen-Schwerpunkte im selben Umriss (L-Formen).
    # Kein Abstandsverfahren mehr: LoD2-Gebäude ohne Umriss in der Karte (Garagen, Schuppen) sind Nebengebäude (tools/nebengebaeude.py)
    # und dürfen ihr Dach nicht einem Nachbarhaus geben. (Karten mit OSM-Umrissen: Schwerpunkt-Abstand bis 1,5 Kacheln als Rückfall, --osm.)
    OSM_RUECKFALL = "--osm" in sys.argv
    geb = [(g["x"], g["y"], g["umriss"]) for g in karte["gebaeude"] if g.get("umriss")]
    rost = {}
    for i, (x, y, u) in enumerate(geb):
        xs, ys = u[0::2], u[1::2]
        for gx in range(int(min(xs)) // 8 - 1, int(max(xs)) // 8 + 2):
            for gy in range(int(min(ys)) // 8 - 1, int(max(ys)) // 8 + 2): rost.setdefault((gx, gy), []).append(i)
    erg = []; belegt = set(); stat = {"schwerpunkt": 0, "flaechen": 0, "rueckfall": 0, "ohne": 0}
    for b in roh:
        cx, cy = b["c"][0] / SP, b["c"][1] / SP; treffer = None; art = None
        for i in rost.get((int(cx) // 8, int(cy) // 8), []):
            if im_polygon(cx, cy, geb[i][2]): treffer, art = i, "schwerpunkt"; break
        if treffer is None:
            zaehl = {}
            for f in b["f"]:
                fx, fy = sum(f["p"][0::2]) / (len(f["p"]) // 2) / SP, sum(f["p"][1::2]) / (len(f["p"]) // 2) / SP
                for i in rost.get((int(fx) // 8, int(fy) // 8), []):
                    if im_polygon(fx, fy, geb[i][2]): zaehl[i] = zaehl.get(i, 0) + 1; break
            if zaehl:
                i, n = max(zaehl.items(), key=lambda kv: kv[1])
                if n * 2 >= len(b["f"]): treffer, art = i, "flaechen"
        if treffer is None and OSM_RUECKFALL:
            best = 1.5
            for i in rost.get((int(cx) // 8, int(cy) // 8), []):
                u = geb[i][2]; mx, my = sum(u[0::2]) / (len(u) // 2), sum(u[1::2]) / (len(u) // 2)
                d = math.hypot(mx - cx, my - cy)
                if d < best: best, treffer, art = d, i, "rueckfall"
        if treffer is None:
            stat["ohne"] += 1
            if sum(abs(sum(f["p"][2 * j] * f["p"][(2 * j + 3) % len(f["p"])] - f["p"][(2 * j + 2) % len(f["p"])] * f["p"][2 * j + 1] for j in range(len(f["p"]) // 2))) / 2 for f in b["f"]) / 64 > 100:
                stat["ohne_gross"] = stat.get("ohne_gross", 0) + 1   # Dachfläche über 100 m² ohne Umriss in der Karte: sollte es nicht geben
            continue
        stat[art] += 1; belegt.add(treffer)
        erg.append({"k": [geb[treffer][0], geb[treffer][1]], "h": b["h"], "t": b["t"], "f": b["f"]})
    print("Zuordnung:", stat, f"(Schwerpunkt im Umriss: {stat['schwerpunkt'] / max(1, len(roh)) * 100:.1f} %, mit Rückfällen {(len(roh) - stat['ohne']) / max(1, len(roh)) * 100:.1f} % von {len(roh)} LoD2-Gebäuden)")
    ziel = KARTEN / "kulisse" / name; ziel.mkdir(parents=True, exist_ok=True)
    (ziel / "daecher.json").write_text(json.dumps({"einheit": "Spielpixel (32 je Kachel); h, t, e in Dezimetern; n, a in Grad", "g": erg}, separators=(",", ":")))
    index_schreiben(ziel, {"quelle": QUELLE, "daecher": True})
    d = (ziel / "daecher.json").read_bytes()
    print(f"daecher.json: {len(erg)} Gebäude, {sum(len(g['f']) for g in erg)} Dachflächen, {len(d) // 1024} KB roh, {len(gzip.compress(d)) // 1024} KB gzip; "
          f"Häuser mit Dach: {len(belegt)} von {len(geb)}")

def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    name = args[0]; was = args[1] if len(args) > 1 else "alle"
    karte = json.loads((KARTEN / f"{name}.json").read_text()); K = Karte(karte)
    if was in ("foto", "alle"): foto(name, karte, K)
    if was in ("daecher", "alle"): daecher(name, karte, K)

if __name__ == "__main__":
    main()

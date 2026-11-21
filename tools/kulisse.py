#!/usr/bin/env python3
"""PROTOTYP „Kulisse“: echtes Orthofoto als Bodentextur + echte Dachflächen aus dem 3D-Gebäudemodell LoD2 Bayern.
Quellen (beide Bayerische Vermessungsverwaltung, CC BY 4.0, https://geodaten.bayern.de/opengeodata/):
  DOP   WMTS by_dop / smerc, Zoom 19 (~0,2 m/Pixel; Zoom 20 gibt es nicht)
  LoD2  CityGML-Kacheln 2×2 km (UTM32), je Dachteilfläche Neigung (Dachneigung) und Neigungsrichtung (Dachorientierung)
Aufruf: python3 tools/kulisse.py <karte> <x0,y0,x1,y1 in Spielkacheln> [Pixel je Kachel, Standard 32]
Ergebnis (zombies/client/karten/):
  <karte>_ortho.webp   Foto im Raster der Karte (wie tools/luftbild.py: lineare lat/lon-Projektion um die Gebietsmitte)
                       Autos auf Fahrbahnen/Parkplätzen sind per Median abgeschwächt (das Spiel zeichnet eigene Autos)
  <karte>_ortho.json   {x0,y0,x1,y1,ppt}  Lage des Ausschnitts
  <karte>_lod2.json    Gebäude mit Dachflächen: {f:[{p:[x,y,z,…],n:Neigung°,a:Richtung°}], g:Grundhöhe, h:Höhe}; x,y in Kacheln, z in Metern über Grund
Rohdaten (Kacheln, GML) liegen unter tools/luftbild/cache/ (nicht im Repo). Höflich: sequenziell, Pausen, eigener User-Agent."""
import io, json, math, os, pathlib, sys, time, urllib.request
import xml.etree.ElementTree as ET
sys.path.insert(0, os.path.expanduser("~/code/ahnen-werkzeuge/pil"))
from PIL import Image, ImageDraw, ImageFilter

WURZEL = pathlib.Path(__file__).resolve().parent.parent
KARTEN = WURZEL / "zombies" / "client" / "karten"
CACHE = pathlib.Path(__file__).resolve().parent / "luftbild" / "cache"
UA = "zombies-kulisse-proto/0.1 (Hobby-Spielkarten, Prototyp)"
ZOOM = 19
DOP = "https://wmtsod1.bayernwolke.de/wmts/by_dop/smerc/{z}/{x}/{y}"
LOD2 = "https://download1.bayernwolke.de/a/lod2/citygml/{n}.gml"

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
    """Umrechnung Spielkachel <-> lat/lon <-> WebMercator <-> UTM32 (Kachel-Projektion wie tools/osm_karte.py)."""
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
        """affine Umkehrung UTM -> Kachel, aus drei Stützpunkten des Ausschnitts (über wenige km praktisch exakt)"""
        p = [(x0, y0), (x1, y0), (x0, y1)]; u = [self.utm(*q) for q in p]
        # tx = a*E + b*N + c ; ty = d*E + e*N + f
        (e0, n0), (e1, n1), (e2, n2) = u
        det = (e1 - e0) * (n2 - n0) - (e2 - e0) * (n1 - n0)
        def lose(v0, v1, v2):
            a = ((v1 - v0) * (n2 - n0) - (v2 - v0) * (n1 - n0)) / det
            b = ((e1 - e0) * (v2 - v0) - (e2 - e0) * (v1 - v0)) / det
            return a, b, v0 - a * e0 - b * n0
        ax, bx, cx = lose(x0, x1, x0); ay, by, cy = lose(y0, y0, y1)
        return lambda E, N: (ax * E + bx * N + cx, ay * E + by * N + cy)

def laden(url, pfad, pause=0.15):
    if pfad.exists() and pfad.stat().st_size > 0: return pfad.read_bytes()
    for versuch in range(4):
        try:
            d = urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=120).read(); break
        except Exception as e:
            print("  Wiederholung", url, e, file=sys.stderr); time.sleep(2 + 3 * versuch); d = None
    if d is None: raise SystemExit("nicht ladbar: " + url)
    pfad.parent.mkdir(parents=True, exist_ok=True); pfad.write_bytes(d); time.sleep(pause)
    return d

# ---------- Orthofoto ----------
def orthofoto(K, r, ppt):
    x0, y0, x1, y1 = r
    ecken = [K.merc(x, y) for x in (x0, x1) for y in (y0, y1)]
    tx0, tx1 = int(min(e[0] for e in ecken) // 256), int(max(e[0] for e in ecken) // 256)
    ty0, ty1 = int(min(e[1] for e in ecken) // 256), int(max(e[1] for e in ecken) // 256)
    print(f"Orthofoto: {(tx1 - tx0 + 1) * (ty1 - ty0 + 1)} Kacheln Zoom {ZOOM}", flush=True)
    mos = Image.new("RGB", ((tx1 - tx0 + 1) * 256, (ty1 - ty0 + 1) * 256))
    for ty in range(ty0, ty1 + 1):
        for tx in range(tx0, tx1 + 1):
            d = laden(DOP.format(z=ZOOM, x=tx, y=ty), CACHE / "by" / str(ZOOM) / str(tx) / f"{ty}.jpg")
            mos.paste(Image.open(io.BytesIO(d)).convert("RGB"), ((tx - tx0) * 256, (ty - ty0) * 256))
    W, H = round((x1 - x0) * ppt), round((y1 - y0) * ppt)
    (ax, ay), (bx, by), (cx, cy) = K.merc(x0, y0), K.merc(x1, y0), K.merc(x0, y1)
    a, b, d, e = (bx - ax) / W, (cx - ax) / H, (by - ay) / W, (cy - ay) / H
    return mos.transform((W, H), Image.AFFINE, (a, b, ax - tx0 * 256, d, e, ay - ty0 * 256), Image.BICUBIC)

ART_BREITE = {"primary": 7.5, "secondary": 6.5, "tertiary": 6, "unclassified": 5, "residential": 5, "living_street": 4, "service": 3}
def fahrbahn_m(s):
    br = float(s.get("breite") or 0) if str(s.get("breite") or "0").replace(".", "").isdigit() else 0
    if br >= 2.5: return min(10, br)
    sp = int(s.get("spuren") or 0)
    if sp: return min(4, sp) * 3
    return ART_BREITE.get(s["t"], 5)

def autos_abschwaechen(foto, karte, r, ppt, fenster=15, nur_mitte_m=1.0):
    """Fahrbahnen und Parkplätze (aus der Vektorkarte) mit Median glätten: Autos, Fahrbahnmarkierungen verschwinden;
    Rand von nur_mitte_m Metern bleibt unberührt, damit der Straßenrand scharf bleibt."""
    x0, y0, x1, y1 = r; W, H = foto.size
    m = Image.new("L", (W, H), 0); dr = ImageDraw.Draw(m)
    pp = lambda p: [((p[i] - x0) * ppt, (p[i + 1] - y0) * ppt) for i in range(0, len(p), 2)]
    mpp = ppt / karte["meterProKachel"]   # Pixel je Meter
    for s in karte["strassen"]:
        if s["t"] not in ART_BREITE: continue
        w = max(1, (fahrbahn_m(s) - 2 * nur_mitte_m) * mpp)
        pts = pp(s["p"])
        if len(pts) >= 2: dr.line(pts, fill=255, width=round(w), joint="curve")
    for f in karte["flaechen"]:
        if f["a"] == "parkplatz" and len(f["p"]) >= 6: dr.polygon(pp(f["p"]), fill=255)
    if any(f["a"] == "parkplatz" for f in karte["flaechen"]):
        m = m.filter(ImageFilter.MinFilter(max(3, round(nur_mitte_m * mpp) | 1)))
    # Median auf grober Auflösung (0,25 m/px): 15 px = 3,75 m, breiter als ein Auto
    klein = foto.resize((round((x1 - x0) * 16), round((y1 - y0) * 16)), Image.LANCZOS)
    med = klein.filter(ImageFilter.MedianFilter(fenster)).resize((W, H), Image.BICUBIC)
    return Image.composite(med, foto, m.filter(ImageFilter.GaussianBlur(2))), m

# ---------- LoD2 ----------
NS = {"b": "http://www.opengis.net/citygml/building/1.0", "g": "http://www.opengis.net/gml", "n": "http://www.opengis.net/citygml/generics/1.0"}
def lod2_kacheln(K, r):
    ecken = [K.utm(x, y) for x in (r[0], r[2]) for y in (r[1], r[3])]
    namen = set()
    for E in (min(e[0] for e in ecken) - 20, max(e[0] for e in ecken) + 20):
        for N in (min(e[1] for e in ecken) - 20, max(e[1] for e in ecken) + 20):
            namen.add(f"{int(E // 2000) * 2}_{int(N // 2000) * 2}")
    return sorted(namen)

def lod2_lesen(K, r, rand=6):
    x0, y0, x1, y1 = r; zu = K.utm_zu_kachel(*r); erg = []
    for name in lod2_kacheln(K, r):
        pfad = CACHE / "lod2" / f"{name}.gml"
        print("LoD2-Kachel", name, "(" + ("vorhanden" if pfad.exists() else "lade") + ")", flush=True)
        laden(LOD2.format(n=name), pfad)
        for ev, el in ET.iterparse(pfad, events=("end",)):
            if not el.tag.endswith("}Building"): continue
            at = {a.get("name"): a.findtext("n:value", namespaces=NS) for a in el.findall("n:stringAttribute", NS)}
            grund = float(at.get("HoeheGrund") or 0); fl = []; mx = [1e9, 1e9, -1e9, -1e9]
            for rs in el.iter("{%s}RoofSurface" % NS["b"]):
                sa = {a.get("name"): a.findtext("n:value", namespaces=NS) for a in rs.findall("n:stringAttribute", NS)}
                neig, ori = float(sa.get("Dachneigung") or 0), float(sa.get("Dachorientierung") or -1)
                for pl in rs.iter("{%s}Polygon" % NS["g"]):
                    ex = pl.find("g:exterior//g:posList", NS)
                    if ex is None: continue
                    v = [float(t) for t in ex.text.split()]; pts = []
                    for i in range(0, len(v) - 2, 3):
                        tx, ty = zu(v[i], v[i + 1]); pts += [round(tx, 2), round(ty, 2), round(v[i + 2] - grund, 2)]
                        mx = [min(mx[0], tx), min(mx[1], ty), max(mx[2], tx), max(mx[3], ty)]
                    if len(pts) >= 12: fl.append({"p": pts[:-3], "n": round(neig, 1), "a": round(ori, 1)})   # letzter Punkt = erster
            el.clear()
            if fl and mx[2] >= x0 - rand and mx[0] <= x1 + rand and mx[3] >= y0 - rand and mx[1] <= y1 + rand:
                erg.append({"f": fl, "g": round(grund, 2), "h": round(float(at.get("HoeheDach") or 0) - grund, 2)})
    return erg

def main():
    name = sys.argv[1]; r = [float(v) for v in sys.argv[2].split(",")]; ppt = float(sys.argv[3]) if len(sys.argv) > 3 else 32
    karte = json.loads((KARTEN / f"{name}.json").read_text()); K = Karte(karte)
    foto = orthofoto(K, r, ppt)
    foto.save(CACHE / f"{name}_ortho_roh.png")
    gl, maske = autos_abschwaechen(foto, karte, r, ppt)
    for q in (80,):
        pu = io.BytesIO(); gl.save(pu, "WEBP", quality=q, method=6)
        (KARTEN / f"{name}_ortho.webp").write_bytes(pu.getvalue())
        print(f"ortho {foto.size} q{q}: {pu.tell() // 1024} KB")
    (KARTEN / f"{name}_ortho.json").write_text(json.dumps({"x0": r[0], "y0": r[1], "x1": r[2], "y1": r[3], "ppt": ppt}))
    foto.save(CACHE / f"{name}_ortho_ohnefilter.png"); maske.save(CACHE / f"{name}_ortho_maske.png")
    geb = lod2_lesen(K, r)
    (KARTEN / f"{name}_lod2.json").write_text(json.dumps({"gebaeude": geb}, separators=(",", ":")))
    print(f"LoD2: {len(geb)} Gebäude, {sum(len(g['f']) for g in geb)} Dachflächen, {(KARTEN / f'{name}_lod2.json').stat().st_size // 1024} KB")

if __name__ == "__main__":
    main()

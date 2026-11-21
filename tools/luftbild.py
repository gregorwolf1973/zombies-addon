#!/usr/bin/env python3
"""Luftbild-Auswertung für die Spielkarten (Paket H „Kulisse nach echten Luftbildern“).
Quellen (frei, nur diese):
  Bayern:  DOP, © Bayerische Vermessungsverwaltung (CC BY 4.0), WMTS by_dop / smerc (WebMercator), Zoom 18 (~0,4 m/Pixel)
  Schweiz: swisstopo SWISSIMAGE (OGD, Quellenangabe „© swisstopo“), WMTS ch.swisstopo.swissimage / 3857, Zoom 18
Aufruf: python3 tools/luftbild.py [karte …]   (ohne Angabe: alle sechs Karten)
Kacheln werden höflich (sequenziell, Pause) geladen und unter tools/luftbild/cache/ zwischengespeichert (nicht im Repo).
Ergebnis je Karte (zombies/client/karten/<karte>.json):
  "luftbild"        eine Ziffer je Kachel, Zeile für Zeile wie "kacheln": 0 unsicher/Schatten, 1 Baum, 2 Wiese, 3 Acker, 4 befestigt, 5 Wasser
  "luftbildQuelle"  Quellenangabe
  "luftbildVersatz" [dx, dy] in Metern: so weit wurde das Luftbild verschoben, damit es zu den OSM-Umrissen passt (nur wenn > 1,5 m; Messung siehe Ausgabe)
  je Gebäude: "dach" (#rrggbb, Median der Dachpixel), "first" (Grad 0–179, y nach unten), "dachart" (sattel|walm|flach),
              "dachhell" (1/-1: welche Seite quer zum First heller ist)
und das verkleinerte Bild <karte>_luftbild.webp (2 px je Kachel, Navi-Hintergrund der Eckkarte).
Die Kachel-Umrechnung ist dieselbe wie in tools/osm_karte.py (lineare lat/lon-Projektion um die Gebietsmitte)."""
import io, json, math, os, pathlib, statistics, sys, time, urllib.request
sys.path.insert(0, os.path.expanduser("~/code/ahnen-werkzeuge/pil"))   # PIL liegt bei Gregor dort
from PIL import Image, ImageChops, ImageDraw, ImageFilter

WURZEL = pathlib.Path(__file__).resolve().parent.parent
KARTEN = WURZEL / "zombies" / "client" / "karten"
CACHE = pathlib.Path(__file__).resolve().parent / "luftbild" / "cache"
UA = "zombies-luftbild/0.1 (Hobby-Spielkarten, Luftbild-Klassifikation)"
ZOOM = 18
S = 8   # Pixel je Spielkachel beim Auswerten (4 m / 8 = 0,5 m)
QUELLEN = {
    "bayern": ("by", "https://wmtsod1.bayernwolke.de/wmts/by_dop/smerc/{z}/{x}/{y}", "jpg",
               "Luftbild © Bayerische Vermessungsverwaltung (CC BY 4.0)"),
    "schweiz": ("ch", "https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.swissimage/default/current/3857/{z}/{x}/{y}.jpeg", "jpeg",
                "Luftbild © swisstopo (SWISSIMAGE, OGD)"),
}
KARTEN_QUELLE = {"andermatt": "schweiz"}   # alle anderen: bayern
NAMEN = ["unsicher", "baum", "wiese", "acker", "befestigt", "wasser"]
FARBEN = [(40, 40, 40), (20, 90, 30), (150, 210, 90), (200, 170, 90), (170, 170, 170), (40, 90, 200)]

def merc(lat, lon):
    n = 2 ** ZOOM * 256
    return (lon + 180) / 360 * n, (1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n

def kachel_holen(q, x, y):
    ordner, vorlage, endung, _ = QUELLEN[q]
    pfad = CACHE / ordner / str(ZOOM) / str(x) / f"{y}.{endung}"
    if pfad.exists() and pfad.stat().st_size > 0:
        return Image.open(pfad).convert("RGB")
    daten = None
    for versuch in range(4):
        try:
            req = urllib.request.Request(vorlage.format(z=ZOOM, x=x, y=y), headers={"User-Agent": UA})
            daten = urllib.request.urlopen(req, timeout=30).read(); break
        except Exception as e:
            print("  Wiederholung", x, y, e, file=sys.stderr); time.sleep(2 + 3 * versuch)
    if daten is None: raise SystemExit(f"Kachel {x}/{y} nicht ladbar")
    pfad.parent.mkdir(parents=True, exist_ok=True); pfad.write_bytes(daten)
    time.sleep(0.12)
    return Image.open(io.BytesIO(daten)).convert("RGB")

class Gebiet:
    """Umrechnung Spielkachel ↔ WebMercator-Pixel (wie osm_karte.py) und Mosaik der Luftbildkacheln."""
    def __init__(self, name, karte):
        self.q = KARTEN_QUELLE.get(name, "bayern")
        self.sued, self.west, self.nord, self.ost = karte["bbox"]; self.mpk = karte["meterProKachel"]
        self.B, self.H = karte["breite"], karte["hoehe"]
        mlat = (self.sued + self.nord) / 2
        self.lon_von = lambda tx: self.west + tx * self.mpk / (111320 * math.cos(math.radians(mlat)))
        self.lat_von = lambda ty: self.nord - ty * self.mpk / 110540
        ecken = [self.px(0, 0), self.px(self.B, 0), self.px(0, self.H), self.px(self.B, self.H)]
        self.x0, x1 = int(min(e[0] for e in ecken) // 256), int(max(e[0] for e in ecken) // 256)
        self.y0, y1 = int(min(e[1] for e in ecken) // 256), int(max(e[1] for e in ecken) // 256)
        print(f"{name}: {(x1 - self.x0 + 1) * (y1 - self.y0 + 1)} Kacheln ({self.q})", flush=True)
        self.mosaik = Image.new("RGB", ((x1 - self.x0 + 1) * 256, (y1 - self.y0 + 1) * 256))
        for ty in range(self.y0, y1 + 1):
            for tx in range(self.x0, x1 + 1):
                self.mosaik.paste(kachel_holen(self.q, tx, ty), ((tx - self.x0) * 256, (ty - self.y0) * 256))
    def px(self, tx, ty): return merc(self.lat_von(ty), self.lon_von(tx))
    def bild(self, versatz_px=(0, 0)):
        """Luftbild im Raster der Karte, S Pixel je Kachel. versatz_px: Ausgabepixel, um die das Bild verschoben abgetastet wird."""
        ox, oy = self.x0 * 256, self.y0 * 256
        (ax, ay), (bx, by), (cx, cy) = self.px(0, 0), self.px(self.B, 0), self.px(0, self.H)
        W, Hh = self.B * S, self.H * S
        a, b, d, e = (bx - ax) / W, (cx - ax) / Hh, (by - ay) / W, (cy - ay) / Hh
        sx, sy = versatz_px
        data = (a, b, ax - ox + a * sx + b * sy, d, e, ay - oy + d * sx + e * sy)
        return self.mosaik.transform((W, Hh), Image.AFFINE, data, Image.BICUBIC)
    def quelle(self): return QUELLEN[self.q][3]

def versatz_schaetzen(bild, karte, reichweite_m=4.0):
    """Versatz Luftbild gegen OSM-Gebäudeumrisse: Kanten im Luftbild entlang der Umrisse, bestes (dx, dy) in Ausgabepixeln.
    Dachkanten (Luftbild ist kein echtes Ortho) können 1–2 m nach außen/Sonnenseite kippen – der Mittelwert über viele Häuser hebt das auf."""
    grau = bild.convert("L").filter(ImageFilter.GaussianBlur(1.0))
    kante = ImageChops.add(grau.filter(ImageFilter.FIND_EDGES), Image.new("L", grau.size, 0))
    kd, W, Hh = kante.tobytes(), *kante.size
    punkte = []
    for g in karte["gebaeude"]:
        u = g.get("umriss")
        if not u or len(u) < 6: continue
        p = [(u[i] * S, u[i + 1] * S) for i in range(0, len(u) - 1, 2)]
        for (x1, y1), (x2, y2) in zip(p, p[1:] + p[:1]):
            n = max(1, int(math.hypot(x2 - x1, y2 - y1) / 4))
            for i in range(n): punkte.append((x1 + (x2 - x1) * i / n, y1 + (y2 - y1) * i / n))
    schritt = max(1, len(punkte) // 12000); punkte = punkte[::schritt]
    r = int(reichweite_m / (karte["meterProKachel"] / S)); beste = (-1, 0, 0); tabelle = {}
    for dy in range(-r, r + 1):
        for dx in range(-r, r + 1):
            s = 0
            for x, y in punkte:
                xi, yi = int(x) + dx, int(y) + dy
                if 0 <= xi < W and 0 <= yi < Hh: s += kd[yi * W + xi]
            tabelle[(dx, dy)] = s
            if s > beste[0]: beste = (s, dx, dy)
    return beste[1], beste[2], beste[0] / max(1, tabelle[(0, 0)]), len(punkte)

def klassifizieren(bild, B, H):
    """Je Kachel Mittelwert (R, G, B) und Textur → Klasse. Gibt (Ziffernkette, Anzahl je Klasse) zurück."""
    grau = bild.convert("L")
    textur = ImageChops.difference(grau, grau.filter(ImageFilter.GaussianBlur(2.0)))
    mittel = bild.resize((B, H), Image.BOX).tobytes()
    tex = textur.resize((B, H), Image.BOX).tobytes()
    ziffern = bytearray(B * H)
    for i in range(B * H):
        r, g, b = mittel[3 * i], mittel[3 * i + 1], mittel[3 * i + 2]
        t = tex[i]; hell = 0.3 * r + 0.59 * g + 0.11 * b
        exg = 2 * g - r - b; sat = max(r, g, b) - min(r, g, b)
        if hell < 38: k = 0                                      # tiefer Schatten
        elif hell < 70 and t < 2.5 and b >= r and b >= g - 8 and sat < 40: k = 5   # dunkel, glatt, bläulich: Wasser
        elif exg > 8 and hell < 82: k = 1                        # dunkles Grün: Baum/Wald
        elif exg >= 40: k = 1 if t >= 9.0 else 2                 # kräftiges Grün: Baum bei Kronenstruktur, sonst Wiese
        elif exg > 8:                                            # blasses Grün/Grau: Wiese, Straße oder Gebüsch
            k = 4 if (sat < 30 and hell > 100) else (1 if t >= 7.0 else 2)
        elif sat < 22 and hell > 90: k = 4                       # grau: befestigt
        elif r >= g - 6 and exg <= 10 and sat >= 22 and t < 6.0: k = 3   # braun/gelb: Acker
        elif t >= 6.0 and exg > 0: k = 1
        elif sat < 30: k = 4
        else: k = 0
        ziffern[i] = k
    # Rauschen glätten: Mehrheit in der 3×3-Nachbarschaft (ModeFilter lässt Pixel ohne klare Mehrheit stehen)
    ziffern = bytearray(Image.frombytes("L", (B, H), bytes(ziffern)).filter(ImageFilter.ModeFilter(3)).tobytes())
    return ziffern, [ziffern.count(k) for k in range(6)]

def daecher(bild, karte):
    """Dachfarbe, Firstrichtung, Dachart je Gebäude aus den Pixeln innerhalb des Umrisses (1 m nach innen ausgespart)."""
    W, Hh = bild.size; n_ok = 0
    for g in karte["gebaeude"]:
        for k in ("dach", "first", "dachart", "dachhell"): g.pop(k, None)
        u = g.get("umriss")
        if not u or len(u) < 6: continue
        pts = [(u[i] * S, u[i + 1] * S) for i in range(0, len(u) - 1, 2)]
        bx0, by0 = max(0, int(min(p[0] for p in pts)) - 1), max(0, int(min(p[1] for p in pts)) - 1)
        bx1, by1 = min(W, int(max(p[0] for p in pts)) + 2), min(Hh, int(max(p[1] for p in pts)) + 2)
        if bx1 - bx0 < 4 or by1 - by0 < 4: continue
        maske = Image.new("L", (bx1 - bx0, by1 - by0), 0)
        ImageDraw.Draw(maske).polygon([(x - bx0, y - by0) for x, y in pts], fill=255)
        pixel = list(bild.crop((bx0, by0, bx1, by1)).getdata())
        bew = None
        for e in (2, 1, 0):
            m = maske.filter(ImageFilter.MinFilter(2 * e + 1)) if e else maske
            md = m.tobytes()
            sel = []
            for i, c in enumerate(pixel):
                if not md[i]: continue
                r, gr, b = c; hell = 0.3 * r + 0.59 * gr + 0.11 * b
                if hell < 50 or 2 * gr - r - b > 20: continue   # Schatten, Bäume/Bewuchs
                sel.append((i % maske.size[0] + bx0, i // maske.size[0] + by0, r, gr, b, hell))
            if len(sel) >= 12: bew = sel; break
        if not bew: continue
        r = statistics.median(s[2] for s in bew); gr = statistics.median(s[3] for s in bew); b = statistics.median(s[4] for s in bew)
        # Hauptrichtung: kleinste umschließende Rechteckfläche der Eckpunkte (3°-Schritte), längere Seite = Firstrichtung
        beste = None
        for ang in range(0, 90, 3):
            c, s_ = math.cos(math.radians(ang)), math.sin(math.radians(ang))
            us = [x * c + y * s_ for x, y in pts]; vs = [-x * s_ + y * c for x, y in pts]
            a = (max(us) - min(us)) * (max(vs) - min(vs))
            if beste is None or a < beste[0]: beste = (a, ang, max(us) - min(us), max(vs) - min(vs))
        _, ang, lu, lv = beste
        first = ang if lu >= lv else ang + 90
        seite = max(lu, lv) / max(1e-6, min(lu, lv))
        cx, cy = statistics.mean(s[0] for s in bew), statistics.mean(s[1] for s in bew)
        def kontrast(winkel):   # Helligkeitsunterschied der beiden Hälften quer zur Richtung winkel (relativ), Vorzeichen: Seite +v heller
            c, s_ = math.cos(math.radians(winkel)), math.sin(math.radians(winkel))
            vs = sorted(((-(x - cx) * s_ + (y - cy) * c), h) for x, y, _, _, _, h in bew)
            hlb = len(vs) // 2
            a = sum(h for _, h in vs[:hlb]) / max(1, hlb); bb = sum(h for _, h in vs[hlb:]) / max(1, len(vs) - hlb)
            return (bb - a) / max(1.0, (a + bb) / 2)
        k1, k2 = kontrast(first), kontrast(first + 90)
        if abs(k2) > abs(k1) * 1.5 and abs(k2) > 0.08:   # Helligkeitskante verläuft quer zur Gebäudeachse: First dort
            first, k1 = first + 90, k2
        sat = max(r, gr, b) - min(r, gr, b)
        if abs(k1) >= 0.07: art = "sattel" if seite >= 1.2 else "walm"
        elif sat < 26 or (g.get("flaeche") or 0) > 500: art = "flach"
        else: art = "sattel" if seite >= 1.25 else "walm"
        g["dach"] = "#%02x%02x%02x" % (int(r), int(gr), int(b)); g["first"] = int(first) % 180; g["dachart"] = art
        g["dachhell"] = 1 if k1 >= 0 else -1
        n_ok += 1
    return n_ok

def bild_der_klassen(ziffern, B, H):
    pal = bytes(c for f in FARBEN for c in f)
    p = Image.frombytes("P", (B, H), bytes(ziffern)); p.putpalette(pal + bytes(768 - len(pal)))
    return p.convert("RGB")

def webp_speichern(bild, B, H, ziel, grenze=250_000):
    klein = bild.resize((B * 2, H * 2), Image.LANCZOS)
    for q in (80, 72, 64, 56, 48, 40):
        puffer = io.BytesIO(); klein.save(puffer, "WEBP", quality=q, method=6)
        if puffer.tell() <= grenze: break
    ziel.write_bytes(puffer.getvalue())
    return q, puffer.tell()

def main():
    namen = sys.argv[1:] or ["geretsried", "geretsried2", "isarauen", "koenigsdorf", "kochel", "andermatt"]
    for name in namen:
        pfad = KARTEN / f"{name}.json"; roh = pfad.read_text(); karte = json.loads(roh)
        gb = Gebiet(name, karte); B, H = gb.B, gb.H
        bild = gb.bild()
        dx, dy, verh, np_ = versatz_schaetzen(bild, karte)
        m = S / karte["meterProKachel"]   # Pixel je Meter
        print(f"  Versatz (Kantenkorrelation, {np_} Punkte): dx={dx / m:+.1f} m, dy={dy / m:+.1f} m (Kantenstärke {verh:.2f}× gegenüber 0)")
        versatz_m = [round(dx / m, 1), round(dy / m, 1)]
        if math.hypot(dx, dy) / m > 1.5:   # darunter: Dachkippung im Foto/Rauschen (Vorzeichen bei allen Karten gleich), kein echter Versatz
            bild = gb.bild((dx, dy)); karte["luftbildVersatz"] = versatz_m
        else:
            karte.pop("luftbildVersatz", None)
        ziffern, zaehl = klassifizieren(bild, B, H)
        print("  Klassen %:", {NAMEN[k]: round(zaehl[k] / (B * H) * 100, 1) for k in range(6)})
        karte["luftbild"] = "".join(map(str, ziffern)); karte["luftbildQuelle"] = gb.quelle()
        print("  Dächer:", daecher(bild, karte), "von", len(karte["gebaeude"]))
        pfad.write_text(json.dumps(karte, ensure_ascii=False) + ("\n" if roh.endswith("\n") else ""))
        q, n = webp_speichern(bild, B, H, KARTEN / f"{name}_luftbild.webp")
        print(f"  WebP q{q}: {n // 1024} KB")
        pb = pathlib.Path(os.environ.get("LUFTBILD_PRUEF", "/tmp"))
        bild.resize((B * 3, H * 3), Image.LANCZOS).save(pb / f"lb_{name}_foto.png")
        bild_der_klassen(ziffern, B, H).resize((B * 3, H * 3), Image.NEAREST).save(pb / f"lb_{name}_klassen.png")

if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Amtliche Daten statt Zufall: Hecken, Zäune, Bäume, Straßenbreiten, Gehwege, Zebrastreifen, Laternen und Mülltonnen einer Karte (geretsried2).
Quellen (Bayerische Vermessungsverwaltung, CC BY 4.0, https://geodaten.bayern.de/opengeodata/; Auswertungen unter tools/luftbild/cache/bayern/auswertung):
  Einzelbäume (baeume.json, aus DOM/NDVI), Flurstücksgrenzen + Hecken/Zaun-Klassifikation (grenzen_klassifiziert.json),
  ALKIS Tatsächliche Nutzung (tn.npy, tn/shp), Basis-DLM-Achsen mit gemessener Breite (strassenbreite.json), OSM-Übergänge (osm_crossings.json).
Aufruf: python3 tools/amtlich.py <karte>        (Karte muss schon gebaut sein: osm_karte.py, hausumringe, luftbild/nebengebäude/kulisse wie in karten/LEVELORTE.md)
Schreibt in zombies/client/karten/<karte>.json (idempotent: ersetzt immer aus den alten Rohfeldern, die Karte darf mehrfach laufen):
  zaeune          Hecken ('h', nur Klasse "hecke", ≥ 3 m) und Zäune ('z', Klasse "zaun_vorschlag" nach TN-Regel), Polylinien in Kacheln (glatt, 0,7-m-Vereinfachung)
  kacheln/zaunart grobe Zaunkacheln passend zu den Linien (wie die Weltlogik: Linie ≤ 0,6 Kacheln vom Kachelmittelpunkt); alte Zaun-/Baumkacheln fallen weg
  baeumeLuftbild  Einzelbäume [{x, y (Spielpixel), d (Kronendurchmesser m), art}], baeumeLuftbildFenster = ganze Karte
  strassen[]      breite (Fahrbahn m: Basis-DLM, sonst OSM-Angabe, sonst Schätzung gerundet auf 0,5 m), gl/gr (Gehweg links/rechts m, 0 = keiner)
  zebra           [{x, y, ux, uy, l}] Spielpixel, Straßenrichtung (ux, uy), Länge quer l (px)
  laternen        [{x, y, nx, ny}] Spielpixel, (nx, ny) = Richtung zur Fahrbahn
  muelltonnen     [{x, y, w, f, r, g}] Gruppen: w = Richtung vom Haus weg (rad), f = Farben, r = rund, g = [x, y] des Gebäudes
  amtlich         Kennung (die Welt nutzt dann diese Felder statt Zufall/OSM-Schätzung)
Alle Entscheidungen fallen hier (Python); der Weltaufbau liest nur fertige Koordinaten (deterministisch, ohne Winkelfunktionen).
Hinweis: osm_karte.py baut die Karte neu und verwirft diese Felder – danach amtlich.py erneut laufen lassen."""
import json, math, pathlib, struct, sys

HIER = pathlib.Path(__file__).resolve().parent
import os
for _p in (HIER / ".pylib", pathlib.Path(os.environ.get("PYLIB", "")), pathlib.Path("~/code/zombies-addon/tools/.pylib").expanduser()):
    if _p.is_dir(): sys.path.insert(0, str(_p))
sys.path.insert(0, str(HIER))
import numpy as np
import hausumringe as HU

KARTEN = HIER.parent / "zombies" / "client" / "karten"
BAYERN = HIER / "luftbild" / "cache" / "bayern"
AUSW = BAYERN / "auswertung"
# Rasterherkunft der Auswertungen (0,2 m je Pixel; NW-Ecke; an den Hausumringen geprüft)
E0, NT, PX = 683671.0, 5306840.0, 0.2
TN = {"wohn": 15, "misch": 4, "gewerbe": 6, "platz": 8, "strasse": 11, "weg": 14, "wald": 13, "gehoelz": 5}
WOHN = (15, 4)
KFZ = {"primary", "secondary", "tertiary", "residential", "unclassified", "living_street", "service"}
QUELLE_ZUSATZ = "; Einzelbäume, Nutzung, Flurstücke, Basis-DLM: © Bayerische Vermessungsverwaltung (CC BY 4.0)"

def hsh(*v):
    """Positions-Hash 0..1 (32 Bit, ohne Python-hash)"""
    h = 0x811c9dc5
    for x in v:
        h = ((h ^ (int(x) & 0xffffffff)) * 0x01000193) & 0xffffffff
        h ^= h >> 15; h = (h * 0x2c1b3c6d) & 0xffffffff; h ^= h >> 12
    return (h & 0xffffff) / 0x1000000

class Proj:
    def __init__(self, karte):
        self.zu_k = HU.umkehrung(karte)
        p0 = self.zu_k(683700, 5305000); p1 = self.zu_k(683800, 5305000); p2 = self.zu_k(683700, 5305100)
        self.A = np.array([[p1[0] - p0[0], p2[0] - p0[0]], [p1[1] - p0[1], p2[1] - p0[1]]]) / 100
        self.Ai = np.linalg.inv(self.A); self.p0 = np.array(p0)
    def kachel(self, E, N):
        E = np.asarray(E, float); N = np.asarray(N, float)
        a = self.A
        return a[0, 0] * (E - 683700) + a[0, 1] * (N - 5305000) + self.p0[0], a[1, 0] * (E - 683700) + a[1, 1] * (N - 5305000) + self.p0[1]
    def utm(self, tx, ty):
        tx = np.asarray(tx, float) - self.p0[0]; ty = np.asarray(ty, float) - self.p0[1]
        return 683700 + self.Ai[0, 0] * tx + self.Ai[0, 1] * ty, 5305000 + self.Ai[1, 0] * tx + self.Ai[1, 1] * ty

class Raster:
    def __init__(self):
        d = AUSW / "_npy"
        self.tn = np.load(d / "tn.npy", mmap_mode="r"); self.haus = np.load(d / "haus.npy", mmap_mode="r"); self.asph = np.load(d / "asphalt.npy", mmap_mode="r")
    def _rc(self, E, N):
        E = np.asarray(E, float); N = np.asarray(N, float)
        return ((NT - N) / PX).astype(int), ((E - E0) / PX).astype(int)
    def hole(self, arr, E, N, aussen=0):
        r, c = self._rc(E, N)
        ok = (r >= 0) & (c >= 0) & (r < arr.shape[0]) & (c < arr.shape[1])
        out = np.full(np.shape(r), aussen, dtype=arr.dtype)
        out[ok] = arr[r[ok], c[ok]]
        return out
    def tn_code(self, E, N): return self.hole(self.tn, E, N)

# ---------- Geometrie (UTM, Meter) ----------
def laenge(pts): return float(sum(math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]) for i in range(len(pts) - 1)))

def dp_utm(pts, eps): return [tuple(p) for p in HU.dp([tuple(p) for p in pts], eps)]

def abstand_polylinie(px, py, pts):
    """kleinster Abstand und Lotpunkt (x, y, t-Index, Anteil) von (px, py) zur Polylinie"""
    best = (1e18, None)
    for i in range(len(pts) - 1):
        ax, ay = pts[i]; bx, by = pts[i + 1]; dx, dy = bx - ax, by - ay; l2 = dx * dx + dy * dy
        t = 0.0 if l2 < 1e-12 else max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / l2))
        qx, qy = ax + t * dx, ay + t * dy; d = math.hypot(px - qx, py - qy)
        if d < best[0]: best = (d, (qx, qy, i, t))
    return best

def verketten(laeufe, tol=0.9, mincos=0.5):
    """Läufe (je Liste von Punkten) zu Linienzügen verbinden: Enden innerhalb tol, Richtungswechsel höchstens ~60°"""
    n = len(laeufe); benutzt = [False] * n
    gitter = {}
    for i, l in enumerate(laeufe):
        for ende in (0, 1):
            p = l[0] if ende == 0 else l[-1]
            gitter.setdefault((int(p[0] // tol), int(p[1] // tol)), []).append((i, ende))
    def richtung(pts, ende):   # Richtung vom Ende weg ins Innere
        a, b = (pts[0], pts[1]) if ende == 0 else (pts[-1], pts[-2])
        L = math.hypot(b[0] - a[0], b[1] - a[1]) or 1e-9
        return ((b[0] - a[0]) / L, (b[1] - a[1]) / L)
    def finde(p, richt, ausser):
        """Lauf, dessen Ende nahe p liegt und so weiterläuft, dass der Knick klein ist"""
        gx, gy = int(p[0] // tol), int(p[1] // tol); best = None
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for (j, ende) in gitter.get((gx + dx, gy + dy), []):
                    if benutzt[j] or j == ausser: continue
                    q = laeufe[j][0] if ende == 0 else laeufe[j][-1]
                    d = math.hypot(q[0] - p[0], q[1] - p[1])
                    if d > tol: continue
                    r2 = richtung(laeufe[j], ende)
                    c = -(richt[0] * r2[0] + richt[1] * r2[1])   # richt zeigt ins Innere der aktuellen Kette, r2 ins Innere des Kandidaten
                    if c < mincos: continue
                    if best is None or d - 0.3 * c < best[0]: best = (d - 0.3 * c, j, ende)
        return best
    ketten = []
    for i in range(n):
        if benutzt[i]: continue
        benutzt[i] = True; kette = [tuple(p) for p in laeufe[i]]
        for richtung_vor in (True, False):
            while True:
                ende = len(kette) - 1 if richtung_vor else 0
                p = kette[ende]
                a, b = (kette[-1], kette[-2]) if richtung_vor else (kette[0], kette[1])
                L = math.hypot(b[0] - a[0], b[1] - a[1]) or 1e-9
                r = ((b[0] - a[0]) / L, (b[1] - a[1]) / L)
                f = finde(p, r, -1)
                if not f: break
                _, j, e = f; benutzt[j] = True
                nl = [tuple(q) for q in laeufe[j]]
                if e == 1: nl = nl[::-1]   # nl beginnt jetzt am Verbindungspunkt
                if richtung_vor: kette = kette + nl[1:] if math.hypot(nl[0][0] - p[0], nl[0][1] - p[1]) < 0.05 else kette + nl
                else: kette = nl[::-1] + (kette[1:] if math.hypot(nl[0][0] - p[0], nl[0][1] - p[1]) < 0.05 else kette)
        ketten.append(kette)
    return ketten

# ---------- TN-Parkplätze (bez) aus dem Shapefile ----------
def tn_parkplaetze():
    cache = AUSW / "tn_parkplatz.json"
    if cache.exists(): return json.loads(cache.read_text())
    shp = BAYERN / "tn" / "shp"
    dbf = (shp / "Nutzung.dbf").read_bytes(); shx = (shp / "Nutzung.shx").read_bytes(); sh = (shp / "Nutzung.shp").read_bytes()
    nrec, hlen, rlen = struct.unpack("<IHH", dbf[4:12])
    felder = []; off = 1; p = 32
    while dbf[p] != 0x0D:
        name = dbf[p:p + 11].split(b"\0")[0].decode(); ln = dbf[p + 16]; felder.append((name, off, ln)); off += ln; p += 32
    fi = {n: (o, l) for n, o, l in felder}
    out = []
    n = (len(shx) - 100) // 8
    for i in range(n):
        o, _ = struct.unpack(">II", shx[100 + 8 * i:108 + 8 * i]); o *= 2
        typ = struct.unpack("<i", sh[o + 8:o + 12])[0]
        if typ != 5: continue
        x0, y0, x1, y1 = struct.unpack("<4d", sh[o + 12:o + 44])
        if x1 < 683500 or x0 > 685400 or y1 < 5304800 or y0 > 5306900: continue
        rec = dbf[hlen + i * rlen: hlen + (i + 1) * rlen]
        bez = rec[fi["bez"][0]:fi["bez"][0] + fi["bez"][1]].decode("utf-8", "replace").strip()
        if "Parkplatz" not in bez: continue
        nparts, npts = struct.unpack("<ii", sh[o + 44:o + 52]); parts = struct.unpack(f"<{nparts}i", sh[o + 52:o + 52 + 4 * nparts])
        pt0 = o + 52 + 4 * nparts; pts = struct.unpack(f"<{2 * npts}d", sh[pt0:pt0 + 16 * npts])
        ringe = []
        for k in range(nparts):
            a = parts[k]; b = parts[k + 1] if k + 1 < nparts else npts
            ringe.append([[pts[2 * j], pts[2 * j + 1]] for j in range(a, b)])
        out.append({"bez": bez, "ringe": ringe})
    cache.write_text(json.dumps(out)); return out

def im_ring(px, py, ring):
    drin = False
    for i in range(len(ring)):
        a, b = ring[i - 1], ring[i]
        if (b[1] > py) != (a[1] > py) and px < (a[0] - b[0]) * (py - b[1]) / (a[1] - b[1]) + b[0]: drin = not drin
    return drin

def im_parkplatz(pp, x, y): return any(im_ring(x, y, r[0]) for r in (f["ringe"] for f in pp))

# ---------- Hauptprogramm ----------
def main():
    name = sys.argv[1] if len(sys.argv) > 1 else "geretsried2"
    pfad = KARTEN / f"{name}.json"; k = json.loads(pfad.read_text())
    B, H = k["breite"], k["hoehe"]; P = Proj(k); R = Raster(); pp = tn_parkplaetze()
    stat = {}
    grenzen = json.loads((AUSW / "grenzen_klassifiziert.json").read_text())["laeufe"]

    # ---- 1. Hecken und Zäune ----
    hecken_l = [l["pts"] for l in grenzen if l["klasse"] == "hecke"]
    zaun_runs = []
    for l in grenzen:
        if l["klasse"] != "zaun_vorschlag": continue
        pts = l["pts"]; (ax, ay), (bx, by) = pts[0], pts[-1]; L = math.hypot(bx - ax, by - ay)
        if L < 0.5: continue
        nx, ny = -(by - ay) / L, (bx - ax) / L
        # Mittelpunkte beider Seiten (2 m neben der Mitte) und Streifen für den Pflastertest
        m = pts[len(pts) // 2] if len(pts) % 2 else ((ax + bx) / 2, (ay + by) / 2)
        codes = []; asph = []
        for s in (1, -1):
            cx, cy = m[0] + nx * 2.0 * s, m[1] + ny * 2.0 * s
            codes.append(int(R.tn_code(cx, cy)))
            xs = [ax + (bx - ax) * t / 3 + nx * d * s for t in range(4) for d in (0.8, 1.6, 2.4, 3.2)]
            ys = [ay + (by - ay) * t / 3 + ny * d * s for t in range(4) for d in (0.8, 1.6, 2.4, 3.2)]
            asph.append(float(np.mean(R.hole(R.asph, np.array(xs), np.array(ys)))))
        ok = False
        for s in (0, 1):
            wohnseite, andere = codes[s], codes[1 - s]
            if wohnseite not in WOHN: continue
            cx, cy = m[0] - nx * 2.0 * (1 if s == 0 else -1), m[1] - ny * 2.0 * (1 if s == 0 else -1)   # Mitte der anderen Seite
            if andere in (TN["gewerbe"], TN["platz"]) or im_parkplatz(pp, cx, cy): continue
            if andere not in (TN["strasse"], TN["weg"]) and asph[1 - s] >= 0.75: continue   # gepflasterter Hof/Einfahrt der anderen Seite
            ok = True
        if ok: zaun_runs.append(pts)
    stat["zaunlaeufe_roh"] = sum(1 for l in grenzen if l["klasse"] == "zaun_vorschlag"); stat["zaunlaeufe_nach_regel"] = len(zaun_runs)
    stat["heckenlaeufe_roh"] = len(hecken_l)
    def linien(runs, mindest):
        out = []
        for kette in verketten(runs):
            kette = dp_utm(kette, 0.7)
            if len(kette) >= 2 and laenge(kette) >= mindest: out.append(kette)
        return out
    hecken = linien(hecken_l, 3.0); zaeune = linien(zaun_runs, 3.0)
    stat["hecken"] = len(hecken); stat["hecken_m"] = round(sum(laenge(l) for l in hecken)); stat["zaeune"] = len(zaeune); stat["zaeune_m"] = round(sum(laenge(l) for l in zaeune))
    def zu_kachel_liste(kette):
        tx, ty = P.kachel([p[0] for p in kette], [p[1] for p in kette])
        return [round(float(v), 2) for xy in zip(tx, ty) for v in xy]
    neue_zaeune = [{"a": "h", "p": zu_kachel_liste(l)} for l in hecken] + [{"a": "z", "p": zu_kachel_liste(l)} for l in zaeune]
    # Linien am Kartenrand beschneiden: nur Stücke innerhalb der Karte behalten
    def im_feld(x, y): return 1.0 <= x <= B - 1.0 and 1.0 <= y <= H - 1.0
    zz = []
    for z in neue_zaeune:
        teil = []
        for i in range(0, len(z["p"]), 2):
            if im_feld(z["p"][i], z["p"][i + 1]): teil += z["p"][i:i + 2]
            else:
                if len(teil) >= 4: zz.append({"a": z["a"], "p": teil})
                teil = []
        if len(teil) >= 4: zz.append({"a": z["a"], "p": teil})
    neue_zaeune = zz
    stat["zaunlinien_in_karte"] = len(neue_zaeune)

    # ---- 2. Einzelbäume ----
    bd = json.loads((AUSW / "baeume.json").read_text())["baeume"]
    ba = np.array(bd, float)
    tx, ty = P.kachel(ba[:, 0], ba[:, 1])
    drin = (tx >= 2) & (ty >= 2) & (tx < B - 2) & (ty < H - 2)
    ba, tx, ty = ba[drin], tx[drin], ty[drin]
    verh = ba[:, 2] / np.maximum(ba[:, 3], 1.0)
    nadel = (verh >= 2.4) & (ba[:, 2] >= 14)
    baeume = [{"x": round(float(x * 32), 1), "y": round(float(y * 32), 1), "d": round(float(d), 1), "art": "nadel" if nd else "laub"}
              for x, y, d, nd in zip(tx, ty, ba[:, 3], nadel) if d >= 1.5]
    stat["baeume"] = len(baeume); stat["baeume_nadel"] = int(sum(1 for b in baeume if b["art"] == "nadel"))

    # ---- 3. grobe Kacheln: alte Zäune/Baumkacheln raus, neue Zaunkacheln ----
    kach = list(k["kacheln"]); za = list(k["zaunart"])
    alt_zaun = 0
    for i in range(len(kach)):
        if kach[i] == "8" and za[i] in "hzmw": kach[i] = "0"; za[i] = "."; alt_zaun += 1
    # Waldkacheln (TN Wald/Gehölz) ohne gedeckte Krone bleiben, alle anderen alten OSM-Baumkacheln entfallen (die Einzelbäume setzen die Welt)
    zellen = {}
    for b in baeume: zellen.setdefault((int(b["x"] // 128), int(b["y"] // 128)), []).append(b)
    def gedeckt(cx, cy):
        gx, gy = int(cx // 128), int(cy // 128)
        for dx in (-2, -1, 0, 1, 2):
            for dy in (-2, -1, 0, 1, 2):
                for b in zellen.get((gx + dx, gy + dy), ()):
                    r = b["d"] * 4 + 16
                    if (b["x"] - cx) ** 2 + (b["y"] - cy) ** 2 <= r * r: return True
        return False
    alt_baum = behalten = 0
    for i in range(len(kach)):
        if kach[i] != "6": continue
        x, y = i % B, i // B; E, N = P.utm(x + 0.5, y + 0.5)
        code = int(R.tn_code(E, N))
        if code in (TN["wald"], TN["gehoelz"]) and not gedeckt((x + 0.5) * 32, (y + 0.5) * 32): behalten += 1; continue
        kach[i] = "0"; alt_baum += 1
    stat["alte_zaunkacheln"] = alt_zaun; stat["alte_baumkacheln_entfernt"] = alt_baum; stat["waldkacheln_behalten"] = behalten
    neu_zaun = 0
    for z in neue_zaeune:
        art = z["a"]; p = z["p"]
        for i in range(0, len(p) - 2, 2):
            ax, ay, bx, by = p[i], p[i + 1], p[i + 2], p[i + 3]; dx, dy = bx - ax, by - ay; L2 = dx * dx + dy * dy
            n = max(1, int(math.sqrt(L2) / 0.25) + 1)
            for j in range(n + 1):
                sx, sy = ax + dx * j / n, ay + dy * j / n
                for ty_ in range(int(sy) - 1, int(sy) + 2):
                    for tx_ in range(int(sx) - 1, int(sx) + 2):
                        if tx_ < 1 or ty_ < 1 or tx_ >= B - 1 or ty_ >= H - 1: continue
                        c = ty_ * B + tx_
                        if kach[c] != "0": continue
                        px, py = tx_ + 0.5, ty_ + 0.5
                        t = 0.0 if L2 < 1e-12 else max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / L2))
                        if math.hypot(ax + t * dx - px, ay + t * dy - py) <= 0.6:
                            kach[c] = "8"; za[c] = art; neu_zaun += 1
    stat["neue_zaunkacheln"] = neu_zaun

    # ---- 4. Straßen: Fahrbahnbreite aus Basis-DLM + Schätzung, Gehwege aus TN ----
    achsen = [a for a in json.loads((AUSW / "strassenbreite.json").read_text())["achsen"] if a["typ"] != "AX_WegPfadSteig"]
    dicht = []   # (E, N, achsindex) alle 3 m
    for ai, a in enumerate(achsen):
        pts = a["pts"]
        for i in range(len(pts) - 1):
            L = math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]); n = max(1, int(L / 3))
            for j in range(n + 1): dicht.append((pts[i][0] + (pts[i + 1][0] - pts[i][0]) * j / n, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * j / n, ai))
    dicht = np.array(dicht)
    GRENZE_ART = {"primary": (6.5, 9.0), "secondary": (6.0, 8.5), "tertiary": (5.0, 7.5), "residential": (4.0, 6.5), "unclassified": (4.0, 6.5), "living_street": (3.0, 5.0), "service": (2.5, 4.5)}
    GRENZE_BED = {"1000": (6.5, 9.0), "2001": (5.5, 8.0), "2002": (3.5, 6.5)}
    strassen = k["strassen"]; strecken = []   # je Straße UTM-Polylinie
    zuordnung = {"dlm": 0, "osm": 0, "schaetzung": 0, "ohne": 0}
    for s in strassen:
        tx_, ty_ = np.array(s["p"][0::2]), np.array(s["p"][1::2]); E, N = P.utm(tx_, ty_)
        pts = list(zip(E.tolist(), N.tolist())); strecken.append(pts)
        s.pop("gl", None); s.pop("gr", None)
        if s["t"] not in KFZ: continue
        # Stützpunkte alle ~4 m, Achse mit den meisten nahen Treffern
        stuetz = []
        for i in range(len(pts) - 1):
            L = math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]); n = max(1, int(L / 4))
            for j in range(n + 1): stuetz.append((pts[i][0] + (pts[i + 1][0] - pts[i][0]) * j / n, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * j / n))
        stz = np.array(stuetz); stimmen = {}
        for (x, y) in stz:
            d = np.hypot(dicht[:, 0] - x, dicht[:, 1] - y); j = int(np.argmin(d))
            if d[j] < 6.0: ai = int(dicht[j, 2]); stimmen.setdefault(ai, []).append(float(d[j]))
        best = None
        for ai, ds in stimmen.items():
            if len(ds) < max(2, 0.5 * len(stz)): continue
            sc = (len(ds), -sum(ds) / len(ds))
            if best is None or sc > best[0]: best = (sc, ai)
        osm_breite = float(s["breite"]) if s.get("breite") not in (None, "") and str(s["breite"]).replace(".", "", 1).isdigit() else 0.0
        if best is None:
            if osm_breite >= 2.5: zuordnung["osm"] += 1
            else: zuordnung["ohne"] += 1
            continue
        a = achsen[best[1]]
        if a["bekannt_m"]:
            w = a["bekannt_m"]; zuordnung["dlm"] += 1
        elif osm_breite >= 2.5:
            w = osm_breite; zuordnung["osm"] += 1
        else:
            lo, hi = GRENZE_ART.get(s["t"], (4.0, 6.5))
            if a["bedeutung"] in GRENZE_BED:
                l2, h2 = GRENZE_BED[a["bedeutung"]]
                if max(lo, l2) <= min(hi, h2): lo, hi = max(lo, l2), min(hi, h2)
            med = a["median"] if a["median"] is not None and a["n_ok"] >= 2 else (lo + hi) / 2
            w = min(hi, max(lo, med)); zuordnung["schaetzung"] += 1
        s["breite"] = format(round(w * 2) / 2, "g")
    stat["strassenbreite"] = zuordnung

    # Gehwege: je Seite von der Fahrbahnkante nach außen, solange TN "Straßenverkehr" (nur Fahrstraßen, nicht service)
    GEH = {"primary", "secondary", "tertiary", "residential", "unclassified", "living_street"}
    gwn = 0; gwwerte = []
    for s, pts in zip(strassen, strecken):
        if s["t"] not in GEH: continue
        fb = float(s["breite"]) if s.get("breite") not in (None, "") else {"primary": 7.5, "secondary": 6.5, "tertiary": 6.0, "residential": 5.0, "unclassified": 5.0, "living_street": 4.0}[s["t"]]
        werte = ([], [])
        for i in range(len(pts) - 1):
            ax, ay = pts[i]; bx, by = pts[i + 1]; L = math.hypot(bx - ax, by - ay)
            if L < 1: continue
            ux, uy = (bx - ax) / L, (by - ay) / L
            # Normale in Kachelrichtung (links = (-dy, dx) in Kachelkoordinaten): in UTM (y gespiegelt) ist das (uy, -ux)·(−1)… hier direkt über Kacheln gerechnet
            tax, tay = P.kachel(ax, ay); tbx, tby = P.kachel(bx, by)
            tl = math.hypot(tbx - tax, tby - tay) or 1e-9; ntx, nty = -(tby - tay) / tl, (tbx - tax) / tl   # linke Normale in Kacheln
            n = max(1, int(L / 5))
            for j in range(n):
                t = (j + 0.5) / n; cx, cy = ax + (bx - ax) * t, ay + (by - ay) * t
                kx, ky = P.kachel(cx, cy)
                for si, sg in enumerate((1, -1)):
                    e = 0.0
                    for o in np.arange(fb / 2 + 0.2, fb / 2 + 6.0, 0.4):
                        qx, qy = P.utm(kx + ntx * sg * o / 4.0, ky + nty * sg * o / 4.0)
                        if int(R.tn_code(qx, qy)) == TN["strasse"]: e = o - fb / 2 + 0.2
                        else: break
                    werte[si].append(e)
        if not werte[0]: continue
        def seite(w):
            if not w: return 0.0
            m = float(np.median(w))
            if m < 1.0: return 0.0
            return min(2.5, max(1.5, round(m * 2) / 2))
        gl, gr = seite(werte[0]), seite(werte[1])
        s["gl"], s["gr"] = gl, gr; gwn += 1; gwwerte += [gl, gr]
    stat["gehwege_strassen"] = gwn; stat["gehweg_seiten_mit"] = sum(1 for v in gwwerte if v > 0); stat["gehweg_seiten_ohne"] = sum(1 for v in gwwerte if v == 0)

    # ---- 5. Zebrastreifen (OSM crossing=zebra/marked) ----
    zebra = []
    kreuz = json.loads((AUSW / "_npy" / "osm_crossings.json").read_text())
    for E, N, typ, *_ in kreuz:
        if typ not in ("zebra", "marked"): continue
        best = None
        for s, pts in zip(strassen, strecken):
            if s["t"] not in KFZ or s["t"] == "service": continue
            d, q = abstand_polylinie(E, N, pts)
            if d < 8.0 and (best is None or d < best[0]): best = (d, q, s, pts)
        if not best: continue
        d, (qx, qy, i, t), s, pts = best
        kx, ky = P.kachel(qx, qy); ax, ay = P.kachel(*pts[i]); bx, by = P.kachel(*pts[i + 1])
        L = math.hypot(bx - ax, by - ay) or 1e-9
        fb = float(s["breite"]) if s.get("breite") not in (None, "") else 5.0
        zebra.append({"x": round(float(kx) * 32, 1), "y": round(float(ky) * 32, 1), "ux": round(float((bx - ax) / L), 3), "uy": round(float((by - ay) / L), 3), "l": round(fb * 8, 1)})
    # Doppelte (beide Straßenseiten/Fahrspuren) innerhalb 4 m zusammenfassen
    uniq = []
    for z in zebra:
        if all((z["x"] - u["x"]) ** 2 + (z["y"] - u["y"]) ** 2 > 32 * 32 for u in uniq): uniq.append(z)
    zebra = uniq; stat["zebra"] = len(zebra)

    # ---- Hilfsstrukturen für Laternen/Mülltonnen: Linien (UTM) und Häuser ----
    sperrlinien = [[(float(a), float(b)) for a, b in zip(*P.utm(z["p"][0::2], z["p"][1::2]))] for z in neue_zaeune]
    segg = {}
    for pts in sperrlinien:
        for i in range(len(pts) - 1):
            (ax, ay), (bx, by) = pts[i], pts[i + 1]
            for gx in range(int(min(ax, bx) // 10) - 1, int(max(ax, bx) // 10) + 2):
                for gy in range(int(min(ay, by) // 10) - 1, int(max(ay, by) // 10) + 2): segg.setdefault((gx, gy), []).append((ax, ay, bx, by))
    def nah_linie(x, y, abstand):
        for (ax, ay, bx, by) in segg.get((int(x // 10), int(y // 10)), ()):
            dx, dy = bx - ax, by - ay; l2 = dx * dx + dy * dy
            t = 0.0 if l2 < 1e-12 else max(0.0, min(1.0, ((x - ax) * dx + (y - ay) * dy) / l2))
            if math.hypot(x - ax - t * dx, y - ay - t * dy) < abstand: return True
        return False
    def kachel_zeichen(x, y):
        tx_, ty_ = P.kachel(x, y); tx_, ty_ = int(tx_), int(ty_)
        return kach[ty_ * B + tx_] if 0 <= tx_ < B and 0 <= ty_ < H else "?"
    tuerpunkte = []
    for g in k["gebaeude"]:
        if g.get("tuer"): tuerpunkte.append(P.utm(g["tuer"]["x"] + 0.5, g["tuer"]["y"] + 0.5))
    tuerpunkte = [(float(a), float(b)) for a, b in tuerpunkte]
    def nah_tuer(x, y, r): return any((x - a) ** 2 + (y - b) ** 2 < r * r for a, b in tuerpunkte)
    kfz_str = [(s, pts, min(p[0] for p in pts), max(p[0] for p in pts), min(p[1] for p in pts), max(p[1] for p in pts)) for s, pts in zip(strassen, strecken) if s["t"] in KFZ]
    def strassen_info(x, y):
        """nächste Fahrstraße: (Abstand zur Achse, Lotpunkt, Straße, Polylinie)"""
        best = None
        for s, pts, x0, x1, y0, y1 in kfz_str:
            if best is not None and math.hypot(max(x0 - x, 0, x - x1), max(y0 - y, 0, y - y1)) >= best[0]: continue
            d, q = abstand_polylinie(x, y, pts)
            if best is None or d < best[0]: best = (d, q, s, pts)
        return best

    # ---- 6. Laternen ----
    LAT = {"residential", "unclassified", "living_street", "tertiary"}
    laternen = []; lat_utm = []
    for si, (s, pts) in enumerate(zip(strassen, strecken)):
        if s["t"] not in LAT: continue
        fb = float(s["breite"]) if s.get("breite") not in (None, "") else 5.0
        gesamt = laenge(pts)
        if gesamt < 15: continue
        abstand = 30 + 5 * hsh(si, 11)   # 30..35 m
        seite = 1 if hsh(si, 3) < 0.5 else -1
        pos = abstand * (0.3 + 0.4 * hsh(si, 5))
        while pos < gesamt - 6:
            # Punkt und Richtung bei Strecke pos
            acc = 0.0
            for i in range(len(pts) - 1):
                L = math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1])
                if acc + L >= pos: break
                acc += L
            else: break
            t = (pos - acc) / (L or 1e-9); cx, cy = pts[i][0] + (pts[i + 1][0] - pts[i][0]) * t, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t
            tax, tay = P.kachel(*pts[i]); tbx, tby = P.kachel(*pts[i + 1]); tl = math.hypot(tbx - tax, tby - tay) or 1e-9
            ntx, nty = -(tby - tay) / tl, (tbx - tax) / tl      # linke Normale (Kachelraum)
            kx, ky = P.kachel(cx, cy)
            ok = False
            for sg in (seite, -seite):
                off = fb / 2 + 0.5
                lx, ly = P.utm(kx + ntx * sg * off / 4.0, ky + nty * sg * off / 4.0); lx, ly = float(lx), float(ly)
                ax_, ay_ = P.utm(kx + ntx * sg * (off + 3.5) / 4.0, ky + nty * sg * (off + 3.5) / 4.0)   # 3,5 m weiter außen: Einfahrt?
                if nah_tuer(lx, ly, 3.5) or nah_linie(lx, ly, 0.6): continue
                if kachel_zeichen(lx, ly) not in "017": continue
                if int(R.hole(R.haus, lx, ly)) or int(R.hole(R.haus, ax_, ay_)): continue
                if any(math.hypot(kx * 32 - zz_["x"], ky * 32 - zz_["y"]) < 5 * 8 for zz_ in zebra): continue     # nicht auf/neben Zebrastreifen
                par = R.hole(R.asph, np.array([ax_ + dx for dx in (-1.5, 0, 1.5) for dy in (-1.5, 0, 1.5)]), np.array([ay_ + dy for dx in (-1.5, 0, 1.5) for dy in (-1.5, 0, 1.5)]))
                if float(np.mean(par)) >= 0.6 and int(R.tn_code(ax_, ay_)) in WOHN: continue   # befestigte Fläche hinter dem Rand = Einfahrt
                if any((lx - q[0]) ** 2 + (ly - q[1]) ** 2 < 24 * 24 for q in lat_utm): continue
                lat_utm.append((lx, ly)); lkx, lky = P.kachel(lx, ly)
                laternen.append({"x": round(float(lkx) * 32, 1), "y": round(float(lky) * 32, 1), "nx": round(float(-ntx * sg), 3), "ny": round(float(-nty * sg), 3)})
                ok = True; break
            seite = -seite
            pos += abstand if ok else 3.0
        # (bei Hindernis: 3 m weiter versuchen, sonst übernächster Mast)
    stat["laternen"] = len(laternen)

    # ---- 7. Mülltonnen ----
    WOHNBAU = {"yes", "house", "residential", "apartments", "detached", "terrace", "semidetached_house", "dormitory", "bungalow"}
    FARBEN = ["braun", "blau", "gelb"]
    tonnen = []; tonnen_utm = []
    for g in k["gebaeude"]:
        if not g.get("tuer") or g.get("flaeche", 0) < 12 or g.get("building", "yes") not in WOHNBAU: continue
        dx_, dy_ = g["tuer"]["x"] + 0.5, g["tuer"]["y"] + 0.5
        dE, dN = P.utm(dx_, dy_); dE, dN = float(dE), float(dN)
        if int(R.tn_code(dE, dN)) not in WOHN: continue
        info = strassen_info(dE, dN)
        if not info: continue
        d, (qx, qy, qi, qt), s, pts = info
        if d > 40: continue
        fb = float(s["breite"]) if s.get("breite") not in (None, "") else 5.0
        ux, uy = (qx - dE) / (d or 1e-9), (qy - dN) / (d or 1e-9)          # Richtung Haus → Straße (UTM)
        # Gehwegbreite der Hausseite: Seite über das Vorzeichen des Kreuzprodukts mit der Straßenrichtung (Kachelraum)
        tax, tay = P.kachel(*pts[qi]); tbx, tby = P.kachel(*pts[qi + 1]); tdx, tdy = P.kachel(dE, dN)
        links = ((tbx - tax) * (tdy - tay) - (tby - tay) * (tdx - tax)) > 0   # Haus links der Linie (linke Normale (-dy, dx) im Kachelraum)
        gw = (s.get("gl", 0) if links else s.get("gr", 0)) or 0.0
        rand = fb / 2 + gw
        if d < rand + 3.0: continue
        n = 1 + int(hsh(g["x"], g["y"], 21) * 3) if g.get("building") != "apartments" else 3
        if n > 3: n = 3
        sign = 1 if hsh(g["x"], g["y"], 22) < 0.5 else -1
        nxs, nys = -uy, ux
        besteller = None
        for tiefe in (1.4, 2.2, 3.0, 4.0):
            for lat in (2.2 * sign, -2.2 * sign, 3.4 * sign, -3.4 * sign, 4.6 * sign, -4.6 * sign):
                px, py = qx - ux * (rand + tiefe) + nxs * lat, qy - uy * (rand + tiefe) + nys * lat
                if int(R.tn_code(px, py)) not in WOHN: continue
                if kachel_zeichen(px, py) not in "078": continue
                if any(int(R.hole(R.haus, px + a, py + b)) for a, b in ((0, 0), (0.7, 0), (-0.7, 0), (0, 0.7), (0, -0.7))): continue
                di = strassen_info(px, py)
                if di is None: continue
                if di[0] < (float(di[2]["breite"]) if di[2].get("breite") else 5.0) / 2 + max(di[2].get("gl", 0), di[2].get("gr", 0)) + 0.8: continue
                if nah_linie(px, py, 0.9): continue
                if nah_tuer(px, py, 2.0) and not (abs(px - dE) < 0.1): pass
                if (px - dE) ** 2 + (py - dN) ** 2 < 2.5 * 2.5: continue
                if any((px - a) ** 2 + (py - b) ** 2 < 2.0 * 2.0 for a, b in tonnen_utm): continue
                if any((px - a) ** 2 + (py - b) ** 2 < 1.2 * 1.2 for a, b in lat_utm): continue
                besteller = (px, py); break
            if besteller: break
        if not besteller: continue
        px, py = besteller; tonnen_utm.append((px, py)); kx, ky = P.kachel(px, py)
        # Richtung vom Haus weg (Kachelraum): Haus → Straße
        hx, hy = P.kachel(dE + ux * 10, dN + uy * 10); hl = math.hypot(hx - dx_, hy - dy_) or 1e-9
        w = math.atan2((hy - dy_) / hl, (hx - dx_) / hl)
        reste = FARBEN[:]; farben = ["grau"]
        i = int(hsh(g["x"], g["y"], 23) * 3)
        while len(farben) < n: farben.append(reste.pop(i % len(reste))); i += 1
        tonnen.append({"x": round(float(kx) * 32, 1), "y": round(float(ky) * 32, 1), "w": round(w, 3), "f": farben, "r": hsh(g["x"], g["y"], 24) < 0.25, "g": [g["x"], g["y"]]})
    stat["muelltonnen_gruppen"] = len(tonnen); stat["muelltonnen"] = sum(len(t["f"]) for t in tonnen)

    # ---- schreiben ----
    k["zaeune"] = neue_zaeune; k["kacheln"] = "".join(kach); k["zaunart"] = "".join(za)
    k["baeumeLuftbild"] = baeume; k["baeumeLuftbildFenster"] = [[0, 0, B * 32, H * 32]]
    k["zebra"] = zebra; k["laternen"] = laternen; k["muelltonnen"] = tonnen
    k["amtlich"] = 1
    if QUELLE_ZUSATZ not in k["quelle"]: k["quelle"] += QUELLE_ZUSATZ
    k.pop("heckenLuftbild", None)
    pfad.write_text(json.dumps(k, ensure_ascii=False))
    print(json.dumps(stat, ensure_ascii=False, indent=1))

if __name__ == "__main__":
    main()

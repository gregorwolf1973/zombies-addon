#!/usr/bin/env python3
"""Rohantworten von Gemini (tools/luftbild_gemini.py lesen) prüfen und in Weltkoordinaten umrechnen.
Aufruf:  python3 tools/luftbild_auswerten.py <karte> auswerten        -> tools/luftbild/cache/auswertung_<karte>.json (alle Arten, geprüft)
         python3 tools/luftbild_auswerten.py <karte> probe <art> <n>  -> Stichprobenbilder (Rechtecke/Kreise eingezeichnet) in den Ordner PROBE
         python3 tools/luftbild_auswerten.py <karte> schreiben [art…]  -> Felder in die Karten-JSON (autosLuftbild, baeumeLuftbild, …)
Koordinaten: Fensterpixel (8 je Meter) + Fensterursprung (Meter) * 8 = Spielpixel (8 je Meter). Geprüft wird nach Größe, Fahrbahn, Gebäude, Kronen, Dubletten."""
import json, math, os, pathlib, re, subprocess, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kulisse as KU
import luftbild_gemini as LG
from PIL import Image, ImageDraw

KARTEN, CACHE, WURZEL = KU.KARTEN, KU.CACHE, KU.WURZEL
PROBE = pathlib.Path(os.environ.get("PROBE", "/tmp"))
SP = 8        # Spielpixel je Meter
RAND_M = 1.5  # Objekte, deren Mitte näher als 1,5 m am Fensterrand liegt, oder deren Kasten den Rand berührt, werden verworfen (Nachbarfenster überlappt 10 m)

def json_lesen(text):
    """erste JSON-Struktur (Liste oder Objekt) aus der Antwort; abgeschnittene Listen werden bis zum letzten vollständigen Eintrag gerettet"""
    if text.startswith("[Gemini"): text = text.split("\n", 1)[-1]   # Kopfzeile der Bridge
    m = re.search(r"[\[{]", text)
    if not m: return None
    s = text[m.start():]; e = max(s.rfind("}"), s.rfind("]"))
    s = s[:e + 1]
    try: return json.loads(s)
    except Exception: return None

def poly_in(px, py, p):
    d = False; n = len(p) // 2; j = n - 1
    for i in range(n):
        if (p[2 * i + 1] > py) != (p[2 * j + 1] > py) and px < (p[2 * j] - p[2 * i]) * (py - p[2 * i + 1]) / (p[2 * j + 1] - p[2 * i + 1]) + p[2 * i]: d = not d
        j = i
    return d

def segabst(px, py, ax, ay, bx, by):
    dx, dy = bx - ax, by - ay; l2 = dx * dx + dy * dy or 1e-9
    t = max(0, min(1, ((px - ax) * dx + (py - ay) * dy) / l2))
    return math.hypot(ax + t * dx - px, ay + t * dy - py)

class Welt:
    def __init__(self, karte):
        self.k = karte; self.B, self.H = karte["breite"], karte["hoehe"]
        self.geb = [g for g in karte["gebaeude"] if g.get("umriss") and len(g["umriss"]) >= 6]
        self.gbox = [(min(g["umriss"][0::2]), min(g["umriss"][1::2]), max(g["umriss"][0::2]), max(g["umriss"][1::2])) for g in self.geb]
        self.str = []   # (ax,ay,bx,by,halbbreite_m) in Kacheln
        for s in karte["strassen"]:
            if s["t"] not in KU.ART_BREITE or s["t"] == "service": continue
            hb = KU.fahrbahn_m(s) / 2
            p = s["p"]
            for i in range(0, len(p) - 3, 2): self.str.append((p[i], p[i + 1], p[i + 2], p[i + 3], hb))
        self.lb = karte["luftbild"]
    def im_gebaeude(self, tx, ty, rand=0.0):
        for g, (x0, y0, x1, y1) in zip(self.geb, self.gbox):
            if x0 - rand <= tx <= x1 + rand and y0 - rand <= ty <= y1 + rand and poly_in(tx, ty, g["umriss"]): return True
        return False
    def fahrbahnabstand(self, tx, ty):
        """kleinster Wert (Abstand zur Straßenachse − Halbbreite) in Metern; negativ = auf der Fahrbahn"""
        best = 1e9
        for ax, ay, bx, by, hb in self.str:
            if max(ax, bx) + 3 < tx or min(ax, bx) - 3 > tx or max(ay, by) + 3 < ty or min(ay, by) - 3 > ty: continue
            best = min(best, segabst(tx, ty, ax, ay, bx, by) * 4 - hb)
        return best
    def baum_kachel(self, tx, ty):
        x, y = int(tx), int(ty)
        return 0 <= x < self.B and 0 <= y < self.H and self.lb[y * self.B + x] == "1"

def fenster_laden(name):
    out = CACHE / f"gemini_{name}"; res = {}
    for pf in sorted(out.glob("*_*_*.json")):
        d = json.loads(pf.read_text()); k = (d["i"], d["j"])
        e = res.setdefault(k, {"i": d["i"], "j": d["j"], "x0": d["x0"], "y0": d["y0"], "bild": LG.BILDER / f"{d['i']}_{d['j']}.jpg", "autos": None, "rest": None})
        e[d["art"]] = json_lesen(d["antwort"])
    return list(res.values())

def dubletten(liste, nah):
    fest = []
    for a in liste:
        if any(abs(b["x"] - a["x"]) < nah(a, b) and abs(b["y"] - a["y"]) < nah(a, b) and math.hypot(b["x"] - a["x"], b["y"] - a["y"]) < nah(a, b) for b in fest): continue
        fest.append(a)
    return fest

def lange_achse(w, h, grad):
    if h > w: w, h = h, w; grad = grad + 90
    return w, h, grad % 180

def pca_winkel(bild, x0, y0, x1, y1):
    """Richtung der Längsachse (Grad 0..179, y nach unten) aus den Pixeln im Kasten, die vom Untergrund (Median am Kastenrand) abweichen; None wenn unklar"""
    X0, Y0, X1, Y1 = max(0, int(x0) - 2), max(0, int(y0) - 2), min(639, int(x1) + 2), min(639, int(y1) + 2)
    if X1 - X0 < 6 or Y1 - Y0 < 6: return None
    rand = [bild.getpixel((x, Y0)) for x in range(X0, X1 + 1)] + [bild.getpixel((x, Y1)) for x in range(X0, X1 + 1)] + \
           [bild.getpixel((X0, y)) for y in range(Y0, Y1 + 1)] + [bild.getpixel((X1, y)) for y in range(Y0, Y1 + 1)]
    bg = [sorted(p[c] for p in rand)[len(rand) // 2] for c in range(3)]
    n = sx = sy = 0; pts = []
    for y in range(Y0, Y1 + 1):
        for x in range(X0, X1 + 1):
            r, g, b = bild.getpixel((x, y))
            if (r - bg[0]) ** 2 + (g - bg[1]) ** 2 + (b - bg[2]) ** 2 > 45 * 45: pts.append((x, y)); n += 1; sx += x; sy += y
    if n < 0.2 * (X1 - X0) * (Y1 - Y0): return None
    mx, my = sx / n, sy / n
    m20 = sum((x - mx) ** 2 for x, y in pts) / n; m02 = sum((y - my) ** 2 for x, y in pts) / n; m11 = sum((x - mx) * (y - my) for x, y in pts) / n
    t = math.sqrt(((m20 - m02) / 2) ** 2 + m11 ** 2); l1, l2 = (m20 + m02) / 2 + t, (m20 + m02) / 2 - t
    if l2 <= 0 or l1 / l2 < 1.5: return None
    return math.degrees(0.5 * math.atan2(2 * m11, m20 - m02)) % 180

def box_px(b): return [v * 0.64 for v in b]   # [ymin, xmin, ymax, xmax] 0..1000 -> 640-px-Fenster

def auswerten(name):
    karte = json.loads((KARTEN / f"{name}.json").read_text()); W = Welt(karte); fl = fenster_laden(name)
    plaetze = json.loads(subprocess.run(["node", str(WURZEL / "tools" / "kulisse_plaetze.mjs"), name], capture_output=True, text=True, check=True).stdout)
    pl_raster = {}
    for p in plaetze: pl_raster.setdefault((int(p["x"] // 64), int(p["y"] // 64)), []).append(p)
    def nahe_platz(x, y, r=26):
        best = None
        for gx in range(int(x // 64) - 1, int(x // 64) + 2):
            for gy in range(int(y // 64) - 1, int(y // 64) + 2):
                for p in pl_raster.get((gx, gy), []):
                    dd = math.hypot(p["x"] - x, p["y"] - y)
                    if dd < r and (best is None or dd < best[0]): best = (dd, p)
        return best[1] if best else None
    def strassenwinkel(x, y, r=10):
        """Grad (0..179, y nach unten) der nächsten Straßenachse innerhalb r Metern, sonst None"""
        best = None
        for ax, ay, bx, by, hb in W.str:
            dd = segabst(x / 32, y / 32, ax, ay, bx, by) * 4
            if dd < r and (best is None or dd < best[0]): best = (dd, math.degrees(math.atan2(by - ay, bx - ax)) % 180)
        return best[1] if best else None
    R = {"autos": [], "baeume": [], "pools": [], "schuppen": [], "hecken": [], "belaege": []}; stat = {k: 0 for k in R}
    wx1, wy1 = karte["breite"] * 4, karte["hoehe"] * 4
    def innen(d, px, py):   # nicht im 4-m-Randstreifen zum Nachbarfenster (Nachbar überlappt 10 m); am Kartenrand erlaubt
        return (px > RAND_M * SP or d["x0"] <= 0) and (px < (LG.FENSTER_M - RAND_M) * SP or d["x0"] + LG.FENSTER_M >= wx1 - 0.5) and \
               (py > RAND_M * SP or d["y0"] <= 0) and (py < (LG.FENSTER_M - RAND_M) * SP or d["y0"] + LG.FENSTER_M >= wy1 - 0.5)
    def welt_px(d, px, py): return d["x0"] * SP + px, d["y0"] * SP + py
    def kasten_ok(d, x0, y0, x1, y1):   # Kasten berührt den Fensterrand nicht (dort abgeschnitten), außer am Kartenrand
        return (x0 > 3 or d["x0"] <= 0) and (y0 > 3 or d["y0"] <= 0) and (x1 < 637 or d["x0"] + LG.FENSTER_M >= wx1 - 0.5) and (y1 < 637 or d["y0"] + LG.FENSTER_M >= wy1 - 0.5)
    def winkel_diff(a, b): return abs((a - b + 90) % 180 - 90)
    for d in fl:
        bild = Image.open(d["bild"]).convert("RGB") if d["bild"].exists() else None
        for a in d["autos"] or []:
            stat["autos"] += 1
            try: y0, x0, y1, x1 = box_px(a["box_2d"])
            except Exception: continue
            w, h = x1 - x0, y1 - y0; cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
            L, Bb = max(w, h), min(w, h)
            diag = L / max(Bb, 1) < 1.5   # schräg stehendes Auto: der achsparallele Kasten ist fast quadratisch und größer als das Auto
            if not (26 <= L <= (68 if diag else 62) and 11 <= Bb <= (50 if diag else 34)) or not innen(d, cx, cy) or not kasten_ok(d, x0, y0, x1, y1): continue
            x, y = welt_px(d, cx, cy)
            if W.fahrbahnabstand(x / 32, y / 32) < -1.0 or W.im_gebaeude(x / 32, y / 32): continue
            if W.baum_kachel(x / 32, y / 32) and all(W.baum_kachel(x / 32 + dx, y / 32 + dy) for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))): continue
            # Richtung: Box deutlich länglich (>= 1,6) = Auto steht achsparallel; sonst Hauptachse der vom Untergrund abweichenden Pixel (PCA),
            # sonst Straßen-/Buchtrichtung. Danach an eine Parkbucht des Spiels einrasten, wenn sie weniger als 15 Grad abweicht.
            g = 0 if w >= h else 90; unsicher = L / max(Bb, 1) < 1.6
            if unsicher and bild:
                gp = pca_winkel(bild, x0, y0, x1, y1)
                if gp is not None: g = gp; unsicher = False
            pl = nahe_platz(x, y)
            if pl:
                gb = math.degrees(pl["winkel"]) % 180
                if winkel_diff(gb, g) < 15 or (unsicher and L / max(Bb, 1) < 1.3): g = gb; unsicher = False
            if unsicher:
                sw = strassenwinkel(x, y)
                if sw is not None: g = sw; unsicher = False
            achs = winkel_diff(g, 0 if w >= h else 90) < 1
            if unsicher: L, Bb = 36, 16   # unbekannte Schräglage: Normmaße statt Boxmaße
            elif achs: L, Bb = min(L, 48), min(Bb, 20)
            else: L, Bb = 38, 17
            farbe = None
            if bild:
                px = []; c, s = math.cos(math.radians(g)), math.sin(math.radians(g))
                for u in range(-10, 11, 4):
                    for v in range(-3, 4, 3):
                        xi, yi = int(cx + c * u - s * v), int(cy + s * u + c * v)
                        if 0 <= xi < 640 and 0 <= yi < 640: px.append(bild.getpixel((xi, yi)))
                px.sort(key=sum); farbe = px[len(px) // 2] if px else None
            R["autos"].append({"x": x, "y": y, "g": g, "L": L, "B": Bb, "rgb": farbe, "f": a.get("farbe"), "platz": bool(pl)})
        rest = d["rest"] if isinstance(d["rest"], dict) else {}
        for a in rest.get("baeume") or []:
            stat["baeume"] += 1
            try: y0, x0, y1, x1 = box_px(a["box_2d"])
            except Exception: continue
            w, h = x1 - x0, y1 - y0; cx, cy = (x0 + x1) / 2, (y0 + y1) / 2; dm = (w + h) / 2
            if not (16 <= dm <= 170) or max(w, h) / max(1, min(w, h)) > 1.8 or not innen(d, cx, cy) or not kasten_ok(d, x0, y0, x1, y1): continue
            x, y = welt_px(d, cx, cy)
            if W.im_gebaeude(x / 32, y / 32) or W.fahrbahnabstand(x / 32, y / 32) < -1.0: continue
            R["baeume"].append({"x": x, "y": y, "d": dm / SP, "art": "nadel" if a.get("art") == "nadel" else "laub"})
        for key in ("pools", "schuppen"):
            for a in rest.get(key) or []:
                stat[key] += 1
                try: y0, x0, y1, x1 = box_px(a["box_2d"])
                except Exception: continue
                w, h = x1 - x0, y1 - y0; cx, cy = (x0 + x1) / 2, (y0 + y1) / 2; m2 = w * h / (SP * SP)
                lo, hi = (4, 120) if key == "pools" else (6, 70)
                if not (lo <= m2 <= hi) or not innen(d, cx, cy) or not kasten_ok(d, x0, y0, x1, y1): continue
                x, y = welt_px(d, cx, cy)
                if W.im_gebaeude(x / 32, y / 32, 0.3 if key == "schuppen" else 0) or W.fahrbahnabstand(x / 32, y / 32) < 0: continue
                p = [welt_px(d, px, py) for px, py in ((x0, y0), (x1, y0), (x1, y1), (x0, y1))]
                R[key].append({"x": x, "y": y, "p": [round(v, 1) for pt in p for v in pt], "m2": round(m2, 1)})
        for a in rest.get("hecken") or []:
            stat["hecken"] += 1
            try: pts = [(float(q[1]) * 0.64, float(q[0]) * 0.64) for q in a]
            except Exception: continue
            if len(pts) < 2: continue
            lang = sum(math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]) for i in range(len(pts) - 1)) / SP
            if not (8 <= lang <= 120) or not all(innen(d, x, y) for x, y in pts): continue
            wp = [welt_px(d, x, y) for x, y in pts]
            if any(W.im_gebaeude(x / 32, y / 32) or W.fahrbahnabstand(x / 32, y / 32) < 0 for x, y in wp): continue
            R["hecken"].append({"p": [round(v, 1) for pt in wp for v in pt], "br": 1.2})
        for a in rest.get("belaege") or []:
            stat["belaege"] += 1
            try: pts = [(float(q[1]) * 0.64, float(q[0]) * 0.64) for q in a]
            except Exception: continue
            if len(pts) < 3: continue
            xs, ys = [q[0] for q in pts], [q[1] for q in pts]
            m2 = abs(sum(xs[i] * ys[(i + 1) % len(xs)] - xs[(i + 1) % len(xs)] * ys[i] for i in range(len(xs)))) / 2 / (SP * SP)
            if not (12 <= m2 <= 600) or not all(innen(d, x, y) for x, y in pts): continue
            wp = [welt_px(d, x, y) for x, y in pts]
            cxm, cym = sum(a for a, _ in wp) / len(wp), sum(b for _, b in wp) / len(wp)
            if W.im_gebaeude(cxm / 32, cym / 32) or W.fahrbahnabstand(cxm / 32, cym / 32) < -0.5: continue
            R["belaege"].append({"p": [round(v, 1) for pt in wp for v in pt], "m2": round(m2, 1)})
    # Dubletten aus den Überlappungen der Fenster
    R["autos"] = dubletten(sorted(R["autos"], key=lambda a: (a["y"], a["x"])), lambda a, b: 14)
    R["baeume"] = dubletten(sorted(R["baeume"], key=lambda a: -a["d"]), lambda a, b: max(6, 0.3 * min(a["d"], b["d"]) * SP))
    R["schuppen"] = dubletten(sorted(R["schuppen"], key=lambda a: (a["y"], a["x"])), lambda a, b: 16)
    def mitte(o): return (sum(o["p"][0::2]) / (len(o["p"]) // 2), sum(o["p"][1::2]) / (len(o["p"]) // 2))
    for key in ("pools", "belaege", "hecken"):
        fest = []
        for o in sorted(R[key], key=lambda o: mitte(o)):
            m = mitte(o)
            if any(math.hypot(mitte(b)[0] - m[0], mitte(b)[1] - m[1]) < 20 for b in fest): continue
            fest.append(o)
        R[key] = fest
    (CACHE / f"auswertung_{name}.json").write_text(json.dumps(R))
    print("Fenster", len(fl), {k: f"{stat[k]} roh -> {len(R[k])}" for k in R})
    return R

FARBWORT = {"weiss": 2, "weiß": 2, "schwarz": 4, "grau": 7, "silber": 7, "rot": 0, "blau": 1, "gruen": 3, "grün": 3, "gelb": 5, "braun": 6}   # Spiel-Farbindex wie AUTO_FARBEN
def farbe_index(a):
    """Farbwort von Gemini → Spiel-Farbindex; ohne/unbekannt Median-Farbe des Fotos (Sonnenlicht verfälscht sie oft Richtung Gelb)"""
    w = str(a.get("f") or "").lower()
    if w in FARBWORT: return FARBWORT[w]
    rgb = a.get("rgb")
    return KU.auto_farbe(rgb) if rgb else 2

def probe(name, art, n):
    R = json.loads((CACHE / f"auswertung_{name}.json").read_text()); fl = fenster_laden(name)
    karte = json.loads((KARTEN / f"{name}.json").read_text())
    def zaehle(d): return sum(1 for o in R[art] if d["x0"] * SP <= o.get("x", o["p"][0] if "p" in o else 0) < (d["x0"] + 80) * SP and d["y0"] * SP <= o.get("y", o["p"][1] if "p" in o else 0) < (d["y0"] + 80) * SP)
    wahl = sorted([d for d in fl if d["autos"] or d["rest"]], key=lambda d: -zaehle(d))
    # gleichmäßig aus der Liste ziehen (jede k-te), nicht nur die dichtesten
    ids = [wahl[int(i * len(wahl) / n)] for i in range(n)] if len(wahl) >= n else wahl
    for k, d in enumerate(ids):
        bild = Image.open(d["bild"]).convert("RGB"); dr = ImageDraw.Draw(bild)
        for o in R[art]:
            if art == "autos":
                px, py = o["x"] - d["x0"] * SP, o["y"] - d["y0"] * SP
                if not (0 <= px < 640 and 0 <= py < 640): continue
                c, s = math.cos(math.radians(o["g"])), math.sin(math.radians(o["g"])); hl, hb = o["L"] / 2, o["B"] / 2
                dr.polygon([(px + c * a - s * b, py + s * a + c * b) for a, b in ((-hl, -hb), (hl, -hb), (hl, hb), (-hl, hb))], outline=(255, 0, 255), width=2)
            elif art == "baeume":
                px, py = o["x"] - d["x0"] * SP, o["y"] - d["y0"] * SP; r = o["d"] * SP / 2
                if -r <= px < 640 + r and -r <= py < 640 + r: dr.ellipse([px - r, py - r, px + r, py + r], outline=(255, 255, 0) if o["art"] == "laub" else (0, 255, 255), width=2)
            else:
                pts = [(o["p"][i] - d["x0"] * SP, o["p"][i + 1] - d["y0"] * SP) for i in range(0, len(o["p"]), 2)]
                if art == "hecken": dr.line(pts, fill=(255, 0, 255), width=3)
                elif any(0 <= x < 640 and 0 <= y < 640 for x, y in pts): dr.polygon(pts, outline=(255, 0, 255))
        pf = PROBE / f"gemini_{art}_{k + 1}.png"; bild.save(pf); print(pf, d["i"], d["j"])

def schreiben(name, arten):
    pfad = KARTEN / f"{name}.json"; karte = json.loads(pfad.read_text()); R = json.loads((CACHE / f"auswertung_{name}.json").read_text())
    r64 = lambda v: round(v * 64) / 64
    # Weltpixel der Karte: 32 je Kachel, 8 je Meter – dieselben Einheiten wie die Fensterumrechnung
    if "autos" in arten:
        karte["autosLuftbild"] = [{"x": r64(a["x"]), "y": r64(a["y"]), "winkel": round(math.radians(a["g"] if a["g"] <= 90 else a["g"] - 180), 4), "farbe": farbe_index(a)}
                                  for a in sorted(R["autos"], key=lambda a: (a["y"], a["x"]))]
    if "baeume" in arten:
        karte["baeumeLuftbild"] = [{"x": r64(a["x"]), "y": r64(a["y"]), "d": round(a["d"], 1), "art": a["art"]} for a in sorted(R["baeume"], key=lambda a: (a["y"], a["x"]))]
    if "pools" in arten: karte["poolsLuftbild"] = [{"p": [r64(v) for v in o["p"]]} for o in R["pools"]]
    if "belaege" in arten: karte["belaegeLuftbild"] = [{"p": [r64(v) for v in o["p"]]} for o in R["belaege"]]
    if "hecken" in arten: karte["heckenLuftbild"] = [{"p": [r64(v) for v in o["p"]], "b": round(o["br"], 1)} for o in R["hecken"]]
    if "schuppen" in arten:
        def ecken(o):
            c, sn = math.cos(math.radians(o["g"])), math.sin(math.radians(o["g"])); hl, hb = o["L"] / 2, o["B"] / 2
            return [r64(v) for a, b in ((-hl, -hb), (hl, -hb), (hl, hb), (-hl, hb)) for v in (o["x"] + c * a - sn * b, o["y"] + sn * a + c * b)]
        karte["schuppenLuftbild"] = [{"p": ecken(o)} for o in R["schuppen"]]
    # gelesene Gebiete (Spielpixel): nur dort ersetzen die erkannten Autos/Bäume die bisherigen (zufällige Autos, Kachel-Klassifikation)
    fl = fenster_laden(name); rechteck = lambda d: [round(d["x0"] * SP), round(d["y0"] * SP), round((d["x0"] + LG.FENSTER_M) * SP), round((d["y0"] + LG.FENSTER_M) * SP)]
    if "autos" in arten: karte["autosLuftbildFenster"] = [rechteck(d) for d in fl if isinstance(d["autos"], list)]
    if "baeume" in arten: karte["baeumeLuftbildFenster"] = [rechteck(d) for d in fl if isinstance(d["rest"], dict)]
    pfad.write_text(json.dumps(karte, ensure_ascii=False))
    print("geschrieben:", {a: len(karte.get(a + "Luftbild", [])) for a in ("autos", "baeume", "pools", "belaege", "hecken", "schuppen")})

if __name__ == "__main__":
    name, was = sys.argv[1], sys.argv[2]
    if was == "auswerten": auswerten(name)
    elif was == "probe": probe(name, sys.argv[3], int(sys.argv[4]))
    elif was == "schreiben": schreiben(name, sys.argv[3:] or ["autos"])

#!/usr/bin/env python3
"""Hausumringe (amtliche Gebäudegrundrisse) als Gebäudeumrisse einer Spielkarte – nur Python-Standardbibliothek.
Quelle: Bayerische Vermessungsverwaltung, Hausumringe Oberbayern (ALKIS, CC BY 4.0, https://geodaten.bayern.de/opengeodata/),
dieselbe Quelle und derselbe Stand wie das 3D-Gebäudemodell LoD2: Dachflächen und Umringe passen daher genau aufeinander.
Aufruf: python3 tools/hausumringe.py <karte> [auszug.json]
  <karte>      Name der Karte unter zombies/client/karten (z. B. geretsried2); bbox und Raster stammen aus ihrer JSON
  auszug.json  Auszug der Hausumringe (UTM32 / EPSG:25832) als [{"attr":{…},"ringe":[[[E,N],…],…]},…];
               Vorgabe: tools/luftbild/cache/bayern/hausumringe/hausumringe_gebiet.json
Ergebnis: tools/osm/hausumringe_<karte>.json = {"quelle", "bbox", "meterProKachel", "haeuser": [{"u": [x, y, …], "m2": Fläche in m²}]}
  u in Kachelkoordinaten (y nach Süden, 2 Nachkommastellen = 4 cm), auf die Karte zugeschnitten, mit Douglas-Peucker (0,25 m) vereinfacht;
  Umringe unter 6 m² fallen weg; Häuser mit gemeinsamer Wand (40–160 m², Reihen-/Doppelhäuser) werden zu einem Umriss vereinigt (--ohne-reihen: nicht). Der Kartenbau (tools/osm_karte.py … --hausumringe=<Datei>) macht daraus die Gebäude der Karte
  und überträgt die OSM-Angaben (Name, Art, Adresse) per Flächenüberlappung; kleine Bauten (unter 4 Rasterkacheln) bleiben
  Nebengebäude (tools/nebengebaeude.py, aus LoD2) und werden keine betretbaren Häuser."""
import json, math, pathlib, sys

WURZEL = pathlib.Path(__file__).resolve().parent.parent
KARTEN = WURZEL / "zombies" / "client" / "karten"
STANDARD = pathlib.Path(__file__).resolve().parent / "luftbild" / "cache" / "bayern" / "hausumringe" / "hausumringe_gebiet.json"
QUELLE = "© Bayerische Vermessungsverwaltung, Hausumringe (CC BY 4.0)"
EPS_M = 0.25        # Douglas-Peucker-Toleranz
MIN_M2 = 6.0        # kleinere Umringe fallen weg

def utm32(lat, lon):
    """WGS84 → UTM32N (EPSG:25832), dieselbe Formel wie tools/kulisse.py"""
    a = 6378137.0; f = 1 / 298.257222101; k0 = 0.9996; e2 = f * (2 - f); ep2 = e2 / (1 - e2)
    phi = math.radians(lat); lam = math.radians(lon - 9)
    N = a / math.sqrt(1 - e2 * math.sin(phi) ** 2); T = math.tan(phi) ** 2; C = ep2 * math.cos(phi) ** 2; A = lam * math.cos(phi)
    e4 = e2 * e2; e6 = e4 * e2
    M = a * ((1 - e2 / 4 - 3 * e4 / 64 - 5 * e6 / 256) * phi - (3 * e2 / 8 + 3 * e4 / 32 + 45 * e6 / 1024) * math.sin(2 * phi)
             + (15 * e4 / 256 + 45 * e6 / 1024) * math.sin(4 * phi) - (35 * e6 / 3072) * math.sin(6 * phi))
    x = k0 * N * (A + (1 - T + C) * A ** 3 / 6 + (5 - 18 * T + T * T + 72 * C - 58 * ep2) * A ** 5 / 120) + 500000
    y = k0 * (M + N * math.tan(phi) * (A * A / 2 + (5 - T + 9 * C + 4 * C * C) * A ** 4 / 24 + (61 - 58 * T + T * T + 600 * C - 330 * ep2) * A ** 6 / 720))
    return x, y

def umkehrung(karte):
    """UTM → Kachelkoordinaten (affin aus drei Stützpunkten, über wenige km praktisch exakt; Projektion der Karte wie tools/osm_karte.py)"""
    sued, west, nord, ost = karte["bbox"]; mpk = karte["meterProKachel"]; mlat = (sued + nord) / 2
    lon = lambda tx: west + tx * mpk / (111320 * math.cos(math.radians(mlat)))
    lat = lambda ty: nord - ty * mpk / 110540
    B, H = karte["breite"], karte["hoehe"]
    q = [(0, 0), (B, 0), (0, H)]; u = [utm32(lat(y), lon(x)) for x, y in q]
    (e0, n0), (e1, n1), (e2, n2) = u
    det = (e1 - e0) * (n2 - n0) - (e2 - e0) * (n1 - n0)
    def lose(v0, v1, v2):
        a = ((v1 - v0) * (n2 - n0) - (v2 - v0) * (n1 - n0)) / det
        b = ((e1 - e0) * (v2 - v0) - (e2 - e0) * (v1 - v0)) / det
        return a, b, v0 - a * e0 - b * n0
    ax, bx, cx = lose(0, B, 0); ay, by, cy = lose(0, 0, H)
    return lambda E, N: (ax * E + bx * N + cx, ay * E + by * N + cy)

def flaeche(p):
    """Fläche eines Rings [(x, y), …] (Betrag)"""
    return abs(sum(p[i][0] * p[(i + 1) % len(p)][1] - p[(i + 1) % len(p)][0] * p[i][1] for i in range(len(p)))) / 2

def zuschneiden(ring, B, H):
    """Sutherland-Hodgman gegen das Rechteck [0,B]×[0,H] (konvexes Fenster: für beliebige Ringe richtig, bei Nicht-Konvexität höchstens Randstege)"""
    def beschneide(pts, drin, schnitt):
        aus = []
        for i, p in enumerate(pts):
            q = pts[i - 1]
            if drin(p):
                if not drin(q): aus.append(schnitt(q, p))
                aus.append(p)
            elif drin(q): aus.append(schnitt(q, p))
        return aus
    def sx(c): return lambda q, p: (c, q[1] + (p[1] - q[1]) * (c - q[0]) / (p[0] - q[0]))
    def sy(c): return lambda q, p: (q[0] + (p[0] - q[0]) * (c - q[1]) / (p[1] - q[1]), c)
    for drin, sch in ((lambda p: p[0] >= 0, sx(0)), (lambda p: p[0] <= B, sx(B)), (lambda p: p[1] >= 0, sy(0)), (lambda p: p[1] <= H, sy(H))):
        if not ring: break
        ring = beschneide(ring, drin, sch)
    return ring

def abstand_strecke(p, a, b):
    dx, dy = b[0] - a[0], b[1] - a[1]; l2 = dx * dx + dy * dy
    if l2 < 1e-12: return math.hypot(p[0] - a[0], p[1] - a[1])
    t = max(0.0, min(1.0, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2))
    return math.hypot(a[0] + t * dx - p[0], a[1] + t * dy - p[1])

def dp(pts, eps):
    """Douglas-Peucker für eine offene Linie (iterativ, keine Rekursionsgrenze)"""
    if len(pts) < 3: return list(pts)
    behalten = [False] * len(pts); behalten[0] = behalten[-1] = True; stapel = [(0, len(pts) - 1)]
    while stapel:
        i0, i1 = stapel.pop(); best, bi = -1.0, -1
        for i in range(i0 + 1, i1):
            d = abstand_strecke(pts[i], pts[i0], pts[i1])
            if d > best: best, bi = d, i
        if best > eps: behalten[bi] = True; stapel += [(i0, bi), (bi, i1)]
    return [p for p, k in zip(pts, behalten) if k]

def vereinfachen(ring, eps):
    """geschlossenen Ring vereinfachen: am weitesten voneinander entfernte Punkte als feste Anker, dann je Hälfte Douglas-Peucker"""
    if len(ring) > 1 and ring[0] == ring[-1]: ring = ring[:-1]
    if len(ring) < 4: return ring
    a = 0; b = max(range(len(ring)), key=lambda i: math.hypot(ring[i][0] - ring[a][0], ring[i][1] - ring[a][1]))
    h1 = ring[a:b + 1]; h2 = ring[b:] + ring[:a + 1]
    r = dp(h1, eps)[:-1] + dp(h2, eps)[:-1]
    # fast gerade Ecken (Abstand zur Linie der Nachbarn < eps/2) entfernen ist schon durch dp erledigt; doppelte Punkte raus
    aus = []
    for p in r:
        if not aus or math.hypot(p[0] - aus[-1][0], p[1] - aus[-1][1]) > 1e-6: aus.append(p)
    return aus

# ---------- Reihenhäuser zusammenfassen ----------
# Das Kartenraster ist grob (Kachel = 4 m): ein einzelnes Reihen- oder Doppelhaus (50–100 m²) hat darin kaum eine Innenkachel und wäre kein
# betretbares Haus. OSM zeichnet solche Reihen meist als ein Gebäude. Deshalb werden Häuser mit gemeinsamer Wand (mindestens 2 m) zu einem Umriss
# vereinigt (die Trennwände entfallen, die Außenwand bleibt der amtliche Umring). Die Dächer bleiben je Haus (LoD2) und passen unverändert.
MERGE_MIN_M2, MERGE_MAX_M2, MERGE_GRUPPE_M2, MERGE_GRUPPE_N, MERGE_WAND_M = 40.0, 160.0, 900.0, 10, 2.0
TOL = 0.08          # Kachelanteil: Toleranz für „gleicher Punkt“ / „Punkt liegt auf der Kante“ (0,3 m, größer als die Vereinfachung)

def orientiert(ring):
    """gegen den Uhrzeigersinn (in Kachelkoordinaten mit y nach unten: positive Gaußsche Fläche)"""
    a = sum(ring[i][0] * ring[(i + 1) % len(ring)][1] - ring[(i + 1) % len(ring)][0] * ring[i][1] for i in range(len(ring)))
    return ring if a > 0 else ring[::-1]

def gemeinsame_wand(a, b):
    """Länge (Kacheln), auf der Kanten von a und b gegenläufig und fast deckungsgleich verlaufen"""
    summe = 0.0
    for i in range(len(a)):
        p, q = a[i], a[(i + 1) % len(a)]; dx, dy = q[0] - p[0], q[1] - p[1]; L = math.hypot(dx, dy)
        if L < 0.2: continue
        ux, uy = dx / L, dy / L
        for j in range(len(b)):
            r, t = b[j], b[(j + 1) % len(b)]; ex, ey = t[0] - r[0], t[1] - r[1]; M = math.hypot(ex, ey)
            if M < 0.2 or abs(ux * ey - uy * ex) / M > 0.05 or ux * ex + uy * ey > 0: continue     # nicht parallel / nicht gegenläufig
            if abs((r[0] - p[0]) * uy - (r[1] - p[1]) * ux) > TOL or abs((t[0] - p[0]) * uy - (t[1] - p[1]) * ux) > TOL: continue
            s0, s1 = (r[0] - p[0]) * ux + (r[1] - p[1]) * uy, (t[0] - p[0]) * ux + (t[1] - p[1]) * uy
            lo, hi = max(0.0, min(s0, s1)), min(L, max(s0, s1))
            if hi > lo: summe += hi - lo
    return summe

def vereinigen(ringe):
    """Vereinigung von Ringen mit gemeinsamen Wänden: Punkte zusammenziehen, Kanten an fremden Punkten teilen, gegenläufige Kanten streichen,
    den größten verbleibenden Umlauf nehmen. None, wenn es nicht sauber aufgeht (dann bleiben die Häuser getrennt)."""
    rep = []
    def punkt(p):
        for r in rep:
            if abs(r[0] - p[0]) <= TOL and abs(r[1] - p[1]) <= TOL: return r
        rep.append(p); return p
    rr = [[punkt(p) for p in orientiert(r)] for r in ringe]
    kanten = {}
    for ring in rr:
        for i in range(len(ring)):
            p, q = ring[i], ring[(i + 1) % len(ring)]
            if p == q: continue
            dx, dy = q[0] - p[0], q[1] - p[1]; L2 = dx * dx + dy * dy; teile = []
            for w in rep:
                if w == p or w == q: continue
                t = ((w[0] - p[0]) * dx + (w[1] - p[1]) * dy) / L2
                if 0 < t < 1 and abs((w[0] - p[0]) * dy - (w[1] - p[1]) * dx) / math.sqrt(L2) <= TOL: teile.append((t, w))
            kette = [p] + [w for _, w in sorted(teile)] + [q]
            for a, b in zip(kette, kette[1:]): kanten[(a, b)] = kanten.get((a, b), 0) + 1
    rest = []
    for (a, b), n in kanten.items():
        m = kanten.get((b, a), 0)
        rest += [(a, b)] * max(0, n - m)
    weiter = {}
    for a, b in rest:
        if a in weiter: return None            # Verzweigung (Berührung nur in einem Punkt o. ä.)
        weiter[a] = b
    umlaeufe = []; gesehen = set()
    for start in list(weiter):
        if start in gesehen: continue
        lauf = [start]; gesehen.add(start); p = weiter[start]
        while p != start:
            if p in gesehen or p not in weiter: return None
            lauf.append(p); gesehen.add(p); p = weiter[p]
        umlaeufe.append(lauf)
    if not umlaeufe: return None
    lauf = max(umlaeufe, key=flaeche)
    # fast gerade Punkte entfernen
    aus = []
    for i, p in enumerate(lauf):
        a, b = lauf[i - 1], lauf[(i + 1) % len(lauf)]; dx, dy = b[0] - a[0], b[1] - a[1]; L = math.hypot(dx, dy) or 1e-9
        if abs((p[0] - a[0]) * dy - (p[1] - a[1]) * dx) / L > 0.03: aus.append(p)
    return aus if len(aus) >= 3 else None

def reihenhaeuser(ringe, mpk):
    """fasst Häuser mit gemeinsamer Wand zusammen; Rückgabe (neue Ringe, Anzahl vereinigter Gruppen, Häuser darin, Fehlschläge)"""
    m2k = mpk * mpk; n = len(ringe); fl = [flaeche(r) * m2k for r in ringe]
    kand = [i for i in range(n) if MERGE_MIN_M2 <= fl[i] <= MERGE_MAX_M2]
    gitter = {}
    for i in kand:
        xs, ys = [p[0] for p in ringe[i]], [p[1] for p in ringe[i]]
        for gx in range(int(min(xs)) - 1, int(max(xs)) + 2):
            for gy in range(int(min(ys)) - 1, int(max(ys)) + 2): gitter.setdefault((gx, gy), []).append(i)
    elter = list(range(n))
    def wurzel(i):
        while elter[i] != i: elter[i] = elter[elter[i]]; i = elter[i]
        return i
    for lst in gitter.values():
        for ia in range(len(lst)):
            for ib in range(ia + 1, len(lst)):
                a, b = lst[ia], lst[ib]
                if wurzel(a) == wurzel(b): continue
                if gemeinsame_wand(ringe[a], ringe[b]) * mpk >= MERGE_WAND_M: elter[wurzel(a)] = wurzel(b)
    gruppen = {}
    for i in kand: gruppen.setdefault(wurzel(i), []).append(i)
    neu, benutzt, gz, gh, fehl = [], set(), 0, 0, 0
    for g in gruppen.values():
        if len(g) < 2: continue
        if len(g) > MERGE_GRUPPE_N or sum(fl[i] for i in g) > MERGE_GRUPPE_M2: fehl += 1; continue
        u = vereinigen([ringe[i] for i in sorted(g)])
        if u is None or abs(flaeche(u) * m2k - sum(fl[i] for i in g)) > 0.08 * sum(fl[i] for i in g): fehl += 1; continue
        neu.append(u); benutzt.update(g); gz += 1; gh += len(g)
    return [r for i, r in enumerate(ringe) if i not in benutzt] + neu, gz, gh, fehl

def main():
    name = sys.argv[1]; quelle = pathlib.Path(sys.argv[2]) if len(sys.argv) > 2 else STANDARD
    karte = json.loads((KARTEN / f"{name}.json").read_text()); mpk = karte["meterProKachel"]
    B, H = karte["breite"], karte["hoehe"]; zu = umkehrung(karte)
    roh = json.loads(quelle.read_text()); m2k = mpk * mpk
    ringe = []; stat = {"roh": len(roh), "ausserhalb": 0, "zu_klein": 0, "entartet": 0}
    for obj in roh:
        ring = [zu(E, N) for E, N in obj["ringe"][0]]            # äußerer Ring (Löcher, Innenhöfe, bleiben zugebaut)
        if ring[0] == ring[-1]: ring = ring[:-1]
        if len(ring) < 3: stat["entartet"] += 1; continue
        xs, ys = [p[0] for p in ring], [p[1] for p in ring]
        if max(xs) < 0 or min(xs) > B or max(ys) < 0 or min(ys) > H: stat["ausserhalb"] += 1; continue
        ring = zuschneiden(ring, B, H)
        if len(ring) < 3: stat["ausserhalb"] += 1; continue
        ring = vereinfachen(ring, EPS_M / mpk)
        if len(ring) < 3: stat["entartet"] += 1; continue
        m2 = flaeche(ring) * m2k
        if m2 < MIN_M2: stat["zu_klein"] += 1; continue
        ringe.append([(round(x, 2), round(y, 2)) for x, y in ring])
    vor = len(ringe); gz = gh = fehl = 0
    if "--ohne-reihen" not in sys.argv: ringe, gz, gh, fehl = reihenhaeuser(ringe, mpk)
    haeuser = [{"u": [v for p in r for v in p], "m2": round(flaeche(r) * m2k, 1)} for r in ringe]
    haeuser.sort(key=lambda h: (min(h["u"][1::2]), min(h["u"][0::2])))     # feste Reihenfolge (Kartenbau und Zufall hängen daran)
    ziel = pathlib.Path(__file__).resolve().parent / "osm" / f"hausumringe_{name}.json"
    ziel.write_text(json.dumps({"quelle": QUELLE, "bbox": karte["bbox"], "meterProKachel": mpk, "haeuser": haeuser}, separators=(",", ":")))
    punkte = sum(len(h["u"]) // 2 for h in haeuser)
    print(f"{stat['roh']} Umringe im Auszug → {len(haeuser)} auf der Karte ({stat['ausserhalb']} außerhalb, {stat['zu_klein']} unter {MIN_M2:g} m², {stat['entartet']} entartet), "
          f"{punkte} Punkte, {ziel.stat().st_size // 1024} KB → {ziel}")
    print(f"Reihenhäuser: {gh} Häuser zu {gz} Umrissen vereinigt ({fehl} Gruppen nicht sauber/zu groß, getrennt geblieben); vorher {vor} Umringe")

if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Gesamtkette: eine Spielkarte aus amtlichen Daten (wie geretsried2) neu bauen.
Aufruf: python3 tools/karte_bauen.py <karte> [--nur a,b,…] [--von schritt] [--bis schritt] [--neu-anlegen] [--ohne-laden] [--liste]
        (Kurzform: tools/karte_bauen.sh <karte> …)
Die Karte steht in tools/karten_gebiete.json (bbox, Fenster, Ordner; siehe tools/gebiet.py). Alle Schritte laufen mit KARTE=<karte>.
Reihenfolge (jeder Schritt = ein Werkzeug; Ergebnis steht in zombies/client/karten/<karte>.json bzw. kulisse/<karte>/):
  laden        bayern_laden.py      Rohdaten (DGM1, DOM20, DOP20 RGB/CIR, Parzellarkarte, Basis-DLM, Hausumringe-/Baum-Auszug, OSM-Überwege)
  hausumringe  hausumringe.py       amtliche Hausumringe -> tools/osm/hausumringe_<karte>.json
  osm          osm_karte.py         Karte (Kacheln, Straßen, Flächen, Gebäude aus Hausumringen, OSM-Angaben); Rohdaten tools/osm/roh_*.json (Overpass, falls nicht vorhanden)
  luftbild     luftbild.py          Luftbild-Klassen, Dachfarben je Gebäude, Navi-Bild (<karte>_luftbild.webp)
  neben        nebengebaeude.py     Nebengebäude aus LoD2
  kulisse      kulisse.py           Luftbild-Bodenkacheln + Dachflächen (daecher.json)
  a0 … a8      a0_mosaik.py … a8_grenzen.py   Auswertung der 20-cm-Rasterdaten (Raster, Masken, Parzellen, Hecken, Bäume, Straßenbreiten, Zebra, Mauern, Grenzen)
  boden        boden.py             gezeichneter Boden (kulisse/<karte>/boden)
  amtlich      amtlich.py           Hecken/Zäune, Einzelbäume, Straßenbreiten, Gehwege, Zebra, Laternen, Mülltonnen in die Karte (zuletzt: osm_karte verwirft diese Felder)
--neu-anlegen: vorhandene Karten-JSON vorher als <karte>_alt.json sichern (nur wenn diese noch nicht existiert) und neu beginnen
               (sonst übernimmt osm_karte.py bei Hausumringen alle Felder der alten Datei, die es nicht selbst setzt).
Umgebung: AUSW_DIR leitet die Auswertung um (Vergleichsläufe), OVERPASS_URL anderer Overpass-Server.
Danach von Hand: Level-Orte prüfen (zombies/client/karten/LEVELORTE.md), WELT_VERSION erhöhen, tools/fp_vergleich.mjs, Tests."""
import json, os, pathlib, shutil, subprocess, sys, time

HIER = pathlib.Path(__file__).resolve().parent
WURZEL = HIER.parent
KARTEN = WURZEL / "zombies" / "client" / "karten"
sys.path.insert(0, str(HIER))
import gebiet as G

SCHRITTE = ["laden", "hausumringe", "osm", "luftbild", "neben", "kulisse", "a0", "a1", "a2", "a3", "a4", "a5", "a6", "a7", "a8", "boden", "amtlich"]
A = {"a0": "a0_mosaik.py", "a1": "a1_masken.py", "a2": "a2_parzellen.py", "a3": "a3_hecken.py", "a4": "a4_baeume.py", "a5": "a5_strassenbreite.py", "a6": "a6_zebra.py", "a7": "a7_mauern_zaeune.py", "a8": "a8_grenzen.py"}

def lauf(env, *cmd):
    print("\n$", " ".join(str(c) for c in cmd), flush=True)
    t = time.time(); r = subprocess.run([sys.executable, *map(str, cmd)], cwd=WURZEL, env=env)
    if r.returncode: raise SystemExit(f"Schritt fehlgeschlagen ({r.returncode}): {' '.join(str(c) for c in cmd)}")
    print(f"   ({time.time() - t:.0f} s)", flush=True)

def main():
    args = sys.argv[1:]
    if not args or args[0].startswith("-"): print(__doc__); return
    name = args[0]; g = G.Gebiet(name)
    def opt(n): return args[args.index(n) + 1] if n in args else None
    if "--liste" in args: print(" ".join(SCHRITTE)); return
    schritte = opt("--nur").split(",") if opt("--nur") else SCHRITTE[SCHRITTE.index(opt("--von") or SCHRITTE[0]):SCHRITTE.index(opt("--bis") or SCHRITTE[-1]) + 1]
    if "--ohne-laden" in args and "laden" in schritte: schritte.remove("laden")
    env = dict(os.environ, KARTE=name, PYTHONPATH=os.pathsep.join(filter(None, [str(HIER / ".pylib"), os.path.expanduser("~/code/ahnen-werkzeuge/pil"), os.environ.get("PYTHONPATH", "")])))
    pfad = KARTEN / f"{name}.json"
    s, w, n, o = g.bbox; fluss = getattr(g, "osm_fluss", None)
    t0 = time.time()
    if "--neu-anlegen" in args and pfad.exists() and "osm" in schritte:
        alt = KARTEN / f"{name}_alt.json"
        if not alt.exists(): shutil.copy(pfad, alt); print("gesichert:", alt.name)
        pfad.unlink()
    for st in schritte:
        print(f"\n===== {st} ({name}) =====", flush=True)
        if st == "laden": lauf(env, "tools/bayern_laden.py", name)
        elif st == "hausumringe": lauf(env, "tools/hausumringe.py", name)
        elif st == "osm":
            cmd = ["tools/osm_karte.py", s, w, n, o, g.meterProKachel, f"zombies/client/karten/{name}.json", f"--hausumringe=tools/osm/hausumringe_{name}.json"]
            if fluss: cmd.append(f"--fluss={fluss}")
            lauf(env, *cmd)
        elif st == "luftbild": lauf(env, "tools/luftbild.py", name)
        elif st == "neben": lauf(env, "tools/nebengebaeude.py", name)
        elif st == "kulisse": lauf(env, "tools/kulisse.py", name, "alle")
        elif st in A: lauf(env, f"tools/{A[st]}")
        elif st == "boden": lauf(env, "tools/boden.py", name)
        elif st == "amtlich": lauf(env, "tools/amtlich.py", name)
        else: raise SystemExit("unbekannter Schritt: " + st)
    print(f"\nfertig in {time.time() - t0:.0f} s")

if __name__ == "__main__":
    main()

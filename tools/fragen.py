#!/usr/bin/env python3
"""Entwirft Quizfragen aus Kapiteln des Überlebenshandbuchs (per Gemini über die llm-bridge)
und prüft jeden Beleg wörtlich gegen den Kapiteltext. Ausgabe: DokuWiki-Tabelle für
krisenvorsorge:spielfragen.
Aufruf: python3 tools/fragen.py <ordner-mit-kapiteln> <ausgabe.txt> [fragen-pro-kapitel]"""
import json, re, sys, time, pathlib
from bridge import Bridge

ordner, ausgabe = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
je_kapitel = int(sys.argv[3]) if len(sys.argv) > 3 else 6

def norm(t):
    t = re.sub(r"\*\*|//|__|''|\[\[[^|\]]*\||\]\]|\[\[|<[^>]+>|\\\\", " ", t)
    t = t.replace("„", '"').replace("“", '"').replace("”", '"').replace("–", "-").replace("’", "'")
    return re.sub(r"\s+", " ", t).strip().lower()

SYSTEM = ("Du schreibst Quizfragen für ein Überlebensspiel. Grundlage ist NUR der gegebene Kapiteltext – "
          "kein Wissen von außen. Antworte ausschließlich mit einem JSON-Array.")
b = Bridge()
zeilen, verworfen = [], []
for datei in sorted(ordner.glob("k*.txt")):
    text = datei.read_text(encoding="utf-8")
    seite = f"ueberlebenshandbuch:de:{datei.stem}"
    prompt = (
        f"Schreibe {je_kapitel} Multiple-Choice-Fragen zu diesem Kapitel eines Krisenvorsorge-Handbuchs. "
        "Regeln:\n"
        "- Nur praktisch nützliches Wissen (Erste Hilfe, Wasser, Vorrat, Brandschutz, Verhalten im Notfall), "
        "keine Fragen nach Kapitelnummern, Abkürzungen oder Zahlen ohne praktischen Nutzen.\n"
        "- Frage höchstens 90 Zeichen, Antworten höchstens 45 Zeichen, alle drei Antworten ähnlich lang.\n"
        "- Die zwei falschen Antworten müssen plausibel klingen, aber laut Text eindeutig falsch sein.\n"
        "- Kein senkrechter Strich | in den Texten.\n"
        "- 'beleg': ein WÖRTLICHES Zitat (15 bis 160 Zeichen, genau so im Text, ohne Formatierungszeichen), "
        "das die richtige Antwort belegt.\n"
        "- 'thema': ein bis zwei Wörter.\n"
        'Format: [{"thema":"…","frage":"…","richtig":"…","falsch1":"…","falsch2":"…","beleg":"…"}]\n\n'
        f"KAPITELTEXT:\n{text}")
    for versuch in range(4):
        antwort = b.frage("gemini", prompt, system=SYSTEM, temperature=0.3, max_tokens=6000)
        m = re.search(r"\[\s*\{.*\}\s*\]", antwort, re.S)
        try:
            fragen = json.loads(m.group(0)); break
        except Exception:
            print(f"{datei.stem}: keine gültige Antwort ({antwort[:120]!r}), neuer Versuch", file=sys.stderr)
            time.sleep(15); fragen = []
    quelle = norm(text)
    for f in fragen:
        felder = [str(f.get(k, "")).strip() for k in ("thema", "frage", "richtig", "falsch1", "falsch2")]
        beleg = norm(str(f.get("beleg", "")))
        if not all(felder) or any("|" in x for x in felder):
            verworfen.append((datei.stem, f, "unvollständig")); continue
        if len(beleg) < 15 or beleg not in quelle:
            verworfen.append((datei.stem, f, "Beleg nicht im Text")); continue
        zeilen.append((*felder, seite, f.get("beleg", "")))
    print(f"{datei.stem}: {len(fragen)} Vorschläge, bisher {len(zeilen)} gültig", file=sys.stderr)
    time.sleep(4)

kopf = ("====== Spielfragen ======\n\n"
        "Fragen für die Rätsel in **Zombies in Oberbayern**. Eine Zeile pro Frage; das Spiel liest diese Seite ein.\n"
        "Spalten: Thema, Frage, richtige Antwort, zwei falsche Antworten, Seite mit der Erklärung.\n\n"
        "^ Thema ^ Frage ^ Richtig ^ Falsch 1 ^ Falsch 2 ^ Seite ^\n")
tabelle = "".join(f"| {t} | {fr} | {r} | {f1} | {f2} | [[{s}]] |\n" for t, fr, r, f1, f2, s, _ in zeilen)
ausgabe.write_text(kopf + tabelle, encoding="utf-8")
ausgabe.with_suffix(".belege.json").write_text(json.dumps(
    {"gueltig": [dict(zip(["thema", "frage", "richtig", "falsch1", "falsch2", "seite", "beleg"], z)) for z in zeilen],
     "verworfen": [{"kapitel": k, "frage": f, "grund": g} for k, f, g in verworfen]}, ensure_ascii=False, indent=1),
    encoding="utf-8")
print(f"fertig: {len(zeilen)} gültig, {len(verworfen)} verworfen → {ausgabe}", file=sys.stderr)

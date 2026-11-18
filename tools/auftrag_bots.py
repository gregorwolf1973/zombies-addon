#!/usr/bin/env python3
"""DeepSeek schreibt server/bots.mjs (Steuerung simulierter Mitspieler). Aufruf: python3 tools/auftrag_bots.py"""
import pathlib, re, sys
from bridge import Bridge
basis = pathlib.Path(__file__).resolve().parent.parent / "zombies"
raum = (basis / "server" / "raum.mjs").read_text(encoding="utf-8")
schema = raum[raum.index("export const Spieler"):raum.index("export const Zombie")]
welt_exporte = "\n".join(l for l in (basis / "client" / "welt.mjs").read_text(encoding="utf-8").splitlines()
                         if l.startswith("export ") or l.startswith("  spielerRadius") or "tempo" in l or "sicht" in l)

prompt = f"""Schreibe das ES-Modul `server/bots.mjs` (Node.js 22, keine Abhängigkeiten) für ein kooperatives
Top-down-Zombiespiel. Bots sind simulierte Mitspieler. Der Server ruft 20-mal pro Sekunde für jeden Bot
`botSchritt(raum, sid, p, x, dt)` auf. Der Bot steuert sich NUR, indem er `x.eingabe = {{ dx, dy, s }}` setzt
(Richtungsvektor, Länge 0..1; Länge < 0.55 bedeutet schleichen; s = true erzwingt schleichen). Bewegung, Kollision
und automatisches Angreifen von Zombies in Reichweite erledigt der Server selbst.

Spielerzustand p (Colyseus-Schema):
```js
{schema}
```
x ist ein Objekt des Servers mit u. a. x.eingabe; du darfst eigene Felder in x.bot speichern (z. B. x.bot = {{...}}).

raum bietet:
- raum.state.spieler: Map sessionId → p (auch andere Bots; Bots haben x.bot gesetzt: raum.extra.get(sid).bot)
- raum.state.zombies: Map id → {{ x, y, richtung, jagt, hp }}
- raum.welt: Karte; Funktionen aus '../client/welt.mjs':
```js
{welt_exporte}
```
  (frei(welt, x, y, radius) prüft Kollision; sichtfrei(welt, x1, y1, x2, y2) prüft Sichtlinie;
   safeRoomAn(welt, x, y) liefert den Safe Room oder null; welt.safeRooms[i].innen = {{x,y}})
- raum.feldRichtung(x, y): Winkel (Radiant) entlang eines Wegfelds zum nächsten stehenden Spieler oder null.
- raum.extra: Map sessionId → x

Verhalten (in dieser Priorität):
1. p.unten oder p.zombie > 0: nichts tun (eingabe 0).
2. Liegt ein Mitspieler (nicht man selbst, p2.unten) in < 300 px: hingehen bis < 28 px, dann stehen bleiben
   (eingabe 0) – der Server hilft dann automatisch auf.
3. Selbst versorgen (direkt am Zustand, ohne Nachricht): wenn p.durst < 35 und 'wasser' in p.rucksack:
   entfernen (p.rucksack.splice) und p.durst = min(100, p.durst + 45); ebenso 'essen' bei p.hunger < 35;
   'verband' bei p.hp < 40 (+45 hp); 'spritze' wenn p.infektion > 0 (p.infektion = 0). Höchstens eine
   Sache pro Sekunde (Zeitstempel in x.bot).
4. Unbewaffnet (p.waffe === '' oder Pistole ohne Munition) und ein jagender Zombie (z.jagt) in < 70 px:
   vom Zombie weg bewegen (Richtung weg vom Zombie, notfalls seitlich, wenn frei() die Richtung sperrt).
5. Einem Anführer folgen: dem nächsten Mitspieler OHNE x.bot (echter Mensch), der nicht unten und kein Zombie
   ist. Abstand halten: ab > 90 px hinlaufen (volle Geschwindigkeit, ab > 250 px Wegfeld raum.feldRichtung nutzen,
   wenn keine Sichtlinie), unter 45 px leicht wegrücken, dazwischen stehen bleiben. Schleicht der Anführer
   (Anführer.schleicht), dann mit Länge 0.45 laufen. Jeder Bot bekommt einen festen Versatzwinkel um den
   Anführer (aus der sid berechnet), damit sie sich nicht stapeln.
6. Kein Anführer da: zum nächsten Safe Room (innen) laufen und dort stehen.
Gegen Festhängen: merkt der Bot, dass er sich 1 s lang trotz Eingabe < 8 px bewegt hat, läuft er 0,6 s
senkrecht zur gewünschten Richtung (abwechselnd links/rechts).
Bewegungen glätten (neue Richtung zu 30 % pro Schritt einmischen), damit Bots nicht zittern.

Exportiere zusätzlich `BOT_NAMEN` = Array mit 10 bayerischen Vornamen (z. B. 'Resi', 'Vroni', 'Sepp', 'Wastl',
'Kathi', 'Hias', 'Burgi', 'Girgl', 'Loisl', 'Zenzi').
Antworte NUR mit dem vollständigen Inhalt von bots.mjs in einem ```js-Block, deutsche Kommentare."""

a = Bridge().frage("deepseek", prompt, model="deepseek-v4-pro", temperature=0.2, max_tokens=12000,
                   system="Du bist ein sorgfältiger JavaScript-Entwickler für Multiplayer-Spiele.")
m = re.search(r"```(?:js|javascript)?\n(.*?)```", a, re.S)
if not m:
    print(a[:2000], file=sys.stderr); sys.exit(1)
ziel = basis / "server" / "bots.mjs"
ziel.write_text("// Steuerung der simulierten Mitspieler – Entwurf von DeepSeek (v4-pro), von Claude geprüft\n" + m.group(1), encoding="utf-8")
print(a.split("\n", 1)[0], f"→ {ziel} ({len(m.group(1))} Zeichen)", file=sys.stderr)

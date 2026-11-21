# Changelog

## 0.69.2 – 21.11.2026

- Bäume: mit Luftbild-Boden keine gezeichneten Kronen mehr (das Foto zeigt die echten), nur ein dezenter Stammpunkt; im gezeichneten Modus eine Krone je Baum (4–7,5 m) statt überlappender Riesenkronen.
- Unsichtbare Hindernisse sichtbar gemacht: Mauersockel um Häuser, Stellflächen für Container, Grundstreifen für Zäune in Blockierbreite, Bäche/Wasser im Luftbild blau getönt, Kartenrand markiert.
- Superuser: „🧱 Hindernisse zeigen“ färbt alles, wo man nicht durchkommt.

## 0.69.1 – 21.11.2026

- Behoben: Die Kulisse-Schalter (Luftbild-Boden, Echte Dächer, Schatten) erschienen nicht im Zahnrad, weil beim Seitenstart die Karte noch nicht geladen war.

## 0.69.0 – 21.11.2026

- Neu (Geretsried 2): echte Kulisse – amtliches Luftbild als Boden (Bayerische Vermessungsverwaltung, CC BY 4.0), echte Dachformen aus dem 3D-Gebäudemodell LoD2 (96 % der Häuser), weiche Schatten von Häusern und Bäumen (nachts und im Nebel aus). Im Zahnrad einzeln schaltbar: Luftbild-Boden, Echte Dächer, Schatten. Bodenbilder werden nur in der Umgebung geladen.
- Baumkronen über dem Luftbild dezenter, damit die echten Bäume sichtbar bleiben.

## 0.68.8 – 21.11.2026

- Radio-Eilmeldung jetzt mit zwei ElevenLabs-Sprechern (abwechselnd) für Geretsried und die Isarauen; die Piper-Stimme ist entfernt. Level ohne passende Aufnahme bleiben ohne Durchsage.

## 0.68.7 – 21.11.2026

- Neu: Eilmeldung im Live-Radio – ein Nachrichtensprecher (Piper-Stimme „Thorsten“) meldet Zombies am Ort des Levels; kommt aus dem Autoradio, der Sender wird dabei leiser. Abstand im Backend (Vorgabe alle 4 Minuten, 0 = aus), Dateien je Level unter Geräusche.

## 0.68.6 – 21.11.2026

- Live-Radio verbindet gleich bei Spielbeginn und bleibt verbunden; die ersten Sekunden (einstellbar, Vorgabe 30 s) bleibt es stumm – so ist ein Sender-Vorspann vorbei, bevor man das erste Autoradio hört. Hinweis auf werbefreie BR-Streams im Backend.

## 0.68.5 – 21.11.2026

- Behoben: Parkbucht-Berechnung ohne Winkelfunktionen – Server (Node 22) und Browser bauen auf Kochel und Geretsried 2 wieder exakt dieselbe Welt.

## 0.68.4 – 21.11.2026

- Behoben: Geparkte Autos stehen auf Parkplätzen jetzt mittig und längs in den eingezeichneten (auch schrägen) Parkbuchten, mit freien Lücken.

## 0.68.3 – 21.11.2026

- Behoben: Live-Radio wurde bei vielen Autos (z. B. Stau an der B11) sehr laut, weil sich derselbe Sender je Auto addierte – jetzt ist nur das nächste Autoradio zu hören.

## 0.68.2 – 21.11.2026

- Behoben: Handgranaten (und Granatwerfer) flogen bei langsamer Verbindung scheinbar aus der falschen Richtung – sie starten jetzt an der Figur, wie sie auf dem Bildschirm steht.

## 0.68.1 – 21.11.2026

- Behoben: Lautstärke des Live-Radios (und Musik-/Hordeneinstellungen) wirkt sofort im laufenden Spiel, auch bei schon spielenden Autoradios – vorher erst nach Neuladen.

## 0.68.0 – 21.11.2026

- Neu: Kulisse nach amtlichen Luftbildern (Bayerische Vermessungsverwaltung CC BY 4.0, swisstopo) – Bäume, Äcker und Dachfarben wie in echt; Eckkarte und große Karte mit Luftbild und Straßen wie im Navi (im Zahnrad umschaltbar).
- Neu: Maßstab – alle Fahrzeuge, Panzer und Deko in echter Größe (8 px = 1 m).
- Neu: Begleiter-Hund – 1–2 Streuner je Level laufen einem zu, folgen, lenken Zombies ab, bellen bei Zombies vor der Tür (lockt nichts an), unverwundbar; im Zahnrad wegschicken.
- Neu: Verkehr hält Abstand und Vorfahrt, wendet bei Stau, schiebt Hindernisse zur Seite; Unfälle mit Rauch, Feuer und Explosion (einstellbar, Superuser-Befehl „unfall“).
- Neu: Einkaufswagen vor Läden (Wasser, Konserven); Zäune laufen glatt entlang Straße und Haus.
- Neu: Autoradio als Live-Radio (Einstellung, Vorgabe Antenne Bayern, Stream direkt vom Sender); Sprache über Funk knackt.
- Neu: Kameraflug für Superuser; Superuser-Menü zeigt An/Aus; Puma und Leopard fahren an der B11 bis vor das Rathaus.
- Geändert: Aufgaben kürzer – höchstens 3 Gegenstände, Vorräte höchstens 5; Symbol und pulsierender Ring sitzen genau auf dem Gegenstand, die Liste nennt den Ort.
- Geändert: Evakuierung startet 10 s, nachdem alle an Bord sind (Bunker: Tor schließt in 10 s). Alle Panzer klingen wie der Puma. Mörserpanzer entfernt. Anmeldung nur noch Held, Heldin, Survivor.
- Geändert: Nebel lichter mit weicherem Rand, Lampen schneiden ihn auf; alle Lampenkegel gleich. Ausrufezeichen beim Entdecktwerden entfernt.
- Behoben: Im Wald wird wieder geschossen (Bäume senken nur die Trefferchance); Scrollrad-Zoom verschluckt keine Raststufen mehr; Safehouse-Eingang unter großen Dächern (XXXLutz/Mömax) sichtbar.

## 0.67.0 – 21.11.2026

- Neu: Nebel als Wetterlage – morgens und abends zufällig, ziehende Schwaden, Sicht ca. 20 m, Zombies sehen schlechter, die Taschenlampe streut im Nebel. Im Backend einstellbar (Tag/Nacht), Superuser-Befehl „nebel“.
- Neu: Feuerknopf als Option im Zahnrad (gedrückt halten = automatisch schießen), Regler für die Stimmen der Mitspieler, Schalter für Zombiegeräusche (Horde und Entdeckt bleiben) und Musik; Spielgeräusche 25 % leiser.
- Neu: Taschenlampenkegel der Mitspieler sichtbar; eigene Position pulsiert in der Eckkarte; Atomschlag-Countdown in der Eckkarte statt über den Knöpfen.
- Neu: Munitionsglück – jede Durchsuchung ohne Munition erhöht die Chance (+20 %, bis ×3), dazu mehr bei wenig Leben, Durst oder Hunger (im Backend einstellbar).
- Neu: Level 2–5 mit deutlich mehr Bäumen, Alleen, Hecken, Weidezäunen, Heuballen und Feldwegen; kräftigere Haustüren mit Rahmen und Stufe; Sandsäcke parallel zur Wand.
- Neu: B11 – Puma und Leopard 2 patrouillieren, walzen geparkte Autos platt und schieben sie zusammen, Kettenspuren; Mörser weiter abseits, kleinere Granaten, weniger Bäume an der Kreuzung.
- Neu: Geretsried 2 hat ein festes zusätzliches Safehouse (Wohnhaus).
- Geändert: Safehouse-Türen – geschlossen oder verbarrikadiert kommen Zombies nie hinein, sie hämmern nur. Sprach-Hörweite: volle Lautstärke bis zur eingestellten Weite, dann leiser bis +50 %. Mörser ist kein Testwerkzeug mehr.
- Behoben: Superuser-Passwort wirkte nach dem Neuladen nicht; Kofferraum-Zeichen über Autos entfernt.

## 0.66.3 – 21.11.2026

- Musik wird jetzt gestreamt statt komplett entpackt: Lieder starten sofort und belegen kaum Arbeitsspeicher, egal wie lang (vorher bis zu 115 MB je Lied). Auf iPhone/iPad werden die Abspieler bei der ersten Berührung freigeschaltet.
- Neue Hintergrundmusik: Level 3 „Hiding from Zombies“, Level 4 „Overdrive“ (MAITTRE, CC BY 3.0), BW-Lager „Dominion“ (Hriday Talur, CC BY 3.0), Horde „Infestation“. Nachweis auf der Startseite.
- Töne auf dem Server verkleinert: Geräusche Mono 96 kbit/s, lange Schleifen (Horde, Stadt, Wasser) auf nahtlose 30 s gekürzt – deutlich weniger Download und Speicher.

## 0.66.2 – 21.11.2026

- Schneller: Levelwechsel und Neuladen. Der Kartenaufbau rechnet die Zaunlücken jetzt über ein Raster statt jede Zaunkachel mit allen Zaunstücken zu vergleichen – Geretsried 2 baut in 1,4 statt 4,6 s, Geretsried in 0,5 statt 1,4 s (auf Tablets und Handys entsprechend mehr). Die Welt bleibt genau gleich.
- Schneller und sparsamer: Töne werden nach dem Start nacheinander statt alle gleichzeitig geladen, lange Effekt-Töne als Mono (halber Speicher). Vorher lagen rund 230 MB dekodierte Töne im Speicher, was iPhone und iPad stark bremste.
- Behoben: Nach dem automatischen Neuladen blieb auf iPhone/iPad die Sprache stumm, weil Safari den Ton nur bei „Loslassen“/Klick freigibt – jetzt weckt jede Berührung auch die Sprache.
- Behoben: Nach dem Neuladen flackerte kurz die Anmeldung auf; jetzt erscheint gleich die Ladeanzeige.

## 0.66.1 – 21.11.2026

- Neu: Hordengeräusch – sind viele Zombies in Hörweite, blendet ein Horden-Teppich ein (aus Richtung der Zombies, lauter je mehr), Einzelschreie werden seltener; bei schnell wachsender Horde ein kurzer Akzent. Schwellen (ab, nur noch Horde, voll, aus) und Hörweite im Backend einstellbar.
- Neu: Spielmusik mit Überblendung – Hauptlied je Level sowie eigene Musik im Bundeswehr-Lager, im Kampf gegen eine Horde, im Safehouse und im Finale. Dateien und Lautstärke im Backend unter Geräusche zuordnen; Level 5 hat „Apocalypse“ vorbelegt.

## 0.66.0 – 21.11.2026

- Neu: Bundeswehr-Lager mit Flandernzaun rundum (Holzböcke mit Stacheldraht, Spieler kommen nicht durch, Zombies nur sehr langsam), Tor und drei S-Draht-Rollen. Zombies bleiben mit 40 % im Draht hängen, zappeln, beißen und reißen sich nach 60 s los; einige hängen schon bei Spielbeginn.
- Neu: Der Puma fährt Zombies platt (wie der Leopard).
- Neu: Flugfeld Königsdorf mit verlassenen Puma und Leopard, Drahtrollen mit hängenden Zombies und vielen Toten.
- Neu: Leopard dreht den Turm langsam (ca. 40 °/s), Kommandant und Ladeschütze schauen aus den Luken, der Ladeschütze schießt mit dem MG. Ab 10 Zombies auf einem Fleck feuert die Hauptkanone (Explosion ca. 5 m, mind. 8 s Pause, nie bei Spielern in der Nähe des Ziels).
- Neu: Schießstand mit Fahrzeugwahl: keins, Puma, Leopard oder Mörserpanzer.
- Neu (Geretsried 2): Stau auf der B11 mit brennenden Autos und Feuerwehr; an der Kreuzung beim Rathaus ein Bundeswehr-Posten mit Puma, Mörserpanzer und 8 Infanteristen. Gefallene Soldaten lassen Munition liegen und stehen später als Zombie auf.
- Geändert: Sind alle echten Spieler am Boden (Bots zählen nicht), wachen alle gemeinsam im zuletzt betretenen Safehouse des Teams auf.
- Behoben: Nach dem Drehen von Tablet oder Handy wird das Bild neu angepasst.
- Geändert: Das Aufheben-Fenster bleibt offen, bis nichts mehr zum Aufheben da ist oder man es selbst schließt.

## 0.65.1 – 21.11.2026

- Neu: Zweite Level-1-Karte „Geretsried 2 (Level 1)“ – Geretsried-Nord rund um den Karl-Lederer-Platz mit Rathaus, B11 und Gewerbegebiet (1,4 × 1,7 km). Level 1 wählt bei jedem Start zufällig Geretsried oder Geretsried 2; im Backend lässt sich auch eine feste Karte wählen.

## 0.65.0 – 21.11.2026

- Neu (Bildschirm): Waffentext ganz oben, darunter Balken, Mitspieler und nur noch zwei Waffenfelder mit großem Waffensymbol und Magazinanzeige. Doppeltipp lädt nach (der Nachladen-Knopf entfällt, Taste R bleibt). Die Granate hat ein festes Feld daneben und springt nicht mehr. Aktionen (Öffnen, Tür, Handel …) stehen als Text unten in der Mitte; unten links und rechts bleibt nur der Rucksack.
- Neu: Uhrzeit, Tag und Zombiezahl stehen in der Eckkarte; Zählerfenster und Zoom-Knöpfe entfallen (Mausrad und Zwei-Finger-Zoom bleiben). „Alles durchsuchen“ sehen nur Superuser.
- Geändert: Nur noch zwei Waffenplätze. Ein alter dritter Platz rückt beim Laden nach vorn oder in den Rucksack. Sind alle Waffen leer, greift der Held zur Nahkampfwaffe in Platz 2, sonst zur Faust.
- Neu (Inventar): Bis zu 5 gleiche Dinge je Platz; Waffen einzeln, Messer und Handgranaten stapeln. Nur eine Tasche tragbar. Neue Munitionskiste (30 Schuss): Überschuss bei vollem Vorrat wird zu Kisten, unter 120 Schuss wird automatisch eine geöffnet.
- Neu (Zombies): Menge je Level und Spielerzahl (Bots zählen halb), im Backend als Tabelle einstellbar, mit Vorschau für 1/2/4/6 Spieler.
- Neu (Horden): Mehrere Horden mit eigener Lebensdauer. Danach bleibt etwa ein Drittel als Streuner, der Rest zieht zum Kartenrand ab. Nach der Pause kommt eine neue Horde von einer anderen Seite mit neuen Zielen; Dauer, Pause und Anzahl gleichzeitiger Horden je Level einstellbar.
- Geändert (Backend): Jede Einstellung ist eine Zeile mit Zahlenfeld, −/+ und Vorgabe-Knopf; Min/Max-Paare zusammengefasst; Selteneres unter „Feinheiten“ eingeklappt. Alte Einstellungen werden übernommen.
- Neu: Eigene Haltungsbilder des Helden und der Heldin für alle Waffen, Granate und Fäuste; die Heldin ist schlanker.
- Behoben: Eine von Hand geschlossene Tür öffnet sich erst wieder automatisch, wenn man sich entfernt hat. Die Kofferraum-Markierung an Autos entfällt.

## 0.64.4 – 20.11.2026

- Neu: Königsdorf hat eine breite befestigte Landebahn (ca. 44 m) mit Rand- und Mittellinien, Zebrastreifen, Aufsetzmarken, Pistennummern 10/28 und Rollweg zum Hangar; der A400M fliegt sie an.
- Neu: „Alles durchsuchen“ im Haus nur nach 3 richtig beantworteten Fragen – dann öffnen sich alle Türen des Stockwerks (auch verschlossene und Rätseltüren, nicht eigene Barrikaden) und alle Behälter werden durchsucht. Bei einer falschen Antwort 30 s Sperre.
- Neu (Testmenü): „✅ Alle Aufgaben erledigt“ und „📍 Hierhin springen“ (Rechtsklick oder langer Druck auf die Karte).
- Behoben: Das Testmenü fehlte nach automatischem Neuladen (Update, Levelwechsel), weil der Testzugang nicht erneut mitgeschickt wurde; Leerzeichen am Ende stören nicht mehr. Im Anmeldedialog steht, wo der Testzugang eingegeben wird.
- Geändert: Meldungen bleiben je nach Länge länger stehen (bis 15 s), z. B. die Einsteige-Meldung.

## 0.64.3 – 21.11.2026

- Königsdorf: Statt des A400M-Absturzes kam ein Leopard. Ursache: Die in der Verwaltung erzwungene Evakuierungsart („Test“) blieb über den Levelwechsel gespeichert und galt auch in der nächsten Karte. Jetzt wird sie beim Kartenwechsel zurückgesetzt.
- Absturz (Königsdorf) und NH90 (Kochel) fallen nie mehr auf Bus oder Panzer zurück: Die Absturzstelle und der Heliplatz haben immer einen Plan (notfalls ohne freie Fläche); eine festgelegte Landebahn der Karte (`welt.landebahn = {x, y, w}`) bestimmt die Anflugachse, `welt.heliplatz` den Landeplatz.
- Test: Levelwechsel nach Königsdorf (normal und per Testsprung), Kochel und Andermatt ergibt jeweils die richtige Evakuierungsart; der Bus-Straßentest war flackrig (im Zeitraffer blieb der Bus an einem stehenden Bewohner hängen) und ist stabil.

## 0.64.2 – 20.11.2026

- Geändert: Die Horde klumpt nicht mehr zu einem Haufen und läuft nicht mehr im Gleichschritt. Jeder Zombie hat einen eigenen Zielpunkt um das Hordenziel, hält Abstand zu den Nachbarn (auch vor Türen), schlingert, macht kurze Pausen und hat eine eigene Laufphase; Ankunft am Ziel richtet sich nach der Streuung, danach zieht die Horde zügig weiter.

## 0.64.1 – 21.11.2026

- Level 2: Der Evakuierungspanzer fuhr nie zum Abholpunkt – der Ortsausgang liegt am Kartenrand, die nächste Straße rund 450 m entfernt, der Panzer rollte nur dorthin bzw. erschien am Rand. Jetzt fährt der Leopard querfeldein (neue Wegsuche server/querfeld.mjs über befahrbaren Boden für die Wannenbreite: Straße, Wiese, Feld, Schotter; nicht durch Häuser, Wasser, Bäume; Zäune und Hecken umfährt er), kommt am Abholpunkt an, wartet dort und fährt den Feldweg wieder hinaus.
- Mitnehmen: Wer an Bord sitzt, bleibt bis zum Levelwechsel drin. Neu: Aussteigen wird in den ersten 2,5 s nach dem Einsteigen ignoriert, die Leertaste steigt nie aus (nur E oder der Knopf); 60 s und 15 s vor Ablauf der Wartezeit warnt eine Meldung, was noch fehlt; fährt das Fahrzeug ohne Erfolg ab, nennt die Meldung an alle, was fehlte.
- Rückfallebene: Ist der Abholpunkt für den Panzer nicht befahrbar, wandert er auf die nächste befahrbare Stelle (Markierung auf der Karte folgt). Beim Bus (nur Straße) wandert der Abholpunkt zur nächsten Straße, wenn diese weit vom Ortsausgang liegt.

## 0.64.0 – 20.11.2026

- Neu: Level 3 Flugplatz Königsdorf (A400M stürzt ab, danach NH90), Level 4 Kochel am See (NH90, Ersatzteile suchen), Level 5 Andermatt (Schweiz) als Finale: Countdown bis zum Atomschlag (Vorgabe 30 min, in der Verwaltung 10–90), Bunkertor öffnet erst nach den Pflichtaufgaben; wer bei null im Bunker ist, überlebt – danach beginnt alles wieder bei Level 1, sonst startet Level 5 neu. Karten aus OpenStreetMap (© OpenStreetMap-Mitwirkende, ODbL), Bissrate steigt je Level (12/12/14/16/18 %).
- Neu: „🔍 Alles durchsuchen“ (Taste C): alle erreichbaren Behälter des Raums am Stück in 60 % der Zeit, danach Fundliste mit „Alles nehmen“. Einzeldurchsuchen schneller (Behälter 0,8 s, Auto 1,2 s, Leiche 0,6 s); aus der Nähe zeigt 📦/∅, ob ein Behälter noch etwas enthält.
- Neu: Zimmertüren öffnen sich von selbst, wenn man 0,5 s davor steht oder dagegenläuft (nicht beim Vorbeilaufen; verschlossene bleiben zu).
- Neu: Sind alle Fernwaffen leer, wechselt der Held auf die Nahkampfwaffe (Platz 3 bevorzugt, z. B. Sense oder Messer), sonst auf die Faust.
- Neu: Testmenü (☰) mit Level 1–5 springen, Countdown auf 60 s (Andermatt) und Zeitraffer 1×/5×/10×/60×.
- Geändert: Rucksack – nach ◀/▶ bleibt das Fenster offen (schließen mit ✕ oder Esc).
- Geändert: Töne – Horden-Grollen entfernt, „Entdeckt“ höchstens alle 3 s, Zombie-Tod höchstens alle 0,5 s. Der „Diesel für den Bus“ heißt jetzt „Dieselkanister“.
- Behoben: Helden liefen beim Schießen seitwärts oder rückwärts – die Füße zeigen jetzt immer in Laufrichtung, der Körper dreht nur kurz zum Schuss.

## 0.63.1 – 20.11.2026

- Geändert: Landefeuer gibt es jetzt eines je echtem Mitspieler (Bots zählen nicht), mindestens 1, höchstens 5; kommen später Spieler dazu, werden es bis zum Funkspruch mehr. Jedes liegt in einem eigenen Gebäude, die Aufgabe zeigt z. B. „Landefeuer 2/3“.
- Geändert: Kleinere Suchkreise – Landefeuer 70 m, übrige Missionsgegenstände 100 m Radius (vorher 150 m).

## 0.63.0 – 21.11.2026

- Neue Evakuierungsarten für die Level 3–5 (Zuordnung Karte → Art in client/evak.mjs; die Karten selbst kommen separat):
  - `absturz` (Königsdorf): Der A400M kommt im Landeanflug und stürzt ab (Rauchspur, Einschlag, Wrack mit Brand und Rauch bleibt als Kulisse; Spieler nehmen keinen Schaden). Der NH90 landet erst, wenn die Fahrt gelingt (Missionsteile erledigt), dann Einsteigen/Aussteigen/Abflug wie bisher.
  - `heli` (Kochel): Der NH90 steht von Anfang an; Einsteigen jederzeit (mit Aussteigen), Abflug nur, wenn die Fahrt gelingt – sonst wartet er weiter.
  - `bunker` (Finale): Bunkertor als Evakuierungspunkt, „Einsteigen“ = hineingehen (an Bord, Zombies lassen einen in Ruhe), kein Abflug. `aufgaben.bunkerEnde()` (vom Countdown) wertet aus: wer drin ist, überlebt (Sieg), wer draußen ist, nicht; Haken `raum.bunker.betreten/verlassen` für einen Innenraum.
- Platzwahl aus Kartendaten (`welt.heliplatz`, `welt.bunkertor`), sonst automatisch (freie, erreichbare Stelle; server/flugplatz.mjs).
- Verwaltung: Test-Schalter „Evakuierungsart erzwingen“ kennt jetzt Absturz, Hubschrauber und Bunker.
- Wartender Hubschrauber lässt die Aufgaben weiterlaufen (Missionen zählen auch beim stehenden NH90).

## 0.62.6 – 20.11.2026

- Behoben: In Innenräumen lag manchmal ein dunkler, schräger Kasten mit braunem Fleck über den Möbeln – das Wrack eines ausgebrannten Autos von draußen. Wracks und Brandruinen werden im Innenraum jetzt ausgeblendet.

## 0.62.5 – 20.11.2026

- Bilder für die sieben Missionsgegenstände (Funkgerät, Batterie, Antenne, Torschlüssel, Diesel, Treibstoffkanister, Landefeuer) im Stil der übrigen Gegenstands-Icons (Gemini, fünfter Bogen in tools/dinge_bilder.py). Sie erscheinen überall, wo Gegenstände als Bild gezeigt werden; auf der Übersichtskarte bleiben die Symbole.

## 0.62.4 – 20.11.2026

- Geändert: Die Horden-Prüfanzeige (Zielfahne, Linie, letzte Zielwechsel) sehen nur noch Superuser. Sie lässt sich im ☰-Testmenü mit „🎯 Horden-Ziele anzeigen ein/aus“ für sich selbst schalten und steht jetzt direkt unter dem Zählerfenster statt unten links.

## 0.62.3 – 20.11.2026

- Geändert: Bäume verdecken den Spieler nicht mehr ganz. Unter einem einzelnen Baum oder hinter einer Baumreihe sehen Zombies dich fast wie im Freien; je mehr Bäume zwischen euch stehen, desto kürzer ihre Sichtweite (je Baum −20 %), im dichten Wald nur noch auf etwa ein Drittel – aber nie gar nicht. Schüsse und Granaten zielen unverändert.

## 0.62.2 – 20.11.2026

- Behoben: Beim Laufen an Zombies vorbei schien der Held zu spät oder gar nicht zu schießen. Der Server schoss richtig, aber die eigene Figur läuft durch die Vorhersage dem Serverstand voraus, sodass Schusshaltung und Mündungsblitz (auch beim Nahkampf) nicht mehr am Helden erschienen. Eigene Schüsse und Stöße werden jetzt der eigenen Figur zugeordnet und an ihr gezeichnet.

## 0.62.1 – 20.11.2026

- Behoben: Häuser ließen sich nach dem Verlassen eines anderen Hauses manchmal nicht betreten (z. B. Intersport Reiser), erst nach längerem Herumlaufen. Die Sperre gegen sofortiges Zurücklaufen durch die Tür rechnete beim Hinausgehen mit der Ausgangskachel des Innenraums statt mit der Haustür draußen und blockierte dadurch alle Haustüren in Richtung linke obere Kartenecke. Jetzt gilt sie nur an der eigenen Haustür, bis man sich ein paar Schritte entfernt hat.

## 0.62.0 – 21.11.2026

- Aussteigen aus dem Evakuierungsfahrzeug (Bus, Leopard, A400M-Rampe, Hubschrauber) jederzeit, solange es steht: Taste E/Leertaste (die Aktionstaste) oder der Knopf „🚪 Aussteigen“ am Handy. Ausstieg an freier Stelle neben dem Fahrzeug, 3 s Schonzeit gegen Zombies, kein sofortiges Wiedereinsteigen (erst wieder hingehen).
- Einsteigen vor Erfüllung der Aufgaben bleibt erlaubt; die Meldung nennt, was fehlt, und weist auf das Aussteigen hin. Ohne Erfolg fährt das Fahrzeug nach Ablauf der Wartezeit ab und setzt alle Insassen mit Meldung ab (wie bisher, jetzt getestet; die Wartezeit ist die Einstellung „Der Bus wartet höchstens“, Vorgabe 10 echte Minuten).
- Tote/liegende Bots und nicht verbundene Spieler blockieren die Abfahrt nie (getestet): sie kommen beim Levelwechsel mit.

## 0.61.1 – 20.11.2026

- Startwahl: zwei verschiedene Gegenstände frei wählen (Messer, Funkgerät, Taschenlampe, Armbrust mit 6 Pfeilen, Baseballschläger, Radio, Schlüsselbund, Spritze) plus ein Zufallsgegenstand („🎲 Zufall: …“); weiterhin 5 Fähigkeitspunkte.
- Rucksack anordnen: am PC Ziehen und Ablegen, am Handy lange drücken und ziehen, im Rucksack-Menü ◀ ▶; Zifferntasten folgen der Reihenfolge.

## 0.61.0 – 20.11.2026

- Missionsgegenstände: In Level 1 müssen Funkgerät, Batterie und Antenne (zusammen am Funktisch = Funkspruch), Torschlüssel und Diesel aus weit auseinanderliegenden Gebäuden geholt und im Safe House abgegeben werden – jede Runde woanders; in Level 2 eigene Liste. Auf der Karte nur Suchkreise (~150 m), die durch Hinweise kleiner werden (gerettete Menschen, Zettel bei Leichen). Das Fahrzeug kommt erst nach allen Abgaben.
- Schwierigkeit steigt je Level (Zombie-Dichte, Horde, schnelle Zombies, knappere Beute, längere Nächte) und mit jedem Spieltag; Regler „Schwierigkeit“ leicht/normal/schwer in der Verwaltung.
- Menschen verstecken sich meist in kleinen Gruppen hinter Häusern, Zäunen und Hecken (geduckt, neue Gemini-Bilder), einige laufen in Panik schreiend herum; in manchen Häusern sitzt jemand versteckt (leises Wimmern). Ansprechen → er folgt dir; im Safe House gerettet → Punkte und ein Hinweis oder Gegenstand; Zähler „🙋 gerettet“.
- Türen: liegen zur Straße hin, nicht in Spalten zwischen Häusern; Vorplatz frei von Autos, Bäumen, Zäunen; Weg zur Straße wird als letzter Schritt geprüft (beide Karten: keine Tür ohne Weg). WELT_VERSION 19.
- Rucksack-Menü: „Wegwerfen“ und „In die Hand“ ganz unten; Inventar-Icons auf hellerem Grund.

## 0.60.0 – 20.11.2026

- Gegenstände als Bilder statt Emojis: 31 neue Icons (mit Google Gemini erzeugt) für Waffen, Munition, Vorräte, Geräte und Taschen, dazu die Faust für die leere Hand. Sie erscheinen in der Waffenanzeige oben, auf den Waffenknöpfen, im Rucksack und seinen Menüs, beim Aufheben, beim Tauschen, beim Händler im Lager, im Schießstand und bei Gegenständen am Boden. Fehlt ein Bild, bleibt das Emoji.
- Waffenknöpfe etwas breiter, damit Name und Magazin neben dem Bild Platz haben.
- Werkzeug tools/dinge_bilder.py schneidet die Gemini-Bögen (Magenta-Raster) zu grafik/dinge.webp und dinge.json; neuer Baustein client/dingbild.mjs.

## 0.59.0 – 20.11.2026

- Superuser-Testmenü: Im Anmeldefenster „Testzugang“ mit Passwort (nur in den Einstellungen des Servers gespeichert, als Hash; in der Verwaltung setzen/löschen). Superuser bekommen ein ☰-Menü: Sprung zur Bundeswehr, zum Evakuierungspunkt und 50 m vor die Horde; alle Bots zu mir (wiederbelebt, voll versorgt); Horde jetzt starten (50/200/500); unsterblich ein/aus; Mittag/Nacht; Ausrüstung auffüllen; Evakuierung sofort rufen; Lager fallen lassen/aufbauen. Jede Nutzung steht im Protokoll, Fehlversuche sind begrenzt.

## 0.58.1 – 20.11.2026

- Behoben: Laden blieb bei 85 % stehen, wenn man ohne Zombie in Sicht einstieg (z. B. im Safe House). Der Server schickt die Zombie-Liste dann gar nicht, der Client nimmt jetzt eine leere Liste an.

## 0.58.0 – 20.11.2026

- Netz: viel weniger Daten und weniger Pakete. Jeder Spieler bekommt nur noch die Zombies und Bewohner in seinem Bildausschnitt (+ Rand, je nach Bildschirm und Zoom). Positionen gehen als ganze Pixel, Blickrichtungen in 256 Stufen, Hunger/Durst/Lampe ganzzahlig; Leichen und liegende Gegenstände senden nur noch ihre Ausblendstufe statt alle 50 ms ihr Alter. Zustände gehen 10- statt 20-mal je Sekunde raus, direkt nach dem Simulationsschritt. Bei einer Horde von 600 Zombies sinkt die Datenmenge je Spieler von etwa 93 kB/s auf 13–27 kB/s, die Paketzahl von 23 auf 11 je Sekunde.
- Die eigene Figur wird nach Netz-Hängern nicht mehr zurückgezogen: Der Client meldet „so lange in diese Richtung gelaufen“ mit laufender Nummer; der Server arbeitet die Stücke in Echtzeit ab, holt nach einem Hänger bis zu 1,5 s nach und bestätigt die Nummer. Der Client rechnet vom bestätigten Stand aus mit den offenen Eingaben weiter, Restfehler klingen sanft ab. Beide Seiten rechnen in Teilschritten von höchstens 4 px, damit Ecken gleich ausgehen.
- Glättung: Zombies, Mitspieler und Bewohner werden mit kleiner, sich selbst anpassender Verzögerung (normal etwa 0,15 s, bei schlechter Verbindung bis 0,45 s) gleichmäßig zwischen zwei Serverständen bewegt (client/netzpuffer.mjs). Die Anzeige „unterwegs“ zählt weiterhin alle Zombies (state.zombieZahl).
- Werkzeug tools/netz/messen.mjs misst die Datenmenge je Spieler; neue Tests in tests/netz.test.mjs.

## 0.57.1 – 20.11.2026

- Soldaten rufen „Halt, sofort stehen bleiben!“ bzw. „Keine Bewegung!“ (neues Ton-Ereignis „Soldat ruft“, räumlich, mit Sprechblase), wenn sich ein Spieler dem Lager nähert (je Spieler höchstens alle 45–60 s) und gelegentlich, wenn Zombies den Zaun erreichen.

## 0.57.0 – 20.11.2026

- Einsteigen in Evakuierungsfahrzeuge (Bus, Leopard, A400M-Rampe, Hubschrauber) neu: Wer am wartenden Fahrzeug steht, sitzt drin – die Position folgt dem Fahrzeug, die Figur ist ausgeblendet, die Kamera fährt mit, Zombies lassen ihn in Ruhe, Eingaben bewegen ihn nicht. Das gilt auch dann, wenn die Abfahrt noch nicht möglich ist (früher blieb man nur im Umkreis „an Bord“ und lief dem losfahrenden Fahrzeug hinterher).
- Beim Einsteigen nennt eine Meldung, was für die Abfahrt noch fehlt (offene Pflichtaufgaben, Mindestzahl erledigter Aufgaben). Fährt das Fahrzeug ohne Erfolg ab, steigen alle mit einer Meldung aus („es fehlte: …“) statt still zurückzubleiben. Bei Erfolg fährt man bis zum Levelwechsel mit.
- Bots steigen ebenso ein und sitzen still. Neuer Spielerzustand `anBord`.

## 0.56.0 – 20.11.2026

- Waffenplätze verwalten: Knopf gedrückt halten bzw. Rechtsklick → „In den Rucksack“, „Fallen lassen“, „Tauschen mit …“; Knopf „✊ Faust“ (Taste X); im Rucksack „→ Platz 1/2/3“.
- Handgranate als Waffe: in einen Waffenplatz legen (Magazin 5), Zielbogen 60° in Blickrichtung mit Wurfweite, Tippen/Klick wirft auf den Punkt, Explosion beim Aufschlag; Q bleibt Schnellwurf; Werte in der Verwaltung.
- Granatwerfer: Gewehr-Haltung, schießt automatisch, Granate etwa 4× schneller, Explosion beim Aufschlag, Reichweite 60 m (bis 100 m einstellbar).
- MG-Ton ohne Aussetzer: neuer Schuss löst den ältesten eigenen Ton ab, Schusstöne kürzer.
- Zweiter Tab mit demselben Spieler löst den alten ab (Meldung im alten Fenster).
- Munitionsvorrat der MG-Nester und des Puma wird gespeichert.

## 0.55.1 – 20.11.2026

- Ton: Solange der Browser den Ton sperrt (erst nach einer Berührung erlaubt), zeigt die Startseite „🔊 Tippe irgendwo für Ton“; die erste Berührung schaltet den Ton auch im Spiel frei (z. B. nach automatischem Neuladen).
- Chat-Klingelton: vier Töne im Wechsel (klingelton1, Samsung-Pfiff, „new message“, „message envoyé“).

## 0.55.0 – 20.11.2026

- Leistung: Die Kamera-Nachbearbeitung (Schwarzweiß in dunklen Räumen) wird beim Verlassen ganz entfernt; vorher blieb nach dem ersten dunklen Haus ein Vollbild-Durchgang je Bild aktiv.
- Eingaben (Laufrichtung) werden zusätzlich alle 50 ms per Zeitgeber gesendet und nutzen die echte Uhr, damit die Spielerposition bei niedriger Bildrate nicht verzögert beim Server ankommt.

## 0.54.0 – 20.11.2026

- Schießstand / Tutorial: Lobby-Knopf „🎯 Schießstand“, eigener Übungsplatz je Spieler (unsterblich), alle Waffen, Entfernungsmarken 10/25/50/75 m, Zombies 5/20/50 starten, Panzer ein/aus, Auswertung je Waffe (Schuss, Treffer, Tote, Schuss je Zombie, Munition) mit Erklärung.
- Beute: Spinde hinter Rätsel-Türen mit Belohnung (mehr Waffen, Munition, Spritzen), Herd und Spüle durchsuchbar (Messer sehr häufig), Überraschungszombie in Schränken, Müllcontainern und Kofferräumen (Vorgabe 3 %, einstellbar). WELT_VERSION 18.
- Wer sich im Bundeswehr-Lager abmeldet, steigt dort wieder ein.
- Waffenknöpfe unten links übereinander, jeder mit Magazin/Max und Vorrat, Nachladebalken, leer rot; App-Icon und Logo als grüner 🧟.
- Ein Fenster unter der Eckkarte: Uhrzeit · Tag, Zombies von dir/gesamt, verwandelte Menschen und Zombies unterwegs.
- Mehr Einzel-Zombies (auch früh im Ausbruch), schnelleres Nachrücken; Angriffstrupps der Horde 15–25 % der Horde und bleiben 30–45 s dran, Rest bremst in Spielernähe; normale Zombies jagen länger und suchen am letzten Ort.
- Mehr Zombie-Geräusche (10 Stimmen, Stöhnen öfter, Horden-Grollen leiser).
- Acht neue Bewohner-Typen (dicker Mann, Oma, Jogger, Geschäftsfrau, Teenager, Bauarbeiter, Opa, junge Frau mit Rucksack) mit eigenem Tempo.

## 0.53.0 – 20.11.2026

- Hubschrauber der A400M-Evakuierung jetzt ein NH90 (Draufsicht aus einem 3D-Modell, Rumpf und Hauptrotor getrennt – der Rotor dreht sich).
- Kulisse: Ein Tanklaster steht neben der Nase des gelandeten A400M.
- Neu, vorbereitet: Panzermörser (M113 mit 120-mm-Mörser und Soldat an der offenen Dachluke). Steilfeuer: Die Granate fliegt im hohen Bogen (Flugzeit nach Entfernung), der Einschlag macht Flächenschaden in Zombiegruppen (in der Mitte voll, am Rand die Hälfte). Schießt nur zwischen Mindest- und Höchstreichweite, erst ab einer Mindestzahl Zombies im Radius und nie, wenn ein Spieler oder Mensch in der Nähe des Einschlags steht; Spieler nehmen nie Schaden. In keiner Karte fest eingebaut: nur der Test-Schalter in der Verwaltung (Karte „Bundeswehr“, Vorgabe aus), dort auch Reichweiten, Pause, Schaden, Radius, Mindestzahl, Sicherheitsabstand und Granatentempo.
- Grafik-Quellen (CC-BY 4.0) in client/grafik/LIZENZ.txt: NH90 (Waroxed), Tanklaster (simonthedigger), M113 (arc4de; Mörserluke selbst eingezeichnet).

## 0.52.0 – 20.11.2026

- Magazine und Nachladen: jede Schusswaffe hat ein Magazin, Nachladen 4 s (je Waffe einstellbar), Taste R bzw. Knopf „🔄 Nachladen“, HUD zeigt Magazin/Max · Vorrat.
- Waffenplätze Haupt/Neben/Ersatz als Leiste im HUD, Taste F wechselt; leere Waffe wird automatisch gewechselt.
- Neue Waffe Granatwerfer (selten bei der Bundeswehr, Bogenschuss, Explosion wie Handgranate).
- Radio als Lockmittel: abstellen, 75 s Lärm lockt Zombies und die Horde.
- Bundeswehr-Lager ist ein Safe House (solange es steht) mit 4 Vorratskisten; MG-Nester und Puma haben begrenzte Munition (400/200, einstellbar), leer holen 2 Soldaten Nachschub vom Container. WELT_VERSION 17.
- Größen vereinheitlicht: ein Regler „Menschengröße“ für alle Menschen (Mann, Frau, Survivor, Held, Heldin, Bots, Bewohner, Soldaten), „Zombiegröße“ im Verhältnis zu den Menschen, „Gesamtgröße“ für alles (Vorgabe 70 %); Helden-, Soldaten- und Leichengröße entfallen, Vorschau zeigt alle Figuren.

## 0.49.0 – 20.11.2026

- Zombiehorde zügiger und zusammenhängender: Marschtempo höher, folgt dem Weg stärker, weniger Wuseln und Hängenbleiben, seitliches Ausweichen.
- Engere Lücken passierbar: Kollisionskreis der Spieler 7 px (vorher 11), Zombies 9 px; Ausgänge sperren jetzt nach Richtung (gehaltene Taste führt nach dem Betreten nicht sofort wieder hinaus).
- Maschinengewehr: kommt beim Aufheben sofort in die Hand (lag vorher oft im Rucksack und schoss deshalb nicht) und ist häufiger (25 % in Munitionskisten).
- Handgranate: Wurfweite 200 statt 120 px, Explosionsradius 60 statt 40 px, mehr Schaden.
- Leere Kisten für den Spieler grau mit Kreuz; Kreuz/Rahmen sitzt genau auf dem Möbelbild; Sandsäcke vor dem Safe House in ordentlichen Reihen mit freiem Durchgang; Mündungsfeuer an der Rohrmündung des Puma.

## 0.50.0 – 20.11.2026

- Level 2 (Isarauen): Der Evakuierungspanzer ist jetzt ein Leopard 2A7 (Draufsicht aus einem 3D-Modell, Wanne und Turm getrennt). Der Turm dreht zum Ziel, das Lader-MG schießt selbständig auf Zombies in Reichweite (Leuchtspur, Mündungsfeuer, Kettenrasseln beim Fahren). Der Puma im Bundeswehr-Stützpunkt bleibt unverändert.
- Der Leopard überrollt Zombies, die er beim Fahren berührt (sofort tot, Blut und Leiche wie üblich); Spieler werden nie überrollt – er hält vor ihnen an.
- Verwaltung (Reiter Welt, Karte „Bundeswehr“): Leopard-MG-Reichweite, Schussfolge, Schaden und „überrollt Zombies“ einstellbar.
- Neue Evakuierungsart A400M (Vorbereitung für ein späteres Level, in keiner Karte fest eingestellt): Das Flugzeug landet auf einer langen freien Fläche der Karte, die Spieler steigen an der Heckrampe ein, dann fällt Triebwerk 3 aus (Brand, Rauch, Start abgebrochen). Alle müssen raus und zu Fuß zum markierten Hubschrauber-Landeplatz; dort landet ein Hubschrauber und holt die Gruppe ab (Levelwechsel). Kommt niemand rechtzeitig, fliegt er ab und kehrt nach einer Minute zurück.
- Verwaltung (Karte „Aufgaben & Evakuierung“): Evakuierungsart für die aktuelle Karte erzwingen (Bus / Panzer / Flugzeug), Vorgabe aus.
- Evakuierungsart je Karte jetzt als Zustand `evakArt` statt der festen Isarauen-Abfrage (client/evak.mjs); neue Dateien client/evakdarstellung.mjs, server/flugplatz.mjs.
- Grafik: Leopard 2A7 „Leopard 2A7 Trophy MBT – Bundeswehr (WARNO)“ von rran81 (Sketchfab „Free Standard“, nur Draufsichten im Repo) und A400M „Airbus+A400M“ von CloudHub (CC-BY 4.0); Hubschrauber selbst gezeichnet. Quellen in client/grafik/LIZENZ.txt.

## 0.48.3 – 20.11.2026

- Verwaltung: Fehler „wz is not defined“ beim Laden behoben (Schalter „Horde-Ziele anzeigen“).

## 0.48.2 – 19.11.2026

- Verwaltung: zwei Skriptfehler behoben („ZTYPEN/WFVORGABE is not defined“ beim Umsortieren der Karten, Akkordeon fand seinen Kopf nicht) – Zombietypen- und Waffenkarten werden wieder richtig einsortiert, Karten klappen sauber auf und zu.

## 0.48.1 – 19.11.2026

- Schützenpanzer Puma (Stützpunkt und Evakuierungspanzer in den Isarauen) als Draufsicht aus einem 3D-Modell statt gezeichnet: Wanne und drehbarer Turm getrennt, Turm sitzt wie im Original links hinter der Mitte, Mündungsfeuer an der echten Rohrspitze.

## 0.48.0 – 19.11.2026

- Startdialog vor Level 1: 5 Fähigkeitspunkte verteilen und einen Startgegenstand wählen (Pistole mit 12 Schuss, Taschenlampe, Brecheisen oder +1 Wasser); nur einmal je Runde, Bots wählen selbst.
- Neue Waffen: Armbrust (leise, 25 m, Pfeile bleiben am Einschlag liegen und lassen sich aufheben) und Scharfschützengewehr (75 m, hoher Schaden, langsam, laut); Werte in der Verwaltung.
- Maschinengewehr und Scharfschützengewehr jetzt auch in Munitionskisten der Bundeswehr (12 % bzw. 8 %); Polizeiwachen (falls auf der Karte) mit Waffenschrank. WELT_VERSION 16.
- In etwa jeder fünften Wohnung liegt eine Leiche (durchsuchbar).
- Nach dem Levelwechsel starten alle Spieler und Bots im selben Safe House.
- Evakuierungsbus und -panzer feuern während der Evakuierung auf Zombies in der Nähe.
- Anzeige „Uhrzeit · Tag N“; Soldatengröße mit eigenem Regler (Bezug: Held).

## 0.47.1 – 19.11.2026

- Horde-Ziele sichtbar (Verwaltung „Horde-Ziele anzeigen“ oder ?debug): Zielfahne mit Namen, Linie von der Hordenmitte, Countdown bis zum Zielwechsel, letzte 5 Zielwechsel mit Grund; jeder Zielwechsel steht im Add-on-Protokoll.
- Klarere Ziele: Lärm lenkt nur bei lautem Lärm (Granate, Puma) oder aus der Nähe um, höchstens alle 2–3 Minuten; festgefahren erst Umweg (15 s), neues Ziel nach 30 s.

## 0.47.0 – 19.11.2026

- Zombiehorde mit Zielen: Safe Rooms, Läden, Stützpunkt, Lärm, Menschengruppen, Nähe von Spielern, Kreuzungen; neues Ziel alle 2–5 Minuten oder bei Ankunft, Lärm lenkt um.
- Kein Gleichschritt mehr: eigenes Tempo, Schlängeln, Pausen und Taumeln je Zombie, lockere Schwarmbewegung mit Nachzüglern.
- Aufsplitten: Kommt die Horde Spielern, Bots, Soldaten oder Menschen nahe (Vorgabe 18 m), lösen sich Angriffstrupps (5–15 Zombies) und greifen an; der Rest zieht weiter. Spieler am Boden bleiben tabu.
- Neue Regler in der Verwaltung: Zielwechsel, Truppgröße, Angriffsreichweite.

## 0.46.4 – 19.11.2026

- Zombiehorde erscheint hinter dem Bildrand (auch der vorderste Zombie, für alle Spieler) und läuft dann ins Bild ein; auf kleinen Karten schrittweise näher.

## 0.46.3 – 19.11.2026

- Zombiehorde bis 1000 Zombies (bisher 300), Regler in der Verwaltung entsprechend; Zustandspuffer vergrößert (Lasttest: ~1000 Zombies, Servertakt im Mittel 2,5 ms).

## 0.46.2 – 19.11.2026

- Versionsabgleich: Lief die App über ein Update hinweg im Hintergrund weiter (alter Code im Speicher, dadurch verschobene Welt), lädt sie vor dem Anmelden bzw. beim Zurückkehren selbst neu und tritt wieder bei. /info nennt dafür die Server-Version.

## 0.46.1 – 19.11.2026

- Neues Favicon und App-Icon: freigestellter Zombie (Hintergrund entfernt), Favicon 16/32/48, App-Icons 192/512, Maskable-Icon und Apple-Touch-Icon mit dunklem Hintergrund.

## 0.46.0 – 19.11.2026

- Möbel echter: alle 28 Möbelarten als Gemini-Bilder von oben (Wohnung, Küche, Bad, Laden, Keller, Safe Room, Bundeswehr), mit der Rückseite zur Wand gedreht; Werkzeug tools/gemini_moebel_schneiden.py.
- Flussufer glatt: geglättete Uferlinie mit Kiesrand und Wellen statt Kachelstufen (nur Darstellung, Kollision unverändert).

## 0.45.0 – 19.11.2026

- Welt auf Server und Geräten wieder gleich: Drei Sortierungen mit Zufallsvergleich (Straßensperren, Mülltonnen) hingen von der JS-Engine ab – der Server (Node 22) baute Sperren, Müll und Kisten woanders als die Geräte (Chrome). Jetzt festes Mischen; WELT_VERSION 15. Dadurch auch kein Zurückspringen auf die Anmeldung mehr; nach einem nötigen Neuladen tritt das Spiel automatisch wieder bei.
- Heldenwahl gilt schon beim ersten Login; alle Spieler-Einstellungen werden je Spieler auf dem Server gespeichert und gelten auf jedem Gerät.
- Evakuierungsbus: unterwegs überall einsteigen, Mitfahrer fahren mit; Abfahrt, sobald alle echten stehenden Spieler an Bord sind (Bots und Liegende kommen ohnehin mit), sonst nach der Wartezeit.
- Soldaten kämpfen wie Bots: bleiben in Stellung, richten sich aus, weichen aus, gehen erst nach einer ruhigen Weile auf ihren Posten zurück.
- Zählung unter der Eckkarte („N von dir · M gemeinsam“), weißer Ring um die eigene Figur ersetzt durch dezenten Lichtschein, Heldengröße einstellbar (Vorgabe 85 %), Durchsucht-Kreuz über das ganze Möbelstück, Chat-Klingelton lauter mit Vibration.

## 0.44.1 – 19.11.2026

- Weltprüfung: Jedes Gerät meldet nach dem Aufbau einen Fingerabdruck seiner Welt (Häuser, Behälter, Stützpunkt-Kisten, Tor, Start). Weicht er vom Server ab (Kisten/Wände stünden woanders), lädt das Gerät einmal neu; hilft das nicht, kommt ein Hinweis. Der Server schreibt Gerät, Karte, Größe, Seed und Autos ins Protokoll.

## 0.44.0 – 19.11.2026

- Evakuierungsbus/-panzer fährt los, sobald alle Lebenden an Bord sind (Bots und Liegende zählen mit), spätestens nach einer einstellbaren Zeit in echten Minuten (aufgaben.wartenEchtMin, Vorgabe 10); bisher wartete er nur 60 Spielminuten = 2 echte Minuten.
- Abholstelle sichtbar, sobald die Pflichtaufgaben erledigt sind: 📍 „Abholung“ mit 100-m-Wartekreis auf Karte und Eckkarte, rotes Leuchtsignal mit Rauch in der Welt, Meldung an alle.
- Gepanzerter Schulbus: gelb-orange mit Warnstreifen, Gittern und Stahlplatten, Gewehrläufe aus den Fenstern, rotes „EVAKUIERUNG“ auf dem Dach, blinkende Rundumleuchte; der Evakuierungspanzer in Level 2 mit Leuchte und Fahne.
- Ladeanzeige „Generiere Welt … %“ beim Anmelden, beim Levelwechsel „Level abgeschlossen! Generiere nächstes Level …“.
- Chat am PC schmal am rechten Rand (Handy weiter Vollbild).
- Panzer-Schussfolge bis 0,1 s; Hilferufe etwa doppelt so oft, Krankenwagen alle 1–2,5 Minuten.

## 0.43.0 – 19.11.2026

- Held und Heldin (Gemini-Grafik) als zusätzliche Figuren: Haltung je Waffe (leer, Pistole, Gewehr, Messer), jeweils mit oder ohne Taschenlampe, eigene Stiefel-Ebene zum Stehen, Gehen und Laufen; Haar- und Kleidfarbe bleiben wählbar.
- Zielorte offener Aufgaben (Apotheke, Lebensmittel, Kaufhaus) als Symbole auf der großen Karte und als Punkt auf der Eckkarte.
- Zombies lassen Spieler am Boden in Ruhe und ziehen weiter, damit Mitspieler sie retten können.
- Horden ziehen dauerhaft weiter (neue Ziele im Ort, nicht am Kartenrand); einzelne Zombies spalten sich ab.
- Ansteckung bei Berührung je Level einstellbar.
- Neue Töne: Hilferufe, ferner Krankenwagen, leere Truhe.
- Panzer-Schussfolge bis 0,2 s; Soldaten können sterben (sind alle tot, fällt das Lager), der Puma bleibt bis zum Fall unverwundbar; bei Angriffen rückt höchstens die Hälfte der Soldaten aus, mindestens 2 halten Wache.
- Evakuierungsbus fährt sichtbar ein, wartet (Wartezeit einstellbar) und fährt wieder aus; in Level 2 kommt ein Evakuierungspanzer.
- Warten am Abholpunkt: Ist der Funkspruch abgesetzt, sind die Pflichtaufgaben erledigt und stehen alle Lebenden im Umkreis von 100 m um den Ortsausgang, vergeht die Zeit schneller (Faktor 6, Einstellung aufgaben.warteRaffer).
- Zaunlücken breit genug zum Durchgehen (mindestens 72 px); Bürgersteige nur im bebauten Gebiet. WELT_VERSION 14.
- Safe Rooms: Möbel und Kisten werden auf alle Räume verteilt statt in einen gestopft.
- Weltaufbau: Zugangssuche ohne Array.shift (gleiches Ergebnis).

## 0.42.0 – 19.11.2026

- Einheitliche Figurgrößen: jedes Bild bekommt einen eigenen Ausgleich (client/groessen.mjs, gemessen mit tools/groessen_messen.py); Bewohner so breit wie der Survivor, alle Zombie-Typen etwa 10 % breiter, Leichen passend lang. Die Größenregler wirken auf diese Grundgröße, Vorschau und Spiel rechnen gleich.
- Verbindung beendet: Hinweis antippen lädt neu (in der installierten App geht Herunterziehen nicht); kommt die App aus dem Hintergrund zurück, lädt sie von selbst neu.
- Drei Türarten für verschlossene Zimmertüren: frei, nur per Rätsel (❓), nur mit Schlüsselbund (🔑); Anteile in der Verwaltung (Vorgabe 50/25/25 %); Brechstange öffnet keine verschlossenen Zimmertüren mehr.
- Viele Zombies: höchstens 8 Geräusche gleichzeitig (4 Zombie-Laute), Mindestabstand je Geräusch, nur die 6 nächsten Zombies stöhnen; ab 25 Zombies in Hörweite ein Horden-Grollen. Zombies, Leichen und Menschen außerhalb des Bildes werden nicht gezeichnet. Mit ?debug: FPS und sichtbare Zombies.

## 0.41.0 – 19.11.2026

- Neue Chat-Nachrichten mit Handy-Benachrichtigungston; Chat über den ganzen Bildschirm; Tastatur auf dem Handy erst beim Antippen des Eingabefelds.
- Eckkarte, Symbolleiste und Uhrzeit ganz oben; Safe-Room-Infofeld (Barrikade, Ausruhen) unter der Uhrzeit.
- Verwaltung: Größenvorschau zeigt Survivor, Bewohner, Zombie und Leiche im Spielmaßstab mit sichtbarer Größe in Spielpixeln.

## 0.40.1 – 19.11.2026

- Safe Rooms auf der Karte deutlicher: grünes Haus, grüner Kreis mit Schild, auf der großen Karte „SAFE“.

## 0.40.0 – 19.11.2026

- Großer Aktionsknopf wieder entfernt: normale Aktionsknöpfe rechts über dem Inventar.
- Symbolleiste (⭐ 💬 🎤 Zoom ⚙️) rechts oben über der Eckkarte statt ☰-Menü, Uhrzeit unter der Eckkarte.
- Aufgaben ganz oben links über den Balken; die aufgeklappte Liste liegt deckend über allem.

## 0.39.0 – 19.11.2026

- Gesundheit, Wasser und Hunger als drei Balken oben links (blinken unter 20 %).
- Spielerliste eingeklappt als farbige Punkte (rot blinkend am Boden, grau bei AFK/Bot).
- Eckkarte wieder in voller Größe, halbtransparent (Stufe wählbar).
- Großer, verschiebbarer Aktionsknopf (rechts in der Bildmitte), weitere Aktionen bei langem Druck.
- Neue Spieler-Einstellungen (⚙️): Lautstärke, Aktionsknopf verschieben/zurücksetzen, Kartentransparenz.
- Meldungen unten direkt über dem Inventar.
- Verwaltung: Größe der Zombies und Leichen verständlicher (Einzelregler, Global ±50 % mit Knöpfen, Ergebniszeile) und große Vorschau.

## 0.38.0 – 19.11.2026

- Handy: Inventar als schmale Leiste ganz unten, Aufgaben als Knopf (pulsiert bei neuen), Spielerliste einklappbar, Kopfleisten-Knöpfe im ☰-Menü, kleinere Karte, höchstens 2 Meldungen.
- Zoom-Knöpfe nur noch am PC (Touch: Zwei-Finger-Zoom).
- Ton insgesamt leiser (etwa 45 %), 🔊-Knopf schaltet 100/50/25 %/stumm und merkt sich die Stufe.
- Startseite auf dem Handy scrollbar und kompakter, das Namensfeld bleibt beim Tippen sichtbar.

## 0.37.0 – 19.11.2026

- Verwaltung: Gesamtgröße für Zombies und Leichen (−50 % … +50 %), Zombie-Lebenspunkte einstellbar (Kriecher 35 % davon).
- Verwaltung: bei jeder Waffe, beim MG-Nest und beim Puma live „Treffer bis Tod“ (normal/überrascht) und Schaden pro Sekunde.
- Verwaltung: alle Zeitangaben mit Einheit (echte Zeit oder Spielzeit mit Umrechnung bei aktueller Tageslänge).

## 0.36.0 – 19.11.2026

- Verwaltung: Zombie- und Leichengröße getrennt einstellbar (50–200 %) mit Live-Vorschau neben einer Spielerfigur, Vorschau-Typ wählbar.
- Verwaltung als Akkordeon: je Reiter ist nur ein Abschnitt offen, der zuletzt geöffnete wird gemerkt.

## 0.35.0 – 19.11.2026

- Eigene Totenbilder (mit Google Gemini erzeugt) für 15 Zombie-Typen, jeweils passend zum lebenden Zombie, mit Blutlache; Tarn-Zombie mit neuem Totenbild.

## 0.34.0 – 19.11.2026

- Keine lauten Schüsse und Schreie mehr direkt nach dem Beitritt (Ortstöne erst, wenn die eigene Position bekannt ist).
- Blutspritzer bei Spielertreffern auf Zombies, auch in Gebäuden.
- Innenräume: Möbel auf alle Zimmer verteilt, meist mit der Längsseite an der Wand, mit Abstand zueinander (Welt wird neu gebaut).
- Neue Zombies kleiner und mit Armen.
- Puma fährt frei im Lagerinneren zum Hotspot mit den meisten Zombies (alle Seiten), fährt rückwärts statt zu wenden; Lager mit breiter Fahrgasse umgebaut.
- Munitionskisten der Bundeswehr: für jeden Mitspieler 100 Schuss, eine Schusswaffe und eine Taschenlampe.
- Verwaltung: Töne nach Bereichen gruppiert, Mehrfachauswahl je Ereignis mit nur passenden Dateien und Probehören; Vorschaubilder bei den Zombietypen.

## 0.33.0 – 19.11.2026

- Zombiewellen bis 300; der Server rechnet Zombies und Menschen fern aller Spieler nur jeden 4. Takt, nutzt ein Raster für Nähe-Suchen und baut das Wegefeld nur bei Bedarf neu (auf dem PC etwa 2,5× weniger Rechenzeit je Takt).
- Untätige Spieler: nach 60 s ohne Eingabe steuert die Bot-Logik die Figur (folgt, wehrt sich, versorgt sich), 🤖 am Namen; die nächste Eingabe gibt die Kontrolle zurück.
- Fähigkeiten: Erfahrung und Level, je Aufstieg ein Punkt für Zielen, Tempo, Leben, Ausdauer, Leise, Sanitäter, Tragen (je 5 Stufen, ⭐ bzw. Taste K); in der Verwaltung abschaltbar, mit XP-Faktor.
- Bundeswehr: größerer Puma, der hinter dem Draht patrouilliert und zu den Angreifern fährt; Fetzen bei Treffern; nachts Scheinwerfer auf die Angriffsstellen und Lampen im Lager.
- Aufheben mit Auswahl, wenn mehrere Dinge beieinander liegen; bei vollem Rucksack wählbar, was abgelegt wird.
- 18 neue Zombie-Typen (mit Google Gemini erzeugt), in der Verwaltung einzeln schaltbar.
- Neue Töne: Durst (Männer- bzw. Frauenstimme), Schrotflinte, Kettenrasseln des Puma, Hülse fällt in Räumen.

## 0.32.0 – 19.11.2026

- Verwaltung: Schaden und Schussfolge je Waffe, Schussfolge des Puma (Vorgabe 2,5 s), Zombietypen einzeln an/aus, Ansteckung der Spieler in %, Verwandlungszeit der Menschen in Spielminuten.
- Zombies verfolgen Menschen gezielt; ein Biss genügt, Menschen fliehen langsamer.
- Tod: volle Werte nach dem Aufwachen, die gesamte Ausrüstung bleibt einen Spieltag am Sterbeort liegen.
- Innenräume: Möbel berühren sich nicht mehr über Eck; Bad/Toilette oft mit Wasser; Safe-Room-Kühlschrank als Notvorrat (unter 30 %, einmal je Spielstunde).
- Mülltonnen mit Essen, Seil, Wasser.
- Bundeswehr: Munitionskisten mit eigenem Inhalt für jeden Mitspieler; Tausch bei Soldaten und Arzt mit höchstens 3 Gegenstandstypen oder 6 richtigen Rätseln am Stück.
- Karte: etwa 15 % weniger Zäune und Hecken, Durchgang zwischen Nachbarhäusern; Fluss geglättet (Welt wird neu gebaut).
- Startmusik beginnt sofort (bzw. bei der ersten Berührung, wenn der Browser blockiert).
- Wer den Tab über 5 Minuten im Hintergrund hat, wird abgemeldet, damit der Server ruht; beim Zurückkommen lädt die Seite neu.

## 0.31.0 – 19.11.2026

- Evakuierungsbus auf Karte und Eckkarte auffällig (pulsierendes Bussymbol mit Ring); Mitspieler am Boden als blinkendes rotes Kreuz.
- Meldungen kleiner, halbtransparent, ganz oben und kürzer sichtbar.
- Bildschirmtastatur verdeckt Chat und Eingaben nicht mehr (visualViewport).
- Rätsel: richtige Antwort nur kurz bestätigt, dann schließt sich das Fenster bzw. die nächste Frage folgt.
- Ton pausiert, wenn der Tab im Hintergrund oder das Handy gesperrt ist (Sprachchat läuft weiter).
- Dämmerung: weicher, neutraler Übergang über eine Spielstunde; Nachtdunkelheit draußen einstellbar (Vorgabe 92 %).
- Treppen: Ebenenwechsel löst schneller aus; nach jedem Wechsel 1 s Schutz vor Bissen, und in ca. 18 m um den Ankunftspunkt entstehen keine Zombies.

## 0.30.0 – 18.11.2026

- Bundeswehr verteidigt den Stützpunkt: MG-Nester feuern Salven, der Puma dreht den Turm und schießt, jeder Soldat
  schießt von seinem Posten mit dem Gewehr – auf alle Zombies in der Nähe, auch auf die, die ins Lager gelangen. Die
  Soldaten bleiben im Lager. Die Abschüsse zählen nicht für die Aufgabe „Zombies erledigen“
- Der Stützpunkt fällt nach einigen Spieltagen (Einstellung „Bundeswehr“, Vorgabe 3, 0 = nie): dann stehen Zombies an
  den Posten, die Kisten bleiben plünderbar
- Neue Waffen nur bei der Bundeswehr: Handgranate (Taste Q oder zweiter Knopf, Explosion nach 2 s), Maschinenpistole,
  Maschinengewehr (MG-Träger laufen langsamer); Munition bis 150
- Tauschen mit Ärzten (Verband, Spritze) und Soldaten im Lager (Handgranate, 100 Schuss) zu festen Preisen; Ärzte
  heilen in ihrer Nähe; Feldbetten im Sanitätszelt zum Ausruhen; Funkspruch auch im Funkzelt
- Bots arbeiten selbständig an den Aufgaben: je Mensch bleibt ein Begleiter, die anderen sammeln Wasser, Essen,
  Medizin und Bretter und bringen sie in die Safe-Room-Kiste, setzen den Funkspruch ab, jagen Zombies und gehen zum Bus.
  Sie sagen im Chat, was sie tun, und folgen Befehlen: „Resi, hol wasser“, „alle folgt mir“, „Sepp, bleib hier“,
  „Vroni, funk“, „Resi, frei“
- Bots räumen die Vorratskiste nicht mehr aus: Sie nehmen nur, was sie gerade dringend brauchen, und nie die
  Vorräte für die Aufgabe
- Bots nehmen Geschenke an (z. B. eine Ersatz-Taschenlampe); bei vollem Rucksack sagen sie es
- Ton: ungültige Positionen können die Tonausgabe und das Bild nicht mehr anhalten

## 0.29.0 – 18.11.2026

- Aufgaben und Evakuierung: Jede Runde hat gemeinsame Aufgaben (Pflicht: Funkspruch am Funktisch eines Safe Rooms;
  dazu z. B. Vorräte in die Kiste, Medizin holen, Zombies erledigen, Tor öffnen). Mit Funkspruch kommt um 18 Uhr ein
  gelber Evakuierungsbus zum Ortsausgang und wartet; wer an Bord ist und genug Aufgaben geschafft hat, fährt ins
  nächste Level (Geretsried ↔ Isarauen). Aufgabenliste links oben (📋), Bus auf der Eckkarte; Einstellungen
  „Aufgaben & Evakuierung“
- Bundeswehr-Stützpunkt (Aufbau): je Karte eine Feldstellung mit S-Draht und Durchfahrt, Schützenpanzer Puma,
  Sandsackstellungen, MG-Nestern, Sanitätszelt mit Feldbetten, Verwundeten und Ärzten, Funkzelt und Lager mit
  Munitionskisten, Container und LKW; Kisten durchsuchbar, ✚ auf der Eckkarte
- Zombiewellen: alle 20 Spielminuten (einstellbar) zieht eine Gruppe von 20–50 Zombies von Westen oder Osten quer
  durchs Bild; Zombies laufen unterschiedlich schnell (±10 %)
- Sirene: Blaulicht-Fahrten viel seltener (Einstellung aus/selten/normal), Sirene nur in der Nähe und nur während der
  Fahrt
- Mehr und größere Bäume; Baumkronen sind durchscheinend und verdecken keine Figuren mehr; Blumenbeete entfernt
- Viele neue Autos (OpenGameArt: Unlucky Studio, looneybits, TRBRY, Cliipso), Polizei mit Blaulicht-Bildern, echte
  Laster
- Tag- und Nachtbeginn einstellbar (Dämmerung je 2 Stunden davor)
- Einstellungsseite in Reitern (Spiel, Zombies, Welt & Ausbruch, Funde & Waffen, Sprache & Töne, Aufgaben, Test &
  Neustart) – Gliederung mit DeepSeek erarbeitet
- Die Welt wird einmal neu erzeugt

## 0.28.0 – 18.11.2026

- Safe Rooms als Notlager: Feldbetten, Vorratsregale und Erste-Hilfe-Kasten (durchsuchbar), Funktisch, Generator,
  Kanister; wer neben einem Feldbett stillsteht, ruht (💤: Leben steigt, Hunger und Durst sinken langsamer);
  Sandsäcke vor der Haustür
- Türen: Zombies folgen Spielern durch offene Haustüren in jedes Haus. Geschlossene Haus- und Zimmertüren müssen sie
  erst zerbrechen (Barrikade zuerst, dann die Tür); zerbrochene Türen bleiben offen. Jede Tür lässt sich mit
  Brettern verbarrikadieren; zweiter Aktionsknopf (z. B. „Haustür schließen“ neben „verbarrikadieren“)
- Level 2 „Isarauen“ (Wolfratshausen/Gelting) mit Isar, Brücke und 5 Safe Rooms, in der Verwaltung wählbar;
  Wasserrauschen in der Nähe von Wasser
- Karte: dezente Gehwege, Blumenbeete, Mülltonnen (grau, gelb, grün, braun, blau) an den Häusern, Container und
  Glas-Iglus zum Durchsuchen, 1–2 Straßensperren (Autos fahren außen herum), Parkbuchten mit freien Plätzen
- Bots: kein Stau mehr an Türen, folgen dem Menschen vor Kiste/Ablegen, Gegenangebote beim Tauschen (nie die einzige
  Waffe), gehen langsamer durch Hecken und über Holzzäune – Zombies ebenso; Metallzäune und Mauern bleiben dicht
- Durchsuchen geht schneller (Schrank 1,5 s, Auto 2,2 s, Leiche 0,9 s)
- Laster im Verkehr, ein neues Auto-Modell (CC0) in 8 Farben, Polizisten unter den Stadtbewohnern
- Startseite: bei http-Adressen Link zur https-Adresse (neue Option externe_adresse)
- Kamera folgt der Figur auch, wenn man im Safe Room startet (0.27.1)
- Die Welt wird einmal neu erzeugt

## 0.27.0 – 18.11.2026

- Startseite fragt gleich nach dem Mikrofon und zeigt den Stand (erlaubt, gesperrt – mit Hinweis, wie man es
  freigibt). In der Home-Assistant-Seitenleiste erlaubt der Browser kein Mikrofon: dann ein Link, um das Spiel im
  eigenen Fenster zu öffnen
- Danach wird „📲 Als App installieren“ angeboten (iPhone: Hinweis „Teilen → Zum Home-Bildschirm“); App-Symbole als
  PNG, Service Worker mit Hinweisseite ohne Netz
- Sprache: Ausweichweg über den Server, wenn keine direkte Verbindung zustande kommt (z. B. im Mobilfunk) – Opus über
  WebCodecs, sonst 8-kHz-μ-law; weitergeleitet wird nur in Hörweite oder per Funkgerät; Meldung „📡 Verbindung läuft
  über den Server“
- Chat: Am PC kamen W, A, S, D, E, Leertaste und Umschalt nicht im Eingabefeld an – behoben
- Große Karte: passt jetzt ganz ins Fenster (Zoom-Knöpfe waren unten abgeschnitten), +/− zoomen um die Mitte des
  Ausschnitts, Verschieben bleibt in der Karte, Zwei-Finger-Zoom springt nicht mehr

## 0.26.0 – 18.11.2026

- Sprechen mit den Mitspielern, dauerhaft an (direkt von Gerät zu Gerät, WebRTC). Beim Start fragt der Browser nach
  dem Mikrofon (nur über HTTPS); ohne Mikrofon hört man die anderen trotzdem. Knopf 🎤 oben rechts schaltet stumm,
  über sprechenden Figuren erscheint 🔊. Kopfhörer vermeiden Echo
- Lautstärke nach Lage: draußen voll bis 5 m, dann leiser bis zur Hörweite (40 m), links/rechts nach Richtung; im
  selben Haus und Stockwerk fast voll, anderes Stockwerk 35 %, drinnen ↔ draußen 10 % (nach Abstand zur Haustür),
  verschiedene Häuser stumm
- Neues Fundstück 📻 Funkgerät: Wer eins trägt, hört andere Funkgerät-Träger überall, mit Funkklang
- Einstellungen: neue Karte „🎙 Sprache“ (an/aus, Hörweite, Stockwerk, drinnen/draußen, Funk, „Reden lockt Zombies
  an“ – aus). Add-on-Optionen stun_server, turn_server, turn_username, turn_password für Verbindungen von unterwegs

## 0.25.0 – 18.11.2026

- Text-Chat für alle Mitspieler, egal wie weit weg: Knopf 💬 oben rechts mit Zähler für Ungelesenes, Fenster wie
  WhatsApp (eigene Nachrichten rechts, Uhrzeit und Ort des Absenders). Der Verlauf (letzte 100 Nachrichten) wird mit
  der Welt gespeichert; neue Nachrichten erscheinen bei geschlossenem Fenster kurz als Meldung. Beim Tippen bewegt sich
  die Figur nicht
- Parkbuchten an Wohn- und Nebenstraßen; etwa 90 % der geparkten Autos stehen in Buchten oder auf Parkplätzen, der
  Rest längs am Fahrbahnrand. Die Welt wird einmal neu erzeugt

## 0.24.0 – 18.11.2026

- Safe Rooms sind jetzt echte Innenräume: Man betritt sie durch die Haustür wie andere Häuser. Drinnen ist es immer
  hell, alle Türen sind offen, es gibt keine schlafenden Zombies und keine Treppen. Die Vorratskiste steht drinnen
  (als Holzkiste), oben steht der Name des Safe Rooms
- Barrikade: Die Eingangstür wird von innen verbarrikadiert (Bretter sind drinnen an der Tür zu sehen, draußen wie
  bisher). Zombies hämmern draußen dagegen; ist die Barrikade weg und jemand drin, dringen sie ein
- Aufwachen, Weiterspielen nach dem Abmelden und „alle erwischt“ führen in den Innenraum des Safe Rooms
- Bots nutzen die Vorratskiste: Im Safe Room legen sie Überzähliges hinein und nehmen heraus, was ihnen fehlt;
  ohne Mitspieler warten sie im Safe Room
- Die Welt wird einmal neu erzeugt (neue Weltversion)

## 0.23.2 – 18.11.2026

- Neue Einstellung „Biss-Chance bei Stadtbewohnern“ (Tag, Nacht, Ausbruch): Bei Berührung versucht ein Zombie einmal
  pro Sekunde zu beißen; 100 % wie bisher, 0 % nie
- Meldungen erscheinen klein oben unter der Anzeige statt mitten im Bild, höchstens drei auf einmal
- Geparkte Autos stehen gerade längs am Straßenrand, nach der Straße ausgerichtet (auch Wrack und offener Kofferraum)
- Fahrende Autos und Busse halten Abstand zum Vordermann statt übereinander zu fahren; steht der Vordermann länger
  als 5 s, wird vorbeigefahren. Busse halten nicht mehr vor Haustüren
- Bots heben brauchbare Dinge vom Boden auf (z. B. was ein Mitspieler fallen lässt), legen Überzähliges ab und legen
  aufgehobene Munition ein
- Der neue Zombie, der rückwärts lief, läuft jetzt vorwärts; die neuen Zombies hinterlassen wieder die bisherigen Leichen

## 0.23.1 – 18.11.2026

- Handy: Der Figurenbogen ist kleiner (4000×1760 statt 2688×5152 Pixel, WebP 0,5 MB statt 2,8 MB). Viele Handys laden
  Texturen nur bis 4096 Pixel, die neuen Figuren hätten dort gefehlt; außerdem braucht er viel weniger Grafikspeicher
- Flüssiger beim Laufen durch die Stadt: Kartenstücke sind kleiner (512 statt 1024 Pixel) und werden verteilt auf zwei
  Bilder gebaut, die Wiese wird viel schneller gezeichnet und Dachbilder werden gemerkt. Längstes Bild beim Durchfahren
  am PC 19 ms statt 65 ms
- Feine Linien an den Nähten der Kartenstücke beseitigt
- Server: Stadtbewohner gehen zu nahen Läden und Haltestellen und suchen höchstens einen Weg je Takt (Spitzen 22 → 5 ms
  am PC); Wegsuche der Bots begrenzt
- Einstellungsseite: „Leistung des Servers“ unter „Gerade im Spiel“ zeigt die Rechenzeit je Spieltakt und Teil; dazu
  einmal pro Minute eine Zeile im Add-on-Log

## 0.23.0 – 18.11.2026

- Neue Spielfigur „Survivor“ zur Auswahl auf der Startseite: eigene Animationen für Stehen, Laufen (mit Füßen),
  Schießen, Nahkampf und Nachladen, je nach Waffe Pistole, Gewehr, Schrotflinte oder Messer; Bots nehmen sie manchmal
- Zwei neue Zombiearten, eine davon mit Sterbeanimation (die Leiche bleibt liegen)
- Stadtbewohner als eigene Bürgerfiguren mit Laufanimation
- Mündungsblitz als Bild statt gezeichnetem Blitz
- Grafiken von OpenGameArt (Riley Gombart, KonitaTutorials, Survivor Spine); Namensnennung in grafik/LIZENZ.txt,
  README und auf der Startseite

## 0.22.1 – 18.11.2026

- Neue Geräusch-Ereignisse mit Tondateien: Schüsse je Waffe (Pistole, Jagdgewehr, Schrotflinte), Tür auf und zu,
  Auto fährt vorbei, Autoradio (läuft in jedem dritten fahrenden Auto, lauter beim Vorbeifahren), Startmusik (nach
  dem ersten Antippen der Startseite, blendet beim Spielbeginn aus), Funkgerät-Klick bei wichtigen Meldungen,
  Wasser (für Level 2)

## 0.22.0 – 18.11.2026

- Feines Kollisionsraster (1 m statt 4 m) draußen: Man stößt genau an der gezeichneten Hauswand und am gezeichneten
  Zaun bzw. an der Hecke an, schmale Durchgänge zwischen Häusern bleiben begehbar
- Jede Haustür bleibt ohne Klettern erreichbar (wird beim Start geprüft und notfalls geöffnet)
- Drübersteigen klappt auch, wenn man schräg an einem Zaun entlangrutscht – es zählt, wie lange direkt vor einem
  ein Zaun ist
- Bots und Bewohner meiden bei der Wegsuche Stellen, die im feinen Raster versperrt sind

## 0.21.2 – 18.11.2026

- Haustüren zeigen zur Straße statt zum Fußweg zwischen zwei Häusern (35 Türen verlegt, 18 Häuser mehr betretbar);
  die Welt beginnt deshalb einmal neu (Rucksäcke bleiben)
- Beim Drübersteigen gleitet die eigene Figur in einem kurzen Hüpfer hinüber, statt dass das Bild springt

## 0.21.1 – 18.11.2026

- Drübersteigen per Knopf: An Hecke, Zaun oder Gartenmauer zeigt der Aktionsknopf (Taste E) „Über die Hecke steigen“;
  automatisches Klettern klappt jetzt auch, wenn man schräg dagegenläuft
- Polizei und Feuerwehr fahren mit Dauersirene – sie blendet mit der Entfernung ein und aus, kommt aus der richtigen
  Richtung und ändert beim Vorbeifahren die Tonhöhe; ohne zugeordnete Datei ein echtes Martinshorn
- Feuer echter: Flammenzungen an mehreren Brandherden, heller Kern, Funkenflug, Rauchsäule, flackernder Schein;
  dazu Brandrauschen und lauteres Knistern in der Nähe

## 0.21.0 – 18.11.2026

- Brände: In der Anfangsphase (einstellbar, Vorgabe die ersten 20 Minuten) fängt etwa jede Minute ein Haus, ein
  geparktes oder fahrendes Auto oder ein Bus Feuer – mit Flammen, Rauch, Knistern und Lichtschein in der Nacht. Feuer
  verletzt Spieler und verbrennt Zombies; Autos und Busse bleiben als Wrack, Häuser als Ruine. Brennende Häuser kann man
  nicht betreten
- Verkehr: Am Anfang fahren Autos vor allem auf den Hauptstraßen (Anzahl und Dauer einstellbar), ab und zu rasen
  Polizei und Feuerwehr mit Blaulicht und Sirene durch – die Feuerwehr fährt zum Brand
- Alle Fahrzeuge fahren auf den echten Straßenlinien auf der rechten Spur, ohne Zick-Zack, und halten vor Menschen
- Gartenzäune und Hecken als glatte Linien statt Treppen; über Hecken, Zäune und Gartenmauern steigen, indem man etwa
  eine Sekunde dagegenläuft
- Durchsuchte Schränke und Spinde zeigen offene Türen (leer: ausgegraut), durchsuchte Autos einen offenen Kofferraum
- Sichtkegel der Zombies ausblendbar (Vorgabe: aus); automatische Schussreichweite je Schusswaffe einstellbar
- Zoomen mit zwei Fingern am Handy
- Neue Töne: Schrei, wenn ein Bewohner gebissen wird; Sirene; eigenes Ereignis „Feuer bricht aus“
- Menschen zittern nicht mehr an Zäunen und Hindernissen und laufen nicht mehr ineinander

## 0.20.2 – 18.11.2026

- Bots durchsuchen gezielt den Schrank, zu dem sie gehen – vorher blieben sie hängen, wenn ein verschlossenes Auto oder
  eine Tür näher lag

## 0.20.1 – 18.11.2026

- Wasser gibt es dort, wo man es erwartet, um die Hälfte häufiger: Lebensmittelläden, Kaufhäuser, Gaststätten und
  Eisdielen (Kaufhäuser haben jetzt überhaupt Wasser)
- Haustüren sitzen genau auf der echten Hauswand, entlang der Wand gedreht und unter dem Dachüberstand sichtbar

## 0.20.0 – 18.11.2026

- Ausbruch: In Geretsried leben 50 Menschen (einstellbar). Sie gehen von zu Hause zum Einkaufen in echte Läden, zum
  Platz und zur Bushaltestelle und verschwinden in Häusern; ein Linienbus fährt die Haltestellen ab und nimmt Wartende mit
- Zu Beginn sind nur wenige Zombies in der Stadt. Zombies jagen Menschen; Gebissene werden grünlich und verwandeln sich
  nach 5 Minuten (einstellbar) selbst in Zombies – Menschen fliehen, wenn sie Zombies sehen
- Solange viele Menschen gesund sind, kommen weniger Zombies aus dem Umland – die Gefahr wächst mit dem Ausbruch;
  Zombies aus der Stadt verschwinden nicht mehr, wenn man weit weg ist
- Einstellungsseite: Menschenzahl, Ansteckungszeit und eine Anzeige, wie viele gerade gesund, gebissen oder Zombie sind

## 0.19.0 – 18.11.2026

- Viel mehr Details in Geretsried: jedes Wohnhaus hat einen Garten mit Hecke, Holz- oder Metallzaun oder Mauer und
  Gartentor zur Straße (Zäune versperren den Weg); in den Gärten Gartenhäuser, Pools, Trampoline, Blumenbeete,
  Sitzgruppen und Obstbäume
- Sportplätze mit Spielfeldlinien (Fußball, Basketball), Laufbahn, Spielplätze mit Schaukel, Rutsche, Sandkasten und
  Wippe, Parkplätze mit Parkbuchten, Friedhof mit Gräbern, Gewerbeflächen
- Mehr Flachdächer mit Lüftungsgeräten und Solarfeldern, Solaranlagen und Kamine auf Satteldächern
- Alleebäume an größeren Straßen, Bäume, Bänke, Mülleimer und Bushaltestellen aus OpenStreetMap
- Straßen so breit wie in echt (OSM-Breite und Spuren, sonst Bundes-, Staats- oder Kreisstraße, sonst Straßenart),
  Straßennamen und -nummern leicht sichtbar auf der Fahrbahn
- Bots durchsuchen Schränke, Kofferräume (mit Brechstange) und tote Zombies in der Nähe, nehmen bessere Waffen in die
  Hand und packen in größere Taschen um
- Die Welt beginnt wegen der neuen Karte einmal neu (Rucksäcke bleiben)

## 0.18.1 – 18.11.2026

- Straßen wie im Prototyp: schmalere Fahrbahn mit dunkler Kante, Gehweg nur angedeutet, Fußwege als helle Linien
- Zoomen: Knöpfe − und + oben rechts, Mausrad oder Tasten + und −; die Wahl wird gespeichert
- Schüsse zeigen nur noch Mündungsblitz und einen kurzen Feuerstrahl Richtung Ziel statt eines durchgehenden Strichs
- Sense schwingt breiter

## 0.18.0 – 18.11.2026

- Anschleichen: Wer schleicht oder still steht, kann sich von hinten an Zombies heranpirschen – sie merken es erst
  beim ersten Schlag. Der Überraschungsschlag macht viel mehr Schaden (Messer von hinten: ein Stich genügt)
- Getroffene Zombies greifen sofort an, statt erst zum Geräusch zu laufen; schleichende Spieler wecken schlafende
  Zombies in Häusern erst aus der Nähe
- Neue Waffen: Schrotflinte (trifft alle im Kegel, kurze Reichweite), Jagdgewehr (sehr weit, ein Schuss genügt meist),
  Sense (mäht alle Zombies im Bogen vor dir); Gewehre in Spinden, Schrotflinten auch im Kofferraum, Sensen in Schränken
- Alle Waffenwerte stehen in einer gemeinsamen Tabelle; Bots nehmen die neuen Waffen auch

## 0.17.1 – 18.11.2026

- Einstellungsseite: Zeitraffer-Knöpfe, Unsterblich-Schalter und die Namensliste zeigen nach dem Klicken sofort den
  gespeicherten Stand (blieben vorher auf dem alten stehen)
- Geräusche: Ankreuzen einer Tondatei wird jetzt gespeichert, auch bei schnellem Anklicken mehrerer Dateien
- Schalter „Jede Spielrunde mit frischer Welt beginnen“ wird richtig dargestellt (lag über dem Text)
- Die Seite übernimmt in der Seitenleiste die Farben des Home-Assistant-Designs (hell oder dunkel)

## 0.17.0 – 18.11.2026

- Neue Figuren: Zombies mit Laufanimation von oben – Tarnjacke, Dirndl, Feuerwehr, Hemd und Lederhose –, beim
  Zubeißen mit offenem Mund
- Neue Kriecher (vier Arten, im Wechsel ziehend) und neue tote Zombies mit Blutlache, passend zum Zombietyp
- Eigene Spielfigur: Auf der Startseite Mann oder Frau, Haarfarbe und Kleidungsfarbe wählen (mit Vorschau); die Wahl
  wird gespeichert und alle Mitspieler sehen dich so, je nach Waffe mit Pistole, Schläger oder Messer in der Hand
- Bots bekommen ein zufälliges Aussehen

## 0.16.0 – 18.11.2026

- Tag und Nacht: Spieluhr (ein Spieltag dauert einstellbar 48 Minuten), Dämmerung mit warmem Licht, nachts dunkel
  mit Straßenlaternen, erleuchteten Fenstern und einem kleinen Schein um jeden Spieler
- Taschenlampe leuchtet nachts auch draußen; tagsüber sind etwa 70 % der Häuser durch die Fenster hell (Keller nie)
- Nachts sind mehr Zombies unterwegs (einstellbar), Geräusche für Nachteinbruch und Zombieland bei Nacht
- Viel mehr geparkte Autos am Straßenrand und in Reihen auf den Parkplätzen, schöner gezeichnet; Menge einstellbar
- Kofferräume lassen sich nur noch mit Brechstange aufbrechen (dafür ist mehr drin); Brechstangen gibt es jetzt auch
  in Schränken und Kaufhäusern
- Einstellungsseite: neuer Abschnitt „Tag und Nacht“ mit Uhrzeit, Tageslänge, Zombies nachts und Autos

## 0.15.0 – 18.11.2026

- Geräusche aus Tondateien: Auf der Einstellungsseite lassen sich Dateien hochladen, probehören und Ereignissen zuordnen
  (Zombie stirbt, Kriecher, Zombie stöhnt, Zombie entdeckt dich, Stadtgeräusche, Zombieland Tag und Nacht, Nachteinbruch),
  jeweils mit eigener Lautstärke; bei mehreren Dateien wird zufällig gewählt
- Stadtgeräusche laufen draußen als Schleife (drinnen leise), ferne Zombies ertönen ab und zu aus wechselnder Richtung
- Ohne Zuordnung bleibt es bei den im Browser erzeugten Tönen

## 0.14.0 – 18.11.2026

- Einstellungsseite in der Seitenleiste „Zombies“: Zombies (Menge draußen, in Häusern, Tempo), Bots, Karte,
  Fundhäufigkeit, Zugangscode und frische Welt je Spielrunde – gilt sofort, ohne Neustart; „▶ Hier spielen“ öffnet das Spiel
- Testwerkzeuge auf der Einstellungsseite: Unsterblichkeit je Spieler und Zeitraffer (×5, ×10, ×60)
- „Welt neu starten“: Die Stadt beginnt neu, alle Mitspieler werden kurz getrennt; Rucksäcke bleiben auf Wunsch erhalten
- Übersichtskarte mit echten Umrissen von Häusern und Straßen, Zoom (+/−, Mausrad, zwei Finger), in der großen Ansicht
  verschiebbar, mit Maßstab und Straßennamen (beim Hineinzoomen und in der großen Ansicht)
- Bots bleiben nicht mehr in der Tür eines Safe Rooms stehen und sperren damit die anderen aus
- Beim Verlassen eines Hauses springt das Bild sofort zur Haustür, statt quer über die Karte zu ziehen

## 0.13.0 – 18.11.2026

- Übersichtskarte oben rechts: zeigt dich und alle Mitspieler in Geretsried (wer drinnen ist, steht an seiner Haustür),
  Safe Rooms und den Ortsausgang; antippen oder Taste M vergrößert sie mit Namen
- Geräusche, im Browser erzeugt (keine Tondateien): Schüsse, Schläge, Stöhnen naher Zombies (nach Richtung und
  Entfernung), Fauchen beim Entdecken, Türen, Durchsuchen, Aufheben, Biss, Schritte, Rätsel richtig/falsch, Wind draußen
  und Brummen drinnen; Lautsprecher-Knopf neben der Karte
- Räume hinter noch nie geöffneten Türen sind ganz schwarz, bis jemand die Tür öffnet
- Möbel stehen nicht mehr vor Türen und Treppen (eine Kachel rundum frei, zwei geradeaus)
- Echtere Stadt: Dächer folgen den echten Gebäudeumrissen aus OpenStreetMap, als Walmdach mit Graten, Ziegelreihen und
  Schatten (große Gebäude mit Flachdach); Straßen als glatte Bänder mit Gehweg, Bordstein und Mittellinie, dazu Fußwege,
  Parkplätze, Wald- und Sportflächen; Spielfeld und Kollision bleiben unverändert

## 0.12.0 – 18.11.2026

- Geschäfte: Verkaufsraum mit Regalreihen und Kasse, dahinter ein Lager
- Funde je Ladenart: Lebensmittel (PENNY, Getränkemarkt …) Konserven/Wasser/Schokoriegel, Apotheke und Drogerie
  (Rehmaus Apotheke, Rossmann) Verbände/Spritzen, Kaufhaus (TEDi, Woolworth, Spielwaren …) große Rucksäcke,
  Taschenlampen, Seile, Kleidung, Messer, Gaststätten Essen/Wasser/Messer
- Namen der Geschäfte und Einrichtungen stehen auf den Dächern

## 0.11.0 – 18.11.2026

- Phase C: Geretsried-Stadtmitte aus OpenStreetMap (etwa 1,1 × 0,8 km, 281 × 208 Kacheln à 4 m) ist die neue Standardkarte
  (Option `karte`: `geretsried` oder `dorf`); Kartendaten © OpenStreetMap-Mitwirkende, ODbL 1.0
- 293 betretbare Häuser mit echten Türen (auch seitlich), Garagen und Schuppen als geschlossene Blöcke
- Safe Rooms: Kirche Maria Hilf, Karl-Lederer-Schule, Franz-Marc-Schule, Pflegeheim St. Ursula
- Start auf dem Platz bei der Gaststätte Isarwinkel, Ortsausgang am westlichen Kartenrand, Autos und Busse auf den Straßen
- Große Karten werden stückweise gezeichnet (nur der sichtbare Teil), Dächer folgen dem Gebäudeumriss
- Zombies erscheinen im Umkreis der Spieler und verschwinden weit weg (große Karte bleibt leicht für den Server)

## 0.10.0 – 18.11.2026

- Neue Figuren: Menschen und Zombies aus dem Kenney-Paket „Topdown Shooter“ (CC0, kenney.nl), Haltung je nach Ausrüstung
- Bäume, Büsche und Felsen von oben (Kenney); Bäume sind kein Hindernis mehr (darunter kann man sich verstecken)
- Traktor von oben, Hochsitz entfernt, Busse auf den Straßen (versperren eine Spur, lassen sich durchsuchen)
- Ausrüstung braucht keinen Rucksackplatz: Waffe in der Hand, Taschenlampe und Kleidung werden beim Finden direkt
  angelegt, wenn frei – erst weitere Stücke wandern in den Rucksack
- Lichtkegel der Taschenlampe mit weichen Rändern, folgt der Laufrichtung ruhig statt zu zappeln

## 0.9.2 – 18.11.2026

- Der Ausgang liegt innen auf derselben Seite wie die Haustür draußen (oben bzw. unten) –
  man läuft nach dem Hinausgehen nicht mehr sofort wieder hinein
- Die Außenhülle betretbarer Häuser ist nicht mehr begehbar, die Haustür ist nur noch Eingang
- Bots: nur zwei Begleiter bleiben in deiner Nähe (mit mehr Abstand), die übrigen streifen umher;
  Bots weichen nicht mehr aus, wenn du auf sie zugehst, und halten beim Tauschen still

## 0.9.1 – 18.11.2026

- Fehler behoben: Wer mit gehaltener Taste ein Haus betrat oder eine Treppe nahm, landete sofort wieder auf der anderen Seite –
  ein Übergang löst jetzt erst aus, wenn man sich vom Ankunftsort entfernt hat
- Möbel stehen bündig an den Wänden mit freiem Streifen davor, Tische frei mit Abstand rundherum – nichts versperrt mehr den Weg
- Licht: Taschenlampe hält etwa eine Stunde, schaltet sich in Häusern selbst ein und draußen aus, danach kommt die nächste aus
  dem Rucksack; ohne Lampe nur ein kleiner, schwacher Lichtkreis und alles schwarz-weiß

## 0.9.0 – 18.11.2026

- Phase B: Häuser sind betretbar – beim Betreten zoomt die Kamera hinein, innen ein eigener Grundriss
  mit 4–7 Zimmern (Flur, Küche, Wohn-, Schlaf-, Kinderzimmer, Bad, Abstellraum), Möbeln von oben,
  Keller und Dachgeschoss über Treppen; Safe Rooms bleiben vorerst außen
- Türen: öffnen/schließen; verschlossene mit Schlüsselbund, laut mit der Brechstange oder per Wiki-Rätsel
- Zombies lauern hinter geschlossenen Türen und sind erst zu sehen, wenn man sie sieht; innen ist es dunkel –
  Lichtkreis um die Figur, mit Taschenlampe ein langer Lichtkegel
- Bots folgen über Haustür und Treppen (nur gezielt, nicht beim Vorbeilaufen)
- Neue Gegenstände: Schlüsselbund, Brechstange
- Einstellbar: `zombies` (ganzzahlig, 10 = bisherige Menge) und `funde` (je Gegenstand, 10 = normal, 0 = nie, 20 = doppelt)
- Innenraum-Generator: Entwurf DeepSeek, 6 Fehler von Claude behoben, Abnahmetests für 10 Häuser × 3 Stockwerke

## 0.8.0 – 18.11.2026

- Größere Rucksäcke: Sporttasche (12 Plätze) und Trekkingrucksack (16) – selten in Spinden und Kofferräumen
- Weggeworfene Gegenstände bleiben 3 Minuten liegen und können von allen aufgehoben werden
- Tauschen: wer einen Mitspieler berührt, kann tauschen – beide legen etwas ins Angebot und bestätigen;
  das Spiel läuft weiter, wer sich entfernt, bricht ab (Bots nehmen Geschenke an)
- Bots neu: Wegsuche über Kacheln (folgen durch Türen ins Haus), feste Plätze hinter dem Anführer,
  Abstand zu allen Figuren, bewaffnete Bots kämpfen (Pistole: Schussabstand halten, Messer/Schläger: angreifen)
- Ein toter Zombie in der Tür eines Safe Rooms muss erst weggezogen werden, bevor man verbarrikadieren kann
- Schlankere Figuren ohne runden Ring (DeepSeek, 3. Runde)

## 0.7.0 – 18.11.2026

- Hindernisse: Traktor, Heuballen, Kühe, Hochsitz, Felsen, Vogelscheuche, Biertische und Maibaum muss man umgehen
  (Lage kommt jetzt aus der Karte, Server und Browser sperren dieselben Stellen; Büsche bleiben begehbar)
- Holzzäune um einige Gärten (mit Gartentor vor der Haustür) und eine Kuhweide mit Gatter;
  jedes Stück wird verworfen, wenn es einen Weg abschneiden würde
- Figuren von oben mit Laufanimation: Menschen (Haare oder Trachtenhut), schlurfende Zombies mit Krallen,
  Leichen ausgestreckt, Verletzte liegend (Entwurf DeepSeek, zweite Runde nach Rückmeldung)
- „Nicht ganz tot“: etwa jeder vierte erledigte Zombie kriecht am Boden weiter (langsam, spürt ringsum,
  beißt schwächer) und muss ein zweites Mal erledigt werden; erst dann wird er zur durchsuchbaren Leiche

## 0.6.0 – 18.11.2026

- Dächer wieder von oben (Walmdach mit Ziegelreihen, Kamin); Bäume, Kühe, Maibaum und Deko bleiben
- Simulierte Mitspieler: Option `bots` (0–9) – so viele Bots, solange nur ein Mensch spielt; jeder weitere Mensch ersetzt einen.
  Bots folgen dem nächsten Menschen, helfen Liegenden auf, versorgen sich selbst und weichen Zombies aus (Entwurf DeepSeek)
- Tote Zombies bleiben 3 Minuten liegen (höchstens 30) und lassen sich durchsuchen:
  selten (etwa jeder 20.) Pistole, Munition oder Messer, oft feste Kleidung, Seil, Taschenlampe oder Schokoriegel
- Messer: schneller, leiser Nahkampf; feste Kleidung halbiert Biss-Chance und mindert Schaden, nutzt sich ab;
  Schokoriegel +20 Hunger; Seil und Taschenlampe werden für Level 2 und die Innenräume gebraucht

## 0.5.0 – 18.11.2026

- Neues Aussehen aus dem Einzelspieler-Prototyp: bayerische Häuser mit Balkon und Geranien, Kirche als Sakristei,
  Blechdächer für Safe Rooms, Fichten, Laubbäume, Birken, Maibaum, Biertische, Kühe, Traktor, Heu, Hochsitz,
  Vogelscheuche, Enten und Schilf an der Isar, Leitpfosten, Wiese mit Grasbüscheln und Blumen, Pflaster und Asphalt
- Die Zeichenfunktionen werden wörtlich aus dem Prototyp übernommen (tools/baue_aussehen.py → client/proto_grafik.mjs)

## 0.4.0 – 17.11.2026

- Level-1-Ziel: Das Tor am Ortsausgang hat drei Schlösser – jedes öffnet sich mit einer richtig beantworteten Frage
- Fragen kommen aus der Wiki-Seite krisenvorsorge:spielfragen (Add-on bindet /share nur lesend ein, Änderungen gelten nach spätestens einer Minute), sonst aus der mitgelieferten Kopie (28 Fragen aus dem Überlebenshandbuch)
- Falsche Antwort: das Schloss klappert laut und lockt Zombies an; nach jeder Antwort ein Link zur passenden Wiki-Seite (Option wiki_adresse)
- Biss und Infektion: Zombie-Bisse können infizieren (90 Minuten, läuft nur draußen), die Figur wird langsamer und der Bildschirm grüner
- Rettungsspritze (💉) heilt sich selbst oder einen infizierten Mitspieler daneben
- Wer sich verwandelt, spielt 3 Minuten als Zombie gegen die anderen und wacht dann im Safe Room auf (oder früher, wenn er erledigt wird)

## 0.3.0 – 17.11.2026

- Spielstand wird gespeichert (SQLite unter /data): Welt, Behälter, Barrikaden, Vorratskisten und jeder Spieler
- Spieler werden am Browser wiedererkannt (geheimer Schlüssel), der Name darf sich ändern
- Vier Safe Rooms: Feuerwehrhaus, Sakristei, Lagerraum, Keller – mit Vorratskiste (24 Plätze)
- Tür verbarrikadieren mit Brettern; Zombies hämmern dagegen und nutzen die Barrikade ab
- „Ausruhen & abmelden“ nur im Safe Room; wer draußen geht, versteckt sich und taucht im letzten Safe Room wieder auf
- Schränke, Kühlschränke, Spinde und Kofferräume durchsuchen (dauert, macht Lärm); Rucksack mit 8 Plätzen
- Gegenstände: Wasser, Konserve, Verbandskasten, Bretter, Pistole, Baseballschläger, Munition
- Durst und Hunger sinken; im Safe Room erholt man sich
- Aufhelfen mit Verbandskasten in 3 s (70 Lebenspunkte), ohne in 8 s (25)
- Alle am Boden: Aufwachen im Safe Room statt Neustart der Welt
- Fehlerbehebung: abgelehnter Beitritt konnte eine unbehandelte Ablehnung auslösen

## 0.2.0 – 17.11.2026

- Option `zugangscode`: Wer nicht über die HA-Seitenleiste kommt, braucht den Code zum Mitspielen
- Der Ingress-Header gilt nur noch für Anfragen vom HA-Supervisor
- Breitere Häuser, Türen auch von außen erkennbar, Ecken-Hilfe an Türen
- README, Doku und MIT-Lizenz

## 0.1.0 – 17.11.2026

- Erstes Grundgerüst: Spielserver mit Colyseus 0.18 (Node.js 22), Client mit Phaser 3.90
- Mehrspieler im selben Raum (bis 10), Server entscheidet über Bewegung, Zombies und Treffer
- Ort mit Straßen, Marktplatz, Häusern (Dach wird beim Betreten durchsichtig), Bäumen, Isar und Ortsausgang
- Zombies mit sichtbarem Sichtkegel, hören Rennen und Schüsse, folgen einem Wegfeld um Häuser herum
- Schleichen (wenig Joystick oder Umschalttaste), 40 % der Spieler mit Pistole, Rest stößt
- Am Boden liegen und Aufhelfen durch Stehenbleiben daneben; alle unten → neue Runde
- Verbindungsabbruch: Figur bleibt 2 Minuten stehen, automatisches Wiederverbinden auch nach Neuladen
- Zugang über die HA-Seitenleiste (Ingress) und über Port 8775 für Mitspieler

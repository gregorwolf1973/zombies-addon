// Steuerung der simulierten Mitspieler – Entwurf von DeepSeek (v4-pro), von Claude korrigiert
// (frei/sichtfrei sind Modulfunktionen, Festhäng-Erkennung über ein 1-s-Fenster)
import { frei, sichtfrei } from '../client/welt.mjs';
// server/bots.mjs
// Simulierte Mitspieler für das kooperative Top-down-Zombiespiel.
// Der Server ruft 20-mal pro Sekunde botSchritt(raum, sid, p, x, dt) auf.
// Der Bot steuert sich ausschließlich über x.eingabe = { dx, dy, s }.

export const BOT_NAMEN = [
  'Resi', 'Vroni', 'Sepp', 'Wastl', 'Kathi',
  'Hias', 'Burgi', 'Girgl', 'Loisl', 'Zenzi'
];

// ---------------------------------------------------------------------------
// Hilfsfunktionen
// ---------------------------------------------------------------------------

function abstand(ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  return Math.hypot(dx, dy);
}

function normiere(x, y) {
  const len = Math.hypot(x, y);
  if (len < 1e-6) return { dx: 0, dy: 0, len: 0 };
  return { dx: x / len, dy: y / len, len };
}

function winkelZu(x1, y1, x2, y2) {
  return Math.atan2(y2 - y1, x2 - x1);
}

function mischeRichtung(altDx, altDy, neuDx, neuDy, faktor = 0.3) {
  const dx = altDx * (1 - faktor) + neuDx * faktor;
  const dy = altDy * (1 - faktor) + neuDy * faktor;
  const n = normiere(dx, dy);
  return { dx: n.dx, dy: n.dy };
}

function versatzWinkel(sid) {
  // Deterministischer Versatzwinkel pro Bot, damit sie sich nicht stapeln.
  let hash = 0;
  for (let i = 0; i < sid.length; i++) {
    hash = (hash * 31 + sid.charCodeAt(i)) >>> 0;
  }
  return (hash % 360) * (Math.PI / 180);
}

function istEchterMensch(raum, sid) {
  const extra = raum.extra.get(sid);
  return extra && !extra.bot;
}

function istBot(raum, sid) {
  const extra = raum.extra.get(sid);
  return extra && extra.bot;
}

function istUntenOderZombie(p) {
  return p.unten || p.zombie > 0;
}

function istHandlungsfaehig(p) {
  return !istUntenOderZombie(p);
}

// ---------------------------------------------------------------------------
// Bot-Zustand initialisieren
// ---------------------------------------------------------------------------

function initBotZustand(x, sid) {
  if (!x.bot || x.bot.versatz === undefined) {
    x.bot = {
      versatz: versatzWinkel(sid),
      letzteVersorgung: 0,
      festhangTimer: 0,
      festhangRichtung: 1, // 1 = links, -1 = rechts
      festhangPhase: false,
      letztePos: { x: x.eingabe ? 0 : 0, y: 0 }, // wird unten überschrieben
      letzteEingabe: { dx: 0, dy: 0 },
      glattDx: 0,
      glattDy: 0,
      letzterSchritt: 0
    };
  }
  // Position initialisieren, falls noch nicht geschehen
  if (!x.bot.letztePos || x.bot.letztePos.x === undefined) {
    x.bot.letztePos = { x: 0, y: 0 };
  }
}

// ---------------------------------------------------------------------------
// Hauptfunktion
// ---------------------------------------------------------------------------

export function botSchritt(raum, sid, p, x, dt) {
  // Eingabe zurücksetzen
  x.eingabe = { dx: 0, dy: 0, s: false };

  // Bot-Zustand initialisieren
  initBotZustand(x, sid);
  const bot = x.bot;
  // stand der Bot zuletzt, beginnt die Festhäng-Messung neu
  if (!bot.lief) bot.fenster = null;
  bot.lief = false;

  // Zeit seit letztem Schritt (für Festhang-Erkennung)
  const jetzt = Date.now() / 1000;
  if (!bot.letzterSchritt) bot.letzterSchritt = jetzt;
  const schrittDelta = jetzt - bot.letzterSchritt;
  bot.letzterSchritt = jetzt;

  // 1. Unten oder Zombie: nichts tun
  if (istUntenOderZombie(p)) {
    bot.festhangTimer = 0;
    bot.festhangPhase = false;
    bot.letztePos = { x: p.x, y: p.y };
    return;
  }

  // Aktuelle Position für Festhang-Erkennung
  const aktuellePos = { x: p.x, y: p.y };
  const bewegungSeitLetztemSchritt = abstand(
    bot.letztePos.x, bot.letztePos.y,
    aktuellePos.x, aktuellePos.y
  );
  bot.letztePos = aktuellePos;

  // 2. Liegt ein Mitspieler in < 300 px: hingehen und aufhelfen
  const helfeZiel = findeLiegendenMitspieler(raum, p, sid);
  if (helfeZiel) {
    const dist = abstand(p.x, p.y, helfeZiel.x, helfeZiel.y);
    if (dist > 28) {
      const richtung = normiere(helfeZiel.x - p.x, helfeZiel.y - p.y);
      setzeBewegung(raum, p, x, bot, richtung.dx, richtung.dy, 1.0, dt);
    } else {
      // Stehen bleiben, Server hilft automatisch auf
      x.eingabe = { dx: 0, dy: 0, s: false };
      bot.festhangTimer = 0;
      bot.festhangPhase = false;
    }
    return;
  }

  // 3. Selbst versorgen (höchstens eine Sache pro Sekunde)
  if (jetzt - bot.letzteVersorgung >= 1.0) {
    if (versorgeSelbst(p)) {
      bot.letzteVersorgung = jetzt;
    }
  }

  // 4. Unbewaffnet und jagender Zombie in < 70 px: fliehen
  const unbewaffnet = p.waffe === '' || (p.waffe === 'pistole' && p.munition <= 0);
  if (unbewaffnet) {
    const zombie = findeJagendenZombieNah(raum, p, 70);
    if (zombie) {
      flieheVorZombie(raum, p, x, bot, zombie, dt);
      return;
    }
  }

  // 5. Anführer folgen (echter Mensch, nicht unten, kein Zombie)
  const anfuehrer = findeAnfuehrer(raum, p, sid);
  if (anfuehrer) {
    folgeAnfuehrer(raum, p, x, bot, anfuehrer, dt);
    return;
  }

  // 6. Kein Anführer: zum nächsten Safe Room laufen
  laufeZumSafeRoom(raum, p, x, bot, dt);
}

// ---------------------------------------------------------------------------
// Verhaltensfunktionen
// ---------------------------------------------------------------------------

function findeLiegendenMitspieler(raum, p, eigeneSid) {
  let bestes = null;
  let besteDist = Infinity;
  for (const [sid2, p2] of raum.state.spieler) {
    if (sid2 === eigeneSid) continue;
    if (!p2.unten) continue;
    if (p2.zombie > 0) continue;
    const dist = abstand(p.x, p.y, p2.x, p2.y);
    if (dist < 300 && dist < besteDist) {
      besteDist = dist;
      bestes = p2;
    }
  }
  return bestes;
}

function versorgeSelbst(p) {
  // Wasser
  if (p.durst < 35) {
    const idx = p.rucksack.indexOf('wasser');
    if (idx !== -1) {
      p.rucksack.splice(idx, 1);
      p.durst = Math.min(100, p.durst + 45);
      return true;
    }
  }
  // Essen
  if (p.hunger < 35) {
    const idx = p.rucksack.indexOf('essen');
    if (idx !== -1) {
      p.rucksack.splice(idx, 1);
      p.hunger = Math.min(100, p.hunger + 45);
      return true;
    }
  }
  // Verband
  if (p.hp < 40) {
    const idx = p.rucksack.indexOf('verband');
    if (idx !== -1) {
      p.rucksack.splice(idx, 1);
      p.hp = Math.min(100, p.hp + 45);
      return true;
    }
  }
  // Spritze gegen Infektion
  if (p.infektion > 0) {
    const idx = p.rucksack.indexOf('spritze');
    if (idx !== -1) {
      p.rucksack.splice(idx, 1);
      p.infektion = 0;
      return true;
    }
  }
  return false;
}

function findeJagendenZombieNah(raum, p, maxDist) {
  let bester = null;
  let besteDist = Infinity;
  for (const [id, z] of raum.state.zombies) {
    if (!z.jagt) continue;
    const dist = abstand(p.x, p.y, z.x, z.y);
    if (dist < maxDist && dist < besteDist) {
      besteDist = dist;
      bester = z;
    }
  }
  return bester;
}

function flieheVorZombie(raum, p, x, bot, zombie, dt) {
  const wegX = p.x - zombie.x;
  const wegY = p.y - zombie.y;
  let richtung = normiere(wegX, wegY);

  // Prüfe, ob die direkte Fluchtrichtung frei ist
  const zielX = p.x + richtung.dx * 40;
  const zielY = p.y + richtung.dy * 40;
  if (frei(raum.welt, zielX, zielY, 11)) {
    setzeBewegung(raum, p, x, bot, richtung.dx, richtung.dy, 1.0, dt);
    return;
  }

  // Seitlich ausweichen: teste links und rechts
  const links = { dx: -richtung.dy, dy: richtung.dx };
  const rechts = { dx: richtung.dy, dy: -richtung.dx };

  const zielLinksX = p.x + links.dx * 40;
  const zielLinksY = p.y + links.dy * 40;
  const zielRechtsX = p.x + rechts.dx * 40;
  const zielRechtsY = p.y + rechts.dy * 40;

  const linksFrei = frei(raum.welt, zielLinksX, zielLinksY, 11);
  const rechtsFrei = frei(raum.welt, zielRechtsX, zielRechtsY, 11);

  if (linksFrei && !rechtsFrei) {
    setzeBewegung(raum, p, x, bot, links.dx, links.dy, 1.0, dt);
  } else if (rechtsFrei && !linksFrei) {
    setzeBewegung(raum, p, x, bot, rechts.dx, rechts.dy, 1.0, dt);
  } else if (linksFrei && rechtsFrei) {
    // Beide frei: wähle die Seite, die weiter vom Zombie wegführt
    const distLinks = abstand(zielLinksX, zielLinksY, zombie.x, zombie.y);
    const distRechts = abstand(zielRechtsX, zielRechtsY, zombie.x, zombie.y);
    if (distLinks > distRechts) {
      setzeBewegung(raum, p, x, bot, links.dx, links.dy, 1.0, dt);
    } else {
      setzeBewegung(raum, p, x, bot, rechts.dx, rechts.dy, 1.0, dt);
    }
  } else {
    // Beide blockiert: versuche rückwärts (falls nicht direkt auf Zombie zu)
    const rueck = { dx: -richtung.dx, dy: -richtung.dy };
    const zielRueckX = p.x + rueck.dx * 40;
    const zielRueckY = p.y + rueck.dy * 40;
    if (frei(raum.welt, zielRueckX, zielRueckY, 11)) {
      setzeBewegung(raum, p, x, bot, rueck.dx, rueck.dy, 1.0, dt);
    } else {
      // Komplett eingekesselt: stehen bleiben
      x.eingabe = { dx: 0, dy: 0, s: false };
      bot.festhangTimer = 0;
      bot.festhangPhase = false;
    }
  }
}

function findeAnfuehrer(raum, p, eigeneSid) {
  let bester = null;
  let besteDist = Infinity;
  for (const [sid2, p2] of raum.state.spieler) {
    if (sid2 === eigeneSid) continue;
    if (!istEchterMensch(raum, sid2)) continue;
    if (istUntenOderZombie(p2)) continue;
    const dist = abstand(p.x, p.y, p2.x, p2.y);
    if (dist < besteDist) {
      besteDist = dist;
      bester = p2;
    }
  }
  return bester;
}

function folgeAnfuehrer(raum, p, x, bot, anfuehrer, dt) {
  const dist = abstand(p.x, p.y, anfuehrer.x, anfuehrer.y);

  // Versatzposition um den Anführer berechnen
  const versatzDist = 60; // gewünschter Abstand zum Anführer
  const zielX = anfuehrer.x + Math.cos(bot.versatz) * versatzDist;
  const zielY = anfuehrer.y + Math.sin(bot.versatz) * versatzDist;
  const distZumZiel = abstand(p.x, p.y, zielX, zielY);

  // Schleicht der Anführer?
  const schleichen = anfuehrer.schleicht === true;
  const tempo = schleichen ? 0.45 : 1.0;

  if (dist > 250) {
    // Weit weg: Wegfeld nutzen, wenn keine Sichtlinie
    const sicht = sichtfrei(raum.welt, p.x, p.y, anfuehrer.x, anfuehrer.y);

    if (!sicht && raum.feldRichtung) {
      const winkel = raum.feldRichtung(p.x, p.y);
      if (winkel !== null && winkel !== undefined) {
        const dx = Math.cos(winkel);
        const dy = Math.sin(winkel);
        setzeBewegung(raum, p, x, bot, dx, dy, tempo, dt);
        return;
      }
    }
    // Direkt hinlaufen
    const richtung = normiere(anfuehrer.x - p.x, anfuehrer.y - p.y);
    setzeBewegung(raum, p, x, bot, richtung.dx, richtung.dy, tempo, dt);
  } else if (dist > 90) {
    // Hinlaufen zum Anführer (bzw. zur Versatzposition)
    const richtung = normiere(zielX - p.x, zielY - p.y);
    setzeBewegung(raum, p, x, bot, richtung.dx, richtung.dy, tempo, dt);
  } else if (dist < 45) {
    // Zu nah: leicht wegrücken
    const wegX = p.x - anfuehrer.x;
    const wegY = p.y - anfuehrer.y;
    const richtung = normiere(wegX, wegY);
    setzeBewegung(raum, p, x, bot, richtung.dx, richtung.dy, 0.45, dt);
  } else {
    // Abstand ok: stehen bleiben
    x.eingabe = { dx: 0, dy: 0, s: false };
    bot.festhangTimer = 0;
    bot.festhangPhase = false;
  }
}

function laufeZumSafeRoom(raum, p, x, bot, dt) {
  if (!raum.welt || !raum.welt.safeRooms || raum.welt.safeRooms.length === 0) {
    x.eingabe = { dx: 0, dy: 0, s: false };
    return;
  }

  // Nächsten Safe Room finden
  let bester = null;
  let besteDist = Infinity;
  for (const sr of raum.welt.safeRooms) {
    if (!sr.innen) continue;
    const dist = abstand(p.x, p.y, sr.innen.x, sr.innen.y);
    if (dist < besteDist) {
      besteDist = dist;
      bester = sr;
    }
  }

  if (!bester) {
    x.eingabe = { dx: 0, dy: 0, s: false };
    return;
  }

  const dist = abstand(p.x, p.y, bester.innen.x, bester.innen.y);
  if (dist < 20) {
    // Angekommen: stehen bleiben
    x.eingabe = { dx: 0, dy: 0, s: false };
    bot.festhangTimer = 0;
    bot.festhangPhase = false;
    return;
  }

  // Wegfeld nutzen, wenn verfügbar und keine Sichtlinie
  const sicht = sichtfrei(raum.welt, p.x, p.y, bester.innen.x, bester.innen.y);

  if (!sicht && raum.feldRichtung) {
    const winkel = raum.feldRichtung(p.x, p.y);
    if (winkel !== null && winkel !== undefined) {
      const dx = Math.cos(winkel);
      const dy = Math.sin(winkel);
      setzeBewegung(raum, p, x, bot, dx, dy, 1.0, dt);
      return;
    }
  }

  const richtung = normiere(bester.innen.x - p.x, bester.innen.y - p.y);
  setzeBewegung(raum, p, x, bot, richtung.dx, richtung.dy, 1.0, dt);
}

// ---------------------------------------------------------------------------
// Bewegung setzen mit Glättung und Festhang-Erkennung
// ---------------------------------------------------------------------------

function setzeBewegung(raum, p, x, bot, dx, dy, tempo, dt) {
  bot.lief = true;
  // Festhang-Erkennung: Wenn trotz Eingabe < 8 px in 1 s bewegt
  if (bot.festhangPhase) {
    // In Festhang-Phase: Timer läuft
    bot.festhangTimer -= dt;
    if (bot.festhangTimer <= 0) {
      bot.festhangPhase = false;
      bot.festhangTimer = 0;
      bot.festhangRichtung *= -1; // Richtung wechseln für nächstes Mal
    } else {
      // Senkrecht zur gewünschten Richtung laufen
      const senkrechtDx = -dy * bot.festhangRichtung;
      const senkrechtDy = dx * bot.festhangRichtung;
      // Prüfen, ob senkrechte Richtung frei ist
      const zielX = p.x + senkrechtDx * 40;
      const zielY = p.y + senkrechtDy * 40;
      if (frei(raum.welt, zielX, zielY, 11)) {
        dx = senkrechtDx;
        dy = senkrechtDy;
      } else {
        // Andere senkrechte Richtung versuchen
        const senkrechtDx2 = dy * bot.festhangRichtung;
        const senkrechtDy2 = -dx * bot.festhangRichtung;
        const zielX2 = p.x + senkrechtDx2 * 40;
        const zielY2 = p.y + senkrechtDy2 * 40;
        if (frei(raum.welt, zielX2, zielY2, 11)) {
          dx = senkrechtDx2;
          dy = senkrechtDy2;
        }
      }
    }
  } else {
    // Normal: über 1 s messen, ob wir trotz Eingabe vorankommen
    if (!bot.fenster) bot.fenster = { zeit: 0, x: p.x, y: p.y };
    bot.fenster.zeit += dt;
    if (bot.fenster.zeit >= 1.0) {
      if (abstand(bot.fenster.x, bot.fenster.y, p.x, p.y) < 8) {
        bot.festhangPhase = true;
        bot.festhangTimer = 0.6;
        bot.festhangRichtung = bot.festhangRichtung || 1;
      }
      bot.fenster = { zeit: 0, x: p.x, y: p.y };
    }
  }

  // Richtung glätten (30% neue Richtung)
  const geglaettet = mischeRichtung(bot.glattDx, bot.glattDy, dx, dy, 0.3);
  bot.glattDx = geglaettet.dx;
  bot.glattDy = geglaettet.dy;

  // Tempo anpassen: schleichen wenn tempo < 0.55
  const schleicht = tempo < 0.55;
  const laenge = schleicht ? 0.45 : Math.min(1.0, tempo);

  x.eingabe = {
    dx: geglaettet.dx * laenge,
    dy: geglaettet.dy * laenge,
    s: schleicht
  };
}

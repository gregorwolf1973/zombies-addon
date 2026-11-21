// Superuser-Testmenü: Anmeldung per Testzugang-Passwort und Testbefehle (Nachricht 'su').
// Das Passwort steht NIRGENDS im Code: es wird nur als scrypt-Hash in den Einstellungen gespeichert
// (Verwaltung → „Superuser-Passwort“, einstellungen.json → superuserHash). Ohne Hash gibt es keinen Superuser.
import crypto from 'node:crypto';
import { KACHEL, BREITE, HOEHE, T, frei, WERTE as W, MUNITION_MAX, PFEILE_MAX, GRANATEN_MAX, HANDGRANATEN_MAX, WAFFEN } from '../client/welt.mjs';
import { rahmen, imLager } from '../client/stuetzpunkt.mjs';
import * as WP from './waffenplaetze.mjs';
import { LEVEL_KARTEN, KARTEN_NAMEN, level1Karte } from './aufgaben.mjs';

// ---------- Hash ----------
export const SU_MAX_LAENGE = 200;
export function hashe(passwort) {
  const salz = crypto.randomBytes(16);
  const h = crypto.scryptSync(String(passwort).slice(0, SU_MAX_LAENGE), salz, 32);
  return `scrypt$${salz.toString('hex')}$${h.toString('hex')}`;
}
export function hashGueltig(s) { return typeof s === 'string' && /^scrypt\$[0-9a-f]{32}\$[0-9a-f]{64}$/.test(s); }
// zeitkonstanter Vergleich; ohne gültigen Hash immer false
export function pruefe(passwort, hash) {
  if (!hashGueltig(hash) || typeof passwort !== 'string' || !passwort) return false;
  const [, salz, soll] = hash.split('$');
  const ist = crypto.scryptSync(passwort.slice(0, SU_MAX_LAENGE), Buffer.from(salz, 'hex'), 32);
  return crypto.timingSafeEqual(ist, Buffer.from(soll, 'hex'));
}

// ---------- Fehlversuche: höchstens 5 je Minute je Schlüssel (IP, Spieler-ID) ----------
const versuche = new Map();
const FENSTER = 60000, MAX_FEHL = 5;
export function begrenzungZuruecksetzen() { versuche.clear(); }
const frisch = k => { const j = Date.now(), l = (versuche.get(k) ?? []).filter(t => j - t < FENSTER); if (l.length) versuche.set(k, l); else versuche.delete(k); return l; };
export const gesperrt = schluessel => schluessel.some(k => k && frisch(k).length >= MAX_FEHL);
export const fehlversuch = schluessel => { for (const k of schluessel) if (k) versuche.set(k, [...frisch(k), Date.now()]); };

// Anmeldung prüfen: { su: bool, grund? }; versucht wird nur, wenn der Client ein Passwort mitschickt
export function anmelden(hash, passwort, schluessel) {
  if (typeof passwort !== 'string' || !passwort) return { su: false };
  if (!hashGueltig(hash)) return { su: false, grund: 'Testzugang ist nicht eingerichtet' };
  if (gesperrt(schluessel)) return { su: false, grund: 'Zu viele Versuche – bitte eine Minute warten' };
  if (pruefe(passwort, hash) || (passwort.trim() !== passwort && pruefe(passwort.trim(), hash))) return { su: true };   // Handy-Tastaturen hängen gern ein Leerzeichen an
  fehlversuch(schluessel);
  return { su: false, grund: 'Testzugang abgelehnt' };
}

// ---------- Befehle ----------
export const SU_BEFEHLE = ['bw', 'evak', 'bots', 'horde_hin', 'horde', 'hordeanzeige', 'unsterblich', 'zeit', 'auffuellen', 'evakrufen', 'lager', 'level', 'countdown', 'zeitraffer', 'alleaufgaben', 'hin'];

function springen(raum, p, x, ziel) {
  p.x = ziel.x; p.y = ziel.y; p.ebene = ziel.ebene ?? ''; p.unten = false; p.anBord = false; p.sicher = ''; p.aktion = ''; p.fortschritt = 0;
  if (x) { x.aktionZiel = null; x.eingabe = { dx: 0, dy: 0, s: false }; x.wechselSperre = 1.5; }
}

// Zeile mit Straße bevorzugt: nächste freie Kachel um (cx, cy) im Radius von bis zu 10 Kacheln
function platzSuchen(raum, cx, cy) {
  const welt = raum.welt, kx0 = Math.floor(cx / KACHEL), ky0 = Math.floor(cy / KACHEL);
  let frei1 = null;
  for (let r = 0; r <= 10; r++) {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const kx = kx0 + dx, ky = ky0 + dy;
      if (kx < 1 || ky < 1) continue;
      const px = (kx + 0.5) * KACHEL, py = (ky + 0.5) * KACHEL;
      if (!frei(welt, px, py, W.spielerRadius)) continue;
      if (welt.hole(kx, ky) === T.STRASSE) return { x: px, y: py };
      frei1 ??= { x: px, y: py };
    }
    if (frei1 && r >= 3) return frei1;
  }
  return frei1;
}

// Bots, Spieler: Werte voll
function heilen(p) { p.hp = 100; p.durst = 100; p.hunger = 100; p.infektion = 0; p.unten = false; p.hilfe = 0; p.zombie = 0; }

export function auffuellen(raum, p, x) {
  heilen(p);
  p.munition = MUNITION_MAX; p.pfeile = PFEILE_MAX; p.granaten = GRANATEN_MAX; p.handgranaten = HANDGRANATEN_MAX;
  const einst = raum.einstellungen?.() ?? {};
  x.mag ??= [null, null];
  [0, 1].forEach(i => {
    const name = p[WP.PLATZ_FELD[i]], gm = WP.magGroesse(name, einst);
    if (name && gm && WAFFEN[name]) x.mag[i] = { waffe: name, n: gm };
  });
  if (!p.faust && p.waffe && x.mag[p.wplatz]) p.magazin = x.mag[p.wplatz].n;
  p.nachladen = 0; x.nRest = 0;
  WP.abgleich(p, x, einst);
}

function lagerPlatz(raum) {
  const sp = raum.welt.stuetzpunkt;
  if (!sp) return null;
  const r = rahmen(sp.x, sp.y, sp.b, sp.h, sp.richtung);
  for (const [u, v] of [[15, 6], [12, 8], [18, 8], [15, 12], [10, 11], [20, 11], [15, 16]]) {
    const [px, py] = r.ort(u, v);
    const pos = raum.freierPlatz({ x: px, y: py }, 0);
    if (imLager(sp, pos.x, pos.y)) return pos;
  }
  return null;
}

function evakPunkt(raum) {
  const a = raum.aufgaben, s = raum.state;
  const ep = a.einstiegsPunkt?.();
  if (s.busDa && ep) return raum.freierPlatz(ep, 0);
  if (s.evakX > 0 && s.evakY > 0 && a.evakArt() === 'flugzeug') return raum.freierPlatz({ x: s.evakX, y: s.evakY }, 0);
  const tor = raum.welt.tor;
  return tor ? raum.freierPlatz({ x: (tor.x + 1) * KACHEL, y: (tor.y + 1) * KACHEL }, 0) : null;
}

// führt einen Befehl aus; Rückgabe = Meldung an den Superuser. Wer nicht Superuser ist, bekommt nichts (null).
export function befehl(raum, client, m) {
  const x = raum.extra.get(client.sessionId), p = raum.state.spieler.get(client.sessionId);
  if (!x?.superuser || !p || !m || typeof m !== 'object') return null;
  const b = String(m.befehl ?? '');
  if (!SU_BEFEHLE.includes(b)) return 'Unbekannter Befehl';
  console.log(`[Superuser] ${p.name}: ${b}${m.groesse ? ' ' + Number(m.groesse) : ''}${m.stunde ? ' ' + Number(m.stunde) : ''}${m.zustand ? ' ' + String(m.zustand).slice(0, 12) : ''}`);
  const s = raum.state;
  switch (b) {
    case 'bw': {
      const pos = lagerPlatz(raum);
      if (!pos) return 'Kein Bundeswehr-Lager auf dieser Karte';
      springen(raum, p, x, pos);
      return '🎖 Du bist im Bundeswehr-Lager' + (s.stuetzpunkt === 'gefallen' ? ' (es ist gefallen)' : '');
    }
    case 'evak': {
      const pos = evakPunkt(raum);
      if (!pos) return 'Kein Evakuierungspunkt gefunden';
      springen(raum, p, x, { ...pos, ebene: '' });
      return '📍 Du bist am Evakuierungspunkt' + (s.busDa ? ' (Fahrzeug ist da)' : ' (noch kein Fahrzeug)');
    }
    case 'bots': {
      let n = 0;
      for (const [sid, bx] of raum.extra) {
        const q = raum.state.spieler.get(sid);
        if (!bx.bot || !q) continue;
        heilen(q); q.verbunden = true;
        const pos = raum.freierPlatz(p, n + 1, p.ebene ?? '');
        q.x = pos.x; q.y = pos.y; q.ebene = p.ebene ?? ''; q.anBord = false; q.aktion = ''; q.fortschritt = 0;
        bx.eingabe = { dx: 0, dy: 0, s: false }; bx.aktionZiel = null;
        n++;
      }
      return n ? `🤖 ${n} Bot${n === 1 ? '' : 's'} bei dir, voll geheilt` : 'Keine Bots im Spiel';
    }
    case 'horde_hin': {
      const a = raum.welle?.aktiv;
      if (!a?.mitte) return 'Gerade keine Horde';
      let dx = (a.ziel?.x ?? a.mitte.x) - a.mitte.x, dy = (a.ziel?.y ?? a.mitte.y) - a.mitte.y;
      const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
      const pos = platzSuchen(raum, a.mitte.x + dx * 400, a.mitte.y + dy * 400);
      if (!pos) return 'Gerade keine Horde';
      springen(raum, p, x, { ...pos, ebene: '' });
      return '🧟 Du stehst ca. 50 m vor der Horde';
    }
    case 'horde': {
      const n = [50, 200, 500].includes(Number(m.groesse)) ? Number(m.groesse) : 50;
      const w = raum.welle;
      if (!w) return 'Keine Wellenlogik';
      if (w.ansage) return 'Eine Horde wird gerade angesagt';
      const seite = w.ansagen();
      w.ansage = null;
      const ids = w.erzeugen(seite, n);
      if (!ids) return 'Kein Platz für die Horde gefunden';
      return `🧟 Horde mit ${ids.length} Zombies gestartet`;
    }
    case 'hordeanzeige': {
      const sid = client.sessionId, alle = !!raum.welle?.einst?.().hordeZieleZeigen;
      const an = !raum.hordeAus.has(sid) && (alle || raum.hordeDebug.has(sid));
      if (an) { raum.hordeAus.add(sid); raum.hordeDebug.delete(sid); try { client.send('hordeInfo', { aktiv: false }); } catch { /* egal */ } }
      else { raum.hordeAus.delete(sid); raum.hordeDebug.add(sid); raum.welle?.infoSenden?.(0, true); }
      return an ? 'Horden-Anzeige: aus' : '🧟 Horden-Anzeige: an';
    }
    case 'unsterblich': {
      x.suUnsterblich = !x.suUnsterblich;
      return x.suUnsterblich ? '⭐ Unsterblich: an' : 'Unsterblich: aus';
    }
    case 'zeit': {
      const h = Number(m.stunde) === 23 ? 23 : 12;
      s.uhr = h * 60;
      return h === 12 ? '☀️ Es ist 12:00 Uhr' : '🌙 Es ist 23:00 Uhr';
    }
    case 'auffuellen':
      auffuellen(raum, p, x);
      return '🎒 Alles aufgefüllt';
    case 'evakrufen': {
      const a = raum.aufgaben;
      if (!a.an()) return 'Aufgaben/Evakuierung sind ausgeschaltet';
      if (s.busDa || a.heli || a.flug) return 'Das Fahrzeug ist schon da';
      if (!s.funk) a.funkAbsetzen(p, null);
      a.busHeute = false;
      a.ankunft(a.einst().wartezeit);
      return '🚌 Evakuierung gerufen – das Fahrzeug kommt (übrige Aufgaben bleiben offen)';
    }
    case 'alleaufgaben': {
      const a = raum.aufgaben;
      if (!a.an()) return 'Aufgaben/Evakuierung sind ausgeschaltet';
      if (!s.funk) a.funkAbsetzen(p, null);   // meldet die Evakuierung an wie der echte Funkspruch
      for (const mi of a.mission) { a.abgegeben.add(mi.id); const q = s.missionen.get(mi.id); if (q) q.abgegeben = true; }
      s.missionOffen = 0;
      for (const q of s.aufgaben.values()) { q.erledigt = true; q.fortschritt = q.ziel; }
      a.aktualisieren(false);
      return '✅ Alle Aufgaben erledigt – die Evakuierung kann gerufen werden';
    }
    case 'hin': {
      const px = Number(m.x), py = Number(m.y);
      if (!Number.isFinite(px) || !Number.isFinite(py)) return 'Ungültiger Ort';
      const pos = platzSuchen(raum, Math.max(0, Math.min(px, BREITE * KACHEL)), Math.max(0, Math.min(py, HOEHE * KACHEL)));
      if (!pos) return 'Dort ist kein freier Platz';
      springen(raum, p, x, { ...pos, ebene: '' });
      return '📍 Du bist dort';
    }
    case 'zeitraffer': {
      const f = [1, 5, 10, 60].includes(Number(m.faktor)) ? Number(m.faktor) : 1;
      const SR = raum.constructor;
      if (SR.testSetzen) SR.testSetzen({ zeitraffer: f }); else SR.einstellungen.zeitraffer = f;
      raum.broadcast('meldung', { text: `⏩ Zeitraffer ${f}×`, lang: true });
      return `⏩ Zeitraffer ${f}×`;
    }
    case 'level': {
      const n = Math.round(Number(m.level));
      if (!(n >= 1 && n <= LEVEL_KARTEN.length)) return 'Unbekanntes Level';
      const a = raum.aufgaben, karte = n === 1 ? level1Karte() : LEVEL_KARTEN[n - 1];   // Level 1: zufällig Geretsried oder Geretsried 2
      if (a.wechselLaeuft) return 'Ein Levelwechsel läuft schon';
      a.wechselLaeuft = true;
      raum.broadcast('meldung', { text: `🧪 Testsprung: Level ${n} – ${KARTEN_NAMEN[karte] ?? karte}`, lang: true });
      raum.clock.setTimeout(() => a.levelWechsel({ karte, level: n, fest: true }), 1500);
      return `🧪 Wechsel zu Level ${n} (${KARTEN_NAMEN[karte] ?? karte}) …`;
    }
    case 'countdown': {
      if (!raum.finale?.setzen(Number(m.sekunden) || 60)) return 'Kein Atomschlag-Countdown auf dieser Karte (nur Andermatt)';
      return `☢️ Countdown steht jetzt auf ${Math.round(Number(m.sekunden) || 60)} s`;
    }
    case 'lager': {
      const sp = raum.stuetzpunkt;
      if (!raum.welt.stuetzpunkt || !sp) return 'Kein Bundeswehr-Lager auf dieser Karte';
      if (m.zustand === 'steht') {
        if (s.stuetzpunkt === 'steht') return 'Das Lager steht schon';
        sp.aufbauen();
        return '🎖 Lager wieder aufgebaut';
      }
      if (s.stuetzpunkt === 'gefallen') return 'Das Lager ist schon gefallen';
      if (s.stuetzpunkt !== 'steht') return 'Das Lager ist ausgeschaltet';
      sp.faellt('Testbefehl');
      return '💥 Lager ist gefallen';
    }
  }
  return null;
}

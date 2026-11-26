// Superuser-Testmenü: Anmeldung per Testzugang-Passwort und Testbefehle (Nachricht 'su').
// Das Passwort steht NIRGENDS im Code: es wird nur als scrypt-Hash in den Einstellungen gespeichert
// (Verwaltung → „Superuser-Passwort“, einstellungen.json → superuserHash). Ohne Hash gibt es keinen Superuser.
import crypto from 'node:crypto';
import { KACHEL, BREITE, HOEHE, T, frei, WERTE as W, MUNITION_MAX, PFEILE_MAX, GRANATEN_MAX, HANDGRANATEN_MAX, WAFFEN, DINGE } from '../client/welt.mjs';
import { rahmen, imLager } from '../client/stuetzpunkt.mjs';
import * as WP from './waffenplaetze.mjs';
import { Nebel } from './nebel.mjs';
import { kartenK } from './aufgaben.mjs';
import { M, D, L } from './texte.mjs';
import { aktiveFolge } from '../client/levelkatalog.mjs';
import { FAHRBAR, FAHRBAR_ARTEN } from '../client/fahrbar.mjs';

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
  if (!hashGueltig(hash)) return { su: false, grund: M('su.nichtEingerichtet') };
  if (gesperrt(schluessel)) return { su: false, grund: M('su.zuViele') };
  if (pruefe(passwort, hash) || (passwort.trim() !== passwort && pruefe(passwort.trim(), hash))) return { su: true };   // Handy-Tastaturen hängen gern ein Leerzeichen an
  fehlversuch(schluessel);
  return { su: false, grund: M('su.abgelehntCode') };
}

// ---------- Befehle ----------
export const SU_BEFEHLE = ['bw', 'evak', 'bots', 'horde_hin', 'horde', 'hordeanzeige', 'unsterblich', 'zeit', 'auffuellen', 'evakrufen', 'lager', 'level', 'countdown', 'zeitraffer', 'alleaufgaben', 'hin', 'nebel', 'unfall', 'kamera', 'kamerapos', 'status', 'waffe', 'fahrzeug', 'fahrzeug_weg', 'ding'];

// Kameraposition: Zahl innerhalb der Karte, sonst Rückfallwert
const kameraZahl = (v, rueck, max) => Number.isFinite(Number(v)) ? Math.max(0, Math.min(max, Number(v))) : rueck;

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

// Gegenstände, die der Superuser sich direkt in den Rucksack legen kann (Knöpfe im Testmenü, client/spiel.mjs)
export const SU_DINGE = ['brechstange', 'autoschluessel'];

// Waffen, die der Superuser direkt wählen kann (alle aus WAFFEN außer der bloßen Faust, die es als eigenen Knopf gibt)
export const SU_WAFFEN = Object.keys(WAFFEN).filter(n => n !== 'faust');
// Waffe in die Hand (ersetzt die Waffe im aktiven Platz) und alle Vorräte voll; das Magazin füllt abgleich() passend zur Waffe
export function waffeSetzen(raum, p, x, name) {
  if (!SU_WAFFEN.includes(name)) return false;
  p.munition = MUNITION_MAX; p.pfeile = PFEILE_MAX; p.granaten = GRANATEN_MAX; p.handgranaten = HANDGRANATEN_MAX;
  p.faust = false; p.waffe = name; p.nachladen = 0; x.nRest = 0; p.aktion = ''; p.fortschritt = 0;
  x.mag ??= [null, null]; x.mag[p.wplatz ?? 0] = null;
  WP.abgleich(p, x, raum.einstellungen?.() ?? {});
  return true;
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

// Zustand der Umschalter für die Knöpfe im Testmenü (kommt vom Server, nicht vom Client geraten)
export function status(raum, client) {
  const x = raum.extra.get(client.sessionId), s = raum.state;
  const alle = !!raum.welle?.einst?.().hordeZieleZeigen;
  return {
    unsterblich: !!x?.suUnsterblich,
    nebel: !!(raum.nebel?.erzwungen || s.nebel > 0.05),
    hordeanzeige: !raum.hordeAus.has(client.sessionId) && (alle || raum.hordeDebug.has(client.sessionId)),
    zeitraffer: raum.zeitraffer?.() ?? 1,
  };
}

// führt einen Befehl aus; Rückgabe = Meldung an den Superuser als Schlüssel { k, w } (server/texte.mjs). Wer nicht Superuser ist, bekommt nichts (null).
export function befehl(raum, client, m) {
  const x = raum.extra.get(client.sessionId), p = raum.state.spieler.get(client.sessionId);
  if (!x?.superuser || !p || !m || typeof m !== 'object') return null;
  const b = String(m.befehl ?? '');
  if (!SU_BEFEHLE.includes(b)) return M('su.unbekannt');
  if (b === 'status') return null;   // nur Zustand abfragen (der Raum schickt ihn nach jedem Befehl)
  if (b !== 'kamerapos') console.log(`[Superuser] ${p.name}: ${b}${m.groesse ? ' ' + Number(m.groesse) : ''}${m.stunde ? ' ' + Number(m.stunde) : ''}${m.zustand ? ' ' + String(m.zustand).slice(0, 12) : ''}`);
  const s = raum.state;
  switch (b) {
    case 'bw': {
      const pos = lagerPlatz(raum);
      if (!pos) return M('su.keinLager');
      springen(raum, p, x, pos);
      return M(s.stuetzpunkt === 'gefallen' ? 'su.imLagerGefallen' : 'su.imLager');
    }
    case 'evak': {
      const pos = evakPunkt(raum);
      if (!pos) return M('su.keinEvak');
      springen(raum, p, x, { ...pos, ebene: '' });
      return M(s.busDa ? 'su.amEvakFz' : 'su.amEvak');
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
      return n ? M('su.bots', { n }) : M('su.keineBots');
    }
    case 'horde_hin': {
      const a = raum.welle?.aktiv;
      if (!a?.mitte) return M('su.keineHorde');
      let dx = (a.ziel?.x ?? a.mitte.x) - a.mitte.x, dy = (a.ziel?.y ?? a.mitte.y) - a.mitte.y;
      const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
      const pos = platzSuchen(raum, a.mitte.x + dx * 400, a.mitte.y + dy * 400);
      if (!pos) return M('su.keineHorde');
      springen(raum, p, x, { ...pos, ebene: '' });
      return M('su.vorHorde');
    }
    case 'horde': {
      const n = [50, 200, 500].includes(Number(m.groesse)) ? Number(m.groesse) : 50;
      const w = raum.welle;
      if (!w) return M('su.keineWelle');
      if (w.ansage) return M('su.ansage');
      const seite = w.ansagen();
      w.ansage = null;
      const ids = w.erzeugen(seite, n);
      if (!ids) return M('su.keinPlatzHorde');
      return M('su.hordeGestartet', { n: ids.length });
    }
    case 'hordeanzeige': {
      const sid = client.sessionId, alle = !!raum.welle?.einst?.().hordeZieleZeigen;
      const an = !raum.hordeAus.has(sid) && (alle || raum.hordeDebug.has(sid));
      if (an) { raum.hordeAus.add(sid); raum.hordeDebug.delete(sid); try { client.send('hordeInfo', { aktiv: false }); } catch { /* egal */ } }
      else { raum.hordeAus.delete(sid); raum.hordeDebug.add(sid); raum.welle?.infoSenden?.(0, true); }
      return M(an ? 'su.hordeAnzeigeAus' : 'su.hordeAnzeigeAn');
    }
    case 'kamera': {   // Kameraflug: Figur steht, unverwundbar und für Zombies unsichtbar; die Kamera meldet ihre Position (Sichtmittelpunkt)
      const an = !!m.an;
      p.kamera = an;
      x.eingabe = { dx: 0, dy: 0, s: false }; raum.eingabeVerwerfen(p, x); raum.ruehrt?.(client.sessionId);
      if (an) { x.aktionZiel = null; x.kameraPos = { x: kameraZahl(m.x, p.x, BREITE * KACHEL), y: kameraZahl(m.y, p.y, HOEHE * KACHEL) }; }
      else x.kameraPos = null;
      return M(an ? 'su.kameraAn' : 'su.kameraAus');
    }
    case 'kamerapos': {   // gedrosselt vom Client, ohne Meldung
      if (p.kamera) { x.kameraPos = { x: kameraZahl(m.x, x.kameraPos?.x ?? p.x, BREITE * KACHEL), y: kameraZahl(m.y, x.kameraPos?.y ?? p.y, HOEHE * KACHEL) }; raum.ruehrt?.(client.sessionId); }
      return null;
    }
    case 'unsterblich': {
      x.suUnsterblich = !x.suUnsterblich;
      return M(x.suUnsterblich ? 'su.unsterblichAn' : 'su.unsterblichAus');
    }
    case 'zeit': {
      const h = Number(m.stunde) === 23 ? 23 : 12;
      s.uhr = h * 60;
      return M(h === 12 ? 'su.mittag' : 'su.nacht');
    }
    case 'nebel': {
      const an = !(raum.nebel?.erzwungen || s.nebel > 0.05);   // schaltet um: ist Nebel da, geht er aus
      raum.nebel ??= new Nebel();
      s.nebel = raum.nebel.schalte(an);
      return M(an ? 'su.nebelAn' : 'su.nebelAus');
    }
    case 'unfall': {
      if (p.ebene) return M('su.unfallDraussen');
      return raum.verkehr?.unfaelle?.ausloesen({ x: p.x, y: p.y }, { erzeugen: true, nah: true })
        ? M('su.unfall') : M('su.keinUnfall');
    }
    case 'waffe': {
      const name = String(m.name ?? '');
      if (!waffeSetzen(raum, p, x, name)) return M('su.unbekannteWaffe');
      return M('su.waffe', { ding: D(name) });
    }
    case 'ding': {
      const name = String(m.name ?? '');
      if (!SU_DINGE.includes(name)) return M('su.unbekannterDing');
      const dn = { s: ' ', l: [DINGE[name]?.zeichen ?? '', D(name)] };
      if (p.rucksack.includes(name)) return M('su.dingSchon', { ding: dn });
      if (p.rucksack.length >= p.plaetze) return M('su.rucksackVoll');
      p.rucksack.push(name);
      return M('su.dingDa', { ding: dn });
    }
    case 'fahrzeug': {
      const art = String(m.art ?? '');
      if (!FAHRBAR_ARTEN.includes(art) || art === 'bus') return M('su.unbekanntesFz');
      if (p.ebene) return M('su.fzDraussen');
      if (p.anBord || p.unten || p.kamera) return M('su.fzAussteigen');
      const fb = raum.fahrbare?.setzen(client.sessionId, art, p);
      if (!fb) return M('su.fzKeinPlatz');
      return M('su.fzDa', { fz: FAHRBAR[art].name });
    }
    case 'fahrzeug_weg':
      return M(raum.fahrbare?.entfernen(client.sessionId) ? 'su.fzWeg' : 'su.fzKeins');
    case 'auffuellen':
      auffuellen(raum, p, x);
      return M('su.aufgefuellt');
    case 'evakrufen': {
      const a = raum.aufgaben;
      if (!a.an()) return M('su.aufgabenAus');
      if (s.busDa || a.heli || a.flug) return M('su.fzSchonDa');
      if (!s.funk) a.funkAbsetzen(p, null);
      a.busHeute = false;
      a.ankunft(a.einst().wartezeit);
      return M('su.evakGerufen');
    }
    case 'alleaufgaben': {
      const a = raum.aufgaben;
      if (!a.an()) return M('su.aufgabenAus');
      if (!s.funk) a.funkAbsetzen(p, null);   // meldet die Evakuierung an wie der echte Funkspruch
      for (const mi of a.mission) { a.abgegeben.add(mi.id); const q = s.missionen.get(mi.id); if (q) q.abgegeben = true; }
      s.missionOffen = 0;
      for (const q of s.aufgaben.values()) { q.erledigt = true; q.fortschritt = q.ziel; }
      a.aktualisieren(false);
      return M('su.alleAufgaben');
    }
    case 'hin': {
      if (typeof m.ebene === 'string' && /^h\d+(eg|keller|dach)$/.test(m.ebene)) {   // Prüfhilfe: direkt in ein Haus (Start der Ebene bzw. Pixelort x/y dort)
        const w = raum.wv(m.ebene), ox = Number.isFinite(Number(m.x)) ? Number(m.x) : w.start.x, oy = Number.isFinite(Number(m.y)) ? Number(m.y) : w.start.y;
        springen(raum, p, x, { x: ox, y: oy, ebene: m.ebene });
        return M('su.imHaus');
      }
      const px = Number(m.x), py = Number(m.y);
      if (!Number.isFinite(px) || !Number.isFinite(py)) return M('su.ungueltigerOrt');
      const pos = platzSuchen(raum, Math.max(0, Math.min(px, BREITE * KACHEL)), Math.max(0, Math.min(py, HOEHE * KACHEL)));
      if (!pos) return M('su.keinFreierPlatz');
      springen(raum, p, x, { ...pos, ebene: '' });
      return M('su.dort');
    }
    case 'zeitraffer': {
      const f = [1, 5, 10, 60].includes(Number(m.faktor)) ? Number(m.faktor) : 1;
      const SR = raum.constructor;
      if (SR.testSetzen) SR.testSetzen({ zeitraffer: f }); else SR.einstellungen.zeitraffer = f;
      raum.broadcast('meldung', M('su.zeitraffer', { f }, L));
      return M('su.zeitraffer', { f });
    }
    case 'level': {
      const n = Math.round(Number(m.level));
      const folge = aktiveFolge(raum.constructor.einstellungen?.levelFolge);   // Level n = n-tes aktives Level der eingestellten Reihenfolge
      if (!(n >= 1 && n <= folge.length)) return M('su.unbekanntesLevel');
      const a = raum.aufgaben, karte = folge[n - 1];   // jedes Level hat genau eine Karte (Geretsried 1 und 2 sind eigene Level)
      if (a.wechselLaeuft) return M('su.wechselLaeuft');
      a.wechselLaeuft = true;
      raum.broadcast('meldung', M('su.testsprung', { n, karte: kartenK(karte) }, L));
      raum.clock.setTimeout(() => a.levelWechsel({ karte, level: n }), 1500);
      return M('su.wechsel', { n, karte: kartenK(karte) });
    }
    case 'countdown': {
      if (!raum.finale?.setzen(Number(m.sekunden) || 60)) return M('su.keinCountdown');
      return M('su.countdown', { n: Math.round(Number(m.sekunden) || 60) });
    }
    case 'lager': {
      const sp = raum.stuetzpunkt;
      if (!raum.welt.stuetzpunkt || !sp) return M('su.keinLager');
      if (m.zustand === 'steht') {
        if (s.stuetzpunkt === 'steht') return M('su.lagerSteht');
        sp.aufbauen();
        return M('su.lagerAufgebaut');
      }
      if (s.stuetzpunkt === 'gefallen') return M('su.lagerSchonGefallen');
      if (s.stuetzpunkt !== 'steht') return M('su.lagerAus');
      sp.faellt(M('lager.test'));
      return M('su.lagerGefallen');
    }
  }
  return null;
}

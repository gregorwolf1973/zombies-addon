// Team-Planer für die simulierten Mitspieler: Alle ~2 s bewertet er die Lage (Aufgaben, Vorräte, Tageszeit, Bus) und
// gibt jedem Bot einen Auftrag. botSchritt (bots.mjs) führt ihn über planSchritt() aus, wenn keine Gefahr und kein
// Liegender Vorrang hat; gibt planSchritt false zurück, gilt das bisherige Verhalten (Folgen, Gelegenheiten, Safe Room).
// Rollen: Begleiter (mindestens einer je Mensch, folgt wie bisher) und Sammler (holt Vorräte, setzt den Funkspruch ab,
// verbarrikadiert, jagt Zombies in Gruppennähe, geht zum Bus). Chat-Befehle der Menschen: botBefehl().
// Die Hilfsfunktionen aus bots.mjs (geheZu …) kommen als Parameter H, damit es keine Importschleife gibt.
import { findeWeg, KACHEL, AKTION_ABSTAND, BUS_ABSTAND, BEUTE, WAFFEN, KISTE_PLAETZE, istNacht, frei, ladenArt, durchsuchDauer, safeRoomVon } from '../client/welt.mjs';
import { EBENE_MUSTER } from '../client/innen.mjs';
import { hhmm } from './aufgaben.mjs';

// Einstellungen des Planers (Vorschlag: später in die Einstellungsseite, bis dahin hier)
export const BOTPLAN = {
  an: true,
  takt: 2,                 // s zwischen zwei Planungen
  umkreis: 2800,           // px (8 px = 1 m → 350 m) um die Menschen, in dem Sammler bleiben
  chatPause: 45,           // s zwischen zwei Chat-Nachrichten eines Bots
  verwerfenNach: 10,       // s ohne Fortschritt auf dem Weg → Ziel verwerfen
  sperrzeit: 300,          // s, die ein verworfenes Ziel gesperrt bleibt
  hpRueckkehr: 45,         // darunter kehren Sammler um
  batch: 2,                // so viele Stück bringt ein Sammler je Gang mindestens (sonst voller Rucksack / keine Ziele mehr)
  jagdRadius: 350,         // Zombies in diesem Abstand zu einem Menschen jagen bewaffnete Bots
};

const RAD = 11;
const abstand = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const anz = (liste, d) => { let n = 0; for (const q of liste) if (q === d) n++; return n; };
const NAMEN = { wasser: 'Wasser', essen: 'Konserven', spritze: 'eine Spritze', bretter: 'Bretter', taschenlampe: 'eine Taschenlampe', alles: 'Vorräte', verband: 'Verbandszeug' };
const WAS_WORT = { wasser: 'wasser', trinken: 'wasser', essen: 'essen', konserven: 'essen', konserve: 'essen', medizin: 'spritze', spritze: 'spritze',
  bretter: 'bretter', brett: 'bretter', holz: 'bretter', lampe: 'taschenlampe', taschenlampe: 'taschenlampe', lampen: 'taschenlampe' };
// so viel behält ein Bot für sich, der Rest geht in die Kiste
const RESERVE = { wasser: 1, essen: 1, verband: 2, spritze: 0, bretter: 0 };

// ---------- Zustand ----------
function zustand(raum) {
  let bp = raum.botplan;
  if (!bp || bp.welt !== raum.welt) {
    bp = raum.botplan = { welt: raum.welt, naechster: 0, durchsucht: new Set(), fertig: new Set(), gesperrt: new Map(), ctx: null, stat: { n: 0, summe: 0, max: 0 } };
  }
  return bp;
}
const istBot = (raum, sid) => !!raum.extra.get(sid)?.bot;
const menschenListe = raum => [...raum.state.spieler.entries()].filter(([s, o]) => !istBot(raum, s) && !o.unten && !(o.zombie > 0) && o.verbunden !== false).map(([, o]) => o);
function botListe(raum) {
  const r = [];
  for (const [sid, p] of raum.state.spieler) { const x = raum.extra.get(sid); if (x?.bot) { x.bot.plan ??= { rolle: 'begleiter', auftrag: null, pause: 0 }; r.push([sid, p, x]); } }
  return r.sort((a, b) => (a[0] < b[0] ? -1 : 1));
}
// Ort einer Figur in Weltkoordinaten (im Haus: die Haustür)
function weltPos(raum, p) {
  if (!p.ebene) return p;
  const m = EBENE_MUSTER.exec(p.ebene), h = m && raum.welt.haeuser[Number(m[1])];
  return h ? { x: (h.tuer.x + 0.5) * KACHEL, y: (h.tuer.y + 0.5) * KACHEL } : p;
}
const hausPos = h => ({ x: (h.tuer.x + 0.5) * KACHEL, y: (h.tuer.y + 0.5) * KACHEL });
const nah = (raum, p, menschen) => { const w = weltPos(raum, p); let d = Infinity; for (const m of menschen) d = Math.min(d, abstand(w, weltPos(raum, m))); return d; };
function bewaffnet(p) {
  const w = WAFFEN[p.waffe];
  if (w?.fern) return p.munition >= 4 ? 'fern' : null;
  return w ? 'nah' : null;
}
const gesperrt = (bp, key, jetzt) => (bp.gesperrt.get(key) ?? 0) > jetzt;

// ---------- Chat ----------
function sagt(raum, sid, p, text, erzwingen = false) {
  const b = raum.extra.get(sid)?.bot;
  if (!b || !text) return;
  const jetzt = Date.now();
  if (!erzwingen && jetzt - (b.chatT ?? 0) < BOTPLAN.chatPause * 1000) return;
  b.chatT = jetzt;
  let ort = 'draußen';
  const safe = safeRoomVon(raum.welt, p);
  if (safe) ort = '🛡 ' + safe.name;
  else if (p.ebene) { const e = EBENE_MUSTER.exec(p.ebene); ort = (e && raum.welt.haeuser?.[Number(e[1])]?.name) || 'in einem Haus'; }
  const nachricht = { id: raum.naechsteChatId++, von: raum.chatKennung(sid), name: p.name, farbe: p.farbe, zeit: jetzt, text, ort };
  raum.chatVerlauf.push(nachricht);
  if (raum.chatVerlauf.length > 100) raum.chatVerlauf.splice(0, raum.chatVerlauf.length - 100);
  raum.broadcast('chat', nachricht);
}

// ---------- Bedarf ----------
const kistenListe = raum => [...raum.state.safes.values()].flatMap(s => [...s.kiste]);
function bedarfRechnen(raum, bots) {
  const s = raum.state, n = Math.max(1, s.spieler.size), k = kistenListe(raum);
  const bedarf = {
    wasser: Math.max(0, 2 + n - anz(k, 'wasser')),
    essen: Math.max(0, 2 + n - anz(k, 'essen')),
    spritze: medizinOffen(raum) && !k.includes('spritze') ? 1 : 0,
    taschenlampe: 0, bretter: 0,
  };
  // was Bots schon bei sich tragen (über ihrer Reserve), zählt als unterwegs
  for (const [, p] of bots) for (const d of ['wasser', 'essen', 'spritze']) bedarf[d] = Math.max(0, bedarf[d] - Math.max(0, anz(p.rucksack, d) - (RESERVE[d] ?? 0)));
  const lampe = o => o.lampe > 0 || o.rucksack.includes('taschenlampe');
  if (s.aufgaben.get('lampen') && !s.aufgaben.get('lampen').erledigt) bedarf.taschenlampe = [...s.spieler.values()].filter(o => !lampe(o)).length;
  const fs = raum.aufgaben?.funkSafe;
  if (fs && fs !== 'stuetzpunkt') { const bar = s.safes.get(fs)?.barrikade ?? 100; if (bar < 100) bedarf.bretter = Math.ceil((100 - bar) / 35); }
  return bedarf;
}

// Aufgabe „Medizin“ gibt es und ist noch nicht erfüllt (Spritze aus der Apotheke gilt schon als erfüllt)
const medizinOffen = raum => { const a = raum.state.aufgaben.get('medizin'); return !!a && !a.erledigt && !raum.aufgaben?.medizin; };

// Kisten: Aufgaben-Vorräte dürfen Bots nicht wieder herausnehmen (Haken in bots.mjs vorratskiste)
export function entnahmeFrei(raum, d, p) {
  const n = Math.max(1, raum.state.spieler.size);
  const sperr = { wasser: 2 + n, essen: 2 + n, spritze: medizinOffen(raum) ? 1 : 0 };
  if (!(d in sperr)) return true;
  if (d === 'spritze' && p?.infektion > 0) return true;
  return anz(kistenListe(raum), d) > sperr[d];
}

// ---------- Planer (alle ~2 s) ----------
function planer(raum, menschen) {
  const t0 = performance.now(), bp = zustand(raum), jetzt = raum.uhr, s = raum.state;
  bp.naechster = jetzt + BOTPLAN.takt;
  const bots = botListe(raum);
  const bedarf = bedarfRechnen(raum, bots);
  const nacht = istNacht(s.uhr);
  const ctx = bp.ctx = { bedarf, nacht, menschen, jetzt };

  // --- Rollen ---
  const befehlArt = x => x.bot.befehl?.art;
  const pool = bots.filter(([, , x]) => !['hol', 'funk', 'wache'].includes(befehlArt(x)));
  const begleiter = new Set(bots.filter(([, , x]) => befehlArt(x) === 'komm').map(([sid]) => sid));
  let offen = Math.max(0, menschen.length - begleiter.size);
  const frei_ = pool.filter(([sid]) => !begleiter.has(sid));
  // Einzel-Bot: bei Tag darf er sammeln, wenn der Mensch im Haus/Safe Room ist
  const einzel = bots.length === 1 && !nacht && menschen.length > 0 && menschen.every(m => m.ebene);
  if (!einzel) for (const m of menschen) {
    if (!offen || !frei_.length) break;
    const wm = weltPos(raum, m);
    frei_.sort((a, b) => (abstand(weltPos(raum, a[1]), wm) - (a[2].bot.plan.rolle === 'begleiter' ? 400 : 0)) - (abstand(weltPos(raum, b[1]), wm) - (b[2].bot.plan.rolle === 'begleiter' ? 400 : 0)));
    const [sid] = frei_.shift(); begleiter.add(sid); offen--;
  }
  for (const [sid, p, x] of bots) {
    const pl = x.bot.plan, befehl = x.bot.befehl;
    let rolle = begleiter.has(sid) ? 'begleiter' : 'sammler';
    const munitionKnapp = WAFFEN[p.waffe]?.fern && p.munition < 3 && !p.rucksack.some(q => WAFFEN[q] && !WAFFEN[q].fern);
    const schwach = p.hp < BOTPLAN.hpRueckkehr || munitionKnapp;
    if (rolle === 'sammler' && !befehl && (nacht || schwach || nah(raum, p, menschen) > BOTPLAN.umkreis * 1.3)) rolle = 'begleiter';
    pl.rolle = rolle;
  }

  // --- Aufträge ---
  const zugeteilt = {};   // was → Zahl der Bots mit diesem Holen-Auftrag
  for (const [, , x] of bots) { const a = x.bot.plan.auftrag; if (a?.art === 'holen') zugeteilt[a.was] = (zugeteilt[a.was] ?? 0) + 1; }
  let funkBot = bots.find(([, , x]) => x.bot.plan.auftrag?.art === 'funk')?.[0] ?? null;
  const aufgaben = [...s.aufgaben.values()].filter(a => !a.erledigt).sort((a, b) => (b.pflicht - a.pflicht));
  const busDa = s.busDa && raum.aufgaben?.busId;
  const meldeBus = { wer: null };

  for (const [sid, p, x] of bots) {
    const b = x.bot, pl = b.plan, a = pl.auftrag, befehl = b.befehl;
    if (befehl?.art === 'wache') { pl.auftrag = { art: 'wache', ...befehl }; continue; }
    if (busDa) {
      if (a?.art !== 'bus') { pl.auftrag = { art: 'bus' }; if (!meldeBus.wer) meldeBus.wer = sid; }
      continue;
    }
    if (a?.art === 'bus') pl.auftrag = null;
    if (befehl?.art === 'komm' || (pl.rolle === 'begleiter' && !befehl)) {
      // Begleiter: nur jagen, sonst folgen
      const j = jagdZiel(raum, p, menschen, bots, sid);
      const alt = pl.auftrag;
      if (j) pl.auftrag = { art: 'jagen', zombie: j, bis: jetzt + 8 };
      else if (alt && alt.art !== 'begleiten') pl.auftrag = null;
      continue;
    }
    if (befehl?.art === 'funk') { if (s.funk) { b.befehl = null; } else { pl.auftrag = { art: 'funk', befehl: true }; funkBot = sid; continue; } }
    if (befehl?.art === 'hol') { if (a?.art !== 'holen' || a.was !== befehl.was) pl.auftrag = { art: 'holen', was: befehl.was, befehl: true, phase: 'suchen' }; continue; }
    if (befehl && befehl.art !== 'frei') continue;
    if (jetzt < (pl.pause ?? 0)) continue;
    // laufender Auftrag noch gültig?
    if (a && auftragGueltig(raum, bp, a, p, ctx)) continue;
    pl.auftrag = null;
    // 1. Zombies in Gruppennähe jagen
    const j = jagdZiel(raum, p, menschen, bots, sid);
    if (j) { pl.auftrag = { art: 'jagen', zombie: j, bis: jetzt + 8 }; continue; }
    // 2. Funkspruch (Pflicht): ein Bot
    if (raum.aufgaben?.an() && !s.funk && s.aufgaben.get('funk') && !funkBot && !gesperrt(bp, 'funk:' + sid, jetzt)) { pl.auftrag = { art: 'funk' }; funkBot = sid; bp.funkSid = sid; sagt(raum, sid, p, 'Ich setz den Funkspruch ab'); continue; }
    // 3. Barrikade am Funk-Safe-Room
    if (ctx.bedarf.bretter > 0 && !bots.some(([o, , ox]) => o !== sid && (ox.bot.plan.auftrag?.art === 'barrikade' || (ox.bot.plan.auftrag?.art === 'holen' && ox.bot.plan.auftrag.was === 'bretter')))) {
      pl.auftrag = { art: 'barrikade' }; sagt(raum, sid, p, 'Ich verbarrikadier den Safe Room'); continue;
    }
    // 4. Vorräte, Medizin, Lampen: nach der Reihenfolge der Aufgaben, dann der Bedarf
    const reihe = [];
    for (const au of aufgaben) {
      if (au.id === 'vorraete') reihe.push(...['wasser', 'essen'].sort((q, r) => bedarf[r] - bedarf[q]));
      else if (au.id === 'medizin') reihe.push('spritze');
      else if (au.id === 'lampen') reihe.push('taschenlampe');
    }
    reihe.push('wasser', 'essen', 'spritze');
    const was = [...new Set(reihe)].find(w => bedarf[w] > 0 && (zugeteilt[w] ?? 0) * 2 < bedarf[w] + 1);
    if (was) { pl.auftrag = neuHolen(was); zugeteilt[was] = (zugeteilt[was] ?? 0) + 1; continue; }
    // 5. sonst: nahe Behälter durchsuchen (Vorrat für später)
    if (p.rucksack.length < p.plaetze - 2) pl.auftrag = neuHolen('alles');
  }
  if (meldeBus.wer) { const p = raum.state.spieler.get(meldeBus.wer); sagt(raum, meldeBus.wer, p, 'Der Bus ist da – kommt, wir steigen ein!'); }
  const ms = performance.now() - t0; bp.stat.n++; bp.stat.summe += ms; bp.stat.max = Math.max(bp.stat.max, ms);
  raum.messen?.('botplan', t0);
}
const neuHolen = was => ({ art: 'holen', was, phase: 'suchen', ziel: null });

function auftragGueltig(raum, bp, a, p, ctx) {
  const s = raum.state;
  switch (a.art) {
    case 'holen':
      if (a.phase === 'liefern') return true;
      if (a.was === 'alles') return p.rucksack.length < p.plaetze - 1 || abgabeListe(p, 'alles').length > 0;
      if (a.was === 'taschenlampe') return ctx.bedarf.taschenlampe > 0 || p.rucksack.includes('taschenlampe');
      return ctx.bedarf[a.was] > 0 || abgabeListe(p, a.was).length > 0 || (a.was === 'bretter' && p.rucksack.includes('bretter'));
    case 'funk': return !s.funk;
    case 'barrikade': return ctx.bedarf.bretter > 0 || p.rucksack.includes('bretter');
    case 'jagen': return raum.uhr < a.bis && s.zombies.has(a.zombie);
    default: return false;
  }
}

// Wachen Zombie in Gruppennähe, den dieser bewaffnete Bot jagen soll (höchstens zwei Jäger je Zombie)
function jagdZiel(raum, p, menschen, bots, sid) {
  if (!menschen.length || p.hp < 60 || !bewaffnet(p) || p.ebene) return null;
  let best = null, bd = 380;
  for (const [id, z] of raum.state.zombies) {
    if ((z.ebene ?? '') !== '' || raum.zombieInfo.get(id)?.schlaeft) continue;
    if (nah(raum, z, menschen) > BOTPLAN.jagdRadius) continue;
    const d = abstand(p, z);
    if (d >= bd) continue;
    if (bots.filter(([o, , ox]) => o !== sid && ox.bot.plan.auftrag?.zombie === id).length >= 2) continue;
    bd = d; best = id;
  }
  // nicht in große Gruppen laufen
  if (best) {
    const z = raum.state.zombies.get(best);
    let viele = 0; for (const o of raum.state.zombies.values()) if (!o.ebene && abstand(o, z) < 200) viele++;
    if (viele > 4) return null;
  }
  return best;
}

// ---------- Ausführung ----------
// zum Ziel gehen mit Fortschrittsprüfung: kommt der Bot 10 s nicht näher, wird das Ziel verworfen und gesperrt
function gehe(raum, sid, p, x, H, a, ziel, key, tempo = 1, halt = 14) {
  const bp = zustand(raum), key2 = key + '@' + (p.ebene ?? ''), d = abstand(p, ziel), f = a.fort;
  if (!f || f.key !== key2) a.fort = { key: key2, d, t: raum.uhr };
  else if (d < f.d - 10) { f.d = d; f.t = raum.uhr; }
  else if (raum.uhr - f.t > BOTPLAN.verwerfenNach) {
    bp.gesperrt.set(key, raum.uhr + BOTPLAN.sperrzeit);
    a.fort = null; a.ziel = null; x.eingabe = { dx: 0, dy: 0, s: false };
    return 'verworfen';
  }
  H.geheZu(raum, sid, p, x, ziel, tempo, halt);
  return 'unterwegs';
}
// in eine andere Ebene wechseln (Haus, Safe Room, Treppe, nach draußen); true = noch unterwegs
function reise(raum, sid, p, x, H, a, zielEbene, sperrKey = 'u:' + zielEbene) {
  if ((p.ebene ?? '') === zielEbene) return false;
  const punkt = raum.uebergangsPunkt(p.ebene ?? '', zielEbene);
  if (!punkt) return false;
  x.bot.uebergangZiel = punkt;
  const r = gehe(raum, sid, p, x, H, a, punkt, sperrKey, 1, 2);
  return r === 'unterwegs';
}
function standpunkt(welt, p, rechtecke) {
  let best = null, bd = Infinity;
  for (const r of rechtecke) {
    const x0 = r.x * KACHEL, y0 = r.y * KACHEL, x1 = (r.x + r.b) * KACHEL, y1 = (r.y + r.h) * KACHEL, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    for (const q of [{ x: cx, y: y1 + 26 }, { x: cx, y: y0 - 26 }, { x: x0 - 26, y: cy }, { x: x1 + 26, y: cy }]) {
      if (!frei(welt, q.x, q.y, RAD)) continue;
      const d = abstand(p, q);
      if (d < bd) { bd = d; best = q; }
    }
  }
  return best;
}
const still = x => { x.eingabe = { dx: 0, dy: 0, s: false }; };
const startAktion = (p, x, art, k) => { p.aktion = art; p.fortschritt = 0; x.aktionZiel = k; x.laermUhr = 0; };

function abgabeListe(p, was) {
  const dep = was === 'alles' ? ['wasser', 'essen', 'spritze', 'verband'] : was === 'taschenlampe' ? [] : [was];
  const r = [];
  for (const d of dep) for (let i = 0; i < anz(p.rucksack, d) - (RESERVE[d] ?? 0); i++) r.push(d);
  return r;
}
function naechsterSafe(raum, p) {
  const w = weltPos(raum, p);
  let best = null, bd = Infinity;
  for (const s of raum.welt.safeRooms) {
    const k = raum.state.safes.get(s.id)?.kiste;
    if (!k || k.length >= KISTE_PLAETZE) continue;
    const d = abstand(w, hausPos(s.haus));
    if (d < bd) { bd = d; best = s; }
  }
  return best;
}

function funkAusfuehren(raum, sid, p, x, H, a) {
  const welt = raum.wv(p.ebene);
  if (!a.ort) {
    // nächster Safe Room mit Funktisch oder das Funkzelt am Stützpunkt (nur, wenn deutlich näher)
    const w = weltPos(raum, p);
    let best = null, bd = Infinity;
    for (const s of raum.welt.safeRooms) {
      if (gesperrt(zustand(raum), 'funk:' + s.id, raum.uhr)) continue;
      if (!raum.wv(s.ebene).moebel?.some(m => m.art === 'funktisch')) continue;
      const d = abstand(w, hausPos(s.haus));
      if (d < bd) { bd = d; best = { art: 'safe', s, ebene: s.ebene }; }
    }
    const fz = raum.welt.stuetzpunkt?.teile?.find(q => q.art === 'funkzelt')?.funkpunkt;
    if (fz && raum.state.stuetzpunkt === 'steht' && Math.hypot(w.x - fz[0], w.y - fz[1]) < bd * 0.6) best = { art: 'zelt', punkt: { x: fz[0], y: fz[1] }, ebene: '' };
    if (!best) { x.bot.plan.auftrag = null; x.bot.plan.pause = raum.uhr + 10; return false; }
    a.ort = best;
  }
  const ort = a.ort;
  if (reise(raum, sid, p, x, H, a, ort.ebene)) return true;
  if ((p.ebene ?? '') !== ort.ebene) { zustand(raum).gesperrt.set('funk:' + (ort.s?.id ?? 'zelt'), raum.uhr + BOTPLAN.sperrzeit); a.ort = null; return false; }
  const k = raum.aufgaben.funkKontext(p);
  if (k) { startAktion(p, x, 'funk', k); a.fort = null; return true; }
  const ziel = ort.art === 'zelt' ? ort.punkt : standpunkt(welt, p, welt.moebel.filter(m => m.art === 'funktisch'));
  if (!ziel) { zustand(raum).gesperrt.set('funk:' + ort.s.id, raum.uhr + BOTPLAN.sperrzeit); a.ort = null; return false; }
  const r = gehe(raum, sid, p, x, H, a, ziel, 'funk:' + (ort.s?.id ?? 'zelt'), 0.9, 6);
  if (r === 'verworfen') { a.ort = null; return false; }
  return true;
}

function barrikadeAusfuehren(raum, sid, p, x, H, a) {
  const id = raum.aufgaben?.funkSafe, s = raum.welt.safeRooms.find(q => q.id === id);
  const bar = id && raum.state.safes.get(id)?.barrikade;
  if (!s || bar >= 100) { x.bot.plan.auftrag = null; return false; }
  const br = anz(p.rucksack, 'bretter');
  if (!br) {
    // Bretter aus der Kiste nehmen, sonst suchen
    const kiste = raum.state.safes.get(id).kiste, i = [...kiste].indexOf('bretter');
    if (i >= 0 && p.rucksack.length < p.plaetze) {
      if (reise(raum, sid, p, x, H, a, s.ebene)) return true;
      const k = raum.wv(s.ebene).kiste;
      if (abstand(p, k) > AKTION_ABSTAND - 4) { gehe(raum, sid, p, x, H, a, k, 'k:' + id, 0.9, AKTION_ABSTAND - 10); return true; }
      if (raum.uhr - (x.bot.kisteZeit ?? 0) < 0.8) { still(x); return true; }
      x.bot.kisteZeit = raum.uhr; kiste.splice(i, 1); p.rucksack.push('bretter'); return true;
    }
    x.bot.plan.auftrag = neuHolen('bretter');
    return false;
  }
  if (reise(raum, sid, p, x, H, a, s.ebene)) return true;
  const w = raum.wv(s.ebene), spot = raum.nebenKachel(w, w.ausgang);
  const k = raum.kontext(p);
  if (k && (k.art === 'barrikade' || k.art === 'wegziehen')) { startAktion(p, x, k.art, k); a.fort = null; return true; }
  const r = gehe(raum, sid, p, x, H, a, spot, 'bar:' + id, 0.9, 8);
  if (r === 'verworfen') { x.bot.plan.auftrag = null; x.bot.plan.pause = raum.uhr + 15; return false; }
  return true;
}

function busAusfuehren(raum, sid, p, x, H, a) {
  const f = raum.state.fahrzeuge.get(raum.aufgaben?.busId);
  if (!f) return false;
  if (reise(raum, sid, p, x, H, a, '')) return true;
  if (abstand(p, f) > BUS_ABSTAND - 30) { gehe(raum, sid, p, x, H, a, f, 'bus', 1, BUS_ABSTAND - 36); return true; }
  still(x); return true;
}

function wacheAusfuehren(raum, sid, p, x, H, a) {
  if (reise(raum, sid, p, x, H, a, a.ebene ?? '')) return true;
  if (abstand(p, a) > 24) { gehe(raum, sid, p, x, H, a, a, 'wache', 0.8, 16); return true; }
  still(x); return true;
}

function jagenAusfuehren(raum, sid, p, x, H, a) {
  const z = raum.state.zombies.get(a.zombie);
  if (!z || (z.ebene ?? '') !== (p.ebene ?? '')) { x.bot.plan.auftrag = null; return false; }
  const fern = bewaffnet(p) === 'fern';
  const r = gehe(raum, sid, p, x, H, a, z, 'z:' + a.zombie, 1, fern ? 150 : 22);
  if (r === 'verworfen') { x.bot.plan.auftrag = null; return false; }
  return true;
}

// ---------- Holen und Abliefern ----------
function passt(raum, bp, bh, was, p) {
  if (bh.art === 'auto' && !p.rucksack.includes('brechstange')) return false;
  if (bh.art?.startsWith('bw_')) return false;
  if (bp.durchsucht.has(bh.id) || gesperrt(bp, 'b:' + bh.id, raum.uhr)) return false;
  if (raum.state.behaelter.get(bh.id)?.rest === 0) return false;
  if (was === 'alles') return true;
  const inh = raum.inhalte.get(bh.id);
  if (inh) return inh.includes(was);
  return (BEUTE[bh.art] ?? []).includes(was);
}
// Bonus (abgezogen vom Abstand) für Häuser, in denen es das Gesuchte wahrscheinlich gibt
function hausBonus(h, was) {
  const art = ladenArt(h);
  if (!art) return 0;
  const gut = { lebensmittel: ['wasser', 'essen'], apotheke: ['spritze', 'verband'], kaufhaus: ['taschenlampe', 'wasser'], gaststaette: ['wasser', 'essen'] }[art] ?? [];
  if (was === 'alles') return 150;
  if (gut.includes(was)) return art === 'gaststaette' || art === 'kaufhaus' ? 300 : 700;
  return -500;
}
function sucheZiel(raum, bp, p, x, was, menschen, bots, sid) {
  // 1. Behälter im Haus, in dem der Bot gerade steht
  if (p.ebene) {
    const w = raum.wv(p.ebene);
    let best = null, bd = Infinity;
    for (const bh of w.behaelter ?? []) {
      if (!passt(raum, bp, bh, was, p)) continue;
      const d = abstand(p, bh);
      if (d < bd) { bd = d; best = bh; }
    }
    if (best) return { art: 'behaelter', id: best.id, b: best, ebene: p.ebene };
    const m = EBENE_MUSTER.exec(p.ebene);
    if (m) bp.fertig.add('h' + m[1] + ':' + was);
  }
  // 2. Häuser und Behälter draußen
  const hier = weltPos(raum, p), reserviert = new Set();
  for (const [o, , ox] of bots) if (o !== sid) { const z = ox.bot.plan.auftrag?.ziel; if (z) reserviert.add(z.art === 'haus' ? 'h' + z.nr : z.id); }
  const partner = bots.filter(([o, , ox]) => o !== sid && ox.bot.plan.auftrag?.ziel?.pos).map(([, , ox]) => ox.bot.plan.auftrag.ziel.pos);
  const wertung = (pos, extra) => {
    let sc = abstand(hier, pos) - extra;
    if (partner.some(q => abstand(q, pos) < 350)) sc -= 250;   // bevorzugt zu zweit
    return sc;
  };
  let best = null, bs = Infinity;
  const pruefe = (z, sc) => { if (reserviert.has(z.art === 'haus' ? 'h' + z.nr : z.id)) sc += 1500; if (sc < bs) { bs = sc; best = z; } };
  for (const bh of raum.welt.behaelter ?? []) {
    if (!passt(raum, bp, bh, was, p)) continue;
    if (nah(raum, bh, menschen) > BOTPLAN.umkreis) continue;
    pruefe({ art: 'behaelter', id: bh.id, b: bh, ebene: '', pos: bh }, wertung(bh, 0));
  }
  for (const h of raum.welt.haeuser ?? []) {
    if (!h.betretbar || !h.tuer || bp.fertig.has('h' + h.nr + ':' + was) || gesperrt(bp, 'h:' + h.nr, raum.uhr)) continue;
    const pos = hausPos(h);
    if (nah(raum, pos, menschen) > BOTPLAN.umkreis) continue;
    pruefe({ art: 'haus', nr: h.nr, id: 'h' + h.nr, name: h.name, pos }, wertung(pos, hausBonus(h, was)));
  }
  return best;
}
function zielGueltig(raum, bp, z, p, was) {
  if (!z) return false;
  if (z.art === 'haus') return !bp.fertig.has('h' + z.nr + ':' + was) && !gesperrt(bp, 'h:' + z.nr, raum.uhr);
  return passt(raum, bp, z.b, was, p) && z.ebene === (p.ebene ?? '');
}
function zielText(z) {
  if (z.art === 'haus') return z.name ? `aus dem ${z.name}` : 'aus einem Haus';
  return z.b.art === 'auto' ? 'aus einem Kofferraum' : z.b.art === 'container' ? 'aus einem Container' : 'von hier';
}

function holenAusfuehren(raum, sid, p, x, H, a, menschen, bots) {
  const bp = zustand(raum), ctx = bp.ctx, b = x.bot, was = a.was;
  if (was === 'taschenlampe') return lampeAusfuehren(raum, sid, p, x, H, a, menschen);
  // Bretter: mit Brettern im Rucksack und bekanntem Funk-Safe-Room gleich verbarrikadieren
  if (was === 'bretter' && p.rucksack.includes('bretter') && (ctx?.bedarf.bretter ?? 0) > 0 && (anz(p.rucksack, 'bretter') >= Math.min(3, ctx.bedarf.bretter) || a.phase === 'liefern')) {
    b.plan.auftrag = { art: 'barrikade' }; return barrikadeAusfuehren(raum, sid, p, x, H, b.plan.auftrag);
  }
  const liste = abgabeListe(p, was), voll = p.rucksack.length >= p.plaetze;
  const gezaehlt = was === 'alles' ? liste.length : anz(liste, was);
  const stapel = was === 'alles' ? 3 : Math.max(1, Math.min(BOTPLAN.batch, ctx?.bedarf[was] || 1));
  if (a.phase === 'liefern' || gezaehlt >= stapel || (liste.length > 0 && (voll || a.keineZiele))) { a.phase = 'liefern'; return liefern(raum, sid, p, x, H, a, liste); }
  if (was === 'bretter' && a.keineZiele && p.rucksack.includes('bretter')) { a.phase = 'liefern'; return liefern(raum, sid, p, x, H, a, ['bretter']); }
  if (voll && was !== 'alles') { fertig(raum, b, a); return false; }
  // Ziel suchen
  if (!zielGueltig(raum, bp, a.ziel, p, was)) a.ziel = null;
  if (!a.ziel) {
    a.ziel = sucheZiel(raum, bp, p, x, was, menschen, bots, sid);
    if (!a.ziel) {
      a.keineZiele = true;
      if (liste.length || (was === 'bretter' && p.rucksack.includes('bretter'))) return holenAusfuehren(raum, sid, p, x, H, a, menschen, bots);
      fertig(raum, b, a); return false;
    }
    if (!a.angesagt) { a.angesagt = true; sagt(raum, sid, p, `Ich hol ${NAMEN[was] ?? was} ${zielText(a.ziel)}`.replace('Ich hol Vorräte', 'Ich schau mich nach Vorräten um')); }
  }
  const z = a.ziel;
  if (z.art === 'haus') {
    const ebene = `h${z.nr}eg`;
    if ((p.ebene ?? '') === ebene) { a.ziel = null; return holenAusfuehren(raum, sid, p, x, H, a, menschen, bots); }   // drin: im Innenraum weitersuchen
    if (reise(raum, sid, p, x, H, a, ebene, 'h:' + z.nr)) return true;
    a.ziel = null; return false;
  }
  return zielAnsteuern(raum, sid, p, x, H, a);
}
function fertig(raum, b, a) {
  b.plan.auftrag = null; b.plan.pause = raum.uhr + 6;
  if (a.befehl && b.befehl?.art === 'hol') b.befehl = null;
}
// Gefundenes in die Kiste des nächsten Safe Rooms legen
function liefern(raum, sid, p, x, H, a, liste) {
  const b = x.bot;
  const s = a.safe && raum.state.safes.get(a.safe.id)?.kiste.length < KISTE_PLAETZE ? a.safe : (a.safe = naechsterSafe(raum, p));
  if (!s) { fertig(raum, b, a); return false; }
  if (!liste.length) {
    const was = a.was === 'alles' ? null : a.was;
    if (was && a.abgegeben) {
      const k = raum.state.safes.get(s.id).kiste, n = anz([...k], was);
      sagt(raum, sid, p, `${n} ${NAMEN[was].replace('eine ', '').replace('Konserven', n === 1 ? 'Konserve' : 'Konserven')} ${n === 1 ? 'liegt' : 'liegen'} jetzt in der Kiste im ${s.name}`);
    }
    fertig(raum, b, a); return false;
  }
  if (reise(raum, sid, p, x, H, a, s.ebene)) return true;
  const w = raum.wv(s.ebene), k = w.kiste;
  if (!k) { fertig(raum, b, a); return false; }
  if (abstand(p, k) > AKTION_ABSTAND - 4) {
    const r = gehe(raum, sid, p, x, H, a, k, 'k:' + s.id, 0.9, AKTION_ABSTAND - 10);
    if (r === 'verworfen') { a.safe = null; fertig(raum, b, a); return false; }
    return true;
  }
  if (raum.uhr - (b.kisteZeit ?? 0) < 0.8) { still(x); return true; }
  b.kisteZeit = raum.uhr;
  const kiste = raum.state.safes.get(s.id).kiste, d = liste[0];
  p.rucksack.splice(p.rucksack.lastIndexOf(d), 1); kiste.push(d); a.abgegeben = (a.abgegeben ?? 0) + 1;
  return true;
}
// Taschenlampe: findet der Bot eine über, legt er sie einem Menschen ohne Lampe vor die Füße
const lampeVorhanden = o => o.lampe > 0 || o.rucksack.includes('taschenlampe');
function lampeAusfuehren(raum, sid, p, x, H, a, menschen) {
  const b = x.bot, bp = zustand(raum);
  const ohne = menschen.filter(m => !lampeVorhanden(m));
  if (a.phase === 'liefern' || (anz(p.rucksack, 'taschenlampe') > 0 && ohne.length) || anz(p.rucksack, 'taschenlampe') > 1) {
    a.phase = 'liefern';
    const m = ohne.sort((q, r) => abstand(weltPos(raum, p), weltPos(raum, q)) - abstand(weltPos(raum, p), weltPos(raum, r)))[0];
    if (!m || !p.rucksack.includes('taschenlampe')) { fertig(raum, b, a); return false; }
    if ((p.ebene ?? '') !== (m.ebene ?? '')) { if (reise(raum, sid, p, x, H, a, m.ebene ?? '')) return true; fertig(raum, b, a); return false; }
    if (abstand(p, m) > 40) { gehe(raum, sid, p, x, H, a, m, 'l:' + m.name, 1, 34); return true; }
    p.rucksack.splice(p.rucksack.lastIndexOf('taschenlampe'), 1);
    const id = raum.legeHin('taschenlampe', m.x, m.y, m.ebene ?? '');
    (b.verschmaeht ??= new Set()).add(id);
    sagt(raum, sid, p, `${m.name}, hier liegt eine Taschenlampe für dich`);
    fertig(raum, b, a); return false;
  }
  // suchen wie bei „holen“, aber ohne Abliefern in die Kiste
  if (p.rucksack.length >= p.plaetze) { fertig(raum, b, a); return false; }
  if (!zielGueltig(raum, bp, a.ziel, p, 'taschenlampe')) a.ziel = null;
  if (!a.ziel) {
    a.ziel = sucheZiel(raum, bp, p, x, 'taschenlampe', menschen, botListe(raum), sid);
    if (!a.ziel) { fertig(raum, b, a); return false; }
    if (!a.angesagt) { a.angesagt = true; sagt(raum, sid, p, `Ich such eine Taschenlampe ${zielText(a.ziel)}`); }
  }
  return zielAnsteuern(raum, sid, p, x, H, a);
}
// Standplatz neben einem Behälter (Regale und Schränke selbst sind nicht begehbar): freier Punkt in der Nähe mit Weg dorthin
function behaelterStand(raum, p, bh) {
  const welt = raum.wv(p.ebene), c = [];
  for (const r of [28, 34, 42]) for (let i = 0; i < 8; i++) {
    const q = { x: bh.x + Math.cos(i * Math.PI / 4) * r, y: bh.y + Math.sin(i * Math.PI / 4) * r };
    if (frei(welt, q.x, q.y, RAD)) c.push(q);
  }
  c.sort((m, n) => abstand(p, m) - abstand(p, n));
  for (const q of c.slice(0, 4)) if (findeWeg(welt, p.x, p.y, q.x, q.y, RAD, 40000, true)) return q;
  return null;
}
function zielAnsteuern(raum, sid, p, x, H, a) {
  const bp = zustand(raum), b = x.bot, z = a.ziel;
  if (z.art === 'haus') {
    const ebene = `h${z.nr}eg`;
    if ((p.ebene ?? '') === ebene) { a.ziel = null; return false; }
    return reise(raum, sid, p, x, H, a, ebene, 'h:' + z.nr) || (a.ziel = null, false);
  }
  if ((p.ebene ?? '') !== z.ebene) { a.ziel = null; return false; }
  if (abstand(p, z.b) > AKTION_ABSTAND - 4 && !(z.stand && abstand(p, z.stand) < 16)) {
    if (z.stand === undefined) z.stand = behaelterStand(raum, p, z.b);
    if (!z.stand) { bp.gesperrt.set('b:' + z.id, raum.uhr + BOTPLAN.sperrzeit); a.ziel = null; return false; }
    const r = gehe(raum, sid, p, x, H, a, z.stand, 'b:' + z.id, 0.9, 8);
    return r === 'unterwegs' || (a.ziel = null, false);
  }
  b.durchsucht ??= new Set(); b.durchsucht.add(z.id); bp.durchsucht.add(z.id);
  startAktion(p, x, 'durchsuchen', { art: 'durchsuchen', behaelter: z.b, dauer: durchsuchDauer(z.b.art) });
  a.ziel = null; a.fort = null;
  return true;
}

// ---------- Einstieg aus botSchritt ----------
// true: Der Planer hat diesen Schritt übernommen (x.eingabe gesetzt); false: bisheriges Verhalten
export function planSchritt(raum, sid, p, x, H) {
  if (!BOTPLAN.an) return false;
  const t0 = performance.now(), bp = zustand(raum), b = x.bot;
  try {
    const menschen = menschenListe(raum);
    if (!menschen.length) return false;
    // Funkspruch ist raus: der Bot, der dafür losging, meldet es genau einmal (unabhängig vom aktuellen Auftrag)
    if (raum.state.funk && !bp.funkGemeldet && (bp.funkSid === sid || b.plan?.auftrag?.art === 'funk')) {
      bp.funkGemeldet = true;
      sagt(raum, sid, p, `Funkspruch ist raus – der Bus kommt um ${hhmm(raum.state.busAnkunft)} Uhr!`, true);
      if (b.befehl?.art === 'funk') b.befehl = null;
      if (b.plan?.auftrag?.art === 'funk') b.plan.auftrag = null;
    }
    if (!raum.state.funk) bp.funkGemeldet = false;
    if (raum.uhr >= bp.naechster || !b.plan) planer(raum, menschen);
    const pl = b.plan;
    if (!pl) return false;
    const a = pl.auftrag;
    if (!a || a.art === 'begleiten') return false;
    switch (a.art) {
      case 'funk': return funkAusfuehren(raum, sid, p, x, H, a);
      case 'barrikade': return barrikadeAusfuehren(raum, sid, p, x, H, a);
      case 'bus': return busAusfuehren(raum, sid, p, x, H, a);
      case 'wache': return wacheAusfuehren(raum, sid, p, x, H, a);
      case 'jagen': return jagenAusfuehren(raum, sid, p, x, H, a);
      case 'holen': return holenAusfuehren(raum, sid, p, x, H, a, menschen, botListe(raum));
      default: return false;
    }
  } finally {
    const ms = performance.now() - t0; bp.stat.n++; bp.stat.summe += ms; bp.stat.max = Math.max(bp.stat.max, ms);
  }
}

// ---------- Chat-Befehle ----------
// Haken aus raum.mjs chat(): „Resi, hol wasser“, „folgt mir“, „alle bleibt hier“ …
export function botBefehl(raum, sid, text) {
  if (!BOTPLAN.an) return;
  const bots = botListe(raum);
  if (!bots.length) return;
  const t = String(text ?? '').toLowerCase().replace(/[.,!?:;]+/g, ' ').trim().split(/\s+/).filter(Boolean);
  if (!t.length) return;
  const name = p => p.name.replace(/\s*🤖\s*/, '').toLowerCase();
  let ziele = null, rest = t;
  const i = t.slice(0, 2).findIndex(w => w === 'alle' || w === 'bots' || bots.some(([, p]) => name(p) === w));
  if (i >= 0) {
    const w = t[i];
    ziele = w === 'alle' || w === 'bots' ? bots : bots.filter(([, p]) => name(p) === w);
    rest = t.filter((_, j) => j !== i);
  } else if (/^(folgt|kommt)$/.test(t[0])) { ziele = bots; }
  if (!ziele || !rest.length) return;
  const wort = rest[0], was = WAS_WORT[rest[1]] ?? WAS_WORT[rest[2]];
  let art = null;
  if (/^(komm|kommt|folg|folge|folgt)$/.test(wort)) art = 'komm';
  else if (/^(hol|holt|hole|bring|bringt)$/.test(wort) && was) art = 'hol';
  else if (/^(bleib|bleibt|warte|wartet|wache)$/.test(wort)) art = 'wache';
  else if (/^(funk|funke|funkt|funkspruch)$/.test(wort)) art = 'funk';
  else if (/^(frei|selbst|selbstaendig|selbständig)$/.test(wort)) art = 'frei';
  if (!art) return;
  for (const [bid, p, x] of ziele) {
    const b = x.bot, pl = b.plan;
    let antwort;
    if (art === 'komm') { b.befehl = { art: 'komm' }; pl.auftrag = null; pl.pause = 0; antwort = 'Alles klar, ich bleib bei dir'; }
    else if (art === 'hol') { b.befehl = { art: 'hol', was }; pl.auftrag = { art: 'holen', was, befehl: true, phase: 'suchen', ziel: null }; antwort = `Mach ich – ich hol ${NAMEN[was]}`; }
    else if (art === 'wache') { b.befehl = { art: 'wache', x: p.x, y: p.y, ebene: p.ebene ?? '' }; pl.auftrag = { art: 'wache', ...b.befehl }; antwort = 'Ich bleib hier und pass auf'; }
    else if (art === 'funk') {
      if (raum.state.funk) antwort = 'Der Funkspruch ist schon raus';
      else { b.befehl = { art: 'funk' }; pl.auftrag = { art: 'funk', befehl: true }; antwort = 'Ich funk gleich'; }
    } else { b.befehl = null; pl.auftrag = null; pl.pause = 0; antwort = 'Okay, ich schau selbst, was zu tun ist'; }
    sagt(raum, bid, p, antwort, true);
  }
  raum.botplan && (raum.botplan.naechster = 0);
}

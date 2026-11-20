// Schießstand / Tutorial (Client): Lobby-Knopf, Entfernungsmarken am Boden und Bedienfeld mit Auswertung.
// Gespielt wird in derselben Szene wie im Spiel (spiel.mjs); der Raum 'schiessstand' (server/schiessstand.mjs) liefert Zustand und Auswertung.
import { DINGE, WAFFEN } from './welt.mjs';
import { SS_START, SS_MARKEN, PX_PRO_METER } from './schiessstand_welt.mjs';

export const TUT = { an: false };   // true, sobald der Schießstand gewählt wurde (spiel.mjs baut dann die Übungswelt und tritt dem Raum bei)

const ZEICHEN = { granatwerfer: '🧨', faust: '✊', handgranate: '💣' };
const NAMEN = { faust: 'Faust', handgranate: 'Handgranate' };
const KURZ = { pistole: 'Pistole', mp: 'MP', gewehr: 'Gewehr', schrotflinte: 'Schrot', mg: 'MG', scharfschuetze: 'Scharfschütze', armbrust: 'Armbrust', granatwerfer: 'Granatwerfer', messer: 'Messer', schlaeger: 'Schläger', faust: 'Faust', handgranate: 'Handgranate' };
const zeichen = n => ZEICHEN[n] ?? DINGE[n]?.zeichen ?? '•';
const name = n => NAMEN[n] ?? DINGE[n]?.name ?? n;
const WAFFEN_LISTE = ['pistole', 'mp', 'gewehr', 'schrotflinte', 'mg', 'scharfschuetze', 'armbrust', 'granatwerfer', 'messer', 'schlaeger', 'faust'];
const ZEILEN = [...WAFFEN_LISTE, 'handgranate'];
const MEHRZAHL = { Schuss: 'Schüsse', Schlag: 'Schläge', Wurf: 'Würfe' };
const komma = (z, n = 1) => z.toLocaleString('de-DE', { minimumFractionDigits: n, maximumFractionDigits: n });
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const CSS = `
#ssknopf { display: block; width: 100%; min-height: 44px; margin-top: 8px; border-radius: 10px; border: 2px solid #8bc34a; background: #33691e55; color: #fff; font: inherit; font-weight: 700; cursor: pointer; }
#ssbox { position: fixed; left: max(8px, env(safe-area-inset-left)); top: 128px; z-index: 20; width: min(318px, calc(100vw - 16px)); max-height: calc(100vh - 330px); min-height: 40px; display: none; flex-direction: column;
  background: #101810e6; color: #fff; border: 1px solid #8bc34a88; border-radius: 10px; font-size: 12px; line-height: 1.3; pointer-events: auto; }
#ssbox.an { display: flex; }
#ssbox .ss-kopf b { display: inline; }
#ssbox .ss-kopf { display: flex; align-items: center; justify-content: space-between; padding: 6px 8px; cursor: pointer; font-size: 14px; flex: none; }
#ssbox .ss-kopf button { background: none; border: 0; border-radius: 0; color: #fff; font-size: 16px; min-width: 30px; min-height: 30px; width: auto; margin: 0; padding: 0; cursor: pointer; }
#ssbox .ss-koerper { overflow-y: auto; overflow-x: hidden; padding: 0 8px 8px; -webkit-overflow-scrolling: touch; }
#ssbox.zu .ss-koerper { display: none; }
#ssbox .ss-titel { margin: 8px 0 3px; font-weight: 700; color: #aed581; font-size: 11px; text-transform: uppercase; letter-spacing: .04em; }
#ssbox .ss-gitter { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 4px; }
#ssbox .ss-reihe { display: flex; gap: 4px; flex-wrap: wrap; }
#ssbox button.ss-b { margin: 0; width: auto; min-width: 0; min-height: 40px; padding: 2px 3px; border-radius: 8px; border: 2px solid #ffffff33; background: #000a; color: #fff; font: inherit; font-size: 11px; font-weight: 600; cursor: pointer; line-height: 1.1; overflow: hidden; text-overflow: ellipsis; }
#ssbox .ss-reihe button.ss-b { flex: 1; font-size: 12px; min-width: 70px; }
#ssbox .ss-titel { }
#ssbox button.ss-b .z { display: block; font-size: 17px; }
#ssbox button.ss-b.aktiv { border-color: #ffd54f; background: #4a3d0acc; }
#ssbox button.ss-b.an { border-color: #66bb6a; background: #1b5e20cc; }
#ssbox button.ss-b.ende { flex: 1 1 100%; border-color: #e57373; }
#ssbox #ss-info { margin: 6px 0 2px; color: #ffe082; }
#ssbox table { width: 100%; table-layout: auto; border-collapse: collapse; margin-top: 4px; font-size: 11px; }
#ssbox th { font-weight: 600; color: #aed581; text-align: right; padding: 1px 2px; }
#ssbox td { text-align: right; padding: 1px 2px; border-top: 1px solid #ffffff1c; white-space: nowrap; }
#ssbox th:first-child, #ssbox td:first-child { text-align: left; }
#ssbox tr.aktiv td { background: #4a3d0a88; }
#ssbox #ss-text { margin-top: 6px; }
#ssbox #ss-text p { margin: 4px 0; }
#ssbox #ss-text p.klein { opacity: .75; font-size: 11px; }
body.tutorial #chatknopf, body.tutorial #sprachknopf, body.tutorial #sicher, body.tutorial #aufgaben { display: none !important; }
@media (max-width: 640px), (max-height: 560px) { #ssbox { top: 112px; max-height: calc(100vh - 290px); } }
`;

// Knopf „🎯 Schießstand / Tutorial“ in der Lobby; start() ist das normale Mitspielen
export function tutorialKnopf(start) {
  const los = document.getElementById('los');
  if (!los || document.getElementById('ssknopf')) return;
  const b = document.createElement('button');
  b.id = 'ssknopf'; b.type = 'button'; b.textContent = '🎯 Schießstand / Tutorial';
  b.title = 'Waffen üben, ohne die Spielwelt zu berühren: eigener Übungsplatz, unsterblich, unbegrenzte Munition';
  b.onclick = () => { TUT.an = true; start(); };
  los.insertAdjacentElement('afterend', b);
}

// Entfernungsmarken am Boden (10, 25, 50, 75 m ab dem Spieler; 8 px = 1 m) als Linien mit Beschriftung
export function marken(szene) {
  const g = szene.add.graphics().setDepth(1.3);
  const x0 = SS_START.x - 320, x1 = SS_START.x + 320;
  const linie = (m, farbe, breite) => {
    const y = SS_START.y + m * PX_PRO_METER;
    g.lineStyle(breite, farbe, 0.85);
    for (let x = x0; x < x1; x += 28) g.lineBetween(x, y, Math.min(x + 18, x1), y);
    for (const sx of [x0 - 6, x1 + 6]) szene.add.text(sx, y - 9, `${m} m`, { fontSize: '16px', fontStyle: 'bold', color: '#ffffff', stroke: '#000000', strokeThickness: 4 }).setOrigin(sx < SS_START.x ? 1 : 0, 0.5).setDepth(1.4);
  };
  linie(0, 0x80cbc4, 2);
  for (const m of SS_MARKEN) linie(m, 0xffd54f, 3);
  // kleine Striche alle 5 m an der Mittellinie
  g.lineStyle(2, 0xffffff, 0.45);
  for (let m = 5; m < SS_MARKEN[SS_MARKEN.length - 1]; m += 5) { const y = SS_START.y + m * PX_PRO_METER; g.lineBetween(SS_START.x - 8, y, SS_START.x + 8, y); }
  szene.add.text(SS_START.x, SS_START.y - 36, '🎯 Schießstand', { fontSize: '13px', fontStyle: 'bold', color: '#c5e1a5', stroke: '#000', strokeThickness: 3 }).setOrigin(0.5).setDepth(1.4);
  return g;
}

// Bedienfeld und Auswertung; ctx: { abmelden() } sagt spiel.mjs, dass das Trennen gewollt ist
export function tutorialStart(szene, raum, meineId, ctx = {}) {
  for (const id of ['ssstil', 'ssbox']) document.getElementById(id)?.remove();
  document.body.classList.add('tutorial');
  const st = document.createElement('style'); st.id = 'ssstil'; st.textContent = CSS; document.head.append(st);
  marken(szene);
  szene.zoomWahl = Math.min(szene.zoomWahl ?? 1, 0.6); szene.cameras.main.setZoom(szene.zielZoom());   // weiter heraus: die Marken bis 75 m sollen ins Bild (nicht gespeichert)
  const box = document.createElement('div');
  box.id = 'ssbox'; box.setAttribute('aria-label', 'Schießstand');
  const schmal = Math.min(window.innerWidth, window.innerHeight) < 560;
  box.className = 'an' + (schmal ? ' zu' : '');
  box.innerHTML = `
    <div class="ss-kopf" id="ss-kopf"><b>🎯 Schießstand</b><button type="button" id="ss-zu" aria-label="Ein- oder ausklappen">▾</button></div>
    <div class="ss-koerper">
      <div class="ss-titel">Waffe wählen</div>
      <div class="ss-gitter" id="ss-waffen">${WAFFEN_LISTE.map(n => `<button class="ss-b" type="button" data-w="${n}" title="${esc(name(n))}"><span class="z">${zeichen(n)}</span>${esc(KURZ[n])}</button>`).join('')}
        <button class="ss-b" type="button" id="ss-wurf" title="Handgranate werfen (Taste Q)"><span class="z">💣</span>Werfen</button></div>
      <div class="ss-titel">Zombies</div>
      <div class="ss-reihe">${[5, 20, 50].map(n => `<button class="ss-b" type="button" data-z="${n}">🧟 ${n} starten</button>`).join('')}</div>
      <div class="ss-reihe" style="margin-top:4px"><button class="ss-b" type="button" id="ss-panzer">🛡 Panzer: aus</button><button class="ss-b" type="button" id="ss-reset">↺ Zurücksetzen</button></div>
      <div id="ss-info"></div>
      <div class="ss-titel">Auswertung je Waffe</div>
      <table><thead><tr><th>Waffe</th><th title="Schüsse, Schläge bzw. Würfe">Schuss</th><th title="Schüsse mit mindestens einem Treffer">Treffer</th><th>%</th><th title="getötete Zombies">Tote</th><th title="Schüsse je toter Zombie">Sch./Z.</th><th title="verbrauchte Munition">Muni</th></tr></thead><tbody id="ss-tab"></tbody></table>
      <div id="ss-text"></div>
      <div class="ss-reihe" style="margin-top:8px"><button class="ss-b ende" type="button" id="ss-ende">⬅ Zurück zum Start</button></div>
    </div>`;
  document.body.append(box);
  const $ = id => box.querySelector('#' + id);
  const umschalten = () => box.classList.toggle('zu');
  $('ss-kopf').onclick = umschalten;
  box.querySelectorAll('[data-w]').forEach(b => { b.onclick = e => { e.stopPropagation(); raum.send('ss_waffe', { name: b.dataset.w }); }; });
  box.querySelectorAll('[data-z]').forEach(b => { b.onclick = () => raum.send('ss_zombies', { n: Number(b.dataset.z) }); });
  $('ss-wurf').onclick = () => raum.send('wurf');
  let daten = null;
  $('ss-panzer').onclick = () => raum.send('ss_panzer', { an: !daten?.panzer });
  $('ss-reset').onclick = () => raum.send('ss_reset');
  $('ss-ende').onclick = async () => {
    ctx.abmelden?.();
    clearInterval(takt);
    try { await raum.leave(true); } catch { /* egal */ }
    location.reload();
  };

  const zeichnen = () => {
    const ich = raum.state.spieler.get(meineId);
    const aktiv = ich?.waffe || 'faust';
    box.querySelectorAll('[data-w]').forEach(b => b.classList.toggle('aktiv', b.dataset.w === aktiv));
    if (!daten) return;
    $('ss-panzer').textContent = '🛡 Panzer: ' + (daten.panzer ? 'an' : 'aus');
    $('ss-panzer').classList.toggle('an', !!daten.panzer);
    $('ss-info').textContent = `🧟 ${daten.zombies}${daten.warten ? ` (+${daten.warten} kommen noch)` : ''} Zombies auf dem Platz`;
    const zeilen = ZEILEN.filter(n => daten.stat[n]?.schuesse > 0 || n === aktiv);
    $('ss-tab').innerHTML = zeilen.map(n => {
      const s = daten.stat[n] ?? { schuesse: 0, treffer: 0, kills: 0, munition: 0 };
      const pro = s.kills ? komma(s.schuesse / s.kills) : '–';
      return `<tr class="${n === aktiv ? 'aktiv' : ''}"><td>${zeichen(n)} ${esc(KURZ[n])}</td><td>${s.schuesse}</td><td>${s.treffer}</td><td>${s.schuesse ? Math.round(100 * s.treffer / s.schuesse) : '–'}</td><td>${s.kills}</td><td>${pro}</td><td>${s.munition}</td></tr>`;
    }).join('');
    $('ss-text').innerHTML = erklaerung(daten, aktiv);
  };
  raum.onMessage('ss_stat', m => { daten = m; zeichnen(); });
  raum.send('ss_stat');
  const takt = setInterval(zeichnen, 400);
  zeichnen();
  window.__schiessstand = { box, TUT };
}

// Kurzerklärung zum Munitionsverbrauch (aus der Auswertung und den echten Waffenwerten des Servers)
export function erklaerung(daten, aktiv) {
  const teile = [];
  const wort = n => n === 'handgranate' ? 'Wurf' : WAFFEN[n]?.fern ? 'Schuss' : 'Schlag';
  const w = daten.werte?.[aktiv];
  if (w) {
    const treffer = Math.ceil(daten.zombieLeben / Math.max(1, w.schaden));
    const eigen = w.fern ? `Magazin ${w.magazin}, Nachladen ${komma(w.nachlade)} s, ` : '';
    teile.push(`<p><b>${zeichen(aktiv)} ${esc(name(aktiv))}</b>: Schaden ${komma(w.schaden, 0)}, alle ${komma(w.pause, 2)} s, Reichweite ${komma(w.reichweite, 0)} m, ${eigen}Zombie hat ${daten.zombieLeben} Leben → mindestens ${treffer} Treffer je Zombie.</p>`);
  }
  for (const n of ZEILEN) {
    const s = daten.stat[n];
    if (!s?.schuesse) continue;
    if (s.kills) teile.push(`<p>${zeichen(n)} ${esc(KURZ[n])}: im Schnitt ${komma(s.schuesse / s.kills)} ${wort(n)} je Zombie${WAFFEN[n]?.fern || n === 'handgranate' ? ` (${s.munition} Munition verbraucht)` : ''}.</p>`);
    else teile.push(`<p>${zeichen(n)} ${esc(KURZ[n])}: ${s.schuesse} ${s.schuesse === 1 ? wort(n) : MEHRZAHL[wort(n)]}, noch kein Zombie erledigt.</p>`);
  }
  if (daten.panzerKills) teile.push(`<p>🛡 Der Panzer hat ${daten.panzerKills} Zombie${daten.panzerKills === 1 ? '' : 's'} erledigt (zählt nicht in der Waffen-Auswertung).</p>`);
  teile.push('<p class="klein">Treffer = Schüsse, die mindestens einen Zombie trafen. Granaten treffen im Umkreis, Schrot im Kegel, Schüsse auf mehrere Ziele zählen einmal. Kriecher brauchen einen zweiten Treffer. Zurücksetzen löscht die Auswertung.</p>');
  return teile.join('');
}

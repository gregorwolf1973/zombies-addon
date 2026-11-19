// Fähigkeiten-Fenster: Level, Erfahrungsbalken, freie Punkte, Fähigkeiten mit „+“. Baut sein Fenster selbst auf;
// der Server prüft jede Punktevergabe (Nachricht fk_punkt) und schickt den Stand als „fk“.
// Die Liste muss zu server/faehigkeiten.mjs passen (nur Anzeige).
const LISTE = [
  ['zielen', '🎯', 'Zielen', 'Chance, beim Schuss keine Munition zu verbrauchen (+8 % je Stufe)'],
  ['tempo', '🏃', 'Tempo', 'Lauftempo +4 % je Stufe'],
  ['leben', '❤️', 'Lebensenergie', 'Du hältst ca. 10 % je Stufe mehr aus'],
  ['ausdauer', '🥫', 'Ausdauer', 'Durst und Hunger sinken 10 % je Stufe langsamer'],
  ['leise', '🤫', 'Leise', 'Zombies hören dich 8 % je Stufe weniger weit'],
  ['sanitaeter', '🩺', 'Sanitäter', 'Aufhelfen und Verbände wirken 15 % je Stufe besser'],
  ['tragen', '🎒', 'Tragen', '+1 Rucksackplatz bei Stufe 3, noch einer bei Stufe 5'],
];

const CSS = `
#fkknopf { position: fixed; right: 396px; top: max(34px, calc(env(safe-area-inset-top) + 26px)); width: 34px; height: 30px; margin: 0; padding: 0;
  font-size: 16px; line-height: 1; border-radius: 8px; background: #0007; color: #fff; border: 0; display: none; z-index: 6; }
#fkknopf.neu { background: #f9a825cc; }
#fkfenster { position: fixed; left: 50%; top: 50%; transform: translate(-50%, -50%); width: min(380px, calc(100vw - 24px)); max-height: calc(100vh - 24px);
  overflow: auto; background: #1b1f23f2; color: #fff; border-radius: 12px; padding: 12px; z-index: 30; display: none; box-sizing: border-box; font-size: 14px; }
#fkfenster .fk-kopf { display: flex; justify-content: space-between; align-items: center; font-size: 17px; }
#fkfenster button { font: inherit; cursor: pointer; }
#fkzu { background: none; border: 0; color: #fff; font-size: 20px; min-width: 44px; min-height: 44px; }
#fkfenster .fk-balken { height: 10px; background: #fff3; border-radius: 5px; overflow: hidden; margin: 6px 0 2px; }
#fkfenster .fk-balken div { height: 100%; background: #66bb6a; width: 0; }
#fkfenster .fk-klein { font-size: 12px; opacity: .8; }
#fkfenster .fk-frei { margin: 8px 0; font-weight: 700; color: #ffca28; }
#fkfenster .fk-zeile { display: flex; align-items: center; gap: 8px; padding: 6px 0; border-top: 1px solid #fff2; }
#fkfenster .fk-zeile .fk-text { flex: 1; min-width: 0; }
#fkfenster .fk-sterne { letter-spacing: 2px; color: #ffca28; }
#fkfenster .fk-plus { width: 44px; height: 44px; border-radius: 8px; border: 0; background: #2e7d32; color: #fff; font-size: 22px; font-weight: 700; }
#fkfenster .fk-plus:disabled { background: #fff2; color: #fff6; cursor: default; }
`;

export function fkStart(raum, meldungFn = () => {}) {
  for (const id of ['fkknopf', 'fkfenster', 'fkstil']) document.getElementById(id)?.remove();   // neue Verbindung: neu aufbauen
  const st = document.createElement('style'); st.id = 'fkstil'; st.textContent = CSS; document.head.append(st);
  const knopf = document.createElement('button');
  knopf.id = 'fkknopf'; knopf.type = 'button'; knopf.title = 'Fähigkeiten (K)'; knopf.setAttribute('aria-label', 'Fähigkeiten'); knopf.textContent = '⭐';
  const fenster = document.createElement('div');
  fenster.id = 'fkfenster'; fenster.setAttribute('role', 'dialog'); fenster.setAttribute('aria-label', 'Fähigkeiten');
  document.body.append(knopf, fenster);
  let stand = null;

  const zeichnen = () => {
    if (!stand) return;
    const proz = stand.bis ? Math.min(100, Math.round(100 * stand.im / stand.bis)) : 100;
    fenster.innerHTML = `<div class="fk-kopf"><b>⭐ Level ${stand.level}</b><button id="fkzu" type="button" aria-label="Schließen">✕</button></div>
      <div class="fk-balken"><div style="width:${proz}%"></div></div>
      <div class="fk-klein">${stand.bis ? `${stand.im} / ${stand.bis} Erfahrung bis Level ${stand.level + 1}` : 'Höchstes Level erreicht'}</div>
      <div class="fk-frei">${stand.frei} freie${stand.frei === 1 ? 'r' : ''} Punkt${stand.frei === 1 ? '' : 'e'}</div>
      ${LISTE.map(([id, sym, name, text]) => {
        const n = stand.s[id] || 0;
        return `<div class="fk-zeile"><span>${sym}</span><div class="fk-text"><b>${name}</b> <span class="fk-sterne">${'★'.repeat(n)}${'☆'.repeat(5 - n)}</span><div class="fk-klein">${text}</div></div>
          <button class="fk-plus" type="button" data-id="${id}" aria-label="${name} verbessern" ${stand.frei > 0 && n < 5 ? '' : 'disabled'}>+</button></div>`;
      }).join('')}`;
    fenster.querySelector('#fkzu').onclick = zu;
    fenster.querySelectorAll('.fk-plus').forEach(b => { b.onclick = () => raum.send('fk_punkt', { id: b.dataset.id }); });
  };
  const offen = () => fenster.style.display === 'block';
  const zu = () => { fenster.style.display = 'none'; };
  const auf = () => { knopf.classList.remove('neu'); zeichnen(); fenster.style.display = 'block'; };
  const umschalten = () => (offen() ? zu() : auf());
  knopf.onclick = umschalten;
  const tasten = e => {
    if (document.activeElement && /INPUT|TEXTAREA/.test(document.activeElement.tagName)) return;
    if (e.key === 'k' || e.key === 'K') umschalten();
    else if (e.key === 'Escape' && offen()) zu();
  };
  if (window.__fkTasten) document.removeEventListener('keydown', window.__fkTasten);
  window.__fkTasten = tasten;
  document.addEventListener('keydown', tasten);
  raum.onMessage('fk', m => {
    const altFrei = stand ? stand.frei : 0;
    stand = m;
    knopf.style.display = m.an ? 'block' : 'none';
    if (!m.an) zu();
    else if (m.frei > altFrei && !offen()) knopf.classList.add('neu');
    if (offen()) zeichnen();
  });
  raum.send('fk_punkt', {});   // Stand anfordern (die erste Nachricht beim Beitritt kam evtl. zu früh)
}

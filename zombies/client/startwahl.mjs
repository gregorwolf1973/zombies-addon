// Startbildschirm vor Level 1: 5 Fähigkeitspunkte verteilen und zwei Startgegenstände wählen.
// Der Server schickt „startwahl“, prüft die Antwort selbst (genau 5 Punkte, genau 2 verschiedene Gegenstände, nur einmal) und bestätigt mit „startwahl_ok“.
import { LISTE } from './faehigkeiten.mjs';

const GEGENSTAENDE = [
  ['messer', '🔪', 'Messer', 'leiser Nahkampf, schnell'],
  ['funkgeraet', '📻', 'Funkgerät', 'mit zwei Funkgeräten hört man sich überall'],
  ['taschenlampe', '🔦', 'Taschenlampe', 'leuchtet in dunklen Räumen'],
  ['armbrust', '🏹', 'Armbrust', 'leise, mit 6 Pfeilen'],
  ['schlaeger', '🏏', 'Baseballschläger', 'kräftiger Nahkampf'],
  ['radio', '📻', 'Radio', 'lockt Zombies mit Lärm weg'],
  ['schluessel', '🔑', 'Schlüsselbund', 'schließt Türen auf'],
  ['spritze', '💉', 'Rettungsspritze', 'holt einen Gestürzten oder Infizierten zurück'],
];

const CSS = `
#swfenster { position: fixed; inset: 0; z-index: 50; display: none; align-items: center; justify-content: center; background: #000b; }
#swfenster .sw-box { width: min(420px, calc(100vw - 16px)); max-height: calc(100vh - 16px); overflow: auto; background: #1b1f23; color: #fff;
  border-radius: 12px; padding: 12px 14px; box-sizing: border-box; font-size: 14px; }
#swfenster h2 { margin: 0 0 4px; font-size: 18px; }
#swfenster h3 { margin: 12px 0 4px; font-size: 14px; color: #ffca28; }
#swfenster .sw-klein { font-size: 12px; opacity: .8; }
#swfenster .sw-rest { font-weight: 700; color: #ffca28; margin: 6px 0; }
#swfenster .sw-zeile { display: flex; align-items: center; gap: 8px; padding: 5px 0; border-top: 1px solid #fff2; }
#swfenster .sw-text { flex: 1; min-width: 0; }
#swfenster .sw-sterne { letter-spacing: 2px; color: #ffca28; }
#swfenster button { font: inherit; cursor: pointer; }
#swfenster .sw-pm { width: 44px; height: 44px; border-radius: 8px; border: 0; background: #2e7d32; color: #fff; font-size: 22px; font-weight: 700; flex: none; }
#swfenster .sw-pm:disabled { background: #fff2; color: #fff6; cursor: default; }
#swfenster .sw-item { display: flex; align-items: center; gap: 10px; min-height: 48px; padding: 6px 10px; margin: 4px 0; border-radius: 8px; background: #fff1; border: 2px solid transparent; cursor: pointer; }
#swfenster .sw-item.an { border-color: #66bb6a; background: #2e7d3255; }
#swfenster .sw-item input { width: 20px; height: 20px; flex: none; }
#swfenster .sw-los { width: 100%; min-height: 48px; margin-top: 12px; border-radius: 10px; border: 0; background: #2e7d32; color: #fff; font-size: 16px; font-weight: 700; }
#swfenster .sw-los:disabled { background: #fff2; color: #fff6; cursor: default; }
`;

export function startwahlStart(raum) {
  for (const id of ['swfenster', 'swstil']) document.getElementById(id)?.remove();   // neue Verbindung: neu aufbauen
  const st = document.createElement('style'); st.id = 'swstil'; st.textContent = CSS; document.head.append(st);
  const fenster = document.createElement('div');
  fenster.id = 'swfenster'; fenster.setAttribute('role', 'dialog'); fenster.setAttribute('aria-label', 'Startwahl');
  document.body.append(fenster);
  window.__startwahlOffen = false;
  let punkte = 5, max = 5, wahl = [], stufen = {};

  const verteilt = () => Object.values(stufen).reduce((a, b) => a + b, 0);
  const zeichnen = () => {
    const rest = punkte - verteilt();
    fenster.innerHTML = `<div class="sw-box">
      <h2>🧟 Dein Start</h2>
      <div class="sw-klein">Verteile ${punkte} Fähigkeitspunkte und wähle genau 2 verschiedene Gegenstände. Dazu gibt es einen Zufallsgegenstand. Das geht nur einmal.</div>
      <h3>Fähigkeiten</h3>
      <div class="sw-rest" id="swrest">${rest} Punkt${rest === 1 ? '' : 'e'} übrig</div>
      ${LISTE.map(([id, sym, name, text]) => {
        const n = stufen[id] || 0;
        return `<div class="sw-zeile"><button class="sw-pm" type="button" data-id="${id}" data-d="-1" aria-label="${name} verringern" ${n > 0 ? '' : 'disabled'}>−</button>
          <div class="sw-text"><span>${sym}</span> <b>${name}</b> <span class="sw-sterne">${'★'.repeat(n)}${'☆'.repeat(max - n)}</span><div class="sw-klein">${text}</div></div>
          <button class="sw-pm" type="button" data-id="${id}" data-d="1" aria-label="${name} verbessern" ${rest > 0 && n < max ? '' : 'disabled'}>+</button></div>`;
      }).join('')}
      <h3>Startgegenstände (${wahl.length}/2)</h3>
      ${GEGENSTAENDE.map(([id, sym, name, text]) => `<label class="sw-item${wahl.includes(id) ? ' an' : ''}"><input type="checkbox" name="switem" value="${id}" ${wahl.includes(id) ? 'checked' : ''} ${!wahl.includes(id) && wahl.length >= 2 ? 'disabled' : ''}>
        <span style="font-size:22px">${sym}</span><span><b>${name}</b><div class="sw-klein">${text}</div></span></label>`).join('')}
      <button class="sw-los" id="swlos" type="button" ${rest === 0 && wahl.length === 2 ? '' : 'disabled'}>${rest !== 0 ? `Noch ${rest} Punkt${rest === 1 ? '' : 'e'} verteilen` : wahl.length !== 2 ? `Noch ${2 - wahl.length} Gegenstand wählen` : 'Los geht’s'}</button>
    </div>`;
    fenster.querySelectorAll('.sw-pm').forEach(b => {
      b.onclick = () => { const id = b.dataset.id; stufen[id] = Math.max(0, Math.min(max, (stufen[id] || 0) + Number(b.dataset.d))); zeichnen(); };
    });
    fenster.querySelectorAll('input[name=switem]').forEach(r => { r.onchange = () => { wahl = r.checked ? [...wahl, r.value].slice(0, 2) : wahl.filter(w => w !== r.value); zeichnen(); }; });
    fenster.querySelector('#swlos').onclick = () => {
      if (verteilt() !== punkte || wahl.length !== 2) return;
      raum.send('startwahl', { punkte: Object.fromEntries(Object.entries(stufen).filter(([, n]) => n > 0)), items: wahl });
    };
  };
  raum.onMessage('startwahl', m => {
    punkte = Number(m?.punkte) || 5; max = Number(m?.max) || 5; wahl = []; stufen = {};
    zeichnen(); fenster.style.display = 'flex'; window.__startwahlOffen = true;
  });
  raum.onMessage('startwahl_ok', () => { fenster.style.display = 'none'; window.__startwahlOffen = false; });
  raum.send('startwahl', {});   // Stand anfordern: die erste Nachricht beim Beitritt kam evtl. zu früh (ohne gültige Wahl schickt der Server sie erneut)
}

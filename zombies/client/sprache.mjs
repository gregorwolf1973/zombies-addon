// Sprachübertragung zwischen den menschlichen Mitspielern: WebRTC-Mesh, Signalisierung über den Spielraum
// (Nachrichten 'rtc', 'sprachPartner', 'sprachStart', 'spracheEinst', 'spricht'). Die Lautstärke je Mitspieler
// kommt aus lautstaerke() (sprache_regeln.mjs) und folgt der Lage im Spiel; mit Funkgeräten gibt es zusätzlich
// einen Funkkanal (Bandpass) über beliebige Entfernung.
import { lautstaerke, SPRACHE_VORGABE } from './sprache_regeln.mjs';

let ac = null;           // AudioContext – muss im Klick auf „Mitspielen“ entstehen (iOS)
let ctxWeckerAn = false;

// Im Klick auf „Mitspielen“ (Nutzergeste) aufrufen, vor dem ersten await
export function vorbereiten() {
  try {
    if (!ac) { const AC = window.AudioContext || window.webkitAudioContext; if (AC) ac = new AC(); }
    ac?.resume?.();
  } catch { /* ohne Ton geht es trotzdem weiter */ }
}

const MIKRO_SCHLUESSEL = 'zob_mikro', HINWEIS_SCHLUESSEL = 'zob_sprache_hinweis';
const SPRECH_SCHWELLE = 0.02, SPRECH_NACHLAUF = 450;   // RMS-Schwelle, Nachlaufzeit in ms

const lies = k => { try { return localStorage.getItem(k); } catch { return null; } };
const merke = (k, v) => { try { localStorage.setItem(k, v); } catch { /* egal */ } };

export function starte({ raum, meineId, welt, meldung }) {
  const knopf = document.getElementById('sprachknopf');
  const peers = new Map();            // sessionId → Verbindung samt Audioknoten
  let einst = { ...SPRACHE_VORGABE, an: true }, ice = [];
  let partner = [];                   // sessionIds aller verbundenen Menschen
  let bekommen = false;               // sprachStart ist angekommen
  let strom = null, spur = null, mikroFertig = false, mikroFehler = false, mikroAnfrage = false;
  let mikroAn = lies(MIKRO_SCHLUESSEL) !== 'aus';
  let sprichtGesendet = false, sprechBis = 0, messTimer = null, pegelTimer = null, analyser = null, quelleMikro = null;
  let beendet = false;
  if (new URLSearchParams(location.search).has('debug')) window.sprachPeers = peers;   // zum Prüfen im Browser

  const sende = (an, daten) => { try { raum.send('rtc', { an, daten }); } catch { /* Verbindung weg */ } };
  const sendeSpricht = an => { if (an !== sprichtGesendet) { sprichtGesendet = an; try { raum.send('spricht', { an }); } catch { /* egal */ } } };

  // ---------- Knopf ----------
  function knopfZeigen() {
    if (!knopf) return;
    knopf.style.display = einst.an && !beendet ? 'block' : 'none';
    const stumm = mikroFehler || !mikroAn;
    knopf.classList.toggle('aus', stumm);
    knopf.title = mikroFehler ? 'Kein Mikrofon – du hörst die anderen trotzdem' : mikroAn ? 'Mikrofon an – zum Stummschalten tippen' : 'Mikrofon aus – zum Einschalten tippen';
    knopf.setAttribute('aria-pressed', String(!stumm));
  }
  if (knopf) knopf.onclick = () => {
    if (mikroFehler) { meldung('🎤 Kein Mikrofon – du hörst die anderen trotzdem'); return; }
    mikroAn = !mikroAn;
    merke(MIKRO_SCHLUESSEL, mikroAn ? 'an' : 'aus');
    if (spur) spur.enabled = mikroAn;
    if (!mikroAn) { sprechBis = 0; sendeSpricht(false); }
    knopfZeigen();
    meldung(mikroAn ? '🎤 Mikrofon an' : '🎤 Mikrofon aus');
  };

  // ---------- Mikrofon ----------
  async function mikroHolen() {
    if (mikroAnfrage || strom) return;
    mikroAnfrage = true;
    try {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw new Error('kein sicherer Kontext');
      strom = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      spur = strom.getAudioTracks()[0] ?? null;
      if (!spur) throw new Error('keine Tonspur');
      spur.enabled = mikroAn;
      mikroFehler = false;
      pegelStarten();
      mikroNachreichen();
      if (!lies(HINWEIS_SCHLUESSEL)) { merke(HINWEIS_SCHLUESSEL, '1'); meldung('🎙 Sprache ist an – Kopfhörer vermeiden Echo', true); }
    } catch (e) {
      mikroFehler = true; strom = null; spur = null;
      meldung('🎤 Kein Mikrofon – du hörst die anderen trotzdem');
      console.warn('Mikrofon nicht verfügbar:', e?.message ?? e);
    } finally { mikroFertig = true; mikroAnfrage = false; knopfZeigen(); }
  }
  function mikroLoslassen() {
    pegelStoppen();
    try { strom?.getTracks().forEach(t => t.stop()); } catch { /* egal */ }
    strom = null; spur = null; mikroFertig = false; mikroFehler = false;
    sendeSpricht(false);
  }

  // eigene Sprache erkennen: RMS auf dem Mikrofonsignal, mit kurzer Nachlaufzeit
  function pegelStarten() {
    if (!ac || !strom || analyser) return;
    try {
      quelleMikro = ac.createMediaStreamSource(strom);
      analyser = ac.createAnalyser(); analyser.fftSize = 1024;
      quelleMikro.connect(analyser);   // nicht an den Ausgang: man hört sich nicht selbst
      const puffer = new Float32Array(analyser.fftSize);
      pegelTimer = setInterval(() => {
        if (!spur?.enabled) { sendeSpricht(false); return; }
        analyser.getFloatTimeDomainData(puffer);
        let s = 0; for (let i = 0; i < puffer.length; i++) s += puffer[i] * puffer[i];
        const jetzt = performance.now();
        if (Math.sqrt(s / puffer.length) > SPRECH_SCHWELLE) sprechBis = jetzt + SPRECH_NACHLAUF;
        sendeSpricht(jetzt < sprechBis);
      }, 100);
    } catch (e) { console.warn('Pegelmessung nicht möglich:', e?.message ?? e); }
  }
  function pegelStoppen() {
    clearInterval(pegelTimer); pegelTimer = null;
    try { quelleMikro?.disconnect(); } catch { /* egal */ }
    analyser = null; quelleMikro = null;
  }

  // ---------- Verbindungen ----------
  function peerAnlegen(sid) {
    const pc = new RTCPeerConnection({ iceServers: ice });
    const p = { sid, pc, kette: Promise.resolve(), wartend: [], anbieter: meineId < sid, neustarts: 0, knoten: null, audio: null, hatAntwort: false };
    peers.set(sid, p);
    pc.onicecandidate = e => { if (e.candidate) sende(sid, { t: 'ice', k: e.candidate.toJSON() }); };
    pc.ontrack = e => empfang(p, e);
    pc.onconnectionstatechange = () => {
      if (pc.connectionState !== 'failed' || peers.get(sid) !== p) return;
      if (p.neustarts < 1) {
        p.neustarts++;
        if (p.anbieter) p.kette = p.kette.then(() => anbieten(p, 'neustart')).catch(() => {});
        else sende(sid, { t: 'neu' });   // der Anbieter handelt neu aus
      } else peerSchliessen(sid);        // der nächste Teilnehmerabgleich baut sie neu auf
    };
    return p;
  }

  // art: 'erst' (Verbindung eröffnen), 'neustart' (ICE neu nach Abbruch), 'erneut' (Mikrofon nachgereicht)
  async function anbieten(p, art = 'erst') {
    const { pc } = p;
    if (art === 'erst' || art === false) {
      if (spur && strom) pc.addTrack(spur, strom);
      else pc.addTransceiver('audio', { direction: 'sendrecv' });   // Mikrofon kommt evtl. später (Abfrage noch offen)
    }
    await pc.setLocalDescription(await pc.createOffer({ iceRestart: art === 'neustart' || art === true }));
    sende(p.sid, { t: 'angebot', sdp: pc.localDescription.toJSON() });
    // kommt keine Antwort (Angebot kam beim anderen zu früh an), dasselbe Angebot noch zweimal schicken
    for (const ms of [4000, 10000]) setTimeout(() => {
      if (peers.get(p.sid) === p && pc.signalingState === 'have-local-offer') sende(p.sid, { t: 'angebot', sdp: pc.localDescription.toJSON() });
    }, ms);
  }

  async function ersteKandidaten(p) {
    for (const k of p.wartend.splice(0)) { try { await p.pc.addIceCandidate(k); } catch { /* alter Kandidat */ } }
  }

  async function signalVerarbeiten(p, d) {
    const { pc } = p;
    if (d.t === 'angebot') {
      if (pc.signalingState === 'stable' && pc.remoteDescription?.sdp === d.sdp?.sdp) return;   // wiederholtes Angebot schon beantwortet
      await pc.setRemoteDescription(d.sdp);
      // eigenes Mikrofon an den vom Angebot angelegten Sender hängen
      const tr = pc.getTransceivers().find(t => t.receiver?.track?.kind === 'audio');
      if (tr) { tr.direction = 'sendrecv'; if (spur && !tr.sender.track) await tr.sender.replaceTrack(spur); }   // sendrecv auch ohne Mikro: später nur replaceTrack
      await pc.setLocalDescription(await pc.createAnswer());
      sende(p.sid, { t: 'antwort', sdp: pc.localDescription.toJSON() });
      await ersteKandidaten(p);
    } else if (d.t === 'antwort') {
      await pc.setRemoteDescription(d.sdp);
      await ersteKandidaten(p);
    } else if (d.t === 'ice') {
      if (pc.remoteDescription) { try { await pc.addIceCandidate(d.k); } catch { /* egal */ } }
      else p.wartend.push(d.k);
    } else if (d.t === 'neu') {
      if (p.anbieter) await anbieten(p, d.erneut ? 'erneut' : 'neustart');
    }
  }

  // Empfang: stummes <audio> hält den Strom in Chrome am Laufen, gehört wird über WebAudio (Lautstärke nach Lage)
  function empfang(p, e) {
    if (p.knoten || !ac) return;
    const s = e.streams?.[0] ?? new MediaStream([e.track]);
    const a = document.createElement('audio');
    a.muted = true; a.autoplay = true; a.playsInline = true; a.style.display = 'none';
    a.srcObject = s;
    document.body.appendChild(a);
    a.play?.().catch(() => {});
    p.audio = a;
    const quelle = ac.createMediaStreamSource(s);
    const nah = ac.createGain(), funk = ac.createGain();
    nah.gain.value = 0; funk.gain.value = 0;
    const panner = ac.createStereoPanner ? ac.createStereoPanner() : null;
    quelle.connect(nah);
    if (panner) { nah.connect(panner); panner.connect(ac.destination); } else nah.connect(ac.destination);
    const hoch = ac.createBiquadFilter(); hoch.type = 'highpass'; hoch.frequency.value = 300;
    const tief = ac.createBiquadFilter(); tief.type = 'lowpass'; tief.frequency.value = 3000;
    quelle.connect(hoch); hoch.connect(tief); tief.connect(funk); funk.connect(ac.destination);
    p.knoten = { quelle, nah, funk, panner, hoch, tief };
  }

  // Mikrofon kam erst nach dem Verbindungsaufbau (Abfrage spät beantwortet): in alle Verbindungen einhängen, neu aushandeln
  function mikroNachreichen() {
    if (!spur) return;
    for (const p of peers.values()) {
      const tr = p.pc.getTransceivers().find(t => t.receiver?.track?.kind === 'audio');
      if (!tr || tr.sender.track) continue;
      p.kette = p.kette.then(async () => {
        await tr.sender.replaceTrack(spur);
        tr.direction = 'sendrecv';
        if (p.anbieter) await anbieten(p, 'erneut');
        else sende(p.sid, { t: 'neu', erneut: true });
      }).catch(e => console.warn('Mikrofon nachreichen fehlgeschlagen:', e?.message ?? e));
    }
  }

  function peerSchliessen(sid) {
    const p = peers.get(sid);
    if (!p) return;
    peers.delete(sid);
    try { p.pc.onicecandidate = p.pc.ontrack = p.pc.onconnectionstatechange = null; p.pc.close(); } catch { /* egal */ }
    if (p.knoten) for (const k of Object.values(p.knoten)) { try { k?.disconnect(); } catch { /* egal */ } }
    if (p.audio) { try { p.audio.srcObject = null; p.audio.remove(); } catch { /* egal */ } }
  }

  // Teilnehmerliste mit den Verbindungen abgleichen
  function abgleichen() {
    // nicht auf die Mikrofon-Abfrage warten: hören geht sofort, das Mikrofon wird nachgereicht
    if (beendet || !einst.an || !bekommen || !window.RTCPeerConnection) return;
    const soll = new Set(partner.filter(id => id !== meineId));
    for (const sid of [...peers.keys()]) if (!soll.has(sid)) peerSchliessen(sid);
    for (const sid of soll) {
      if (peers.has(sid)) continue;
      const p = peerAnlegen(sid);
      if (p.anbieter) p.kette = p.kette.then(() => anbieten(p)).catch(e => console.warn('Angebot fehlgeschlagen:', e?.message ?? e));
    }
  }

  // ---------- Lautstärke nach Lage ----------
  const spielerDaten = p => p && { x: p.x, y: p.y, ebene: p.ebene ?? '', rucksack: [...(p.rucksack ?? [])] };
  function lautstaerkeSetzen() {
    if (!ac || !peers.size) return;
    const ich = spielerDaten(raum.state.spieler.get(meineId)), w = welt();
    const t = ac.currentTime;
    for (const [sid, p] of peers) {
      if (!p.knoten) continue;
      const er = spielerDaten(raum.state.spieler.get(sid));
      const l = ich && er && w ? lautstaerke(ich, er, w, einst) : { nah: 0, funk: 0, pan: 0 };
      p.knoten.nah.gain.setTargetAtTime(l.nah, t, 0.08);
      p.knoten.funk.gain.setTargetAtTime(l.funk, t, 0.08);
      p.knoten.panner?.pan.setTargetAtTime(l.pan, t, 0.08);
    }
  }

  // ---------- Ein- und Ausschalten (Einstellung „Sprache aktiv“) ----------
  function alleSchliessen() { for (const sid of [...peers.keys()]) peerSchliessen(sid); }
  function einstellungUebernehmen(neu) {
    const war = einst.an;
    einst = { ...SPRACHE_VORGABE, ...neu };
    if (!einst.an) {
      alleSchliessen(); mikroLoslassen();
    } else if (!war) { mikroHolen(); abgleichen(); }
    knopfZeigen();
  }

  raum.onMessage('sprachStart', m => {
    ice = Array.isArray(m?.ice) ? m.ice : [];
    einst = { ...SPRACHE_VORGABE, ...(m?.einst ?? {}) };
    const erst = !bekommen;
    bekommen = true;
    knopfZeigen();
    if (!einst.an) return;
    if (erst || !mikroFertig) mikroHolen();
    abgleichen();
    for (const m of frueh.splice(0)) rtcVerarbeiten(m);
  });
  raum.onMessage('spracheEinst', m => { if (m?.einst) einstellungUebernehmen(m.einst); });
  raum.onMessage('sprachPartner', m => { partner = Array.isArray(m?.ids) ? m.ids.map(String) : []; abgleichen(); });
  const frueh = [];   // Signale, die vor sprachStart ankommen, aufheben statt verwerfen
  raum.onMessage('rtc', m => {
    if (!bekommen && !beendet) { if (frueh.length < 50) frueh.push(m); return; }
    rtcVerarbeiten(m);
  });
  function rtcVerarbeiten(m) {
    if (beendet || !einst.an || !bekommen || !m?.von || !m.daten || m.von === meineId || !window.RTCPeerConnection) return;
    let p = peers.get(m.von);
    if (!p) {
      if (m.daten.t !== 'angebot') return;   // nur ein Angebot darf eine Verbindung eröffnen
      p = peerAnlegen(m.von);
    }
    p.kette = p.kette.then(() => signalVerarbeiten(p, m.daten)).catch(e => console.warn('Signal fehlgeschlagen:', e?.message ?? e));
  }
  raum.onLeave(() => { beendet = true; alleSchliessen(); mikroLoslassen(); clearInterval(messTimer); knopfZeigen(); });

  messTimer = setInterval(lautstaerkeSetzen, 100);
  // Falls der AudioContext keine Nutzergeste hatte (z. B. Seite neu geladen): bei der ersten Berührung wecken
  if (!ctxWeckerAn) {
    ctxWeckerAn = true;
    const wecken = () => { vorbereiten(); if (ac?.state === 'running') { document.removeEventListener('pointerdown', wecken); document.removeEventListener('keydown', wecken); } };
    document.addEventListener('pointerdown', wecken); document.addEventListener('keydown', wecken);
  }
  vorbereiten();
  knopfZeigen();
  raum.send('sprachBereit');
}

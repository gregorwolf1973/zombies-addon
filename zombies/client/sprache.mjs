// Sprachübertragung zwischen den menschlichen Mitspielern: WebRTC-Mesh, Signalisierung über den Spielraum
// (Nachrichten 'rtc', 'sprachPartner', 'sprachStart', 'spracheEinst', 'spricht'). Die Lautstärke je Mitspieler
// kommt aus lautstaerke() (sprache_regeln.mjs) und folgt der Lage im Spiel; mit Funkgeräten gibt es zusätzlich
// einen Funkkanal (Bandpass) über beliebige Entfernung.
// Kommt die direkte Verbindung zu einem Mitspieler nicht zustande (z. B. Mobilfunk-NAT ohne TURN), läuft die Sprache
// dieses Paars über den Server ('sprachWeg', Binärnachricht 'sprachDaten', Opus oder μ-law, siehe sprache_kodierung.mjs).
import { flach } from './stapel.mjs';
import { stimmenFaktorLesen } from './einstellungen_regeln.mjs';
import { lautstaerke, SPRACHE_VORGABE } from './sprache_regeln.mjs';
import {
  FORMAT_OPUS, FORMAT_MULAW, OPUS_RATE, OPUS_RAHMEN, MULAW_RATE, MULAW_RAHMEN, paketBauen, paketLesen, neuerAls,
  mulawKodieren, mulawDekodieren, Abtaster, WORKLET_CODE,
} from './sprache_kodierung.mjs';

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
const WEG_WARTEZEIT = 15000;   // ms: danach muss die direkte Verbindung stehen, sonst Weg über den Server
const PUFFER_S = 0.12;         // Jitter-Puffer beim Abspielen der Serverpakete (Sekunden)

const lies = k => { try { return localStorage.getItem(k); } catch { return null; } };
const merke = (k, v) => { try { localStorage.setItem(k, v); } catch { /* egal */ } };

// Zahnrad-Menü „Stimmen der Mitspieler“: Faktor 0–2 auf nah/funk (nicht auf Spielgeräusche); wirkt beim nächsten Lautstärke-Takt
let stimmenFaktor = stimmenFaktorLesen(lies('zob_stimmen'));
export function stimmenFaktorSetzen(prozent) { stimmenFaktor = stimmenFaktorLesen(String(prozent)); }

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
  // Ausweichweg über den Server
  const serverWeg = new Set();        // sessionIds, zu denen die Sprache über den Server läuft
  const nrVonSid = new Map();         // sessionId → Absender-Nr. (1 Byte) in den Serverpaketen
  const relais = new Map();           // Absender-Nr. → { sid, knoten, dec, ... } (Empfang über den Server)
  let sendeFormat = FORMAT_MULAW, kannOpus = false, sendeNr = 0;
  const aufnahme = { knoten: null, stumm: null, worklet: null, abtaster: null, puffer: [], enc: null, encFormat: -1, bis: 0, laeuft: false, starte: false, url: null };
  if (new URLSearchParams(location.search).has('debug')) window.sprachPeers = peers;   // zum Prüfen im Browser

  const sende = (an, daten) => { try { raum.send('rtc', { an, daten }); } catch { /* Verbindung weg */ } };
  const sendeSpricht = an => { if (an !== sprichtGesendet) { sprichtGesendet = an; try { raum.send('spricht', { an }); } catch { /* egal */ } } };

  const namen = sid => raum.state.spieler.get(sid)?.name ?? 'Mitspieler';
  // ---------- Knopf ----------
  function knopfZeigen() {
    if (!knopf) return;
    knopf.style.display = einst.an && !beendet ? 'block' : 'none';
    const stumm = mikroFehler || !mikroAn;
    knopf.classList.toggle('aus', stumm);
    knopf.title = (mikroFehler ? 'Kein Mikrofon – du hörst die anderen trotzdem' : mikroAn ? 'Mikrofon an – zum Stummschalten tippen' : 'Mikrofon aus – zum Einschalten tippen')
      + (serverWeg.size ? ' · 📡 Verbindung zu ' + [...serverWeg].map(namen).join(', ') + ' läuft über den Server' : '');
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
      try { if (navigator.audioSession) navigator.audioSession.type = 'play-and-record'; } catch { /* egal */ }
      strom = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      spur = strom.getAudioTracks()[0] ?? null;
      if (!spur) throw new Error('keine Tonspur');
      spur.enabled = mikroAn;
      mikroFehler = false;
      pegelStarten();
      mikroNachreichen();
      aufnahmePruefen();
      if (!lies(HINWEIS_SCHLUESSEL)) { merke(HINWEIS_SCHLUESSEL, '1'); meldung('🎙 Sprache ist an – Kopfhörer vermeiden Echo', true); }
    } catch (e) {
      mikroFehler = true; strom = null; spur = null;
      meldung('🎤 Kein Mikrofon – du hörst die anderen trotzdem');
      console.warn('Mikrofon nicht verfügbar:', e?.message ?? e);
    } finally { mikroFertig = true; mikroAnfrage = false; knopfZeigen(); }
  }
  function mikroLoslassen() {
    pegelStoppen(); aufnahmeStoppen();
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch { /* egal */ }
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
      } else zumServer(sid, true);       // bleibt kaputt: Weg über den Server
    };
    // steht die Verbindung nach 15 s nicht, ebenfalls Weg über den Server
    p.wartezeit = setTimeout(() => { if (peers.get(sid) === p && p.pc.connectionState !== 'connected') zumServer(sid, true); }, WEG_WARTEZEIT);
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
    p.knoten = knotenKette(ac.createMediaStreamSource(s));
  }

  // dieselbe Kette für WebRTC und Serverweg: Quelle → nah → Panner → Ausgang, Quelle → Bandpass → funk → Ausgang
  function knotenKette(quelle) {
    const nah = ac.createGain(), funk = ac.createGain();
    nah.gain.value = 0; funk.gain.value = 0;
    const panner = ac.createStereoPanner ? ac.createStereoPanner() : null;
    quelle.connect(nah);
    if (panner) { nah.connect(panner); panner.connect(ac.destination); } else nah.connect(ac.destination);
    const hoch = ac.createBiquadFilter(); hoch.type = 'highpass'; hoch.frequency.value = 300;
    const tief = ac.createBiquadFilter(); tief.type = 'lowpass'; tief.frequency.value = 3000;
    quelle.connect(hoch); hoch.connect(tief); tief.connect(funk); funk.connect(ac.destination);
    // Funk-Knacken: eigenes Rauschen (Bandpass wie ein Funkgerät), nur hörbar, wenn über Funk gesprochen wird
    let knack = null;
    try {
      const src = ac.createBufferSource(); src.buffer = funkRauschen(); src.loop = true;
      const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1800; bp.Q.value = 0.8;
      const g = ac.createGain(); g.gain.value = 0;
      src.connect(bp); bp.connect(g); g.connect(ac.destination); src.start();
      knack = { src, g, disconnect() { try { src.stop(); } catch { /* schon aus */ } src.disconnect(); bp.disconnect(); g.disconnect(); } };   // beim Schließen der Verbindung mit aufgeräumt
    } catch { /* ohne Knacken */ }
    return { quelle, nah, funk, panner, hoch, tief, knack };
  }
  // 2 s Rauschen mit eingestreuten Knacksern (gemeinsamer Puffer für alle Verbindungen)
  let funkPuffer = null;
  function funkRauschen() {
    if (funkPuffer) return funkPuffer;
    const n = ac.sampleRate * 2, b = ac.createBuffer(1, n, ac.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * 0.5;
    for (let k = 0; k < 14; k++) { const s = Math.floor(Math.random() * (n - 400)); for (let i = 0; i < 60 + Math.random() * 300; i++) d[s + i] = (Math.random() < 0.5 ? -1 : 1) * (0.7 + Math.random() * 0.3); }
    return (funkPuffer = b);
  }
  // je Takt (100 ms): spricht jemand über Funk, leises Rauschen; selten ein lautes Knacken mit kurzem Aussetzer der Stimme
  function funkKnacken(p, pegel, spricht, t) {
    const k = p.knoten?.knack; if (!k) return;
    if (!(pegel > 0.02) || !spricht) { k.g.gain.setTargetAtTime(0, t, 0.05); return; }
    k.g.gain.setTargetAtTime(0.025 * pegel, t, 0.05);   // Grundrauschen
    if (Math.random() < 0.06) {                          // ≈ alle 1,5 s ein Knacken
      const dauer = 0.04 + Math.random() * 0.12, stark = 0.25 + Math.random() * 0.35;
      k.g.gain.cancelScheduledValues(t); k.g.gain.setValueAtTime(stark * pegel, t); k.g.gain.setTargetAtTime(0.025 * pegel, t + dauer, 0.03);
      if (Math.random() < 0.5) { const f = p.knoten.funk.gain; f.cancelScheduledValues(t); f.setValueAtTime(f.value * 0.15, t); f.setTargetAtTime(pegel * stimmenFaktor, t + dauer, 0.03); }
    }
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
    clearTimeout(p.wartezeit);
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
    for (const sid of [...serverWeg]) if (!soll.has(sid)) serverWegEnde(sid);
    for (const sid of soll) {
      if (peers.has(sid) || serverWeg.has(sid)) continue;
      const p = peerAnlegen(sid);
      if (p.anbieter) p.kette = p.kette.then(() => anbieten(p)).catch(e => console.warn('Angebot fehlgeschlagen:', e?.message ?? e));
    }
  }

  // ---------- Lautstärke nach Lage ----------
  const spielerDaten = p => p && { x: p.x, y: p.y, ebene: p.ebene ?? '', rucksack: flach(p.rucksack ?? []) };
  function lautstaerkeSetzen() {
    if (!ac || (!peers.size && !relais.size)) return;
    const ich = spielerDaten(raum.state.spieler.get(meineId)), w = welt();
    const t = ac.currentTime;
    for (const p of [...peers.values(), ...relais.values()]) {
      const sid = p.sid;
      if (!p.knoten) continue;
      const er = spielerDaten(raum.state.spieler.get(sid));
      const l = ich && er && w ? lautstaerke(ich, er, w, einst) : { nah: 0, funk: 0, pan: 0 };
      p.knoten.nah.gain.setTargetAtTime(l.nah * stimmenFaktor, t, 0.08);
      p.knoten.funk.gain.setTargetAtTime(l.funk * stimmenFaktor, t, 0.08);
      p.knoten.panner?.pan.setTargetAtTime(l.pan, t, 0.08);
      funkKnacken(p, l.funk * stimmenFaktor, !!raum.state.spieler.get(sid)?.spricht, t);
    }
  }

  // ---------- Ausweichweg über den Server ----------
  // melden: dem Server mitteilen (selbst entschieden) – sonst kam die Entscheidung vom Server
  function zumServer(sid, melden) {
    if (serverWeg.has(sid) || beendet) return;
    serverWeg.add(sid);
    peerSchliessen(sid);
    if (melden) { try { raum.send('sprachWeg', { mit: sid, server: true }); } catch { /* egal */ } }
    meldung(`📡 Verbindung zu ${namen(sid)} läuft über den Server`);
    knopfZeigen();
    aufnahmePruefen();
  }
  function serverWegEnde(sid, neuVersuchen) {
    if (!serverWeg.delete(sid)) return;
    const nr = nrVonSid.get(sid);
    if (nr !== undefined && relais.has(nr)) relaisSchliessen(relais.get(nr));
    nrVonSid.delete(sid);
    knopfZeigen();
    aufnahmePruefen();
    if (neuVersuchen) abgleichen();   // bei erneutem Beitritt wieder WebRTC versuchen
  }

  // Aufnahme für den Serverweg: nur solange es ein Server-Paar gibt, das Mikrofon läuft und eingeschaltet ist
  async function opusKann() {
    try {
      if (!window.AudioEncoder || !window.AudioDecoder) return false;
      const a = await AudioEncoder.isConfigSupported(opusEncConfig()), b = await AudioDecoder.isConfigSupported(opusDecConfig());
      return !!(a?.supported && b?.supported);
    } catch { return false; }
  }
  const opusEncConfig = () => ({ codec: 'opus', sampleRate: OPUS_RATE, numberOfChannels: 1, bitrate: 20000, opus: { frameDuration: 20000, application: 'voip', signal: 'voice' } });
  const opusDecConfig = () => ({ codec: 'opus', sampleRate: OPUS_RATE, numberOfChannels: 1 });

  function aufnahmePruefen() {
    const soll = !beendet && einst.an && serverWeg.size > 0 && !!strom && !!ac;
    if (soll && !aufnahme.laeuft && !aufnahme.starte) aufnahmeStarten();
    else if (!soll && (aufnahme.laeuft || aufnahme.starte)) aufnahmeStoppen();
  }
  async function aufnahmeStarten() {
    aufnahme.starte = true;
    try {
      if (!ac.audioWorklet) throw new Error('kein AudioWorklet');
      if (!aufnahme.url) aufnahme.url = URL.createObjectURL(new Blob([WORKLET_CODE], { type: 'text/javascript' }));
      if (!aufnahme.geladen) { await ac.audioWorklet.addModule(aufnahme.url); aufnahme.geladen = true; }
      if (!aufnahme.starte || !strom) return;   // inzwischen wieder abgebrochen
      const quelle = ac.createMediaStreamSource(strom);
      const w = new AudioWorkletNode(ac, 'sprache-aufnahme', { numberOfInputs: 1, numberOfOutputs: 1, channelCount: 1 });
      const stumm = ac.createGain(); stumm.gain.value = 0;   // ohne Ausgang würde Chrome den Knoten nicht abarbeiten
      quelle.connect(w); w.connect(stumm); stumm.connect(ac.destination);
      aufnahme.knoten = quelle; aufnahme.worklet = w; aufnahme.stumm = stumm;
      aufnahme.abtaster = { opus: new Abtaster(ac.sampleRate, OPUS_RATE), mulaw: new Abtaster(ac.sampleRate, MULAW_RATE) };
      aufnahme.puffer = { opus: [], mulaw: [] };
      w.port.onmessage = e => aufnahmeBlock(e.data);
      aufnahme.laeuft = true;
    } catch (e) { console.warn('Aufnahme für den Serverweg nicht möglich:', e?.message ?? e); }
    finally { aufnahme.starte = false; }
  }
  function aufnahmeStoppen() {
    aufnahme.starte = false; aufnahme.laeuft = false;
    try { aufnahme.worklet && (aufnahme.worklet.port.onmessage = null); aufnahme.knoten?.disconnect(); aufnahme.worklet?.disconnect(); aufnahme.stumm?.disconnect(); } catch { /* egal */ }
    try { aufnahme.enc?.close(); } catch { /* egal */ }
    Object.assign(aufnahme, { knoten: null, worklet: null, stumm: null, abtaster: null, puffer: [], enc: null, encFormat: -1 });
  }

  function sendeBytes(paket) { try { raum.sendBytes('sprachDaten', paket); } catch { /* Verbindung weg */ } }
  function aufnahmeBlock(block) {
    if (!aufnahme.laeuft || !spur?.enabled) return;
    // gewählt wird das Format; beide Abtaster laufen nicht parallel, nur der gebrauchte
    const opus = sendeFormat === FORMAT_OPUS && kannOpus;
    const art = opus ? 'opus' : 'mulaw', rahmen = opus ? OPUS_RAHMEN : MULAW_RAHMEN;
    const ab = aufnahme.abtaster[art], puf = aufnahme.puffer[art];
    puf.push(...ab.push(block));
    while (puf.length >= rahmen) {
      const f = Float32Array.from(puf.splice(0, rahmen));
      let s = 0; for (let i = 0; i < f.length; i++) s += f[i] * f[i];
      const jetzt = performance.now();
      if (Math.sqrt(s / f.length) > SPRECH_SCHWELLE) aufnahme.bis = jetzt + SPRECH_NACHLAUF;
      if (opus) opusEncode(f, jetzt < aufnahme.bis);
      else if (jetzt < aufnahme.bis) sendeBytes(paketBauen(FORMAT_MULAW, sendeNr = (sendeNr + 1) & 0xffff, mulawKodieren(f)));
    }
  }
  // Opus läuft durchgehend mit (Encoder-Zustand bleibt stimmig), gesendet wird nur bei Sprache plus Nachlauf
  function opusEncode(f, senden) {
    try {
      if (!aufnahme.enc) {
        aufnahme.enc = new AudioEncoder({
          output: chunk => {
            if (!aufnahme.sendeFlag) return;
            const b = new Uint8Array(chunk.byteLength); chunk.copyTo(b);
            sendeBytes(paketBauen(FORMAT_OPUS, sendeNr = (sendeNr + 1) & 0xffff, b));
          },
          error: e => { console.warn('Opus-Encoder:', e?.message ?? e); aufnahme.enc = null; kannOpus = false; sendeFormat = FORMAT_MULAW; raum.send('sprachKann', { opus: false }); },
        });
        aufnahme.enc.configure(opusEncConfig());
        aufnahme.zeit = 0;
      }
      aufnahme.sendeFlag = senden;
      const d = new AudioData({ format: 'f32', sampleRate: OPUS_RATE, numberOfFrames: f.length, numberOfChannels: 1, timestamp: aufnahme.zeit, data: f });
      aufnahme.zeit += f.length * 1e6 / OPUS_RATE;
      aufnahme.enc.encode(d); d.close();
    } catch (e) { console.warn('Opus-Kodierung:', e?.message ?? e); }
  }

  // Empfang: [Absender-Nr. 1 B][Format][Nr. 2 B][Nutzdaten]
  function relaisEmpfang(bytes) {
    if (!ac || beendet || !einst.an || !(bytes?.length > 4)) return;
    const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    const nr = b[0], pk = paketLesen(b, 1);
    if (!pk) return;
    let r = relais.get(nr);
    if (!r) {
      const sid = [...nrVonSid].find(([, n]) => n === nr)?.[0];
      if (!sid || !serverWeg.has(sid)) return;
      const eingang = ac.createGain();
      r = { sid, nr, eingang, knoten: knotenKette(eingang), dec: null, zuletzt: -1, naechste: 0, wartend: [] };
      relais.set(nr, r);
    }
    if (r.zuletzt >= 0 && !neuerAls(pk.nr, r.zuletzt)) return;   // verspätet oder doppelt
    r.zuletzt = pk.nr;
    if (pk.format === FORMAT_MULAW) abspielen(r, mulawDekodieren(pk.nutz), MULAW_RATE);
    else opusDekodieren(r, pk.nutz);
  }
  function opusDekodieren(r, nutz) {
    if (!window.AudioDecoder || !window.EncodedAudioChunk) return;
    if (!r.dec) {
      r.dec = new AudioDecoder({
        output: d => {
          try { const f = new Float32Array(d.numberOfFrames); d.copyTo(f, { planeIndex: 0, format: 'f32-planar' }); abspielen(r, f, d.sampleRate); } finally { d.close(); }
        },
        error: e => { console.warn('Opus-Decoder:', e?.message ?? e); try { r.dec?.close(); } catch { /* egal */ } r.dec = null; },
      });
      r.dec.configure(opusDecConfig());
      r.dts = 0;
    }
    r.dec.decode(new EncodedAudioChunk({ type: 'key', timestamp: r.dts, data: nutz }));
    r.dts += 20000;
  }
  // geplantes Abspielen mit kleinem Jitter-Puffer: nach einer Pause erst PUFFER_S warten, dann lückenlos aneinanderhängen
  function abspielen(r, f, rate) {
    if (!f.length) return;
    const buf = ac.createBuffer(1, f.length, rate);
    buf.copyToChannel(f, 0);
    const q = ac.createBufferSource(); q.buffer = buf; q.connect(r.eingang);
    const jetzt = ac.currentTime;
    if (r.naechste < jetzt + 0.02) r.naechste = jetzt + PUFFER_S;
    else if (r.naechste > jetzt + 0.6) r.naechste = jetzt + PUFFER_S;   // Rückstau abbauen
    q.start(r.naechste);
    r.naechste += f.length / rate;
  }
  function relaisSchliessen(r) {
    if (!r) return;
    relais.delete(r.nr);
    try { r.dec?.close(); } catch { /* egal */ }
    for (const k of Object.values(r.knoten)) { try { k?.disconnect(); } catch { /* egal */ } }
    try { r.eingang.disconnect(); } catch { /* egal */ }
  }

  // ---------- Ein- und Ausschalten (Einstellung „Sprache aktiv“) ----------
  function alleSchliessen() { for (const sid of [...peers.keys()]) peerSchliessen(sid); for (const sid of [...serverWeg]) serverWegEnde(sid); }
  function einstellungUebernehmen(neu) {
    const war = einst.an;
    einst = { ...SPRACHE_VORGABE, ...neu };
    if (!einst.an) {
      alleSchliessen(); mikroLoslassen(); knopfZeigen();
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
  raum.onMessage('sprachWeg', m => {
    const sid = String(m?.mit ?? '');
    if (!sid || sid === meineId) return;
    if (m.server) { if (Number.isInteger(m.nr)) nrVonSid.set(sid, m.nr); zumServer(sid, false); }
    else serverWegEnde(sid, true);
  });
  raum.onMessage('sprachFormat', m => { sendeFormat = m?.format === FORMAT_OPUS && kannOpus ? FORMAT_OPUS : FORMAT_MULAW; });
  raum.onMessage('sprachDaten', bytes => { try { relaisEmpfang(bytes); } catch (e) { console.warn('Sprachpaket:', e?.message ?? e); } });
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
  raum.onLeave(() => { beendet = true; for (const r of relais.values()) relaisSchliessen(r); aufnahmeStoppen(); alleSchliessen(); mikroLoslassen(); clearInterval(messTimer); knopfZeigen(); });

  messTimer = setInterval(lautstaerkeSetzen, 100);
  // Falls der AudioContext keine Nutzergeste hatte (z. B. Seite neu geladen): bei der ersten Berührung wecken
  if (!ctxWeckerAn) {
    ctxWeckerAn = true;
    // iOS-Safari gibt Ton erst bei touchend/click frei (nicht bei pointerdown/touchstart) – deshalb alle Gesten
    const GESTEN = ['pointerdown', 'touchend', 'click', 'keydown'];
    const wecken = () => { vorbereiten(); setTimeout(() => { if (ac?.state === 'running') for (const g of GESTEN) document.removeEventListener(g, wecken, true); }, 300); };
    for (const g of GESTEN) document.addEventListener(g, wecken, true);
  }
  vorbereiten();
  knopfZeigen();
  raum.send('sprachBereit');
  opusKann().then(ok => { kannOpus = ok; try { raum.send('sprachKann', { opus: ok }); } catch { /* egal */ } });
}

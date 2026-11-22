// Auslieferung des Client-Ordners: unveränderlich zwischengespeichert unter v/<version>/…, komprimiert (br/gzip) für Text.
// index.html bleibt no-cache und verweist auf den versionierten Pfad; relative ES-Modul-Importe lösen sich dort von selbst auf.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import express from 'express';

const TEXT = { '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const UNVERAENDERLICH = 'public, max-age=31536000, immutable';

// Version der Auslieferung: Paketversion + Kurzhash über Pfad/Größe/Änderungszeit aller Client-Dateien (so ändert sich der Pfad auch bei Änderungen ohne Versionssprung)
export function auslieferungsVersion(wurzel, paketVersion, extra = []) {
  const h = crypto.createHash('sha1');
  const geh = (ord, pre) => {
    let eintraege = [];
    try { eintraege = fs.readdirSync(ord, { withFileTypes: true }); } catch { return; }
    for (const e of eintraege.sort((a, b) => a.name < b.name ? -1 : 1)) {
      const p = path.join(ord, e.name);
      if (e.isDirectory()) geh(p, pre + e.name + '/');
      else { const st = fs.statSync(p); h.update(`${pre}${e.name}:${st.size}:${Math.floor(st.mtimeMs)};`); }
    }
  };
  geh(wurzel, '');
  for (const f of extra) { try { const st = fs.statSync(f); h.update(`${f}:${st.size}:${Math.floor(st.mtimeMs)};`); } catch { /* egal */ } }
  return `${paketVersion || '0'}-${h.digest('hex').slice(0, 8)}`;
}

const komprCache = new Map();   // Pfad|Kodierung → { sig, daten, etag }
function komprimiert(datei, st, enc) {
  const schl = datei + '|' + enc, sig = `${st.size}:${Math.floor(st.mtimeMs)}`;
  const c = komprCache.get(schl);
  if (c?.sig === sig) return c;
  const roh = fs.readFileSync(datei);
  const daten = enc === 'br'
    ? zlib.brotliCompressSync(roh, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 9, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: roh.length } })
    : zlib.gzipSync(roh, { level: 9 });
  const neu = { sig, daten, etag: `"${crypto.createHash('sha1').update(daten).digest('base64url').slice(0, 20)}-${enc}"` };
  komprCache.set(schl, neu);
  return neu;
}

// Komprimierte Auslieferung für Textdateien unter `wurzel`; alles andere reicht sie weiter (next).
export function textKomprimiert(wurzel, cacheControl) {
  return (req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    let rel;
    try { rel = decodeURIComponent(req.path); } catch { return next(); }
    if (rel.endsWith('/')) rel += 'index.html';
    let ext = path.extname(rel).toLowerCase();
    if (!ext) { rel += '.html'; ext = '.html'; }
    const typ = TEXT[ext];
    if (!typ) return next();
    const datei = path.join(wurzel, rel);
    if (!datei.startsWith(wurzel + path.sep) || rel.split('/').some(t => t.startsWith('.'))) return next();
    let st;
    try { st = fs.statSync(datei); } catch { return next(); }
    if (!st.isFile()) return next();
    res.vary('Accept-Encoding');
    const akz = String(req.headers['accept-encoding'] ?? '');
    const enc = /\bbr\b/.test(akz) ? 'br' : /\bgzip\b/.test(akz) ? 'gzip' : null;
    res.set('Content-Type', typ).set('Cache-Control', cacheControl);
    if (!enc) return next();   // unkomprimiert macht express.static (ETag, Range …); Vary und Header stehen schon
    const k = komprimiert(datei, st, enc);
    res.set('ETag', k.etag).set('Content-Encoding', enc).set('Last-Modified', st.mtime.toUTCString());
    if (req.headers['if-none-match'] === k.etag) return res.status(304).end();
    res.set('Content-Length', String(k.daten.length));
    res.end(req.method === 'HEAD' ? undefined : k.daten);
  };
}

// Hängt die Client-Auslieferung an die App: v/<version>/… (unveränderlich) und die alten Wurzelpfade (no-cache)
export function clientAuslieferung(app, { wurzel, version, vendor = {}, keinCacheSeiten = [] }) {
  const vPfad = `/v/${version}`;
  const nocache = 'no-cache';
  // index.html: Skripte, Stile und Module über den versionierten Pfad laden (relativ, damit der Ingress-Präfix erhalten bleibt)
  let indexHtml = null;
  const indexSeite = () => {
    if (!indexHtml) {
      const roh = fs.readFileSync(path.join(wurzel, 'index.html'), 'utf8');
      indexHtml = roh
        .replace(/(<link rel="stylesheet" href=")(stil\.css")/, `$1v/${version}/$2`)
        .replace(/(<script src=")(vendor\/[^"]+")/g, `$1v/${version}/$2`)
        .replace(/(<script type="module" src=")(spiel\.mjs")/, `$1v/${version}/$2`);
    }
    return indexHtml;
  };
  const sendeIndex = (req, res) => {
    const roh = Buffer.from(indexSeite());
    res.vary('Accept-Encoding').set('Content-Type', 'text/html; charset=utf-8').set('Cache-Control', nocache);
    const akz = String(req.headers['accept-encoding'] ?? '');
    const enc = /\bbr\b/.test(akz) ? 'br' : /\bgzip\b/.test(akz) ? 'gzip' : null;
    const daten = !enc ? roh : (komprCache.get('index|' + enc + version) ?? (() => { const d = enc === 'br' ? zlib.brotliCompressSync(roh) : zlib.gzipSync(roh); komprCache.set('index|' + enc + version, d); return d; })());
    if (enc) res.set('Content-Encoding', enc);
    res.set('Content-Length', String(daten.length));
    res.end(req.method === 'HEAD' ? undefined : daten);
  };
  app.get(['/', '/index.html'], (req, res, next) => (req.get('x-ingress-path') && !('spielen' in req.query)) ? next() : sendeIndex(req, res));
  // Dateien aus node_modules (Phaser, Colyseus) liegen unter vendor/
  const vendorRoute = (rel, cc) => (req, res, next) => {
    const datei = vendor[rel];
    if (!datei) return next();
    const akz = String(req.headers['accept-encoding'] ?? '');
    const enc = /\bbr\b/.test(akz) ? 'br' : /\bgzip\b/.test(akz) ? 'gzip' : null;
    res.vary('Accept-Encoding').set('Content-Type', 'text/javascript; charset=utf-8').set('Cache-Control', cc);
    if (!enc) return res.sendFile(datei);
    let st;
    try { st = fs.statSync(datei); } catch { return next(); }
    const k = komprimiert(datei, st, enc);
    res.set('ETag', k.etag).set('Content-Encoding', enc);
    if (req.headers['if-none-match'] === k.etag) return res.status(304).end();
    res.set('Content-Length', String(k.daten.length)).end(req.method === 'HEAD' ? undefined : k.daten);
  };
  for (const rel of Object.keys(vendor)) {
    app.get(`${vPfad}/vendor/${rel}`, vendorRoute(rel, UNVERAENDERLICH));
    app.get(`/vendor/${rel}`, vendorRoute(rel, nocache));
  }
  // versionierter Ordner: immutable
  app.use(vPfad, textKomprimiert(wurzel, UNVERAENDERLICH),
    express.static(wurzel, { maxAge: '365d', immutable: true, index: false, extensions: false, dotfiles: 'ignore' }));
  // alte Pfade (Verwaltung, manifest, sw.js, Symbole …): immer nachfragen, Text komprimiert
  app.use(textKomprimiert(wurzel, nocache), (req, res, next) => { if (!res.get('Cache-Control')) res.set('Cache-Control', nocache); next(); },
    express.static(wurzel, { extensions: ['html'], cacheControl: false, index: false }));
}

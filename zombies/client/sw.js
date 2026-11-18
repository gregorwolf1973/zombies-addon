// Service Worker: macht das Spiel installierbar (als App auf dem Startbildschirm). Kein Zwischenspeicher –
// das Spiel braucht ohnehin die Verbindung zum Server; ohne Netz kommt eine kurze Hinweisseite.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => {
  if (e.request.mode !== 'navigate') return;
  e.respondWith(fetch(e.request).catch(() => new Response(
    '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><body style="background:#1b2a1b;color:#fff;font:18px sans-serif;padding:24px">🧟 Keine Verbindung zum Spiel – bitte Netz prüfen und neu laden.</body>',
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } })));
});

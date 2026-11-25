// Offline-Speicher und "Teilen"-Ziel für PDFs aus der Mail
const CACHE = 'klappe-v1';
const SHELL = [
  './', './index.html', './manifest.webmanifest', './css/app.css',
  './js/app.js', './js/db.js', './js/ui.js', './js/parser.js', './js/speech.js', './js/runner.js',
  './js/rehearse.js', './js/tape.js', './js/castings.js', './js/radar.js',
  './fonts/archivo-latin-wdth-normal.woff2', './fonts/newsreader-latin-opsz-normal.woff2', './fonts/newsreader-latin-opsz-italic.woff2',
  './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('klappe-v') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // PDF über "Teilen" empfangen
  if (e.request.method === 'POST' && url.pathname.endsWith('/share-target')) {
    e.respondWith((async () => {
      try {
        const form = await e.request.formData();
        const file = form.get('file');
        if (file && file.size) {
          const c = await caches.open('klappe-share');
          await c.put('shared-file', new Response(file, { headers: { 'content-type': file.type || 'application/pdf', 'x-name': encodeURIComponent(file.name || 'Sides.pdf') } }));
        }
      } catch {}
      return Response.redirect(new URL('./#import', self.registration.scope).href, 303);
    })());
    return;
  }
  if (e.request.method !== 'GET') return;

  // Castings immer frisch, offline aus dem Speicher
  if (url.origin === location.origin && url.pathname.includes('/radar/')) {
    e.respondWith(fetch(e.request).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r; })
      .catch(() => caches.match(e.request, { ignoreSearch: true })));
    return;
  }

  // PDF-Leser von cdnjs nach dem ersten Laden offline halten
  if (url.hostname === 'cdnjs.cloudflare.com') {
    e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r; })));
    return;
  }

  // App selbst: sofort aus dem Speicher, im Hintergrund aktualisieren
  if (url.origin === location.origin) {
    e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(hit => {
      const net = fetch(e.request).then(r => { if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); } return r; }).catch(() => hit);
      return hit || net;
    }));
  }
});

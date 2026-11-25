// Offline-Speicher und "Teilen"-Ziel für PDFs aus der Mail.
// Immer zuerst aus dem Netz laden (damit nach Updates nie alte und neue Teile gemischt werden),
// nur offline aus dem Speicher.
const CACHE = 'klappe-v14';
const SHELL = [
  './', './index.html', './manifest.webmanifest', './css/app.css',
  './js/app.js', './js/db.js', './js/ui.js', './js/parser.js', './js/speech.js', './js/runner.js',
  './js/rehearse.js', './js/tape.js', './js/castings.js', './js/radar.js', './js/voices.js', './js/voicesheet.js', './js/profile.js', './js/backup.js', './js/ocr.js', './js/apply.js', './js/takes.js', './js/learn.js', './js/calendar.js', './js/fx.js', './js/sync.js', './js/syncui.js', './js/gagen.js', './js/role.js', './js/monologe.js', './js/warmup.js', './js/techcheck.js', './js/showreel.js', './data/monologe.json', './data/quellen.json', './js/quellen.js', './js/settings.js', './js/neu.js', './js/tutorial.js',
  './fonts/archivo-latin-wdth-normal.woff2',
  './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE)
    .then(c => c.addAll(SHELL.map(u => new Request(u, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('klappe-v') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
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

  // PDF-Leser von cdnjs: feste Version, darf aus dem Speicher kommen
  if (url.hostname === 'cdnjs.cloudflare.com') {
    e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r; })));
    return;
  }

  // Eigene Dateien: Netz zuerst (am Server-Cache vorbei), offline aus dem Speicher
  if (url.origin === location.origin) {
    e.respondWith(fetch(e.request, { cache: 'no-cache' })
      .then(r => { if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); } return r; })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then(hit => hit || caches.match('./index.html'))));
  }
});

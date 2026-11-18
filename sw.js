// App-shell cache. Product lookups are NOT cached here (the app keeps recent scans itself),
// so a stale service worker can never serve old product data. Bump VERSION on every deploy.
const VERSION = 'v1.2.1';
const SHELL = [
  './', 'index.html', 'style.css', 'manifest.webmanifest',
  'js/app.js', 'js/summary.js', 'js/rules.js', 'js/off.js', 'js/explain.js', 'js/scan.js',
  'vendor/zxing-library-0.23.0/zxing.min.js',
  'icons/icon.svg', 'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return; // API calls go straight to the network
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true })
      .then((hit) => hit || fetch(e.request))
      .catch(() => (e.request.mode === 'navigate' ? caches.match('index.html') : Response.error())),
  );
});

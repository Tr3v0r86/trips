// ponytail: cache-first SW, bump CACHE version on any content change
const CACHE = 'trips-v5';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
  './ile-dorleans/',
  './ile-dorleans/index.html',
  './hangzhou/',
  './hangzhou/index.html',
  './hangzhou/guide.css',
  './hangzhou/guide.js',
  './hangzhou/images/west-lake.jpg',
  './hangzhou/images/hefang.jpg',
  './hangzhou/images/lingyin.jpg'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== self.location.origin) return;
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then(hit =>
      hit ||
      fetch(e.request).then(resp => {
        if (resp.ok && new URL(e.request.url).origin === self.location.origin) {
          const copy = resp.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy));
        }
        return resp;
      })
    )
  );
});

// Confirmation comes from this active cache, never from registration alone.
self.addEventListener('message', e => {
  if (!e.data || e.data.type !== 'CHECK_HANGZHOU_CACHE' || !e.ports[0]) return;
  e.waitUntil(caches.open(CACHE).then(async cache => {
    const needed = ASSETS.filter(path => path.startsWith('./hangzhou/'));
    const hits = await Promise.all(needed.map(path => cache.match(path)));
    e.ports[0].postMessage({ cache: CACHE, cached: hits.every(Boolean) });
  }).catch(() => e.ports[0].postMessage({ cache: CACHE, cached: false })));
});

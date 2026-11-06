const CACHE_NAME = 'drei-fragezeichen-v35';
const ASSETS = [
    './index.html',
    './manifest.json',
    './dff_app_icon_192.png',
    './dff_app_icon_512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(cacheNames => Promise.all(
        cacheNames
          .filter(cacheName => cacheName !== CACHE_NAME)
          .map(cacheName => caches.delete(cacheName))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  // Firebase (Firestore, Auth, SDK) und andere fremde Domains nie über den Cache leiten.
  if (new URL(event.request.url).origin !== self.location.origin) return;
  // Firebase-Hosting-Auth-Handler immer direkt aus dem Netz.
  if (new URL(event.request.url).pathname.startsWith('/__/')) return;

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
          return response;
        })
        .catch(() => caches.match(event.request).then(response => response || caches.match('./index.html')))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then(response => response || fetch(event.request))
  );
});

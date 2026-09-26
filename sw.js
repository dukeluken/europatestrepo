const CACHE_NAME = 'drei-fragezeichen-v2';
const ASSETS = [
    './index.html',
    './manifest.json',
    './dff_app_icon_192.png',
    './dff_app_icon_512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(response => response || fetch(event.request))
  );
});

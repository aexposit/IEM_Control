self.addEventListener('install', e => {
  console.log('Service Worker installato');
  e.waitUntil(
    caches.open('app-cache-v1').then(cache =>
      cache.addAll([
        '/',
        '/index.html',
        '/index.js',
        '/style.css',
        '/manifest.json',
        '/soundcraft-ui.bundle.js',
        '/rxjs.umd.min.js',
      ])
    )
  );
});

self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(response => {
      return response || fetch(e.request);
    })
  );
});

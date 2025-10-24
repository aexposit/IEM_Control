const CACHE_NAME = 'app-cache-v1';
const ASSETS_TO_CACHE = [
  'index.html',
  'index.js',
  'style.css',
  'manifest.json',
  'soundcraft-ui.bundle.js',
  'rxjs.umd.min.js'
];

// Install
self.addEventListener('install', (event) => {
  console.log('Service Worker installato');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_TO_CACHE))
  );
});

// Activate (opzionale, per pulire cache vecchie)
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) return caches.delete(key);
        })
      )
    )
  );
});

// Fetch
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((cached) => {
      return cached || fetch(event.request);
    })
  );
});

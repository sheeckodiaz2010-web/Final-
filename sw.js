// Service Worker - DIGAR POS
// Cachea el shell de la app para que funcione sin conexión.
const CACHE_NAME = 'digar-pos-v16';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Estrategia: caché primero (abre al instante aunque no haya señal), y de pasada
// actualiza la copia guardada en segundo plano para la próxima vez.
// (los datos reales de tus ventas viven en localStorage, no aquí)
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const actualizarEnSegundoPlano = fetch(event.request)
        .then((networkResponse) => {
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, networkResponse.clone()));
          return networkResponse;
        })
        .catch(() => cachedResponse);
      return cachedResponse || actualizarEnSegundoPlano;
    })
  );
});

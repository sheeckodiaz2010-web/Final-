// Service Worker - DIGAR POS
// Red primero (siempre intenta traer la versión más nueva) y, si no hay señal
// o tarda demasiado, abre la copia guardada para que funcione sin conexión.
// (los datos reales de tus ventas viven en localStorage, no aquí)
const CACHE_NAME = 'digar-pos-v24';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];
const ESPERA_RED_MS = 3000;

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      // cache: 'reload' se salta el caché del navegador y baja archivos frescos
      Promise.all(ASSETS.map((url) =>
        fetch(new Request(url, { cache: 'reload' }))
          .then((resp) => { if (resp.ok) return cache.put(url, resp); })
          .catch(() => {})
      ))
    )
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

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    try {
      const controlador = new AbortController();
      const timer = setTimeout(() => controlador.abort(), ESPERA_RED_MS);
      const resp = await fetch(event.request, { cache: 'no-cache', signal: controlador.signal });
      clearTimeout(timer);
      if (resp && resp.ok) cache.put(event.request, resp.clone());
      return resp;
    } catch (e) {
      const guardado = await cache.match(event.request, { ignoreSearch: true });
      if (guardado) return guardado;
      return (await cache.match('./index.html')) || Response.error();
    }
  })());
});

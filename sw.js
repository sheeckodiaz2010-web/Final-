// Service worker mínimo de DIGAR POS (creado 2026-11-06: el archivo faltaba y
// el registro en index.html fallaba). Cachea la app para uso sin internet;
// los datos (ventas, clientes, inventario) viven en localStorage/IndexedDB,
// NO en esta caché, así que actualizar la app no borra datos.
const CACHE = 'digar-pos-v2';
const ARCHIVOS = ['./', './index.html', './manifest.json', './icon-192.png'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ARCHIVOS)).catch(() => {}));
  self.skipWaiting();
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return; // mapas, Firebase, etc.: a la red
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request).then(res => {
      const copia = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, copia)).catch(() => {});
      return res;
    }).catch(() => caches.match('./index.html')))
  );
});

/* Mis Finanzas — Copyright (c) 2026 Felipe Manrique. Todos los derechos reservados. Ver LICENSE. */
// Cache de la app para que abra sin conexión. Subí VERSION en cada deploy.
const VERSION = 'finanzas-v2.0.0';
const SHELL = ['./', 'index.html', 'styles.css', 'parser.js', 'vault.js', 'app.js', 'privacidad.html', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/icon-32.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

// Red primero (para recibir actualizaciones), cache si no hay conexión.
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin || new URL(req.url).pathname.endsWith('oauth.html')) return;
  e.respondWith(
    fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match('index.html')))
  );
});

'use strict';
/* Service worker: tiene l'app disponibile anche senza rete.
   Cambia il numero di versione qui sotto quando pubblichi una nuova versione. */
const CACHE = 'narrivu-v18';
const SHELL = ['./', './index.html', './style.css', './app.js', './manifest.webmanifest',
  './fonts/bricolage.woff2', './icon-192.png', './icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// File dell'app: prima la copia salvata, aggiornata in background. L'API di Google non passa di qui.
self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  e.respondWith(caches.open(CACHE).then(async cache => {
    const hit = await cache.match(req, { ignoreSearch: true });
    const net = fetch(req).then(res => {
      if (res.ok) cache.put(req, res.clone());
      return res;
    }).catch(() => hit || (req.mode === 'navigate' ? cache.match('./index.html') : undefined));
    return hit || net;
  }));
});

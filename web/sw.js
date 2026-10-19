// PWA Service Worker for Universal Downloader
const CACHE_NAME = 'udl-pwa-v2';
const STATIC_ASSETS = [
  '/',
  '/manifest.json',
  '/favicon.ico',
  '/browsers.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

// Network-first с fallback на кэш
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  // Не кэшируем API, стримы, скачивание и расширения
  if (url.pathname.startsWith('/api/') || 
      url.pathname.startsWith('/extension') || 
      url.pathname.startsWith('/share-target') || 
      event.request.method !== 'GET') {
    return;
  }

  event.respondWith(
    fetch(event.request).then(response => {
      // Кэшируем успешные GET-ответы для статики
      if (response && response.status === 200 && response.type === 'basic') {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
      }
      return response;
    }).catch(() => caches.match(event.request))
  );
});

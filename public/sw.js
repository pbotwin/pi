// Cache-first for the app shell so the game is playable with no connection.
// The version string is the cache buster: bump it and old caches are dropped.
const VERSION = 'stack-v1'
const SHELL = ['/pi/', '/pi/index.html', '/pi/favicon.svg', '/pi/manifest.webmanifest']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET' || new URL(request.url).origin !== location.origin) return

  event.respondWith(
    caches.match(request).then((hit) => {
      if (hit) return hit
      return fetch(request).then((response) => {
        // Only bank successful, non-opaque responses.
        if (response.ok && response.type === 'basic') {
          const copy = response.clone()
          caches.open(VERSION).then((cache) => cache.put(request, copy))
        }
        return response
      }).catch(() => caches.match('/pi/index.html'))
    }),
  )
})

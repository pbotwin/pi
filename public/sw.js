// Offline support for the app shell.
//
// Strategy matters here. Vite emits hash-named assets, so `index.html` is the
// one file whose contents change on every deploy while its URL stays the same.
// Caching it first-hand would pin a returning visitor to an old document that
// points at asset files the new deploy has already deleted — a blank page.
//
// So: navigations go to the network first and fall back to cache when offline;
// hashed assets are immutable and are served cache-first.
const VERSION = 'stack-v2'
const SHELL = ['./', './index.html', './favicon.svg', './manifest.webmanifest']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION)
      // A single missing entry must not abort the whole install.
      .then((cache) => Promise.allSettled(SHELL.map((url) => cache.add(url))))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

async function networkFirst(request) {
  try {
    const response = await fetch(request)
    if (response.ok) {
      const copy = response.clone()
      void caches.open(VERSION).then((cache) => cache.put(request, copy))
    }
    return response
  } catch {
    const cached = await caches.match(request)
    return cached ?? caches.match('./index.html')
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request)
  if (cached) return cached
  const response = await fetch(request)
  if (response.ok && response.type === 'basic') {
    const copy = response.clone()
    void caches.open(VERSION).then((cache) => cache.put(request, copy))
  }
  return response
}

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return
  if (new URL(request.url).origin !== location.origin) return

  // Never cache leaderboard traffic — a stale board is worse than none.
  if (request.url.includes('/rest/v1/')) return

  event.respondWith(
    request.mode === 'navigate' ? networkFirst(request) : cacheFirst(request),
  )
})

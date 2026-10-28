const CACHE_PREFIX = 'osm-ai-journey-'
const CACHE_NAME = `${CACHE_PREFIX}shell-v2`
const SHELL_URLS = ['./', './index.html', './sw.js']

self.addEventListener('install', (event) => {
  event.waitUntil(Promise.all([self.skipWaiting(), caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_URLS))]))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map((key) => caches.delete(key)))),
  )
})

self.addEventListener('message', (event) => {
  if (event.data?.type === 'PRECACHE_SHELL') {
    event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_URLS)))
  }
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  const isMapResource = url.hostname.includes('openfreemap') || url.hostname.includes('openstreetmap') || url.pathname.includes('/styles/')
  const isAppResource = url.origin === self.location.origin && (request.destination === 'document' || request.destination === 'script' || request.destination === 'style' || request.destination === 'font')
  if (!isMapResource && !isAppResource) return

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(request)
       const network = fetch(request)
         .then((response) => {
           if (response.ok || response.type === 'opaque') void cache.put(request, response.clone())
           return response
         })
         .catch(async () => cached || (isAppResource ? cache.match('./index.html') : undefined))
       return cached || network
    }),
  )
})

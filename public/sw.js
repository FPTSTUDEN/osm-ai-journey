const CACHE_NAME = 'osm-ai-journey-shell-v1'

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting())
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  const isMapResource = url.hostname.includes('openfreemap') || url.pathname.includes('/styles/')
  const isAppResource = url.origin === self.location.origin && (request.destination === 'document' || request.destination === 'script' || request.destination === 'style')
  if (!isMapResource && !isAppResource) return

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(request)
      const network = fetch(request)
        .then((response) => {
          if (response.ok) void cache.put(request, response.clone())
          return response
        })
        .catch(() => cached)
      return cached || network
    }),
  )
})

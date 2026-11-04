const CACHE_PREFIX = 'osm-ai-journey-'
const CACHE_NAME = `${CACHE_PREFIX}shell-v3`
const MAP_CACHE_NAME = `${CACHE_PREFIX}map-v1`
const MAX_MAP_ENTRIES = 400
const SHELL_URLS = ['./', './index.html', './sw.js']

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_URLS)))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
  event.waitUntil((async () => {
    const keys = await caches.keys()
    const oldCaches = keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME && key !== MAP_CACHE_NAME)
    const mapCache = await caches.open(MAP_CACHE_NAME)
    for (const name of oldCaches) {
      const oldCache = await caches.open(name)
      for (const request of await oldCache.keys()) {
        if (!isMapRequest(new URL(request.url))) continue
        const response = await oldCache.match(request)
        if (!response?.ok || response.type === 'opaque') continue
        if ((await mapCache.keys()).length >= MAX_MAP_ENTRIES) break
        await mapCache.put(request, response)
      }
      await caches.delete(name)
    }
  })())
})

self.addEventListener('message', (event) => {
  if (event.data?.type === 'PRECACHE_SHELL') {
    event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_URLS)))
  }
})

async function cacheSuccessfulResponse(cache, request, response, maxEntries) {
  if (!response.ok || response.type === 'opaque') return
  await cache.delete(request)
  await cache.put(request, response.clone())
  if (maxEntries === undefined) return

  const keys = await cache.keys()
  await Promise.all(keys.slice(0, Math.max(0, keys.length - maxEntries)).map((key) => cache.delete(key)))
}

function isHashedAsset(url) {
  return /\/assets\/[^/]+-[A-Za-z0-9_-]{6,}\.(?:js|css)$/.test(url.pathname)
}

function isMapRequest(url) {
  return url.hostname.includes('openfreemap') || url.hostname.includes('openstreetmap') || url.pathname.includes('/styles/')
}

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  const isDocument = request.destination === 'document'
  const isHashedAssetRequest = url.origin === self.location.origin && isHashedAsset(url)
  const isMapResource = isMapRequest(url)
  if (!isDocument && !isHashedAssetRequest && !isMapResource) return

  if (isDocument) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME)
      try {
        const response = await fetch(request)
        await cacheSuccessfulResponse(cache, request, response)
        return response
      } catch {
        return await cache.match(request) ?? await cache.match('./index.html') ?? Response.error()
      }
    })())
    return
  }

  if (isHashedAssetRequest) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME)
      const cached = await cache.match(request)
      if (cached) return cached
      const response = await fetch(request)
      await cacheSuccessfulResponse(cache, request, response)
      return response
    })())
    return
  }

  const cachePromise = caches.open(MAP_CACHE_NAME)
  const cachedPromise = cachePromise.then((cache) => cache.match(request))
  const updatePromise = cachePromise.then((cache) => fetch(request).then(async (response) => {
    await cacheSuccessfulResponse(cache, request, response, MAX_MAP_ENTRIES)
    return response
  }))
  event.waitUntil(updatePromise.then(() => undefined).catch(() => undefined))
  event.respondWith(cachedPromise.then((cached) => cached ?? updatePromise).then((response) => response ?? Response.error()).catch(() => Response.error()))
})

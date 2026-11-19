import { MAP_RESOURCE_CACHE_NAME, OFFLINE_TILE_CACHE_NAME } from './cacheNames'
import { listZones, markZoneTilesCleared } from './offlineZones'

export type OfflineCacheStatus = {
  cacheNames: string[]
  entries: number
}

export type OfflineMapCacheStatus = {
  tiles: number
  mapResources: number
  zones: number
  indexedPlaces: number
}

const MAP_CACHE_NAMES = new Set([MAP_RESOURCE_CACHE_NAME, OFFLINE_TILE_CACHE_NAME])

export async function getOfflineCacheStatus(): Promise<OfflineCacheStatus> {
  if (!('caches' in window)) throw new Error('Cache Storage is unavailable in this browser')
  const cacheNames = (await caches.keys()).filter((name) => name.startsWith('osm-ai-journey-') && !MAP_CACHE_NAMES.has(name))
  const counts = await Promise.all(cacheNames.map(async (name) => (await caches.open(name)).matchAll().then((requests) => requests.length)))
  return { cacheNames, entries: counts.reduce((total, count) => total + count, 0) }
}

export async function getOfflineMapCacheStatus(): Promise<OfflineMapCacheStatus> {
  if (!('caches' in window)) throw new Error('Cache Storage is unavailable in this browser')
  const [cacheNames, zones] = await Promise.all([caches.keys(), listZones()])
  const tileCount = cacheNames.includes(OFFLINE_TILE_CACHE_NAME)
    ? (await caches.open(OFFLINE_TILE_CACHE_NAME)).keys().then((requests) => requests.length)
    : Promise.resolve(0)
  const mapResourceCount = cacheNames.includes(MAP_RESOURCE_CACHE_NAME)
    ? (await caches.open(MAP_RESOURCE_CACHE_NAME)).keys().then((requests) => requests.length)
    : Promise.resolve(0)
  const cachedZones = zones.filter((zone) => zone.status !== 'idle' || zone.cachedTileUrls?.length || zone.indexedFeatureCount !== undefined)
  return {
    tiles: await tileCount,
    mapResources: await mapResourceCount,
    zones: cachedZones.length,
    indexedPlaces: cachedZones.reduce((total, zone) => total + (zone.indexedFeatureCount ?? 0), 0),
  }
}

export async function clearOfflineCache() {
  if (!('caches' in window)) throw new Error('Cache Storage is unavailable in this browser')
  await Promise.all((await caches.keys())
    .filter((name) => name.startsWith('osm-ai-journey-') && !MAP_CACHE_NAMES.has(name))
    .map((name) => caches.delete(name)))
  const registration = await navigator.serviceWorker?.getRegistration()
  registration?.active?.postMessage({ type: 'PRECACHE_SHELL' })
}

export async function clearOfflineMapCache(): Promise<void> {
  if (!('caches' in window)) throw new Error('Cache Storage is unavailable in this browser')
  await Promise.all((await caches.keys())
    .filter((name) => MAP_CACHE_NAMES.has(name))
    .map((name) => caches.delete(name)))
  const { clearOfflineIndexes } = await import('../providers/offlineIndex')
  await clearOfflineIndexes()
  await markZoneTilesCleared()
  window.dispatchEvent(new Event('offline-cache-cleared'))
}

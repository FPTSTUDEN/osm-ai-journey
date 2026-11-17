import { listZones, saveZoneStrict, type OfflineZone } from '../storage/offlineZones'

export const OFFLINE_TILE_CACHE_NAME = 'osm-ai-journey-offline-tiles-v1'
export const MAX_OFFLINE_TILES = 1200

export async function hasCompleteOfflineTileCache(zone: OfflineZone): Promise<boolean> {
  if (typeof caches === 'undefined') throw new Error('Cache Storage is unavailable in this browser')
  const tileUrls = zone.cachedTileUrls
  if (!tileUrls?.length || (zone.cachedTileCount ?? tileUrls.length) !== tileUrls.length) return false
  const cache = await caches.open(OFFLINE_TILE_CACHE_NAME)
  for (const url of tileUrls) if (!await cache.match(url)) return false
  return true
}

type TileFetcher = (signal: AbortSignal) => Promise<Response>

export function selectTileEvictions(cacheUrls: string[], protectedUrls: Set<string>, maxEntries = MAX_OFFLINE_TILES): string[] {
  const removable = cacheUrls.filter((url) => !protectedUrls.has(url))
  const excess = Math.max(0, cacheUrls.length - maxEntries)
  if (excess > removable.length) throw new Error('Offline tile cache is full of tiles pinned by saved zones. Remove a zone or reduce its size.')
  return removable.slice(0, excess)
}

export async function beginOfflineTileCache(zone: OfflineZone, tileUrls: string[]) {
  if (typeof caches === 'undefined') throw new Error('Cache Storage is unavailable in this browser')
  if (tileUrls.length > MAX_OFFLINE_TILES) {
    throw new Error(`This zone needs ${tileUrls.length} tiles, exceeding the offline cache limit of ${MAX_OFFLINE_TILES}. Reduce its bounds or maximum zoom.`)
  }

  const cache = await caches.open(OFFLINE_TILE_CACHE_NAME)
  const zones = await listZones()
  const otherPinned = new Set(zones
    .filter((saved) => saved.id !== zone.id)
    .flatMap((saved) => saved.cachedTileUrls ?? []))
  const previousPinned = new Set(zone.cachedTileUrls ?? [])
  const pendingPinned = new Set([...otherPinned, ...previousPinned, ...tileUrls])
  if (pendingPinned.size > MAX_OFFLINE_TILES) {
    throw new Error(`Saved zones and this zone need ${pendingPinned.size} unique tiles, exceeding the ${MAX_OFFLINE_TILES}-tile cache limit. Remove a zone or reduce its bounds or zoom.`)
  }

  let active = true
  let operation = Promise.resolve()
  const serialized = <T>(task: () => Promise<T>): Promise<T> => {
    const result = operation.then(task)
    operation = result.then(() => undefined, () => undefined)
    return result
  }

  const prune = async () => {
    const requests = await cache.keys()
    const urls = requests.map((request) => request.url)
    const evictions = selectTileEvictions(urls, pendingPinned)
    for (const url of evictions) await cache.delete(url)
  }

  await prune()

  return {
    async readOrFetch(url: string, signal: AbortSignal, fetchTile: TileFetcher): Promise<ArrayBuffer> {
      if (!active) throw new Error('Offline tile cache session is no longer active')
      const cached = await serialized(() => cache.match(url))
      if (cached) {
        const data = await cached.arrayBuffer()
        await serialized(async () => {
          await cache.delete(url)
          await cache.put(url, new Response(data.slice(0), { headers: cached.headers, status: cached.status, statusText: cached.statusText }))
        })
        return data
      }

      const response = await fetchTile(signal)
      if (!response.ok || response.status === 206 || response.type === 'opaque') {
        throw new Error(`Unable to cache map tile ${url} (HTTP ${response.status})`)
      }
      const data = await response.arrayBuffer()
      await serialized(async () => {
        await cache.put(url, new Response(data.slice(0), { headers: response.headers, status: response.status, statusText: response.statusText }))
        await prune()
      })
      return data
    },

    async commit(readyZone: OfflineZone, generation: string, indexedFeatureCount: number): Promise<void> {
      if (!active) throw new Error('Offline tile cache session is no longer active')
      await serialized(async () => {
        await prune()
        await saveZoneStrict({
          ...readyZone,
          status: 'ready',
          cachedTileUrls: tileUrls,
          cachedTileCount: tileUrls.length,
          cacheGeneration: generation,
          indexedFeatureCount,
          cacheError: undefined,
        })
        active = false
      })
    },

    async rollback(): Promise<void> {
      if (!active) return
      active = false
      await serialized(prune)
    },
  }
}

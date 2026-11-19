import { get, getAll, putMany, remove } from './db'
import { OFFLINE_TILE_CACHE_NAME } from './cacheNames'

export type OfflineZone = {
  id: string
  label: string
  viewportDefault?: boolean
  bounds: [number, number, number, number] // west, south, east, north (LngLatBoundsLike order)
  maxZoom: number
  createdAt: string
  cachedBytes: number
  cachedTileCount?: number
  cachedTileUrls?: string[]
  cacheGeneration?: string
  indexedFeatureCount?: number
  cacheError?: string
  status: 'idle' | 'caching' | 'ready' | 'partial' | 'failed'
}

const STORE = 'offline-zones'

function zoneKey(journeyId = 'active') {
  return `zone:${journeyId}`
}

export function defaultZoneFromViewport(center: [number, number], zoom: number, maxZoom = 15): Omit<OfflineZone, 'id' | 'createdAt' | 'cachedBytes' | 'status'> {
  // Roughly a 0.1 degree box at z<=12, growing as zoom increases. Small enough to be fetchable.
  const span = 0.1 / Math.max(1, zoom - 10)
  const [lng, lat] = center
  return {
    label: 'Current view',
    viewportDefault: true,
    bounds: [lng - span, lat - span * 0.7, lng + span, lat + span * 0.7],
    maxZoom,
  }
}

export function newZoneFromViewport(center: [number, number], zoom: number, maxZoom = 15): OfflineZone {
  const base = defaultZoneFromViewport(center, zoom, maxZoom)
  return { ...base, id: crypto.randomUUID(), createdAt: new Date().toISOString(), cachedBytes: 0, status: 'idle' }
}

export async function loadZone(journeyId = 'active'): Promise<OfflineZone | null> {
  try {
    const record = await get<{ key: string; zone: OfflineZone }>(STORE, zoneKey(journeyId))
    return record?.zone ?? null
  } catch {
    return null
  }
}

export async function saveZone(zone: OfflineZone, journeyId = 'active'): Promise<void> {
  try {
    await saveZoneStrict(zone, journeyId)
  } catch {
    // Storage may be unavailable; the zone remains usable in memory.
  }
}

export async function saveZoneStrict(zone: OfflineZone, journeyId = 'active'): Promise<void> {
  await putMany(STORE, [
    { key: zoneKey(journeyId), zone },
    { key: `zone-cache:${zone.id}`, zone },
  ])
}

export async function listZones(): Promise<OfflineZone[]> {
  const records = await getAll<{ key: string; zone: OfflineZone }>(STORE)
  const manifestRecords = records.filter((record) => record.key.startsWith('zone-cache:'))
  const savedZones = [...records.filter((record) => record.key.startsWith('zone:')), ...manifestRecords]
  return [...new Map(savedZones.map((record) => [record.zone.id, record.zone])).values()]
}

export async function markZoneTilesCleared(): Promise<void> {
  const records = await getAll<{ key: string; zone: OfflineZone }>(STORE)
  const updated = records
    .filter((record) => record.key.startsWith('zone:') || record.key.startsWith('zone-cache:'))
    .map(({ key, zone }) => ({
      key,
      zone: zone.status === 'ready' || zone.cachedTileUrls?.length
        ? {
          ...zone,
          status: 'partial' as const,
          cachedBytes: 0,
          cachedTileCount: 0,
          cachedTileUrls: [],
          cacheGeneration: undefined,
          indexedFeatureCount: undefined,
          cacheError: 'Offline map tiles were cleared. Refresh this zone to cache them again.',
        }
        : zone,
    }))
  if (updated.length) await putMany(STORE, updated)
}

export async function deleteOfflineZone(zoneId: string): Promise<void> {
  const records = await getAll<{ key: string; zone: OfflineZone }>(STORE)
  const targets = records.filter((record) => record.zone.id === zoneId)
  const selectedZone = targets[0]?.zone
  if (!selectedZone) return

  if ((selectedZone.cachedTileUrls?.length ?? 0) > 0) {
    if (typeof caches === 'undefined') throw new Error('Cache Storage is unavailable in this browser')
    const remainingZones = [...new Map(records
      .filter((record) => record.zone.id !== zoneId)
      .map((record) => [record.zone.id, record.zone])).values()]
    const retainedUrls = new Set(remainingZones.flatMap((zone) => zone.cachedTileUrls ?? []))
    const tileCache = await caches.open(OFFLINE_TILE_CACHE_NAME)
    for (const url of new Set(selectedZone.cachedTileUrls ?? [])) {
      if (!retainedUrls.has(url)) await tileCache.delete(url)
    }
  }

  const indexPrefix = `offline-index:v2:openfreemap:${JSON.stringify(selectedZone.bounds)}:${selectedZone.maxZoom}`
  const indexKeys = new Set([`${indexPrefix}:${selectedZone.cacheGeneration ?? 'legacy'}`])
  if (!selectedZone.cacheGeneration) indexKeys.add(indexPrefix)
  const indexes = await getAll<{ key: string }>('geocoder-results')
  await Promise.all(indexes
    .filter((record) => indexKeys.has(record.key))
    .map((record) => remove('geocoder-results', record.key)))
  await Promise.all(targets.map((record) => remove(STORE, record.key)))
  window.dispatchEvent(new CustomEvent('offline-zone-deleted', { detail: { zoneId } }))
}

export function isInZone(zone: OfflineZone, coordinates: [number, number]): boolean {
  const [w, s, e, n] = zone.bounds
  const [lng, lat] = coordinates
  return lng >= w && lng <= e && lat >= s && lat <= n
}

export function replaceOfflineZoneBounds(zone: OfflineZone, bounds: OfflineZone['bounds']): OfflineZone | null {
  const [west, south, east, north] = bounds
  if (![west, south, east, north].every(Number.isFinite)
    || west < -180 || east > 180 || south < -85.05112878 || north > 85.05112878
    || west >= east || south >= north) return null

  const changed = bounds.some((value, index) => value !== zone.bounds[index])
  if (!changed) return zone
  return {
    ...zone,
    label: 'Custom zone',
    viewportDefault: false,
    bounds,
    status: 'idle',
    cachedBytes: 0,
    cachedTileCount: undefined,
    cachedTileUrls: undefined,
    cacheGeneration: undefined,
    indexedFeatureCount: undefined,
    cacheError: undefined,
  }
}

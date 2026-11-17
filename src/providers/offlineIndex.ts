import { get, put } from '../storage/db'
import { searchLocalPlaces } from './localPlaceIndex'
import { isInZone, type OfflineZone } from '../storage/offlineZones'
import type { Place } from '../types/domain'

const INDEX_STORE = 'geocoder-results'
const INDEX_VERSION = 2

type CachedIndex = { key: string; value: Place[]; expiresAt: number }

export function offlineIndexKey(zone: OfflineZone, generation = zone.cacheGeneration ?? 'legacy') {
  return `offline-index:v${INDEX_VERSION}:openfreemap:${JSON.stringify(zone.bounds)}:${zone.maxZoom}:${generation}`
}

export async function readOfflineIndex(zone: OfflineZone): Promise<Place[] | null> {
  let record = await get<CachedIndex>(INDEX_STORE, offlineIndexKey(zone))
  if (!record && !zone.cacheGeneration) {
    record = await get<CachedIndex>(INDEX_STORE, `offline-index:v${INDEX_VERSION}:openfreemap:${JSON.stringify(zone.bounds)}:${zone.maxZoom}`)
  }
  if (!record || record.expiresAt <= Date.now()) return null
  return record.value
}

export async function writeOfflineIndex(zone: OfflineZone, places: Place[], generation = zone.cacheGeneration ?? 'legacy'): Promise<void> {
  const key = offlineIndexKey(zone, generation)
  await put(INDEX_STORE, { key, value: places, expiresAt: Number.MAX_SAFE_INTEGER })
}

export async function searchOfflineIndex(zone: OfflineZone | null, query: string): Promise<{
  places: Place[]
  source: 'offline-index' | 'empty' | 'not-indexed' | 'unavailable'
  error?: string
}> {
  if (!zone) return { places: [], source: 'not-indexed' }
  try {
    const places = await readOfflineIndex(zone)
    if (!places) return { places: [], source: 'not-indexed' }
    if (places.length === 0) return { places: [], source: 'empty' }
    return { places: searchLocalPlaces(places.filter((place) => isInZone(zone, place.coordinates)), query), source: 'offline-index' }
  } catch (error) {
    return {
      places: [],
      source: 'unavailable',
      error: error instanceof Error ? error.message : 'Unable to read the offline place index',
    }
  }
}

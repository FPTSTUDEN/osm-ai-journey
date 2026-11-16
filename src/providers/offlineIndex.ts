import { readCachedValue, writeCachedValue } from '../storage/geocoderCache'
import { searchLocalPlaces } from './localPlaceIndex'
import type { OfflineZone } from '../storage/offlineZones'
import type { Place } from '../types/domain'

const INDEX_TTL = 30 * 24 * 60 * 60 * 1000

function indexKey(zone: OfflineZone) {
  return `offline-index:${zone.bounds.map((value) => value.toFixed(4)).join(':')}:${zone.maxZoom}`
}

export async function readOfflineIndex(zone: OfflineZone): Promise<Place[] | null> {
  return readCachedValue<Place[]>(indexKey(zone))
}

export async function writeOfflineIndex(zone: OfflineZone, places: Place[]): Promise<void> {
  await writeCachedValue(indexKey(zone), places, Date.now() + INDEX_TTL)
}

/** Merge loaded-tile places into the persisted offline index for a zone. Idempotent. */
export async function extendOfflineIndex(zone: OfflineZone, places: Place[]): Promise<number> {
  const current = await readOfflineIndex(zone) ?? []
  const merged = [...new Map([...current, ...places].map((place) => [place.id, place])).values()]
  if (merged.length === current.length) return current.length
  await writeOfflineIndex(zone, merged)
  return merged.length
}

export async function searchOfflineIndex(zone: OfflineZone | null, query: string): Promise<{ places: Place[]; source: 'offline-index' | 'empty' }> {
  if (!zone) return { places: [], source: 'empty' }
  const places = await readOfflineIndex(zone)
  if (!places || places.length === 0) return { places: [], source: 'empty' }
  return { places: searchLocalPlaces(places, query), source: 'offline-index' }
}

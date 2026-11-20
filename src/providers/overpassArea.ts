import { readLiveCache, writeLiveCache, type LiveCacheRecord } from '../storage/liveCache'
import type { Place } from '../types/domain'
import type { MapBounds, PlaceFilter } from './placeFilters'

const CACHE_TTL = 20 * 60 * 1000
/** Larger areas time out on public Overpass servers and return thousands of shops; ask the user to zoom in. */
export const MAX_AREA_SQUARE_DEGREES = 0.004
const RESULT_LIMIT = 300

type OverpassElement = { type?: string; id?: number; tags?: Record<string, unknown>; lat?: number; lon?: number; center?: { lat?: number; lon?: number } }

export type AreaSearchResult = { places: Place[]; source: 'live' | 'cached' | 'stale'; truncated: boolean }

export function areaTooLarge(bounds: MapBounds) {
  const [west, south, east, north] = bounds
  const width = west <= east ? east - west : 360 - west + east
  return width * (north - south) > MAX_AREA_SQUARE_DEGREES
}

const round = (value: number) => value.toFixed(4)

export function createAreaQuery(filter: PlaceFilter, bounds: MapBounds) {
  if (bounds.some((value) => !Number.isFinite(value))) throw new Error('Invalid map bounds')
  const [west, south, east, north] = bounds
  const box = `(${round(south)},${round(west)},${round(north)},${round(east)})`
  return `[out:json][timeout:20];(${filter.overpass.map((selector) => `nwr${selector}["name"]${box};`).join('')});out center tags ${RESULT_LIMIT};`
}

const TAG_KEYS = ['amenity', 'shop', 'tourism', 'leisure', 'historic', 'railway', 'public_transport', 'highway', 'craft', 'office', 'healthcare']

export function parseAreaResponse(payload: { elements?: OverpassElement[] }): Place[] {
  if (!Array.isArray(payload.elements)) throw new Error('Overpass returned an invalid response')
  return payload.elements.flatMap((element): Place[] => {
    const tags = element.tags ?? {}
    const name = typeof tags.name === 'string' ? tags.name.trim() : ''
    const lat = element.lat ?? element.center?.lat
    const lon = element.lon ?? element.center?.lon
    if (!name || typeof lat !== 'number' || typeof lon !== 'number' || typeof element.id !== 'number' || typeof element.type !== 'string') return []
    const key = TAG_KEYS.find((item) => typeof tags[item] === 'string' && tags[item])
    const value = key ? String(tags[key]) : undefined
    return [{
      id: `osm:${element.type}/${element.id}`,
      name,
      category: value,
      osmType: element.type,
      osmId: String(element.id),
      wikidataId: typeof tags.wikidata === 'string' ? tags.wikidata : undefined,
      openingHours: typeof tags.opening_hours === 'string' ? tags.opening_hours : undefined,
      coordinates: [lon, lat],
      source: 'online',
    }]
  })
}

/** Every named place of one kind in the given area, from Overpass. Cached for 20 minutes per area and kind. */
export async function fetchAreaPlaces(filter: PlaceFilter, bounds: MapBounds, endpoint: string, signal?: AbortSignal): Promise<AreaSearchResult> {
  if (areaTooLarge(bounds)) throw new Error('Zoom in to search this area.')
  const key = `overpass-area:${filter.id}:${bounds.map((value) => value.toFixed(3)).join(',')}`
  let cached: LiveCacheRecord<Place[]> | null = null
  try {
    cached = await readLiveCache<Place[]>(key)
  } catch {
    // The cache is optional.
  }
  if (cached && cached.expiresAt > Date.now()) return { places: cached.value, source: 'cached', truncated: cached.value.length >= RESULT_LIMIT }
  try {
    const url = new URL(endpoint)
    if (url.protocol !== 'https:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') throw new Error('Overpass endpoint must use HTTPS.')
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      body: new URLSearchParams({ data: createAreaQuery(filter, bounds) }),
      signal,
    })
    if (response.status === 429) throw new Error('OpenStreetMap search is busy. Try again in a minute.')
    if (!response.ok) throw new Error(`OpenStreetMap search unavailable (${response.status})`)
    const places = parseAreaResponse(await response.json())
    await writeLiveCache(key, places, CACHE_TTL).catch(() => undefined)
    return { places, source: 'live', truncated: places.length >= RESULT_LIMIT }
  } catch (error) {
    if (signal?.aborted) throw error
    if (cached) return { places: cached.value, source: 'stale', truncated: false }
    throw error
  }
}

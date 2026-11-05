import { readLiveCache, writeLiveCache, type LiveCacheRecord } from '../storage/liveCache'
import type { Place } from '../types/domain'

export type TransitStop = {
  name: string
  kind: string
  distanceMeters: number
}

export type NearbyPlaceData = {
  openingHours: string | null
  transitStops: TransitStop[]
}

export type NearbyPlaceDataResult = {
  data: NearbyPlaceData
  source: 'live' | 'cached' | 'stale'
  fetchedAt: number
  expiresAt: number
  cacheError?: string
}

type OverpassElement = {
  type?: string
  tags?: Record<string, unknown>
  lat?: number
  lon?: number
  center?: { lat?: number; lon?: number }
}

type OverpassResponse = {
  elements?: OverpassElement[]
}

const CACHE_TTL = 20 * 60 * 1000

function normalizedName(value: string) {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/\s+/g, ' ')
}

function cacheKey(place: Place) {
  return `overpass:${place.coordinates[1].toFixed(3)}:${place.coordinates[0].toFixed(3)}:${normalizedName(place.name)}`
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/"/g, '\\"')
}

function distanceMeters(from: Place['coordinates'], to: Place['coordinates']) {
  const radians = (value: number) => value * Math.PI / 180
  const [longitudeA, latitudeA] = from
  const [longitudeB, latitudeB] = to
  const latitudeDelta = radians(latitudeB - latitudeA)
  const longitudeDelta = radians(longitudeB - longitudeA)
  const a = Math.sin(latitudeDelta / 2) ** 2 + Math.cos(radians(latitudeA)) * Math.cos(radians(latitudeB)) * Math.sin(longitudeDelta / 2) ** 2
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export function createOverpassQuery(place: Place) {
  const [longitude, latitude] = place.coordinates
  const nearby = `nwr(around:800,${latitude},${longitude})`
  const name = escapeRegex(place.name)
  const hours = place.openingHours ? '' : `nwr(around:80,${latitude},${longitude})["opening_hours"]["name"~"^${name}$",i];`
  return `[out:json][timeout:20];(${hours}${nearby}["public_transport"~"^(platform|stop_position|station|stop_area)$"];${nearby}["highway"="bus_stop"];${nearby}["railway"~"^(station|halt|tram_stop|subway_entrance)$"];);out center tags;`
}

export function parseOverpassResponse(payload: OverpassResponse, place: Place): NearbyPlaceData {
  if (!Array.isArray(payload.elements)) throw new Error('Overpass returned an invalid response')
  const openingHours = place.openingHours ?? payload.elements.flatMap((element) => {
    const hours = element.tags?.opening_hours
    const name = element.tags?.name
    const latitude = element.lat ?? element.center?.lat
    const longitude = element.lon ?? element.center?.lon
    if (typeof hours !== 'string' || typeof name !== 'string' || normalizedName(name) !== normalizedName(place.name)
      || typeof latitude !== 'number' || typeof longitude !== 'number') return []
    return [{ hours, distance: distanceMeters(place.coordinates, [longitude, latitude]) }]
  }).sort((a, b) => a.distance - b.distance)[0]?.hours ?? null
  const transitStops = payload.elements.flatMap((element) => {
    const tags = element.tags ?? {}
    const publicTransport = typeof tags.public_transport === 'string' ? tags.public_transport : ''
    const railway = typeof tags.railway === 'string' ? tags.railway : ''
    const highway = typeof tags.highway === 'string' ? tags.highway : ''
    const kind = publicTransport || railway || (highway === 'bus_stop' ? 'bus stop' : '')
    const name = typeof tags.name === 'string' ? tags.name : typeof tags.ref === 'string' ? tags.ref : ''
    const latitude = element.lat ?? element.center?.lat
    const longitude = element.lon ?? element.center?.lon
    if (!kind || !name || typeof latitude !== 'number' || typeof longitude !== 'number') return []
    return [{ name, kind: kind.replace(/_/g, ' '), distanceMeters: Math.round(distanceMeters(place.coordinates, [longitude, latitude])) }]
  }).sort((a, b) => a.distanceMeters - b.distanceMeters).slice(0, 6)
  return { openingHours, transitStops }
}

export async function fetchNearbyPlaceData(place: Place, endpoint: string, force = false): Promise<NearbyPlaceDataResult> {
  const key = cacheKey(place)
  let cached: LiveCacheRecord<NearbyPlaceData> | null = null
  let cacheError = ''
  try {
    cached = await readLiveCache<NearbyPlaceData>(key)
  } catch (error) {
    cacheError = error instanceof Error ? error.message : 'Browser cache is unavailable'
  }
  if (!force && cached && cached.expiresAt > Date.now()) return { ...cached, data: cached.value, source: 'cached', ...(cacheError ? { cacheError } : {}) }
  try {
    const url = new URL(endpoint)
    if (url.protocol !== 'https:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
      throw new Error('Overpass endpoint must use HTTPS.')
    }
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      body: new URLSearchParams({ data: createOverpassQuery(place) }),
    })
    if (!response.ok) throw new Error(`OpenStreetMap data unavailable (${response.status})`)
    const data = parseOverpassResponse(await response.json() as OverpassResponse, place)
    let fetchedAt = Date.now()
    let expiresAt = fetchedAt + CACHE_TTL
    try {
      const cacheRecord = await writeLiveCache(key, data, CACHE_TTL)
      fetchedAt = cacheRecord.fetchedAt
      expiresAt = cacheRecord.expiresAt
    } catch (error) {
      cacheError = error instanceof Error ? error.message : 'Unable to save nearby data in the browser cache'
    }
    return { data, source: 'live', fetchedAt, expiresAt, ...(cacheError ? { cacheError } : {}) }
  } catch (error) {
    if (cached) return { ...cached, data: cached.value, source: 'stale', ...(cacheError ? { cacheError } : {}) }
    throw error
  }
}

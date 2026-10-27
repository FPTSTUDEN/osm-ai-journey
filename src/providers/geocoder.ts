import { readCachedValue, writeCachedValue } from '../storage/geocoderCache'
import type { Place, UserSettings } from '../types/domain'

type GeocoderName = UserSettings['onlineGeocoder']

export interface GeocoderProvider {
  search(query: string): Promise<Place[]>
}

type GeocoderResponse = {
  places: Place[]
  cached: boolean
}

type NominatimResult = {
  place_id?: number
  osm_type?: string
  osm_id?: number
  name?: string
  display_name?: string
  type?: string
  category?: string
  lat?: string
  lon?: string
}

type PhotonFeature = {
  geometry?: { coordinates?: unknown }
  properties?: Record<string, unknown>
}

const CACHE_TTL = 24 * 60 * 60 * 1000
let lastNominatimRequest = 0

function normalizeQuery(query: string) {
  return query.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase().trim().replace(/\s+/g, ' ')
}

function placeId(provider: GeocoderName, type: string | undefined, id: string | undefined, coordinates: [number, number]) {
  return `online:${provider}:${type ?? 'place'}:${id ?? coordinates.join(':')}`
}

function validCoordinates(value: unknown): value is [number, number] {
  return Array.isArray(value) && typeof value[0] === 'number' && typeof value[1] === 'number' && Number.isFinite(value[0]) && Number.isFinite(value[1])
}

async function waitForNominatimRateLimit() {
  const wait = Math.max(0, 1100 - (Date.now() - lastNominatimRequest))
  if (wait) await new Promise((resolve) => window.setTimeout(resolve, wait))
  lastNominatimRequest = Date.now()
}

async function fetchNominatim(query: string) {
  await waitForNominatimRateLimit()
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=0&limit=8&q=${encodeURIComponent(query)}`
  const response = await fetch(url, { headers: { Accept: 'application/json', 'Accept-Language': navigator.language } })
  if (!response.ok) throw new Error(`Nominatim returned HTTP ${response.status}`)
  const results = await response.json() as NominatimResult[]
  return results.flatMap((result) => {
    const longitude = Number(result.lon)
    const latitude = Number(result.lat)
    const name = result.name?.trim() || result.display_name?.split(',')[0]?.trim()
    if (!name || !Number.isFinite(longitude) || !Number.isFinite(latitude)) return []
    const coordinates: [number, number] = [longitude, latitude]
    return [{
      id: placeId('nominatim', result.osm_type, result.osm_id ? String(result.osm_id) : undefined, coordinates),
      name,
      category: result.type || result.category,
      osmType: result.osm_type,
      osmId: result.osm_id ? String(result.osm_id) : undefined,
      description: result.display_name,
      coordinates,
      source: 'online' as const,
    }]
  })
}

async function fetchPhoton(query: string) {
  const url = `https://photon.komoot.io/api/?limit=8&q=${encodeURIComponent(query)}`
  const response = await fetch(url, { headers: { Accept: 'application/json' } })
  if (!response.ok) throw new Error(`Photon returned HTTP ${response.status}`)
  const data = await response.json() as { features?: PhotonFeature[] }
  return (data.features ?? []).flatMap((feature) => {
    const properties = feature.properties ?? {}
    if (!validCoordinates(feature.geometry?.coordinates)) return []
    const name = typeof properties.name === 'string' ? properties.name.trim() : ''
    if (!name) return []
    const coordinates = feature.geometry.coordinates
    const type = typeof properties.osm_value === 'string' ? properties.osm_value : typeof properties.type === 'string' ? properties.type : undefined
    const osmType = typeof properties.osm_type === 'string' ? properties.osm_type : undefined
    const osmId = typeof properties.osm_id === 'number' || typeof properties.osm_id === 'string' ? String(properties.osm_id) : undefined
    const locality = [properties.city, properties.state, properties.country].filter((value): value is string => typeof value === 'string' && Boolean(value)).join(', ')
    return [{
      id: placeId('photon', osmType, osmId, coordinates),
      name,
      category: type,
      osmType,
      osmId,
      description: locality || undefined,
      coordinates,
      source: 'online' as const,
    }]
  })
}

const geocoderProviders: Record<GeocoderName, GeocoderProvider> = {
  nominatim: { search: fetchNominatim },
  photon: { search: fetchPhoton },
}

export async function searchOnlinePlaces(query: string, provider: GeocoderName): Promise<GeocoderResponse> {
  const normalized = normalizeQuery(query)
  if (!normalized) return { places: [], cached: false }

  const cacheKey = `${provider}:${normalized}`
  const cached = await readCachedValue<Place[]>(cacheKey)
  if (cached) return { places: cached, cached: true }

  const places = await geocoderProviders[provider].search(normalized)
  await writeCachedValue(cacheKey, places, Date.now() + CACHE_TTL)
  return { places, cached: false }
}

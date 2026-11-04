import { readCachedValue, writeCachedValue } from '../storage/geocoderCache'
import type { Place, PlacePhoto } from '../types/domain'

type WikimediaMetadata = {
  ImageDescription?: { value?: string }
  Artist?: { value?: string }
  DateTimeOriginal?: { value?: string }
  LicenseShortName?: { value?: string }
  LicenseUrl?: { value?: string }
  AttributionRequired?: { value?: string }
}

type WikimediaPage = {
  pageid?: number
  title?: string
  imageinfo?: Array<{
    thumburl?: string
    mime?: string
    descriptionurl?: string
    extmetadata?: WikimediaMetadata
  }>
  coordinates?: Array<{ lat: number; lon: number }>
}

type WikimediaResponse = {
  query?: { pages?: Record<string, WikimediaPage> }
}

const CACHE_TTL = 7 * 24 * 60 * 60 * 1000

function cacheKey(place: Place) {
  return `photos:v3:${place.name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase().trim()}:${place.coordinates.map((coordinate) => coordinate.toFixed(3)).join(':')}`
}

function cleanHtml(value?: string) {
  const cleaned = value?.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  return cleaned ? cleaned.slice(0, 500) : undefined
}

function calculateDistance(coord1: [number, number], coord2: [number, number]): number {
  // Haversine formula to calculate distance between two coordinates (in meters)
  const [lon1, lat1] = coord1
  const [lon2, lat2] = coord2
  const R = 6371000 // Earth's radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

function thumbnailAtWidth(url: string, width: number) {
  const parsed = new URL(url)
  const filename = parsed.pathname.split('/').pop() ?? ''
  const resized = filename.match(/^\d+px-(.+)$/)
  if (resized) parsed.pathname = parsed.pathname.replace(/\/\d+px-[^/]+$/, `/${width}px-${resized[1]}`)
  return parsed.toString()
}

export function parseWikimediaPhotos(payload: WikimediaResponse, place: Place): PlacePhoto[] {
  const photos = Object.values(payload.query?.pages ?? {}).flatMap((page): PlacePhoto[] => {
    const info = page.imageinfo?.[0]
    if (!page.pageid || !page.title || !info?.thumburl || !info.descriptionurl || !['image/jpeg', 'image/png', 'image/webp'].includes(info.mime ?? '')) return []
    const metadata = info.extmetadata

    let distanceMeters: number | undefined
    let photoCoordinates: [number, number] | undefined
    if (page.coordinates?.length) {
      photoCoordinates = [page.coordinates[0].lon, page.coordinates[0].lat]
      distanceMeters = calculateDistance(place.coordinates, photoCoordinates)
    }

    const sceneUrl = info.thumburl
    return [{
      id: String(page.pageid),
      title: page.title.replace(/^File:/, ''),
      description: cleanHtml(metadata?.ImageDescription?.value),
      author: cleanHtml(metadata?.Artist?.value),
      publishedAt: metadata?.DateTimeOriginal?.value,
      license: cleanHtml(metadata?.LicenseShortName?.value),
      licenseUrl: metadata?.LicenseUrl?.value,
      attributionRequired: metadata?.AttributionRequired?.value?.toLocaleLowerCase() === 'true',
      imageUrl: sceneUrl,
      sceneUrl,
      thumbnailUrl: thumbnailAtWidth(sceneUrl, 640),
      sourceUrl: info.descriptionurl,
      source: 'wikimedia-commons',
      distanceMeters,
      photoCoordinates,
    }]
  })

  return photos.sort((first, second) => (first.distanceMeters ?? Number.POSITIVE_INFINITY) - (second.distanceMeters ?? Number.POSITIVE_INFINITY))
}

export async function fetchPlacePhotos(place: Place, force = false): Promise<{ photos: PlacePhoto[]; cached: boolean }> {
  const key = cacheKey(place)
  if (!force) {
    const cached = await readCachedValue<PlacePhoto[]>(key)
    if (cached) return { photos: cached, cached: true }
  }

  const [longitude, latitude] = place.coordinates
  const params = new URLSearchParams({
    action: 'query',
    generator: 'geosearch',
    ggsprimary: 'all',
    ggsnamespace: '6',
    ggsradius: '1000',
    ggslimit: '8',
    ggscoord: `${latitude}|${longitude}`,
    prop: 'imageinfo|coordinates',
    iiprop: 'url|extmetadata|mime',
    iiurlwidth: '1600',
    format: 'json',
    origin: '*',
  })
  const response = await fetch(`https://commons.wikimedia.org/w/api.php?${params}`)
  if (!response.ok) throw new Error(`Wikimedia Commons returned HTTP ${response.status}`)
  const payload = await response.json() as WikimediaResponse
  const photos = parseWikimediaPhotos(payload, place)
  await writeCachedValue(key, photos, Date.now() + CACHE_TTL)
  return { photos, cached: false }
}

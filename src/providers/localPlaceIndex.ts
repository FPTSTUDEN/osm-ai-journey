import type { Place } from '../types/domain'

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

export function placeFromFeature(feature: { id?: string | number; properties?: Record<string, unknown>; geometry?: { type?: string; coordinates?: unknown } }): Place | null {
  if (feature.geometry?.type !== 'Point' || !Array.isArray(feature.geometry.coordinates)) return null
  const coordinates = feature.geometry.coordinates
  if (typeof coordinates[0] !== 'number' || typeof coordinates[1] !== 'number') return null

  const properties = feature.properties ?? {}
  const name = text(properties.name) || text(properties.name_en)
  if (!name) return null

  return {
    id: String(feature.id ?? `${coordinates[0]}:${coordinates[1]}`),
    name,
    category: text(properties.class) || text(properties.subclass) || undefined,
    coordinates: [coordinates[0], coordinates[1]],
    source: 'map',
  }
}

export function searchLocalPlaces(places: Place[], query: string) {
  const terms = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean)
  if (!terms.length) return places.slice(0, 8)

  return places
    .map((place) => {
      const haystack = `${place.name} ${place.category ?? ''}`.toLocaleLowerCase()
      const score = terms.reduce((total, term) => total + (haystack.includes(term) ? 1 : 0), 0)
      return { place, score }
    })
    .filter((entry) => entry.score === terms.length)
    .sort((a, b) => b.score - a.score || a.place.name.localeCompare(b.place.name))
    .slice(0, 8)
    .map((entry) => entry.place)
}

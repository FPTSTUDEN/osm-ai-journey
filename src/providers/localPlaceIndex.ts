import type { Place } from '../types/domain'

function text(value: unknown) {
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : ''
}

function firstText(properties: Record<string, unknown>, keys: string[]) {
  return keys.map((key) => text(properties[key])).find(Boolean) ?? ''
}

function normalized(value: string) {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase().trim().replace(/\s+/g, ' ')
}

export function placeFromFeature(feature: { id?: string | number; properties?: Record<string, unknown>; geometry?: { type?: string; coordinates?: unknown } }): Place | null {
  if (feature.geometry?.type !== 'Point' || !Array.isArray(feature.geometry.coordinates)) return null
  const coordinates = feature.geometry.coordinates
  if (typeof coordinates[0] !== 'number' || typeof coordinates[1] !== 'number') return null

  const properties = feature.properties ?? {}
  const name = firstText(properties, ['name', 'name_en', 'official_name', 'alt_name'])
  if (!name) return null

  const category = firstText(properties, ['class', 'subclass', 'amenity', 'tourism', 'shop'])
  const osmType = firstText(properties, ['osm_type', 'type']) || undefined
  const osmId = firstText(properties, ['osm_id', 'id']) || undefined

  return {
    id: `${normalized(name)}:${coordinates[0].toFixed(5)}:${coordinates[1].toFixed(5)}`,
    name,
    category: category || undefined,
    osmType,
    osmId,
    coordinates: [coordinates[0], coordinates[1]],
    source: 'map',
  }
}

export function searchLocalPlaces(places: Place[], query: string) {
  const terms = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean)
  if (!terms.length) return places.slice(0, 8)

  return places
    .map((place) => {
      const haystack = normalized(`${place.name} ${place.category ?? ''}`)
      const score = terms.reduce((total, term) => {
        const normalizedTerm = normalized(term)
        if (normalized(place.name).startsWith(normalizedTerm)) return total + 3
        if (haystack.includes(normalizedTerm)) return total + 1
        return total
      }, 0)
      return { place, score, matchedTerms: terms.filter((term) => haystack.includes(normalized(term))).length }
    })
    .filter((entry) => entry.matchedTerms === terms.length)
    .sort((a, b) => b.score - a.score || a.place.name.localeCompare(b.place.name))
    .slice(0, 8)
    .map((entry) => entry.place)
}

export function deduplicatePlaces(places: Place[]) {
  return [...new Map(places.map((place) => [place.id, place])).values()]
}

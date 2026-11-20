import type { Coordinates, Place } from '../types/domain'

/**
 * A kind of place the map can highlight. `values` are matched against a place's `category` (the OpenMapTiles
 * `class`, or the raw OSM value for other sources) and `subcategory` (the OpenMapTiles `subclass`, which holds
 * the OSM tag value, e.g. `mall`). `overpass` selectors are fixed strings; only `tagFilter` builds one, from a
 * value restricted to `[a-z_]`.
 */
export type PlaceFilter = {
  id: string
  /** Chip and button label, e.g. "Cafés". */
  label: string
  /** Used in counts: "14 cafés in view". */
  noun: string
  values: readonly string[]
  overpass: readonly string[]
}

export const PLACE_FILTERS = [
  { id: 'food', label: 'Food', noun: 'places to eat', values: ['restaurant', 'fast_food', 'food_court', 'bbq'], overpass: ['["amenity"~"^(restaurant|fast_food|food_court)$"]'] },
  { id: 'cafe', label: 'Cafés', noun: 'cafés', values: ['cafe', 'ice_cream', 'bakery', 'coffee', 'tea', 'confectionery'], overpass: ['["amenity"~"^(cafe|ice_cream)$"]', '["shop"~"^(bakery|coffee|tea)$"]'] },
  { id: 'shopping', label: 'Shopping', noun: 'shops', values: ['shop', 'grocery', 'clothing_store', 'alcohol_shop', 'mall', 'department_store', 'supermarket', 'marketplace', 'convenience', 'clothes', 'shoes', 'books', 'gift', 'jewelry'], overpass: ['["shop"]', '["amenity"="marketplace"]'] },
  { id: 'sights', label: 'Sights', noun: 'sights', values: ['attraction', 'museum', 'art_gallery', 'gallery', 'castle', 'monument', 'memorial', 'viewpoint', 'artwork', 'ruins', 'archaeological_site', 'place_of_worship', 'theatre'], overpass: ['["tourism"~"^(attraction|museum|gallery|viewpoint|artwork)$"]', '["historic"~"^(monument|memorial|castle|ruins|archaeological_site)$"]'] },
  { id: 'parks', label: 'Parks', noun: 'parks and gardens', values: ['park', 'garden', 'nature_reserve', 'dog_park'], overpass: ['["leisure"~"^(park|garden|nature_reserve)$"]'] },
  { id: 'transit', label: 'Transit', noun: 'stops and stations', values: ['bus', 'bus_stop', 'railway', 'rail', 'subway', 'station', 'halt', 'tram_stop', 'subway_entrance', 'ferry_terminal', 'aerialway'], overpass: ['["public_transport"="station"]', '["railway"~"^(station|halt|tram_stop)$"]', '["highway"="bus_stop"]', '["amenity"="ferry_terminal"]'] },
  { id: 'nightlife', label: 'Nightlife', noun: 'bars and pubs', values: ['bar', 'pub', 'beer', 'nightclub', 'biergarten'], overpass: ['["amenity"~"^(bar|pub|nightclub|biergarten)$"]'] },
  // Reached by typing only (not chips).
  { id: 'mall', label: 'Malls', noun: 'malls and department stores', values: ['mall', 'department_store'], overpass: ['["shop"~"^(mall|department_store)$"]'] },
  { id: 'stay', label: 'Hotels', noun: 'places to stay', values: ['lodging', 'hotel', 'hostel', 'guest_house', 'motel', 'apartment'], overpass: ['["tourism"~"^(hotel|hostel|guest_house|motel|apartment)$"]'] },
] as const satisfies readonly PlaceFilter[]

export type PlaceFilterId = (typeof PLACE_FILTERS)[number]['id']
export const CHIP_FILTER_IDS: readonly PlaceFilterId[] = ['food', 'cafe', 'shopping', 'sights', 'parks', 'transit', 'nightlife']

/** Everyday words to filters. Plurals are handled by `filterForQuery`. */
const KEYWORDS: Record<string, PlaceFilterId> = {
  food: 'food', restaurant: 'food', eat: 'food', eating: 'food', dinner: 'food', lunch: 'food', breakfast: 'food', 'fast food': 'food', pizza: 'food',
  cafe: 'cafe', coffee: 'cafe', tea: 'cafe', bakery: 'cafe', bakeries: 'cafe', 'ice cream': 'cafe', gelato: 'cafe', dessert: 'cafe',
  shop: 'shopping', shopping: 'shopping', store: 'shopping', market: 'shopping', supermarket: 'shopping', groceries: 'shopping', grocery: 'shopping',
  mall: 'mall', 'shopping mall': 'mall', 'shopping centre': 'mall', 'shopping center': 'mall', 'department store': 'mall',
  sight: 'sights', sights: 'sights', sightseeing: 'sights', museum: 'sights', attraction: 'sights', landmark: 'sights', monument: 'sights', gallery: 'sights', galleries: 'sights', church: 'sights', castle: 'sights', ruins: 'sights',
  park: 'parks', garden: 'parks', green: 'parks', nature: 'parks',
  bus: 'transit', train: 'transit', metro: 'transit', subway: 'transit', station: 'transit', transit: 'transit', tram: 'transit', transport: 'transit', 'public transport': 'transit',
  bar: 'nightlife', pub: 'nightlife', nightlife: 'nightlife', drinks: 'nightlife', club: 'nightlife', nightclub: 'nightlife',
  hotel: 'stay', hostel: 'stay', stay: 'stay', lodging: 'stay', accommodation: 'stay', 'guest house': 'stay',
}

const OSM_VALUE = /^[a-z][a-z_]{2,29}$/

export function placeFilterById(id: string): PlaceFilter | null {
  if (id.startsWith('tag:')) return tagFilter(id.slice(4))
  return PLACE_FILTERS.find((filter) => filter.id === id) ?? null
}

/**
 * A filter for one raw OSM value the user typed (e.g. "pharmacy"). Only `[a-z_]` values are accepted, so the
 * Overpass selectors built from it cannot carry anything else.
 */
export function tagFilter(value: string): PlaceFilter | null {
  if (!OSM_VALUE.test(value)) return null
  const label = value.replace(/_/g, ' ')
  return {
    id: `tag:${value}`,
    label: label.charAt(0).toLocaleUpperCase() + label.slice(1),
    noun: `“${label}” places`,
    values: [value],
    overpass: ['amenity', 'shop', 'tourism', 'leisure', 'craft', 'office', 'healthcare'].map((key) => `["${key}"="${value}"]`),
  }
}

function clean(value: string) {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase().trim().replace(/\s+/g, ' ')
}

function singular(word: string) {
  if (word.endsWith('ies')) return `${word.slice(0, -3)}y`
  if (/(ches|shes|sses|xes)$/.test(word)) return word.slice(0, -2)
  if (word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1)
  return word
}

/**
 * Turn a typed search into a filter: a known word ("restaurants", "mall", "coffee"), or an OSM value that some
 * loaded place actually has ("pharmacy"). Returns null for anything else, so place-name searches are unaffected.
 */
export function filterForQuery(query: string, loadedPlaces: readonly Place[] = []): PlaceFilter | null {
  const text = clean(query).replace(/^(show|find|highlight|nearby|near me)\s+/, '').replace(/\s+(nearby|near me|around here)$/, '')
  if (!text) return null
  const candidates = [text, singular(text), text.split(' ').map(singular).join(' ')]
  for (const candidate of candidates) {
    const id = KEYWORDS[candidate]
    if (id) return placeFilterById(id)
  }
  const value = singular(text).replace(/ /g, '_')
  if (OSM_VALUE.test(value) && loadedPlaces.some((place) => place.category === value || place.subcategory === value)) return tagFilter(value)
  return null
}

export function placeMatchesFilter(place: Place, filter: PlaceFilter) {
  return Boolean((place.category && filter.values.includes(place.category)) || (place.subcategory && filter.values.includes(place.subcategory)))
}

export type MapBounds = [west: number, south: number, east: number, north: number]

export function inBounds(coordinates: Coordinates, bounds: MapBounds) {
  const [lng, lat] = coordinates
  const [west, south, east, north] = bounds
  const inLng = west <= east ? lng >= west && lng <= east : lng >= west || lng <= east
  return inLng && lat >= south && lat <= north
}

/** Great-circle distance in metres. */
export function distanceMeters(a: Coordinates, b: Coordinates) {
  const toRad = Math.PI / 180
  const dLat = (b[1] - a[1]) * toRad
  const dLng = (b[0] - a[0]) * toRad
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * toRad) * Math.cos(b[1] * toRad) * Math.sin(dLng / 2) ** 2
  return 2 * 6_371_000 * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** Straight-line distance and a walking estimate at 4.8 km/h. Real routes are longer, hence "~". */
export function distanceLabel(meters: number) {
  const distance = meters < 950 ? `${Math.max(10, Math.round(meters / 10) * 10)} m` : `${(meters / 1000).toFixed(1)} km`
  const minutes = Math.max(1, Math.round(meters / 80))
  return minutes > 90 ? distance : `${distance} · ~${minutes} min walk`
}

/** Same place from two sources (tiles and Overpass): same name within 60 m. */
export function mergePlaces(primary: readonly Place[], extra: readonly Place[]) {
  const merged = [...primary]
  for (const place of extra) {
    const name = clean(place.name)
    if (!merged.some((item) => clean(item.name) === name && distanceMeters(item.coordinates, place.coordinates) < 60)) merged.push(place)
  }
  return merged
}

import { readCachedValue, writeCachedValue } from '../storage/geocoderCache'
import type { Place } from '../types/domain'

export type EnrichmentFact = {
  label: string
  value: string
}

export type PlaceContext = {
  summary?: string
  wikipediaTitle?: string
  wikipediaUrl?: string
  wikidataId?: string
  facts: EnrichmentFact[]
}

export type EnrichmentResponse = {
  context: PlaceContext
  cached: boolean
}

const CACHE_TTL = 7 * 24 * 60 * 60 * 1000

type WikipediaGeoSearchResponse = { query?: { geosearch?: Array<{ title?: string; dist?: number }> } }
type WikipediaSummary = { title?: string; extract?: string; content_urls?: { desktop?: { page?: string } } }

function normalizedTitle(title: string) {
  return title.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase().replace(/[_\s]+/g, ' ').replace(/[^\p{L}\p{N} ]/gu, '').trim()
}

function isMatchingTitle(placeName: string, title: string) {
  const name = normalizedTitle(placeName)
  const candidate = normalizedTitle(title)
  return candidate === name || candidate.startsWith(`${name} `) || name.startsWith(`${candidate} `)
}

async function fetchWikipedia(place: Place): Promise<Partial<PlaceContext>> {
  let title = place.wikipediaTitle
  if (!title) {
    const params = new URLSearchParams({
      action: 'query',
      list: 'geosearch',
      gscoord: `${place.coordinates[1]}|${place.coordinates[0]}`,
      gsradius: '500',
      gslimit: '10',
      format: 'json',
      origin: '*',
    })
    const searchResponse = await fetch(`https://en.wikipedia.org/w/api.php?${params}`)
    if (!searchResponse.ok) throw new Error(`Wikipedia search returned HTTP ${searchResponse.status}`)
    const search = await searchResponse.json() as WikipediaGeoSearchResponse
    title = search.query?.geosearch?.find((item) => item.title && (item.dist === undefined || item.dist <= 500) && isMatchingTitle(place.name, item.title))?.title
  }
  if (!title) return {}

  const summaryResponse = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`)
  if (!summaryResponse.ok) return { wikipediaTitle: title }
  const summary = await summaryResponse.json() as WikipediaSummary
  return {
    summary: summary.extract,
    wikipediaTitle: summary.title || title,
    wikipediaUrl: summary.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`,
  }
}

type WikidataEntity = {
  id?: string
  labels?: Record<string, { value?: string }>
  sitelinks?: { enwiki?: { title?: string } }
  claims?: Record<string, Array<{ mainsnak?: { datavalue?: { value?: { id?: string } | string } } }>>
}

async function fetchWikidata(place: Place): Promise<Partial<PlaceContext>> {
  const id = place.wikidataId
  if (!id) return {}

  const entityResponse = await fetch(`https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${encodeURIComponent(id)}&props=labels|claims|sitelinks&languages=en&format=json&origin=*`)
  if (!entityResponse.ok) throw new Error(`Wikidata entity returned HTTP ${entityResponse.status}`)
  const entityData = await entityResponse.json() as { entities?: Record<string, WikidataEntity> }
  const entity = entityData.entities?.[id]
  if (!entity) return {}

  const entityIds = ['P31', 'P17', 'P131']
    .flatMap((property) => entity.claims?.[property] ?? [])
    .map((claim) => claim.mainsnak?.datavalue?.value)
    .filter((value): value is { id: string } => typeof value === 'object' && value !== null && typeof value.id === 'string')
    .map((value) => value.id)
  const labels = entityIds.length ? await fetchWikidataLabels(entityIds) : new Map<string, string>()
  const facts: EnrichmentFact[] = []
  const addFact = (property: string, label: string) => {
    const value = entity.claims?.[property]?.[0]?.mainsnak?.datavalue?.value
    if (typeof value === 'object' && value?.id) facts.push({ label, value: labels.get(value.id) || value.id })
  }
  addFact('P31', 'Type')
  addFact('P17', 'Country')
  addFact('P131', 'Located in')

  return {
    wikidataId: entity.id || id,
    wikipediaTitle: entity.sitelinks?.enwiki?.title,
    facts,
  }
}

async function fetchWikidataLabels(ids: string[]) {
  const response = await fetch(`https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${ids.join('|')}&props=labels&languages=en&format=json&origin=*`)
  if (!response.ok) return new Map<string, string>()
  const data = await response.json() as { entities?: Record<string, WikidataEntity> }
  return new Map(Object.entries(data.entities ?? {}).map(([id, entity]) => [id, entity.labels?.en?.value || id]))
}

function cacheKey(place: Place) {
  return `enrich:v2:${place.wikidataId ?? ''}:${place.wikipediaTitle ?? ''}:${place.name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase().trim()}:${place.coordinates.map((coordinate) => coordinate.toFixed(3)).join(':')}`
}

export async function enrichPlace(place: Place): Promise<EnrichmentResponse> {
  const key = cacheKey(place)
  const cached = await readCachedValue<PlaceContext>(key)
  if (cached) return { context: cached, cached: true }

  const wikidata: Partial<PlaceContext> = await fetchWikidata(place).catch((): Partial<PlaceContext> => ({}))
  const wikipediaPlace = { ...place, wikipediaTitle: place.wikipediaTitle ?? wikidata.wikipediaTitle }
  const wikipedia: Partial<PlaceContext> = await fetchWikipedia(wikipediaPlace).catch((): Partial<PlaceContext> => ({}))
  const context: PlaceContext = { ...wikipedia, ...wikidata, facts: wikidata.facts ?? [] }
  await writeCachedValue(key, context, Date.now() + CACHE_TTL)
  return { context, cached: false }
}

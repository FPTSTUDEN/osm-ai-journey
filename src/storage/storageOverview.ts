import { getAll, remove } from './db'
import { MAP_RESOURCE_CACHE_NAME, OFFLINE_TILE_CACHE_NAME } from './cacheNames'
import { listZones, loadZone, type OfflineZone } from './offlineZones'

export type StorageSizeCount = {
  count: number
  bytes: number
}

export type OfflineZoneStorage = {
  zone: OfflineZone
  selected: boolean
  tileCount: number
  tileBytes: number
  indexedPlaces: number
  indexBytes: number
}

export type StorageOverview = {
  browserStorage: { usage: number | null; quota: number | null }
  appCache: StorageSizeCount
  mapTiles: StorageSizeCount
  mapResources: StorageSizeCount
  zones: OfflineZoneStorage[]
  journey: { journeys: number; conversations: number; messages: number; bytes: number }
  geocoderResults: StorageSizeCount
  liveData: StorageSizeCount
  personaArt: StorageSizeCount
}

type StoredRecord = { key: string }
type OfflineIndexRecord = StoredRecord & { value?: unknown }

function embeddedBlobBytes(value: unknown, seen = new WeakSet<object>()): number {
  if (!value || typeof value !== 'object' || seen.has(value)) return 0
  seen.add(value)
  if (value instanceof Blob) return value.size
  if (ArrayBuffer.isView(value)) return value.byteLength
  if (value instanceof ArrayBuffer) return value.byteLength
  return Object.values(value).reduce<number>((total, item) => total + embeddedBlobBytes(item, seen), 0)
}

function estimateRecordBytes(value: unknown): number {
  const serialized = JSON.stringify(value)
  return new Blob([serialized ?? '']).size + embeddedBlobBytes(value)
}

function summarizeRecords(records: unknown[]): StorageSizeCount {
  return {
    count: records.length,
    bytes: records.reduce<number>((total, record) => total + estimateRecordBytes(record), 0),
  }
}

async function summarizeCache(cacheName: string | undefined): Promise<{ summary: StorageSizeCount; itemBytes: Map<string, number> }> {
  if (!cacheName) return { summary: { count: 0, bytes: 0 }, itemBytes: new Map() }
  const cache = await caches.open(cacheName)
  const requests = await cache.keys()
  let bytes = 0
  const itemBytes = new Map<string, number>()
  for (const request of requests) {
    const response = await cache.match(request)
    if (response) {
      const size = (await response.blob()).size
      bytes += size
      itemBytes.set(request.url, size)
    }
  }
  return { summary: { count: requests.length, bytes }, itemBytes }
}

function indexKeyPrefix(zone: OfflineZone): string {
  return `offline-index:v2:openfreemap:${JSON.stringify(zone.bounds)}:${zone.maxZoom}`
}

function currentIndexRecord(zone: OfflineZone, records: OfflineIndexRecord[]): OfflineIndexRecord | undefined {
  const prefix = indexKeyPrefix(zone)
  const generation = zone.cacheGeneration ?? 'legacy'
  return records.find((record) => record.key === `${prefix}:${generation}`)
    ?? (!zone.cacheGeneration ? records.find((record) => record.key === prefix) : undefined)
}

function journeyMessageCounts(records: Array<Record<string, unknown>>) {
  let conversations = 0
  let messages = 0
  for (const journey of records) {
    if (Array.isArray(journey.conversations) && journey.conversations.length > 0) {
      conversations += journey.conversations.length
      for (const item of journey.conversations) {
        if (item && typeof item === 'object' && Array.isArray((item as Record<string, unknown>).messages)) {
          messages += ((item as Record<string, unknown>).messages as unknown[]).length
        }
      }
    } else {
      conversations += 1
      if (Array.isArray(journey.messages)) messages += journey.messages.length
    }
  }
  return { conversations, messages }
}

export async function getStorageOverview(): Promise<StorageOverview> {
  if (!('caches' in window)) throw new Error('Cache Storage is unavailable in this browser')
  const [cacheNames, zones, activeZone, journeyRecords, geocoderRecords, liveRecords, artRecords, storageEstimate] = await Promise.all([
    caches.keys(),
    listZones(),
    loadZone(),
    getAll<Record<string, unknown>>('journeys'),
    getAll<OfflineIndexRecord>('geocoder-results'),
    getAll<StoredRecord>('live-data'),
    getAll<StoredRecord & { image?: Blob }>('companion-art'),
    navigator.storage?.estimate().catch(() => undefined),
  ])
  const appCacheNames = cacheNames
      .filter((name) => name.startsWith('osm-ai-journey-') && name !== MAP_RESOURCE_CACHE_NAME && name !== OFFLINE_TILE_CACHE_NAME)
  const [appCacheGroups, tileCache, mapResourcesCache] = await Promise.all([
    Promise.all(appCacheNames.map((name) => summarizeCache(name)))
      .then((items) => items.map((item) => item.summary))
      .then((items) => items.reduce((total, item) => ({ count: total.count + item.count, bytes: total.bytes + item.bytes }), { count: 0, bytes: 0 })),
    summarizeCache(cacheNames.includes(OFFLINE_TILE_CACHE_NAME) ? OFFLINE_TILE_CACHE_NAME : undefined),
    summarizeCache(cacheNames.includes(MAP_RESOURCE_CACHE_NAME) ? MAP_RESOURCE_CACHE_NAME : undefined),
  ])
  const offlineIndexes = geocoderRecords.filter((record) => record.key.startsWith('offline-index:'))
  const zonesWithStorage = zones.map((zone) => {
    const index = currentIndexRecord(zone, offlineIndexes)
    const places = index && Array.isArray(index.value) ? index.value.length : 0
    const indexBytes = index ? estimateRecordBytes(index) : 0
    const urls = zone.cachedTileUrls ?? []
    return {
      zone,
      selected: zone.id === activeZone?.id,
      tileCount: urls.filter((url) => tileCache.itemBytes.has(url)).length,
      tileBytes: urls.reduce((total, url) => total + (tileCache.itemBytes.get(url) ?? 0), 0),
      indexedPlaces: places,
      indexBytes,
    }
  })
  const journeyCounts = journeyMessageCounts(journeyRecords)
  const geocoderResults = summarizeRecords(geocoderRecords.filter((record) => !record.key.startsWith('offline-index:')))
  const liveData = summarizeRecords(liveRecords)
  const personaArt = summarizeRecords(artRecords)

  return {
    browserStorage: {
      usage: typeof storageEstimate?.usage === 'number' ? storageEstimate.usage : null,
      quota: typeof storageEstimate?.quota === 'number' ? storageEstimate.quota : null,
    },
    appCache: appCacheGroups,
    mapTiles: tileCache.summary,
    mapResources: mapResourcesCache.summary,
    zones: zonesWithStorage,
    journey: {
      journeys: journeyRecords.length,
      ...journeyCounts,
      bytes: journeyRecords.reduce((total, journey) => total + estimateRecordBytes(journey), 0),
    },
    geocoderResults,
    liveData,
    personaArt,
  }
}

export async function clearGeocoderResults(): Promise<void> {
  const records = await getAll<StoredRecord>('geocoder-results')
  await Promise.all(records.filter((record) => !record.key.startsWith('offline-index:'))
    .map((record) => remove('geocoder-results', record.key)))
}

export async function clearLiveData(): Promise<void> {
  const records = await getAll<StoredRecord>('live-data')
  await Promise.all(records.map((record) => remove('live-data', record.key)))
}

export async function clearPersonaArt(): Promise<void> {
  const records = await getAll<StoredRecord>('companion-art')
  await Promise.all(records.map((record) => remove('companion-art', record.key)))
}

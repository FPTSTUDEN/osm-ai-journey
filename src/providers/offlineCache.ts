import type { OfflineZone } from '../storage/offlineZones'
import type { Place } from '../types/domain'

export type TileJob = { z: number; x: number; y: number }

export type CacheProgress = {
  total: number
  done: number
  failed: number
  featuresFound: number
  indexedFeatures: number
  status: 'idle' | 'caching' | 'ready' | 'partial' | 'failed' | 'cancelled'
  error?: string
}

export type CacheOptions = {
  /** Pure tile enumerator, exported separately so tests can drive it without a map. */
  enumerate?: (zone: OfflineZone) => TileJob[]
  /** Fetch and extract searchable places from one vector tile. */
  fetchTile: (job: TileJob, signal: AbortSignal) => Promise<Place[]>
  /** Persists the complete index. Cache status is not ready until this succeeds. */
  persistIndex: (places: Place[]) => Promise<void>
  onProgress?: (progress: CacheProgress) => void
  /** Injected concurrency; default 4 is a reasonable browser-tab ceiling. */
  concurrency?: number
  signal?: AbortSignal
}

const TILE_SIZE = 256
const EARTH_CIRCUMFERENCE = 40075016.686
const MAX_TILES_PER_ZOOM = 500

function lngToTileX(lng: number, z: number) {
  return Math.floor((lng + 180) / 360 * 2 ** z)
}

function latToTileY(lat: number, z: number) {
  const clamped = Math.max(-85.05112878, Math.min(85.05112878, lat))
  const radians = clamped * Math.PI / 180
  return Math.floor((1 - Math.log(Math.tan(radians) + 1 / Math.cos(radians)) / Math.PI) / 2 * 2 ** z)
}

function tileSpanMeters(z: number) {
  return EARTH_CIRCUMFERENCE / (TILE_SIZE * 2 ** z)
}

export function enumerateZoneTiles(zone: OfflineZone): TileJob[] {
  const [west, south, east, north] = zone.bounds
  if (![west, south, east, north, zone.maxZoom].every(Number.isFinite)
    || west < -180 || east > 180 || south < -85.05112878 || north > 85.05112878
    || west >= east || south >= north || !Number.isInteger(zone.maxZoom) || zone.maxZoom < 0) {
    throw new Error('Offline zone has invalid bounds or maximum zoom')
  }

  const jobs: TileJob[] = []
  for (let z = 0; z <= zone.maxZoom; z++) {
    const x0 = Math.max(0, lngToTileX(west, z))
    const x1 = Math.min(2 ** z - 1, lngToTileX(east, z))
    const y0 = latToTileY(north, z)
    const y1 = latToTileY(south, z)
    const levelCount = (x1 - x0 + 1) * (y1 - y0 + 1)
    if (levelCount > MAX_TILES_PER_ZOOM) {
      throw new Error(`Offline zone at zoom ${z} covers ${levelCount} tiles; the limit is ${MAX_TILES_PER_ZOOM}. Reduce the zone or maximum zoom.`)
    }
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) jobs.push({ z, x, y })
  }
  return jobs
}

export function estimateZoneBytes(zone: OfflineZone) {
  return enumerateZoneTiles(zone).reduce((total, job) => total + 2 * tileSpanMeters(job.z) ** 2, 0)
}

export async function runCache(zone: OfflineZone, options: CacheOptions): Promise<CacheProgress> {
  let jobs: TileJob[]
  try {
    jobs = (options.enumerate ?? enumerateZoneTiles)(zone)
  } catch (error) {
    const progress: CacheProgress = {
      total: 0,
      done: 0,
      failed: 1,
      featuresFound: 0,
      indexedFeatures: 0,
      status: 'failed',
      error: error instanceof Error ? error.message : 'Unable to enumerate offline zone tiles',
    }
    options.onProgress?.(progress)
    return progress
  }

  const total = jobs.length
  const progress: CacheProgress = { total, done: 0, failed: 0, featuresFound: 0, indexedFeatures: 0, status: 'caching' }
  if (total === 0) {
    progress.status = 'failed'
    progress.error = 'Offline zone contains no map tiles'
    options.onProgress?.({ ...progress })
    return progress
  }

  const signal = options.signal ?? new AbortController().signal
  const concurrency = Math.max(1, options.concurrency ?? 4)
  const placesById = new Map<string, Place>()
  let cursor = 0
  let firstTileError: string | undefined

  const worker = async () => {
    while (cursor < jobs.length) {
      if (signal.aborted) return
      const job = jobs[cursor++]
      try {
        const places = await options.fetchTile(job, signal)
        for (const place of places) placesById.set(place.id, place)
        progress.done += 1
      } catch (error) {
        progress.failed += 1
        if (!firstTileError) firstTileError = error instanceof Error ? error.message : 'Unknown tile error'
      }
      progress.featuresFound = placesById.size
      options.onProgress?.({ ...progress })
    }
  }

  await Promise.all(Array.from({ length: concurrency }, worker))
  if (signal.aborted) {
    progress.status = 'cancelled'
  } else if (progress.failed === 0) {
    try {
      await options.persistIndex([...placesById.values()])
      progress.indexedFeatures = placesById.size
      progress.status = 'ready'
    } catch (error) {
      progress.status = 'failed'
      progress.error = error instanceof Error ? error.message : 'Unable to persist the offline place index'
    }
  } else if (progress.done > 0) {
    progress.status = 'partial'
    progress.error = `${progress.failed} of ${total} map tiles could not be downloaded or indexed; the previous complete index was retained. ${firstTileError ?? ''}`.trim()
  } else {
    progress.status = 'failed'
    progress.error = `All ${total} map tiles failed to download or index. ${firstTileError ?? ''}`.trim()
  }
  options.onProgress?.(progress)
  return progress
}

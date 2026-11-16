import type { OfflineZone } from '../storage/offlineZones'

export type TileJob = { z: number; x: number; y: number }

export type CacheProgress = {
  total: number
  done: number
  failed: number
  status: 'idle' | 'caching' | 'ready' | 'partial' | 'failed' | 'cancelled'
}

export type CacheOptions = {
  /** Pure tile enumerator, exported separately so tests can drive it without a map. */
  enumerate?: (zone: OfflineZone) => TileJob[]
  /** Injected fetcher; production passes the real MapLibre/OpenFreeMap URL builder. */
  fetchTile: (job: TileJob, signal: AbortSignal) => Promise<void>
  /** Called after each tile so the UI can update and persistence can debounce. */
  onProgress?: (progress: CacheProgress) => void
  /** Injected concurrency; default 4 is a reasonable browser-tab ceiling. */
  concurrency?: number
  signal?: AbortSignal
}

const TILE_SIZE = 256
const EARTH_CIRCUMFERENCE = 40075016.686

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
  const jobs: TileJob[] = []
  for (let z = 0; z <= zone.maxZoom; z++) {
    const x0 = lngToTileX(west, z)
    const x1 = lngToTileX(east, z)
    const y0 = latToTileY(north, z)
    const y1 = latToTileY(south, z)
    // Cap so a runaway zone doesn't freeze the tab. 500 tiles per level is generous.
    const levelCount = (x1 - x0 + 1) * (y1 - y0 + 1)
    if (levelCount > 500) {
      const stride = Math.ceil(Math.sqrt(levelCount / 500))
      for (let x = x0; x <= x1; x += stride) for (let y = y0; y <= y1; y += stride) jobs.push({ z, x, y })
    } else {
      for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) jobs.push({ z, x, y })
    }
  }
  return jobs
}

export function estimateZoneBytes(zone: OfflineZone) {
  return enumerateZoneTiles(zone).reduce((total, job) => total + 2 * tileSpanMeters(job.z) ** 2, 0)
}

export async function runCache(zone: OfflineZone, options: CacheOptions): Promise<CacheProgress> {
  const jobs = (options.enumerate ?? enumerateZoneTiles)(zone)
  const total = jobs.length
  const progress: CacheProgress = { total, done: 0, failed: 0, status: 'caching' }
  const signal = options.signal ?? new AbortController().signal
  const concurrency = Math.max(1, options.concurrency ?? 4)
  let cursor = 0

  const worker = async () => {
    while (cursor < jobs.length) {
      if (signal.aborted) return
      const job = jobs[cursor++]
      try {
        await options.fetchTile(job, signal)
        progress.done += 1
      } catch {
        progress.failed += 1
      }
      options.onProgress?.({ ...progress })
    }
  }

  await Promise.all(Array.from({ length: concurrency }, worker))
  if (signal.aborted) {
    progress.status = 'cancelled'
  } else if (progress.failed === 0) {
    progress.status = 'ready'
  } else if (progress.done > 0) {
    progress.status = 'partial'
  } else {
    progress.status = 'failed'
  }
  options.onProgress?.(progress)
  return progress
}

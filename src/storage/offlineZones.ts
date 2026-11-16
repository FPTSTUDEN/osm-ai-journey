import { get, put } from './db'

export type OfflineZone = {
  id: string
  label: string
  bounds: [number, number, number, number] // west, south, east, north (LngLatBoundsLike order)
  maxZoom: number
  createdAt: string
  cachedBytes: number
  status: 'idle' | 'caching' | 'ready' | 'partial' | 'failed'
}

const STORE = 'offline-zones'

function zoneKey(journeyId = 'active') {
  return `zone:${journeyId}`
}

export function defaultZoneFromViewport(center: [number, number], zoom: number, maxZoom = 15): Omit<OfflineZone, 'id' | 'createdAt' | 'cachedBytes' | 'status'> {
  // Roughly a 0.1 degree box at z<=12, growing as zoom increases. Small enough to be fetchable.
  const span = 0.1 / Math.max(1, zoom - 10)
  const [lng, lat] = center
  return {
    label: 'Current view',
    bounds: [lng - span, lat - span * 0.7, lng + span, lat + span * 0.7],
    maxZoom,
  }
}

export function newZoneFromViewport(center: [number, number], zoom: number, maxZoom = 15): OfflineZone {
  const base = defaultZoneFromViewport(center, zoom, maxZoom)
  return { ...base, id: crypto.randomUUID(), createdAt: new Date().toISOString(), cachedBytes: 0, status: 'idle' }
}

export async function loadZone(journeyId = 'active'): Promise<OfflineZone | null> {
  try {
    const record = await get<{ key: string; zone: OfflineZone }>(STORE, zoneKey(journeyId))
    return record?.zone ?? null
  } catch {
    return null
  }
}

export async function saveZone(zone: OfflineZone, journeyId = 'active'): Promise<void> {
  try {
    await put(STORE, { key: zoneKey(journeyId), zone })
  } catch {
    // Storage may be unavailable; the zone remains usable in memory.
  }
}

export function isInZone(zone: OfflineZone, coordinates: [number, number]): boolean {
  const [w, s, e, n] = zone.bounds
  const [lng, lat] = coordinates
  return lng >= w && lng <= e && lat >= s && lat <= n
}

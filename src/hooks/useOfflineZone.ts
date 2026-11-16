import { useCallback, useEffect, useRef, useState } from 'react'
import { newZoneFromViewport, saveZone, loadZone, type OfflineZone } from '../storage/offlineZones'
import { runCache, type CacheProgress } from '../providers/offlineCache'

export function useOfflineZone(mapCenter: [number, number] | null, mapZoom: number | null) {
  const [zone, setZone] = useState<OfflineZone | null>(null)
  const [progress, setProgress] = useState<CacheProgress | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    let active = true
    void loadZone().then((saved) => {
      if (!active) return
      if (saved) setZone(saved)
      else if (mapCenter && mapZoom !== null) setZone(newZoneFromViewport(mapCenter, mapZoom))
    })
    return () => { active = false }
  }, [])

  // Keep the default zone in sync with the current view until the user has cached one.
  useEffect(() => {
    if (zone && zone.status !== 'idle') return
    if (!mapCenter || mapZoom === null) return
    setZone((current) => current ? current : newZoneFromViewport(mapCenter, mapZoom))
  }, [mapCenter, mapZoom, zone])

  const cacheZone = useCallback(async (fetchTile: Parameters<typeof runCache>[1]['fetchTile']) => {
    if (!zone) return null
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setZone((current) => current ? { ...current, status: 'caching' } : current)
    const next = await runCache(zone, {
      fetchTile,
      signal: controller.signal,
      onProgress: (value) => setProgress(value),
    })
    setZone((current) => {
      if (!current) return current
      const updated: OfflineZone = { ...current, status: next.status === 'cancelled' ? 'idle' : next.status, cachedBytes: current.cachedBytes + next.done }
      void saveZone(updated)
      return updated
    })
    return next
  }, [zone])

  const cancelCache = useCallback(() => { abortRef.current?.abort() }, [])

  const replaceZone = useCallback((next: OfflineZone) => {
    setZone(next)
    void saveZone(next)
  }, [])

  return { zone, progress, cacheZone, cancelCache, replaceZone }
}

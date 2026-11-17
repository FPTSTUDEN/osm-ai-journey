import { useCallback, useEffect, useRef, useState } from 'react'
import { newZoneFromViewport, saveZone, loadZone, type OfflineZone } from '../storage/offlineZones'
import { runCache, type CacheProgress } from '../providers/offlineCache'

export function useOfflineZone(mapCenter: [number, number] | null, mapZoom: number | null) {
  const [zone, setZone] = useState<OfflineZone | null>(null)
  const [progress, setProgress] = useState<CacheProgress | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    let active = true
    void loadZone().then(async (saved) => {
      if (!active) return
      if (!saved) {
        if (mapCenter && mapZoom !== null) setZone(newZoneFromViewport(mapCenter, mapZoom))
        return
      }

      if (saved.status === 'ready') {
        try {
          const { readOfflineIndex } = await import('../providers/offlineIndex')
          const places = await readOfflineIndex(saved)
          if (!active) return
          if (!places) {
            const incomplete = { ...saved, status: 'partial' as const, indexedFeatureCount: undefined, cacheError: 'The saved offline search index is missing. Refresh this zone to rebuild it.' }
            setZone(incomplete)
            void saveZone(incomplete)
            return
          }
          saved = { ...saved, indexedFeatureCount: places.length, cacheError: undefined }
        } catch (error) {
          if (!active) return
          const unavailable = {
            ...saved,
            status: 'failed' as const,
            cacheError: error instanceof Error ? error.message : 'Unable to read the saved offline search index',
          }
          setZone(unavailable)
          void saveZone(unavailable)
          return
        }
      }

      setZone(saved)
    })
    return () => { active = false }
  }, [])

  // Keep the default zone in sync with the current view until the user has cached one.
  useEffect(() => {
    if (zone && zone.status !== 'idle') return
    if (!mapCenter || mapZoom === null) return
    setZone((current) => current ? current : newZoneFromViewport(mapCenter, mapZoom))
  }, [mapCenter, mapZoom, zone])

  const cacheZone = useCallback(async (
    fetchTile: Parameters<typeof runCache>[1]['fetchTile'],
    persistIndex: Parameters<typeof runCache>[1]['persistIndex'],
  ) => {
    if (!zone) return null
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setZone((current) => current ? { ...current, status: 'caching' } : current)
    const next = await runCache(zone, {
      fetchTile,
      persistIndex,
      signal: controller.signal,
      onProgress: (value) => setProgress(value),
    })
    setZone((current) => {
      if (!current) return current
      const updated: OfflineZone = {
        ...current,
        status: next.status === 'cancelled' ? 'idle' : next.status,
        cachedTileCount: next.status === 'ready' ? next.done : current.cachedTileCount,
        indexedFeatureCount: next.status === 'ready' ? next.indexedFeatures : current.indexedFeatureCount,
        cacheError: next.error,
      }
      void saveZone(updated)
      return updated
    })
    return next
  }, [zone])

  const cancelCache = useCallback(() => { abortRef.current?.abort() }, [])

  const replaceZone = useCallback((next: OfflineZone) => {
    setZone((current) => {
      const indexChanged = current && (current.maxZoom !== next.maxZoom || current.bounds.some((value, index) => value !== next.bounds[index]))
      const updated = indexChanged
        ? { ...next, status: 'idle' as const, cachedTileCount: undefined, indexedFeatureCount: undefined, cacheError: undefined, cachedBytes: 0 }
        : next
      void saveZone(updated)
      return updated
    })
  }, [])

  return { zone, progress, cacheZone, cancelCache, replaceZone }
}

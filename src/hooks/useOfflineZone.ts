import { useCallback, useEffect, useRef, useState } from 'react'
import { followDefaultZone, newZoneFromViewport, replaceOfflineZoneBounds, saveZone, saveZoneStrict, loadZone, type OfflineZone } from '../storage/offlineZones'
import { runCache, type CacheProgress } from '../providers/offlineCache'
import { hasCompleteOfflineTileCache } from '../providers/offlineTileCache'

export function useOfflineZone(mapCenter: [number, number] | null, mapZoom: number | null) {
  const [zone, setZone] = useState<OfflineZone | null>(null)
  const [progress, setProgress] = useState<CacheProgress | null>(null)
  const [editing, setEditing] = useState(false)
  const [cachePrompt, setCachePrompt] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const zoneManuallyEdited = useRef(false)

  useEffect(() => {
    let active = true
    void loadZone().then(async (saved) => {
      if (!active) return
      if (!saved) {
        if (mapCenter && mapZoom !== null) setZone(newZoneFromViewport(mapCenter, mapZoom))
        return
      }
      zoneManuallyEdited.current = saved.viewportDefault === false

      if (saved.status === 'ready') {
        try {
          const { readOfflineIndex } = await import('../providers/offlineIndex')
          const tilesComplete = await hasCompleteOfflineTileCache(saved)
          if (!active) return
          if (!tilesComplete) {
            const incomplete = { ...saved, status: 'partial' as const, cachedTileCount: 0, cacheError: 'Some saved map tiles are missing. Refresh this zone to cache them again.' }
            setZone(incomplete)
            void saveZone(incomplete)
            return
          }
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

  useEffect(() => {
    const clearTiles = () => {
      setZone((current) => {
        if (!current) return current
        const incomplete: OfflineZone = {
          ...current,
          status: 'partial',
          cachedBytes: 0,
          cachedTileCount: 0,
          cachedTileUrls: [],
          cacheGeneration: undefined,
          indexedFeatureCount: undefined,
          cacheError: 'Offline map tiles were cleared. Refresh this zone to cache them again.',
        }
        void saveZone(incomplete)
        return incomplete
      })
    }
    window.addEventListener('offline-cache-cleared', clearTiles)
    return () => window.removeEventListener('offline-cache-cleared', clearTiles)
  }, [])

  useEffect(() => {
    const handleZoneDeleted = (event: Event) => {
      const zoneId = (event as CustomEvent<{ zoneId?: string }>).detail?.zoneId
      if (!zoneId) return
      setZone((current) => {
        if (current?.id !== zoneId) return current
        zoneManuallyEdited.current = false
        return null
      })
    }
    window.addEventListener('offline-zone-deleted', handleZoneDeleted)
    return () => window.removeEventListener('offline-zone-deleted', handleZoneDeleted)
  }, [])

  useEffect(() => {
    if (!mapCenter || mapZoom === null || zoneManuallyEdited.current) return
    const updated = followDefaultZone(zone, mapCenter, mapZoom)
    if (updated === zone) return
    if (zone && zone.status !== 'idle' && updated.id !== zone.id) setCachePrompt(true)
    void saveZone(updated)
    setZone(updated)
  }, [mapCenter, mapZoom, zone])

  const cacheZone = useCallback(async (
    fetchTile: Parameters<typeof runCache>[1]['fetchTile'],
    persistIndex: Parameters<typeof runCache>[1]['persistIndex'],
    enumerate?: Parameters<typeof runCache>[1]['enumerate'],
    tileUrl?: Parameters<typeof runCache>[1]['tileUrl'],
  ) => {
    if (!zone) return null
    setCachePrompt(false)
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setZone((current) => current ? { ...current, status: 'caching' } : current)
    const next = await runCache(zone, {
      enumerate,
      tileUrl,
      fetchTile,
      persistIndex,
      signal: controller.signal,
      onProgress: (value) => setProgress(value),
    })
    setZone((current) => {
      if (!current) return current
      const updated: OfflineZone = {
        ...current,
        status: next.status === 'cancelled' ? (current.cacheError ? current.status : 'idle') : next.status,
        cachedTileCount: next.status === 'ready' ? next.done : current.cachedTileCount,
        indexedFeatureCount: next.status === 'ready' ? next.indexedFeatures : current.indexedFeatureCount,
        cachedTileUrls: next.status === 'ready' ? next.tileUrls : current.cachedTileUrls,
        cacheGeneration: next.status === 'ready' ? next.cacheGeneration : current.cacheGeneration,
        cacheError: next.status === 'cancelled' ? current.cacheError : next.error,
      }
      void saveZone(updated)
      return updated
    })
    return next
  }, [zone])

  const cancelCache = useCallback(() => { abortRef.current?.abort() }, [])

  const reportCacheError = useCallback((error: unknown) => {
    setZone((current) => {
      if (!current) return current
      const failed: OfflineZone = {
        ...current,
        status: 'failed',
        cacheError: error instanceof Error ? error.message : 'Unable to cache offline zone',
      }
      void saveZone(failed)
      return failed
    })
  }, [])

  const replaceZone = useCallback(async (next: OfflineZone) => {
    zoneManuallyEdited.current = true
    setCachePrompt(false)
    const updatedZone = zone && zone.maxZoom === next.maxZoom
      ? replaceOfflineZoneBounds(zone, next.bounds) ?? { ...zone, status: 'failed', cacheError: 'Bounds must be valid longitude and latitude coordinates.' }
      : { ...next, label: 'Custom zone', viewportDefault: false, status: 'idle' as const, cachedTileCount: undefined, cachedTileUrls: undefined, cacheGeneration: undefined, indexedFeatureCount: undefined, cacheError: undefined, cachedBytes: 0 }
    setZone(updatedZone)
    try {
      await saveZoneStrict(updatedZone)
    } catch (error) {
      const failed: OfflineZone = {
        ...updatedZone,
        status: 'failed',
        cacheError: error instanceof Error ? error.message : 'Unable to save offline zone settings',
      }
      setZone(failed)
      void saveZone(failed)
    }
  }, [zone])

  return { zone, progress, cacheZone, cancelCache, replaceZone, editing, setEditing, reportCacheError, cachePrompt }
}

import type { CacheProgress } from '../providers/offlineCache'
import type { OfflineZone } from '../storage/offlineZones'

type Props = {
  zone: OfflineZone | null
  progress: CacheProgress | null
  onCache: () => void
  onCancel: () => void
}

export function ZoneControls({ zone, progress, onCache, onCancel }: Props) {
  if (!zone) return null
  const busy = zone.status === 'caching'
  const percent = progress && progress.total > 0 ? Math.round((progress.done + progress.failed) / progress.total * 100) : 0
  return (
    <div className="zone-controls">
      <span className="zone-label">Offline zone · zoom 0–{zone.maxZoom}</span>
      {busy
        ? <><span className="zone-progress-label">{progress ? `${percent}% · ${progress.done}/${progress.total} tiles · ${progress.featuresFound} features found` : 'Starting…'}</span><button type="button" className="zone-button zone-cancel" onClick={onCancel}>Cancel</button></>
        : <>
          {zone.status === 'ready' && <span className="zone-progress-label">{zone.cachedTileCount ?? 0} tiles fetched · {zone.indexedFeatureCount ?? 0} places indexed</span>}
          {zone.status === 'partial' && <span className="zone-progress-label">Incomplete · {zone.cachedTileCount ?? 0} tiles fetched · {zone.indexedFeatureCount ?? 0} places in previous index</span>}
          {zone.status === 'failed' && <span className="zone-progress-label" role="status">{zone.cacheError ?? 'Offline cache failed'}</span>}
          <button type="button" className="zone-button" onClick={onCache}>{zone.status === 'ready' ? 'Refresh cache' : 'Cache this zone'}</button>
        </>}
      {!busy && zone.status === 'partial' && zone.cacheError && <span className="zone-progress-label" role="status">{zone.cacheError}</span>}
    </div>
  )
}

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
        ? <><span className="zone-progress-label">{progress ? `${percent}% · ${progress.done}/${progress.total}` : 'Starting…'}</span><button type="button" className="zone-button zone-cancel" onClick={onCancel}>Cancel</button></>
        : <button type="button" className="zone-button" onClick={onCache}>{zone.status === 'ready' ? 'Refresh cache' : 'Cache this zone'}</button>}
    </div>
  )
}

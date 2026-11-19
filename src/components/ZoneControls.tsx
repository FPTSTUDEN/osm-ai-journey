import { useEffect, useState } from 'react'
import type { CacheProgress } from '../providers/offlineCache'
import type { OfflineZone } from '../storage/offlineZones'

type Props = {
  zone: OfflineZone | null
  progress: CacheProgress | null
  editing: boolean
  onCache: () => void
  onCancel: () => void
  onToggleEditing: (editing: boolean) => void
  onMaxZoomChange: (maxZoom: number) => void
  onBoundsChange: (bounds: OfflineZone['bounds']) => void
}

type BoundsDraft = [string, string, string, string]

function formatBounds(bounds: OfflineZone['bounds']): BoundsDraft {
  return [String(bounds[0]), String(bounds[1]), String(bounds[2]), String(bounds[3])]
}

export function ZoneControls({ zone, progress, editing, onCache, onCancel, onToggleEditing, onMaxZoomChange, onBoundsChange }: Props) {
  const [boundsDraft, setBoundsDraft] = useState<BoundsDraft>(() => zone ? formatBounds(zone.bounds) : ['0', '0', '0', '0'])
  const [boundsError, setBoundsError] = useState('')
  useEffect(() => {
    if (zone) setBoundsDraft(formatBounds(zone.bounds))
  }, [zone?.bounds.join(',')])

  if (!zone) return null
  const busy = zone.status === 'caching'
  const percent = progress && progress.total > 0 ? Math.round((progress.done + progress.failed) / progress.total * 100) : 0
  const [west, south, east, north] = zone.bounds
  const centerLng = (west + east) / 2
  const centerLat = (south + north) / 2
  const commitBound = (index: number) => {
    const draft = boundsDraft[index].trim()
    const value = draft ? Number(draft) : Number.NaN
    const bounds = [...zone.bounds] as OfflineZone['bounds']
    bounds[index] = value
    const [west, south, east, north] = bounds
    if (!Number.isFinite(value) || west < -180 || east > 180 || south < -85.05112878 || north > 85.05112878 || west >= east || south >= north) {
      setBoundsDraft(formatBounds(zone.bounds))
      setBoundsError('Bounds must be valid longitude and latitude coordinates.')
      return
    }
    setBoundsError('')
    onBoundsChange(bounds)
  }

  const boundLabels = ['West longitude', 'South latitude', 'East longitude', 'North latitude']
  return (
    <details className="zone-controls" open={editing || busy}>
      <summary className="zone-controls-summary"><strong>{zone.label}</strong><span>{centerLng.toFixed(4)}°, {centerLat.toFixed(4)}° · {busy ? 'Caching…' : zone.status === 'ready' ? `${zone.cachedTileCount ?? 0} tiles · ${zone.indexedFeatureCount ?? 0} places` : zone.status === 'partial' ? 'Cache incomplete' : zone.status === 'failed' ? 'Cache failed' : 'Ready to cache'}</span></summary>
      <div className="zone-controls-content">
        <div className="zone-toolbar-row"><strong className="zone-label">Zone selected for caching</strong>
          {!busy && <button type="button" className="zone-button" aria-pressed={editing} onClick={() => onToggleEditing(!editing)}>{editing ? 'Done editing' : 'Edit zone'}</button>}
        </div>
        <span className="zone-help">Center {centerLng.toFixed(5)}°, {centerLat.toFixed(5)}° · bounds {west.toFixed(5)}°, {south.toFixed(5)}° to {east.toFixed(5)}°, {north.toFixed(5)}°</span>
        {!busy && <label className="zone-zoom-control">Maximum zoom · {zone.maxZoom}
          <input aria-label="Maximum offline map zoom" type="range" min="0" max="16" step="1" value={zone.maxZoom} disabled={editing} onChange={(event) => onMaxZoomChange(Number(event.target.value))} />
        </label>}
        {editing && <>
          <div className="zone-bounds-grid">{boundLabels.map((label, index) => <label key={label}>{label}
            <input aria-label={label} type="text" inputMode="decimal" value={boundsDraft[index]} onChange={(event) => setBoundsDraft((current) => { const next = [...current] as BoundsDraft; next[index] = event.target.value; return next })} onBlur={() => commitBound(index)} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur() }} />
          </label>)}</div>
          <span className="zone-help">Drag the center or enter coordinates; drag a corner to resize.</span>
          {boundsError && <span className="zone-progress-label" role="status">{boundsError}</span>}
        </>}
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
    </details>
  )
}

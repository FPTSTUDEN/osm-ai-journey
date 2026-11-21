import { useEffect, useId, useRef, useState } from 'react'
import { MAP_LOOK_EFFECTS, MAP_LOOK_INFO, mapLookNotice } from '../providers/mapLook'
import type { MapLookState } from '../hooks/useMapLook'
import { Icon } from './Icon'

const PHASE_LABEL = { dawn: 'dawn', day: 'daytime', dusk: 'dusk', night: 'night' } as const

/** One switch per map effect, each with its description and, when relevant, why it is not fully showing. */
export function MapLookControls({ mapLook, compact = false }: { mapLook: MapLookState; compact?: boolean }) {
  const idPrefix = useId()
  return <div className={`map-look-controls ${compact ? 'map-look-controls-compact' : ''}`}>
    <ul>
      {MAP_LOOK_EFFECTS.map((effect) => {
        const info = MAP_LOOK_INFO[effect]
        const on = mapLook.look[effect]
        const notice = on ? mapLookNotice(effect, mapLook.context) : null
        const id = `${idPrefix}-${effect}`
        return <li key={effect} className={notice ? 'has-notice' : ''}>
          <input id={id} type="checkbox" role="switch" checked={on} onChange={(event) => mapLook.set(effect, event.target.checked)} aria-describedby={`${id}-description`} />
          <label htmlFor={id}>{info.label}</label>
          <p id={`${id}-description`}>
            {info.description}
            {info.online && <> <span className="map-look-online">{info.online}</span></>}
            {effect === 'timeTint' && on && <> <span className="map-look-status">Now: {PHASE_LABEL[mapLook.phase]}.</span></>}
            {notice && <> <span className="map-look-status">{notice}</span></>}
          </p>
        </li>
      })}
    </ul>
    <button type="button" className="map-look-reset" onClick={mapLook.reset} disabled={!mapLook.customised}>Reset to defaults</button>
  </div>
}

/** The Layers button in the map header and its popover. Escape or a click outside closes it. */
export function MapLayersButton({ mapLook }: { mapLook: MapLookState }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const popoverId = useId()

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  return <div className="map-layers" ref={rootRef} onKeyDown={(event) => {
    // Handled here so the global Escape handler does not also close the map panel.
    if (event.key !== 'Escape' || !open) return
    event.stopPropagation()
    event.nativeEvent.stopImmediatePropagation()
    setOpen(false)
    buttonRef.current?.focus()
  }}>
    <button ref={buttonRef} type="button" className="map-size-button map-layers-button" aria-expanded={open} aria-controls={popoverId} aria-label="Map look" title="Map look" onClick={() => setOpen((value) => !value)}><Icon name="layers" size={15} /></button>
    {open && <div id={popoverId} className="map-layers-popover" role="dialog" aria-label="Map look">
      <p className="eyebrow">Map look</p>
      <MapLookControls mapLook={mapLook} compact />
    </div>}
  </div>
}

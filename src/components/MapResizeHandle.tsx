import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent, PointerEvent } from 'react'

/** Keep in sync with the `--map-w` clamp in app.css ("Map width divider"). */
export const MAP_WIDTH_MIN = 320
const MAP_LEFT = 94
/** Map left edge, gap, and the narrowest dialogue box we allow (480px + 24px gap). */
const MAP_WIDTH_RESERVED = MAP_LEFT + 24 + 480 + 24
const SNAP_POINTS = [400, 560, 720]
const SNAP_DISTANCE = 12
const KEY_STEP = 24
const KEY_STEP_LARGE = 96

export function mapWidthMax(viewportWidth: number, rightInset: number) {
  return Math.max(MAP_WIDTH_MIN, Math.min(viewportWidth * 0.6, viewportWidth - rightInset - MAP_WIDTH_RESERVED))
}

export function clampMapWidth(width: number, max: number, snap = false) {
  const clamped = Math.round(Math.min(max, Math.max(MAP_WIDTH_MIN, width)))
  if (!snap) return clamped
  const near = SNAP_POINTS.find((point) => point <= max && Math.abs(point - clamped) <= SNAP_DISTANCE)
  return near ?? clamped
}

function readLimits(handle: HTMLElement) {
  const workspace = handle.closest('.workspace')
  // Above 900px the right inset is always a plain px value (24px, or the destination panel's width).
  const rightInset = workspace ? parseFloat(getComputedStyle(workspace).getPropertyValue('--right-inset')) || 24 : 24
  return { max: Math.round(mapWidthMax(window.innerWidth, rightInset)) }
}

type Props = {
  onCommit: (width: number | undefined) => void
}

/**
 * Divider on the right edge of the map column (story mode, wider than 900px). Drag, or focus it and use the
 * arrow keys, to change the map width; double-click or Enter returns to the default. While dragging, the width
 * is written straight to the `--map-width` custom property on the app shell, and saved once on release.
 */
export function MapResizeHandle({ onCommit }: Props) {
  const handleRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{ startX: number, startWidth: number, max: number, width: number, moved: boolean } | null>(null)
  const [value, setValue] = useState({ now: 0, max: 0 })

  function layoutWidth() {
    return handleRef.current?.parentElement?.getBoundingClientRect().width ?? 0
  }

  function measure() {
    const handle = handleRef.current
    if (!handle) return
    setValue({ now: Math.round(layoutWidth()), max: readLimits(handle).max })
  }

  useEffect(() => {
    const layout = handleRef.current?.parentElement
    if (!layout) return
    const observer = new ResizeObserver(measure)
    observer.observe(layout)
    return () => observer.disconnect()
  }, [])

  function preview(width: number) {
    const shell = handleRef.current?.closest<HTMLElement>('.app-shell')
    shell?.style.setProperty('--map-width', `${width}px`)
  }

  function endDrag() {
    document.documentElement.classList.remove('map-resizing')
    const current = drag.current
    drag.current = null
    if (current?.moved) onCommit(current.width)
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || !handleRef.current) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    const startWidth = layoutWidth()
    drag.current = { startX: event.clientX, startWidth, max: readLimits(handleRef.current).max, width: Math.round(startWidth), moved: false }
    document.documentElement.classList.add('map-resizing')
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const current = drag.current
    if (!current) return
    if (!current.moved && Math.abs(event.clientX - current.startX) < 3) return
    current.moved = true
    current.width = clampMapWidth(current.startWidth + event.clientX - current.startX, current.max, true)
    preview(current.width)
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const handle = handleRef.current
    if (!handle) return
    const { max } = readLimits(handle)
    const now = layoutWidth()
    const step = event.shiftKey ? KEY_STEP_LARGE : KEY_STEP
    let next: number | undefined
    if (event.key === 'ArrowLeft') next = now - step
    else if (event.key === 'ArrowRight') next = now + step
    else if (event.key === 'Home') next = MAP_WIDTH_MIN
    else if (event.key === 'End') next = max
    else if (event.key === 'Enter') {
      event.preventDefault()
      onCommit(undefined)
      return
    } else return
    event.preventDefault()
    onCommit(clampMapWidth(next, max))
  }

  return (
    <div
      ref={handleRef}
      className="map-resize-handle"
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize map"
      aria-controls="story-map-panel"
      aria-valuemin={MAP_WIDTH_MIN}
      aria-valuemax={value.max || undefined}
      aria-valuenow={value.now || undefined}
      tabIndex={0}
      title="Drag to resize the map · double-click to reset"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onLostPointerCapture={endDrag}
      onDoubleClick={() => onCommit(undefined)}
      onKeyDown={onKeyDown}
      onFocus={measure}
    ><span aria-hidden="true" /></div>
  )
}

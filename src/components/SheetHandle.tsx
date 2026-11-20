import { useRef } from 'react'

const CLOSE_DISTANCE = 56
const EXPAND_DISTANCE = 48

/**
 * Drag handle for side panels on phones, where they are top sheets. Dragging up closes the sheet;
 * dragging down toggles a taller snap height. Shown only at ≤520px (CSS); a plain click does nothing,
 * and the panel's × button stays the accessible way to close it.
 */
export function SheetHandle({ onClose }: { onClose: () => void }) {
  const drag = useRef<{ y: number; sheet: HTMLElement; id: number } | null>(null)

  function release(dy: number) {
    const current = drag.current
    drag.current = null
    if (!current) return
    current.sheet.style.transform = ''
    current.sheet.style.transition = ''
    if (dy < -CLOSE_DISTANCE) onClose()
    else if (dy > EXPAND_DISTANCE) current.sheet.dataset.sheet = current.sheet.dataset.sheet === 'tall' ? '' : 'tall'
  }

  return (
    <div
      className="sheet-handle"
      aria-hidden="true"
      onPointerDown={(event) => {
        const sheet = event.currentTarget.closest<HTMLElement>('.story-dock-panel')
        if (!sheet) return
        drag.current = { y: event.clientY, sheet, id: event.pointerId }
        event.currentTarget.setPointerCapture(event.pointerId)
        sheet.style.transition = 'none'
      }}
      onPointerMove={(event) => {
        const current = drag.current
        if (!current || current.id !== event.pointerId) return
        const dy = event.clientY - current.y
        // Follow the finger upward fully; resist downward so the sheet does not slide over the dialogue.
        current.sheet.style.transform = `translateY(${dy < 0 ? dy : dy * 0.35}px)`
      }}
      onPointerUp={(event) => release(event.clientY - (drag.current?.y ?? event.clientY))}
      onPointerCancel={() => release(0)}
    ><span /></div>
  )
}

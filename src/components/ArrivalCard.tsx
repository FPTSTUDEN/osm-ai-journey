import type { CSSProperties } from 'react'
import type { JourneyLeg } from '../types/domain'
import { travelKind, travelLabel } from './journeyMotion'

export type ArrivalCardState = {
  placeName: string
  leg: JourneyLeg | null
  /** Draw the from → to strip in the card (the map panel is closed, so the move is not shown on the map). */
  showStrip: boolean
  durationMs: number
}

export const ARRIVAL_CARD_MS = 2600
export const ARRIVAL_CARD_WITH_STRIP_MS = 3400

type ArrivalCardProps = ArrivalCardState & { sceneNumber: number }

/**
 * Chapter card: the place name fades in letter by letter, holds, then shrinks up into the scene label at the
 * top of the stage (see `.scene-label`). With the map closed it also draws the move as a small strip.
 */
export function ArrivalCard({ placeName, leg, showStrip, durationMs, sceneNumber }: ArrivalCardProps) {
  const kind = leg ? travelKind(leg) : 'arrive'
  const label = leg ? travelLabel(leg) : ''
  const letters = Array.from(placeName)
  const letterStep = Math.min(28, 700 / Math.max(1, letters.length))
  return (
    <div className="arrival-card" role="status" aria-live="polite" style={{ '--card-ms': `${durationMs}ms` } as CSSProperties}>
      <span className="sr-only">You arrive at {placeName}.</span>
      <p className="eyebrow" aria-hidden="true">Scene {String(sceneNumber).padStart(2, '0')}</p>
      <strong className="arrival-card-title" aria-hidden="true">
        {letters.map((letter, index) => <span key={index} style={{ animationDelay: `${180 + index * letterStep}ms` }}>{letter === ' ' ? '\u00a0' : letter}</span>)}
      </strong>
      {showStrip && leg?.from && kind !== 'arrive' && <div className={`arrival-strip arrival-strip-${kind === 'routed' ? 'routed' : 'sketch'}`} aria-hidden="true">
        <span className="arrival-strip-place">{leg.from.name}</span>
        <span className="arrival-strip-track"><i /></span>
        <span className="arrival-strip-place arrival-strip-to">{leg.to.name}</span>
      </div>}
      {label && <p className="arrival-card-meta" aria-hidden="true">{label}</p>}
    </div>
  )
}

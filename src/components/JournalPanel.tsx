import { SheetHandle } from './SheetHandle'
import type { JourneyLeg, NarrativeEvent } from '../types/domain'

type JournalPanelProps = {
  events: NarrativeEvent[]
  legs: JourneyLeg[]
  isOpen: boolean
  onClose: () => void
  onFitJourney?: () => void
}

export function JournalPanel({ events, legs, isOpen, onClose, onFitJourney }: JournalPanelProps) {
  return (
    <aside id="story-travelogue-panel" aria-hidden={!isOpen} inert={!isOpen} className={`story-dock-panel travelogue-panel ${isOpen ? 'story-panel-open' : 'story-panel-closing'}`} role="complementary" aria-labelledby="journal-panel-label">
      <span id="journal-panel-label" className="sr-only">Journal panel</span>
      <div className="story-dock-header">
        <div><p className="eyebrow">Journey journal</p><h3 id="journal-panel-heading">Journal</h3></div>
        <button className="close-button" type="button" onClick={onClose} aria-label="Close journal panel">×</button>
      </div>
      {legs.length > 0 && <section className="journey-legs" aria-label="Journey legs">
        <div className="journey-legs-heading">
          <p className="eyebrow">Journey so far</p>
          {onFitJourney && <button type="button" className="journey-fit-button" onClick={onFitJourney}>Fit map</button>}
        </div>
        <ol className="journey-legs-list">
          {legs.map((leg, index) => <li key={leg.id} className={index === legs.length - 1 ? 'journey-leg journey-leg-current' : 'journey-leg'}>
            <span className="journey-leg-marker" aria-hidden="true">{index + 1}</span>
            <div>
              <strong>{leg.to.name}</strong>
              <p>{leg.from ? `${leg.from.name} → ${leg.to.name}` : `Arrived at ${leg.to.name}`} · {leg.routed ? 'routed' : 'unrouted'}</p>
              {leg.routed && <p className="journey-leg-meta">{leg.distanceMeters ? `${(leg.distanceMeters / 1000).toFixed(1)} km` : ''}{leg.durationSeconds ? ` · ${Math.round(leg.durationSeconds / 60)} min` : ''}</p>}
            </div>
          </li>)}
        </ol>
      </section>}
      {events.length === 0
        ? <p className="dock-empty">Arrivals and story beats will appear here.</p>
        : <ol className="travelogue-events">{events.slice().reverse().map((event) => <li key={event.id}><span className="timeline-dot" aria-hidden="true" /><div><strong>{event.type.replaceAll('-', ' ')}</strong><p>{event.text}</p><time dateTime={event.createdAt}>{new Date(event.createdAt).toLocaleString()}</time></div></li>)}</ol>}
      <SheetHandle onClose={onClose} />
    </aside>
  )
}

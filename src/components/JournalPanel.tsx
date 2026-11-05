import type { NarrativeEvent } from '../types/domain'

type JournalPanelProps = {
  events: NarrativeEvent[]
  onClose: () => void
}

export function JournalPanel({ events, onClose }: JournalPanelProps) {
  return (
    <aside id="story-travelogue-panel" className="story-dock-panel travelogue-panel" role="complementary" aria-labelledby="journal-panel-label">
      <span id="journal-panel-label" className="sr-only">Journal panel</span>
      <div className="story-dock-header">
        <div><p className="eyebrow">Journey journal</p><h3 id="journal-panel-heading">Journal</h3></div>
        <button className="close-button" type="button" onClick={onClose} aria-label="Close journal panel">×</button>
      </div>
      {events.length === 0
        ? <p className="dock-empty">Arrivals and story beats will appear here.</p>
        : <ol className="travelogue-events">{events.slice().reverse().map((event) => <li key={event.id}><span className="timeline-dot" aria-hidden="true" /><div><strong>{event.type.replaceAll('-', ' ')}</strong><p>{event.text}</p><time dateTime={event.createdAt}>{new Date(event.createdAt).toLocaleString()}</time></div></li>)}</ol>}
    </aside>
  )
}

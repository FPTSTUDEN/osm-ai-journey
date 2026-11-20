import { useEffect, useRef, useState } from 'react'
import { CHIP_FILTER_IDS, distanceLabel, placeFilterById, type PlaceFilter } from '../providers/placeFilters'
import { areaTooLarge } from '../providers/overpassArea'
import type { PlaceHighlight } from '../hooks/usePlaceHighlight'
import type { Place } from '../types/domain'

const CHIPS = CHIP_FILTER_IDS.map((id) => placeFilterById(id)).filter((filter): filter is PlaceFilter => Boolean(filter))
const LIST_LIMIT = 40

type Props = {
  highlight: PlaceHighlight
  /** Where distances are measured from, for the header ("nearest to Trevi Fountain"). */
  originName: string | null
  liveDataEnabled: boolean
  onChoosePlace: (place: Place) => void
}

function categoryText(place: Place) {
  return (place.subcategory ?? place.category ?? 'place').replace(/_/g, ' ')
}

/** Chips over the map to highlight a kind of place, and the list of matches in view, nearest first. */
export function PlaceHighlightPanel({ highlight, originName, liveDataEnabled, onChoosePlace }: Props) {
  const { filter, suggestedBy, inView, area, focusId } = highlight
  // Phones have little map height: start with the list folded.
  const [listOpen, setListOpen] = useState(() => !window.matchMedia('(max-width: 520px)').matches)
  const listRef = useRef<HTMLOListElement>(null)
  const pointerFocus = useRef(false)

  // A pin hovered on the map: bring its row into view (rows hovered in the list are already visible).
  useEffect(() => {
    if (!focusId || pointerFocus.current) return
    listRef.current?.querySelector<HTMLElement>(`[data-place-id="${CSS.escape(focusId)}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [focusId])

  const toggle = (next: PlaceFilter) => highlight.select(filter?.id === next.id ? null : next)
  const areaForFilter = filter && 'filterId' in area && area.filterId === filter.id ? area : null
  const tooLarge = highlight.bounds ? areaTooLarge(highlight.bounds) : false
  const shown = inView.slice(0, LIST_LIMIT)

  return <div className={`map-filters ${filter ? 'map-filters-active' : ''}`}>
    <div className="map-filter-chips" role="toolbar" aria-label="Highlight places on the map">
      {CHIPS.map((chip) => <button key={chip.id} type="button" aria-pressed={filter?.id === chip.id} onClick={() => toggle(chip)}>{chip.label}</button>)}
      {filter && !CHIPS.some((chip) => chip.id === filter.id) && <button type="button" aria-pressed="true" onClick={highlight.clear}>{filter.label}</button>}
    </div>
    {filter && <section className="map-highlight-panel" aria-label={`${filter.label} highlighted on the map`}>
      <header>
        <div>
          <strong role="status">{inView.length} {filter.noun} in view</strong>
          <span>{suggestedBy ? `Suggested by ${suggestedBy}` : highlight.usedAreaSearch ? 'Map data and OpenStreetMap search' : 'Places shown on the map'}{inView.length > 0 && originName ? ` · nearest to ${originName}` : ''}</span>
        </div>
        {inView.length > 0 && <button type="button" className="map-highlight-toggle" aria-expanded={listOpen} onClick={() => setListOpen((open) => !open)}>{listOpen ? 'Hide' : 'List'}</button>}
        <button type="button" className="close-button" aria-label={`Stop highlighting ${filter.noun}`} onClick={highlight.clear}>×</button>
      </header>
      {listOpen && shown.length > 0 && <ol ref={listRef}>
        {shown.map(({ place, meters }) => <li key={place.id}>
          <button
            type="button"
            data-place-id={place.id}
            className={focusId === place.id ? 'is-focus' : ''}
            onMouseEnter={() => { pointerFocus.current = true; highlight.setFocusId(place.id) }}
            onMouseLeave={() => { pointerFocus.current = false; highlight.setFocusId(null) }}
            onFocus={() => highlight.setFocusId(place.id)}
            onBlur={() => highlight.setFocusId(null)}
            onClick={() => onChoosePlace(place)}
          ><strong>{place.name}</strong><span>{categoryText(place)}{originName || meters ? ` · ${distanceLabel(meters)}` : ''}</span></button>
        </li>)}
        {inView.length > shown.length && <li className="map-highlight-more">{inView.length - shown.length} more in view. Zoom in to narrow the list.</li>}
      </ol>}
      {inView.length === 0 && <p className="map-highlight-empty">None in the map data here yet. The map only lists some places at each zoom level{liveDataEnabled ? '; search this area for all of them.' : '. Zoom in or pan.'}</p>}
      <footer>
        {!liveDataEnabled && <p>Showing places on the map only. Turn on optional live data in Settings to search all of OpenStreetMap here.</p>}
        {liveDataEnabled && areaForFilter?.state === 'loading' && <p role="status">Searching OpenStreetMap…</p>}
        {liveDataEnabled && areaForFilter?.state === 'error' && <p role="alert">{areaForFilter.message} <button type="button" onClick={() => void highlight.searchArea()}>Try again</button></p>}
        {liveDataEnabled && areaForFilter?.state === 'ready' && <p>OpenStreetMap search · {areaForFilter.result.source}{areaForFilter.result.truncated ? ' · first 300 results' : ''}</p>}
        {liveDataEnabled && areaForFilter?.state !== 'loading' && <button type="button" className="map-highlight-search" disabled={tooLarge || !highlight.bounds} onClick={() => void highlight.searchArea()}>{tooLarge ? 'Zoom in to search this area' : areaForFilter?.state === 'ready' ? 'Search this area again' : 'Search this area'}</button>}
      </footer>
    </section>}
  </div>
}

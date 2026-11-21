import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { distanceMeters, inBounds, mergePlaces, placeMatchesFilter, type MapBounds, type PlaceFilter } from '../providers/placeFilters'
import type { AreaSearchResult } from '../providers/overpassArea'
import type { Coordinates, Place, UserSettings } from '../types/domain'

const NO_PLACES: Place[] = []

export type HighlightMatch = { place: Place; meters: number }

type AreaState =
  | { state: 'idle' }
  | { state: 'loading'; filterId: string }
  | { state: 'ready'; filterId: string; result: AreaSearchResult }
  | { state: 'error'; filterId: string; message: string }

type Options = {
  /** Every named place in the loaded map tiles (`useMapSearch().places`). */
  loadedPlaces: Place[]
  /** Distances are measured from here: the current place, else the map centre. */
  origin: Coordinates | null
  settings: Pick<UserSettings, 'liveDataEnabled' | 'overpassApiUrl'>
}

/**
 * Map highlights for one kind of place ("Cafés", "restaurants"). Matches come from the loaded map data, plus an
 * explicit "Search this area" Overpass lookup. Session only: nothing here is saved with the journey.
 */
export function usePlaceHighlight({ loadedPlaces, origin, settings }: Options) {
  const [filter, setFilter] = useState<PlaceFilter | null>(null)
  /** Persona name when the companion suggested this highlight. */
  const [suggestedBy, setSuggestedBy] = useState<string | null>(null)
  const [bounds, setBounds] = useState<MapBounds | null>(null)
  const [focusId, setFocusId] = useState<string | null>(null)
  const [area, setArea] = useState<AreaState>({ state: 'idle' })
  const abort = useRef<AbortController | null>(null)

  const select = useCallback((next: PlaceFilter | null, by: string | null = null) => {
    abort.current?.abort()
    abort.current = null
    setFilter(next)
    setSuggestedBy(next ? by : null)
    setFocusId(null)
    setArea((current) => next && 'filterId' in current && current.filterId === next.id && current.state !== 'loading' ? current : { state: 'idle' })
  }, [])
  const clear = useCallback(() => select(null), [select])

  useEffect(() => () => abort.current?.abort(), [])

  const searchArea = useCallback(async () => {
    if (!filter || !bounds || !settings.liveDataEnabled) return
    abort.current?.abort()
    const controller = new AbortController()
    abort.current = controller
    setArea({ state: 'loading', filterId: filter.id })
    try {
      const { fetchAreaPlaces } = await import('../providers/overpassArea')
      const result = await fetchAreaPlaces(filter, bounds, settings.overpassApiUrl, controller.signal)
      if (abort.current === controller) setArea({ state: 'ready', filterId: filter.id, result })
    } catch (error) {
      if (controller.signal.aborted) return
      setArea({ state: 'error', filterId: filter.id, message: error instanceof Error ? error.message : 'OpenStreetMap search failed.' })
    } finally {
      if (abort.current === controller) abort.current = null
    }
  }, [bounds, filter, settings.liveDataEnabled, settings.overpassApiUrl])

  const areaPlaces = filter && area.state === 'ready' && area.filterId === filter.id ? area.result.places : NO_PLACES
  /** Every match known (loaded tiles plus any area search), drawn on the map even outside the view. */
  const allMatches = useMemo(() => {
    if (!filter) return []
    // Area results came from this filter's own Overpass query, so they are not filtered again.
    return mergePlaces(loadedPlaces.filter((place) => placeMatchesFilter(place, filter)), areaPlaces)
  }, [areaPlaces, filter, loadedPlaces])
  /** Matches in the current view, nearest first. */
  const inView = useMemo<HighlightMatch[]>(() => {
    const visible = bounds ? allMatches.filter((place) => inBounds(place.coordinates, bounds)) : allMatches
    return visible
      .map((place) => ({ place, meters: origin ? distanceMeters(origin, place.coordinates) : 0 }))
      .sort((a, b) => a.meters - b.meters || a.place.name.localeCompare(b.place.name))
  }, [allMatches, bounds, origin])

  return { filter, suggestedBy, select, clear, bounds, setBounds, focusId, setFocusId, area, searchArea, allMatches, inView, usedAreaSearch: areaPlaces.length > 0 }
}

export type PlaceHighlight = ReturnType<typeof usePlaceHighlight>

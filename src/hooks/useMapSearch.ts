import { useEffect, useMemo, useState } from 'react'
import { searchLocalPlaces } from '../providers/localPlaceIndex'
import type { Place, UserSettings } from '../types/domain'
import type { StoryPanel } from './useStoryPanels'

type UseMapSearchOptions = {
  geocoder: UserSettings['onlineGeocoder']
  mapOpen: boolean
  toggleStoryPanel: (panel: StoryPanel) => void
  onChoosePlace: (place: Place) => void
  onQueryChanged: () => void
}

export function useMapSearch({ geocoder, mapOpen, toggleStoryPanel, onChoosePlace, onQueryChanged }: UseMapSearchOptions) {
  const [places, setPlaces] = useState<Place[]>([])
  const [query, setQuery] = useState('')
  const [mapStatus, setMapStatus] = useState<'loading' | 'ready' | 'unavailable'>('loading')
  const [onlineResults, setOnlineResults] = useState<Place[]>([])
  const [onlineQuery, setOnlineQuery] = useState('')
  const [onlineState, setOnlineState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [onlineCached, setOnlineCached] = useState(false)
  const [onlineError, setOnlineError] = useState('')

  useEffect(() => {
    if (!mapOpen) setMapStatus('loading')
  }, [mapOpen])

  const localResults = useMemo(() => searchLocalPlaces(places, query), [places, query])

  function updateQuery(value: string) {
    setQuery(value)
    setOnlineResults([])
    setOnlineQuery('')
    setOnlineState('idle')
    setOnlineError('')
    onQueryChanged()
  }

  function openMapForSearch() {
    if (!query.trim()) return
    if (!mapOpen) toggleStoryPanel('map')
  }

  async function searchOnline(term = query, selectFirst = false) {
    const trimmed = term.trim()
    if (!trimmed) return
    setOnlineQuery(trimmed)
    setOnlineState('loading')
    setOnlineError('')
    try {
      const { searchOnlinePlaces } = await import('../providers/geocoder')
      const response = await searchOnlinePlaces(trimmed, geocoder)
      setOnlineResults(response.places)
      setOnlineCached(response.cached)
      setOnlineState('ready')
      if (selectFirst && response.places[0]) onChoosePlace(response.places[0])
    } catch (error) {
      setOnlineResults([])
      setOnlineState('error')
      setOnlineError(error instanceof Error ? error.message : 'Online search failed')
    }
  }

  function searchOnlineShortcut(placeName: string) {
    updateQuery(placeName)
    if (!mapOpen) toggleStoryPanel('map')
    void searchOnline(placeName, true)
  }

  function clearSearch() {
    updateQuery('')
  }

  return {
    places,
    setPlaces,
    query,
    updateQuery,
    mapStatus,
    setMapStatus,
    localResults,
    onlineResults,
    onlineQuery,
    onlineState,
    onlineCached,
    onlineError,
    searchOnline: () => searchOnline(),
    searchOnlineShortcut,
    openMapForSearch,
    clearSearch,
  }
}

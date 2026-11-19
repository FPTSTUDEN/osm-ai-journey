import { useEffect, useMemo, useState } from 'react'
import { searchLocalPlaces } from '../providers/localPlaceIndex'
import type { OfflineZone } from '../storage/offlineZones'
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
  const [offlineZone, setOfflineZoneState] = useState<OfflineZone | null>(null)
  const [offlineResults, setOfflineResults] = useState<Place[]>([])
  const [offlineIndexState, setOfflineIndexState] = useState<'idle' | 'loading' | 'ready' | 'empty' | 'not-indexed' | 'unavailable'>('idle')
  const [offlineIndexError, setOfflineIndexError] = useState('')

  useEffect(() => {
    if (!mapOpen) setMapStatus('loading')
  }, [mapOpen])

  useEffect(() => {
    let active = true
    void import('../storage/offlineZones').then(({ loadZone }) => loadZone()).then((zone) => {
      if (active) setOfflineZoneState(zone)
    })
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!query.trim()) {
      setOfflineResults([])
      setOfflineIndexState('idle')
      return
    }
    if (!offlineZone) {
      setOfflineResults([])
      setOfflineIndexState('not-indexed')
      return
    }
    let active = true
    setOfflineIndexState('loading')
    setOfflineIndexError('')
    void import('../providers/offlineIndex').then(({ searchOfflineIndex }) => searchOfflineIndex(offlineZone, query)).then((result) => {
      if (!active) return
      setOfflineResults(result.places)
      setOfflineIndexState(result.source === 'offline-index' ? 'ready' : result.source)
      setOfflineIndexError(result.error ?? '')
    }).catch((error: unknown) => {
      if (!active) return
      setOfflineResults([])
      setOfflineIndexState('unavailable')
      setOfflineIndexError(error instanceof Error ? error.message : 'Unable to read the offline place index')
    })
    return () => { active = false }
  }, [offlineZone, query])

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
    offlineResults,
    offlineIndexState,
    offlineIndexError,
    offlineZone,
    setOfflineZone: setOfflineZoneState,
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

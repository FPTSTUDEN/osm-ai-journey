import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
const MapCanvas = lazy(() => import('./components/MapCanvas').then((module) => ({ default: module.MapCanvas })))
import type { PlaceContext } from './providers/enrichment'
import { LLM_PROVIDER_PRESETS } from './providers/config'
import { searchLocalPlaces } from './providers/localPlaceIndex'
import { fetchCurrentWeather, weatherLabel, type WeatherResult } from './providers/weather'
import { deleteActiveJourney, loadActiveJourney, saveActiveJourney } from './storage/journey'
import { clearOfflineCache, getOfflineCacheStatus, type OfflineCacheStatus } from './storage/offlineCache'
import { loadSettings, saveSettings } from './storage/settings'
import { journeyJson, parseJourneyJson } from './storage/journeyTransfer'
import { newEntry, starterEntries, STARTER_MESSAGE } from './storage/messages'
import type { ChatEntry, JourneyState, MapViewport, NarrativeEvent, Place, PlacePhoto, UserSettings, WalkingRoute } from './types/domain'
import './styles/app.css'

type StoryPanel = 'map' | 'destination' | 'travelogue'

function newEvent(type: NarrativeEvent['type'], text: string, placeId?: string): NarrativeEvent {
  return { id: crypto.randomUUID(), type, createdAt: new Date().toISOString(), text, placeId }
}

function emptyJourney(): JourneyState {
  return { id: 'active', currentDestination: null, mapViewport: null, destinationHistory: [], currentScene: 1, messages: starterEntries(), knownPeople: [], knownEntities: [], userFacts: [], narrativeEvents: [], conversationSummary: '' }
}

function photoToPlace(photo: PlacePhoto, fallback: Place): Place {
  // Convert photo to a temporary Place for map display
  // Use photo's actual coordinates if available, otherwise use destination as fallback
  return {
    id: `photo-${photo.id}`,
    name: photo.title,
    category: 'Photo Location',
    coordinates: photo.photoCoordinates || fallback.coordinates,
    source: 'map',
  }
}

function App() {
  const [settings, setSettings] = useState<UserSettings>(loadSettings)
  const [places, setPlaces] = useState<Place[]>([])
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null)
  const [mapViewport, setMapViewport] = useState<MapViewport | null>(null)
  const [query, setQuery] = useState('')
  const [message, setMessage] = useState('')
  const [messages, setMessages] = useState<ChatEntry[]>(starterEntries)
  const [showSettings, setShowSettings] = useState(false)
  const [mapStatus, setMapStatus] = useState<'loading' | 'ready' | 'unavailable'>('loading')
  const [onlineResults, setOnlineResults] = useState<Place[]>([])
  const [onlineQuery, setOnlineQuery] = useState('')
  const [onlineState, setOnlineState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [onlineCached, setOnlineCached] = useState(false)
  const [onlineError, setOnlineError] = useState('')
  const [placeContext, setPlaceContext] = useState<PlaceContext | null>(null)
  const [contextState, setContextState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [contextCached, setContextCached] = useState(false)
  const [destinationPhotos, setDestinationPhotos] = useState<PlacePhoto[]>([])
  const [photosState, setPhotosState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [photosCached, setPhotosCached] = useState(false)
  const [destinationHistory, setDestinationHistory] = useState<Place[]>([])
  const [currentScene, setCurrentScene] = useState(1)
  const [narrativeEvents, setNarrativeEvents] = useState<NarrativeEvent[]>([])
  const [knownPeople, setKnownPeople] = useState<string[]>([])
  const [knownEntities, setKnownEntities] = useState<string[]>([])
  const [userFacts, setUserFacts] = useState<string[]>([])
  const [journeyItem, setJourneyItem] = useState({ people: '', entities: '', facts: '' })
  const [journeyReady, setJourneyReady] = useState(false)
  const [conversationSummary, setConversationSummary] = useState('')
  const [summaryMessageCount, setSummaryMessageCount] = useState(0)
  const [summaryState, setSummaryState] = useState<'idle' | 'loading'>('idle')
  const [llmState, setLlmState] = useState<'idle' | 'loading' | 'error'>('idle')
  const [llmError, setLlmError] = useState('')
  const [connectionState, setConnectionState] = useState<'idle' | 'testing' | 'ready' | 'error'>('idle')
  const [connectionMessage, setConnectionMessage] = useState('')
  const [route, setRoute] = useState<WalkingRoute | null>(null)
  const [pendingDestination, setPendingDestination] = useState<Place | null>(null)
  const [routeState, setRouteState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [routeMessage, setRouteMessage] = useState('')
  const [weather, setWeather] = useState<WeatherResult | null>(null)
  const [weatherState, setWeatherState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [weatherError, setWeatherError] = useState('')
  const [offlineStatus, setOfflineStatus] = useState<OfflineCacheStatus | null>(null)
  const [journeyTransferMessage, setJourneyTransferMessage] = useState('')
  const [journeyTransferError, setJourneyTransferError] = useState('')
  const [selectedPhoto, setSelectedPhoto] = useState<PlacePhoto | null>(null)
  const [showCompanion, setShowCompanion] = useState(false)
  const [storyMode, setStoryMode] = useState(true)
  const [storyPanels, setStoryPanels] = useState<StoryPanel[]>([])
  const [fieldNotesOpen, setFieldNotesOpen] = useState(false)
  const [arrivalCard, setArrivalCard] = useState<string | null>(null)
  const importInputRef = useRef<HTMLInputElement>(null)
  const arrivalTimer = useRef<number | undefined>(undefined)
  const chatAbort = useRef<AbortController | null>(null)

  useEffect(() => () => { window.clearTimeout(arrivalTimer.current); chatAbort.current?.abort() }, [])

  useEffect(() => {
    saveSettings(settings)
  }, [settings])

  useEffect(() => {
    if (!showSettings) return
    void getOfflineCacheStatus().then(setOfflineStatus)
  }, [showSettings])

  useEffect(() => {
    void loadActiveJourney().then((journey) => {
      const restored = journey ?? emptyJourney()
      setSelectedPlace(restored.currentDestination)
      setMapViewport(restored.mapViewport ?? null)
      setDestinationHistory(restored.destinationHistory)
      setCurrentScene(restored.currentScene)
      setMessages(restored.messages.length ? restored.messages : starterEntries())
      setNarrativeEvents(restored.narrativeEvents)
      setKnownPeople(restored.knownPeople)
      setKnownEntities(restored.knownEntities)
      setUserFacts(restored.userFacts)
      setConversationSummary(restored.conversationSummary ?? '')
      setSummaryMessageCount(restored.messages.length)
      setJourneyReady(true)
    })
  }, [])

  useEffect(() => {
    if (!journeyReady) return
    // Debounced: streaming replies change `messages` on every token and the map reports viewport changes.
    const timer = window.setTimeout(() => {
      void saveActiveJourney({
        id: 'active',
        currentDestination: selectedPlace,
        mapViewport,
        destinationHistory,
        currentScene,
        messages,
        knownPeople,
        knownEntities,
        userFacts,
        narrativeEvents,
        conversationSummary,
      })
    }, 400)
    return () => window.clearTimeout(timer)
  }, [conversationSummary, currentScene, destinationHistory, journeyReady, knownEntities, knownPeople, mapViewport, messages, narrativeEvents, selectedPlace, userFacts])

  useEffect(() => {
    if (!journeyReady || summaryState === 'loading' || messages.length < 12 || messages.length - summaryMessageCount < 8) return
    setSummaryState('loading')
    void import('./providers/context').then(({ buildSummaryMessages }) => import('./providers/llm').then(({ completeChat }) => completeChat({ baseUrl: settings.llmBaseUrl, model: settings.llmModel, apiKey: settings.llmApiKey }, buildSummaryMessages(messages)))).then((summary) => {
      setConversationSummary(summary)
      setSummaryMessageCount(messages.length)
      setSummaryState('idle')
    }).catch(() => {
      setSummaryMessageCount(messages.length)
      setSummaryState('idle')
    })
  }, [journeyReady, messages, settings, summaryMessageCount, summaryState])

  useEffect(() => {
    let active = true
    setSelectedPhoto(null)
    if (!selectedPlace) {
      setPlaceContext(null)
      setContextState('idle')
      setWeather(null)
      setWeatherState('idle')
      setDestinationPhotos([])
      setPhotosState('idle')
      return () => { active = false }
    }

    setWeather(null)
    setWeatherState('idle')
    setDestinationPhotos([])
    setPhotosState('loading')
    void import('./providers/photos').then(({ fetchPlacePhotos }) => fetchPlacePhotos(selectedPlace)).then((response) => {
      if (!active) return
      setDestinationPhotos(response.photos)
      setPhotosCached(response.cached)
      setPhotosState('ready')
    }).catch(() => {
      if (active) setPhotosState('error')
    })

    setContextState('loading')
    void import('./providers/enrichment').then(({ enrichPlace }) => enrichPlace(selectedPlace)).then((response) => {
      if (!active) return
      setPlaceContext(response.context)
      setContextCached(response.cached)
      setContextState('ready')
    }).catch(() => {
      if (active) setContextState('error')
    })
    return () => { active = false }
  }, [selectedPlace])

  const localResults = useMemo(() => searchLocalPlaces(places, query), [places, query])
  // Stable identity: MapCanvas re-centers whenever this object changes, so it must not be recreated on every render.
  const mapPlace = useMemo(
    () => (selectedPhoto && selectedPlace ? photoToPlace(selectedPhoto, selectedPlace) : selectedPlace),
    [selectedPhoto, selectedPlace],
  )

  async function completeTransition(place: Place, withRoute: boolean) {
    const origin = selectedPlace
    let walkingRoute: WalkingRoute | null = null
    setPendingDestination(null)
    setRouteMessage('')
    if (withRoute && origin) {
      setRouteState('loading')
      try {
        const { calculateWalkingRoute } = await import('./providers/routing')
        walkingRoute = await calculateWalkingRoute(origin, place, { baseUrl: settings.routingBaseUrl })
        setRoute(walkingRoute)
        setRouteState('ready')
      } catch (error) {
        setRoute(null)
        setRouteState('error')
        setRouteMessage(error instanceof Error ? error.message : 'Walking route unavailable')
      }
    } else {
      setRoute(null)
      setRouteState('idle')
    }
    setSelectedPlace(place)
    setArrivalCard(place.name)
    window.clearTimeout(arrivalTimer.current)
    arrivalTimer.current = window.setTimeout(() => setArrivalCard(null), 2600)
    setQuery('')
    setOnlineResults([])
    setOnlineState('idle')
    setDestinationHistory((current) => current.some((item) => item.id === place.id) ? current : [...current, place])
    setCurrentScene((current) => current + 1)
    const arrival = `You arrive at ${place.name}.`
    const eventType = walkingRoute ? 'routed-transition' : 'unrouted-transition'
    const eventText = walkingRoute ? `${arrival} Walking route calculated.` : `${arrival} Continuing without a walking route.`
    // Append the arrival; only the untouched starter line is replaced. The old code overwrote the last real message.
    setMessages((current) => current.length === 1 && current[0].text === STARTER_MESSAGE ? [newEntry('event', eventText)] : [...current, newEntry('event', eventText)])
    setNarrativeEvents((current) => [...current, newEvent(eventType, eventText, place.id)])
  }

  function choosePlace(place: Place) {
    if (selectedPlace && selectedPlace.id !== place.id && settings.calculateWalkingRoutes) {
      setPendingDestination(place)
      setRouteState('idle')
      setRouteMessage('')
      return
    }
    void completeTransition(place, false)
  }

  function updateQuery(value: string) {
    setQuery(value)
    setOnlineResults([])
    setOnlineQuery('')
    setOnlineState('idle')
    setPendingDestination(null)
    setOnlineError('')
  }

  async function searchOnline() {
    const trimmed = query.trim()
    if (!trimmed) return
    setOnlineQuery(trimmed)
    setOnlineState('loading')
    setOnlineError('')
    try {
      const { searchOnlinePlaces } = await import('./providers/geocoder')
      const response = await searchOnlinePlaces(trimmed, settings.onlineGeocoder)
      setOnlineResults(response.places)
      setOnlineCached(response.cached)
      setOnlineState('ready')
    } catch (error) {
      setOnlineResults([])
      setOnlineState('error')
      setOnlineError(error instanceof Error ? error.message : 'Online search failed')
    }
  }

  async function loadWeather(force = false) {
    if (!selectedPlace || !settings.liveDataEnabled) return
    setWeatherState('loading')
    setWeatherError('')
    try {
      const result = await fetchCurrentWeather(selectedPlace, settings.weatherBaseUrl, force)
      setWeather(result)
      setWeatherState('ready')
    } catch (error) {
      setWeatherState('error')
      setWeatherError(error instanceof Error ? error.message : 'Weather is unavailable')
    }
  }

  function sendMessage(event: React.FormEvent) {
    event.preventDefault()
    const trimmed = message.trim()
    if (!trimmed || llmState === 'loading') return
    const history = messages
    const reply = newEntry('assistant', '')
    setMessages((current) => [...current, newEntry('user', trimmed)])
    setNarrativeEvents((current) => [...current, newEvent('message', trimmed)])
    setMessage('')
    setLlmState('loading')
    setLlmError('')
    chatAbort.current?.abort()
    const controller = new AbortController()
    chatAbort.current = controller
    let assistantStarted = false
    void import('./providers/context').then(({ buildJourneyContext }) => {
      const chatMessages = buildJourneyContext({ settings, selectedPlace, messages: history, userMessage: trimmed, liveWeather: weather ? `${weatherLabel(weather.data.weatherCode)}, ${weather.data.temperatureC}°C, ${weather.source}` : undefined, destinationPhotos: selectedPhoto ? [selectedPhoto] : [], placeContext: contextState === 'ready' ? placeContext : null, placeContextCached: contextCached, journey: { destinationHistory, currentScene, knownPeople, knownEntities, userFacts, conversationSummary } })
      return import('./providers/llm').then(({ streamChat }) => streamChat({ baseUrl: settings.llmBaseUrl, model: settings.llmModel, apiKey: settings.llmApiKey }, chatMessages, (delta) => {
        const firstDelta = !assistantStarted
        assistantStarted = true
        // Entries are matched by id, so a reset or a late delta can never corrupt another message.
        setMessages((current) => firstDelta ? [...current, { ...reply, text: delta }] : current.map((entry) => entry.id === reply.id ? { ...entry, text: entry.text + delta } : entry))
      }, controller.signal))
    }).then(() => {
      setLlmState('idle')
    }).catch((error) => {
      if (controller.signal.aborted) return
      setLlmState('error')
      setLlmError(error instanceof Error ? error.message : 'The language model request failed')
    })
  }

  async function checkLlmConnection() {
    setConnectionState('testing')
    setConnectionMessage('')
    try {
      const { testLlmConnection } = await import('./providers/llm')
      await testLlmConnection({ baseUrl: settings.llmBaseUrl, model: settings.llmModel, apiKey: settings.llmApiKey })
      setConnectionState('ready')
      setConnectionMessage('Connection ready')
    } catch (error) {
      setConnectionState('error')
      setConnectionMessage(error instanceof Error ? error.message : 'Connection failed')
    }
  }

  async function refreshOfflineStatus() {
    setOfflineStatus(await getOfflineCacheStatus())
  }

  async function clearOfflineData() {
    await clearOfflineCache()
    await refreshOfflineStatus()
  }

  function resetJourney() {
    chatAbort.current?.abort()
    setLlmState('idle')
    setLlmError('')
    const journey = emptyJourney()
    setSelectedPlace(journey.currentDestination)
    setDestinationHistory(journey.destinationHistory)
    setCurrentScene(journey.currentScene)
    setMessages(journey.messages)
    setNarrativeEvents(journey.narrativeEvents)
    setKnownPeople(journey.knownPeople)
    setKnownEntities(journey.knownEntities)
    setUserFacts(journey.userFacts)
    setConversationSummary('')
    setSummaryMessageCount(0)
    setSummaryState('idle')
    setJourneyItem({ people: '', entities: '', facts: '' })
    setQuery('')
    setOnlineResults([])
    setOnlineState('idle')
    setRoute(null)
    setPendingDestination(null)
    setRouteState('idle')
  }

  function applyJourney(journey: JourneyState) {
    chatAbort.current?.abort()
    setLlmState('idle')
    setLlmError('')
    setSelectedPlace(journey.currentDestination)
    setMapViewport(journey.mapViewport ?? null)
    setDestinationHistory(journey.destinationHistory)
    setCurrentScene(journey.currentScene)
    setMessages(journey.messages)
    setNarrativeEvents(journey.narrativeEvents)
    setKnownPeople(journey.knownPeople)
    setKnownEntities(journey.knownEntities)
    setUserFacts(journey.userFacts)
    setConversationSummary(journey.conversationSummary ?? '')
    setSummaryMessageCount(journey.messages.length)
    setJourneyItem({ people: '', entities: '', facts: '' })
    setRoute(null)
    setPendingDestination(null)
    setRouteState('idle')
  }

  function exportJourney() {
    const blob = new Blob([journeyJson({ id: 'active', currentDestination: selectedPlace, mapViewport, destinationHistory, currentScene, messages, knownPeople, knownEntities, userFacts, narrativeEvents, conversationSummary })], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'osm-ai-journey.json'
    link.click()
    URL.revokeObjectURL(url)
    setJourneyTransferError('')
    setJourneyTransferMessage('Journey exported')
  }

  async function importJourney(file: File) {
    try {
      const imported = parseJourneyJson(JSON.parse(await file.text()))
      if (!window.confirm('Replace the current journey with this imported journey?')) return
      applyJourney(imported)
      setJourneyTransferError('')
      setJourneyTransferMessage('Journey imported')
    } catch (error) {
      setJourneyTransferMessage('')
      setJourneyTransferError(error instanceof Error ? error.message : 'Journey import failed')
    } finally {
      if (importInputRef.current) importInputRef.current.value = ''
    }
  }

  async function deleteJourney() {
    await deleteActiveJourney()
    resetJourney()
  }

  function addJourneyItem(kind: 'people' | 'entities' | 'facts') {
    const value = journeyItem[kind].trim()
    if (!value) return
    const add = kind === 'people' ? setKnownPeople : kind === 'entities' ? setKnownEntities : setUserFacts
    add((current) => current.includes(value) ? current : [...current, value])
    setJourneyItem((current) => ({ ...current, [kind]: '' }))
  }

  function toggleStoryPanel(panel: StoryPanel) {
    setStoryPanels((current) => current.includes(panel) ? current.filter((item) => item !== panel) : [...current, panel])
  }

  function closeStoryPanel(panel: StoryPanel) {
    setStoryPanels((current) => current.filter((item) => item !== panel))
  }

  function changeProvider(provider: UserSettings['llmProvider']) {
    if (provider === 'custom') {
      setSettings({ ...settings, llmProvider: provider })
      return
    }
    const preset = LLM_PROVIDER_PRESETS[provider]
    setSettings({ ...settings, llmProvider: provider, llmBaseUrl: preset.baseUrl, llmModel: preset.model })
  }

  return (
    <main className={`app-shell ${storyMode ? 'story-mode' : 'explore-mode'} ${storyMode && storyPanels.includes('map') && storyPanels.includes('destination') ? 'story-map-and-destination' : ''} ${storyMode && storyPanels.includes('destination') && storyPanels.includes('travelogue') ? 'story-panels-stacked' : ''}`}>
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true">✦</div>
          <div>
            <p className="eyebrow">Open-ended field notes</p>
            <h1>Osm AI Journey</h1>
          </div>
        </div>
        <div className="topbar-actions">
          <span className="status-pill"><span className="status-dot" /> Local-first</span>
          <button className="mode-toggle" type="button" onClick={() => { setStoryMode((active) => !active); setStoryPanels(storyMode ? ['map'] : []); setFieldNotesOpen(false) }} aria-pressed={storyMode}>
            {storyMode ? 'Story' : 'Explore'}
          </button>
          <button className="icon-button" onClick={() => setShowSettings((visible) => !visible)} aria-label="Toggle settings">⚙</button>
        </div>
      </header>

      <section className="workspace">
        {selectedPhoto && <div className="scene-art" aria-label="Illustrative destination scene art">
          <img src={selectedPhoto.imageUrl} alt="" />
          <div className="scene-art-shade" />
          <p className="scene-art-note">Illustrative photo · not a live view · <a href={selectedPhoto.sourceUrl} target="_blank" rel="noreferrer">source</a></p>
        </div>}
        <div id="story-map-panel" className={`map-layout ${storyPanels.includes('map') ? 'map-layout--compact' : ''}`}>
        {storyPanels.includes('map') && <>
        <section className="map-panel panel map-panel--compact">
          <div className="map-toolbar">
            <div>
              <p className="eyebrow">Explore a place</p>
              <h2>{selectedPlace?.name ?? 'Explore map'}</h2>
            </div>
            <label className="search-box">
              <span aria-hidden="true">⌕</span>
              <input value={query} onChange={(event) => updateQuery(event.target.value)} placeholder="Search loaded places" />
            </label>
          </div>
          {query && mapStatus === 'loading' && <div className="search-state">Loading places from the visible map…</div>}
          {query && mapStatus === 'ready' && localResults.length > 0 && (
            <div className="search-results">
              <p className="result-label">From loaded map data</p>
              {localResults.map((place) => <button key={place.id} onClick={() => choosePlace(place)}>{place.name}<span>{place.category ?? 'Place'}</span></button>)}
            </div>
          )}
          {query && mapStatus === 'ready' && localResults.length === 0 && onlineState === 'idle' && <div className="online-search">No loaded places match. <button onClick={() => void searchOnline()}>Search online</button></div>}
          {query && mapStatus === 'ready' && localResults.length === 0 && onlineState === 'loading' && <div className="search-state">Searching {settings.onlineGeocoder === 'nominatim' ? 'Nominatim' : 'Photon'} for “{onlineQuery}”…</div>}
          {query && mapStatus === 'ready' && localResults.length === 0 && onlineState === 'error' && <div className="online-search">{onlineError} <button onClick={() => void searchOnline()}>Try again</button></div>}
          {query && onlineQuery === query.trim() && onlineState === 'ready' && onlineResults.length > 0 && <div className="search-results">
            <p className="result-label">Online results{onlineCached ? ' · cached' : ' · live'}</p>
            {onlineResults.map((place) => <button key={place.id} onClick={() => choosePlace(place)}>{place.name}<span>{place.category ?? place.description ?? 'Place'}</span></button>)}
          </div>}
          {query && onlineQuery === query.trim() && onlineState === 'ready' && onlineResults.length === 0 && <div className="online-search">No online places matched. <button onClick={() => void searchOnline()}>Try another search</button></div>}
          {query && mapStatus === 'unavailable' && <div className="search-state">Loaded map data is unavailable. <button onClick={() => void searchOnline()}>Search online</button></div>}
          {journeyReady
            ? <Suspense fallback={<div className="map-loading">Loading map…</div>}><MapCanvas selectedPlace={mapPlace} initialViewport={mapViewport} onViewportChange={setMapViewport} route={route} onPlaceSelected={choosePlace} onPlacesLoaded={setPlaces} onMapStatusChange={setMapStatus} /></Suspense>
            : <div className="map-loading">Restoring journey…</div>}
          {pendingDestination && <div className="route-choice"><p className="eyebrow">Begin transition</p><strong>Walk from {selectedPlace?.name} to {pendingDestination.name}?</strong><p>Calculate an optional walking route before arriving.</p><div><button onClick={() => void completeTransition(pendingDestination, true)}>Walk there</button><button onClick={() => void completeTransition(pendingDestination, false)}>Arrive without route</button></div></div>}
          {routeState === 'loading' && <div className="route-status">Calculating walking route…</div>}
          {routeState === 'ready' && route && <div className="route-status">Walking route · {(route.distanceMeters / 1000).toFixed(1)} km · {Math.round(route.durationSeconds / 60)} min</div>}
          {routeState === 'error' && <div className="route-status route-error">{routeMessage} Continuing without a route.</div>}
          {selectedPlace && selectedPhoto && <aside className="place-detail photo-detail" aria-label="Selected photo">
            <button type="button" className="back-button" onClick={() => setSelectedPhoto(null)}>← Back to {selectedPlace.name}</button>
            <img className="photo-detail-image" src={selectedPhoto.thumbnailUrl} alt={selectedPhoto.title} />
            <p className="eyebrow">Photo</p>
            <h3 className="photo-detail-title">{selectedPhoto.title}</h3>
            <dl className="place-facts">
              <div><dt>Distance</dt><dd>{selectedPhoto.distanceMeters === undefined ? 'Unknown' : selectedPhoto.distanceMeters < 50 ? 'At destination' : `${(selectedPhoto.distanceMeters / 1000).toFixed(1)} km away`}</dd></div>
              <div><dt>Location</dt><dd>{selectedPhoto.photoCoordinates ? `${selectedPhoto.photoCoordinates[1].toFixed(5)}, ${selectedPhoto.photoCoordinates[0].toFixed(5)}` : 'No geotag'}</dd></div>
              {selectedPhoto.author && <div><dt>Author</dt><dd>{selectedPhoto.author}</dd></div>}
              {selectedPhoto.publishedAt && <div><dt>Date</dt><dd>{selectedPhoto.publishedAt}</dd></div>}
            </dl>
            {selectedPhoto.description && <p className="context-summary">{selectedPhoto.description}</p>}
            <p className="photo-note">This photo is in the companion's context for your next message. Going back removes it.</p>
            <div className="context-links"><a href={selectedPhoto.sourceUrl} target="_blank" rel="noreferrer">View on Wikimedia</a></div>
          </aside>}
          {selectedPlace && !selectedPhoto && <aside className="place-detail" aria-label="Selected destination">
            <div className="place-detail-header">
              <div><p className="eyebrow">Selected destination</p><h3>{selectedPlace.name}</h3></div>
              <button className="close-button" onClick={() => { setSelectedPlace(null); setRoute(null) }} aria-label="Clear selected destination">×</button>
            </div>
            <p className="place-category">{selectedPlace.category ?? 'Place'}</p>
            <dl className="place-facts">
              <div><dt>Coordinates</dt><dd>{selectedPlace.coordinates[1].toFixed(5)}, {selectedPlace.coordinates[0].toFixed(5)}</dd></div>
             {selectedPlace.osmType && selectedPlace.osmId && <div><dt>OSM feature</dt><dd>{selectedPlace.osmType}/{selectedPlace.osmId}</dd></div>}
              <div><dt>Source</dt><dd>{selectedPlace.source === 'online' ? `Online · ${settings.onlineGeocoder}` : 'Loaded OpenFreeMap data'}</dd></div>
            </dl>
            <div className="weather-panel">
              <div className="weather-heading"><p className="context-label">Current weather</p>{weather && <span className={`weather-source weather-${weather.source}`}>{weather.source}</span>}</div>
              {!settings.liveDataEnabled && <p className="context-state">Enable optional live data in settings to request weather.</p>}
              {settings.liveDataEnabled && weatherState === 'idle' && <button className="weather-button" onClick={() => void loadWeather()}>Load current weather</button>}
              {weatherState === 'loading' && <p className="context-state">Fetching current conditions…</p>}
              {weatherState === 'error' && <><p className="context-state">{weatherError}</p><button className="weather-button" onClick={() => void loadWeather(true)}>Try weather again</button></>}
              {weatherState === 'ready' && weather && <><div className="weather-reading"><strong>{weather.data.temperatureC.toFixed(1)}°C</strong><span>{weatherLabel(weather.data.weatherCode)} · feels like {weather.data.apparentTemperatureC.toFixed(1)}°C</span></div><p className="weather-meta">Wind {weather.data.windSpeedKmh.toFixed(0)} km/h · observed {weather.data.observedAt.replace('T', ' ')}</p><button className="weather-button" onClick={() => void loadWeather(true)}>Refresh weather</button></>}
            </div>
            {contextState === 'loading' && <p className="context-state">Loading Wikipedia and Wikidata context…</p>}
            {contextState === 'error' && <p className="context-state">Optional destination context is unavailable.</p>}
            {contextState === 'ready' && placeContext && <div className="place-context">
              <p className="context-label">Source context · {contextCached ? 'cached' : 'live'}</p>
              {placeContext.summary && <p className="context-summary">{placeContext.summary}</p>}
              {placeContext.facts.length > 0 && <dl className="context-facts">{placeContext.facts.map((fact) => <div key={`${fact.label}-${fact.value}`}><dt>{fact.label}</dt><dd>{fact.value}</dd></div>)}</dl>}
              <div className="context-links">
                {placeContext.wikipediaUrl && <a href={placeContext.wikipediaUrl} target="_blank" rel="noreferrer">Wikipedia</a>}
                {placeContext.wikidataId && <a href={`https://www.wikidata.org/wiki/${placeContext.wikidataId}`} target="_blank" rel="noreferrer">Wikidata</a>}
              </div>
              {!placeContext.summary && placeContext.facts.length === 0 && <p className="context-state">No source context found for this place.</p>}
            </div>}
            <div className="place-photos">
              <div className="weather-heading"><p className="context-label">Illustrative photos</p>{photosCached && <span className="weather-source weather-cached">cached</span>}</div>
              {photosState === 'loading' && <p className="context-state">Finding nearby Wikimedia Commons photos…</p>}
              {photosState === 'error' && <p className="context-state">Photos are unavailable for this destination.</p>}
              {photosState === 'ready' && destinationPhotos.length === 0 && <p className="context-state">No nearby photos found.</p>}
              {destinationPhotos.length > 0 && <div className="photo-grid">{destinationPhotos.map((photo) => {
                const distanceLabel = photo.distanceMeters === undefined ? '' : photo.distanceMeters < 50 ? 'At destination' : `${(photo.distanceMeters / 1000).toFixed(1)} km away`
                return <button key={photo.id} onClick={() => setSelectedPhoto(photo)} className="photo-card"><img src={photo.thumbnailUrl} alt={photo.title} loading="lazy" /><div className="photo-info"><span className="photo-title">{photo.title}</span>{distanceLabel && <span className="photo-distance">{distanceLabel}</span>}</div></button>
              })}</div>}
              {destinationPhotos.length > 0 && <p className="photo-note">Photos within 1 km search radius. Images are for illustration. Photo titles, captions, and source metadata may inform the companion.</p>}
            </div>
          </aside>}
          <div className="map-caption"><span>Map data © OpenStreetMap contributors</span><span>OpenFreeMap</span></div>
        </section>
        <aside className="map-history-panel panel" aria-label="Map navigation panel">
          <div className="story-dock-header">
            <div><p className="eyebrow">Navigate</p><h3>Map</h3></div>
            <button className="close-button" type="button" onClick={() => { if (storyMode) closeStoryPanel('map'); else { setStoryPanels([]); setStoryMode(true) } }} aria-label={storyMode ? 'Close map panel' : 'Return to story'}>×</button>
          </div>
          <label className="dock-search"><span aria-hidden="true">⌕</span><input value={query} onChange={(event) => updateQuery(event.target.value)} placeholder="Search places" /></label>
          {destinationHistory.length > 0 && <div className="dock-history"><p className="result-label">Visited places</p>{destinationHistory.slice().reverse().map((place) => <button key={place.id} type="button" onClick={() => choosePlace(place)}>{place.name}<span>{place.category ?? 'Place'}</span></button>)}</div>}
          {!selectedPlace && destinationHistory.length === 0 && <p className="dock-empty">Search the map or click a place to begin.</p>}
          <p className="dock-hint">Free map panning and search remain available.</p>
        </aside>
        </>}
        </div>

        {storyMode && <nav className="story-dock" aria-label="Story navigation">
          <button className={storyPanels.includes('map') ? 'active' : ''} type="button" onClick={() => toggleStoryPanel('map')} aria-pressed={storyPanels.includes('map')} aria-controls="story-map-panel" aria-expanded={storyPanels.includes('map')}>⌖ <span>Map</span></button>
          <button className={storyPanels.includes('destination') ? 'active' : ''} type="button" onClick={() => toggleStoryPanel('destination')} aria-pressed={storyPanels.includes('destination')} aria-controls="story-destination-panel" aria-expanded={storyPanels.includes('destination')}>✦ <span>Place</span></button>
          <button className={storyPanels.includes('travelogue') ? 'active' : ''} type="button" onClick={() => toggleStoryPanel('travelogue')} aria-pressed={storyPanels.includes('travelogue')} aria-controls="story-travelogue-panel" aria-expanded={storyPanels.includes('travelogue')}>◷ <span>Journal</span></button>
        </nav>}
        {storyMode && storyPanels.includes('destination') && <aside id="story-destination-panel" className="story-dock-panel destination-dock-panel" aria-label="Destination panel">
          <div className="story-dock-header">
            <div><p className="eyebrow">Examine</p><h3>{selectedPlace?.name ?? 'Destination'}</h3></div>
            <button className="close-button" type="button" onClick={() => closeStoryPanel('destination')} aria-label="Close destination panel">×</button>
          </div>
          {selectedPlace ? <>
            <p className="dock-category">{selectedPlace.category ?? 'Place'}</p>
            <dl className="place-facts dock-facts">
              <div><dt>Coordinates</dt><dd>{selectedPlace.coordinates[1].toFixed(5)}, {selectedPlace.coordinates[0].toFixed(5)}</dd></div>
              <div><dt>Source</dt><dd>{selectedPlace.source === 'online' ? `Online · ${settings.onlineGeocoder}` : 'OpenStreetMap'}</dd></div>
            </dl>
            {contextState === 'loading' && <p className="context-state">Loading destination context…</p>}
            {contextState === 'error' && <p className="context-state">Optional destination context is unavailable.</p>}
            {contextState === 'ready' && placeContext && <div className="place-context">
              <p className="context-label">Source context · {contextCached ? 'cached' : 'live'}</p>
              {placeContext.summary && <p className="context-summary">{placeContext.summary}</p>}
              {placeContext.facts.length > 0 && <dl className="context-facts">{placeContext.facts.map((fact) => <div key={`${fact.label}-${fact.value}`}><dt>{fact.label}</dt><dd>{fact.value}</dd></div>)}</dl>}
              <div className="context-links">
                {placeContext.wikipediaUrl && <a href={placeContext.wikipediaUrl} target="_blank" rel="noreferrer">Wikipedia</a>}
                {placeContext.wikidataId && <a href={`https://www.wikidata.org/wiki/${placeContext.wikidataId}`} target="_blank" rel="noreferrer">Wikidata</a>}
              </div>
            </div>}
            <div className="weather-panel">
              <div className="weather-heading"><p className="context-label">Current weather</p>{weather && <span className={`weather-source weather-${weather.source}`}>{weather.source}</span>}</div>
              {!settings.liveDataEnabled && <p className="context-state">Enable optional live data in settings to request weather.</p>}
              {settings.liveDataEnabled && weatherState === 'idle' && <button className="weather-button" type="button" onClick={() => void loadWeather()}>Load current weather</button>}
              {weatherState === 'loading' && <p className="context-state">Fetching current conditions…</p>}
              {weatherState === 'error' && <p className="context-state">{weatherError}</p>}
              {weatherState === 'ready' && weather && <p className="context-summary">{weather.data.temperatureC.toFixed(1)}°C · {weatherLabel(weather.data.weatherCode)}</p>}
            </div>
            <div className="place-photos">
              <div className="weather-heading"><p className="context-label">Nearby photos · scene art</p>{photosCached && <span className="weather-source weather-cached">cached</span>}</div>
              {photosState === 'loading' && <p className="context-state">Finding nearby photos…</p>}
              {photosState === 'error' && <p className="context-state">Photos are unavailable.</p>}
              {photosState === 'ready' && destinationPhotos.length === 0 && <p className="context-state">No nearby photos found.</p>}
              {destinationPhotos.length > 0 && <div className="dock-gallery">{destinationPhotos.map((photo) => <button key={photo.id} type="button" className={selectedPhoto?.id === photo.id ? 'selected' : ''} onClick={() => setSelectedPhoto(photo)} aria-pressed={selectedPhoto?.id === photo.id}><img src={photo.thumbnailUrl} alt={photo.title} /><span>{photo.title}</span></button>)}</div>}
              {selectedPhoto && <div className="selected-scene-photo"><span>Scene art · illustrative, not a live view</span><a href={selectedPhoto.sourceUrl} target="_blank" rel="noreferrer">Photo source</a></div>}
            </div>
            <button className="field-notes-button" type="button" onClick={() => setFieldNotesOpen(true)}>Open field notes</button>
          </> : <p className="dock-empty">Choose a place first, then return here to examine it.</p>}
        </aside>}
        {storyMode && storyPanels.includes('travelogue') && <aside id="story-travelogue-panel" className="story-dock-panel travelogue-panel" aria-label="Travelogue panel">
          <div className="story-dock-header">
            <div><p className="eyebrow">Journey journal</p><h3>Travelogue</h3></div>
            <button className="close-button" type="button" onClick={() => closeStoryPanel('travelogue')} aria-label="Close travelogue panel">×</button>
          </div>
          {narrativeEvents.length === 0
            ? <p className="dock-empty">Arrivals and story beats will appear here.</p>
            : <ol className="travelogue-events">{narrativeEvents.slice().reverse().map((event) => <li key={event.id}><span className="timeline-dot" aria-hidden="true" /><div><strong>{event.type.replaceAll('-', ' ')}</strong><p>{event.text}</p><time dateTime={event.createdAt}>{new Date(event.createdAt).toLocaleString()}</time></div></li>)}</ol>}
        </aside>}
        {arrivalCard && <div className="arrival-card" role="status" aria-live="polite">
          <p className="eyebrow">Scene {String(currentScene).padStart(2, '0')} · arrival</p>
          <strong>You arrive at {arrivalCard}</strong>
        </div>}
        {fieldNotesOpen && selectedPlace && <aside className="field-notes panel" aria-label="Destination field notes">
          <div className="settings-header"><div><p className="eyebrow">Field notes</p><h2>{selectedPlace.name}</h2></div><button className="close-button" type="button" onClick={() => setFieldNotesOpen(false)} aria-label="Close field notes">×</button></div>
          <p className="field-notes-intro">Source-backed context for this scene. Illustrations and live readings are labeled separately.</p>
          <dl className="place-facts">
            <div><dt>Coordinates</dt><dd>{selectedPlace.coordinates[1].toFixed(5)}, {selectedPlace.coordinates[0].toFixed(5)}</dd></div>
            <div><dt>Place source</dt><dd>{selectedPlace.source === 'online' ? `Online · ${settings.onlineGeocoder}` : 'Loaded OpenFreeMap data'}</dd></div>
            {selectedPlace.osmType && selectedPlace.osmId && <div><dt>OSM feature</dt><dd>{selectedPlace.osmType}/{selectedPlace.osmId}</dd></div>}
            {selectedPhoto && <div><dt>Scene art</dt><dd>Illustrative · Wikimedia</dd></div>}
            {weather && <div><dt>Weather</dt><dd>{weather.source === 'live' ? 'Live reading' : 'Cached reading'}</dd></div>}
          </dl>
          {placeContext?.summary && <p className="context-summary">{placeContext.summary}</p>}
          <div className="context-links">
            {placeContext?.wikipediaUrl && <a href={placeContext.wikipediaUrl} target="_blank" rel="noreferrer">Wikipedia</a>}
            {placeContext?.wikidataId && <a href={`https://www.wikidata.org/wiki/${placeContext.wikidataId}`} target="_blank" rel="noreferrer">Wikidata</a>}
            {selectedPhoto && <a href={selectedPhoto.sourceUrl} target="_blank" rel="noreferrer">Photo source</a>}
          </div>
        </aside>}

        <section className="journey-panel panel">
          <div className="journey-heading">
            <div>
              <p className="eyebrow">Your companion</p>
              <h2>Begin anywhere</h2>
            </div>
            <div className="journey-heading-actions">
              <button className={`companion-toggle ${showCompanion ? 'active' : ''}`} type="button" onClick={() => setShowCompanion((visible) => !visible)} aria-pressed={showCompanion}>
                {showCompanion ? 'Hide companion' : 'Show companion'}
              </button>
              <span className="scene-tag">Scene {String(currentScene).padStart(2, '0')}</span>
            </div>
          </div>
          {showCompanion && <div className="companion-sprite" aria-label="Companion illustration placeholder">
            <span aria-hidden="true">✦</span>
            <p>Companion illustration</p>
            <small>Placeholder · no portrait uploaded</small>
          </div>}
          <div className="conversation" aria-label="Journey narration">
            {messages.map((entry) => <div className={`message ${entry.role === 'user' ? 'user-action' : entry.role === 'event' ? 'narration event' : 'narration'}`} key={entry.id}><p>{entry.text}</p></div>)}
          </div>
          <section className="journey-timeline" aria-label="Journey timeline">
            <div className="timeline-heading"><p className="memory-label">Travelogue</p><span>{narrativeEvents.length} event{narrativeEvents.length === 1 ? '' : 's'}</span></div>
            {narrativeEvents.length === 0
              ? <p className="timeline-empty">Arrivals and story beats will appear here.</p>
              : <ol>{narrativeEvents.slice(-6).reverse().map((event) => <li key={event.id}><span className="timeline-dot" aria-hidden="true" /><div><strong>{event.type.replaceAll('-', ' ')}</strong><p>{event.text}</p><time dateTime={event.createdAt}>{new Date(event.createdAt).toLocaleString()}</time></div></li>)}</ol>}
          </section>
          <form className="composer" onSubmit={sendMessage}>
            <textarea disabled={llmState === 'loading'} value={message} onChange={(event) => setMessage(event.target.value)} placeholder={llmState === 'loading' ? 'The companion is thinking…' : 'Speak freely. Ask for a scene, a direction, or a different world.'} rows={2} />
            <button className="send-button" disabled={llmState === 'loading'} type="submit" aria-label="Send message">↗</button>
          </form>
          {llmState === 'error' && <p className="provider-error">{llmError}</p>}
          <div className="journey-footer"><span>{selectedPlace ? `At ${selectedPlace.name}` : 'No destination selected'}</span><span>{destinationHistory.length} destination{destinationHistory.length === 1 ? '' : 's'} · {settings.calculateWalkingRoutes ? 'Walking routes on' : 'Routes optional'}</span></div>
        </section>
      </section>

      {showSettings && <aside className="settings panel">
        <div className="settings-header"><div><p className="eyebrow">Local configuration</p><h2>Journey settings</h2></div><button className="close-button" onClick={() => setShowSettings(false)}>×</button></div>
        <label>LLM provider<select value={settings.llmProvider} onChange={(event) => changeProvider(event.target.value as UserSettings['llmProvider'])}><option value="ollama">Ollama</option><option value="openai">OpenAI</option><option value="lmstudio">LM Studio</option><option value="vllm">vLLM</option><option value="custom">Custom compatible server</option></select></label>
        <label>LLM base URL<input value={settings.llmBaseUrl} onChange={(event) => setSettings({ ...settings, llmProvider: 'custom', llmBaseUrl: event.target.value })} /></label>
        <label>Model<input value={settings.llmModel} onChange={(event) => setSettings({ ...settings, llmModel: event.target.value })} /></label>
        <label>API key<input type="password" value={settings.llmApiKey} onChange={(event) => setSettings({ ...settings, llmApiKey: event.target.value })} placeholder="Optional for local models" /></label>
        <label>Companion name<input value={settings.personaName} onChange={(event) => setSettings({ ...settings, personaName: event.target.value })} /></label>
        <label>Companion instructions<textarea className="persona-input" value={settings.personaInstructions} onChange={(event) => setSettings({ ...settings, personaInstructions: event.target.value })} rows={3} /></label>
        <div className="connection-test"><button type="button" onClick={() => void checkLlmConnection()} disabled={connectionState === 'testing'}>{connectionState === 'testing' ? 'Testing…' : 'Test connection'}</button>{connectionMessage && <span className={connectionState === 'error' ? 'connection-error' : 'connection-ready'}>{connectionMessage}</span>}</div>
        <label>Online geocoder<select value={settings.onlineGeocoder} onChange={(event) => setSettings({ ...settings, onlineGeocoder: event.target.value as UserSettings['onlineGeocoder'] })}><option value="nominatim">Nominatim</option><option value="photon">Photon</option></select></label>
        <label>Walking route server<input value={settings.routingBaseUrl} onChange={(event) => setSettings({ ...settings, routingBaseUrl: event.target.value })} /></label>
        <label>Weather provider URL<input value={settings.weatherBaseUrl} onChange={(event) => setSettings({ ...settings, weatherBaseUrl: event.target.value })} /></label>
        <label className="toggle-row"><span>Calculate walking routes by default</span><input type="checkbox" checked={settings.calculateWalkingRoutes} onChange={(event) => setSettings({ ...settings, calculateWalkingRoutes: event.target.checked })} /></label>
        <label className="toggle-row"><span>Enable optional live data</span><input type="checkbox" checked={settings.liveDataEnabled} onChange={(event) => setSettings({ ...settings, liveDataEnabled: event.target.checked })} /></label>
        <div className="offline-cache"><p className="memory-label">Offline cache</p><p className="settings-note">{offlineStatus ? `${offlineStatus.entries} cached resources across ${offlineStatus.cacheNames.length} cache${offlineStatus.cacheNames.length === 1 ? '' : 's'}.` : 'Checking cached resources…'}</p><div className="settings-actions"><button type="button" onClick={() => void refreshOfflineStatus()}>Refresh status</button><button type="button" onClick={() => void clearOfflineData()}>Clear cache</button></div></div>
        <p className="settings-note">Saved journey destinations: {destinationHistory.length}. Scene events: {narrativeEvents.length}. {summaryState === 'loading' ? 'Updating conversation summary…' : conversationSummary ? 'Long-conversation summary available.' : ''}</p>
        <div className="journey-memory">
          <p className="memory-label">Journey memory</p>
          {(['people', 'entities', 'facts'] as const).map((kind) => {
            const values = kind === 'people' ? knownPeople : kind === 'entities' ? knownEntities : userFacts
            const label = kind === 'people' ? 'User-created people' : kind === 'entities' ? 'User-created entities' : 'User-created facts'
            const remove = kind === 'people' ? setKnownPeople : kind === 'entities' ? setKnownEntities : setUserFacts
            return <div className="memory-group" key={kind}><label>{label}<div className="memory-entry"><input value={journeyItem[kind]} onChange={(event) => setJourneyItem({ ...journeyItem, [kind]: event.target.value })} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addJourneyItem(kind) } }} placeholder={`Add ${label.toLowerCase()}`} /><button type="button" onClick={() => addJourneyItem(kind)}>Add</button></div></label>{values.length > 0 && <ul className="memory-values">{values.map((value) => <li key={value}><span>{value}</span><button type="button" onClick={() => remove((current) => current.filter((item) => item !== value))} aria-label={`Remove ${value}`}>×</button></li>)}</ul>}</div>
          })}
        </div>
        <div className="journey-transfer">
          <p className="memory-label">Journey file</p>
          <div className="settings-actions"><button type="button" onClick={exportJourney}>Export JSON</button><button type="button" onClick={() => importInputRef.current?.click()}>Import JSON</button></div>
          <input ref={importInputRef} type="file" accept="application/json,.json" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void importJourney(file) }} />
          {journeyTransferMessage && <p className="connection-ready">{journeyTransferMessage}</p>}
          {journeyTransferError && <p className="connection-error">{journeyTransferError}</p>}
        </div>
        <div className="settings-actions"><button onClick={resetJourney}>Reset journey</button><button onClick={() => void deleteJourney()}>Delete saved journey</button></div>
        <p className="settings-note">Settings stay in this browser. API keys are not safe to share in a public static deployment.</p>
      </aside>}
    </main>
  )
}

export default App

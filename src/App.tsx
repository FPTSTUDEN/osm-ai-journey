import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
const MapCanvas = lazy(() => import('./components/MapCanvas').then((module) => ({ default: module.MapCanvas })))
import { DialogueBox } from './components/DialogueBox'
import { OpeningScreen } from './components/OpeningScreen'
import { PlaceDetails } from './components/PlaceDetails'
import { FieldNotes } from './components/FieldNotes'
import { JournalPanel } from './components/JournalPanel'
import { ArrivalCard } from './components/ArrivalCard'
import { SettingsDrawer } from './components/SettingsDrawer'
import { LLM_PROVIDER_PRESETS } from './providers/config'
import { searchLocalPlaces } from './providers/localPlaceIndex'
import { usePlaceData } from './hooks/usePlaceData'
import { useStoryPanels, type StoryPanel } from './hooks/useStoryPanels'
import { useJourney, newJourneyEvent } from './hooks/useJourney'
import { useChat } from './hooks/useChat'
import { clearOfflineCache, getOfflineCacheStatus, type OfflineCacheStatus } from './storage/offlineCache'
import { loadSettings, saveSettings } from './storage/settings'
import { deleteCompanionArt, loadCompanionArt, saveCompanionArt } from './storage/companionArt'
import { journeyJson, parseJourneyJson } from './storage/journeyTransfer'
import type { JourneyState, Place, PlacePhoto, UserSettings, WalkingRoute } from './types/domain'
import './styles/app.css'

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
  const {
    selectedPlace, setSelectedPlace, mapViewport, setMapViewport, messages, setMessages,
    destinationHistory, setDestinationHistory, currentScene, setCurrentScene, narrativeEvents,
    setNarrativeEvents, knownPeople, setKnownPeople, knownEntities, setKnownEntities, userFacts,
    setUserFacts, conversationSummary, setConversationSummary, summaryMessageCount,
    setSummaryMessageCount, journeyReady, applyJourney: applyJourneyState,
    resetJourney: resetJourneyState, snapshot: journeySnapshot, deleteJourney: deleteSavedJourney,
    appendArrival,
  } = useJourney()
  const [places, setPlaces] = useState<Place[]>([])
  const [query, setQuery] = useState('')
  const [message, setMessage] = useState('')
  const [mapStatus, setMapStatus] = useState<'loading' | 'ready' | 'unavailable'>('loading')
  const [onlineResults, setOnlineResults] = useState<Place[]>([])
  const [onlineQuery, setOnlineQuery] = useState('')
  const [onlineState, setOnlineState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [onlineCached, setOnlineCached] = useState(false)
  const [onlineError, setOnlineError] = useState('')
  const placeData = usePlaceData(selectedPlace, settings)
  const { context: placeContext, contextState, contextCached, photos: destinationPhotos, photosState, photosCached, weather, weatherState, weatherError, loadWeather } = placeData
  const [journeyItem, setJourneyItem] = useState({ people: '', entities: '', facts: '' })
  const [selectedPhoto, setSelectedPhoto] = useState<PlacePhoto | null>(null)
  const chat = useChat({
    entries: messages,
    setEntries: setMessages,
    journey: { destinationHistory, currentScene, knownPeople, knownEntities, userFacts, conversationSummary },
    place: selectedPlace,
    placeData,
    selectedPhoto,
    settings,
    journeyReady,
    summaryMessageCount,
    setSummaryMessageCount,
    setConversationSummary,
    onUserMessage: (text) => setNarrativeEvents((current) => [...current, newJourneyEvent('message', text)]),
  })
  const { llmState, llmError, animatedEntryId, summaryState } = chat
  const [connectionState, setConnectionState] = useState<'idle' | 'testing' | 'ready' | 'error'>('idle')
  const [connectionMessage, setConnectionMessage] = useState('')
  const [route, setRoute] = useState<WalkingRoute | null>(null)
  const [pendingDestination, setPendingDestination] = useState<Place | null>(null)
  const [routeState, setRouteState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [routeMessage, setRouteMessage] = useState('')
  const [offlineStatus, setOfflineStatus] = useState<OfflineCacheStatus | null>(null)
  const [journeyTransferMessage, setJourneyTransferMessage] = useState('')
  const [journeyTransferError, setJourneyTransferError] = useState('')
  const [showCompanion, setShowCompanion] = useState(false)
  const [companionImageUrl, setCompanionImageUrl] = useState<string | null>(null)
  const [companionArtError, setCompanionArtError] = useState('')
  const { storyMode, storyPanels, fieldNotesOpen, settingsOpen: showSettings, setSettingsOpen: setShowSettings, setFieldNotesOpen, toggleStoryPanel, closeStoryPanel, closeAllPanels, toggleMode, dockButtons, settingsButton } = useStoryPanels()
  const [arrivalCard, setArrivalCard] = useState<string | null>(null)
  const importInputRef = useRef<HTMLInputElement>(null)
  const companionArtInputRef = useRef<HTMLInputElement>(null)
  const arrivalTimer = useRef<number | undefined>(undefined)

  useEffect(() => () => { window.clearTimeout(arrivalTimer.current) }, [])

  useEffect(() => {
    saveSettings(settings)
  }, [settings])

  useEffect(() => {
    let active = true
    void loadCompanionArt().then((image) => {
      if (!active || !image) return
      setCompanionImageUrl(URL.createObjectURL(image))
      setSettings((current) => ({ ...current, companionImage: true }))
    }).catch((error) => {
      if (active) setCompanionArtError(error instanceof Error ? error.message : 'Unable to load companion illustration')
    })
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!companionImageUrl) return
    return () => URL.revokeObjectURL(companionImageUrl)
  }, [companionImageUrl])

  useEffect(() => {
    if (!showSettings) return
    void getOfflineCacheStatus().then(setOfflineStatus)
  }, [showSettings])

  useEffect(() => setSelectedPhoto(null), [selectedPlace])

  useEffect(() => {
    if (!storyPanels.includes('map')) setMapStatus('loading')
  }, [storyPanels.includes('map')])

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
    appendArrival(eventText, eventType, place.id)
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

  function openMapForSearch() {
    if (!query.trim()) return
    if (!storyPanels.includes('map')) toggleStoryPanel('map')
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

  async function searchOnlineShortcut(placeName: string) {
    setQuery(placeName)
    if (!storyPanels.includes('map')) toggleStoryPanel('map')
    setOnlineQuery(placeName)
    setOnlineState('loading')
    setOnlineError('')
    try {
      const { searchOnlinePlaces } = await import('./providers/geocoder')
      const response = await searchOnlinePlaces(placeName, settings.onlineGeocoder)
      setOnlineResults(response.places)
      setOnlineCached(response.cached)
      setOnlineState('ready')
      const firstPlace = response.places[0]
      if (firstPlace) choosePlace(firstPlace)
    } catch (error) {
      setOnlineResults([])
      setOnlineState('error')
      setOnlineError(error instanceof Error ? error.message : 'Online search failed')
    }
  }

  function sendMessage(event: React.FormEvent) {
    event.preventDefault()
    const trimmed = message.trim()
    if (!trimmed) return
    setMessage('')
    chat.send(trimmed)
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

  function clearJourneyUi() {
    setJourneyItem({ people: '', entities: '', facts: '' })
    setQuery('')
    setOnlineResults([])
    setOnlineState('idle')
    setRoute(null)
    setPendingDestination(null)
    setRouteState('idle')
    setMapViewport(null)
    setSelectedPhoto(null)
    closeAllPanels()
  }

  function resetJourney() {
    chat.reset()
    resetJourneyState()
    clearJourneyUi()
  }

  function applyJourney(journey: JourneyState) {
    chat.reset()
    applyJourneyState(journey)
    setJourneyItem({ people: '', entities: '', facts: '' })
    setRoute(null)
    setPendingDestination(null)
    setRouteState('idle')
  }

  function exportJourney() {
    const blob = new Blob([journeyJson(journeySnapshot())], { type: 'application/json' })
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
    chat.reset()
    await deleteSavedJourney()
    clearJourneyUi()
  }

  function addJourneyItem(kind: 'people' | 'entities' | 'facts') {
    const value = journeyItem[kind].trim()
    if (!value) return
    const add = kind === 'people' ? setKnownPeople : kind === 'entities' ? setKnownEntities : setUserFacts
    add((current) => current.includes(value) ? current : [...current, value])
    setJourneyItem((current) => ({ ...current, [kind]: '' }))
  }

  function removeJourneyItem(kind: 'people' | 'entities' | 'facts', value: string) {
    const remove = kind === 'people' ? setKnownPeople : kind === 'entities' ? setKnownEntities : setUserFacts
    remove((current) => current.filter((item) => item !== value))
  }

  function changeProvider(provider: UserSettings['llmProvider']) {
    if (provider === 'custom') {
      setSettings({ ...settings, llmProvider: provider })
      return
    }
    const preset = LLM_PROVIDER_PRESETS[provider]
    setSettings({ ...settings, llmProvider: provider, llmBaseUrl: preset.baseUrl, llmModel: preset.model })
  }

  async function uploadCompanionArt(file: File | undefined) {
    if (!file) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setCompanionArtError('Choose a JPEG, PNG, or WebP image.')
      return
    }
    try {
      await saveCompanionArt(file)
      setCompanionImageUrl(URL.createObjectURL(file))
      setSettings((current) => ({ ...current, companionImage: true }))
      setCompanionArtError('')
    } catch (error) {
      setCompanionArtError(error instanceof Error ? error.message : 'Unable to save companion illustration')
    } finally {
      if (companionArtInputRef.current) companionArtInputRef.current.value = ''
    }
  }

  async function removeCompanionArt() {
    try {
      await deleteCompanionArt()
      setCompanionImageUrl(null)
      setSettings((current) => ({ ...current, companionImage: false }))
      setCompanionArtError('')
    } catch (error) {
      setCompanionArtError(error instanceof Error ? error.message : 'Unable to remove companion illustration')
    }
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
          <button className="mode-toggle" type="button" onClick={toggleMode} aria-pressed={storyMode}>
            {storyMode ? 'Story' : 'Explore'}
          </button>
          <button className={`companion-top-toggle ${showCompanion ? 'active' : ''}`} type="button" onClick={() => setShowCompanion((visible) => !visible)} aria-pressed={showCompanion} aria-label={showCompanion ? 'Hide companion' : 'Show companion'}>
            <span aria-hidden="true">✦</span><span>{showCompanion ? 'Hide companion' : 'Show companion'}</span>
          </button>
          <button ref={settingsButton} className="icon-button" onClick={() => setShowSettings((visible) => !visible)} aria-label="Toggle settings">⚙</button>
        </div>
      </header>

      <section className="workspace">
        {storyMode && !selectedPlace && !messages.some((entry) => entry.role === 'user') && <OpeningScreen query={query} onQueryChange={updateQuery} onSearchLoadedPlaces={openMapForSearch} onOnlineShortcut={searchOnlineShortcut} />}
        {selectedPhoto && <div className="scene-art" aria-label="Illustrative destination scene art">
          <img src={selectedPhoto.sceneUrl ?? selectedPhoto.imageUrl} alt="" />
          <div className="scene-art-shade" />
          <p className="scene-art-note">Illustrative photo · not a live view · {selectedPhoto.author && `${selectedPhoto.author} · `}{selectedPhoto.license && <>{selectedPhoto.license} · </>}<a href={selectedPhoto.sourceUrl} target="_blank" rel="noreferrer">source</a></p>
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
              {selectedPhoto.license && <div><dt>Licence</dt><dd>{selectedPhoto.license}{selectedPhoto.licenseUrl && <> · <a href={selectedPhoto.licenseUrl} target="_blank" rel="noreferrer">details</a></>}</dd></div>}
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
            <PlaceDetails layout="full" place={selectedPlace} geocoder={settings.onlineGeocoder} liveDataEnabled={settings.liveDataEnabled} context={placeContext} contextState={contextState} contextCached={contextCached} weather={weather} weatherState={weatherState} weatherError={weatherError} onLoadWeather={(force) => void loadWeather(force)} photos={destinationPhotos} photosState={photosState} photosCached={photosCached} selectedPhoto={selectedPhoto} onSelectPhoto={(photo) => setSelectedPhoto(photo)} />
          </aside>}
          <div className="map-caption"><span>Map data © OpenStreetMap contributors</span><span>OpenFreeMap</span></div>
        </section>
        <aside className="map-history-panel panel" role="complementary" aria-labelledby="map-panel-label">
          <span id="map-panel-label" className="sr-only">Map navigation panel</span>
          <div className="story-dock-header">
            <div><p className="eyebrow">Navigate</p><h3 id="map-panel-heading">Map</h3></div>
            <button className="close-button" type="button" onClick={() => { if (storyMode) closeStoryPanel('map'); else toggleMode() }} aria-label={storyMode ? 'Close map panel' : 'Return to story'}>×</button>
          </div>
          <label className="dock-search"><span aria-hidden="true">⌕</span><input value={query} onChange={(event) => updateQuery(event.target.value)} placeholder="Search places" /></label>
          {destinationHistory.length > 0 && <div className="dock-history"><p className="result-label">Visited places</p>{destinationHistory.slice().reverse().map((place) => <button key={place.id} type="button" onClick={() => choosePlace(place)}>{place.name}<span>{place.category ?? 'Place'}</span></button>)}</div>}
          {!selectedPlace && destinationHistory.length === 0 && <p className="dock-empty">Search the map or click a place to begin.</p>}
          <p className="dock-hint">Free map panning and search remain available.</p>
        </aside>
        </>}
        </div>

        {storyMode && <nav className="story-dock" aria-label="Story navigation">
          <button ref={(element) => { dockButtons.current.map = element }} className={storyPanels.includes('map') ? 'active' : ''} type="button" onClick={() => toggleStoryPanel('map')} aria-pressed={storyPanels.includes('map')} aria-controls="story-map-panel" aria-expanded={storyPanels.includes('map')}>⌖ <span>Map</span></button>
          <button ref={(element) => { dockButtons.current.destination = element }} disabled={!selectedPlace} className={storyPanels.includes('destination') ? 'active' : ''} type="button" onClick={() => toggleStoryPanel('destination')} aria-pressed={storyPanels.includes('destination')} aria-controls="story-destination-panel" aria-expanded={storyPanels.includes('destination')}>✦ <span>Place</span></button>
          <button ref={(element) => { dockButtons.current.travelogue = element }} className={storyPanels.includes('travelogue') ? 'active' : ''} type="button" onClick={() => toggleStoryPanel('travelogue')} aria-pressed={storyPanels.includes('travelogue')} aria-controls="story-travelogue-panel" aria-expanded={storyPanels.includes('travelogue')}>◷ <span>Journal</span></button>
        </nav>}
        {storyMode && storyPanels.includes('destination') && <aside id="story-destination-panel" className="story-dock-panel destination-dock-panel" role="complementary" aria-labelledby="destination-panel-label">
          <span id="destination-panel-label" className="sr-only">Destination panel</span>
          <div className="story-dock-header">
            <div><p className="eyebrow">Examine</p><h3 id="destination-panel-heading">{selectedPlace?.name ?? 'Destination'}</h3></div>
            <button className="close-button" type="button" onClick={() => closeStoryPanel('destination')} aria-label="Close destination panel">×</button>
          </div>
          {selectedPlace
            ? <PlaceDetails layout="compact" place={selectedPlace} geocoder={settings.onlineGeocoder} liveDataEnabled={settings.liveDataEnabled} context={placeContext} contextState={contextState} contextCached={contextCached} weather={weather} weatherState={weatherState} weatherError={weatherError} onLoadWeather={(force) => void loadWeather(force)} photos={destinationPhotos} photosState={photosState} photosCached={photosCached} selectedPhoto={selectedPhoto} onSelectPhoto={(photo) => setSelectedPhoto(photo)} onOpenFieldNotes={() => setFieldNotesOpen(true)} />
            : <p className="dock-empty">Choose a place first, then return here to examine it.</p>}
        </aside>}
        {storyMode && storyPanels.includes('travelogue') && <JournalPanel events={narrativeEvents} onClose={() => closeStoryPanel('travelogue')} />}
        {arrivalCard && <ArrivalCard placeName={arrivalCard} sceneNumber={currentScene} />}
        {fieldNotesOpen && selectedPlace && <FieldNotes
          place={selectedPlace}
          geocoder={settings.onlineGeocoder}
          liveDataEnabled={settings.liveDataEnabled}
          context={placeContext}
          contextState={contextState}
          contextCached={contextCached}
          weather={weather}
          weatherState={weatherState}
          weatherError={weatherError}
          onLoadWeather={(force) => void loadWeather(force)}
          photos={destinationPhotos}
          photosState={photosState}
          photosCached={photosCached}
          selectedPhoto={selectedPhoto}
          onSelectPhoto={setSelectedPhoto}
          onClose={() => setFieldNotesOpen(false)}
        />}

        <DialogueBox
          entries={messages}
          personaName={settings.personaName}
          message={message}
          onMessageChange={setMessage}
          onSubmit={sendMessage}
          onCancel={chat.cancel}
          onRetry={chat.retry}
          llmState={llmState}
          llmError={llmError}
          sceneNumber={currentScene}
          destinationName={selectedPlace?.name ?? null}
          destinationCount={destinationHistory.length}
          routesEnabled={settings.calculateWalkingRoutes}
          companionVisible={showCompanion}
          animatedEntryId={animatedEntryId}
          companionImageUrl={companionImageUrl}
        />
      </section>

      {showSettings && <SettingsDrawer
        settings={settings}
        onSettingsChange={(updates) => setSettings((current) => ({ ...current, ...updates }))}
        onProviderChange={changeProvider}
        onClose={() => setShowSettings(false)}
        companionArtInputRef={companionArtInputRef}
        onUploadCompanionArt={(file) => void uploadCompanionArt(file)}
        onRemoveCompanionArt={() => void removeCompanionArt()}
        companionArtError={companionArtError}
        connectionState={connectionState}
        connectionMessage={connectionMessage}
        onTestConnection={() => void checkLlmConnection()}
        offlineStatus={offlineStatus}
        onRefreshOfflineStatus={() => void refreshOfflineStatus()}
        onClearOfflineData={() => void clearOfflineData()}
        summaryState={summaryState}
        conversationSummary={conversationSummary}
        destinationCount={destinationHistory.length}
        eventCount={narrativeEvents.length}
        journeyItem={journeyItem}
        onJourneyItemChange={(kind, value) => setJourneyItem((current) => ({ ...current, [kind]: value }))}
        onAddJourneyItem={addJourneyItem}
        memory={{ people: knownPeople, entities: knownEntities, facts: userFacts }}
        onRemoveJourneyItem={removeJourneyItem}
        importInputRef={importInputRef}
        onImportJourney={(file) => void importJourney(file)}
        journeyTransferMessage={journeyTransferMessage}
        journeyTransferError={journeyTransferError}
        onExportJourney={exportJourney}
        onResetJourney={resetJourney}
        onDeleteJourney={() => void deleteJourney()}
      />}
    </main>
  )
}

export default App

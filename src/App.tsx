import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
const MapCanvas = lazy(() => import('./components/MapCanvas').then((module) => ({ default: module.MapCanvas })))
import { enrichPlace, type PlaceContext } from './providers/enrichment'
import { searchOnlinePlaces } from './providers/geocoder'
import { buildJourneyContext, buildSummaryMessages } from './providers/context'
import { LLM_PROVIDER_PRESETS } from './providers/config'
import { completeChat, streamChat, testLlmConnection } from './providers/llm'
import { searchLocalPlaces } from './providers/localPlaceIndex'
import { calculateWalkingRoute } from './providers/routing'
import { fetchCurrentWeather, weatherLabel, type WeatherResult } from './providers/weather'
import { deleteActiveJourney, loadActiveJourney, saveActiveJourney } from './storage/journey'
import { clearOfflineCache, getOfflineCacheStatus, type OfflineCacheStatus } from './storage/offlineCache'
import { loadSettings, saveSettings } from './storage/settings'
import type { JourneyState, MapViewport, NarrativeEvent, Place, UserSettings, WalkingRoute } from './types/domain'
import './styles/app.css'

const starterMessage = 'Choose a place on the map, or tell me what kind of journey you want to begin.'

function newEvent(type: NarrativeEvent['type'], text: string, placeId?: string): NarrativeEvent {
  return { id: crypto.randomUUID(), type, createdAt: new Date().toISOString(), text, placeId }
}

function emptyJourney(): JourneyState {
  return { id: 'active', currentDestination: null, mapViewport: null, destinationHistory: [], currentScene: 1, messages: [starterMessage], knownPeople: [], knownEntities: [], userFacts: [], narrativeEvents: [], conversationSummary: '' }
}

function App() {
  const [settings, setSettings] = useState<UserSettings>(loadSettings)
  const [places, setPlaces] = useState<Place[]>([])
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null)
  const [mapViewport, setMapViewport] = useState<MapViewport | null>(null)
  const [query, setQuery] = useState('')
  const [message, setMessage] = useState('')
  const [messages, setMessages] = useState([starterMessage])
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
      setMessages(restored.messages.length ? restored.messages : [starterMessage])
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
  }, [conversationSummary, currentScene, destinationHistory, journeyReady, knownEntities, knownPeople, mapViewport, messages, narrativeEvents, selectedPlace, userFacts])

  useEffect(() => {
    if (!journeyReady || summaryState === 'loading' || messages.length < 12 || messages.length - summaryMessageCount < 8) return
    setSummaryState('loading')
    void completeChat({ baseUrl: settings.llmBaseUrl, model: settings.llmModel, apiKey: settings.llmApiKey }, buildSummaryMessages(messages)).then((summary) => {
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
    if (!selectedPlace) {
      setPlaceContext(null)
      setContextState('idle')
      setWeather(null)
      setWeatherState('idle')
      return () => { active = false }
    }

    setWeather(null)
    setWeatherState('idle')

    setContextState('loading')
    void enrichPlace(selectedPlace).then((response) => {
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

  async function completeTransition(place: Place, withRoute: boolean) {
    const origin = selectedPlace
    let walkingRoute: WalkingRoute | null = null
    setPendingDestination(null)
    setRouteMessage('')
    if (withRoute && origin) {
      setRouteState('loading')
      try {
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
    setQuery('')
    setOnlineResults([])
    setOnlineState('idle')
    setDestinationHistory((current) => current.some((item) => item.id === place.id) ? current : [...current, place])
    setCurrentScene((current) => current + 1)
    const arrival = `You arrive at ${place.name}.`
    const eventType = walkingRoute ? 'routed-transition' : 'unrouted-transition'
    const eventText = walkingRoute ? `${arrival} Walking route calculated.` : `${arrival} Continuing without a walking route.`
    setMessages((current) => [...current.slice(0, -1), eventText])
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
    setMessages((current) => [...current, trimmed])
    setNarrativeEvents((current) => [...current, newEvent('message', trimmed)])
    setMessage('')
    setLlmState('loading')
    setLlmError('')
    const chatMessages = buildJourneyContext({ settings, selectedPlace, messages, userMessage: trimmed, liveWeather: weather ? `${weatherLabel(weather.data.weatherCode)}, ${weather.data.temperatureC}°C, ${weather.source}` : undefined, journey: { destinationHistory, currentScene, knownPeople, knownEntities, userFacts, conversationSummary } })
    let assistantStarted = false
    void streamChat({ baseUrl: settings.llmBaseUrl, model: settings.llmModel, apiKey: settings.llmApiKey }, chatMessages, (delta) => {
      const firstDelta = !assistantStarted
      assistantStarted = true
      setMessages((current) => {
        if (firstDelta) return [...current, delta]
        const last = current[current.length - 1] ?? ''
        return [...current.slice(0, -1), last + delta]
      })
    }).then(() => {
      setLlmState('idle')
    }).catch((error) => {
      setLlmState('error')
      setLlmError(error instanceof Error ? error.message : 'The language model request failed')
    })
  }

  async function checkLlmConnection() {
    setConnectionState('testing')
    setConnectionMessage('')
    try {
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

  function changeProvider(provider: UserSettings['llmProvider']) {
    if (provider === 'custom') {
      setSettings({ ...settings, llmProvider: provider })
      return
    }
    const preset = LLM_PROVIDER_PRESETS[provider]
    setSettings({ ...settings, llmProvider: provider, llmBaseUrl: preset.baseUrl, llmModel: preset.model })
  }

  return (
    <main className="app-shell">
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
          <button className="icon-button" onClick={() => setShowSettings((visible) => !visible)} aria-label="Toggle settings">⚙</button>
        </div>
      </header>

      <section className="workspace">
        <section className="map-panel panel">
          <div className="map-toolbar">
            <div>
              <p className="eyebrow">Explore a place</p>
              <h2>{selectedPlace?.name ?? 'The world is open'}</h2>
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
            ? <Suspense fallback={<div className="map-loading">Loading map…</div>}><MapCanvas selectedPlace={selectedPlace} initialViewport={mapViewport} onViewportChange={setMapViewport} route={route} onPlaceSelected={choosePlace} onPlacesLoaded={setPlaces} onMapStatusChange={setMapStatus} /></Suspense>
            : <div className="map-loading">Restoring journey…</div>}
          {pendingDestination && <div className="route-choice"><p className="eyebrow">Begin transition</p><strong>Walk from {selectedPlace?.name} to {pendingDestination.name}?</strong><p>Calculate an optional walking route before arriving.</p><div><button onClick={() => void completeTransition(pendingDestination, true)}>Walk there</button><button onClick={() => void completeTransition(pendingDestination, false)}>Arrive without route</button></div></div>}
          {routeState === 'loading' && <div className="route-status">Calculating walking route…</div>}
          {routeState === 'ready' && route && <div className="route-status">Walking route · {(route.distanceMeters / 1000).toFixed(1)} km · {Math.round(route.durationSeconds / 60)} min</div>}
          {routeState === 'error' && <div className="route-status route-error">{routeMessage} Continuing without a route.</div>}
          {selectedPlace && <aside className="place-detail" aria-label="Selected destination">
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
          </aside>}
          <div className="map-caption"><span>Map data © OpenStreetMap contributors</span><span>OpenFreeMap</span></div>
        </section>

        <section className="journey-panel panel">
          <div className="journey-heading">
            <div>
              <p className="eyebrow">Your companion</p>
              <h2>Begin anywhere</h2>
            </div>
            <span className="scene-tag">Scene {String(currentScene).padStart(2, '0')}</span>
          </div>
          <div className="conversation">
            {messages.map((item, index) => <div className={`message ${index % 2 ? 'user-message' : 'ai-message'}`} key={`${item}-${index}`}><span className="message-label">{index % 2 ? 'You' : 'Guide'}</span><p>{item}</p></div>)}
          </div>
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
            return <div className="memory-group" key={kind}><label>{label}<div className="memory-entry"><input value={journeyItem[kind]} onChange={(event) => setJourneyItem({ ...journeyItem, [kind]: event.target.value })} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addJourneyItem(kind) } }} placeholder={`Add ${label.toLowerCase()}`} /><button type="button" onClick={() => addJourneyItem(kind)}>Add</button></div></label>{values.length > 0 && <p className="memory-values">{values.join(' · ')}</p>}</div>
          })}
        </div>
        <div className="settings-actions"><button onClick={resetJourney}>Reset journey</button><button onClick={() => void deleteJourney()}>Delete saved journey</button></div>
        <p className="settings-note">Settings stay in this browser. API keys are not safe to share in a public static deployment.</p>
      </aside>}
    </main>
  )
}

export default App

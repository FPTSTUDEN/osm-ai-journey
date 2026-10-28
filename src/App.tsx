import { useEffect, useMemo, useState } from 'react'
import { MapCanvas } from './components/MapCanvas'
import { enrichPlace, type PlaceContext } from './providers/enrichment'
import { searchOnlinePlaces } from './providers/geocoder'
import { streamChat, testLlmConnection, type ChatMessage } from './providers/llm'
import { searchLocalPlaces } from './providers/localPlaceIndex'
import { deleteActiveJourney, loadActiveJourney, saveActiveJourney } from './storage/journey'
import { loadSettings, saveSettings } from './storage/settings'
import type { JourneyState, NarrativeEvent, Place, UserSettings } from './types/domain'
import './styles/app.css'

const starterMessage = 'Choose a place on the map, or tell me what kind of journey you want to begin.'

function newEvent(type: NarrativeEvent['type'], text: string, placeId?: string): NarrativeEvent {
  return { id: crypto.randomUUID(), type, createdAt: new Date().toISOString(), text, placeId }
}

function emptyJourney(): JourneyState {
  return { id: 'active', currentDestination: null, destinationHistory: [], currentScene: 1, messages: [starterMessage], knownPeople: [], knownEntities: [], userFacts: [], narrativeEvents: [] }
}

function App() {
  const [settings, setSettings] = useState<UserSettings>(loadSettings)
  const [places, setPlaces] = useState<Place[]>([])
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null)
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
  const [llmState, setLlmState] = useState<'idle' | 'loading' | 'error'>('idle')
  const [llmError, setLlmError] = useState('')
  const [connectionState, setConnectionState] = useState<'idle' | 'testing' | 'ready' | 'error'>('idle')
  const [connectionMessage, setConnectionMessage] = useState('')

  useEffect(() => {
    saveSettings(settings)
  }, [settings])

  useEffect(() => {
    void loadActiveJourney().then((journey) => {
      const restored = journey ?? emptyJourney()
      setSelectedPlace(restored.currentDestination)
      setDestinationHistory(restored.destinationHistory)
      setCurrentScene(restored.currentScene)
      setMessages(restored.messages.length ? restored.messages : [starterMessage])
      setNarrativeEvents(restored.narrativeEvents)
      setKnownPeople(restored.knownPeople)
      setKnownEntities(restored.knownEntities)
      setUserFacts(restored.userFacts)
      setJourneyReady(true)
    })
  }, [])

  useEffect(() => {
    if (!journeyReady) return
    void saveActiveJourney({
      id: 'active',
      currentDestination: selectedPlace,
      destinationHistory,
      currentScene,
      messages,
      knownPeople,
      knownEntities,
      userFacts,
      narrativeEvents,
    })
  }, [currentScene, destinationHistory, journeyReady, knownEntities, knownPeople, messages, narrativeEvents, selectedPlace, userFacts])

  useEffect(() => {
    let active = true
    if (!selectedPlace) {
      setPlaceContext(null)
      setContextState('idle')
      return () => { active = false }
    }

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

  function choosePlace(place: Place) {
    setSelectedPlace(place)
    setQuery('')
    setOnlineResults([])
    setOnlineState('idle')
    setDestinationHistory((current) => current.some((item) => item.id === place.id) ? current : [...current, place])
    setCurrentScene((current) => current + 1)
    const arrival = `You arrive at ${place.name}.`
    setMessages((current) => [...current, arrival])
    setNarrativeEvents((current) => [...current, newEvent('destination-transition', arrival, place.id)])
  }

  function updateQuery(value: string) {
    setQuery(value)
    setOnlineResults([])
    setOnlineQuery('')
    setOnlineState('idle')
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

  function sendMessage(event: React.FormEvent) {
    event.preventDefault()
    const trimmed = message.trim()
    if (!trimmed || llmState === 'loading') return
    setMessages((current) => [...current, trimmed])
    setNarrativeEvents((current) => [...current, newEvent('message', trimmed)])
    setMessage('')
    setLlmState('loading')
    setLlmError('')
    const chatMessages: ChatMessage[] = [
      { role: 'system', content: `You are a helpful journey companion. Keep the response concise and imaginative. Current destination: ${selectedPlace?.name ?? 'none'}. Known people: ${knownPeople.join(', ') || 'none'}. Known entities: ${knownEntities.join(', ') || 'none'}. User facts: ${userFacts.join('; ') || 'none'}.` },
      ...messages.slice(1).map((item, index) => ({ role: (index % 2 ? 'assistant' : 'user') as ChatMessage['role'], content: item })),
      { role: 'user', content: trimmed },
    ]
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
    setJourneyItem({ people: '', entities: '', facts: '' })
    setQuery('')
    setOnlineResults([])
    setOnlineState('idle')
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
          {query && mapStatus === 'unavailable' && <div className="search-state">Loaded map data is unavailable. Try moving the map or search online.</div>}
          <MapCanvas selectedPlace={selectedPlace} onPlaceSelected={choosePlace} onPlacesLoaded={setPlaces} onMapStatusChange={setMapStatus} />
          {selectedPlace && <aside className="place-detail" aria-label="Selected destination">
            <div className="place-detail-header">
              <div><p className="eyebrow">Selected destination</p><h3>{selectedPlace.name}</h3></div>
              <button className="close-button" onClick={() => setSelectedPlace(null)} aria-label="Clear selected destination">×</button>
            </div>
            <p className="place-category">{selectedPlace.category ?? 'Place'}</p>
            <dl className="place-facts">
              <div><dt>Coordinates</dt><dd>{selectedPlace.coordinates[1].toFixed(5)}, {selectedPlace.coordinates[0].toFixed(5)}</dd></div>
              {selectedPlace.osmType && selectedPlace.osmId && <div><dt>OSM feature</dt><dd>{selectedPlace.osmType}/{selectedPlace.osmId}</dd></div>}
              <div><dt>Source</dt><dd>{selectedPlace.source === 'online' ? `Online · ${settings.onlineGeocoder}` : 'Loaded OpenFreeMap data'}</dd></div>
            </dl>
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
        <label>LLM base URL<input value={settings.llmBaseUrl} onChange={(event) => setSettings({ ...settings, llmBaseUrl: event.target.value })} /></label>
        <label>Model<input value={settings.llmModel} onChange={(event) => setSettings({ ...settings, llmModel: event.target.value })} /></label>
        <label>API key<input type="password" value={settings.llmApiKey} onChange={(event) => setSettings({ ...settings, llmApiKey: event.target.value })} placeholder="Optional for local models" /></label>
        <div className="connection-test"><button type="button" onClick={() => void checkLlmConnection()} disabled={connectionState === 'testing'}>{connectionState === 'testing' ? 'Testing…' : 'Test connection'}</button>{connectionMessage && <span className={connectionState === 'error' ? 'connection-error' : 'connection-ready'}>{connectionMessage}</span>}</div>
        <label>Online geocoder<select value={settings.onlineGeocoder} onChange={(event) => setSettings({ ...settings, onlineGeocoder: event.target.value as UserSettings['onlineGeocoder'] })}><option value="nominatim">Nominatim</option><option value="photon">Photon</option></select></label>
        <label className="toggle-row"><span>Calculate walking routes by default</span><input type="checkbox" checked={settings.calculateWalkingRoutes} onChange={(event) => setSettings({ ...settings, calculateWalkingRoutes: event.target.checked })} /></label>
        <label className="toggle-row"><span>Enable optional live data</span><input type="checkbox" checked={settings.liveDataEnabled} onChange={(event) => setSettings({ ...settings, liveDataEnabled: event.target.checked })} /></label>
        <p className="settings-note">Saved journey destinations: {destinationHistory.length}. Scene events: {narrativeEvents.length}.</p>
        <div className="journey-memory">
          <p className="memory-label">Journey memory</p>
          {(['people', 'entities', 'facts'] as const).map((kind) => {
            const values = kind === 'people' ? knownPeople : kind === 'entities' ? knownEntities : userFacts
            const label = kind === 'people' ? 'Known people' : kind === 'entities' ? 'Known entities' : 'Your facts'
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

import { useEffect, useMemo, useState } from 'react'
import { MapCanvas } from './components/MapCanvas'
import { searchLocalPlaces } from './providers/localPlaceIndex'
import { loadSettings, saveSettings } from './storage/settings'
import type { Place, UserSettings } from './types/domain'
import './styles/app.css'

const starterMessage = 'Choose a place on the map, or tell me what kind of journey you want to begin.'

function App() {
  const [settings, setSettings] = useState<UserSettings>(loadSettings)
  const [places, setPlaces] = useState<Place[]>([])
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null)
  const [query, setQuery] = useState('')
  const [message, setMessage] = useState('')
  const [messages, setMessages] = useState([starterMessage])
  const [showSettings, setShowSettings] = useState(false)
  const [mapStatus, setMapStatus] = useState<'loading' | 'ready' | 'unavailable'>('loading')

  useEffect(() => {
    saveSettings(settings)
  }, [settings])

  const localResults = useMemo(() => searchLocalPlaces(places, query), [places, query])

  function choosePlace(place: Place) {
    setSelectedPlace(place)
    setQuery('')
    setMessages((current) => [...current, `You arrive at ${place.name}.`])
  }

  function sendMessage(event: React.FormEvent) {
    event.preventDefault()
    const trimmed = message.trim()
    if (!trimmed) return
    setMessages((current) => [...current, trimmed])
    setMessage('')
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
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search loaded places" />
            </label>
          </div>
          {query && mapStatus === 'loading' && <div className="search-state">Loading places from the visible map…</div>}
          {query && mapStatus === 'ready' && localResults.length > 0 && (
            <div className="search-results">
              <p className="result-label">From loaded map data</p>
              {localResults.map((place) => <button key={place.id} onClick={() => choosePlace(place)}>{place.name}<span>{place.category ?? 'Place'}</span></button>)}
            </div>
          )}
          {query && mapStatus === 'ready' && localResults.length === 0 && <div className="online-search">No loaded places match. <button onClick={() => setMessages((current) => [...current, `Online search is ready for “${query}”.`])}>Search online</button></div>}
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
              <div><dt>Source</dt><dd>Loaded OpenFreeMap data</dd></div>
            </dl>
          </aside>}
          <div className="map-caption"><span>Map data © OpenStreetMap contributors</span><span>OpenFreeMap</span></div>
        </section>

        <section className="journey-panel panel">
          <div className="journey-heading">
            <div>
              <p className="eyebrow">Your companion</p>
              <h2>Begin anywhere</h2>
            </div>
            <span className="scene-tag">Scene 01</span>
          </div>
          <div className="conversation">
            {messages.map((item, index) => <div className={`message ${index % 2 ? 'user-message' : 'ai-message'}`} key={`${item}-${index}`}><span className="message-label">{index % 2 ? 'You' : 'Guide'}</span><p>{item}</p></div>)}
          </div>
          <form className="composer" onSubmit={sendMessage}>
            <textarea value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Speak freely. Ask for a scene, a direction, or a different world." rows={2} />
            <button className="send-button" type="submit" aria-label="Send message">↗</button>
          </form>
          <div className="journey-footer"><span>{selectedPlace ? `At ${selectedPlace.name}` : 'No destination selected'}</span><span>{settings.calculateWalkingRoutes ? 'Walking routes on' : 'Routes optional'}</span></div>
        </section>
      </section>

      {showSettings && <aside className="settings panel">
        <div className="settings-header"><div><p className="eyebrow">Local configuration</p><h2>Journey settings</h2></div><button className="close-button" onClick={() => setShowSettings(false)}>×</button></div>
        <label>LLM base URL<input value={settings.llmBaseUrl} onChange={(event) => setSettings({ ...settings, llmBaseUrl: event.target.value })} /></label>
        <label>Model<input value={settings.llmModel} onChange={(event) => setSettings({ ...settings, llmModel: event.target.value })} /></label>
        <label>API key<input type="password" value={settings.llmApiKey} onChange={(event) => setSettings({ ...settings, llmApiKey: event.target.value })} placeholder="Optional for local models" /></label>
        <label className="toggle-row"><span>Calculate walking routes by default</span><input type="checkbox" checked={settings.calculateWalkingRoutes} onChange={(event) => setSettings({ ...settings, calculateWalkingRoutes: event.target.checked })} /></label>
        <label className="toggle-row"><span>Enable optional live data</span><input type="checkbox" checked={settings.liveDataEnabled} onChange={(event) => setSettings({ ...settings, liveDataEnabled: event.target.checked })} /></label>
        <p className="settings-note">Settings stay in this browser. API keys are not safe to share in a public static deployment.</p>
      </aside>}
    </main>
  )
}

export default App

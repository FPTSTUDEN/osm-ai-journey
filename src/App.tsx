import { useEffect, useRef, useState } from 'react'
import { DialogueBox } from './components/DialogueBox'
import { OpeningScreen } from './components/OpeningScreen'
import { StoryPanels } from './components/StoryPanels'
import { JourneySettingsPanel } from './components/JourneySettingsPanel'
import { useAppSettings } from './hooks/useAppSettings'
import { usePlaceData } from './hooks/usePlaceData'
import { useStoryPanels } from './hooks/useStoryPanels'
import { useMapSearch } from './hooks/useMapSearch'
import { useLocalPmtiles } from './hooks/useLocalPmtiles'
import { useJourneyManagement } from './hooks/useJourneyManagement'
import { useJourney, newJourneyEvent } from './hooks/useJourney'
import { useChat } from './hooks/useChat'
import type { Place, PlacePhoto, WalkingRoute } from './types/domain'
import './styles/app.css'

function App() {
  const storyPanelState = useStoryPanels()
  const { storyMode, storyPanels, settingsOpen: showSettings, setSettingsOpen: setShowSettings, toggleStoryPanel, closeAllPanels, toggleMode, settingsButton } = storyPanelState
  const companionArtInputRef = useRef<HTMLInputElement>(null)
  const appSettings = useAppSettings(showSettings, companionArtInputRef)
  const { settings, setSettings, connectionState, connectionMessage, offlineStatus, offlineError, refreshOfflineStatus, clearOfflineData, checkLlmConnection, changeProvider, companionImageUrl, companionArtError, uploadCompanionArt, removeCompanionArt } = appSettings
  const {
    selectedPlace, setSelectedPlace, mapViewport, setMapViewport, messages, setMessages,
    destinationHistory, setDestinationHistory, currentScene, setCurrentScene, narrativeEvents,
    setNarrativeEvents, knownPeople, setKnownPeople, knownEntities, setKnownEntities, userFacts,
    setUserFacts, conversationSummary, setConversationSummary, summaryMessageCount,
    setSummaryMessageCount, journeyReady, applyJourney: applyJourneyState,
    resetJourney: resetJourneyState, snapshot: journeySnapshot, deleteJourney: deleteSavedJourney,
    appendArrival,
  } = useJourney()
  const [message, setMessage] = useState('')
  const placeData = usePlaceData(selectedPlace, settings)
  const { context: placeContext, contextState, contextCached, photos: destinationPhotos, photosState, photosCached, weather, weatherState, weatherError, loadWeather } = placeData
  const [photoSelection, setPhotoSelection] = useState<{ place: Place | null; photo: PlacePhoto | null }>({ place: null, photo: null })
  const selectedPhoto = photoSelection.place === selectedPlace ? photoSelection.photo : null
  const setSelectedPhoto = (photo: PlacePhoto | null) => setPhotoSelection({ place: selectedPlace, photo })
  const scenePhoto = selectedPhoto ?? (photosState === 'ready' ? destinationPhotos[0] ?? null : null)
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
  const [route, setRoute] = useState<WalkingRoute | null>(null)
  const [pendingDestination, setPendingDestination] = useState<Place | null>(null)
  const [routeState, setRouteState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [routeMessage, setRouteMessage] = useState('')
  const presentationMode = settings.storyPresentationMode ?? 'novel'
  const localPmtiles = useLocalPmtiles()
  const [arrivalCard, setArrivalCard] = useState<string | null>(null)
  const importInputRef = useRef<HTMLInputElement>(null)
  const arrivalTimer = useRef<number | undefined>(undefined)

  const mapSearch = useMapSearch({
    geocoder: settings.onlineGeocoder,
    mapOpen: storyPanels.includes('map'),
    toggleStoryPanel,
    onChoosePlace: choosePlace,
    onQueryChanged: () => setPendingDestination(null),
  })
  const journeyActions = useJourneyManagement({
    resetChat: chat.reset,
    resetJourneyState,
    applyJourneyState,
    snapshot: journeySnapshot,
    deleteSavedJourney,
    clearMapSearch: mapSearch.clearSearch,
    closeAllPanels,
    setMapViewport,
    setSelectedPhoto,
    setRoute,
    setPendingDestination,
    setRouteState,
    setRouteMessage,
    memory: { people: knownPeople, entities: knownEntities, facts: userFacts },
    setMemory: { people: setKnownPeople, entities: setKnownEntities, facts: setUserFacts },
    importInputRef,
  })

  useEffect(() => () => { window.clearTimeout(arrivalTimer.current) }, [])

  useEffect(() => setSelectedPhoto(null), [selectedPlace])

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
    mapSearch.clearSearch()
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

  function sendMessage(event: React.FormEvent) {
    event.preventDefault()
    const trimmed = message.trim()
    if (!trimmed) return
    setMessage('')
    chat.send(trimmed)
  }

  return (
    <main className={`app-shell presentation-${presentationMode} ${storyMode ? 'story-mode' : 'explore-mode'} ${storyMode && storyPanels.includes('map') && storyPanels.includes('destination') ? 'story-map-and-destination' : ''} ${storyMode && storyPanels.includes('destination') && storyPanels.includes('travelogue') ? 'story-panels-stacked' : ''}`}>
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
          <label className="story-presentation-control">
            <span className="sr-only">Story presentation</span>
            <select aria-label="Story presentation" value={presentationMode} onChange={(event) => setSettings((current) => ({ ...current, storyPresentationMode: event.target.value as NonNullable<typeof current.storyPresentationMode> }))}>
              <option value="novel">Novel</option>
              <option value="visual-novel">Visual novel</option>
              <option value="chat">Chat</option>
            </select>
          </label>
          <button ref={settingsButton} className="icon-button" onClick={() => setShowSettings((visible) => !visible)} aria-label="Toggle settings">⚙</button>
        </div>
      </header>

      <section className="workspace">
        {storyMode && !selectedPlace && !messages.some((entry) => entry.role === 'user') && <OpeningScreen query={mapSearch.query} onQueryChange={mapSearch.updateQuery} onSearchLoadedPlaces={mapSearch.openMapForSearch} onOnlineShortcut={mapSearch.searchOnlineShortcut} />}
        {scenePhoto && <div className="scene-art" aria-label="Illustrative destination scene art">
          <img src={scenePhoto.sceneUrl ?? scenePhoto.imageUrl} alt="" />
          <div className="scene-art-shade" />
          <p className="scene-art-note">Illustrative photo · not a live view · {scenePhoto.author && `${scenePhoto.author} · `}{scenePhoto.license && <>{scenePhoto.license} · </>}<a href={scenePhoto.sourceUrl} target="_blank" rel="noreferrer">source</a></p>
        </div>}
        <StoryPanels
          panels={storyPanelState}
          search={mapSearch}
          placeData={placeData}
          settings={settings}
          selectedPlace={selectedPlace}
          setSelectedPlace={setSelectedPlace}
          selectedPhoto={selectedPhoto}
          scenePhoto={scenePhoto}
          setSelectedPhoto={setSelectedPhoto}
          journeyReady={journeyReady}
          mapViewport={mapViewport}
          setMapViewport={setMapViewport}
          route={route}
          pendingDestination={pendingDestination}
          onChoosePlace={choosePlace}
          onCompleteTransition={completeTransition}
          onClearRoute={() => { setSelectedPlace(null); setRoute(null) }}
          routeState={routeState}
          routeMessage={routeMessage}
          destinationHistory={destinationHistory}
          narrativeEvents={narrativeEvents}
          arrivalCard={arrivalCard}
          currentScene={currentScene}
          localArchive={localPmtiles.archive}
        />
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
          presentationMode={presentationMode}
          animatedEntryId={animatedEntryId}
          companionImageUrl={companionImageUrl}
        />
      </section>

      <JourneySettingsPanel
        open={showSettings}
        onClose={() => setShowSettings(false)}
        appSettings={appSettings}
        journeyActions={journeyActions}
        importInputRef={importInputRef}
        companionArtInputRef={companionArtInputRef}
        localPmtiles={localPmtiles}
        conversationSummary={conversationSummary}
        summaryState={summaryState}
        destinationCount={destinationHistory.length}
        eventCount={narrativeEvents.length}
        memory={{ people: knownPeople, entities: knownEntities, facts: userFacts }}
      />
    </main>
  )
}

export default App

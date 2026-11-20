import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { ArrivalCard } from './ArrivalCard'
import { FieldNotes } from './FieldNotes'
import { JournalPanel } from './JournalPanel'
import { PlaceDetails } from './PlaceDetails'
import { SelectedPhotoDetails } from './SelectedPhotoDetails'
import { useMapSearch } from '../hooks/useMapSearch'
import { usePlaceData } from '../hooks/usePlaceData'
import { useStoryPanels } from '../hooks/useStoryPanels'
import { useOfflineZone } from '../hooks/useOfflineZone'
import { enumerateZoneTiles, loadOpenFreeMapTileSource, tileUrl } from '../providers/offlineCache'
import { beginOfflineTileCache } from '../providers/offlineTileCache'
import { ZoneControls } from './ZoneControls'
import type { JourneyLeg, MapViewport, Place, PlacePhoto, UserSettings, WalkingRoute } from '../types/domain'
import type { NarrativeEvent } from '../types/domain'
import type { LocalPmtilesArchive } from '../providers/localPmtiles'
import { Icon } from './Icon'
import { MapResizeHandle } from './MapResizeHandle'
import { PlaceHighlightPanel } from './PlaceHighlightPanel'
import { filterForQuery } from '../providers/placeFilters'
import type { PlaceHighlight } from '../hooks/usePlaceHighlight'
import { SheetHandle } from './SheetHandle'
import type { ArrivalCardState } from './ArrivalCard'

const MapCanvas = lazy(() => import('./MapCanvas').then((module) => ({ default: module.MapCanvas })))
const PANEL_EXIT_DURATION = 220

function usePanelPresence(open: boolean, motionEnabled: boolean) {
  const [present, setPresent] = useState(open)

  useEffect(() => {
    if (open) {
      setPresent(true)
      return
    }
    if (!present) return

    const delay = motionEnabled ? PANEL_EXIT_DURATION : 0
    const timeout = window.setTimeout(() => setPresent(false), delay)
    return () => window.clearTimeout(timeout)
  }, [motionEnabled, open, present])

  return present
}

type Props = {
  panels: ReturnType<typeof useStoryPanels>
  search: ReturnType<typeof useMapSearch>
  placeData: ReturnType<typeof usePlaceData>
  settings: UserSettings
  motionEnabled: boolean
  selectedPlace: Place | null
  setSelectedPlace: (place: Place | null) => void
  selectedPhoto: PlacePhoto | null
  scenePhoto: PlacePhoto | null
  setSelectedPhoto: (photo: PlacePhoto | null, source?: HTMLElement | null) => void
  journeyReady: boolean
  mapViewport: MapViewport | null
  setMapViewport: (viewport: MapViewport) => void
  route: WalkingRoute | null
  pendingDestination: Place | null
  onChoosePlace: (place: Place) => void
  onCompleteTransition: (place: Place, withRoute: boolean) => void
  onClearRoute: () => void
  routeState: 'idle' | 'loading' | 'ready' | 'error'
  routeMessage: string
  destinationHistory: Place[]
  narrativeEvents: NarrativeEvent[]
  legs: JourneyLeg[]
  arrivalCard: ArrivalCardState | null
  currentScene: number
  localArchive: LocalPmtilesArchive | null
  onMapWidthChange: (width: number | undefined) => void
  highlight: PlaceHighlight
}

function photoToPlace(photo: PlacePhoto, fallback: Place): Place {
  return {
    id: `photo-${photo.id}`,
    name: photo.title,
    category: 'Photo Location',
    coordinates: photo.photoCoordinates || fallback.coordinates,
    source: 'map',
  }
}

export function StoryPanels({
  panels,
  search,
  placeData,
  settings,
  motionEnabled,
  selectedPlace,
  setSelectedPlace,
  selectedPhoto,
  scenePhoto,
  setSelectedPhoto,
  journeyReady,
  mapViewport,
  setMapViewport,
  route,
  pendingDestination,
  onChoosePlace,
  onCompleteTransition,
  onClearRoute,
  routeState,
  routeMessage,
  destinationHistory,
  narrativeEvents,
  legs,
  arrivalCard,
  currentScene,
  localArchive,
  onMapWidthChange,
  highlight,
}: Props) {
  const { storyMode, storyPanels, fieldNotesOpen, setFieldNotesOpen, mapExpanded, setMapExpanded, toggleStoryPanel, closeStoryPanel, toggleMode, dockButtons } = panels
  const mapOpen = storyPanels.includes('map')
  // A search like "restaurants" or "mall" can also highlight every match on the map.
  const keywordFilter = useMemo(() => filterForQuery(search.query, search.places), [search.places, search.query])
  const noLocalMatches = search.localResults.length === 0 && !keywordFilter
  const destinationOpen = storyMode && storyPanels.includes('destination')
  const travelogueOpen = storyMode && storyPanels.includes('travelogue')
  const mapPresent = usePanelPresence(mapOpen, motionEnabled)
  const destinationPresent = usePanelPresence(destinationOpen, motionEnabled)
  const traveloguePresent = usePanelPresence(travelogueOpen, motionEnabled)
  const mapPlace = useMemo(
    () => (selectedPhoto && selectedPlace ? photoToPlace(selectedPhoto, selectedPlace) : selectedPlace),
    [selectedPhoto, selectedPlace],
  )
  const offlineZone = useOfflineZone(mapViewport?.center ?? null, mapViewport?.zoom ?? null)
  const [flyToLegsSignal, setFlyToLegsSignal] = useState(0)
  // Changes caused by loading the saved journey are not "new": ignore them until the load has settled.
  const settled = useRef(false)
  useEffect(() => {
    if (!journeyReady) return
    const timer = window.setTimeout(() => { settled.current = true }, 0)
    return () => window.clearTimeout(timer)
  }, [journeyReady])
  // Journal dot: arrivals and other journey events added while the Journal is closed (chat messages do not count).
  const journeyEventCount = narrativeEvents.filter((event) => event.type !== 'message').length
  const [seenEventCount, setSeenEventCount] = useState(journeyEventCount)
  useEffect(() => {
    if (!settled.current || travelogueOpen || journeyEventCount < seenEventCount) setSeenEventCount(journeyEventCount)
  }, [journeyEventCount, seenEventCount, travelogueOpen])
  const journalUnseen = !travelogueOpen && journeyEventCount > seenEventCount
  // Place unlock: a one-off glow when the Place button first becomes available (not when a journey is restored).
  const placeAvailable = Boolean(selectedPlace)
  const placeWasAvailable = useRef(placeAvailable)
  const [placeUnlocked, setPlaceUnlocked] = useState(false)
  useEffect(() => {
    if (placeAvailable && !placeWasAvailable.current && settled.current) {
      setPlaceUnlocked(true)
      const timer = window.setTimeout(() => setPlaceUnlocked(false), 1400)
      placeWasAvailable.current = true
      return () => window.clearTimeout(timer)
    }
    placeWasAvailable.current = placeAvailable
  }, [placeAvailable])

  useEffect(() => {
    search.setOfflineZone(offlineZone.zone)
  }, [offlineZone.zone, search.setOfflineZone])

  async function cacheZone() {
    const zone = offlineZone.zone
    if (!zone) return
    let jobs
    let tileSource
    try {
      tileSource = await loadOpenFreeMapTileSource()
      jobs = enumerateZoneTiles(zone, tileSource.maxZoom)
    } catch (error) {
      offlineZone.reportCacheError(error)
      return
    }
    const tileUrls = jobs.map((job) => tileUrl(job, tileSource.tileTemplate))
    let tileCachePromise: ReturnType<typeof beginOfflineTileCache> | null = null
    const tileCacheSession: { current: Awaited<ReturnType<typeof beginOfflineTileCache>> | null } = { current: null }
    const getTileCache = async () => {
      tileCachePromise ??= beginOfflineTileCache(zone, tileUrls)
      const session = await tileCachePromise
      tileCacheSession.current = session
      return session
    }
    const result = await offlineZone.cacheZone(async (job, signal) => {
      const cache = await getTileCache()
      const url = tileUrl(job, tileSource.tileTemplate)
      const data = await cache.readOrFetch(url, signal, async (requestSignal) => fetch(url, { signal: requestSignal, mode: 'cors' }))
      const { placesFromVectorTile } = await import('../providers/vectorTilePlaces')
      return placesFromVectorTile(data, job, zone)
    }, async (places, generation) => {
      const cache = await getTileCache()
      const { writeOfflineIndex } = await import('../providers/offlineIndex')
      await writeOfflineIndex(zone, places, generation)
      await cache.commit(zone, generation, places.length)
    }, () => jobs, (job) => tileUrl(job, tileSource.tileTemplate))
    if (result?.status !== 'ready' && tileCacheSession.current) await tileCacheSession.current.rollback()
  }

  return (
    <>
      <div id="story-map-panel" aria-hidden={!mapOpen} inert={!mapOpen} className={`map-layout ${mapPresent ? `map-layout--compact ${mapOpen ? 'story-panel-open' : 'story-panel-closing'}` : ''} ${mapPresent && mapExpanded ? 'map-layout--expanded' : ''}`}>
        {mapPresent && <>
          {storyMode && !mapExpanded && <MapResizeHandle onCommit={onMapWidthChange} />}
          <aside className="map-history-panel panel" role="complementary" aria-labelledby="map-panel-label">
            <span id="map-panel-label" className="sr-only">Map navigation panel</span>
            {/* One header for the whole map panel: title, search and size/close controls on one row, so the map itself gets the space. */}
            <div className="map-header">
              <div className="map-header-title"><p className="eyebrow">Map</p><h3 id="map-panel-heading">{selectedPlace?.name ?? 'Explore'}</h3></div>
              <label className="dock-search"><Icon name="search" size={15} /><input value={search.query} onChange={(event) => search.updateQuery(event.target.value)} placeholder="Search places" /></label>
              <button className="map-size-button" type="button" onClick={() => setMapExpanded(!mapExpanded)} aria-pressed={mapExpanded} aria-label={mapExpanded ? 'Shrink map' : 'Expand map'} title={mapExpanded ? 'Shrink map' : 'Expand map'}><svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">{mapExpanded ? <path d="M6.5 2.5v4h-4M9.5 13.5v-4h4M6.5 6.5 2 2M9.5 9.5 14 14" /> : <path d="M2.5 6.5v-4h4M13.5 9.5v4h-4M2.5 2.5 7 7M13.5 13.5 9 9" />}</svg></button>
              <button className="close-button" type="button" onClick={() => { if (storyMode) closeStoryPanel('map'); else toggleMode() }} aria-label={storyMode ? 'Close map panel' : 'Return to story'}>×</button>
            </div>
            {destinationHistory.length > 0 && <div className="dock-history"><p className="result-label">Visited</p>{destinationHistory.slice().reverse().map((place) => <button key={place.id} type="button" onClick={() => onChoosePlace(place)}>{place.name}<span>{place.category ?? 'Place'}</span></button>)}</div>}
            {!selectedPlace && destinationHistory.length === 0 && <p className="dock-empty">Pan the map and click a place, or search for one.</p>}
          </aside>
          <section className="map-panel panel map-panel--compact">
            <div className="map-toolbar">
              <div><p className="eyebrow">Explore a place</p><h2>{selectedPlace?.name ?? 'Explore map'}</h2></div>
              <label className="search-box">
                <Icon name="search" size={15} />
                <input value={search.query} onChange={(event) => search.updateQuery(event.target.value)} placeholder="Search loaded places" />
              </label>
            </div>
            {search.query && search.mapStatus === 'loading' && <div className="search-state">Loading places from the visible map…</div>}
            {search.query && search.mapStatus === 'ready' && (search.localResults.length > 0 || keywordFilter) && <div className="search-results">
              {keywordFilter && <button className="search-highlight-option" onClick={() => { highlight.select(keywordFilter); search.clearSearch() }}>Highlight {keywordFilter.noun} on the map<span>Every match in the loaded map data</span></button>}
              {search.localResults.length > 0 && <p className="result-label">From loaded map data</p>}
              {search.localResults.map((place) => <button key={place.id} onClick={() => onChoosePlace(place)}>{place.name}<span>{place.category ?? 'Place'}</span></button>)}
            </div>}
            {search.query && search.mapStatus === 'ready' && noLocalMatches && search.offlineResults.length > 0 && <div className="search-results">
              <p className="result-label">From offline index{search.offlineIndexState === 'ready' ? '' : ' · preparing'}</p>
              {search.offlineResults.map((place) => <button key={place.id} onClick={() => onChoosePlace(place)}>{place.name}<span>{place.category ?? 'Place'}</span></button>)}
            </div>}
            {search.query && search.mapStatus === 'ready' && noLocalMatches && search.offlineResults.length === 0 && search.offlineIndexState === 'empty' && search.onlineState === 'idle' && <div className="online-search">No named places are available in the offline zone. <button onClick={() => void search.searchOnline()}>Search online</button></div>}
            {search.query && search.mapStatus === 'ready' && noLocalMatches && search.offlineResults.length === 0 && search.offlineIndexState === 'not-indexed' && search.onlineState === 'idle' && <div className="online-search">This zone has no saved offline search index. Cache the zone or <button onClick={() => void search.searchOnline()}>search online</button>.</div>}
            {search.query && search.mapStatus === 'ready' && noLocalMatches && search.offlineResults.length === 0 && search.offlineIndexState === 'ready' && search.onlineState === 'idle' && <div className="online-search">No indexed places match. <button onClick={() => void search.searchOnline()}>Search online</button></div>}
            {search.query && search.mapStatus === 'ready' && noLocalMatches && search.offlineResults.length === 0 && search.offlineIndexState === 'unavailable' && search.onlineState === 'idle' && <div className="online-search">Offline search is unavailable{search.offlineIndexError ? `: ${search.offlineIndexError}` : '.'} <button onClick={() => void search.searchOnline()}>Search online</button></div>}
            {search.query && search.mapStatus === 'ready' && noLocalMatches && search.offlineResults.length === 0 && search.offlineIndexState === 'idle' && search.onlineState === 'idle' && <div className="online-search">No loaded places match. <button onClick={() => void search.searchOnline()}>Search online</button></div>}
            {search.query && search.mapStatus === 'ready' && noLocalMatches && search.offlineResults.length === 0 && search.offlineIndexState !== 'empty' && search.onlineState === 'loading' && <div className="search-state">Searching {settings.onlineGeocoder === 'nominatim' ? 'Nominatim' : 'Photon'} for “{search.onlineQuery}”…</div>}
            {search.query && search.mapStatus === 'ready' && noLocalMatches && search.offlineResults.length === 0 && search.offlineIndexState !== 'empty' && search.onlineState === 'error' && <div className="online-search">{search.onlineError} <button onClick={() => void search.searchOnline()}>Try again</button></div>}
            {search.query && search.onlineQuery === search.query.trim() && search.onlineState === 'ready' && search.onlineResults.length > 0 && <div className="search-results">
              <p className="result-label">Online results{search.onlineCached ? ' · cached' : ' · live'}</p>
              {search.onlineResults.map((place) => <button key={place.id} onClick={() => onChoosePlace(place)}>{place.name}<span>{place.category ?? place.description ?? 'Place'}</span></button>)}
            </div>}
            {search.query && search.onlineQuery === search.query.trim() && search.onlineState === 'ready' && search.onlineResults.length === 0 && <div className="online-search">No online places matched. <button onClick={() => void search.searchOnline()}>Try another search</button></div>}
            {search.query && search.mapStatus === 'unavailable' && <div className="search-state">Loaded map data is unavailable. <button onClick={() => void search.searchOnline()}>Search online</button></div>}
            {journeyReady
              ? <Suspense fallback={<div className="map-loading">Loading map…</div>}><MapCanvas motionEnabled={motionEnabled} selectedPlace={mapPlace} initialViewport={mapViewport} onViewportChange={setMapViewport} route={route} localArchive={localArchive} legs={legs} flyToLegsSignal={flyToLegsSignal} offlineZone={offlineZone.zone} zoneEditing={offlineZone.editing} onZoneBoundsChange={(bounds) => { if (offlineZone.zone) void offlineZone.replaceZone({ ...offlineZone.zone, bounds }) }} onPlaceSelected={onChoosePlace} onPlacesLoaded={search.setPlaces} onMapStatusChange={search.setMapStatus} highlights={highlight.filter ? highlight.allMatches : undefined} highlightFocusId={highlight.focusId} onHighlightHover={highlight.setFocusId} onBoundsChange={highlight.setBounds} /></Suspense>
              : <div className="map-loading">Restoring journey…</div>}
            {journeyReady && search.mapStatus === 'ready' && !search.query && <PlaceHighlightPanel highlight={highlight} originName={selectedPlace?.name ?? null} liveDataEnabled={settings.liveDataEnabled} onChoosePlace={onChoosePlace} />}
            <ZoneControls zone={offlineZone.zone} progress={offlineZone.progress} editing={offlineZone.editing} cachePrompt={offlineZone.cachePrompt} onCache={() => void cacheZone()} onCancel={offlineZone.cancelCache} onToggleEditing={offlineZone.setEditing} onMaxZoomChange={(maxZoom) => { if (offlineZone.zone) void offlineZone.replaceZone({ ...offlineZone.zone, maxZoom }) }} onBoundsChange={(bounds) => { if (offlineZone.zone) void offlineZone.replaceZone({ ...offlineZone.zone, bounds }) }} />
            {pendingDestination && <div className="route-choice"><p className="eyebrow">Begin transition</p><strong>Walk from {selectedPlace?.name} to {pendingDestination.name}?</strong><p>Calculate an optional walking route before arriving.</p><div><button onClick={() => onCompleteTransition(pendingDestination, true)}>Walk there</button><button onClick={() => onCompleteTransition(pendingDestination, false)}>Arrive without route</button></div></div>}
            {routeState === 'loading' && <div className="route-status">Calculating walking route…</div>}
            {routeState === 'ready' && route && <div className="route-status">Walking route · {(route.distanceMeters / 1000).toFixed(1)} km · {Math.round(route.durationSeconds / 60)} min</div>}
            {routeState === 'error' && <div className="route-status route-error">{routeMessage} Continuing without a route.</div>}
            {selectedPlace && selectedPhoto && <SelectedPhotoDetails photo={selectedPhoto} destination={selectedPlace} onBack={() => setSelectedPhoto(null)} />}
            {selectedPlace && !selectedPhoto && <aside className="place-detail" aria-label="Selected destination">
              <div className="place-detail-header">
                <div><p className="eyebrow">Selected destination</p><h3>{selectedPlace.name}</h3></div>
                <button className="close-button" onClick={onClearRoute} aria-label="Clear selected destination">×</button>
              </div>
              <PlaceDetails layout="full" place={selectedPlace} geocoder={settings.onlineGeocoder} liveDataEnabled={settings.liveDataEnabled} {...placeData} onLoadWeather={(force) => void placeData.loadWeather(force)} onLoadNearbyData={(force) => void placeData.loadNearbyData(force)} scenePhoto={scenePhoto} onSelectPhoto={setSelectedPhoto} />
            </aside>}
            <div className="map-caption"><span>{localArchive?.attribution ?? 'Map data © OpenStreetMap contributors'}</span><span>{localArchive ? 'Local PMTiles archive' : 'OpenFreeMap'}</span></div>
          </section>
        </>}
      </div>
      {storyMode && <nav className="story-dock" aria-label="Story navigation">
        <button ref={(element) => { dockButtons.current.map = element }} className={storyPanels.includes('map') ? 'active' : ''} type="button" onClick={() => toggleStoryPanel('map')} aria-pressed={storyPanels.includes('map')} aria-controls="story-map-panel" aria-expanded={storyPanels.includes('map')}><Icon name="map" /><span>Map</span></button>
        <button ref={(element) => { dockButtons.current.destination = element }} disabled={!selectedPlace} className={`${storyPanels.includes('destination') ? 'active' : ''} ${placeUnlocked ? 'dock-unlock' : ''}`} type="button" onClick={() => toggleStoryPanel('destination')} aria-pressed={storyPanels.includes('destination')} aria-controls="story-destination-panel" aria-expanded={storyPanels.includes('destination')}><Icon name="place" /><span>Place</span></button>
        <button ref={(element) => { dockButtons.current.travelogue = element }} className={`${storyPanels.includes('travelogue') ? 'active' : ''} ${journalUnseen ? 'dock-unseen' : ''}`} type="button" onClick={() => toggleStoryPanel('travelogue')} aria-pressed={storyPanels.includes('travelogue')} aria-controls="story-travelogue-panel" aria-expanded={storyPanels.includes('travelogue')}><Icon name="journal" /><span>Journal</span></button>
      </nav>}
      {storyMode && destinationPresent && <aside id="story-destination-panel" aria-hidden={!destinationOpen} inert={!destinationOpen} className={`story-dock-panel destination-dock-panel ${destinationOpen ? 'story-panel-open' : 'story-panel-closing'}`} role="complementary" aria-labelledby="destination-panel-label">
        <span id="destination-panel-label" className="sr-only">Destination panel</span>
        <div className="story-dock-header">
          <div><p className="eyebrow">Examine</p><h3 id="destination-panel-heading">{selectedPlace?.name ?? 'Destination'}</h3></div>
          <button className="close-button" type="button" onClick={() => closeStoryPanel('destination')} aria-label="Close destination panel">×</button>
        </div>
        {selectedPlace
          ? selectedPhoto
            ? <SelectedPhotoDetails photo={selectedPhoto} destination={selectedPlace} onBack={() => setSelectedPhoto(null)} />
            : <PlaceDetails layout="compact" place={selectedPlace} geocoder={settings.onlineGeocoder} liveDataEnabled={settings.liveDataEnabled} {...placeData} onLoadWeather={(force) => void placeData.loadWeather(force)} onLoadNearbyData={(force) => void placeData.loadNearbyData(force)} scenePhoto={scenePhoto} onSelectPhoto={setSelectedPhoto} onOpenFieldNotes={() => setFieldNotesOpen(true)} />
          : <p className="dock-empty">Choose a place first, then return here to examine it.</p>}
        <SheetHandle onClose={() => closeStoryPanel('destination')} />
      </aside>}
      {storyMode && traveloguePresent && <JournalPanel events={narrativeEvents} legs={legs} isOpen={travelogueOpen} onClose={() => closeStoryPanel('travelogue')} onFitJourney={legs.length > 0 ? () => setFlyToLegsSignal((value) => value + 1) : undefined} />}
      {arrivalCard && <ArrivalCard {...arrivalCard} sceneNumber={currentScene} />}
      {fieldNotesOpen && selectedPlace && <FieldNotes place={selectedPlace} geocoder={settings.onlineGeocoder} liveDataEnabled={settings.liveDataEnabled} {...placeData} selectedPhoto={selectedPhoto} scenePhoto={scenePhoto} onLoadWeather={(force) => void placeData.loadWeather(force)} onLoadNearbyData={(force) => void placeData.loadNearbyData(force)} onSelectPhoto={setSelectedPhoto} onClose={() => setFieldNotesOpen(false)} />}
    </>
  )
}

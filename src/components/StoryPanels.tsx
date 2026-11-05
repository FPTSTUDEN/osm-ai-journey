import { lazy, Suspense, useMemo } from 'react'
import { ArrivalCard } from './ArrivalCard'
import { FieldNotes } from './FieldNotes'
import { JournalPanel } from './JournalPanel'
import { PlaceDetails } from './PlaceDetails'
import { useMapSearch } from '../hooks/useMapSearch'
import { usePlaceData } from '../hooks/usePlaceData'
import { useStoryPanels } from '../hooks/useStoryPanels'
import type { MapViewport, Place, PlacePhoto, UserSettings, WalkingRoute } from '../types/domain'
import type { NarrativeEvent } from '../types/domain'
import type { LocalPmtilesArchive } from '../providers/localPmtiles'

const MapCanvas = lazy(() => import('./MapCanvas').then((module) => ({ default: module.MapCanvas })))

type Props = {
  panels: ReturnType<typeof useStoryPanels>
  search: ReturnType<typeof useMapSearch>
  placeData: ReturnType<typeof usePlaceData>
  settings: UserSettings
  selectedPlace: Place | null
  setSelectedPlace: (place: Place | null) => void
  selectedPhoto: PlacePhoto | null
  setSelectedPhoto: (photo: PlacePhoto | null) => void
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
  arrivalCard: string | null
  currentScene: number
  localArchive: LocalPmtilesArchive | null
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
  selectedPlace,
  setSelectedPlace,
  selectedPhoto,
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
  arrivalCard,
  currentScene,
  localArchive,
}: Props) {
  const { storyMode, storyPanels, fieldNotesOpen, setFieldNotesOpen, toggleStoryPanel, closeStoryPanel, toggleMode, dockButtons } = panels
  const mapPlace = useMemo(
    () => (selectedPhoto && selectedPlace ? photoToPlace(selectedPhoto, selectedPlace) : selectedPlace),
    [selectedPhoto, selectedPlace],
  )

  return (
    <>
      <div id="story-map-panel" className={`map-layout ${storyPanels.includes('map') ? 'map-layout--compact' : ''}`}>
        {storyPanels.includes('map') && <>
          <section className="map-panel panel map-panel--compact">
            <div className="map-toolbar">
              <div><p className="eyebrow">Explore a place</p><h2>{selectedPlace?.name ?? 'Explore map'}</h2></div>
              <label className="search-box">
                <span aria-hidden="true">⌕</span>
                <input value={search.query} onChange={(event) => search.updateQuery(event.target.value)} placeholder="Search loaded places" />
              </label>
            </div>
            {search.query && search.mapStatus === 'loading' && <div className="search-state">Loading places from the visible map…</div>}
            {search.query && search.mapStatus === 'ready' && search.localResults.length > 0 && <div className="search-results">
              <p className="result-label">From loaded map data</p>
              {search.localResults.map((place) => <button key={place.id} onClick={() => onChoosePlace(place)}>{place.name}<span>{place.category ?? 'Place'}</span></button>)}
            </div>}
            {search.query && search.mapStatus === 'ready' && search.localResults.length === 0 && search.onlineState === 'idle' && <div className="online-search">No loaded places match. <button onClick={() => void search.searchOnline()}>Search online</button></div>}
            {search.query && search.mapStatus === 'ready' && search.localResults.length === 0 && search.onlineState === 'loading' && <div className="search-state">Searching {settings.onlineGeocoder === 'nominatim' ? 'Nominatim' : 'Photon'} for “{search.onlineQuery}”…</div>}
            {search.query && search.mapStatus === 'ready' && search.localResults.length === 0 && search.onlineState === 'error' && <div className="online-search">{search.onlineError} <button onClick={() => void search.searchOnline()}>Try again</button></div>}
            {search.query && search.onlineQuery === search.query.trim() && search.onlineState === 'ready' && search.onlineResults.length > 0 && <div className="search-results">
              <p className="result-label">Online results{search.onlineCached ? ' · cached' : ' · live'}</p>
              {search.onlineResults.map((place) => <button key={place.id} onClick={() => onChoosePlace(place)}>{place.name}<span>{place.category ?? place.description ?? 'Place'}</span></button>)}
            </div>}
            {search.query && search.onlineQuery === search.query.trim() && search.onlineState === 'ready' && search.onlineResults.length === 0 && <div className="online-search">No online places matched. <button onClick={() => void search.searchOnline()}>Try another search</button></div>}
            {search.query && search.mapStatus === 'unavailable' && <div className="search-state">Loaded map data is unavailable. <button onClick={() => void search.searchOnline()}>Search online</button></div>}
            {journeyReady
              ? <Suspense fallback={<div className="map-loading">Loading map…</div>}><MapCanvas selectedPlace={mapPlace} initialViewport={mapViewport} onViewportChange={setMapViewport} route={route} localArchive={localArchive} onPlaceSelected={onChoosePlace} onPlacesLoaded={search.setPlaces} onMapStatusChange={search.setMapStatus} /></Suspense>
              : <div className="map-loading">Restoring journey…</div>}
            {pendingDestination && <div className="route-choice"><p className="eyebrow">Begin transition</p><strong>Walk from {selectedPlace?.name} to {pendingDestination.name}?</strong><p>Calculate an optional walking route before arriving.</p><div><button onClick={() => onCompleteTransition(pendingDestination, true)}>Walk there</button><button onClick={() => onCompleteTransition(pendingDestination, false)}>Arrive without route</button></div></div>}
            {routeState === 'loading' && <div className="route-status">Calculating walking route…</div>}
            {routeState === 'ready' && route && <div className="route-status">Walking route · {(route.distanceMeters / 1000).toFixed(1)} km · {Math.round(route.durationSeconds / 60)} min</div>}
            {routeState === 'error' && <div className="route-status route-error">{routeMessage} Continuing without a route.</div>}
            {selectedPlace && selectedPhoto && <aside className="place-detail photo-detail" aria-label="Selected photo">
              <button type="button" className="back-button" onClick={() => setSelectedPhoto(null)}>← Back to {selectedPlace.name}</button>
              <img className="photo-detail-image" src={selectedPhoto.thumbnailUrl} alt={selectedPhoto.title} />
              <p className="eyebrow">Photo</p><h3 className="photo-detail-title">{selectedPhoto.title}</h3>
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
                <button className="close-button" onClick={onClearRoute} aria-label="Clear selected destination">×</button>
              </div>
              <PlaceDetails layout="full" place={selectedPlace} geocoder={settings.onlineGeocoder} liveDataEnabled={settings.liveDataEnabled} {...placeData} onLoadWeather={(force) => void placeData.loadWeather(force)} onLoadNearbyData={(force) => void placeData.loadNearbyData(force)} selectedPhoto={selectedPhoto} onSelectPhoto={setSelectedPhoto} />
            </aside>}
            <div className="map-caption"><span>{localArchive?.attribution ?? 'Map data © OpenStreetMap contributors'}</span><span>{localArchive ? 'Local PMTiles archive' : 'OpenFreeMap'}</span></div>
          </section>
          <aside className="map-history-panel panel" role="complementary" aria-labelledby="map-panel-label">
            <span id="map-panel-label" className="sr-only">Map navigation panel</span>
            <div className="story-dock-header">
              <div><p className="eyebrow">Navigate</p><h3 id="map-panel-heading">Map</h3></div>
              <button className="close-button" type="button" onClick={() => { if (storyMode) closeStoryPanel('map'); else toggleMode() }} aria-label={storyMode ? 'Close map panel' : 'Return to story'}>×</button>
            </div>
            <label className="dock-search"><span aria-hidden="true">⌕</span><input value={search.query} onChange={(event) => search.updateQuery(event.target.value)} placeholder="Search places" /></label>
            {destinationHistory.length > 0 && <div className="dock-history"><p className="result-label">Visited places</p>{destinationHistory.slice().reverse().map((place) => <button key={place.id} type="button" onClick={() => onChoosePlace(place)}>{place.name}<span>{place.category ?? 'Place'}</span></button>)}</div>}
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
          ? <PlaceDetails layout="compact" place={selectedPlace} geocoder={settings.onlineGeocoder} liveDataEnabled={settings.liveDataEnabled} {...placeData} onLoadWeather={(force) => void placeData.loadWeather(force)} onLoadNearbyData={(force) => void placeData.loadNearbyData(force)} selectedPhoto={selectedPhoto} onSelectPhoto={setSelectedPhoto} onOpenFieldNotes={() => setFieldNotesOpen(true)} />
          : <p className="dock-empty">Choose a place first, then return here to examine it.</p>}
      </aside>}
      {storyMode && storyPanels.includes('travelogue') && <JournalPanel events={narrativeEvents} onClose={() => closeStoryPanel('travelogue')} />}
      {arrivalCard && <ArrivalCard placeName={arrivalCard} sceneNumber={currentScene} />}
      {fieldNotesOpen && selectedPlace && <FieldNotes place={selectedPlace} geocoder={settings.onlineGeocoder} liveDataEnabled={settings.liveDataEnabled} {...placeData} onLoadWeather={(force) => void placeData.loadWeather(force)} onLoadNearbyData={(force) => void placeData.loadNearbyData(force)} selectedPhoto={selectedPhoto} onSelectPhoto={setSelectedPhoto} onClose={() => setFieldNotesOpen(false)} />}
    </>
  )
}

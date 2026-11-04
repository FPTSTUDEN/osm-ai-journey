import { weatherLabel, type WeatherResult } from '../providers/weather'
import type { PlaceContext } from '../providers/enrichment'
import type { Place, PlacePhoto, UserSettings } from '../types/domain'

type PlaceDetailsProps = {
  layout: 'full' | 'compact'
  place: Place
  geocoder: UserSettings['onlineGeocoder']
  liveDataEnabled: boolean
  context: PlaceContext | null
  contextState: 'idle' | 'loading' | 'ready' | 'error'
  contextCached: boolean
  weather: WeatherResult | null
  weatherState: 'idle' | 'loading' | 'ready' | 'error'
  weatherError: string
  onLoadWeather: (force?: boolean) => void
  photos: PlacePhoto[]
  photosState: 'idle' | 'loading' | 'ready' | 'error'
  photosCached: boolean
  selectedPhoto: PlacePhoto | null
  onSelectPhoto: (photo: PlacePhoto) => void
  onOpenFieldNotes?: () => void
}

export function PlaceDetails({
  layout,
  place,
  geocoder,
  liveDataEnabled,
  context,
  contextState,
  contextCached,
  weather,
  weatherState,
  weatherError,
  onLoadWeather,
  photos,
  photosState,
  photosCached,
  selectedPhoto,
  onSelectPhoto,
  onOpenFieldNotes,
}: PlaceDetailsProps) {
  const compact = layout === 'compact'
  return (
    <div className={`place-details place-details--${layout}`}>
      {!compact && <p className="place-category">{place.category ?? 'Place'}</p>}
      <dl className={`place-facts ${compact ? 'dock-facts' : ''}`}>
        <div><dt>Coordinates</dt><dd>{place.coordinates[1].toFixed(5)}, {place.coordinates[0].toFixed(5)}</dd></div>
        {!compact && place.osmType && place.osmId && <div><dt>OSM feature</dt><dd>{place.osmType}/{place.osmId}</dd></div>}
        <div><dt>Source</dt><dd>{place.source === 'online' ? `Online · ${geocoder}` : compact ? 'OpenStreetMap' : 'Loaded OpenFreeMap data'}</dd></div>
      </dl>
      {!compact && <div className="weather-panel">
        <div className="weather-heading"><p className="context-label">Current weather</p>{weather && <span className={`weather-source weather-${weather.source}`}>{weather.source}</span>}</div>
        {!liveDataEnabled && <p className="context-state">Enable optional live data in settings to request weather.</p>}
        {liveDataEnabled && weatherState === 'idle' && <button className="weather-button" onClick={() => onLoadWeather()}>Load current weather</button>}
        {weatherState === 'loading' && <p className="context-state">Fetching current conditions…</p>}
        {weatherState === 'error' && <><p className="context-state">{weatherError}</p><button className="weather-button" onClick={() => onLoadWeather(true)}>Try weather again</button></>}
        {weatherState === 'ready' && weather && <><div className="weather-reading"><strong>{weather.data.temperatureC.toFixed(1)}°C</strong><span>{weatherLabel(weather.data.weatherCode)} · feels like {weather.data.apparentTemperatureC.toFixed(1)}°C</span></div><p className="weather-meta">Wind {weather.data.windSpeedKmh.toFixed(0)} km/h · observed {weather.data.observedAt.replace('T', ' ')}</p><button className="weather-button" onClick={() => onLoadWeather(true)}>Refresh weather</button></>}
      </div>}
      {contextState === 'loading' && <p className="context-state">{compact ? 'Loading destination context…' : 'Loading Wikipedia and Wikidata context…'}</p>}
      {contextState === 'error' && <p className="context-state">Optional destination context is unavailable.</p>}
      {contextState === 'ready' && context && <div className="place-context">
        <p className="context-label">Source context · {contextCached ? 'cached' : 'live'}</p>
        {context.summary && <p className="context-summary">{context.summary}</p>}
        {context.facts.length > 0 && <dl className="context-facts">{context.facts.map((fact) => <div key={`${fact.label}-${fact.value}`}><dt>{fact.label}</dt><dd>{fact.value}</dd></div>)}</dl>}
        <div className="context-links">
          {context.wikipediaUrl && <a href={context.wikipediaUrl} target="_blank" rel="noreferrer">Wikipedia</a>}
          {context.wikidataId && <a href={`https://www.wikidata.org/wiki/${context.wikidataId}`} target="_blank" rel="noreferrer">Wikidata</a>}
        </div>
        {!context.summary && context.facts.length === 0 && <p className="context-state">No source context found for this place.</p>}
      </div>}
      <div className="place-photos">
        <div className="weather-heading"><p className="context-label">{compact ? 'Nearby photos · scene art' : 'Illustrative photos'}</p>{photosCached && <span className="weather-source weather-cached">cached</span>}</div>
        {photosState === 'loading' && <p className="context-state">Finding nearby Wikimedia Commons photos…</p>}
        {photosState === 'error' && <p className="context-state">Photos are unavailable for this destination.</p>}
        {photosState === 'ready' && photos.length === 0 && <p className="context-state">No nearby photos found.</p>}
        {photos.length > 0 && (compact
          ? <div className="dock-gallery">{photos.map((photo) => <button key={photo.id} type="button" className={selectedPhoto?.id === photo.id ? 'selected' : ''} onClick={() => onSelectPhoto(photo)} aria-pressed={selectedPhoto?.id === photo.id}><img src={photo.thumbnailUrl} alt={photo.title} /><span>{photo.title}</span></button>)}</div>
          : <div className="photo-grid">{photos.map((photo) => {
            const distanceLabel = photo.distanceMeters === undefined ? '' : photo.distanceMeters < 50 ? 'At destination' : `${(photo.distanceMeters / 1000).toFixed(1)} km away`
            return <button key={photo.id} onClick={() => onSelectPhoto(photo)} className="photo-card"><img src={photo.thumbnailUrl} alt={photo.title} loading="lazy" /><div className="photo-info"><span className="photo-title">{photo.title}</span>{distanceLabel && <span className="photo-distance">{distanceLabel}</span>}</div></button>
          })}</div>)}
        {!compact && photos.length > 0 && <p className="photo-note">Photos within 1 km search radius. Images are for illustration. Photo titles, captions, and source metadata may inform the companion.</p>}
        {compact && selectedPhoto && <div className="selected-scene-photo"><span>Scene art · illustrative, not a live view</span><a href={selectedPhoto.sourceUrl} target="_blank" rel="noreferrer">Photo source</a></div>}
      </div>
      {compact && onOpenFieldNotes && <button className="field-notes-button" type="button" onClick={onOpenFieldNotes}>Open field notes</button>}
    </div>
  )
}

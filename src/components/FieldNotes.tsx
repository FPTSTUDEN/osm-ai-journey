import { PlaceDetails } from './PlaceDetails'
import { SelectedPhotoDetails } from './SelectedPhotoDetails'
import type { PlaceContext } from '../providers/enrichment'
import type { WeatherResult } from '../providers/weather'
import type { NearbyPlaceDataResult } from '../providers/overpass'
import type { Place, PlacePhoto, UserSettings } from '../types/domain'

type FieldNotesProps = {
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
  nearbyData: NearbyPlaceDataResult | null
  nearbyDataState: 'idle' | 'loading' | 'ready' | 'error'
  nearbyDataError: string
  onLoadNearbyData: (force?: boolean) => void
  photos: PlacePhoto[]
  photosState: 'idle' | 'loading' | 'ready' | 'error'
  photosCached: boolean
  selectedPhoto: PlacePhoto | null
  scenePhoto: PlacePhoto | null
  onSelectPhoto: (photo: PlacePhoto | null) => void
  onClose: () => void
}

export function FieldNotes({ place, onClose, selectedPhoto, ...details }: FieldNotesProps) {
  return (
    <aside className="field-notes panel" aria-label="Destination field notes">
      <div className="settings-header">
        <div><p className="eyebrow">Field notes</p><h2>{place.name}</h2></div>
        <button className="close-button" type="button" onClick={onClose} aria-label="Close field notes">×</button>
      </div>
      <p className="field-notes-intro">Source-backed context for this scene. Illustrations and live readings are labeled separately.</p>
      {selectedPhoto
        ? <SelectedPhotoDetails photo={selectedPhoto} destination={place} onBack={() => details.onSelectPhoto(null)} />
        : <PlaceDetails {...details} layout="full" place={place} />}
    </aside>
  )
}

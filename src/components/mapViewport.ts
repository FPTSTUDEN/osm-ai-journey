import type { MapViewport, Place } from '../types/domain'

export const DEFAULT_MAP_VIEWPORT: MapViewport = {
  center: [2.3522, 48.8566],
  zoom: 11.5,
}

export function getInitialMapViewport(selectedPlace: Place | null, savedViewport: MapViewport | null): MapViewport {
  if (selectedPlace) return { center: selectedPlace.coordinates, zoom: 14 }
  return savedViewport ?? DEFAULT_MAP_VIEWPORT
}

import { useEffect, useRef } from 'react'
import maplibregl, { type Map as MapLibreMap, type MapMouseEvent, type Marker } from 'maplibre-gl'
import { OPENFREEMAP_STYLE } from '../providers/config'
import { deduplicatePlaces, placeFromFeature } from '../providers/localPlaceIndex'
import type { Place } from '../types/domain'
import 'maplibre-gl/dist/maplibre-gl.css'

type MapCanvasProps = {
  onPlaceSelected: (place: Place) => void
  onPlacesLoaded: (places: Place[]) => void
  onMapStatusChange: (status: 'loading' | 'ready' | 'unavailable') => void
  selectedPlace: Place | null
}

export function MapCanvas({ onPlaceSelected, onPlacesLoaded, onMapStatusChange, selectedPlace }: MapCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const markerRef = useRef<Marker | null>(null)
  const onPlaceSelectedRef = useRef(onPlaceSelected)
  const onPlacesLoadedRef = useRef(onPlacesLoaded)
  const onMapStatusChangeRef = useRef(onMapStatusChange)

  onPlaceSelectedRef.current = onPlaceSelected
  onPlacesLoadedRef.current = onPlacesLoaded
  onMapStatusChangeRef.current = onMapStatusChange

  useEffect(() => {
    if (!containerRef.current) return
    onMapStatusChangeRef.current('loading')

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: OPENFREEMAP_STYLE,
      center: [2.3522, 48.8566],
      zoom: 11.5,
    })
    let mapLoaded = false
    mapRef.current = map
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right')

    const collectLoadedPlaces = () => {
      const places: Place[] = []
      const sources = Object.entries(map.getStyle().sources)
        .filter(([, source]) => source.type === 'vector')
        .map(([sourceId]) => sourceId)

      for (const sourceId of sources) {
        try {
          map.querySourceFeatures(sourceId).forEach((feature) => {
            const place = placeFromFeature(feature)
            if (place) places.push(place)
          })
        } catch {
          // A source can be declared before its first tile is available.
        }
      }

      onPlacesLoadedRef.current(deduplicatePlaces(places))
    }

    const handleClick = (event: MapMouseEvent) => {
      const feature = map.queryRenderedFeatures(event.point).map(placeFromFeature).find(Boolean)
      if (feature) onPlaceSelectedRef.current(feature)
    }

    map.on('load', () => {
      mapLoaded = true
      onMapStatusChangeRef.current('ready')
      collectLoadedPlaces()
    })
    map.on('idle', collectLoadedPlaces)
    map.on('click', handleClick)
    map.on('error', () => {
      if (!mapLoaded) onMapStatusChangeRef.current('unavailable')
    })

    return () => {
      markerRef.current?.remove()
      map.remove()
      mapRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !selectedPlace) return

    markerRef.current?.remove()
    markerRef.current = new maplibregl.Marker({ color: '#d5ef9a' })
      .setLngLat(selectedPlace.coordinates)
      .addTo(map)
    map.flyTo({ center: selectedPlace.coordinates, zoom: Math.max(map.getZoom(), 14), essential: true })
  }, [selectedPlace])

  return <div className="map-canvas" ref={containerRef} aria-label="Interactive OpenStreetMap map" role="application" />
}

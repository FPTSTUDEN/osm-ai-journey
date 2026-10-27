import { useEffect, useRef } from 'react'
import maplibregl, { type Map as MapLibreMap, type MapMouseEvent } from 'maplibre-gl'
import { OPENFREEMAP_STYLE } from '../providers/config'
import { placeFromFeature } from '../providers/localPlaceIndex'
import type { Place } from '../types/domain'
import 'maplibre-gl/dist/maplibre-gl.css'

type MapCanvasProps = {
  onPlaceSelected: (place: Place) => void
  onPlacesLoaded: (places: Place[]) => void
}

export function MapCanvas({ onPlaceSelected, onPlacesLoaded }: MapCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)

  useEffect(() => {
    if (!containerRef.current) return

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: OPENFREEMAP_STYLE,
      center: [2.3522, 48.8566],
      zoom: 11.5,
    })
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

      const unique = [...new Map(places.map((place) => [place.id, place])).values()]
      onPlacesLoaded(unique)
    }

    const handleClick = (event: MapMouseEvent) => {
      const feature = map.queryRenderedFeatures(event.point).map(placeFromFeature).find(Boolean)
      if (feature) onPlaceSelected(feature)
    }

    map.on('load', collectLoadedPlaces)
    map.on('idle', collectLoadedPlaces)
    map.on('click', handleClick)

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [onPlaceSelected, onPlacesLoaded])

  return <div className="map-canvas" ref={containerRef} aria-label="Interactive OpenStreetMap map" />
}

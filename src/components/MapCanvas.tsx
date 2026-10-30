import { useEffect, useRef } from 'react'
import * as maplibregl from 'maplibre-gl'
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import type { GeoJSONFeature, Map as MapLibreMap, MapMouseEvent, Marker } from 'maplibre-gl'
import { OPENFREEMAP_STYLE } from '../providers/config'
import { deduplicatePlaces, placeFromFeature } from '../providers/localPlaceIndex'
import { getInitialMapViewport } from './mapViewport'
import type { MapViewport, Place, WalkingRoute } from '../types/domain'
import 'maplibre-gl/dist/maplibre-gl.css'

maplibregl.setWorkerUrl(maplibreWorkerUrl)

type MapCanvasProps = {
  onPlaceSelected: (place: Place) => void
  onPlacesLoaded: (places: Place[]) => void
  onMapStatusChange: (status: 'loading' | 'ready' | 'unavailable') => void
  selectedPlace: Place | null
  initialViewport: MapViewport | null
  onViewportChange: (viewport: MapViewport) => void
  route: WalkingRoute | null
}

export function MapCanvas({ onPlaceSelected, onPlacesLoaded, onMapStatusChange, selectedPlace, initialViewport, onViewportChange, route }: MapCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const markerRef = useRef<Marker | null>(null)
  const previousSelectedPlaceIdRef = useRef(selectedPlace?.id ?? null)
  const onPlaceSelectedRef = useRef(onPlaceSelected)
  const onPlacesLoadedRef = useRef(onPlacesLoaded)
  const onMapStatusChangeRef = useRef(onMapStatusChange)
  const onViewportChangeRef = useRef(onViewportChange)

  onPlaceSelectedRef.current = onPlaceSelected
  onPlacesLoadedRef.current = onPlacesLoaded
  onMapStatusChangeRef.current = onMapStatusChange
  onViewportChangeRef.current = onViewportChange

  useEffect(() => {
    if (!containerRef.current) return
    onMapStatusChangeRef.current('loading')

    const viewport = getInitialMapViewport(selectedPlace, initialViewport)
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: OPENFREEMAP_STYLE,
      center: viewport.center,
      zoom: viewport.zoom,
    })
    let mapLoaded = false
    mapRef.current = map
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right')

    const saveViewport = () => {
      const center = map.getCenter()
      onViewportChangeRef.current({ center: [center.lng, center.lat], zoom: map.getZoom() })
    }

    const collectLoadedPlaces = () => {
      const places: Place[] = []
      const sources = Object.entries(map.getStyle().sources)
        .filter(([, source]) => (source as { type?: string }).type === 'vector')
        .map(([sourceId]) => sourceId)

      for (const sourceId of sources) {
        try {
            map.querySourceFeatures(sourceId).forEach((feature: GeoJSONFeature) => {
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
      const feature = map.queryRenderedFeatures(event.point).map((item) => placeFromFeature(item)).find(Boolean)
      if (feature) onPlaceSelectedRef.current(feature)
    }

    map.on('load', () => {
      mapLoaded = true
      onMapStatusChangeRef.current('ready')
      saveViewport()
      collectLoadedPlaces()
    })
    map.on('moveend', saveViewport)
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
    const previousSelectedPlaceId = previousSelectedPlaceIdRef.current
    previousSelectedPlaceIdRef.current = selectedPlace?.id ?? null
    const map = mapRef.current
    if (!map) return

    if (!selectedPlace) {
      markerRef.current?.remove()
      markerRef.current = null
      return
    }

    markerRef.current?.remove()
    markerRef.current = new maplibregl.Marker({ color: '#d5ef9a' })
      .setLngLat(selectedPlace.coordinates)
      .addTo(map)

    const focusSelectedPlace = () => {
      if (previousSelectedPlaceId === selectedPlace.id) return
      map.flyTo({ center: selectedPlace.coordinates, zoom: Math.max(map.getZoom(), 14), essential: true })
    }

    if (map.isStyleLoaded()) focusSelectedPlace()
    else map.once('load', focusSelectedPlace)

    return () => { map.off('load', focusSelectedPlace) }
  }, [selectedPlace])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !route) return
    const sourceId = 'walking-route'
    const layerId = 'walking-route-line'
    const removeRoute = () => {
      if (map.getLayer(layerId)) map.removeLayer(layerId)
      if (map.getSource(sourceId)) map.removeSource(sourceId)
    }
    const drawRoute = () => {
      removeRoute()
      map.addSource(sourceId, {
        type: 'geojson',
        data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: route.coordinates } },
      })
      map.addLayer({ id: layerId, type: 'line', source: sourceId, layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#d5ef9a', 'line-width': 4, 'line-opacity': 0.9 } })
    }
    if (map.isStyleLoaded()) drawRoute()
    else map.once('load', drawRoute)
    return () => {
      map.off('load', drawRoute)
      removeRoute()
    }
  }, [route])

  return <div className="map-canvas" ref={containerRef} aria-label="Interactive OpenStreetMap map" role="application" />
}

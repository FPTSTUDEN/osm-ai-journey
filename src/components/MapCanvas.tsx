import { memo, useEffect, useRef } from 'react'
import * as maplibregl from 'maplibre-gl'
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import type { GeoJSONFeature, Map as MapLibreMap, MapMouseEvent, Marker, StyleSpecification } from 'maplibre-gl'
import { Protocol, TileType } from 'pmtiles'
import { OPENFREEMAP_STYLE } from '../providers/config'
import type { LocalPmtilesArchive } from '../providers/localPmtiles'
import { deduplicatePlaces, placeFromFeature } from '../providers/localPlaceIndex'
import { getInitialMapViewport } from './mapViewport'
import type { MapViewport, Place, WalkingRoute } from '../types/domain'
import 'maplibre-gl/dist/maplibre-gl.css'

maplibregl.setWorkerUrl(maplibreWorkerUrl)
const pmtilesProtocol = new Protocol()
maplibregl.addProtocol('pmtiles', pmtilesProtocol.tile)

type MapCanvasProps = {
  motionEnabled: boolean
  onPlaceSelected: (place: Place) => void
  onPlacesLoaded: (places: Place[]) => void
  onMapStatusChange: (status: 'loading' | 'ready' | 'unavailable') => void
  selectedPlace: Place | null
  initialViewport: MapViewport | null
  onViewportChange: (viewport: MapViewport) => void
  route: WalkingRoute | null
  localArchive: LocalPmtilesArchive | null
}

function localArchiveStyle(archive: LocalPmtilesArchive): StyleSpecification {
  const sourceKey = archive.pmtiles.source.getKey()
  const sourceUrl = `pmtiles://${sourceKey}`
  const sources: StyleSpecification['sources'] = archive.tileType === TileType.Mvt
    ? { offline: { type: 'vector', url: sourceUrl, bounds: archive.bounds, minzoom: archive.minZoom, maxzoom: archive.maxZoom, attribution: 'Local PMTiles archive' } }
    : { offline: { type: 'raster', tiles: [`${sourceUrl}/{z}/{x}/{y}`], bounds: archive.bounds, minzoom: archive.minZoom, maxzoom: archive.maxZoom, tileSize: 256, attribution: 'Local PMTiles archive' } }
  const layers: StyleSpecification['layers'] = [{ id: 'offline-background', type: 'background', paint: { 'background-color': '#132b26' } }]

  if (archive.tileType !== TileType.Mvt) {
    layers.push({ id: 'offline-raster', type: 'raster', source: 'offline', paint: { 'raster-opacity': 1 } })
    return { version: 8, sources, layers }
  }

  for (const sourceLayer of archive.vectorLayers) {
    const layerName = sourceLayer.toLowerCase()
    const layerId = sourceLayer.replace(/[^a-zA-Z0-9_-]/g, '-') || 'layer'
    let styled = false
    if (/water|ocean|lake|landcover|landuse|park|building|earth|land/.test(layerName)) {
      styled = true
      layers.push({
        id: `offline-fill-${layerId}`,
        type: 'fill',
        source: 'offline',
        'source-layer': sourceLayer,
        paint: { 'fill-color': /water|ocean|lake/.test(layerName) ? '#315d66' : /building/.test(layerName) ? '#536258' : '#263f35', 'fill-opacity': 0.9 },
      })
    }
    if (/road|transport|waterway|boundary|rail|path|bridge|tunnel/.test(layerName)) {
      styled = true
      layers.push({
        id: `offline-line-${layerId}`,
        type: 'line',
        source: 'offline',
        'source-layer': sourceLayer,
        paint: { 'line-color': /waterway/.test(layerName) ? '#4c8490' : '#b4c58e', 'line-width': 1.5, 'line-opacity': 0.8 },
      })
    }
    if (!styled) {
      layers.push(
        { id: `offline-fill-${layerId}`, type: 'fill', source: 'offline', 'source-layer': sourceLayer, filter: ['==', '$type', 'Polygon'], paint: { 'fill-color': '#31483a', 'fill-opacity': 0.8 } },
        { id: `offline-line-${layerId}`, type: 'line', source: 'offline', 'source-layer': sourceLayer, filter: ['==', '$type', 'LineString'], paint: { 'line-color': '#9daf82', 'line-width': 1.2, 'line-opacity': 0.8 } },
        { id: `offline-point-${layerId}`, type: 'circle', source: 'offline', 'source-layer': sourceLayer, filter: ['==', '$type', 'Point'], paint: { 'circle-color': '#d5ef9a', 'circle-radius': 2.5 } },
      )
    }
  }
  return { version: 8, sources, layers }
}

export const MapCanvas = memo(function MapCanvas({ motionEnabled, onPlaceSelected, onPlacesLoaded, onMapStatusChange, selectedPlace, initialViewport, onViewportChange, route, localArchive }: MapCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const markerRef = useRef<Marker | null>(null)
  const activeArchiveKeyRef = useRef<string | null>(null)
  const onPlaceSelectedRef = useRef(onPlaceSelected)
  const onPlacesLoadedRef = useRef(onPlacesLoaded)
  const onMapStatusChangeRef = useRef(onMapStatusChange)
  const onViewportChangeRef = useRef(onViewportChange)
  const motionEnabledRef = useRef(motionEnabled)

  onPlaceSelectedRef.current = onPlaceSelected
  onPlacesLoadedRef.current = onPlacesLoaded
  onMapStatusChangeRef.current = onMapStatusChange
  onViewportChangeRef.current = onViewportChange
  motionEnabledRef.current = motionEnabled

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
    const resizeObserver = new ResizeObserver(() => map.resize())
    resizeObserver.observe(containerRef.current)
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
    // `moveend`, not `move`: `move` fires every frame and re-rendered the whole app while panning.
    map.on('moveend', saveViewport)
    map.on('idle', collectLoadedPlaces)
    map.on('click', handleClick)
    map.on('error', () => {
      if (!mapLoaded) onMapStatusChangeRef.current('unavailable')
    })

    return () => {
      resizeObserver.disconnect()
      markerRef.current?.remove()
      map.remove()
      mapRef.current = null
      if (activeArchiveKeyRef.current) pmtilesProtocol.tiles.delete(activeArchiveKeyRef.current)
      activeArchiveKeyRef.current = null
    }
  }, [])

  useEffect(() => {
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

    map.flyTo({ center: selectedPlace.coordinates, zoom: Math.max(map.getZoom(), 14), duration: motionEnabledRef.current ? 1000 : 0 })
  }, [selectedPlace])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (localArchive) {
      const sourceKey = localArchive.pmtiles.source.getKey()
      pmtilesProtocol.add(localArchive.pmtiles)
      map.setStyle(localArchiveStyle(localArchive), { diff: false })
      map.fitBounds(localArchive.bounds, { padding: 32, duration: 0 })
      activeArchiveKeyRef.current = sourceKey
    } else if (activeArchiveKeyRef.current) {
      map.setStyle(OPENFREEMAP_STYLE, { diff: false })
      pmtilesProtocol.tiles.delete(activeArchiveKeyRef.current)
      activeArchiveKeyRef.current = null
    }
  }, [localArchive])

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
      if (route.coordinates.length > 1) {
        const bounds = route.coordinates.reduce((result, coordinate) => result.extend(coordinate), new maplibregl.LngLatBounds(route.coordinates[0], route.coordinates[0]))
        map.fitBounds(bounds, { padding: 48, maxZoom: 14, duration: motionEnabledRef.current ? 1000 : 0 })
      }
    }
    if (map.isStyleLoaded()) drawRoute()
    else map.once('load', drawRoute)
    return () => {
      map.off('load', drawRoute)
      removeRoute()
    }
  }, [route, localArchive])

  return <div className="map-canvas" ref={containerRef} aria-label="Interactive map" role="application" />
})

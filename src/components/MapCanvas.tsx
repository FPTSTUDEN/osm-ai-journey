import { memo, useEffect, useRef } from 'react'
import * as maplibregl from 'maplibre-gl'
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import type { GeoJSONFeature, Map as MapLibreMap, MapMouseEvent, Marker, StyleSpecification } from 'maplibre-gl'
import { Protocol, TileType } from 'pmtiles'
import { OPENFREEMAP_STYLE } from '../providers/config'
import type { LocalPmtilesArchive } from '../providers/localPmtiles'
import { deduplicatePlaces, placeFromFeature } from '../providers/localPlaceIndex'
import type { OfflineZone } from '../storage/offlineZones'
import { getInitialMapViewport } from './mapViewport'
import type { JourneyLeg, MapViewport, Place, WalkingRoute } from '../types/domain'
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
  offlineZone: OfflineZone | null
  zoneEditing: boolean
  onZoneBoundsChange: (bounds: OfflineZone['bounds']) => void
  legs?: JourneyLeg[]
  /** Increment to trigger a fit-to-journey animation. */
  flyToLegsSignal?: number
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

/**
 * Draw every journey leg. Routed legs are solid; the active leg is highlighted;
 * earlier legs are muted. Unrouted transitions get a dashed faint line so they
 * are visibly not a walking route.
 */
function legFeatureCollection(legs: JourneyLeg[]) {
  const features = legs.flatMap((leg, index) => {
    const active = index === legs.length - 1
    if (leg.routed) {
      if (!leg.geometry || leg.geometry.length < 2) return []
      return [{ type: 'Feature' as const, properties: { kind: 'routed', active }, geometry: { type: 'LineString' as const, coordinates: leg.geometry } }]
    }
    return [{ type: 'Feature' as const, properties: { kind: 'unrouted', active }, geometry: { type: 'LineString' as const, coordinates: [leg.from?.coordinates ?? leg.to.coordinates, leg.to.coordinates] } }]
  })
  return { type: 'FeatureCollection' as const, features }
}

export const MapCanvas = memo(function MapCanvas({ motionEnabled, onPlaceSelected, onPlacesLoaded, onMapStatusChange, selectedPlace, initialViewport, onViewportChange, route, localArchive, legs, flyToLegsSignal, offlineZone, zoneEditing, onZoneBoundsChange }: MapCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const markerRef = useRef<Marker | null>(null)
  const zoneMarkersRef = useRef<Marker[]>([])
  const activeArchiveKeyRef = useRef<string | null>(null)
  const onPlaceSelectedRef = useRef(onPlaceSelected)
  const onPlacesLoadedRef = useRef(onPlacesLoaded)
  const onMapStatusChangeRef = useRef(onMapStatusChange)
  const onViewportChangeRef = useRef(onViewportChange)
  const onZoneBoundsChangeRef = useRef(onZoneBoundsChange)
  const motionEnabledRef = useRef(motionEnabled)

  onPlaceSelectedRef.current = onPlaceSelected
  onPlacesLoadedRef.current = onPlacesLoaded
  onMapStatusChangeRef.current = onMapStatusChange
  onViewportChangeRef.current = onViewportChange
  onZoneBoundsChangeRef.current = onZoneBoundsChange
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

      const deduped = deduplicatePlaces(places)
      onPlacesLoadedRef.current(deduped)
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

  const zoneBoundsKey = offlineZone?.bounds.join(',') ?? ''
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const sourceId = 'offline-zone-boundary'
    const fillId = 'offline-zone-fill'
    const lineId = 'offline-zone-line'
    const clearMarkers = () => {
      zoneMarkersRef.current.forEach((marker) => marker.remove())
      zoneMarkersRef.current = []
    }
    const removeOverlay = () => {
      clearMarkers()
      if (!map.isStyleLoaded()) return
      if (map.getLayer(lineId)) map.removeLayer(lineId)
      if (map.getLayer(fillId)) map.removeLayer(fillId)
      if (map.getSource(sourceId)) map.removeSource(sourceId)
    }
    const drawZone = () => {
      if (!offlineZone) {
        removeOverlay()
        return
      }
      const [west, south, east, north] = offlineZone.bounds
      if (map.isStyleLoaded()) {
        const data = {
          type: 'Feature' as const,
          properties: {},
          geometry: { type: 'Polygon' as const, coordinates: [[[west, south], [east, south], [east, north], [west, north], [west, south]]] },
        }
        const source = map.getSource(sourceId) as maplibregl.GeoJSONSource | undefined
        if (source) source.setData(data)
        else map.addSource(sourceId, { type: 'geojson', data })
        if (!map.getLayer(fillId)) map.addLayer({ id: fillId, type: 'fill', source: sourceId, paint: { 'fill-color': '#d5ef9a', 'fill-opacity': 0.08 } })
        if (!map.getLayer(lineId)) map.addLayer({ id: lineId, type: 'line', source: sourceId, paint: { 'line-color': '#d5ef9a', 'line-width': 2, 'line-dasharray': [2, 2], 'line-opacity': 0.9 } })
      }

      clearMarkers()
      if (!zoneEditing) return
      const center: [number, number] = [(west + east) / 2, (south + north) / 2]
      const addHandle = (label: string, coordinates: [number, number], className: string, onDragEnd: (marker: Marker) => void) => {
        const element = document.createElement('button')
        element.type = 'button'
        element.className = className
        element.setAttribute('aria-label', label)
        element.title = label
        const marker = new maplibregl.Marker({ element, anchor: 'center', draggable: true })
          .setLngLat(coordinates)
          .addTo(map)
        marker.on('dragend', () => onDragEnd(marker))
        zoneMarkersRef.current.push(marker)
      }
      const minSpan = 0.001
      const corners: Array<{ label: string; lng: number; lat: number; westSide: boolean; southSide: boolean }> = [
        { label: 'Resize southwest corner', lng: west, lat: south, westSide: true, southSide: true },
        { label: 'Resize southeast corner', lng: east, lat: south, westSide: false, southSide: true },
        { label: 'Resize northeast corner', lng: east, lat: north, westSide: false, southSide: false },
        { label: 'Resize northwest corner', lng: west, lat: north, westSide: true, southSide: false },
      ]
      for (const corner of corners) {
        addHandle(corner.label, [corner.lng, corner.lat], 'offline-zone-handle', (marker) => {
          const point = marker.getLngLat()
          const longitude = Math.max(-180, Math.min(180, point.lng))
          const latitude = Math.max(-85.05112878, Math.min(85.05112878, point.lat))
          const nextWest = corner.westSide ? Math.min(longitude, east - minSpan) : west
          const nextEast = corner.westSide ? east : Math.max(longitude, west + minSpan)
          const nextSouth = corner.southSide ? Math.min(latitude, north - minSpan) : south
          const nextNorth = corner.southSide ? north : Math.max(latitude, south + minSpan)
          onZoneBoundsChangeRef.current([nextWest, nextSouth, nextEast, nextNorth])
        })
      }
      addHandle('Move offline zone', center, 'offline-zone-move-handle', (marker) => {
        const point = marker.getLngLat()
        const lngDelta = point.lng - center[0]
        const latDelta = point.lat - center[1]
        const width = east - west
        const height = north - south
        const movedWest = Math.max(-180, Math.min(180 - width, west + lngDelta))
        const movedSouth = Math.max(-85.05112878, Math.min(85.05112878 - height, south + latDelta))
        onZoneBoundsChangeRef.current([movedWest, movedSouth, movedWest + width, movedSouth + height])
      })
    }

    map.on('style.load', drawZone)
    drawZone()
    return () => {
      map.off('style.load', drawZone)
      removeOverlay()
    }
  }, [zoneBoundsKey, offlineZone?.maxZoom, zoneEditing, localArchive])

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

  // Journey legs overlay: one source, three layers (solid muted, solid active, dashed unrouted).
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const sourceId = 'journey-legs'
    const apply = () => {
      const data = legFeatureCollection(legs ?? [])
      const existing = map.getSource(sourceId) as maplibregl.GeoJSONSource | undefined
      if (existing) existing.setData(data)
      else map.addSource(sourceId, { type: 'geojson', data })
      const layers: Array<Parameters<MapLibreMap['addLayer']>[0] & { id: string }> = [
        { id: 'journey-legs-muted', type: 'line', source: sourceId, filter: ['all', ['==', ['get', 'kind'], 'routed'], ['==', ['get', 'active'], false]], paint: { 'line-color': '#88a37b', 'line-width': 2.5, 'line-opacity': 0.55 } },
        { id: 'journey-legs-active', type: 'line', source: sourceId, filter: ['all', ['==', ['get', 'kind'], 'routed'], ['==', ['get', 'active'], true]], paint: { 'line-color': '#d5ef9a', 'line-width': 4.5, 'line-opacity': 0.95 } },
        { id: 'journey-legs-unrouted', type: 'line', source: sourceId, filter: ['==', ['get', 'kind'], 'unrouted'], paint: { 'line-color': '#a5b6aa', 'line-width': 2, 'line-opacity': 0.6, 'line-dasharray': [1, 2] } },
      ] as const
      for (const layer of layers) if (!map.getLayer(layer.id)) map.addLayer(layer)
    }
    if (map.isStyleLoaded()) apply()
    else map.once('load', apply)
    return () => {
      for (const id of ['journey-legs-muted', 'journey-legs-active', 'journey-legs-unrouted']) if (map.getLayer(id)) map.removeLayer(id)
      if (map.getSource(sourceId)) map.removeSource(sourceId)
    }
  }, [legs, localArchive])

  // Fit-to-journey: recompute bounds from the routed geometry when the signal changes.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !flyToLegsSignal || !legs || legs.length === 0) return
    const coordinates = legs.flatMap((leg) => leg.geometry ?? [leg.from?.coordinates ?? leg.to.coordinates, leg.to.coordinates])
    if (coordinates.length < 2) return
    const bounds = coordinates.reduce((result, coordinate) => result.extend(coordinate), new maplibregl.LngLatBounds(coordinates[0], coordinates[0]))
    map.fitBounds(bounds, { padding: 64, duration: motionEnabledRef.current ? 900 : 0 })
  }, [flyToLegsSignal, legs])

  return <div className="map-canvas" ref={containerRef} aria-label="Interactive map" role="application" />
})

import { memo, useEffect, useRef } from 'react'
import * as maplibregl from 'maplibre-gl'
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import type { DataDrivenPropertyValueSpecification, ExpressionSpecification, GeoJSONFeature, Map as MapLibreMap, MapMouseEvent, Marker, StyleSpecification } from 'maplibre-gl'
import { Protocol, TileType } from 'pmtiles'
import { OPENFREEMAP_STYLE } from '../providers/config'
import type { LocalPmtilesArchive } from '../providers/localPmtiles'
import { deduplicatePlaces, placeFromFeature } from '../providers/localPlaceIndex'
import type { OfflineZone } from '../storage/offlineZones'
import { getInitialMapViewport } from './mapViewport'
import { easeInOut, partialPath, travelKind, travelPath, travelTimeline } from './journeyMotion'
import type { JourneyLeg, MapViewport, Place, WalkingRoute } from '../types/domain'
import type { MapBounds } from '../providers/placeFilters'
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
  /** "Want to go" places, drawn as amber rings. */
  savedPlaces?: Place[]
  /** Places to highlight (a category the user or companion picked). `undefined` means no highlight is active. */
  highlights?: Place[]
  highlightFocusId?: string | null
  onHighlightHover?: (placeId: string | null) => void
  /** Visible area after each move, as [west, south, east, north]. */
  onBoundsChange?: (bounds: MapBounds) => void
}

/** Overlay layers whose features stand for a known `Place` (looked up by the feature's `placeId`), not raw map data. */
type OverlayKind = 'highlight' | 'saved'
const HIGHLIGHT_SOURCE = 'place-highlights'
const HIGHLIGHT_LAYERS = ['place-highlights-halo', 'place-highlights-dot', 'place-highlights-label'] as const
/** The style's own POI icons are faded while a highlight is active, so the matches stand out. */
const DIMMED_OPACITY = 0.3
const SAVED_SOURCE = 'saved-places'
const SAVED_LAYERS = ['saved-places-ring', 'saved-places-dot', 'saved-places-label'] as const
const SAVED_COLOR = '#f2c46d'

/** The style's label font, if it has glyphs. Local archive styles have none, so overlays there get no labels. */
function styleFont(map: MapLibreMap) {
  const style = map.getStyle()
  if (!style.glyphs) return undefined
  return style.layers.flatMap((layer) => layer.type === 'symbol' && Array.isArray(layer.layout?.['text-font']) ? [layer.layout['text-font'] as string[]] : [])[0]
}

function overlayCollection(places: Place[], kind: OverlayKind, focusId: string | null) {
  return {
    type: 'FeatureCollection' as const,
    features: places.map((place) => ({ type: 'Feature' as const, properties: { overlay: kind, placeId: place.id, name: place.name, focus: place.id === focusId }, geometry: { type: 'Point' as const, coordinates: place.coordinates } })),
  }
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
 * are visibly not a walking route. Places visited earlier get small dim pins.
 * `hiddenLegId` is left out while its move is being animated.
 */
function legFeatureCollection(legs: JourneyLeg[], hiddenLegId: string | null = null) {
  const shown = legs.filter((leg) => leg.id !== hiddenLegId)
  const lines = shown.flatMap((leg) => {
    const active = leg.id === legs.at(-1)?.id
    if (leg.routed) {
      if (!leg.geometry || leg.geometry.length < 2) return []
      return [{ type: 'Feature' as const, properties: { kind: 'routed', active }, geometry: { type: 'LineString' as const, coordinates: leg.geometry } }]
    }
    return [{ type: 'Feature' as const, properties: { kind: 'unrouted', active }, geometry: { type: 'LineString' as const, coordinates: [leg.from?.coordinates ?? leg.to.coordinates, leg.to.coordinates] } }]
  })
  const current = legs.at(-1)?.to.id
  const visited = new Map<string, Place>()
  for (const leg of legs) for (const place of [leg.from, leg.to]) if (place && place.id !== current) visited.set(place.id, place)
  const pins = [...visited.values()].map((place) => ({ type: 'Feature' as const, properties: { kind: 'visited', active: false, name: place.name }, geometry: { type: 'Point' as const, coordinates: place.coordinates } }))
  return { type: 'FeatureCollection' as const, features: [...lines, ...pins] }
}

/** Restart the one-shot arrival pulse on a marker element. */
function pulseMarker(element: HTMLElement | undefined, motionEnabled: boolean) {
  if (!element || !motionEnabled) return
  element.classList.remove('marker-arrive')
  void element.offsetWidth
  element.classList.add('marker-arrive')
}

export const MapCanvas = memo(function MapCanvas({ motionEnabled, onPlaceSelected, onPlacesLoaded, onMapStatusChange, selectedPlace, initialViewport, onViewportChange, route, localArchive, legs, flyToLegsSignal, offlineZone, zoneEditing, onZoneBoundsChange, savedPlaces, highlights, highlightFocusId = null, onHighlightHover, onBoundsChange }: MapCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const markerRef = useRef<Marker | null>(null)
  const flyTargetRef = useRef<{ center: [number, number]; zoom: number } | null>(null)
  const zoneMarkersRef = useRef<Marker[]>([])
  const activeArchiveKeyRef = useRef<string | null>(null)
  const onPlaceSelectedRef = useRef(onPlaceSelected)
  const onPlacesLoadedRef = useRef(onPlacesLoaded)
  const onMapStatusChangeRef = useRef(onMapStatusChange)
  const onViewportChangeRef = useRef(onViewportChange)
  const onZoneBoundsChangeRef = useRef(onZoneBoundsChange)
  const motionEnabledRef = useRef(motionEnabled)
  // Legs restored with the journey are drawn as they are; only a leg added while the map is open is animated.
  const lastLegIdRef = useRef<string | undefined>(legs?.at(-1)?.id)
  const travelRef = useRef<{ hiddenLegId: string | null; cancel: (() => void) | null }>({ hiddenLegId: null, cancel: null })
  const refreshLegsRef = useRef<() => void>(() => {})
  const overlayPlacesRef = useRef<Record<OverlayKind, Map<string, Place>>>({ highlight: new Map(), saved: new Map() })
  const onHighlightHoverRef = useRef(onHighlightHover)
  const onBoundsChangeRef = useRef(onBoundsChange)
  const highlightFocusRef = useRef(highlightFocusId)

  onPlaceSelectedRef.current = onPlaceSelected
  onPlacesLoadedRef.current = onPlacesLoaded
  onMapStatusChangeRef.current = onMapStatusChange
  onViewportChangeRef.current = onViewportChange
  onZoneBoundsChangeRef.current = onZoneBoundsChange
  motionEnabledRef.current = motionEnabled
  onHighlightHoverRef.current = onHighlightHover
  onBoundsChangeRef.current = onBoundsChange
  highlightFocusRef.current = highlightFocusId

  useEffect(() => {
    if (!containerRef.current) return
    onMapStatusChangeRef.current('loading')

    const viewport = getInitialMapViewport(selectedPlace, initialViewport)
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: OPENFREEMAP_STYLE,
      center: viewport.center,
      zoom: viewport.zoom,
      // Collapsed to the (i) button: expanded, the attribution box covered a third of the panel. The caption still credits OSM.
      attributionControl: { compact: true },
    })
    let mapLoaded = false
    mapRef.current = map
    // Opening a panel can resize the map while a fly-to is running, and MapLibre then lands off-centre by half the size change.
    // If a flight was interrupted, fly to the same target again.
    const resizeObserver = new ResizeObserver(() => {
      const target = flyTargetRef.current
      map.resize()
      if (target && map.isMoving()) {
        map.flyTo({ ...target, duration: motionEnabledRef.current ? 400 : 0 })
        flyTargetRef.current = target
      }
    })
    resizeObserver.observe(containerRef.current)
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right')

    const saveViewport = () => {
      const center = map.getCenter()
      onViewportChangeRef.current({ center: [center.lng, center.lat], zoom: map.getZoom() })
      const bounds = map.getBounds()
      onBoundsChangeRef.current?.([bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()])
    }

    const collectLoadedPlaces = () => {
      const places: Place[] = []
      const style = map.getStyle()
      const sources = Object.entries(style.sources)
        .filter(([, source]) => (source as { type?: string }).type === 'vector')
        .map(([sourceId]) => sourceId)

      for (const sourceId of sources) {
        // Vector sources return nothing from querySourceFeatures without a source layer, so ask each layer the style draws.
        const sourceLayers = new Set(style.layers.flatMap((layer) => 'source' in layer && layer.source === sourceId && 'source-layer' in layer && layer['source-layer'] ? [layer['source-layer']] : []))
        for (const sourceLayer of sourceLayers) {
          try {
            map.querySourceFeatures(sourceId, { sourceLayer }).forEach((feature: GeoJSONFeature) => {
              const place = placeFromFeature(feature)
              if (place) places.push(place)
            })
          } catch {
            // A source can be declared before its first tile is available.
          }
        }
      }

      const deduped = deduplicatePlaces(places)
      onPlacesLoadedRef.current(deduped)
    }

    // The topmost place under a point. Overlay features map back to the full `Place` they were drawn from.
    const placeAt = (point: MapMouseEvent['point']): { place: Place; overlay: OverlayKind | null } | null => {
      for (const feature of map.queryRenderedFeatures(point)) {
        const overlay = feature.properties?.overlay as OverlayKind | undefined
        const known = overlay && overlayPlacesRef.current[overlay]?.get(String(feature.properties?.placeId))
        if (known && overlay) return { place: known, overlay }
        const place = placeFromFeature(feature)
        if (place) return { place, overlay: null }
      }
      return null
    }

    const handleClick = (event: MapMouseEvent) => {
      const hit = placeAt(event.point)
      if (hit) { clearHover(); onPlaceSelectedRef.current(hit.place) }
    }

    // Hover card: name and category of the place under the pointer, after a short pause. Mouse/trackpad only.
    const hoverPopup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 14, className: 'map-hover-card', maxWidth: '240px' })
    let hoverTimer = 0
    let hoverId: string | null = null
    let hoverFrame = 0
    let hoverHighlightId: string | null = null
    const setHoverHighlight = (id: string | null) => {
      if (id === hoverHighlightId) return
      hoverHighlightId = id
      onHighlightHoverRef.current?.(id)
    }
    const clearHover = () => {
      window.clearTimeout(hoverTimer)
      hoverId = null
      hoverPopup.remove()
      map.getCanvas().style.cursor = ''
      setHoverHighlight(null)
    }
    const handleHover = (event: MapMouseEvent) => {
      if (hoverFrame) return
      hoverFrame = requestAnimationFrame(() => {
        hoverFrame = 0
        if (mapRef.current !== map) return
        const hit = placeAt(event.point)
        if (!hit) { clearHover(); return }
        const { place } = hit
        setHoverHighlight(hit.overlay === 'highlight' ? place.id : null)
        map.getCanvas().style.cursor = 'pointer'
        if (place.id === hoverId) return
        hoverId = place.id
        window.clearTimeout(hoverTimer)
        hoverPopup.remove()
        hoverTimer = window.setTimeout(() => {
          // Names come from map data: set them as text, never as HTML.
          const card = document.createElement('div')
          const name = document.createElement('strong')
          name.textContent = place.name
          const meta = document.createElement('span')
          meta.textContent = `${hit.overlay === 'saved' ? 'Want to go · ' : ''}${(place.subcategory ?? place.category ?? 'place').replace(/_/g, ' ')} · OpenStreetMap`
          card.append(name, meta)
          hoverPopup.setLngLat(place.coordinates).setDOMContent(card).addTo(map)
        }, 150)
      })
    }
    if (window.matchMedia('(hover: hover)').matches) {
      map.on('mousemove', handleHover)
      map.on('mouseout', clearHover)
      map.on('movestart', clearHover)
    }

    map.on('load', () => {
      mapLoaded = true
      // MapLibre opens the compact attribution expanded on first load; start it collapsed (the (i) button still opens it).
      containerRef.current?.querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show')
      onMapStatusChangeRef.current('ready')
      saveViewport()
      collectLoadedPlaces()
    })
    // `moveend`, not `move`: `move` fires every frame and re-rendered the whole app while panning.
    map.on('moveend', () => { flyTargetRef.current = null; saveViewport() })
    map.on('idle', collectLoadedPlaces)
    map.on('click', handleClick)
    map.on('error', () => {
      if (!mapLoaded) onMapStatusChangeRef.current('unavailable')
    })

    return () => {
      resizeObserver.disconnect()
      cancelAnimationFrame(hoverFrame)
      window.clearTimeout(hoverTimer)
      hoverPopup.remove()
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
    pulseMarker(markerRef.current.getElement(), motionEnabledRef.current)

    const target = { center: selectedPlace.coordinates, zoom: Math.max(map.getZoom(), 14) }
    map.flyTo({ ...target, duration: motionEnabledRef.current ? 1000 : 0 })
    flyTargetRef.current = target
  }, [selectedPlace])

  // Animate a move to a new place: fit both places, draw the line with a moving head, then reveal the marker.
  // Declared before the route and legs effects so they can see the move is animating and hold back their lines.
  useEffect(() => {
    const map = mapRef.current
    const leg = legs?.at(-1)
    if (!map || !leg || leg.id === lastLegIdRef.current) return
    lastLegIdRef.current = leg.id
    travelRef.current.cancel?.()
    const kind = travelKind(leg)
    if (!motionEnabledRef.current || kind === 'arrive') return

    const { fitMs, drawMs, settleMs } = travelTimeline(kind)
    const path = travelPath(leg)
    const sourceId = 'journey-travel'
    const lineId = 'journey-travel-line'
    const headId = 'journey-travel-head'
    const timers: number[] = []
    let frame = 0
    let finished = false
    const markerElement = markerRef.current?.getElement()
    const travelData = (coordinates: [number, number][]) => ({
      type: 'FeatureCollection' as const,
      features: [
        { type: 'Feature' as const, properties: { part: 'line' }, geometry: { type: 'LineString' as const, coordinates: coordinates.length > 1 ? coordinates : [coordinates[0], coordinates[0]] } },
        { type: 'Feature' as const, properties: { part: 'head' }, geometry: { type: 'Point' as const, coordinates: coordinates[coordinates.length - 1] } },
      ],
    })

    const restore = () => {
      travelRef.current = { hiddenLegId: null, cancel: null }
      markerElement?.classList.remove('journey-marker-hidden')
      if (mapRef.current !== map) return
      if (map.getLayer(headId)) map.removeLayer(headId)
      if (map.getLayer(lineId)) map.removeLayer(lineId)
      if (map.getSource(sourceId)) map.removeSource(sourceId)
      if (map.getLayer('walking-route-line')) map.setPaintProperty('walking-route-line', 'line-opacity', 0.9)
      refreshLegsRef.current()
    }
    const finish = () => {
      if (finished) return
      finished = true
      restore()
      pulseMarker(markerElement, motionEnabledRef.current)
      if (mapRef.current !== map) return
      const target = { center: leg.to.coordinates, zoom: Math.max(map.getZoom(), 14) }
      map.flyTo({ ...target, duration: settleMs })
      flyTargetRef.current = target
    }

    travelRef.current = {
      hiddenLegId: leg.id,
      cancel: () => {
        cancelAnimationFrame(frame)
        timers.forEach((timer) => window.clearTimeout(timer))
        if (!finished) { finished = true; restore() }
      },
    }
    try {
      // Throws if the style itself is not loaded yet (isStyleLoaded() is also false while tiles load, so not used).
      map.addSource(sourceId, { type: 'geojson', data: travelData([path[0]]) })
    } catch {
      travelRef.current = { hiddenLegId: null, cancel: null }
      return
    }
    markerElement?.classList.add('journey-marker-hidden')
    refreshLegsRef.current()
    if (map.getLayer('walking-route-line')) map.setPaintProperty('walking-route-line', 'line-opacity', 0)
    map.addLayer({ id: lineId, type: 'line', source: sourceId, filter: ['==', ['get', 'part'], 'line'], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#d5ef9a', 'line-width': kind === 'routed' ? 4.5 : 3, 'line-opacity': 0.95, ...(kind === 'routed' ? {} : { 'line-dasharray': [1.2, 1.6] }) } })
    map.addLayer({ id: headId, type: 'circle', source: sourceId, filter: ['==', ['get', 'part'], 'head'], paint: { 'circle-radius': 6, 'circle-color': '#d5ef9a', 'circle-stroke-color': '#12201c', 'circle-stroke-width': 2 } })

    map.stop()
    flyTargetRef.current = null
    const container = map.getContainer()
    const padding = Math.max(16, Math.min(70, Math.round(Math.min(container.clientWidth, container.clientHeight) * 0.15)))
    const bounds = path.reduce((result, coordinate) => result.extend(coordinate), new maplibregl.LngLatBounds(path[0], path[0]))
    map.fitBounds(bounds, { padding, maxZoom: 16, duration: fitMs })
    timers.push(window.setTimeout(() => {
      const start = performance.now()
      const step = (now: number) => {
        if (mapRef.current !== map) return
        const t = Math.min(1, (now - start) / drawMs)
        ;(map.getSource(sourceId) as maplibregl.GeoJSONSource | undefined)?.setData(travelData(partialPath(path, easeInOut(t))))
        if (t < 1) frame = requestAnimationFrame(step)
        else finish()
      }
      frame = requestAnimationFrame(step)
    }, fitMs))
  }, [legs])

  useEffect(() => () => travelRef.current.cancel?.(), [])

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
      const animating = travelRef.current.hiddenLegId !== null
      map.addLayer({ id: layerId, type: 'line', source: sourceId, layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#d5ef9a', 'line-width': 4, 'line-opacity': animating ? 0 : 0.9 } })
      // While a move is animating, the travel effect owns the camera and reveals this line at the end.
      if (route.coordinates.length > 1 && !animating) {
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
      const data = legFeatureCollection(legs ?? [], travelRef.current.hiddenLegId)
      const existing = map.getSource(sourceId) as maplibregl.GeoJSONSource | undefined
      if (existing) existing.setData(data)
      else map.addSource(sourceId, { type: 'geojson', data })
      const layers: Array<Parameters<MapLibreMap['addLayer']>[0] & { id: string }> = [
        { id: 'journey-legs-muted', type: 'line', source: sourceId, filter: ['all', ['==', ['get', 'kind'], 'routed'], ['==', ['get', 'active'], false]], paint: { 'line-color': '#88a37b', 'line-width': 2.5, 'line-opacity': 0.55 } },
        { id: 'journey-legs-active', type: 'line', source: sourceId, filter: ['all', ['==', ['get', 'kind'], 'routed'], ['==', ['get', 'active'], true]], paint: { 'line-color': '#d5ef9a', 'line-width': 4.5, 'line-opacity': 0.95 } },
        { id: 'journey-legs-unrouted', type: 'line', source: sourceId, filter: ['==', ['get', 'kind'], 'unrouted'], paint: { 'line-color': '#a5b6aa', 'line-width': 2, 'line-opacity': 0.6, 'line-dasharray': [1, 2] } },
        { id: 'journey-legs-visited', type: 'circle', source: sourceId, filter: ['==', ['get', 'kind'], 'visited'], paint: { 'circle-radius': 4, 'circle-color': '#88a37b', 'circle-opacity': 0.85, 'circle-stroke-color': '#12201c', 'circle-stroke-width': 1.5 } },
      ] as const
      for (const layer of layers) if (!map.getLayer(layer.id)) map.addLayer(layer)
    }
    refreshLegsRef.current = () => {
      const source = map.getSource(sourceId) as maplibregl.GeoJSONSource | undefined
      source?.setData(legFeatureCollection(legs ?? [], travelRef.current.hiddenLegId))
    }
    if (map.isStyleLoaded()) apply()
    else map.once('load', apply)
    return () => {
      for (const id of ['journey-legs-muted', 'journey-legs-active', 'journey-legs-unrouted', 'journey-legs-visited']) if (map.getLayer(id)) map.removeLayer(id)
      if (map.getSource(sourceId)) map.removeSource(sourceId)
    }
  }, [legs, localArchive])

  // "Want to go" places: amber ring with a dot, and the name from zoom 13.
  useEffect(() => {
    const map = mapRef.current
    overlayPlacesRef.current.saved = new Map((savedPlaces ?? []).map((place) => [place.id, place]))
    if (!map || !savedPlaces?.length) return
    const apply = () => {
      if (mapRef.current !== map) return
      const data = overlayCollection(savedPlaces, 'saved', null)
      const existing = map.getSource(SAVED_SOURCE) as maplibregl.GeoJSONSource | undefined
      if (existing) existing.setData(data)
      else map.addSource(SAVED_SOURCE, { type: 'geojson', data })
      const font = styleFont(map)
      const layers: Array<Parameters<MapLibreMap['addLayer']>[0] & { id: string }> = [
        { id: 'saved-places-ring', type: 'circle', source: SAVED_SOURCE, paint: { 'circle-radius': 7, 'circle-color': '#12201c', 'circle-opacity': 0.85, 'circle-stroke-color': SAVED_COLOR, 'circle-stroke-width': 2.5 } },
        { id: 'saved-places-dot', type: 'circle', source: SAVED_SOURCE, paint: { 'circle-radius': 2.5, 'circle-color': SAVED_COLOR } },
      ]
      if (font) layers.push({ id: 'saved-places-label', type: 'symbol', source: SAVED_SOURCE, minzoom: 13, layout: { 'text-field': ['get', 'name'], 'text-font': font, 'text-size': 11, 'text-offset': [0, 1.2], 'text-anchor': 'top', 'text-optional': true, 'text-max-width': 9 }, paint: { 'text-color': SAVED_COLOR, 'text-halo-color': '#12201c', 'text-halo-width': 1.4 } })
      for (const layer of layers) if (!map.getLayer(layer.id)) map.addLayer(layer)
    }
    if (map.isStyleLoaded()) apply()
    else map.once('style.load', apply)
    return () => {
      map.off('style.load', apply)
      if (mapRef.current !== map || !map.getStyle()) return
      for (const id of SAVED_LAYERS) if (map.getLayer(id)) map.removeLayer(id)
      if (map.getSource(SAVED_SOURCE)) map.removeSource(SAVED_SOURCE)
    }
  }, [savedPlaces, localArchive])

  // Category highlights: a soft ring and dot per match, its name from zoom 13, and the style's other POI icons faded.
  useEffect(() => {
    const map = mapRef.current
    overlayPlacesRef.current.highlight = new Map((highlights ?? []).map((place) => [place.id, place]))
    if (!map || !highlights) return
    const dimmed = new Map<string, { icon: DataDrivenPropertyValueSpecification<number> | undefined; text: DataDrivenPropertyValueSpecification<number> | undefined }>()
    const apply = () => {
      if (mapRef.current !== map) return
      const data = overlayCollection(highlights, 'highlight', highlightFocusRef.current)
      const existing = map.getSource(HIGHLIGHT_SOURCE) as maplibregl.GeoJSONSource | undefined
      if (existing) existing.setData(data)
      else map.addSource(HIGHLIGHT_SOURCE, { type: 'geojson', data })
      const style = map.getStyle()
      const font = styleFont(map)
      const focus: ExpressionSpecification = ['==', ['get', 'focus'], true]
      const layers: Array<Parameters<MapLibreMap['addLayer']>[0] & { id: string }> = [
        { id: 'place-highlights-halo', type: 'circle', source: HIGHLIGHT_SOURCE, paint: { 'circle-radius': ['case', focus, 16, 10], 'circle-color': '#d5ef9a', 'circle-opacity': ['case', focus, 0.32, 0.16], 'circle-stroke-color': '#d5ef9a', 'circle-stroke-width': 1.5, 'circle-stroke-opacity': 0.75 } },
        { id: 'place-highlights-dot', type: 'circle', source: HIGHLIGHT_SOURCE, paint: { 'circle-radius': ['case', focus, 6, 4.5], 'circle-color': '#d5ef9a', 'circle-stroke-color': '#12201c', 'circle-stroke-width': 2 } },
      ]
      if (font) layers.push({ id: 'place-highlights-label', type: 'symbol', source: HIGHLIGHT_SOURCE, minzoom: 13, layout: { 'text-field': ['get', 'name'], 'text-font': font, 'text-size': ['case', focus, 12.5, 11], 'text-offset': [0, 1.1], 'text-anchor': 'top', 'text-optional': true, 'text-max-width': 9 }, paint: { 'text-color': '#eef4e6', 'text-halo-color': '#12201c', 'text-halo-width': 1.4 } } as Parameters<MapLibreMap['addLayer']>[0] & { id: string })
      for (const layer of layers) if (!map.getLayer(layer.id)) map.addLayer(layer)
      for (const layer of style.layers) {
        if (layer.type !== 'symbol' || !('source-layer' in layer) || layer['source-layer'] !== 'poi' || dimmed.has(layer.id)) continue
        dimmed.set(layer.id, { icon: map.getPaintProperty(layer.id, 'icon-opacity'), text: map.getPaintProperty(layer.id, 'text-opacity') })
        map.setPaintProperty(layer.id, 'icon-opacity', DIMMED_OPACITY)
        map.setPaintProperty(layer.id, 'text-opacity', DIMMED_OPACITY)
      }
    }
    if (map.isStyleLoaded()) apply()
    else map.once('style.load', apply)
    return () => {
      map.off('style.load', apply)
      if (mapRef.current !== map || !map.getStyle()) return
      for (const id of HIGHLIGHT_LAYERS) if (map.getLayer(id)) map.removeLayer(id)
      if (map.getSource(HIGHLIGHT_SOURCE)) map.removeSource(HIGHLIGHT_SOURCE)
      for (const [id, original] of dimmed) {
        if (!map.getLayer(id)) continue
        map.setPaintProperty(id, 'icon-opacity', original.icon ?? 1)
        map.setPaintProperty(id, 'text-opacity', original.text ?? 1)
      }
    }
  }, [highlights, localArchive])

  // Focus (hovered list item) only changes feature properties, so redraw the data without touching the layers.
  useEffect(() => {
    const map = mapRef.current
    const source = map?.getSource(HIGHLIGHT_SOURCE) as maplibregl.GeoJSONSource | undefined
    if (source && highlights) source.setData(overlayCollection(highlights, 'highlight', highlightFocusId))
  }, [highlightFocusId, highlights])

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

import type { DataDrivenPropertyValueSpecification, ExpressionSpecification, LayerSpecification, Map as MapLibreMap, ProjectionSpecification } from 'maplibre-gl'
import type { Coordinates } from '../types/domain'
import type { DayPhase } from '../providers/mapLook'

/**
 * Map effects from Settings → Map look. Each function adds its effect when `on` and removes it otherwise, and is
 * safe to call repeatedly. They only touch layers and sources prefixed `look-`, plus (palette) the paint of the
 * base style's own layers, whose original values are kept so switching off restores the style exactly.
 */

type AnyLayer = Parameters<MapLibreMap['addLayer']>[0] & { id: string }
type PaintProperty = Parameters<MapLibreMap['setPaintProperty']>[1]
type PaintValue = Parameters<MapLibreMap['setPaintProperty']>[2]
type Paint = Partial<Record<PaintProperty, PaintValue>>

const BASE_SOURCE = 'openmaptiles'

/** First label layer of the base style: effects that should sit under labels are inserted before it. */
function firstSymbolId(map: MapLibreMap) {
  return map.getStyle().layers.find((layer) => layer.type === 'symbol' && 'source' in layer && layer.source === BASE_SOURCE)?.id
}

function isBaseLayer(layer: LayerSpecification) {
  return layer.type === 'background' || ('source' in layer && layer.source === BASE_SOURCE)
}

function removeLayers(map: MapLibreMap, layerIds: readonly string[], sourceIds: readonly string[] = []) {
  for (const id of layerIds) if (map.getLayer(id)) map.removeLayer(id)
  for (const id of sourceIds) if (map.getSource(id)) map.removeSource(id)
}

// ─── App colours ──────────────────────────────────────────────────────────────────────────────────────────

const LAND = '#1c352d'
const HALO = '#12201c'

/** New paint for one base-style layer, matched by its id and type (OpenFreeMap "bright"). */
export function palettePaint(layer: LayerSpecification): Paint | null {
  const id = layer.id
  const sourceLayer = 'source-layer' in layer ? layer['source-layer'] : undefined
  if (layer.type === 'background') return { 'background-color': LAND }
  if (layer.type === 'symbol') {
    if (/water/.test(id)) return { 'text-color': '#8fd3e0', 'text-halo-color': '#0f2f2d', 'text-halo-width': 1.2 }
    if (id === 'poi_transit') return { 'text-color': '#a6d0ee', 'text-halo-color': HALO, 'text-halo-width': 1.2 }
    if (/^poi|airport/.test(id)) return { 'text-color': '#c3d4c7', 'text-halo-color': HALO, 'text-halo-width': 1.2 }
    if (/^highway-name/.test(id)) return { 'text-color': '#b7c8bb', 'text-halo-color': '#16302a', 'text-halo-width': 1.2 }
    if (/country|state/.test(id)) return { 'text-color': '#d7e4d4', 'text-halo-color': HALO, 'text-halo-width': 1.4 }
    if (/^label_/.test(id)) return { 'text-color': '#eef4e6', 'text-halo-color': HALO, 'text-halo-width': 1.4 }
    return null
  }
  if (layer.type === 'fill') {
    if (sourceLayer === 'water') return { 'fill-color': '#17566a' }
    if (/glacier|ice-shelf/.test(id)) return { 'fill-color': '#3a5550' }
    if (/sand/.test(id)) return { 'fill-color': '#4a4a35' }
    if (/wood/.test(id)) return { 'fill-color': '#2a5a35' }
    if (id === 'park' || /grass/.test(id)) return { 'fill-color': '#2c5a3c' }
    if (/residential|suburb/.test(id)) return { 'fill-color': '#213d34' }
    if (/commercial/.test(id)) return { 'fill-color': 'rgba(214, 150, 120, 0.10)' }
    if (/industrial/.test(id)) return { 'fill-color': 'rgba(220, 190, 120, 0.08)' }
    if (/cemetery/.test(id)) return { 'fill-color': '#26453a' }
    if (/hospital/.test(id)) return { 'fill-color': '#3a2f3a' }
    if (/school/.test(id)) return { 'fill-color': '#2f3546' }
    if (/railway/.test(id)) return { 'fill-color': 'rgba(150, 150, 140, 0.08)' }
    if (id === 'building') return { 'fill-color': '#2b463e', 'fill-outline-color': '#22392f' }
    if (id === 'building-top') return { 'fill-color': '#30504a', 'fill-outline-color': '#22392f' }
    if (/pier/.test(id)) return { 'fill-color': LAND }
    if (id === 'highway-area') return { 'fill-color': '#2a4239', 'fill-outline-color': '#22392f' }
    if (/aeroway/.test(id)) return { 'fill-color': '#2b463e' }
    return null
  }
  if (layer.type === 'line') {
    if (sourceLayer === 'waterway') return { 'line-color': '#2b7d93' }
    if (sourceLayer === 'boundary') return { 'line-color': '#7c9a87' }
    if (sourceLayer === 'aeroway') return { 'line-color': '#4d6a5d' }
    if (/pier/.test(id)) return { 'line-color': LAND }
    if (/casing/.test(id)) return { 'line-color': /minor|service|path/.test(id) ? '#1a2c25' : '#17271f' }
    if (/ferry/.test(id)) return { 'line-color': '#3d8fa3' }
    if (/cablecar/.test(id)) return { 'line-color': '#6f8f7d' }
    if (/railway/.test(id)) return { 'line-color': '#5e776b' }
    if (/path/.test(id)) return { 'line-color': '#7d9686' }
    if (/motorway/.test(id)) return { 'line-color': '#e9a65a' }
    if (/trunk|primary/.test(id)) return { 'line-color': '#d8be7e' }
    if (/secondary|tertiary|link/.test(id)) return { 'line-color': '#b9ad80' }
    if (/minor|service|track/.test(id)) return { 'line-color': '#52695e' }
    return null
  }
  return null
}

const paletteOriginals = new WeakMap<MapLibreMap, Map<string, Paint>>()

export function setPalette(map: MapLibreMap, on: boolean) {
  let originals = paletteOriginals.get(map)
  if (!originals) paletteOriginals.set(map, originals = new Map())
  if (on) {
    for (const layer of map.getStyle().layers) {
      if (!isBaseLayer(layer) || originals.has(layer.id)) continue
      const paint = palettePaint(layer)
      if (!paint) continue
      const saved: Paint = {}
      for (const [property, value] of Object.entries(paint) as Array<[PaintProperty, PaintValue]>) {
        saved[property] = map.getPaintProperty(layer.id, property)
        map.setPaintProperty(layer.id, property, value)
      }
      originals.set(layer.id, saved)
    }
    return
  }
  for (const [id, saved] of originals) {
    if (!map.getLayer(id)) continue
    // `undefined` resets a property the style left at its default.
    for (const [property, value] of Object.entries(saved) as Array<[PaintProperty, PaintValue]>) map.setPaintProperty(id, property, value)
  }
  originals.clear()
}

/** After a style reload the layers are new and the saved originals no longer apply. */
export function forgetStyleState(map: MapLibreMap) {
  paletteOriginals.get(map)?.clear()
}

// ─── 3D buildings ─────────────────────────────────────────────────────────────────────────────────────────

const BUILDINGS_3D = 'look-buildings-3d'

export function setBuildings3d(map: MapLibreMap, on: boolean, palette: boolean) {
  if (!on || !map.getSource(BASE_SOURCE)) {
    removeLayers(map, [BUILDINGS_3D])
    return
  }
  const color = palette ? '#35574b' : '#e6ded5'
  if (map.getLayer(BUILDINGS_3D)) {
    map.setPaintProperty(BUILDINGS_3D, 'fill-extrusion-color', color)
    return
  }
  // Grow from flat at zoom 14 to full height at 15, so buildings rise as you zoom in.
  const height = (property: string): DataDrivenPropertyValueSpecification<number> => ['interpolate', ['linear'], ['zoom'], 14, 0, 15, ['coalesce', ['get', property], 0]]
  map.addLayer({
    id: BUILDINGS_3D,
    type: 'fill-extrusion',
    source: BASE_SOURCE,
    'source-layer': 'building',
    minzoom: 14,
    filter: ['!=', ['get', 'hide_3d'], true],
    paint: { 'fill-extrusion-color': color, 'fill-extrusion-height': height('render_height'), 'fill-extrusion-base': height('render_min_height'), 'fill-extrusion-opacity': 0.88 },
  }, firstSymbolId(map))
}

// ─── Globe ────────────────────────────────────────────────────────────────────────────────────────────────

/** Globe below zoom 4, blending to the flat map by zoom 6, so street-level views are unchanged. */
const GLOBE: ProjectionSpecification = { type: ['interpolate', ['linear'], ['zoom'], 4, 'vertical-perspective', 6, 'mercator'] as unknown as ProjectionSpecification['type'] }

export function setGlobe(map: MapLibreMap, on: boolean, palette: boolean) {
  map.setProjection(on ? GLOBE : { type: 'mercator' })
  if (!on) {
    map.setSky({})
    return
  }
  const atmosphere: ExpressionSpecification = ['interpolate', ['linear'], ['zoom'], 0, 1, 5, 1, 7, 0]
  map.setSky(palette
    ? { 'sky-color': '#0f2620', 'horizon-color': '#2c5a4a', 'fog-color': '#1b3a31', 'atmosphere-blend': atmosphere }
    : { 'sky-color': '#88c6fc', 'horizon-color': '#ffffff', 'fog-color': '#ffffff', 'atmosphere-blend': atmosphere })
}

// ─── Hill shading ─────────────────────────────────────────────────────────────────────────────────────────

const TERRAIN_SOURCE = 'look-terrain'
const HILLSHADE = 'look-hillshade'
export const TERRAIN_TILES = 'https://elevation-tiles-prod.s3.amazonaws.com/terrarium/{z}/{x}/{y}.png'

export function setHillshade(map: MapLibreMap, on: boolean, palette: boolean) {
  if (!on) {
    removeLayers(map, [HILLSHADE], [TERRAIN_SOURCE])
    return
  }
  const colors = palette
    ? { 'hillshade-shadow-color': '#07120e', 'hillshade-highlight-color': '#4a7a64', 'hillshade-accent-color': '#0d1f19' }
    : { 'hillshade-shadow-color': '#5b5246', 'hillshade-highlight-color': '#ffffff', 'hillshade-accent-color': '#5b5246' }
  if (map.getLayer(HILLSHADE)) {
    for (const [property, value] of Object.entries(colors) as Array<[PaintProperty, PaintValue]>) map.setPaintProperty(HILLSHADE, property, value)
    return
  }
  if (!map.getSource(TERRAIN_SOURCE)) map.addSource(TERRAIN_SOURCE, { type: 'raster-dem', tiles: [TERRAIN_TILES], encoding: 'terrarium', tileSize: 256, maxzoom: 15, attribution: 'Terrain © Mapzen, AWS Open Data' })
  // Under water and roads, so the relief shades the land rather than the streets.
  const before = map.getStyle().layers.find((layer) => /^waterway|^water$/.test(layer.id))?.id ?? firstSymbolId(map)
  map.addLayer({ id: HILLSHADE, type: 'hillshade', source: TERRAIN_SOURCE, paint: { 'hillshade-exaggeration': 0.4, ...colors } }, before)
}

// ─── Explored glow ────────────────────────────────────────────────────────────────────────────────────────

const GLOW_SOURCE = 'look-glow'
const GLOW_LAYERS = ['look-glow-dim', 'look-glow-light'] as const

/** `places`: visited coordinates (null switches the effect off). */
export function setExploredGlow(map: MapLibreMap, places: Coordinates[] | null) {
  if (!places) {
    removeLayers(map, GLOW_LAYERS, [GLOW_SOURCE])
    return
  }
  const data = {
    type: 'FeatureCollection' as const,
    features: [
      { type: 'Feature' as const, properties: { kind: 'world' }, geometry: { type: 'Polygon' as const, coordinates: [[[-180, -85], [180, -85], [180, 85], [-180, 85], [-180, -85]]] } },
      ...places.map((coordinates) => ({ type: 'Feature' as const, properties: { kind: 'place' }, geometry: { type: 'Point' as const, coordinates } })),
    ],
  }
  const source = map.getSource(GLOW_SOURCE) as { setData?: (value: typeof data) => void } | undefined
  if (source?.setData) source.setData(data)
  else map.addSource(GLOW_SOURCE, { type: 'geojson', data })
  const before = firstSymbolId(map)
  // About 450 m of light around each place, growing with the zoom like a real distance.
  const radius: DataDrivenPropertyValueSpecification<number> = ['interpolate', ['exponential', 2], ['zoom'], 10, 3, 20, 3072]
  const layers: AnyLayer[] = [
    { id: 'look-glow-dim', type: 'fill', source: GLOW_SOURCE, filter: ['==', ['get', 'kind'], 'world'], paint: { 'fill-color': '#07110d', 'fill-opacity': 0.2 } },
    { id: 'look-glow-light', type: 'circle', source: GLOW_SOURCE, filter: ['==', ['get', 'kind'], 'place'], paint: { 'circle-radius': radius, 'circle-color': '#e2f3b8', 'circle-opacity': 0.22, 'circle-blur': 1, 'circle-pitch-alignment': 'map' } },
  ]
  for (const layer of layers) if (!map.getLayer(layer.id)) map.addLayer(layer, before)
}

// ─── Flowing route lines ──────────────────────────────────────────────────────────────────────────────────

const FLOW_SOURCE = 'look-flow'
const FLOW_LAYER = 'look-flow-line'
/** Dash patterns that, shown in turn, move a short bright dash along the line. */
const FLOW_STEPS: number[][] = [
  [0, 4, 3], [0.5, 4, 2.5], [1, 4, 2], [1.5, 4, 1.5], [2, 4, 1], [2.5, 4, 0.5], [3, 4, 0],
  [0, 0.5, 3, 3.5], [0, 1, 3, 3], [0, 1.5, 3, 2.5], [0, 2, 3, 2], [0, 2.5, 3, 1.5], [0, 3, 3, 1], [0, 3.5, 3, 0.5],
]
const FLOW_FRAME_MS = 90

/** Animates a bright dash along `lines`. Returns a stop function. `lines` empty or null removes the effect. */
export function setFlowingRoutes(map: MapLibreMap, lines: Coordinates[][] | null): () => void {
  if (!lines?.length) {
    removeLayers(map, [FLOW_LAYER], [FLOW_SOURCE])
    return () => {}
  }
  const data = { type: 'FeatureCollection' as const, features: lines.map((coordinates) => ({ type: 'Feature' as const, properties: {}, geometry: { type: 'LineString' as const, coordinates } })) }
  const source = map.getSource(FLOW_SOURCE) as { setData?: (value: typeof data) => void } | undefined
  if (source?.setData) source.setData(data)
  else map.addSource(FLOW_SOURCE, { type: 'geojson', data, lineMetrics: true })
  if (!map.getLayer(FLOW_LAYER)) map.addLayer({ id: FLOW_LAYER, type: 'line', source: FLOW_SOURCE, layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#fff7d6', 'line-width': 2.5, 'line-opacity': 0.85, 'line-dasharray': FLOW_STEPS[0] } })
  let step = 0
  let last = 0
  let frame = 0
  const tick = (time: number) => {
    frame = requestAnimationFrame(tick)
    // Capped at ~11 frames a second, and idle while the tab is hidden.
    if (time - last < FLOW_FRAME_MS || document.hidden || !map.getLayer(FLOW_LAYER)) return
    last = time
    step = (step + 1) % FLOW_STEPS.length
    map.setPaintProperty(FLOW_LAYER, 'line-dasharray', FLOW_STEPS[step])
  }
  frame = requestAnimationFrame(tick)
  return () => cancelAnimationFrame(frame)
}

// ─── Vignette, grain and time-of-day tint (DOM overlays above the map canvas, below markers) ──────────────

function overlay(map: MapLibreMap, className: string, on: boolean) {
  const container = map.getCanvasContainer()
  let element = container.querySelector<HTMLElement>(`:scope > .${className}`)
  if (!on) {
    element?.remove()
    return null
  }
  if (!element) {
    element = document.createElement('div')
    element.className = `map-look-overlay ${className}`
    element.setAttribute('aria-hidden', 'true')
    // Right after the canvas: markers added later stay above it.
    map.getCanvas().after(element)
  }
  return element
}

export function setVignette(map: MapLibreMap, on: boolean) {
  overlay(map, 'map-look-vignette', on)
}

export function setTimeTint(map: MapLibreMap, phase: DayPhase | null) {
  const element = overlay(map, 'map-look-tint', phase !== null)
  if (element && phase) element.dataset.phase = phase
}

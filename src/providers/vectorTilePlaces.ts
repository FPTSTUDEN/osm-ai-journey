import { VectorTile } from '@mapbox/vector-tile'
import { PbfReader } from 'pbf'
import { isInZone, type OfflineZone } from '../storage/offlineZones'
import type { Place } from '../types/domain'
import { deduplicatePlaces, hasPlaceCategory, placeFromFeature } from './localPlaceIndex'
import type { TileJob } from './offlineCache'

type Coordinates = [number, number]

function position(value: unknown): Coordinates | null {
  if (!Array.isArray(value) || typeof value[0] !== 'number' || typeof value[1] !== 'number') return null
  return Number.isFinite(value[0]) && Number.isFinite(value[1]) ? [value[0], value[1]] : null
}

function polygonCenter(ring: unknown): Coordinates | null {
  if (!Array.isArray(ring)) return null
  const points = ring.map(position).filter((point): point is Coordinates => point !== null)
  if (points.length < 3) return null

  let areaTwice = 0
  let longitudeWeighted = 0
  let latitudeWeighted = 0
  for (let index = 0; index < points.length; index++) {
    const current = points[index]
    const next = points[(index + 1) % points.length]
    const cross = current[0] * next[1] - next[0] * current[1]
    areaTwice += cross
    longitudeWeighted += (current[0] + next[0]) * cross
    latitudeWeighted += (current[1] + next[1]) * cross
  }

  if (Math.abs(areaTwice) < Number.EPSILON) return points[0]
  return [longitudeWeighted / (3 * areaTwice), latitudeWeighted / (3 * areaTwice)]
}

function featurePoints(geometry: { type?: string; coordinates?: unknown } | null | undefined, properties: Record<string, unknown> | null | undefined): Coordinates[] {
  if (!geometry) return []
  if (geometry.type === 'Point') {
    const point = position(geometry.coordinates)
    return point ? [point] : []
  }
  if (geometry.type === 'MultiPoint' && Array.isArray(geometry.coordinates)) {
    return geometry.coordinates.map(position).filter((point): point is Coordinates => point !== null)
  }
  if (geometry.type === 'Polygon' && Array.isArray(geometry.coordinates)) {
    if (!hasPlaceCategory(properties)) return []
    const center = polygonCenter(geometry.coordinates[0])
    return center ? [center] : []
  }
  if (geometry.type === 'MultiPolygon' && Array.isArray(geometry.coordinates)) {
    if (!hasPlaceCategory(properties)) return []
    return geometry.coordinates
      .map((polygon) => Array.isArray(polygon) ? polygonCenter(polygon[0]) : null)
      .filter((center): center is Coordinates => center !== null)
  }
  return []
}

export function placesFromVectorTile(data: ArrayBuffer | Uint8Array, tile: TileJob, zone: OfflineZone): Place[] {
  const vectorTile = new VectorTile(new PbfReader(data))
  const places: Place[] = []

  for (const layer of Object.values(vectorTile.layers)) {
    for (let index = 0; index < layer.length; index++) {
      const feature = layer.feature(index).toGeoJSON(tile.x, tile.y, tile.z)
      for (const coordinates of featurePoints(feature.geometry, feature.properties)) {
        const place = placeFromFeature({ ...feature, geometry: { type: 'Point', coordinates } })
        if (place && isInZone(zone, place.coordinates)) places.push(place)
      }
    }
  }

  return deduplicatePlaces(places)
}

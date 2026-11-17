import { VectorTile } from '@mapbox/vector-tile'
import { PbfReader } from 'pbf'
import { isInZone, type OfflineZone } from '../storage/offlineZones'
import type { Place } from '../types/domain'
import { deduplicatePlaces, placeFromFeature } from './localPlaceIndex'
import type { TileJob } from './offlineCache'

export function placesFromVectorTile(data: ArrayBuffer | Uint8Array, tile: TileJob, zone: OfflineZone): Place[] {
  const vectorTile = new VectorTile(new PbfReader(data))
  const places: Place[] = []

  for (const layer of Object.values(vectorTile.layers)) {
    for (let index = 0; index < layer.length; index++) {
      const place = placeFromFeature(layer.feature(index).toGeoJSON(tile.x, tile.y, tile.z))
      if (place && isInZone(zone, place.coordinates)) places.push(place)
    }
  }

  return deduplicatePlaces(places)
}

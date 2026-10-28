import type { Coordinates, Place, WalkingRoute } from '../types/domain'

export type RoutingConfig = {
  baseUrl: string
}

type OsrmResponse = {
  code?: string
  routes?: Array<{ distance: number; duration: number; geometry?: { coordinates?: Coordinates[] } }>
  message?: string
}

export async function calculateWalkingRoute(origin: Place, destination: Place, config: RoutingConfig): Promise<WalkingRoute> {
  const coordinates = `${origin.coordinates[0]},${origin.coordinates[1]};${destination.coordinates[0]},${destination.coordinates[1]}`
  const url = `${config.baseUrl.replace(/\/+$/, '')}/route/v1/walking/${coordinates}?overview=full&geometries=geojson&steps=false`
  const response = await fetch(url)
  let payload: OsrmResponse | null = null
  try { payload = await response.json() as OsrmResponse } catch { /* Convert an empty response into a useful routing error. */ }
  if (!response.ok || payload?.code !== 'Ok') throw new Error(payload?.message ?? `Walking route unavailable (${response.status})`)
  const route = payload.routes?.[0]
  if (!route?.geometry?.coordinates?.length) throw new Error('Walking provider returned no route geometry')
  return { coordinates: route.geometry.coordinates, distanceMeters: route.distance, durationSeconds: route.duration, provider: 'osrm' }
}

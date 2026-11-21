import type { Coordinates, JourneyLeg } from '../types/domain'

/**
 * How a move between places is animated. The line style always matches the data:
 * - `routed`: the calculated walking route, drawn solid.
 * - `unrouted`: no route was calculated; a dashed curve "as the crow flies", labelled as such.
 * - `far`: also no route, but far enough that the map zooms out and back in.
 * - `arrive`: no previous place (first place or a "drop in" shortcut); nothing is drawn.
 */
export type TravelKind = 'routed' | 'unrouted' | 'far' | 'arrive'

export const FAR_DISTANCE_METERS = 50_000

export type TravelTimeline = { fitMs: number; drawMs: number; settleMs: number }

const TIMELINES: Record<TravelKind, TravelTimeline> = {
  routed: { fitMs: 700, drawMs: 1500, settleMs: 700 },
  unrouted: { fitMs: 700, drawMs: 1200, settleMs: 700 },
  far: { fitMs: 1200, drawMs: 2000, settleMs: 1500 },
  arrive: { fitMs: 0, drawMs: 0, settleMs: 1000 },
}

export function travelTimeline(kind: TravelKind): TravelTimeline {
  return TIMELINES[kind]
}

/** Time until the marker reaches the destination (the arrival card waits for this when the map is open). */
export function travelArrivalMs(kind: TravelKind): number {
  const { fitMs, drawMs } = TIMELINES[kind]
  return fitMs + drawMs
}

export function distanceMeters([lon1, lat1]: Coordinates, [lon2, lat2]: Coordinates): number {
  const radians = Math.PI / 180
  const dLat = (lat2 - lat1) * radians
  const dLon = (lon2 - lon1) * radians
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * radians) * Math.cos(lat2 * radians) * Math.sin(dLon / 2) ** 2
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export function legDistanceMeters(leg: JourneyLeg): number | null {
  if (leg.distanceMeters !== undefined) return leg.distanceMeters
  return leg.from ? distanceMeters(leg.from.coordinates, leg.to.coordinates) : null
}

export function travelKind(leg: JourneyLeg): TravelKind {
  if (!leg.from || leg.from.id === leg.to.id) return 'arrive'
  if (leg.routed && leg.geometry && leg.geometry.length > 1) return 'routed'
  return distanceMeters(leg.from.coordinates, leg.to.coordinates) > FAR_DISTANCE_METERS ? 'far' : 'unrouted'
}

/**
 * The line to animate. Routed legs use their real geometry. Other legs get a gentle curve between the two
 * places (a quadratic Bézier bowed 18% of the distance to one side), so it reads as a sketch, not a path.
 * Longitudes are unwrapped so a move across the antimeridian takes the short way.
 */
export function travelPath(leg: JourneyLeg, steps = 48): Coordinates[] {
  if (!leg.from) return [leg.to.coordinates]
  if (leg.routed && leg.geometry && leg.geometry.length > 1) return leg.geometry
  const [x0, y0] = leg.from.coordinates
  let [x1, y1] = leg.to.coordinates
  if (x1 - x0 > 180) x1 -= 360
  else if (x0 - x1 > 180) x1 += 360
  const dx = x1 - x0
  const dy = y1 - y0
  const cx = (x0 + x1) / 2 - dy * 0.18
  const cy = (y0 + y1) / 2 + dx * 0.18
  const path: Coordinates[] = []
  for (let index = 0; index <= steps; index += 1) {
    const t = index / steps
    const u = 1 - t
    path.push([u * u * x0 + 2 * u * t * cx + t * t * x1, u * u * y0 + 2 * u * t * cy + t * t * y1])
  }
  return path
}

/** The first `progress` (0–1) of a line by length, ending at an interpolated head point. */
export function partialPath(path: Coordinates[], progress: number): Coordinates[] {
  if (path.length < 2) return path.slice()
  const t = Math.min(1, Math.max(0, progress))
  const lengths = path.slice(1).map((point, index) => Math.hypot(point[0] - path[index][0], point[1] - path[index][1]))
  const total = lengths.reduce((sum, length) => sum + length, 0)
  if (total === 0 || t === 1) return path.slice()
  let remaining = total * t
  const result: Coordinates[] = [path[0]]
  for (let index = 0; index < lengths.length; index += 1) {
    const [ax, ay] = path[index]
    const [bx, by] = path[index + 1]
    if (remaining <= lengths[index]) {
      const f = lengths[index] === 0 ? 0 : remaining / lengths[index]
      result.push([ax + (bx - ax) * f, ay + (by - ay) * f])
      return result
    }
    result.push(path[index + 1])
    remaining -= lengths[index]
  }
  return result
}

export function easeInOut(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2
}

/** Short label shown with the move, so a sketched curve is never mistaken for a calculated route. */
export function travelLabel(leg: JourneyLeg): string {
  const kind = travelKind(leg)
  if (kind === 'routed') {
    const km = leg.distanceMeters !== undefined ? `${(leg.distanceMeters / 1000).toFixed(1)} km` : ''
    const minutes = leg.durationSeconds !== undefined ? `${Math.round(leg.durationSeconds / 60)} min` : ''
    return ['Walking route', km, minutes].filter(Boolean).join(' · ')
  }
  if (kind === 'far') {
    const km = Math.round((legDistanceMeters(leg) ?? 0) / 1000)
    return `${km.toLocaleString()} km away · no route calculated`
  }
  if (kind === 'unrouted') return 'No route calculated'
  return ''
}

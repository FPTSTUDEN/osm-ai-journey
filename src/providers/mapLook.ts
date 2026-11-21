/**
 * Optional map effects. Each one is switched on or off by itself (Settings → Map look, or the Layers button on
 * the map); none depends on another. Only the user's explicit choices are saved, so changing a default later
 * reaches everyone who never touched that switch.
 */
export const MAP_LOOK_EFFECTS = ['palette', 'vignette', 'exploredGlow', 'buildings3d', 'globe', 'timeTint', 'flowingRoutes', 'hillshade'] as const
export type MapLookEffect = (typeof MAP_LOOK_EFFECTS)[number]
export type MapLookChoices = Partial<Record<MapLookEffect, boolean>>
export type MapLook = Record<MapLookEffect, boolean>

export const MAP_LOOK_INFO: Record<MapLookEffect, { label: string; description: string; animated?: boolean; online?: string }> = {
  palette: { label: 'App colours', description: 'Recolours water, parks, roads and buildings to match the app.' },
  vignette: { label: 'Vignette and grain', description: 'Darker edges and a faint paper texture over the map.' },
  exploredGlow: { label: 'Explored glow', description: 'A soft light around places you have visited; the rest of the map is slightly dimmed.' },
  buildings3d: { label: '3D buildings', description: 'Raised buildings from zoom 14, and a gentle tilt when you arrive somewhere.', animated: true },
  globe: { label: 'Globe when zoomed out', description: 'Shows the Earth as a globe with an atmosphere below zoom 5, so long journeys curve over it.' },
  timeTint: { label: 'Time-of-day tint', description: 'Shifts the map with your device clock: warm at dawn and dusk, blue at night. Never the photo.' },
  flowingRoutes: { label: 'Flowing route lines', description: 'A slow light moving along walking routes, towards the destination.', animated: true },
  hillshade: { label: 'Hill shading', description: 'Shaded relief for hilly places.', online: 'Downloads elevation tiles from Amazon’s public terrain dataset.' },
}

/** 3D buildings cost frame rate on small, weak devices, so phones start with them off. */
export function defaultMapLook(isPhone: boolean): MapLook {
  return { palette: true, vignette: true, exploredGlow: true, buildings3d: !isPhone, globe: true, timeTint: false, flowingRoutes: false, hillshade: false }
}

export function resolveMapLook(choices: MapLookChoices | undefined, isPhone: boolean): MapLook {
  return { ...defaultMapLook(isPhone), ...(choices ?? {}) }
}

/** Keeps known effects with boolean values; drops anything else from saved settings. */
export function normalizeMapLookChoices(value: unknown): MapLookChoices | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const choices: MapLookChoices = {}
  for (const effect of MAP_LOOK_EFFECTS) {
    const choice = (value as Record<string, unknown>)[effect]
    if (typeof choice === 'boolean') choices[effect] = choice
  }
  return Object.keys(choices).length ? choices : undefined
}

export type MapLookContext = { motionEnabled: boolean; localArchive: boolean }

/** Why an effect that is switched on is not (fully) showing right now, or null. */
export function mapLookNotice(effect: MapLookEffect, context: MapLookContext): string | null {
  if (context.localArchive && effect === 'palette') return 'Unavailable with a local map archive: it uses its own colours.'
  if (context.localArchive && effect === 'buildings3d') return 'Unavailable with a local map archive: it has no building heights.'
  if (!context.motionEnabled && effect === 'flowingRoutes') return 'Paused: motion is off.'
  if (!context.motionEnabled && effect === 'buildings3d') return 'Buildings show; the arrival tilt is paused because motion is off.'
  return null
}

export type DayPhase = 'dawn' | 'day' | 'dusk' | 'night'

export function dayPhase(hour: number): DayPhase {
  if (hour >= 5 && hour < 8) return 'dawn'
  if (hour >= 8 && hour < 17) return 'day'
  if (hour >= 17 && hour < 20) return 'dusk'
  return 'night'
}

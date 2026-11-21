import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { dayPhase, resolveMapLook, type DayPhase, type MapLookEffect } from '../providers/mapLook'
import type { UserSettings } from '../types/domain'

const PHONE_QUERY = '(max-width: 520px)'

/** Current day phase from the device clock, rechecked every five minutes. */
function useDayPhase(enabled: boolean): DayPhase {
  const [phase, setPhase] = useState(() => dayPhase(new Date().getHours()))
  useEffect(() => {
    if (!enabled) return
    setPhase(dayPhase(new Date().getHours()))
    const timer = window.setInterval(() => setPhase(dayPhase(new Date().getHours())), 5 * 60 * 1000)
    return () => window.clearInterval(timer)
  }, [enabled])
  return phase
}

/** Map look switches shared by Settings and the map's Layers popover. */
export function useMapLook(settings: UserSettings, setSettings: Dispatch<SetStateAction<UserSettings>>, motionEnabled: boolean, localArchive: boolean) {
  // Decided once per session: the default for 3D buildings should not flip while a window is resized.
  const [isPhone] = useState(() => window.matchMedia(PHONE_QUERY).matches)
  const look = useMemo(() => resolveMapLook(settings.mapLook, isPhone), [isPhone, settings.mapLook])
  const phase = useDayPhase(look.timeTint)
  const context = useMemo(() => ({ motionEnabled, localArchive }), [localArchive, motionEnabled])
  const set = useCallback((effect: MapLookEffect, on: boolean) => {
    setSettings((current) => ({ ...current, mapLook: { ...current.mapLook, [effect]: on } }))
  }, [setSettings])
  const reset = useCallback(() => setSettings((current) => ({ ...current, mapLook: undefined })), [setSettings])
  return { look, phase, context, set, reset, customised: Boolean(settings.mapLook && Object.keys(settings.mapLook).length) }
}

export type MapLookState = ReturnType<typeof useMapLook>

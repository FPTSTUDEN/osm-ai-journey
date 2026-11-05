import { useCallback, useEffect, useState } from 'react'
import { fetchCurrentWeather, type WeatherResult } from '../providers/weather'
import { fetchNearbyPlaceData, type NearbyPlaceDataResult } from '../providers/overpass'
import type { PlaceContext } from '../providers/enrichment'
import type { Place, PlacePhoto, UserSettings } from '../types/domain'

type LoadState = 'idle' | 'loading' | 'ready' | 'error'

export function usePlaceData(place: Place | null, settings: UserSettings) {
  const [context, setContext] = useState<PlaceContext | null>(null)
  const [contextState, setContextState] = useState<LoadState>('idle')
  const [contextCached, setContextCached] = useState(false)
  const [photos, setPhotos] = useState<PlacePhoto[]>([])
  const [photosState, setPhotosState] = useState<LoadState>('idle')
  const [photosCached, setPhotosCached] = useState(false)
  const [weather, setWeather] = useState<WeatherResult | null>(null)
  const [weatherState, setWeatherState] = useState<LoadState>('idle')
  const [weatherError, setWeatherError] = useState('')
  const [nearbyData, setNearbyData] = useState<NearbyPlaceDataResult | null>(null)
  const [nearbyDataState, setNearbyDataState] = useState<LoadState>('idle')
  const [nearbyDataError, setNearbyDataError] = useState('')

  useEffect(() => {
    let active = true
    setContext(null)
    setContextState(place ? 'loading' : 'idle')
    setContextCached(false)
    setWeather(null)
    setWeatherState('idle')
    setWeatherError('')
    setNearbyData(null)
    setNearbyDataState('idle')
    setNearbyDataError('')
    setPhotos([])
    setPhotosState(place ? 'loading' : 'idle')
    setPhotosCached(false)

    if (place) {
      void import('../providers/photos').then(({ fetchPlacePhotos }) => fetchPlacePhotos(place)).then((response) => {
        if (!active) return
        setPhotos(response.photos)
        setPhotosCached(response.cached)
        setPhotosState('ready')
      }).catch(() => {
        if (active) setPhotosState('error')
      })

      void import('../providers/enrichment').then(({ enrichPlace }) => enrichPlace(place)).then((response) => {
        if (!active) return
        setContext(response.context)
        setContextCached(response.cached)
        setContextState('ready')
      }).catch(() => {
        if (active) setContextState('error')
      })
    }

    return () => { active = false }
  }, [place])

  const loadWeather = useCallback(async (force = false) => {
    if (!place || !settings.liveDataEnabled) return
    setWeatherState('loading')
    setWeatherError('')
    try {
      const result = await fetchCurrentWeather(place, settings.weatherBaseUrl, force)
      setWeather(result)
      setWeatherState('ready')
    } catch (error) {
      setWeatherState('error')
      setWeatherError(error instanceof Error ? error.message : 'Weather is unavailable')
    }
  }, [place, settings.liveDataEnabled, settings.weatherBaseUrl])

  const loadNearbyData = useCallback(async (force = false) => {
    if (!place || !settings.liveDataEnabled) return
    setNearbyDataState('loading')
    setNearbyDataError('')
    try {
      setNearbyData(await fetchNearbyPlaceData(place, settings.overpassApiUrl, force))
      setNearbyDataState('ready')
    } catch (error) {
      setNearbyDataState('error')
      setNearbyDataError(error instanceof Error ? error.message : 'Opening hours and nearby transport are unavailable')
    }
  }, [place, settings.liveDataEnabled, settings.overpassApiUrl])

  return {
    context,
    contextState,
    contextCached,
    photos,
    photosState,
    photosCached,
    weather,
    weatherState,
    weatherError,
    loadWeather,
    nearbyData,
    nearbyDataState,
    nearbyDataError,
    loadNearbyData,
  }
}

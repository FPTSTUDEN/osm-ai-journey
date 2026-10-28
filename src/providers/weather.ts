import { readLiveCache, writeLiveCache } from '../storage/liveCache'
import type { Place } from '../types/domain'

export type WeatherData = {
  temperatureC: number
  apparentTemperatureC: number
  windSpeedKmh: number
  weatherCode: number
  observedAt: string
}

export type WeatherResult = {
  data: WeatherData
  source: 'live' | 'cached' | 'stale'
  fetchedAt: number
  expiresAt: number
}

type OpenMeteoResponse = {
  current?: { temperature_2m?: number; apparent_temperature?: number; wind_speed_10m?: number; weather_code?: number; time?: string }
}

const CACHE_TTL = 15 * 60 * 1000

function cacheKey(place: Place) {
  return `weather:${place.coordinates[1].toFixed(3)}:${place.coordinates[0].toFixed(3)}`
}

function parseWeather(payload: OpenMeteoResponse): WeatherData {
  const current = payload.current
  if (!current || current.temperature_2m === undefined || current.apparent_temperature === undefined || current.wind_speed_10m === undefined || current.weather_code === undefined || !current.time) throw new Error('Weather provider returned incomplete current conditions')
  return { temperatureC: current.temperature_2m, apparentTemperatureC: current.apparent_temperature, windSpeedKmh: current.wind_speed_10m, weatherCode: current.weather_code, observedAt: current.time }
}

export async function fetchCurrentWeather(place: Place, baseUrl: string, force = false): Promise<WeatherResult> {
  const key = cacheKey(place)
  const cached = await readLiveCache<WeatherData>(key)
  if (!force && cached && cached.expiresAt > Date.now()) return { ...cached, data: cached.value, source: 'cached' }
  try {
    const url = new URL(baseUrl)
    url.searchParams.set('latitude', String(place.coordinates[1]))
    url.searchParams.set('longitude', String(place.coordinates[0]))
    url.searchParams.set('current', 'temperature_2m,apparent_temperature,wind_speed_10m,weather_code')
    url.searchParams.set('timezone', 'auto')
    const response = await fetch(url)
    if (!response.ok) throw new Error(`Weather provider unavailable (${response.status})`)
    const data = parseWeather(await response.json() as OpenMeteoResponse)
    await writeLiveCache(key, data, CACHE_TTL)
    const fetchedAt = Date.now()
    return { data, source: 'live', fetchedAt, expiresAt: fetchedAt + CACHE_TTL }
  } catch (error) {
    if (cached) return { ...cached, data: cached.value, source: 'stale' }
    throw error
  }
}

export function weatherLabel(code: number) {
  if (code === 0) return 'Clear sky'
  if (code <= 3) return 'Partly cloudy'
  if (code <= 48) return 'Foggy'
  if (code <= 67) return 'Rain'
  if (code <= 77) return 'Snow'
  if (code <= 82) return 'Rain showers'
  return 'Thunderstorm'
}

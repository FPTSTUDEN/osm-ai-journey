export type Coordinates = [number, number]

export type Place = {
  id: string
  name: string
  category?: string
  description?: string
  coordinates: Coordinates
  source: 'map' | 'online'
}

export type UserSettings = {
  llmBaseUrl: string
  llmModel: string
  llmApiKey: string
  onlineGeocoder: 'nominatim' | 'photon'
  calculateWalkingRoutes: boolean
  liveDataEnabled: boolean
}

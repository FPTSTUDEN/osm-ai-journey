export type Coordinates = [number, number]

export type WalkingRoute = {
  coordinates: Coordinates[]
  distanceMeters: number
  durationSeconds: number
  provider: 'osrm'
}

export type Place = {
  id: string
  name: string
  category?: string
  osmType?: string
  osmId?: string
  description?: string
  coordinates: Coordinates
  source: 'map' | 'online'
}

export type UserSettings = {
  llmProvider: 'ollama' | 'openai' | 'lmstudio' | 'vllm' | 'custom'
  llmBaseUrl: string
  llmModel: string
  llmApiKey: string
  personaName: string
  personaInstructions: string
  onlineGeocoder: 'nominatim' | 'photon'
  calculateWalkingRoutes: boolean
  routingBaseUrl: string
  liveDataEnabled: boolean
  weatherBaseUrl: string
}

export type NarrativeEvent = {
  id: string
  type: 'destination-transition' | 'routed-transition' | 'unrouted-transition' | 'message'
  createdAt: string
  text: string
  placeId?: string
}

export type JourneyState = {
  id: 'active'
  currentDestination: Place | null
  destinationHistory: Place[]
  currentScene: number
  messages: string[]
  knownPeople: string[]
  knownEntities: string[]
  userFacts: string[]
  narrativeEvents: NarrativeEvent[]
  conversationSummary?: string
}

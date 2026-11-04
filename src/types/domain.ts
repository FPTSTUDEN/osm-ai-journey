export type Coordinates = [number, number]

export type MapViewport = {
  center: Coordinates
  zoom: number
}

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

export type PlacePhoto = {
  id: string
  title: string
  description?: string
  author?: string
  publishedAt?: string
  imageUrl: string
  thumbnailUrl: string
  sourceUrl: string
  source: 'wikimedia-commons'
  distanceMeters?: number
  photoCoordinates?: Coordinates
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

export type ChatEntry = {
  id: string
  /** `event` entries are app-generated narration (e.g. arrivals); they are never sent to the model as a user turn. */
  role: 'user' | 'assistant' | 'event'
  text: string
  createdAt: string
}

export type JourneyState = {
  id: 'active'
  currentDestination: Place | null
  mapViewport?: MapViewport | null
  destinationHistory: Place[]
  currentScene: number
  messages: ChatEntry[]
  knownPeople: string[]
  knownEntities: string[]
  userFacts: string[]
  narrativeEvents: NarrativeEvent[]
  conversationSummary?: string
}

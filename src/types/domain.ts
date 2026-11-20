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
  /** OSM tag value when `category` is a broader class, e.g. category `shop`, subcategory `mall` (OpenMapTiles `subclass`). */
  subcategory?: string
  osmType?: string
  osmId?: string
  wikidataId?: string
  wikipediaTitle?: string
  openingHours?: string
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
  license?: string
  licenseUrl?: string
  attributionRequired?: boolean
  imageUrl: string
  sceneUrl?: string
  thumbnailUrl: string
  sourceUrl: string
  source: 'wikimedia-commons'
  distanceMeters?: number
  photoCoordinates?: Coordinates
}

export type StoryPresentationMode = 'novel' | 'visual-novel' | 'chat'
export type MotionPreference = 'on' | 'auto' | 'off'

export type PersonaSpriteId = string

export type PersonaProfile = {
  id: string
  name: string
  instructions: string
  spriteId: PersonaSpriteId
}

export type UserSettings = {
  storyPresentationMode?: StoryPresentationMode
  motionPreference?: MotionPreference
  /** Map column width in px set with the divider; undefined uses the layout default. */
  mapPanelWidth?: number
  personaProfiles?: PersonaProfile[]
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
  overpassApiUrl: string
  companionImage: boolean
}

export type NarrativeEvent = {
  id: string
  type: 'destination-transition' | 'routed-transition' | 'unrouted-transition' | 'message'
  createdAt: string
  text: string
  placeId?: string
}

export type StoryBlock =
  | { id: string; type: 'prose' | 'narration' | 'scene'; text: string }
  | { id: string; type: 'dialogue'; speaker: string; text: string }

export type StoryTurn = {
  format: 'structured' | 'plain-text'
  blocks: StoryBlock[]
}

export type StoryProgress = { entryId: string; blockIndex: number }

export type JourneyLeg = {
  id: string
  from: Place | null
  to: Place
  routed: boolean
  /** Undefined when the transition did not use a walking route. */
  geometry?: Coordinates[]
  distanceMeters?: number
  durationSeconds?: number
  createdAt: string
}

export type JourneyTimeline = {
  personaId?: string
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
  storyProgress?: StoryProgress | null
  legs?: JourneyLeg[]
}

export type StoryCheckpoint = Omit<JourneyTimeline, 'messages' | 'storyProgress'>

export type StoryBranch = {
  id: string
  label: string
  createdAt: string
  snapshot: JourneyTimeline
}

/** Who wrote an assistant entry, recorded when it was created so switching persona later keeps the original speaker. */
export type EntryPersona = {
  id: string
  /** Name at the time of writing; shown if the persona has since been deleted. */
  name: string
  spriteId?: PersonaSpriteId
}

export type ChatEntry = {
  id: string
  /** `event` entries are app-generated narration (e.g. arrivals); they are never sent to the model as a user turn. */
  role: 'user' | 'assistant' | 'event'
  text: string
  storyTurn?: StoryTurn
  checkpoint?: StoryCheckpoint
  /** Assistant entries only. Missing on entries saved before this field existed: those fall back to the active persona. */
  persona?: EntryPersona
  createdAt: string
}

export type JourneyConversation = {
  id: string
  title: string
  createdAt: string
  messages: ChatEntry[]
  narrativeEvents: NarrativeEvent[]
  conversationSummary: string
  storyProgress: StoryProgress | null
  branches: StoryBranch[]
}

export type JourneyState = JourneyTimeline & {
  id: 'active'
  branches?: StoryBranch[]
  conversations?: JourneyConversation[]
  activeConversationId?: string
}

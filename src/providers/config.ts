import type { PersonaProfile, PersonaSpriteId, UserSettings } from '../types/domain'

export const OPENFREEMAP_STYLE = 'https://tiles.openfreemap.org/styles/bright'

export const DEFAULT_PERSONA_ID = 'wayfinder'
export const DEFAULT_PERSONA: PersonaProfile = {
  id: DEFAULT_PERSONA_ID,
  name: 'The Wayfinder',
  instructions: 'Be curious, warm, and concise. Offer possibilities without forcing the traveler into a fixed plot.',
  spriteId: 'aurelio',
}

export const PERSONA_SPRITES: Record<PersonaSpriteId, { label: string; src: string }> = {
  aurelio: { label: 'Aurelio · Classic', src: '/sprites/aurelio-sprite.png' },
  'aurelio-watercolor': { label: 'Aurelio · Watercolor', src: '/sprites/aurelio-sprite-watercolor.png' },
  'aurelio-ink': { label: 'Aurelio · Ink', src: '/sprites/aurelio-sprite-ink.png' },
  'aurelio-anime': { label: 'Aurelio · Anime', src: '/sprites/aurelio-sprite-anime.png' },
  'historian-watercolor': { label: 'Historian · Watercolor', src: '/sprites/historian-sprite-watercolor.png' },
  'historian-noir': { label: 'Historian · Noir', src: '/sprites/historian-sprite-noir.png' },
  'historian-ink': { label: 'Historian · Ink', src: '/sprites/historian-sprite-ink.png' },
  'historian-anime': { label: 'Historian · Anime', src: '/sprites/historian-sprite-anime.png' },
}

export const DEFAULT_SETTINGS: UserSettings = {
  storyPresentationMode: 'novel',
  personaProfiles: [DEFAULT_PERSONA],
  llmProvider: 'ollama',
  llmBaseUrl: 'http://localhost:11434/v1',
  llmModel: 'llama3.2',
  llmApiKey: '',
  personaName: 'The Wayfinder',
  personaInstructions: 'Be curious, warm, and concise. Offer possibilities without forcing the traveler into a fixed plot.',
  onlineGeocoder: 'nominatim',
  calculateWalkingRoutes: false,
  liveDataEnabled: false,
  routingBaseUrl: 'https://router.project-osrm.org',
  weatherBaseUrl: 'https://api.open-meteo.com/v1/forecast',
  overpassApiUrl: 'https://overpass-api.de/api/interpreter',
  companionImage: false,
}

export const LLM_PROVIDER_PRESETS: Record<Exclude<UserSettings['llmProvider'], 'custom'>, { label: string; baseUrl: string; model: string }> = {
  ollama: { label: 'Ollama', baseUrl: 'http://localhost:11434/v1', model: 'llama3.2' },
  openai: { label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  lmstudio: { label: 'LM Studio', baseUrl: 'http://localhost:1234/v1', model: 'local-model' },
  vllm: { label: 'vLLM', baseUrl: 'http://localhost:8000/v1', model: 'default' },
}

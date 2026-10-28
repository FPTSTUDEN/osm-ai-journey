import type { UserSettings } from '../types/domain'

export const OPENFREEMAP_STYLE = 'https://tiles.openfreemap.org/styles/bright'

export const DEFAULT_SETTINGS: UserSettings = {
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
}

export const LLM_PROVIDER_PRESETS: Record<Exclude<UserSettings['llmProvider'], 'custom'>, { label: string; baseUrl: string; model: string }> = {
  ollama: { label: 'Ollama', baseUrl: 'http://localhost:11434/v1', model: 'llama3.2' },
  openai: { label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  lmstudio: { label: 'LM Studio', baseUrl: 'http://localhost:1234/v1', model: 'local-model' },
  vllm: { label: 'vLLM', baseUrl: 'http://localhost:8000/v1', model: 'default' },
}

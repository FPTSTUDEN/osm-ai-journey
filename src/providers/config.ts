import type { UserSettings } from '../types/domain'

export const OPENFREEMAP_STYLE = 'https://tiles.openfreemap.org/styles/bright'

export const DEFAULT_SETTINGS: UserSettings = {
  llmBaseUrl: 'http://localhost:11434/v1',
  llmModel: 'llama3.2',
  llmApiKey: '',
  onlineGeocoder: 'nominatim',
  calculateWalkingRoutes: false,
  liveDataEnabled: false,
}

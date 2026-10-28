import type { ChatMessage } from './llm'
import type { JourneyState, Place, UserSettings } from '../types/domain'

type ContextInput = {
  settings: UserSettings
  selectedPlace: Place | null
  journey: Pick<JourneyState, 'destinationHistory' | 'currentScene' | 'knownPeople' | 'knownEntities' | 'userFacts' | 'conversationSummary'>
  messages: string[]
  userMessage: string
  liveWeather?: string
}

export function buildJourneyContext(input: ContextInput): ChatMessage[] {
  const { settings, selectedPlace, journey, messages, userMessage } = input
  const location = selectedPlace ? `${selectedPlace.name} (${selectedPlace.coordinates[1].toFixed(4)}, ${selectedPlace.coordinates[0].toFixed(4)})` : 'no destination selected'
  const system = [
    `You are ${settings.personaName || 'the journey companion'}.`,
    settings.personaInstructions || 'Be helpful, imaginative, and concise.',
    'The traveler is free to change direction, reject suggestions, or simply chat. Never force a destination, action, or plot outcome.',
    `Current scene: ${journey.currentScene}. Current destination: ${location}.`,
    `Visited destinations: ${journey.destinationHistory.map((place) => place.name).join(', ') || 'none'}.`,
    `Known people: ${journey.knownPeople.join(', ') || 'none'}. Known entities: ${journey.knownEntities.join(', ') || 'none'}. User facts: ${journey.userFacts.join('; ') || 'none'}.`,
    journey.conversationSummary ? `Summary of earlier conversation: ${journey.conversationSummary}` : '',
    input.liveWeather ? `Current weather data (${input.liveWeather}). Treat it as time-sensitive and distinguish it from static destination facts.` : '',
  ].filter(Boolean).join('\n')
  const history = messages.slice(1).map((content, index) => ({ role: (index % 2 ? 'assistant' : 'user') as ChatMessage['role'], content }))
  return [{ role: 'system', content: system }, ...history, { role: 'user', content: userMessage }]
}

export function buildSummaryMessages(messages: string[]): ChatMessage[] {
  return [
    { role: 'system', content: 'Summarize the established journey context for a future assistant. Preserve important people, entities, user preferences, unresolved threads, and commitments. Do not invent details. Use concise plain text.' },
    { role: 'user', content: messages.slice(1).map((message, index) => `${index % 2 ? 'Assistant' : 'Traveler'}: ${message}`).join('\n') },
  ]
}

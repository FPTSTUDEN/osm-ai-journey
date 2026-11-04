import type { JourneyState, Place } from '../types/domain'
import { normalizeMessages } from './messages'

function isPlace(value: unknown): value is Place {
  if (!value || typeof value !== 'object') return false
  const place = value as Partial<Place>
  return typeof place.id === 'string'
    && typeof place.name === 'string'
    && Array.isArray(place.coordinates)
    && place.coordinates.length === 2
    && place.coordinates.every((coordinate) => typeof coordinate === 'number' && Number.isFinite(coordinate))
    && (place.source === 'map' || place.source === 'online')
}

export function parseJourneyJson(value: unknown): JourneyState {
  if (!value || typeof value !== 'object') throw new Error('Journey file must contain a JSON object')
  const journey = value as Partial<JourneyState>
  if (journey.id !== 'active') throw new Error('Journey file has an invalid id')
  if (!isPlace(journey.currentDestination) && journey.currentDestination !== null) throw new Error('Journey file has an invalid current destination')
  if (!Array.isArray(journey.destinationHistory) || !journey.destinationHistory.every(isPlace)) throw new Error('Journey file has invalid destination history')
  if (typeof journey.currentScene !== 'number' || !Number.isInteger(journey.currentScene) || journey.currentScene < 1) throw new Error('Journey file has an invalid scene')
  const messages = normalizeMessages(journey.messages)
  if (!messages) throw new Error('Journey file has invalid messages')
  if (!Array.isArray(journey.knownPeople) || !journey.knownPeople.every((item) => typeof item === 'string')) throw new Error('Journey file has invalid people')
  if (!Array.isArray(journey.knownEntities) || !journey.knownEntities.every((item) => typeof item === 'string')) throw new Error('Journey file has invalid entities')
  if (!Array.isArray(journey.userFacts) || !journey.userFacts.every((item) => typeof item === 'string')) throw new Error('Journey file has invalid facts')
  if (!Array.isArray(journey.narrativeEvents) || !journey.narrativeEvents.every((item) => item && typeof item === 'object')) throw new Error('Journey file has invalid events')
  return {
    id: 'active',
    currentDestination: journey.currentDestination ?? null,
    mapViewport: journey.mapViewport ?? null,
    destinationHistory: journey.destinationHistory,
    currentScene: journey.currentScene,
    messages,
    knownPeople: journey.knownPeople,
    knownEntities: journey.knownEntities,
    userFacts: journey.userFacts,
    narrativeEvents: journey.narrativeEvents,
    conversationSummary: typeof journey.conversationSummary === 'string' ? journey.conversationSummary : '',
  }
}

export function journeyJson(journey: JourneyState): string {
  return JSON.stringify(journey, null, 2)
}

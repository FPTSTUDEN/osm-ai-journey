import type { JourneyState, JourneyTimeline, Place, StoryBranch, StoryProgress } from '../types/domain'
import { DEFAULT_PERSONA_ID } from '../providers/config'
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

function parseTimeline(value: unknown): JourneyTimeline {
  if (!value || typeof value !== 'object') throw new Error('Journey branch has invalid timeline')
  const timeline = value as Partial<JourneyTimeline>
  const messages = normalizeMessages(timeline.messages)
  if (!isPlace(timeline.currentDestination) && timeline.currentDestination !== null) throw new Error('Journey branch has invalid destination')
  if (!Array.isArray(timeline.destinationHistory) || !timeline.destinationHistory.every(isPlace)) throw new Error('Journey branch has invalid destination history')
  if (typeof timeline.currentScene !== 'number' || !Number.isInteger(timeline.currentScene) || timeline.currentScene < 1) throw new Error('Journey branch has invalid scene')
  if (!messages || !Array.isArray(timeline.knownPeople) || !timeline.knownPeople.every((item) => typeof item === 'string')) throw new Error('Journey branch has invalid messages or people')
  if (!Array.isArray(timeline.knownEntities) || !timeline.knownEntities.every((item) => typeof item === 'string')) throw new Error('Journey branch has invalid entities')
  if (!Array.isArray(timeline.userFacts) || !timeline.userFacts.every((item) => typeof item === 'string')) throw new Error('Journey branch has invalid facts')
  if (!Array.isArray(timeline.narrativeEvents) || !timeline.narrativeEvents.every((item) => item && typeof item === 'object')) throw new Error('Journey branch has invalid events')
  const progress = timeline.storyProgress as Partial<StoryProgress> | null | undefined
  const progressEntry = progress && messages.find((entry) => entry.id === progress.entryId && entry.role === 'assistant')
  const blockCount = progressEntry?.storyTurn?.blocks.length ?? (progressEntry ? 1 : 0)
  const storyProgress = progressEntry && typeof progress?.blockIndex === 'number' && Number.isInteger(progress.blockIndex) && progress.blockIndex >= 0 && progress.blockIndex < blockCount
    ? { entryId: progress.entryId!, blockIndex: progress.blockIndex }
    : null
  return {
    personaId: typeof timeline.personaId === 'string' ? timeline.personaId : DEFAULT_PERSONA_ID,
    currentDestination: timeline.currentDestination ?? null,
    mapViewport: timeline.mapViewport ?? null,
    destinationHistory: timeline.destinationHistory,
    currentScene: timeline.currentScene,
    messages,
    knownPeople: timeline.knownPeople,
    knownEntities: timeline.knownEntities,
    userFacts: timeline.userFacts,
    narrativeEvents: timeline.narrativeEvents,
    conversationSummary: typeof timeline.conversationSummary === 'string' ? timeline.conversationSummary : '',
    storyProgress,
  }
}

function parseBranches(value: unknown): StoryBranch[] {
  if (value === undefined) return []
  if (!Array.isArray(value)) throw new Error('Journey file has invalid branches')
  return value.map((item) => {
    if (!item || typeof item !== 'object') throw new Error('Journey file has an invalid branch')
    const branch = item as Partial<StoryBranch>
    if (typeof branch.id !== 'string' || typeof branch.label !== 'string' || typeof branch.createdAt !== 'string') throw new Error('Journey file has an invalid branch')
    return { id: branch.id, label: branch.label, createdAt: branch.createdAt, snapshot: parseTimeline(branch.snapshot) }
  })
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
    personaId: typeof journey.personaId === 'string' ? journey.personaId : DEFAULT_PERSONA_ID,
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
    storyProgress: parseTimeline({ ...journey, storyProgress: journey.storyProgress }).storyProgress ?? null,
    branches: parseBranches(journey.branches),
  }
}

export function journeyJson(journey: JourneyState): string {
  return JSON.stringify(journey, null, 2)
}

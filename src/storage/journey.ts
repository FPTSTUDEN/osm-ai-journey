import type { JourneyState, JourneyTimeline, StoryBranch, StoryProgress } from '../types/domain'
import { get, put, remove } from './db'
import { normalizeMessages } from './messages'

const JOURNEY_STORE = 'journeys'

function normalizeProgress(value: unknown, messages: JourneyTimeline['messages']): StoryProgress | null {
  if (!value || typeof value !== 'object') return null
  const progress = value as Partial<StoryProgress>
  if (typeof progress.entryId !== 'string' || typeof progress.blockIndex !== 'number' || !Number.isInteger(progress.blockIndex) || progress.blockIndex < 0) return null
  const entry = messages.find((message) => message.id === progress.entryId && message.role === 'assistant')
  const blockCount = entry?.storyTurn?.blocks.length ?? (entry ? 1 : 0)
  return entry && progress.blockIndex < blockCount ? { entryId: progress.entryId, blockIndex: progress.blockIndex } : null
}

function normalizeTimeline(value: unknown): JourneyTimeline | null {
  if (!value || typeof value !== 'object') return null
  const timeline = value as Partial<JourneyTimeline>
  const messages = normalizeMessages(timeline.messages)
  if (!messages || (timeline.currentDestination !== null && (!timeline.currentDestination || typeof timeline.currentDestination !== 'object'))
    || !Array.isArray(timeline.destinationHistory) || typeof timeline.currentScene !== 'number' || !Number.isInteger(timeline.currentScene)
    || !Array.isArray(timeline.knownPeople) || !Array.isArray(timeline.knownEntities) || !Array.isArray(timeline.userFacts) || !Array.isArray(timeline.narrativeEvents)) return null
  return {
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
    storyProgress: normalizeProgress(timeline.storyProgress, messages),
  }
}

function normalizeBranches(value: unknown): StoryBranch[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const branch = item as Partial<StoryBranch>
    const snapshot = normalizeTimeline(branch.snapshot)
    return typeof branch.id === 'string' && typeof branch.label === 'string' && typeof branch.createdAt === 'string' && snapshot
      ? [{ id: branch.id, label: branch.label, createdAt: branch.createdAt, snapshot }]
      : []
  })
}

export async function loadActiveJourney(): Promise<JourneyState | null> {
  try {
    const journey = await get<Omit<JourneyState, 'messages'> & { messages: unknown }>(JOURNEY_STORE, 'active')
    if (!journey) return null
    // Journeys saved before structured messages stored string[]; migrate on read.
    const messages = normalizeMessages(journey.messages) ?? []
    return {
      ...journey,
      messages,
      branches: normalizeBranches(journey.branches),
      storyProgress: normalizeProgress(journey.storyProgress, messages),
    }
  } catch {
    return null
  }
}

export async function saveActiveJourney(journey: JourneyState) {
  try {
    await put(JOURNEY_STORE, journey)
  } catch {
    // Journey state remains usable for this session when storage is unavailable.
  }
}

export async function deleteActiveJourney() {
  try {
    await remove(JOURNEY_STORE, 'active')
  } catch {
    // Resetting the in-memory journey still works when storage is unavailable.
  }
}

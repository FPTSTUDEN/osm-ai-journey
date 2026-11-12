import type { JourneyConversation, JourneyState, JourneyTimeline, StoryBranch, StoryProgress } from '../types/domain'
import { DEFAULT_PERSONA_ID } from '../providers/config'
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

function conversationTitle(messages: JourneyTimeline['messages']): string {
  const firstMessage = messages.find((entry) => entry.role === 'user')?.text.trim()
  if (!firstMessage) return 'New conversation'
  return firstMessage.length > 42 ? `${firstMessage.slice(0, 39).trimEnd()}…` : firstMessage
}

function normalizeConversations(value: unknown): JourneyConversation[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const conversation = item as Partial<JourneyConversation>
    const messages = normalizeMessages(conversation.messages)
    if (typeof conversation.id !== 'string' || typeof conversation.createdAt !== 'string' || !messages) return []
    return [{
      id: conversation.id,
      title: conversationTitle(messages),
      createdAt: conversation.createdAt,
      messages,
      narrativeEvents: Array.isArray(conversation.narrativeEvents) ? conversation.narrativeEvents : [],
      conversationSummary: typeof conversation.conversationSummary === 'string' ? conversation.conversationSummary : '',
      storyProgress: normalizeProgress(conversation.storyProgress, messages),
      branches: normalizeBranches(conversation.branches),
    }]
  })
}

export async function loadActiveJourney(): Promise<JourneyState | null> {
  try {
    const journey = await get<Omit<JourneyState, 'messages'> & { messages: unknown }>(JOURNEY_STORE, 'active')
    if (!journey) return null
    // Journeys saved before structured messages stored string[]; migrate on read.
    const messages = normalizeMessages(journey.messages) ?? []
    const branches = normalizeBranches(journey.branches)
    const storyProgress = normalizeProgress(journey.storyProgress, messages)
    const conversations = normalizeConversations(journey.conversations)
    const migratedConversations = conversations.length ? conversations : [{
      id: crypto.randomUUID(),
      title: conversationTitle(messages),
      createdAt: new Date().toISOString(),
      messages,
      narrativeEvents: journey.narrativeEvents,
      conversationSummary: journey.conversationSummary ?? '',
      storyProgress,
      branches,
    }]
    const activeConversationId = migratedConversations.some((conversation) => conversation.id === journey.activeConversationId)
      ? journey.activeConversationId
      : migratedConversations[0].id
    return {
      ...journey,
      messages,
      branches,
      storyProgress,
      conversations: migratedConversations,
      activeConversationId,
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

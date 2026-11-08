import { normalizeStoredStoryTurn, storyTurnToText } from '../providers/storyFormat'
import type { ChatEntry, StoryCheckpoint } from '../types/domain'

export const STARTER_MESSAGE = 'Choose a place on the map, or tell me what kind of journey you want to begin.'

export function newEntry(role: ChatEntry['role'], text: string, checkpoint?: StoryCheckpoint): ChatEntry {
  return { id: crypto.randomUUID(), role, text, ...(checkpoint ? { checkpoint } : {}), createdAt: new Date().toISOString() }
}

export function starterEntries(): ChatEntry[] {
  return [newEntry('assistant', STARTER_MESSAGE)]
}

function isEntry(value: unknown): value is ChatEntry {
  if (!value || typeof value !== 'object') return false
  const entry = value as Partial<ChatEntry>
  return typeof entry.id === 'string' && typeof entry.text === 'string' && (entry.role === 'user' || entry.role === 'assistant' || entry.role === 'event')
}

function isStoryCheckpoint(value: unknown): value is StoryCheckpoint {
  if (!value || typeof value !== 'object') return false
  const checkpoint = value as Partial<StoryCheckpoint>
  return (checkpoint.currentDestination === null || Boolean(checkpoint.currentDestination && typeof checkpoint.currentDestination === 'object'))
    && (checkpoint.personaId === undefined || typeof checkpoint.personaId === 'string')
    && Array.isArray(checkpoint.destinationHistory)
    && typeof checkpoint.currentScene === 'number'
    && Number.isInteger(checkpoint.currentScene)
    && Array.isArray(checkpoint.knownPeople)
    && Array.isArray(checkpoint.knownEntities)
    && Array.isArray(checkpoint.userFacts)
    && Array.isArray(checkpoint.narrativeEvents)
}

function normalizeEntry(entry: ChatEntry): ChatEntry {
  if (entry.role !== 'assistant') return {
    id: entry.id,
    role: entry.role,
    text: entry.text,
    ...(entry.role === 'user' && isStoryCheckpoint(entry.checkpoint) ? { checkpoint: entry.checkpoint } : {}),
    createdAt: entry.createdAt,
  }
  const storyTurn = normalizeStoredStoryTurn(entry.storyTurn, entry.text, entry.id)
  return { id: entry.id, role: entry.role, text: storyTurnToText(storyTurn), storyTurn, createdAt: entry.createdAt }
}

/**
 * Accepts the current `ChatEntry[]` shape or the legacy `string[]` shape.
 * Legacy rule (the one the old UI and context builder used): index 0 is the assistant starter, then user/assistant alternate.
 * Legacy arrival lines ("You arrive at …") become `event` entries and do not take part in the alternation.
 * Returns null when the value is not a valid message list.
 */
export function normalizeMessages(value: unknown): ChatEntry[] | null {
  if (!Array.isArray(value)) return null
  if (value.every(isEntry)) return value.length ? value.map((entry) => normalizeEntry(entry)) : starterEntries()
  if (!value.every((item) => typeof item === 'string')) return null
  let turn = 0
  const entries = (value as string[]).map((text, index): ChatEntry => {
    if (index === 0) return { ...newEntry('assistant', text) }
    if (/^You arrive at .+\./.test(text)) return newEntry('event', text)
    const role = turn % 2 === 0 ? 'user' : 'assistant'
    turn += 1
    return newEntry(role, text)
  })
  return entries.length ? entries.map((entry) => normalizeEntry(entry)) : starterEntries()
}

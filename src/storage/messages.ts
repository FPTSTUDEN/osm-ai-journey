import type { ChatEntry } from '../types/domain'

export const STARTER_MESSAGE = 'Choose a place on the map, or tell me what kind of journey you want to begin.'

export function newEntry(role: ChatEntry['role'], text: string): ChatEntry {
  return { id: crypto.randomUUID(), role, text, createdAt: new Date().toISOString() }
}

export function starterEntries(): ChatEntry[] {
  return [newEntry('assistant', STARTER_MESSAGE)]
}

function isEntry(value: unknown): value is ChatEntry {
  if (!value || typeof value !== 'object') return false
  const entry = value as Partial<ChatEntry>
  return typeof entry.id === 'string' && typeof entry.text === 'string' && (entry.role === 'user' || entry.role === 'assistant' || entry.role === 'event')
}

/**
 * Accepts the current `ChatEntry[]` shape or the legacy `string[]` shape.
 * Legacy rule (the one the old UI and context builder used): index 0 is the assistant starter, then user/assistant alternate.
 * Legacy arrival lines ("You arrive at …") become `event` entries and do not take part in the alternation.
 * Returns null when the value is not a valid message list.
 */
export function normalizeMessages(value: unknown): ChatEntry[] | null {
  if (!Array.isArray(value)) return null
  if (value.every(isEntry)) return value.length ? value : starterEntries()
  if (!value.every((item) => typeof item === 'string')) return null
  let turn = 0
  const entries = (value as string[]).map((text, index): ChatEntry => {
    if (index === 0) return { ...newEntry('assistant', text) }
    if (/^You arrive at .+\./.test(text)) return newEntry('event', text)
    const role = turn % 2 === 0 ? 'user' : 'assistant'
    turn += 1
    return newEntry(role, text)
  })
  return entries.length ? entries : starterEntries()
}

import type { ChatEntry, StoryBlock, StoryProgress, StoryTurn } from '../types/domain'

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function blockFromValue(value: unknown, id: string): StoryBlock | null {
  if (!isRecord(value) || typeof value.text !== 'string' || !value.text.trim()) return null
  if (value.type === 'narration' || value.type === 'scene') return { id, type: value.type, text: value.text }
  if (value.type === 'dialogue' && typeof value.speaker === 'string' && value.speaker.trim()) {
    return { id, type: 'dialogue', speaker: value.speaker, text: value.text }
  }
  if (value.type === 'prose') return { id, type: 'prose', text: value.text }
  return null
}

function blocksFromValues(values: unknown[], turnId: string): StoryBlock[] | null {
  const blocks = values.map((value, index) => blockFromValue(value, `${turnId}:${index + 1}`))
  return blocks.every((block): block is StoryBlock => block !== null) ? blocks : null
}

export function storyTurnToText(turn: StoryTurn): string {
  return turn.blocks.map((block) => {
    if (block.type === 'dialogue') return `${block.speaker}: ${block.text}`
    if (block.type === 'scene') return `[Scene] ${block.text}`
    return block.text
  }).join('\n\n')
}

export function plainTextStoryTurn(text: string, turnId: string): StoryTurn {
  return {
    format: 'plain-text',
    blocks: [{ id: `${turnId}:1`, type: 'prose', text }],
  }
}

export function parseStoryResponse(content: string, turnId: string): StoryTurn {
  const trimmed = content.trim()
  const candidate = trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  try {
    const parsed: unknown = JSON.parse(candidate)
    if (isRecord(parsed) && Array.isArray(parsed.blocks) && parsed.blocks.length > 0) {
      const blocks = blocksFromValues(parsed.blocks, turnId)
      if (blocks) return { format: 'structured', blocks }
    }
  } catch {
    // Non-JSON and malformed output is kept as readable prose.
  }
  return plainTextStoryTurn(content, turnId)
}

export function normalizeStoredStoryTurn(value: unknown, fallbackText: string, turnId: string): StoryTurn {
  if (isRecord(value) && (value.format === 'structured' || value.format === 'plain-text') && Array.isArray(value.blocks)) {
    const blocks = value.blocks.map((block, index) => {
      if (!isRecord(block) || typeof block.id !== 'string' || !block.id) return null
      return blockFromValue(block, block.id || `${turnId}:${index + 1}`)
    })
    if (blocks.length > 0 && blocks.every((block): block is StoryBlock => block !== null)) {
      const normalized = blocks as StoryBlock[]
      if (value.format === 'structured') return { format: 'structured', blocks: normalized }
      if (normalized.length === 1 && normalized[0].type === 'prose') return { format: 'plain-text', blocks: normalized }
    }
  }
  return plainTextStoryTurn(fallbackText, turnId)
}

export type StoryStop = StoryProgress

const STARTER_STORY_TEXT = 'Choose a place on the map, or tell me what kind of journey you want to begin.'

export function storyStops(entries: ChatEntry[]): StoryStop[] {
  return entries.flatMap((entry) => entry.role === 'assistant' && entry.text !== STARTER_STORY_TEXT
    ? (entry.storyTurn?.blocks ?? [{ id: `${entry.id}:1`, type: 'prose' as const, text: entry.text }]).map((_, blockIndex) => ({ entryId: entry.id, blockIndex }))
    : [])
}

export function latestStoryStop(entries: ChatEntry[]): StoryStop | null {
  return storyStops(entries).at(-1) ?? null
}

export function storyStopIndex(entries: ChatEntry[], progress: StoryProgress | null | undefined): number {
  if (!progress) return Math.max(0, storyStops(entries).length - 1)
  return storyStops(entries).findIndex((stop) => stop.entryId === progress.entryId && stop.blockIndex === progress.blockIndex)
}

export function trimHistoryAtStoryStop(entries: ChatEntry[], stop: StoryStop): ChatEntry[] {
  const entryIndex = entries.findIndex((entry) => entry.id === stop.entryId && entry.role === 'assistant')
  if (entryIndex < 0) return entries
  const entry = entries[entryIndex]
  const turn = entry.storyTurn ?? plainTextStoryTurn(entry.text, entry.id)
  const blocks = turn.blocks.slice(0, stop.blockIndex + 1)
  if (!blocks.length) return entries.slice(0, entryIndex)
  const storyTurn: StoryTurn = { ...turn, blocks }
  const trimmed = { ...entry, text: storyTurnToText(storyTurn), storyTurn }
  return [...entries.slice(0, entryIndex), trimmed]
}

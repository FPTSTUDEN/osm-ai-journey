import type { StoryBlock, StoryTurn } from '../types/domain'

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

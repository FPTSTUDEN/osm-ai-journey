import type { PersonaSpriteId } from '../types/domain'
import { parsePersonaSpriteFilename } from './personaSprites'

export type BundledPersonaSprite = NonNullable<ReturnType<typeof parsePersonaSpriteFilename>> & { src: string }

const spriteAssets = import.meta.glob<string>('../assets/sprites/*-sprite-*.*', { eager: true, query: '?url', import: 'default' })

export const PERSONA_SPRITES = Object.fromEntries(Object.entries(spriteAssets).flatMap(([path, src]) => {
  const metadata = parsePersonaSpriteFilename(path)
  return metadata ? [[metadata.id as PersonaSpriteId, { ...metadata, src }]] : []
})) as Record<PersonaSpriteId, BundledPersonaSprite>

import { useCallback, useEffect, useMemo, useState } from 'react'
import { PERSONA_SPRITES } from '../providers/bundledPersonaSprites'
import type { ChatEntry, PersonaProfile } from '../types/domain'

export type EntrySpeaker = { id: string; name: string; imageUrl: string | null }
export type SpeakerResolver = (entry: ChatEntry | undefined) => EntrySpeaker

type Options = {
  entries: ChatEntry[]
  activePersona: PersonaProfile
  /** The active persona's portrait: uploaded art, else its sprite. */
  activeImageUrl: string | null
  personaProfiles: PersonaProfile[]
}

/**
 * Resolves who wrote each assistant entry. Entries carry the persona that was active when they were written,
 * so after a switch older replies keep their own name and portrait.
 * - A persona that still exists shows its current name (renames apply) and portrait.
 * - A deleted persona shows the name and sprite stored on the entry.
 * - Entries saved before persona attribution existed fall back to the active persona.
 */
export function useEntrySpeakers({ entries, activePersona, activeImageUrl, personaProfiles }: Options): SpeakerResolver {
  const otherIds = useMemo(() => [...new Set(entries.flatMap((entry) => entry.persona && entry.persona.id !== activePersona.id ? [entry.persona.id] : []))].sort(), [activePersona.id, entries])
  const otherIdsKey = otherIds.join('\n')
  const [uploadedArt, setUploadedArt] = useState<Record<string, string>>({})

  // Uploaded portraits of other personas live in IndexedDB; only load the ones this conversation shows.
  useEffect(() => {
    if (!otherIdsKey) {
      setUploadedArt({})
      return
    }
    let active = true
    const urls: string[] = []
    void import('../storage/companionArt').then(({ loadCompanionArt }) => Promise.all(otherIdsKey.split('\n').map(async (id) => {
      const image = await loadCompanionArt(id).catch(() => null)
      return image ? [id, image] as const : null
    }))).then((results) => {
      const next: Record<string, string> = {}
      for (const result of results) {
        if (!result) continue
        const url = URL.createObjectURL(result[1])
        urls.push(url)
        next[result[0]] = url
      }
      if (active) setUploadedArt(next)
      else urls.forEach((url) => URL.revokeObjectURL(url))
    })
    return () => {
      active = false
      urls.forEach((url) => URL.revokeObjectURL(url))
    }
  }, [otherIdsKey])

  return useCallback((entry: ChatEntry | undefined): EntrySpeaker => {
    const stored = entry?.role === 'assistant' ? entry.persona : undefined
    if (!stored || stored.id === activePersona.id) return { id: activePersona.id, name: activePersona.name, imageUrl: activeImageUrl }
    const profile = personaProfiles.find((item) => item.id === stored.id)
    const spriteId = profile?.spriteId ?? stored.spriteId
    return {
      id: stored.id,
      name: profile?.name ?? stored.name,
      imageUrl: uploadedArt[stored.id] ?? (spriteId ? PERSONA_SPRITES[spriteId]?.src ?? null : null),
    }
  }, [activeImageUrl, activePersona.id, activePersona.name, personaProfiles, uploadedArt])
}

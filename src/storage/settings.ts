import { DEFAULT_PERSONA, DEFAULT_PERSONA_ID, DEFAULT_SETTINGS, PERSONA_SPRITES } from '../providers/config'
import type { PersonaProfile, UserSettings } from '../types/domain'

const SETTINGS_KEY = 'osm-ai-journey.settings.v1'

export function normalizeStoryPresentationMode(value: unknown): NonNullable<UserSettings['storyPresentationMode']> {
  return value === 'visual-novel' || value === 'chat' ? value : 'novel'
}

export function normalizePersonaProfiles(value: unknown, legacy?: Partial<Pick<UserSettings, 'personaName' | 'personaInstructions'>>): PersonaProfile[] {
  if (!Array.isArray(value)) {
    if (legacy?.personaName || legacy?.personaInstructions) return [{
      ...DEFAULT_PERSONA,
      name: legacy.personaName || DEFAULT_PERSONA.name,
      instructions: legacy.personaInstructions || DEFAULT_PERSONA.instructions,
    }]
    return [DEFAULT_PERSONA]
  }
  const profiles = value.flatMap((item): PersonaProfile[] => {
    if (!item || typeof item !== 'object') return []
    const profile = item as Partial<PersonaProfile>
    if (typeof profile.id !== 'string' || !profile.id || typeof profile.name !== 'string' || typeof profile.instructions !== 'string') return []
    const spriteId = typeof profile.spriteId === 'string' && profile.spriteId in PERSONA_SPRITES ? profile.spriteId as PersonaProfile['spriteId'] : DEFAULT_PERSONA.spriteId
    return [{ id: profile.id, name: profile.name, instructions: profile.instructions, spriteId }]
  })
  if (!profiles.length) return [DEFAULT_PERSONA]
  return profiles.some((profile) => profile.id === DEFAULT_PERSONA_ID) ? profiles : [DEFAULT_PERSONA, ...profiles]
}

export function loadSettings(): UserSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (!raw) return DEFAULT_SETTINGS
    const saved = JSON.parse(raw) as Partial<UserSettings>
    return {
      ...DEFAULT_SETTINGS,
      ...saved,
      storyPresentationMode: normalizeStoryPresentationMode(saved.storyPresentationMode),
      personaProfiles: normalizePersonaProfiles(saved.personaProfiles, saved),
    }
  } catch {
    return DEFAULT_SETTINGS
  }
}

export function saveSettings(settings: UserSettings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
}

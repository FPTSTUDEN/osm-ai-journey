import { DEFAULT_SETTINGS } from '../providers/config'
import type { UserSettings } from '../types/domain'

const SETTINGS_KEY = 'osm-ai-journey.settings.v1'

export function normalizeStoryPresentationMode(value: unknown): NonNullable<UserSettings['storyPresentationMode']> {
  return value === 'visual-novel' || value === 'chat' ? value : 'novel'
}

export function loadSettings(): UserSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (!raw) return DEFAULT_SETTINGS
    const saved = JSON.parse(raw) as Partial<UserSettings>
    return { ...DEFAULT_SETTINGS, ...saved, storyPresentationMode: normalizeStoryPresentationMode(saved.storyPresentationMode) }
  } catch {
    return DEFAULT_SETTINGS
  }
}

export function saveSettings(settings: UserSettings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
}

import { useEffect, useState, type RefObject } from 'react'
import { LLM_PROVIDER_PRESETS } from '../providers/config'
import { clearOfflineCache, getOfflineCacheStatus, type OfflineCacheStatus } from '../storage/offlineCache'
import { deleteCompanionArt, loadCompanionArt, saveCompanionArt } from '../storage/companionArt'
import { loadSettings, saveSettings } from '../storage/settings'
import type { UserSettings } from '../types/domain'

export function useAppSettings(settingsOpen: boolean, companionArtInputRef: RefObject<HTMLInputElement | null>, activePersonaId: string) {
  const [settings, setSettings] = useState<UserSettings>(loadSettings)
  const [connectionState, setConnectionState] = useState<'idle' | 'testing' | 'ready' | 'error'>('idle')
  const [connectionMessage, setConnectionMessage] = useState('')
  const [offlineStatus, setOfflineStatus] = useState<OfflineCacheStatus | null>(null)
  const [offlineError, setOfflineError] = useState('')
  const [settingsError, setSettingsError] = useState('')
  const [companionImageUrl, setCompanionImageUrl] = useState<string | null>(null)
  const [companionArtError, setCompanionArtError] = useState('')

  useEffect(() => {
    try {
      saveSettings(settings)
      setSettingsError('')
    } catch (error) {
      setSettingsError(error instanceof Error ? error.message : 'Unable to save settings in this browser')
    }
  }, [settings])

  useEffect(() => {
    let active = true
    setCompanionImageUrl(null)
    void loadCompanionArt(activePersonaId).then((image) => {
      if (!active || !image) return
      setCompanionImageUrl(URL.createObjectURL(image))
      setCompanionArtError('')
    }).catch((error) => {
      if (active) setCompanionArtError(error instanceof Error ? error.message : 'Unable to load persona illustration')
    })
    return () => { active = false }
  }, [activePersonaId])

  useEffect(() => {
    if (!companionImageUrl) return
    return () => URL.revokeObjectURL(companionImageUrl)
  }, [companionImageUrl])

  async function refreshOfflineStatus() {
    setOfflineError('')
    try {
      setOfflineStatus(await getOfflineCacheStatus())
    } catch (error) {
      setOfflineError(error instanceof Error ? error.message : 'Unable to read the offline cache')
    }
  }

  useEffect(() => {
    if (settingsOpen) void refreshOfflineStatus()
  }, [settingsOpen])

  async function clearOfflineData() {
    setOfflineError('')
    try {
      await clearOfflineCache()
      await refreshOfflineStatus()
    } catch (error) {
      setOfflineError(error instanceof Error ? error.message : 'Unable to clear the offline cache')
    }
  }

  async function checkLlmConnection() {
    setConnectionState('testing')
    setConnectionMessage('')
    try {
      const { testLlmConnection } = await import('../providers/llm')
      await testLlmConnection({ baseUrl: settings.llmBaseUrl, model: settings.llmModel, apiKey: settings.llmApiKey })
      setConnectionState('ready')
      setConnectionMessage('Connection ready')
    } catch (error) {
      setConnectionState('error')
      setConnectionMessage(error instanceof Error ? error.message : 'Connection failed')
    }
  }

  function changeProvider(provider: UserSettings['llmProvider']) {
    if (provider === 'custom') {
      setSettings((current) => ({ ...current, llmProvider: provider }))
      return
    }
    const preset = LLM_PROVIDER_PRESETS[provider]
    setSettings((current) => ({ ...current, llmProvider: provider, llmBaseUrl: preset.baseUrl, llmModel: preset.model }))
  }

  async function uploadCompanionArt(file: File | undefined, personaId = activePersonaId) {
    if (!file) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setCompanionArtError('Choose a JPEG, PNG, or WebP image.')
      return
    }
    try {
      await saveCompanionArt(file, personaId)
      if (personaId === activePersonaId) setCompanionImageUrl(URL.createObjectURL(file))
      setSettings((current) => ({ ...current, companionImage: true }))
      setCompanionArtError('')
    } catch (error) {
      setCompanionArtError(error instanceof Error ? error.message : 'Unable to save companion illustration')
    } finally {
      if (companionArtInputRef.current) companionArtInputRef.current.value = ''
    }
  }

  async function removeCompanionArt(personaId = activePersonaId) {
    try {
      await deleteCompanionArt(personaId)
      if (personaId === activePersonaId) setCompanionImageUrl(null)
      setSettings((current) => ({ ...current, companionImage: false }))
      setCompanionArtError('')
    } catch (error) {
      setCompanionArtError(error instanceof Error ? error.message : 'Unable to remove companion illustration')
    }
  }

  return {
    settings,
    setSettings,
    settingsError,
    connectionState,
    connectionMessage,
    offlineStatus,
    offlineError,
    refreshOfflineStatus,
    clearOfflineData,
    checkLlmConnection,
    changeProvider,
    companionImageUrl,
    companionArtError,
    uploadCompanionArt,
    removeCompanionArt,
  }
}

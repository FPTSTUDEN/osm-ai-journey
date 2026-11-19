import { useEffect, useState, type RefObject } from 'react'
import { LLM_PROVIDER_PRESETS } from '../providers/config'
import { PERSONA_SPRITES } from '../providers/bundledPersonaSprites'
import { clearOfflineCache, clearOfflineMapCache } from '../storage/offlineCache'
import { deleteOfflineZone } from '../storage/offlineZones'
import { clearGeocoderResults, clearLiveData, clearPersonaArt, getStorageOverview, type StorageOverview } from '../storage/storageOverview'
import { deleteCompanionArt, loadCompanionArt, saveCompanionArt } from '../storage/companionArt'
import { loadSettings, saveSettings } from '../storage/settings'
import type { UserSettings } from '../types/domain'

export function useAppSettings(settingsOpen: boolean, companionArtInputRef: RefObject<HTMLInputElement | null>, activePersonaId: string) {
  const [settings, setSettings] = useState<UserSettings>(() => loadSettings(Object.keys(PERSONA_SPRITES)))
  const [connectionState, setConnectionState] = useState<'idle' | 'testing' | 'ready' | 'error'>('idle')
  const [connectionMessage, setConnectionMessage] = useState('')
  const [storageOverview, setStorageOverview] = useState<StorageOverview | null>(null)
  const [storageError, setStorageError] = useState('')
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

  async function refreshStorageOverview() {
    setStorageError('')
    try {
      setStorageOverview(await getStorageOverview())
    } catch (error) {
      setStorageError(error instanceof Error ? error.message : 'Unable to read browser storage')
    }
  }

  useEffect(() => {
    if (settingsOpen) void refreshStorageOverview()
  }, [settingsOpen])

  async function clearOfflineData() {
    setStorageError('')
    try {
      await clearOfflineCache()
      await refreshStorageOverview()
    } catch (error) {
      setStorageError(error instanceof Error ? error.message : 'Unable to clear app cache data')
    }
  }

  async function clearOfflineMapData() {
    setStorageError('')
    try {
      await clearOfflineMapCache()
      await refreshStorageOverview()
    } catch (error) {
      setStorageError(error instanceof Error ? error.message : 'Unable to clear offline map data')
    }
  }

  async function clearZoneData(zoneId: string) {
    setStorageError('')
    try {
      await deleteOfflineZone(zoneId)
      await refreshStorageOverview()
    } catch (error) {
      setStorageError(error instanceof Error ? error.message : 'Unable to remove the offline zone')
    }
  }

  async function clearOtherData(clear: () => Promise<void>, fallback: string) {
    setStorageError('')
    try {
      await clear()
      await refreshStorageOverview()
    } catch (error) {
      setStorageError(error instanceof Error ? error.message : fallback)
    }
  }

  async function clearSavedPersonaArt() {
    setStorageError('')
    try {
      await clearPersonaArt()
      setCompanionImageUrl(null)
      setSettings((current) => ({ ...current, companionImage: false }))
      await refreshStorageOverview()
    } catch (error) {
      setStorageError(error instanceof Error ? error.message : 'Unable to clear saved persona art')
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
    storageOverview,
    storageError,
    refreshStorageOverview,
    clearOfflineData,
    clearOfflineMapData,
    clearZoneData,
    clearGeocoderResults: () => clearOtherData(clearGeocoderResults, 'Unable to clear geocoder cache'),
    clearLiveData: () => clearOtherData(clearLiveData, 'Unable to clear live-data cache'),
    clearPersonaArt: clearSavedPersonaArt,
    checkLlmConnection,
    changeProvider,
    companionImageUrl,
    companionArtError,
    uploadCompanionArt,
    removeCompanionArt,
  }
}

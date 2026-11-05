import { useState, type Dispatch, type RefObject, type SetStateAction } from 'react'
import type { JourneyState, MapViewport, Place, PlacePhoto, WalkingRoute } from '../types/domain'
import { journeyJson, parseJourneyJson } from '../storage/journeyTransfer'

export type MemoryKind = 'people' | 'entities' | 'facts'
export type JourneyItem = Record<MemoryKind, string>
type RouteState = 'idle' | 'loading' | 'ready' | 'error'

type Options = {
  resetChat: () => void
  resetJourneyState: () => void
  applyJourneyState: (journey: JourneyState) => void
  snapshot: () => JourneyState
  deleteSavedJourney: () => Promise<void>
  clearMapSearch: () => void
  closeAllPanels: () => void
  setMapViewport: (viewport: MapViewport | null) => void
  setSelectedPhoto: (photo: PlacePhoto | null) => void
  setRoute: (route: WalkingRoute | null) => void
  setPendingDestination: (place: Place | null) => void
  setRouteState: (state: RouteState) => void
  setRouteMessage: (message: string) => void
  memory: Record<MemoryKind, string[]>
  setMemory: Record<MemoryKind, Dispatch<SetStateAction<string[]>>>
  importInputRef: RefObject<HTMLInputElement | null>
}

export function useJourneyManagement(options: Options) {
  const [journeyItem, setJourneyItem] = useState<JourneyItem>({ people: '', entities: '', facts: '' })
  const [journeyTransferMessage, setJourneyTransferMessage] = useState('')
  const [journeyTransferError, setJourneyTransferError] = useState('')

  function clearJourneyUi() {
    setJourneyItem({ people: '', entities: '', facts: '' })
    options.clearMapSearch()
    options.setRoute(null)
    options.setPendingDestination(null)
    options.setRouteState('idle')
    options.setRouteMessage('')
    options.setMapViewport(null)
    options.setSelectedPhoto(null)
    options.closeAllPanels()
    setJourneyTransferMessage('')
    setJourneyTransferError('')
  }

  function resetJourney() {
    options.resetChat()
    options.resetJourneyState()
    clearJourneyUi()
  }

  function applyJourney(journey: JourneyState) {
    options.resetChat()
    options.applyJourneyState(journey)
    setJourneyItem({ people: '', entities: '', facts: '' })
    options.setRoute(null)
    options.setPendingDestination(null)
    options.setRouteState('idle')
    options.setRouteMessage('')
  }

  function exportJourney() {
    const blob = new Blob([journeyJson(options.snapshot())], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'osm-ai-journey.json'
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 0)
    setJourneyTransferError('')
    setJourneyTransferMessage('Journey exported')
  }

  async function importJourney(file: File) {
    try {
      const imported = parseJourneyJson(JSON.parse(await file.text()))
      if (!window.confirm('Replace the current journey with this imported journey?')) return
      applyJourney(imported)
      setJourneyTransferError('')
      setJourneyTransferMessage('Journey imported')
    } catch (error) {
      setJourneyTransferMessage('')
      setJourneyTransferError(error instanceof Error ? error.message : 'Journey import failed')
    } finally {
      if (options.importInputRef.current) options.importInputRef.current.value = ''
    }
  }

  async function deleteJourney() {
    options.resetChat()
    try {
      await options.deleteSavedJourney()
      clearJourneyUi()
    } catch (error) {
      setJourneyTransferMessage('')
      setJourneyTransferError(error instanceof Error ? error.message : 'Unable to delete the saved journey')
    }
  }

  function onJourneyItemChange(kind: MemoryKind, value: string) {
    setJourneyItem((current) => ({ ...current, [kind]: value }))
  }

  function addJourneyItem(kind: MemoryKind) {
    const value = journeyItem[kind].trim()
    if (!value) return
    const add = options.setMemory[kind]
    add((current) => current.includes(value) ? current : [...current, value])
    setJourneyItem((current) => ({ ...current, [kind]: '' }))
  }

  function removeJourneyItem(kind: MemoryKind, value: string) {
    options.setMemory[kind]((current) => current.filter((item) => item !== value))
  }

  return {
    journeyItem,
    journeyTransferMessage,
    journeyTransferError,
    onJourneyItemChange,
    addJourneyItem,
    removeJourneyItem,
    resetJourney,
    applyJourney,
    exportJourney,
    importJourney,
    deleteJourney,
  }
}

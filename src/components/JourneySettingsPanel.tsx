import type { RefObject } from 'react'
import { SettingsDrawer } from './SettingsDrawer'
import type { useAppSettings } from '../hooks/useAppSettings'
import type { useLocalPmtiles } from '../hooks/useLocalPmtiles'
import type { useJourneyManagement } from '../hooks/useJourneyManagement'
import type { PersonaProfile } from '../types/domain'

type Props = {
  open: boolean
  onClose: () => void
  appSettings: ReturnType<typeof useAppSettings>
  journeyActions: ReturnType<typeof useJourneyManagement>
  importInputRef: RefObject<HTMLInputElement | null>
  companionArtInputRef: RefObject<HTMLInputElement | null>
  personaProfiles: PersonaProfile[]
  activePersona: PersonaProfile
  activePersonaId: string
  hasCustomPersonaArt: boolean
  personaArtUrl: string
  onPersonaSelect: (personaId: string) => void
  onPersonaUpdate: (updates: Partial<PersonaProfile>) => void
  onPersonaCreate: () => void
  onPersonaDelete: () => void
  localPmtiles: ReturnType<typeof useLocalPmtiles>
  conversationSummary: string
  summaryState: 'idle' | 'loading'
  destinationCount: number
  eventCount: number
  memory: { people: string[]; entities: string[]; facts: string[] }
}

export function JourneySettingsPanel({ open, onClose, appSettings, journeyActions, importInputRef, companionArtInputRef, personaProfiles, activePersona, activePersonaId, hasCustomPersonaArt, personaArtUrl, onPersonaSelect, onPersonaUpdate, onPersonaCreate, onPersonaDelete, localPmtiles, conversationSummary, summaryState, destinationCount, eventCount, memory }: Props) {
  if (!open) return null
  return <SettingsDrawer
    settings={appSettings.settings}
    onSettingsChange={(updates) => appSettings.setSettings((current) => ({ ...current, ...updates }))}
    onProviderChange={appSettings.changeProvider}
    onClose={onClose}
    companionArtInputRef={companionArtInputRef}
    personaProfiles={personaProfiles}
    activePersona={activePersona}
    activePersonaId={activePersonaId}
    hasCustomPersonaArt={hasCustomPersonaArt}
    personaArtUrl={personaArtUrl}
    onPersonaSelect={onPersonaSelect}
    onPersonaUpdate={onPersonaUpdate}
    onPersonaCreate={onPersonaCreate}
    onPersonaDelete={onPersonaDelete}
    onUploadCompanionArt={(file) => void appSettings.uploadCompanionArt(file, activePersona.id)}
    onRemoveCompanionArt={() => void appSettings.removeCompanionArt(activePersona.id)}
    companionArtError={appSettings.companionArtError}
    connectionState={appSettings.connectionState}
    connectionMessage={appSettings.connectionMessage}
    onTestConnection={() => void appSettings.checkLlmConnection()}
    offlineStatus={appSettings.offlineStatus}
    onRefreshOfflineStatus={() => void appSettings.refreshOfflineStatus()}
    onClearOfflineData={() => void appSettings.clearOfflineData()}
    summaryState={summaryState}
    conversationSummary={conversationSummary}
    destinationCount={destinationCount}
    eventCount={eventCount}
    journeyItem={journeyActions.journeyItem}
    onJourneyItemChange={journeyActions.onJourneyItemChange}
    onAddJourneyItem={journeyActions.addJourneyItem}
    memory={memory}
    onRemoveJourneyItem={journeyActions.removeJourneyItem}
    importInputRef={importInputRef}
    onImportJourney={(file) => void journeyActions.importJourney(file)}
    journeyTransferMessage={journeyActions.journeyTransferMessage}
    journeyTransferError={journeyActions.journeyTransferError}
    onExportJourney={journeyActions.exportJourney}
    onResetJourney={journeyActions.resetJourney}
    onDeleteJourney={() => void journeyActions.deleteJourney()}
    settingsError={appSettings.settingsError}
    offlineError={appSettings.offlineError}
    localPmtilesFileName={localPmtiles.archive?.fileName ?? null}
    localPmtilesError={localPmtiles.error}
    localPmtilesLoading={localPmtiles.loading}
    onSelectLocalPmtiles={(file) => void localPmtiles.selectFile(file)}
    onClearLocalPmtiles={localPmtiles.clear}
  />
}

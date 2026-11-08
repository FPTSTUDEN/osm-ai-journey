import type { RefObject } from 'react'
import type { OfflineCacheStatus } from '../storage/offlineCache'
import type { PersonaProfile, UserSettings } from '../types/domain'
import { DEFAULT_PERSONA_ID, PERSONA_SPRITES } from '../providers/config'

type MemoryKind = 'people' | 'entities' | 'facts'
type JourneyItem = Record<MemoryKind, string>

type SettingsDrawerProps = {
  settings: UserSettings
  onSettingsChange: (updates: Partial<UserSettings>) => void
  onProviderChange: (provider: UserSettings['llmProvider']) => void
  onClose: () => void
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
  onUploadCompanionArt: (file: File | undefined) => void
  onRemoveCompanionArt: () => void
  companionArtError: string
  connectionState: 'idle' | 'testing' | 'ready' | 'error'
  connectionMessage: string
  onTestConnection: () => void
  offlineStatus: OfflineCacheStatus | null
  onRefreshOfflineStatus: () => void
  onClearOfflineData: () => void
  summaryState: 'idle' | 'loading'
  conversationSummary: string
  destinationCount: number
  eventCount: number
  journeyItem: JourneyItem
  onJourneyItemChange: (kind: MemoryKind, value: string) => void
  onAddJourneyItem: (kind: MemoryKind) => void
  memory: Record<MemoryKind, string[]>
  onRemoveJourneyItem: (kind: MemoryKind, value: string) => void
  importInputRef: RefObject<HTMLInputElement | null>
  onImportJourney: (file: File) => void
  journeyTransferMessage: string
  journeyTransferError: string
  onExportJourney: () => void
  onResetJourney: () => void
  onDeleteJourney: () => void
  settingsError: string
  offlineError: string
  localPmtilesFileName: string | null
  localPmtilesError: string
  localPmtilesLoading: boolean
  onSelectLocalPmtiles: (file: File | undefined) => void
  onClearLocalPmtiles: () => void
}

const MEMORY_LABELS: Record<MemoryKind, string> = {
  people: 'User-created people',
  entities: 'User-created entities',
  facts: 'User-created facts',
}

export function SettingsDrawer({
  settings,
  onSettingsChange,
  onProviderChange,
  onClose,
  companionArtInputRef,
  personaProfiles,
  activePersona,
  activePersonaId,
  hasCustomPersonaArt,
  personaArtUrl,
  onPersonaSelect,
  onPersonaUpdate,
  onPersonaCreate,
  onPersonaDelete,
  onUploadCompanionArt,
  onRemoveCompanionArt,
  companionArtError,
  connectionState,
  connectionMessage,
  onTestConnection,
  offlineStatus,
  onRefreshOfflineStatus,
  onClearOfflineData,
  summaryState,
  conversationSummary,
  destinationCount,
  eventCount,
  journeyItem,
  onJourneyItemChange,
  onAddJourneyItem,
  memory,
  onRemoveJourneyItem,
  importInputRef,
  onImportJourney,
  journeyTransferMessage,
  journeyTransferError,
  onExportJourney,
  onResetJourney,
  onDeleteJourney,
  settingsError,
  offlineError,
  localPmtilesFileName,
  localPmtilesError,
  localPmtilesLoading,
  onSelectLocalPmtiles,
  onClearLocalPmtiles,
}: SettingsDrawerProps) {
  return (
    <aside className="settings panel" role="dialog" aria-modal="false" aria-labelledby="settings-title">
      <div className="settings-header"><div><p className="eyebrow">Local configuration</p><h2 id="settings-title">Journey settings</h2></div><button className="close-button" type="button" onClick={onClose} aria-label="Close settings">×</button></div>
      <label>LLM provider<select value={settings.llmProvider} onChange={(event) => onProviderChange(event.target.value as UserSettings['llmProvider'])}><option value="ollama">Ollama</option><option value="openai">OpenAI</option><option value="lmstudio">LM Studio</option><option value="vllm">vLLM</option><option value="custom">Custom compatible server</option></select></label>
      <label>LLM base URL<input value={settings.llmBaseUrl} onChange={(event) => onSettingsChange({ llmProvider: 'custom', llmBaseUrl: event.target.value })} /></label>
      <label>Model<input value={settings.llmModel} onChange={(event) => onSettingsChange({ llmModel: event.target.value })} /></label>
      <label>API key<input type="password" value={settings.llmApiKey} onChange={(event) => onSettingsChange({ llmApiKey: event.target.value })} placeholder="Optional for local models" /></label>
      {settingsError && <p className="connection-error" role="alert">Settings may not persist: {settingsError}</p>}
      <section className="persona-profile-settings" aria-labelledby="persona-profiles-title">
        <div className="persona-profile-heading"><div><p className="memory-label">Story character</p><h3 id="persona-profiles-title">Personas</h3></div><button type="button" onClick={onPersonaCreate}>New persona</button></div>
        <label>Active for this journey<select aria-label="Active persona" value={activePersonaId} onChange={(event) => onPersonaSelect(event.target.value)}>{personaProfiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name || 'Unnamed persona'}</option>)}</select></label>
        <div className="persona-profile-actions"><span>{activePersona.id === DEFAULT_PERSONA_ID ? 'Default persona' : 'Custom persona'}</span>{activePersona.id !== DEFAULT_PERSONA_ID && <button type="button" onClick={onPersonaDelete}>Delete persona</button>}</div>
        <label>Persona name<input value={activePersona.name} onChange={(event) => onPersonaUpdate({ name: event.target.value })} /></label>
        <label>Persona instructions<textarea className="persona-input" value={activePersona.instructions} onChange={(event) => onPersonaUpdate({ instructions: event.target.value })} rows={3} /></label>
        <label>Built-in sprite<select value={activePersona.spriteId} onChange={(event) => onPersonaUpdate({ spriteId: event.target.value as PersonaProfile['spriteId'] })}>{Object.entries(PERSONA_SPRITES).map(([id, sprite]) => <option key={id} value={id}>{sprite.label}</option>)}</select></label>
        <div className="persona-art-preview"><img src={personaArtUrl} alt={`${activePersona.name || 'Persona'} portrait`} /><p>{hasCustomPersonaArt ? 'Custom portrait' : 'Built-in portrait'} · used in Visual novel and Chat modes</p></div>
        <div className="companion-art-setting"><label>Use a custom portrait<input ref={companionArtInputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { onUploadCompanionArt(event.target.files?.[0]); event.currentTarget.value = '' }} /></label>{hasCustomPersonaArt && <button type="button" onClick={onRemoveCompanionArt}>Restore built-in sprite</button>}{companionArtError && <p className="connection-error" role="alert">{companionArtError}</p>}</div>
        <p className="settings-note">Persona instructions are natural-language roleplay guidance. The selected persona is saved with this journey.</p>
      </section>
      <div className="connection-test"><button type="button" onClick={onTestConnection} disabled={connectionState === 'testing'}>{connectionState === 'testing' ? 'Testing…' : 'Test connection'}</button>{connectionMessage && <span className={connectionState === 'error' ? 'connection-error' : 'connection-ready'}>{connectionMessage}</span>}</div>
      <label>Online geocoder<select value={settings.onlineGeocoder} onChange={(event) => onSettingsChange({ onlineGeocoder: event.target.value as UserSettings['onlineGeocoder'] })}><option value="nominatim">Nominatim</option><option value="photon">Photon</option></select></label>
      <label>Walking route server<input value={settings.routingBaseUrl} onChange={(event) => onSettingsChange({ routingBaseUrl: event.target.value })} /></label>
      <label>Weather provider URL<input value={settings.weatherBaseUrl} onChange={(event) => onSettingsChange({ weatherBaseUrl: event.target.value })} /></label>
      <label>Overpass API URL<input value={settings.overpassApiUrl} onChange={(event) => onSettingsChange({ overpassApiUrl: event.target.value })} /></label>
      <label className="toggle-row"><span>Calculate walking routes by default</span><input type="checkbox" checked={settings.calculateWalkingRoutes} onChange={(event) => onSettingsChange({ calculateWalkingRoutes: event.target.checked })} /></label>
      <label className="toggle-row"><span>Enable optional live data</span><input type="checkbox" checked={settings.liveDataEnabled} onChange={(event) => onSettingsChange({ liveDataEnabled: event.target.checked })} /></label>
      <div className="offline-cache"><p className="memory-label">Offline cache</p><p className="settings-note">{offlineStatus ? `${offlineStatus.entries} cached resources across ${offlineStatus.cacheNames.length} cache${offlineStatus.cacheNames.length === 1 ? '' : 's'}.` : 'Checking cached resources…'}</p>{offlineError && <p className="connection-error" role="alert">{offlineError}</p>}<div className="settings-actions"><button type="button" onClick={onRefreshOfflineStatus}>Refresh status</button><button type="button" onClick={onClearOfflineData}>Clear cache</button></div></div>
      <div className="offline-cache">
        <p className="memory-label">Local PMTiles map</p>
        <label>Choose a .pmtiles archive<input type="file" accept=".pmtiles,application/octet-stream" onChange={(event) => { onSelectLocalPmtiles(event.target.files?.[0]); event.currentTarget.value = '' }} /></label>
        <p className="settings-note">{localPmtilesLoading ? 'Validating archive…' : localPmtilesFileName ? `${localPmtilesFileName} is active for this browser session.` : 'No local archive selected. Your file stays in this browser session and is not uploaded.'}</p>
        {localPmtilesFileName && <button type="button" onClick={onClearLocalPmtiles}>Use online map instead</button>}
        {localPmtilesError && <p className="connection-error" role="alert">{localPmtilesError}</p>}
        <p className="settings-note">Vector archives need metadata and common water, land, building, or road layers; raster archives are also supported. The local style omits labels to avoid online glyph requests.</p>
      </div>
      <p className="settings-note">Saved journey destinations: {destinationCount}. Scene events: {eventCount}. {summaryState === 'loading' ? 'Updating conversation summary…' : conversationSummary ? 'Long-conversation summary available.' : ''}</p>
      <div className="journey-memory">
        <p className="memory-label">Journey memory</p>
        {(Object.keys(MEMORY_LABELS) as MemoryKind[]).map((kind) => <div className="memory-group" key={kind}>
          <label>{MEMORY_LABELS[kind]}<div className="memory-entry">
            <input value={journeyItem[kind]} onChange={(event) => onJourneyItemChange(kind, event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); onAddJourneyItem(kind) } }} placeholder={`Add ${MEMORY_LABELS[kind].toLowerCase()}`} />
            <button type="button" onClick={() => onAddJourneyItem(kind)}>Add</button>
          </div></label>
          {memory[kind].length > 0 && <ul className="memory-values">{memory[kind].map((value) => <li key={value}><span>{value}</span><button type="button" onClick={() => onRemoveJourneyItem(kind, value)} aria-label={`Remove ${value}`}>×</button></li>)}</ul>}
        </div>)}
      </div>
      <div className="journey-transfer">
        <p className="memory-label">Journey file</p>
        <div className="settings-actions"><button type="button" onClick={onExportJourney}>Export JSON</button><button type="button" onClick={() => importInputRef.current?.click()}>Import JSON</button></div>
        <input ref={importInputRef} type="file" accept="application/json,.json" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) onImportJourney(file) }} />
        {journeyTransferMessage && <p className="connection-ready">{journeyTransferMessage}</p>}
        {journeyTransferError && <p className="connection-error">{journeyTransferError}</p>}
      </div>
      <div className="settings-actions"><button type="button" onClick={onResetJourney}>Reset journey</button><button type="button" onClick={onDeleteJourney}>Delete saved journey</button></div>
      <p className="settings-note">Settings stay in this browser. API keys are not safe to share in a public static deployment.</p>
    </aside>
  )
}

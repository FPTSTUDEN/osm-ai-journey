import type { RefObject } from 'react'
import type { OfflineCacheStatus } from '../storage/offlineCache'
import type { UserSettings } from '../types/domain'

type MemoryKind = 'people' | 'entities' | 'facts'
type JourneyItem = Record<MemoryKind, string>

type SettingsDrawerProps = {
  settings: UserSettings
  onSettingsChange: (updates: Partial<UserSettings>) => void
  onProviderChange: (provider: UserSettings['llmProvider']) => void
  onClose: () => void
  companionArtInputRef: RefObject<HTMLInputElement | null>
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
}: SettingsDrawerProps) {
  return (
    <aside className="settings panel">
      <div className="settings-header"><div><p className="eyebrow">Local configuration</p><h2>Journey settings</h2></div><button className="close-button" type="button" onClick={onClose}>×</button></div>
      <label>LLM provider<select value={settings.llmProvider} onChange={(event) => onProviderChange(event.target.value as UserSettings['llmProvider'])}><option value="ollama">Ollama</option><option value="openai">OpenAI</option><option value="lmstudio">LM Studio</option><option value="vllm">vLLM</option><option value="custom">Custom compatible server</option></select></label>
      <label>LLM base URL<input value={settings.llmBaseUrl} onChange={(event) => onSettingsChange({ llmProvider: 'custom', llmBaseUrl: event.target.value })} /></label>
      <label>Model<input value={settings.llmModel} onChange={(event) => onSettingsChange({ llmModel: event.target.value })} /></label>
      <label>API key<input type="password" value={settings.llmApiKey} onChange={(event) => onSettingsChange({ llmApiKey: event.target.value })} placeholder="Optional for local models" /></label>
      <label>Companion name<input value={settings.personaName} onChange={(event) => onSettingsChange({ personaName: event.target.value })} /></label>
      <label>Companion instructions<textarea className="persona-input" value={settings.personaInstructions} onChange={(event) => onSettingsChange({ personaInstructions: event.target.value })} rows={3} /></label>
      <div className="companion-art-setting"><label>Companion illustration<input ref={companionArtInputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => onUploadCompanionArt(event.target.files?.[0])} /></label>{settings.companionImage && <button type="button" onClick={onRemoveCompanionArt}>Remove illustration</button>}{companionArtError && <p className="connection-error" role="alert">{companionArtError}</p>}</div>
      <div className="connection-test"><button type="button" onClick={onTestConnection} disabled={connectionState === 'testing'}>{connectionState === 'testing' ? 'Testing…' : 'Test connection'}</button>{connectionMessage && <span className={connectionState === 'error' ? 'connection-error' : 'connection-ready'}>{connectionMessage}</span>}</div>
      <label>Online geocoder<select value={settings.onlineGeocoder} onChange={(event) => onSettingsChange({ onlineGeocoder: event.target.value as UserSettings['onlineGeocoder'] })}><option value="nominatim">Nominatim</option><option value="photon">Photon</option></select></label>
      <label>Walking route server<input value={settings.routingBaseUrl} onChange={(event) => onSettingsChange({ routingBaseUrl: event.target.value })} /></label>
      <label>Weather provider URL<input value={settings.weatherBaseUrl} onChange={(event) => onSettingsChange({ weatherBaseUrl: event.target.value })} /></label>
      <label className="toggle-row"><span>Calculate walking routes by default</span><input type="checkbox" checked={settings.calculateWalkingRoutes} onChange={(event) => onSettingsChange({ calculateWalkingRoutes: event.target.checked })} /></label>
      <label className="toggle-row"><span>Enable optional live data</span><input type="checkbox" checked={settings.liveDataEnabled} onChange={(event) => onSettingsChange({ liveDataEnabled: event.target.checked })} /></label>
      <div className="offline-cache"><p className="memory-label">Offline cache</p><p className="settings-note">{offlineStatus ? `${offlineStatus.entries} cached resources across ${offlineStatus.cacheNames.length} cache${offlineStatus.cacheNames.length === 1 ? '' : 's'}.` : 'Checking cached resources…'}</p><div className="settings-actions"><button type="button" onClick={onRefreshOfflineStatus}>Refresh status</button><button type="button" onClick={onClearOfflineData}>Clear cache</button></div></div>
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

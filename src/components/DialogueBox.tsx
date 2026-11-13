import { useEffect, useRef, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import type { ChatEntry, JourneyConversation, StoryBranch, StoryPresentationMode, StoryProgress } from '../types/domain'
import { latestStoryStop, storyStopIndex, storyStops } from '../providers/storyFormat'
import { revealedTextLength } from './typewriter'
import { StoryMessageList } from './StoryMessageList'

type DialogueBoxProps = {
  entries: ChatEntry[]
  personaName: string
  message: string
  onMessageChange: (value: string) => void
  onSubmit: (event: FormEvent<HTMLFormElement>, rewindTo?: StoryProgress | null) => void
  onCancel: () => void
  onRetry: () => void
  llmState: 'idle' | 'loading' | 'error'
  llmError: string
  sceneNumber: number
  destinationName: string | null
  destinationCount: number
  routesEnabled: boolean
  presentationMode: StoryPresentationMode
  storyProgress: StoryProgress | null
  onStoryProgressChange: (progress: StoryProgress | null) => void
  branches: StoryBranch[]
  onSwitchBranch: (branchId: string) => void
  conversations: JourneyConversation[]
  activeConversationId: string
  onCreateConversation: () => void
  onSwitchConversation: (conversationId: string) => void
  onDeleteConversation: (conversationId: string) => void
  animatedEntryId: string | null
  companionImageUrl: string | null
  motionEnabled: boolean
}

const suggestions = ['Look around', 'Ask a local', 'Walk somewhere else']

type SkippedContent = { id: string; label: string; text: string; type: 'dialogue' | 'narration' | 'scene' | 'event' }

function skippedContent(entries: ChatEntry[], progress: StoryProgress | null): SkippedContent[] {
  if (!progress) return []
  const startIndex = entries.findIndex((entry) => entry.id === progress.entryId && entry.role === 'assistant')
  if (startIndex < 0) return []
  const result: SkippedContent[] = []
  entries.slice(startIndex).forEach((entry, relativeIndex) => {
    if (entry.role === 'event') {
      result.push({ id: entry.id, label: 'Journey event', text: entry.text, type: 'event' })
      return
    }
    if (entry.role === 'user') {
      if (relativeIndex > 0) result.push({ id: entry.id, label: 'You', text: entry.text, type: 'dialogue' })
      return
    }
    const blocks = entry.storyTurn?.blocks ?? [{ id: `${entry.id}:1`, type: 'prose' as const, text: entry.text }]
    blocks.slice(relativeIndex === 0 ? progress.blockIndex + 1 : 0).forEach((block) => {
      const label = block.type === 'dialogue' ? block.speaker : block.type === 'scene' ? 'Scene' : block.type === 'narration' ? 'Narration' : 'Story'
      result.push({ id: block.id, label, text: block.text, type: block.type === 'scene' ? 'scene' : block.type === 'dialogue' ? 'dialogue' : 'narration' })
    })
  })
  return result
}

export function DialogueBox({
  entries,
  personaName,
  message,
  onMessageChange,
  onSubmit,
  onCancel,
  onRetry,
  llmState,
  llmError,
  sceneNumber,
  destinationName,
  destinationCount,
  routesEnabled,
  presentationMode,
  storyProgress,
  onStoryProgressChange,
  branches,
  onSwitchBranch,
  conversations,
  activeConversationId,
  onCreateConversation,
  onSwitchConversation,
  onDeleteConversation,
  animatedEntryId,
  companionImageUrl,
  motionEnabled,
}: DialogueBoxProps) {
  const [expanded, setExpanded] = useState(false)
  const [showConversationManager, setShowConversationManager] = useState(false)
  const [skippedSummary, setSkippedSummary] = useState<SkippedContent[] | null>(null)
  const [revealCompleteId, setRevealCompleteId] = useState<string | null>(null)
  const [revealedLength, setRevealedLength] = useState(0)
  const revealStart = useRef<{ id: string; at: number } | null>(null)
  const latestEntry = entries.at(-1)
  const progress = storyProgress ?? latestStoryStop(entries)
  const allStops = storyStops(entries)
  const activeStopIndex = storyStopIndex(entries, progress)
  const activeEntry = progress ? entries.find((entry) => entry.id === progress.entryId) : latestEntry
  const visibleEntries = expanded || presentationMode === 'chat'
    ? entries
    : presentationMode === 'visual-novel' && progress
      ? entries.filter((entry) => entry.id === progress.entryId)
      : entries.slice(-1)
  const canMovePrevious = activeStopIndex > 0
  const canMoveNext = activeStopIndex >= 0 && activeStopIndex < allStops.length - 1
  const skipped = skippedContent(entries, progress)
  const reduceMotion = !motionEnabled
  const isTyping = llmState === 'loading' && !entries.some((entry) => entry.id === animatedEntryId && entry.text)

  useEffect(() => {
    if (!latestEntry || latestEntry.role !== 'assistant' || latestEntry.id !== animatedEntryId || reduceMotion || revealCompleteId === latestEntry.id) {
      setRevealedLength(latestEntry?.text.length ?? 0)
      return
    }

    if (revealStart.current?.id !== latestEntry.id) {
      revealStart.current = { id: latestEntry.id, at: performance.now() }
      setRevealedLength(0)
    }
    const reveal = () => setRevealedLength(revealedTextLength(latestEntry.text, performance.now() - (revealStart.current?.at ?? performance.now())))
    reveal()
    const timer = window.setInterval(reveal, 30)
    return () => window.clearInterval(timer)
  }, [animatedEntryId, latestEntry?.id, latestEntry?.text, reduceMotion, revealCompleteId])

  useEffect(() => {
    if (!latestEntry || latestEntry.role !== 'assistant' || latestEntry.id !== animatedEntryId || revealCompleteId === latestEntry.id || reduceMotion) return
    const complete = () => {
      setRevealCompleteId(latestEntry.id)
      setRevealedLength(latestEntry.text.length)
    }
    window.addEventListener('keydown', complete)
    window.addEventListener('click', complete)
    return () => {
      window.removeEventListener('keydown', complete)
      window.removeEventListener('click', complete)
    }
  }, [animatedEntryId, latestEntry?.id, latestEntry?.text, reduceMotion, revealCompleteId])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && showConversationManager) {
        setShowConversationManager(false)
        return
      }
      if (event.key === 'Escape' && skippedSummary) {
        setSkippedSummary(null)
        return
      }
      if (presentationMode !== 'visual-novel' || event.altKey || event.ctrlKey || event.metaKey) return
      const target = event.target
      if (target instanceof HTMLElement && target.closest('input,textarea,select,button,[contenteditable="true"]')) return
      if (event.key === 'ArrowLeft' && canMovePrevious) {
        event.preventDefault()
        onStoryProgressChange(allStops[activeStopIndex - 1])
      } else if (event.key === 'ArrowRight' && canMoveNext) {
        event.preventDefault()
        onStoryProgressChange(allStops[activeStopIndex + 1])
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [activeStopIndex, allStops, canMoveNext, canMovePrevious, onStoryProgressChange, presentationMode, showConversationManager, skippedSummary])

  function moveProgress(offset: number) {
    const nextIndex = activeStopIndex + offset
    if (nextIndex >= 0 && nextIndex < allStops.length) onStoryProgressChange(allStops[nextIndex])
  }

  function skipToEnd() {
    if (!skipped.length) return
    setSkippedSummary(skipped)
    onStoryProgressChange(latestEntry?.role === 'assistant' ? latestStoryStop(entries) : null)
  }

  return (
    <section className="journey-panel dialogue-panel">
      <header className="dialogue-heading">
        <div className="dialogue-nameplate">
          {activeEntry?.role !== 'event' && <><strong>{activeEntry?.role === 'user' ? 'You' : personaName}</strong><span className={activeEntry?.role === 'user' ? 'listener-tag' : 'companion-tag'}>{activeEntry?.role === 'user' ? 'LISTENER' : 'COMPANION'}</span></>}
        </div>
        <div className="dialogue-heading-actions">
          <span className="scene-tag">Scene {String(sceneNumber).padStart(2, '0')}</span>
          {branches.length > 0 && <select className="branch-select" aria-label="Switch timeline" value="" onChange={(event) => onSwitchBranch(event.target.value)}>
            <option value="">Alternate timelines ({branches.length})</option>
            {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.label}</option>)}
          </select>}
          {presentationMode === 'visual-novel' && <div className="story-progress-controls" aria-label="Story progression">
            <button type="button" onClick={() => moveProgress(-1)} disabled={!progress || !canMovePrevious} aria-label="Previous story block">‹</button>
            <span>{progress ? `${activeStopIndex + 1}/${allStops.length}` : 'Ready'}</span>
            <button type="button" onClick={() => moveProgress(1)} disabled={!progress || !canMoveNext} aria-label="Next story block">›</button>
            {progress
              ? <button type="button" className="skip-story-button" onClick={skipToEnd} disabled={!skipped.length}>Skip</button>
              : <span className="story-progress-hint">Send a message to start</span>}
          </div>}
          <button type="button" className="log-toggle" aria-expanded={showConversationManager} onClick={() => setShowConversationManager(true)}>Conversations · {conversations.length}</button>
          <button type="button" className="log-toggle" aria-expanded={expanded} onClick={() => setExpanded((open) => !open)}>{expanded ? 'Close log' : 'Log'}</button>
        </div>
      </header>
      <StoryMessageList
        entries={visibleEntries}
        mode={presentationMode}
        personaName={personaName}
        companionImageUrl={companionImageUrl}
        animatedEntryId={revealCompleteId === latestEntry?.id ? null : animatedEntryId}
        revealedLength={revealedLength}
        reduceMotion={reduceMotion}
        isTyping={isTyping}
        expanded={expanded}
        storyProgress={progress}
        onAdvance={() => { if (!expanded) moveProgress(1) }}
      />
      {llmState === 'error' && <div className="dialogue-error" role="alert"><p className="provider-error">{llmError}</p><button type="button" onClick={onRetry}>Retry</button></div>}
      <div className="optional-suggestions" aria-label="Suggestions, optional">
        <span>Suggestions · optional</span>
        {suggestions.map((suggestion) => <button key={suggestion} type="button" onClick={() => onMessageChange(suggestion)}>{suggestion}</button>)}
      </div>
      <form className="composer" onSubmit={(event) => onSubmit(event, presentationMode === 'visual-novel' ? progress : null)}>
        <textarea disabled={llmState === 'loading'} value={message} onChange={(event) => onMessageChange(event.target.value)} placeholder={llmState === 'loading' ? 'The companion is thinking…' : 'Speak freely. Ask for a scene, a direction, or a different world.'} rows={2} />
        {llmState === 'loading'
          ? <button className="stop-button" type="button" onClick={onCancel}>Stop</button>
          : <button className="send-button" type="submit" aria-label="Send message">↗</button>}
      </form>
      <div className="journey-footer"><span>{destinationName ? `At ${destinationName}` : 'No destination selected'}</span><span>{destinationCount} destination{destinationCount === 1 ? '' : 's'} · {routesEnabled ? 'Walking routes on' : 'Routes optional'}</span></div>
      {showConversationManager && createPortal(<div className="skip-summary-backdrop conversation-manager-backdrop" onClick={(event) => { if (event.target === event.currentTarget) setShowConversationManager(false) }}>
        <section className="skip-summary-panel conversation-manager-panel" role="dialog" aria-modal="true" aria-labelledby="conversation-manager-title">
          <header><div><p className="eyebrow">Journey conversations</p><h2 id="conversation-manager-title">Manage conversations</h2></div><button type="button" onClick={() => setShowConversationManager(false)} aria-label="Close conversations">×</button></header>
          <div className="conversation-manager-list" role="list" aria-label="Conversations">
            {[...conversations].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((conversation) => <article className={`conversation-manager-item ${conversation.id === activeConversationId ? 'conversation-manager-item-active' : ''}`} role="listitem" key={conversation.id}>
              <button type="button" className="conversation-manager-select" aria-pressed={conversation.id === activeConversationId} disabled={llmState === 'loading'} onClick={() => { onSwitchConversation(conversation.id); setShowConversationManager(false) }}>
                <strong>{conversation.title}</strong><span>{conversation.messages.filter((entry) => entry.role === 'user').length} traveler message{conversation.messages.filter((entry) => entry.role === 'user').length === 1 ? '' : 's'}</span>
              </button>
              <button type="button" className="conversation-manager-delete" aria-label={`Delete ${conversation.title}`} disabled={conversations.length <= 1 || llmState === 'loading'} onClick={() => {
                if (window.confirm(`Delete “${conversation.title}”? This cannot be undone.`)) onDeleteConversation(conversation.id)
              }}>Delete</button>
            </article>)}
          </div>
          <footer><span>{llmState === 'loading' ? 'Stop the current response before switching or creating conversations.' : 'Each conversation keeps its own messages and story branches.'}</span><button type="button" className="conversation-manager-create" disabled={llmState === 'loading'} onClick={() => { onCreateConversation(); setShowConversationManager(false) }}>New conversation</button></footer>
        </section>
      </div>, document.body)}
      {skippedSummary && createPortal(<div className="skip-summary-backdrop">
        <section className="skip-summary-panel" role="dialog" aria-modal="true" aria-labelledby="skip-summary-title">
          <header><div><p className="eyebrow">Skipped story</p><h2 id="skip-summary-title">Review what you skipped</h2></div><button type="button" onClick={() => setSkippedSummary(null)} aria-label="Close skipped story">×</button></header>
          <div className="skip-summary-content">
            {skippedSummary.map((item) => <article className={`skip-summary-item skip-summary-${item.type}`} key={item.id}><span>{item.label}</span><p>{item.text}</p></article>)}
          </div>
          <button type="button" className="skip-summary-return" onClick={() => setSkippedSummary(null)}>Return to current scene</button>
        </section>
      </div>, document.body)}
    </section>
  )
}

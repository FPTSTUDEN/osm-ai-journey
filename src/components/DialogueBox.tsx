import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { ChatEntry, StoryPresentationMode } from '../types/domain'
import { revealedTextLength } from './typewriter'
import { StoryMessageList } from './StoryMessageList'

type DialogueBoxProps = {
  entries: ChatEntry[]
  personaName: string
  message: string
  onMessageChange: (value: string) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  onCancel: () => void
  onRetry: () => void
  llmState: 'idle' | 'loading' | 'error'
  llmError: string
  sceneNumber: number
  destinationName: string | null
  destinationCount: number
  routesEnabled: boolean
  presentationMode: StoryPresentationMode
  animatedEntryId: string | null
  companionImageUrl: string | null
}

const suggestions = ['Look around', 'Ask a local', 'Walk somewhere else']

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
  animatedEntryId,
  companionImageUrl,
}: DialogueBoxProps) {
  const [expanded, setExpanded] = useState(false)
  const [revealCompleteId, setRevealCompleteId] = useState<string | null>(null)
  const [revealedLength, setRevealedLength] = useState(0)
  const revealStart = useRef<{ id: string; at: number } | null>(null)
  const visibleEntries = expanded || presentationMode === 'chat' ? entries : entries.slice(-1)
  const latestEntry = entries.at(-1)
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

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

  return (
    <section className="journey-panel dialogue-panel">
      <header className="dialogue-heading">
        <div className="dialogue-nameplate">
          {latestEntry?.role !== 'event' && <><strong>{latestEntry?.role === 'user' ? 'You' : personaName}</strong><span className={latestEntry?.role === 'user' ? 'listener-tag' : 'companion-tag'}>{latestEntry?.role === 'user' ? 'LISTENER' : 'COMPANION'}</span></>}
        </div>
        <div className="dialogue-heading-actions">
          <span className="scene-tag">Scene {String(sceneNumber).padStart(2, '0')}</span>
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
        expanded={expanded}
      />
      {llmState === 'error' && <div className="dialogue-error" role="alert"><p className="provider-error">{llmError}</p><button type="button" onClick={onRetry}>Retry</button></div>}
      <div className="optional-suggestions" aria-label="Suggestions, optional">
        <span>Suggestions · optional</span>
        {suggestions.map((suggestion) => <button key={suggestion} type="button" onClick={() => onMessageChange(suggestion)}>{suggestion}</button>)}
      </div>
      <form className="composer" onSubmit={onSubmit}>
        <textarea disabled={llmState === 'loading'} value={message} onChange={(event) => onMessageChange(event.target.value)} placeholder={llmState === 'loading' ? 'The companion is thinking…' : 'Speak freely. Ask for a scene, a direction, or a different world.'} rows={2} />
        {llmState === 'loading'
          ? <button className="stop-button" type="button" onClick={onCancel}>Stop</button>
          : <button className="send-button" type="submit" aria-label="Send message">↗</button>}
      </form>
      <div className="journey-footer"><span>{destinationName ? `At ${destinationName}` : 'No destination selected'}</span><span>{destinationCount} destination{destinationCount === 1 ? '' : 's'} · {routesEnabled ? 'Walking routes on' : 'Routes optional'}</span></div>
    </section>
  )
}

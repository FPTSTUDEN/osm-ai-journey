interface StartupScreenProps {
  state: 'loading' | 'ready' | 'error'
  stage: 'storage' | 'restore'
  error: Error | null
  onRetry: () => void
  onContinue: () => void
}

function diagnosticSummary(error: Error | null): string {
  if (!error) return 'No additional details are available.'
  const name = error.name.replace(/[^\w -]/g, '').slice(0, 50) || 'Error'
  const message = error.message
    .replace(/https?:\/\/[^\s"'<>]+/gi, '[URL redacted]')
    .replace(/\bBearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(/\b(api[_-]?key|token|authorization)\s*[:=]\s*\S+/gi, '$1=[redacted]')
    .slice(0, 240)
  return `${name}: ${message || 'No additional message provided.'}`
}

export function StartupScreen({ state, stage, error, onRetry, onContinue }: StartupScreenProps) {
  if (state === 'ready') return null

  const failed = state === 'error'
  return (
    <div className="startup-overlay">
      <section className="startup-card" role="dialog" aria-modal="true" aria-labelledby="startup-title">
        <span className="startup-mark" aria-hidden="true">✦</span>
        <h2 id="startup-title">Osm AI Journey</h2>
        {failed ? (
          <div className="startup-failure" role="alert">
            <strong>Your saved journey could not be loaded.</strong>
            <p>Check browser storage access, then retry. You can also start a new journey.</p>
            <div className="startup-actions">
              <button type="button" autoFocus className="startup-primary" onClick={onRetry}>Retry</button>
              <button type="button" onClick={onContinue}>Continue with a new journey</button>
            </div>
            <p className="startup-warning">Starting fresh may replace the saved journey when this session autosaves.</p>
            <details>
              <summary>Technical details</summary>
              <code>{diagnosticSummary(error)}</code>
            </details>
          </div>
        ) : (
          <div className="startup-loading" role="status" aria-live="polite">
            <p>{stage === 'storage' ? 'Opening local journey storage…' : 'Restoring conversations and scene…'}</p>
            <ol>
              <li className="complete">Application modules loaded</li>
              <li className={stage === 'storage' ? 'current' : 'complete'}>Open local journey storage</li>
              <li className={stage === 'restore' ? 'current' : ''}>Restore saved conversations and scene</li>
            </ol>
            <span className="startup-progress" aria-hidden="true"><i /></span>
          </div>
        )}
      </section>
    </div>
  )
}

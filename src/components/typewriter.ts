export function revealedTextLength(text: string, elapsedMs: number, charactersPerSecond = 36) {
  return Math.min(text.length, Math.max(0, Math.floor(elapsedMs * charactersPerSecond / 1000)))
}

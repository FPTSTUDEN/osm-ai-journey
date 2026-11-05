export function shouldSummarize(messageCount: number, summarizedMessageCount: number) {
  return messageCount >= 12 && messageCount - summarizedMessageCount >= 8
}

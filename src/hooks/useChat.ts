import { useEffect, useRef, useState } from 'react'
import { shouldSummarize } from './chat'
import { newEntry } from '../storage/messages'
import { parseStoryResponse, storyStopIndex, storyStops, storyTurnToText, trimHistoryAtStoryStop } from '../providers/storyFormat'
import type { PlaceContext } from '../providers/enrichment'
import type { WeatherResult } from '../providers/weather'
import type { ChatEntry, JourneyState, Place, PlacePhoto, StoryCheckpoint, StoryProgress, UserSettings } from '../types/domain'

type PlaceData = {
  context: PlaceContext | null
  contextState: 'idle' | 'loading' | 'ready' | 'error'
  contextCached: boolean
  weather: WeatherResult | null
}

type UseChatOptions = {
  entries: ChatEntry[]
  setEntries: React.Dispatch<React.SetStateAction<ChatEntry[]>>
  journey: Omit<JourneyState, 'id' | 'currentDestination' | 'mapViewport' | 'messages' | 'narrativeEvents'>
  place: Place | null
  placeData: PlaceData
  selectedPhoto: PlacePhoto | null
  settings: UserSettings
  journeyReady: boolean
  summaryMessageCount: number
  setSummaryMessageCount: React.Dispatch<React.SetStateAction<number>>
  setConversationSummary: React.Dispatch<React.SetStateAction<string>>
  checkpoint: StoryCheckpoint
  onForkTimeline: (messages: ChatEntry[], checkpoint: StoryCheckpoint, progress: StoryProgress) => void
  onStoryProgressChange: (progress: StoryProgress | null) => void
  onUserMessage: (text: string) => void
}

export function useChat({
  entries,
  setEntries,
  journey,
  place,
  placeData,
  selectedPhoto,
  settings,
  journeyReady,
  summaryMessageCount,
  setSummaryMessageCount,
  setConversationSummary,
  checkpoint,
  onForkTimeline,
  onStoryProgressChange,
  onUserMessage,
}: UseChatOptions) {
  const [llmState, setLlmState] = useState<'idle' | 'loading' | 'error'>('idle')
  const [llmError, setLlmError] = useState('')
  const [animatedEntryId, setAnimatedEntryId] = useState<string | null>(null)
  const [summaryState, setSummaryState] = useState<'idle' | 'loading'>('idle')
  const chatAbort = useRef<AbortController | null>(null)
  const summaryRun = useRef(0)

  useEffect(() => () => chatAbort.current?.abort(), [])

  useEffect(() => {
    if (!journeyReady || summaryState === 'loading' || !shouldSummarize(entries.length, summaryMessageCount)) return
    setSummaryState('loading')
    const run = ++summaryRun.current
    const config = { baseUrl: settings.llmBaseUrl, model: settings.llmModel, apiKey: settings.llmApiKey }
    void import('../providers/context').then(({ buildSummaryMessages }) => import('../providers/llm').then(({ completeChat }) => completeChat(config, buildSummaryMessages(entries)))).then((summary) => {
      if (run !== summaryRun.current) return
      setConversationSummary(summary)
      setSummaryMessageCount(entries.length)
      setSummaryState('idle')
    }).catch(() => {
      if (run !== summaryRun.current) return
      setSummaryMessageCount(entries.length)
      setSummaryState('idle')
    })
  }, [entries, journeyReady, setConversationSummary, setSummaryMessageCount, settings, summaryMessageCount, summaryState])

  function send(text: string, retrying = false, rewindTo?: StoryProgress | null) {
    if (!text || llmState === 'loading') return
    const lastUserIndex = retrying ? entries.map((entry) => entry.role === 'user').lastIndexOf(true) : -1
    const retryEntry = lastUserIndex >= 0 ? entries[lastUserIndex] : null
    const history = retrying && lastUserIndex >= 0 ? entries.slice(0, lastUserIndex) : entries
    const stops = storyStops(entries)
    const rewindIndex = storyStopIndex(entries, rewindTo)
    const shouldFork = !retrying && rewindTo != null && rewindIndex >= 0 && rewindIndex < stops.length - 1
    const targetStop = shouldFork ? stops[rewindIndex] : null
    const targetEntryIndex = targetStop ? entries.findIndex((entry) => entry.id === targetStop.entryId) : -1
    const turnUserEntry = targetEntryIndex >= 0 ? entries.slice(0, targetEntryIndex).reverse().find((entry) => entry.role === 'user') : undefined
    const checkpointAtTurn = (shouldFork ? turnUserEntry?.checkpoint : retryEntry?.checkpoint) ?? checkpoint
    const activeHistory = targetStop ? trimHistoryAtStoryStop(entries, targetStop) : history
    const userEntry = retryEntry && retrying
      ? { ...retryEntry, id: crypto.randomUUID(), text, checkpoint: checkpointAtTurn, createdAt: new Date().toISOString() }
      : newEntry('user', text, checkpointAtTurn)
    const reply = newEntry('assistant', '')
    const requestHistory = retrying ? history : activeHistory
    const requestJourney = shouldFork
      ? { ...journey, destinationHistory: checkpointAtTurn.destinationHistory, currentScene: checkpointAtTurn.currentScene, knownPeople: checkpointAtTurn.knownPeople, knownEntities: checkpointAtTurn.knownEntities, userFacts: checkpointAtTurn.userFacts, conversationSummary: checkpointAtTurn.conversationSummary ?? '' }
      : journey
    const requestPlace = shouldFork ? checkpointAtTurn.currentDestination : place
    const placeIsAtCheckpoint = !shouldFork || requestPlace?.id === place?.id
    const requestPhoto = placeIsAtCheckpoint ? selectedPhoto : null
    const requestContext = placeIsAtCheckpoint && placeData.contextState === 'ready' ? placeData.context : null
    const requestWeather = placeIsAtCheckpoint ? placeData.weather : null
    setAnimatedEntryId(reply.id)
    if (shouldFork && targetStop) onForkTimeline([...activeHistory, userEntry], checkpointAtTurn, targetStop)
    else setEntries([...requestHistory, userEntry])
    onStoryProgressChange(null)
    if (!retrying) onUserMessage(text)
    setLlmState('loading')
    setLlmError('')
    chatAbort.current?.abort()
    const controller = new AbortController()
    chatAbort.current = controller
    let assistantStarted = false
    let responseKind: 'undetermined' | 'structured' | 'plain-text' = 'undetermined'
    let responsePrefix = ''
    const publishPlainText = (content: string) => {
      if (!content) return
      const firstDelta = !assistantStarted
      assistantStarted = true
      setEntries((current) => firstDelta ? [...current, { ...reply, text: content }] : current.map((entry) => entry.id === reply.id ? { ...entry, text: entry.text + content } : entry))
    }
    const liveWeather = requestWeather
      ? `${requestWeather.data.weatherCode}, ${requestWeather.data.temperatureC}°C, ${requestWeather.source}`
      : undefined
    const config = { baseUrl: settings.llmBaseUrl, model: settings.llmModel, apiKey: settings.llmApiKey }
    void import('../providers/context').then(({ buildJourneyContext }) => {
      const chatMessages = buildJourneyContext({
        settings,
        selectedPlace: requestPlace,
        messages: requestHistory,
        userMessage: text,
        liveWeather,
        destinationPhotos: requestPhoto ? [requestPhoto] : [],
        placeContext: requestContext,
        placeContextCached: placeIsAtCheckpoint ? placeData.contextCached : false,
        journey: requestJourney,
      })
      return import('../providers/llm').then(({ streamChat }) => streamChat(config, chatMessages, (delta) => {
        if (controller.signal.aborted || chatAbort.current !== controller) return
        if (responseKind === 'structured') return
        if (responseKind === 'plain-text') {
          publishPlainText(delta)
          return
        }
        responsePrefix += delta
        const trimmedPrefix = responsePrefix.trimStart()
        if (!trimmedPrefix) return
        responseKind = trimmedPrefix.startsWith('{') || trimmedPrefix.startsWith('```') ? 'structured' : 'plain-text'
        if (responseKind === 'plain-text') {
          publishPlainText(responsePrefix)
          responsePrefix = ''
        }
      }, controller.signal))
    }).then(async (content) => {
      if (controller.signal.aborted || chatAbort.current !== controller) return
      const storyTurn = parseStoryResponse(content, reply.id)
      const displayText = storyTurnToText(storyTurn)
      setEntries((current) => current.some((entry) => entry.id === reply.id)
        ? current.map((entry) => entry.id === reply.id ? { ...entry, text: displayText, storyTurn } : entry)
        : [...current, { ...reply, text: displayText, storyTurn }])
      onStoryProgressChange({ entryId: reply.id, blockIndex: 0 })
      setLlmState('idle')
      chatAbort.current = null
    }).catch((error) => {
      if (controller.signal.aborted || chatAbort.current !== controller) return
      setLlmState('error')
      setLlmError(error instanceof Error ? error.message : 'The language model request failed')
      chatAbort.current = null
    })
  }

  function cancel() {
    chatAbort.current?.abort()
    chatAbort.current = null
    setLlmState('idle')
  }

  function retry() {
    const lastUser = entries.slice().reverse().find((entry) => entry.role === 'user')
    if (lastUser) {
      setLlmError('')
      send(lastUser.text, true)
    }
  }

  function clearError() {
    setLlmError('')
  }

  function reset() {
    cancel()
    summaryRun.current += 1
    setLlmError('')
    setAnimatedEntryId(null)
    setSummaryState('idle')
  }

  return { llmState, llmError, animatedEntryId, summaryState, send, cancel, retry, clearError, reset }
}

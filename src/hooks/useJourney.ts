import { useEffect, useState } from 'react'
import { deleteActiveJourney, loadActiveJourney, saveActiveJourney } from '../storage/journey'
import { newEntry, starterEntries, STARTER_MESSAGE } from '../storage/messages'
import type { ChatEntry, JourneyConversation, JourneyState, JourneyTimeline, MapViewport, NarrativeEvent, Place, StoryBranch, StoryCheckpoint, StoryProgress } from '../types/domain'
import { latestStoryStop } from '../providers/storyFormat'
import { DEFAULT_PERSONA_ID } from '../providers/config'

function conversationTitle(messages: ChatEntry[]): string {
  const firstMessage = messages.find((entry) => entry.role === 'user')?.text.trim()
  if (!firstMessage) return 'New conversation'
  return firstMessage.length > 42 ? `${firstMessage.slice(0, 39).trimEnd()}…` : firstMessage
}

function newConversation(messages = starterEntries()): JourneyConversation {
  return { id: crypto.randomUUID(), title: conversationTitle(messages), createdAt: new Date().toISOString(), messages, narrativeEvents: [], conversationSummary: '', storyProgress: null, branches: [] }
}

function emptyJourney(): JourneyState {
  const conversation = newConversation()
  return { id: 'active', personaId: DEFAULT_PERSONA_ID, currentDestination: null, mapViewport: null, destinationHistory: [], currentScene: 1, messages: conversation.messages, knownPeople: [], knownEntities: [], userFacts: [], narrativeEvents: [], conversationSummary: '', storyProgress: null, branches: [], conversations: [conversation], activeConversationId: conversation.id }
}

export function newJourneyEvent(type: NarrativeEvent['type'], text: string, placeId?: string): NarrativeEvent {
  return { id: crypto.randomUUID(), type, createdAt: new Date().toISOString(), text, placeId }
}

export function useJourney() {
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null)
  const [personaId, setPersonaId] = useState(DEFAULT_PERSONA_ID)
  const [mapViewport, setMapViewport] = useState<MapViewport | null>(null)
  const [messages, setMessages] = useState<ChatEntry[]>(starterEntries)
  const [destinationHistory, setDestinationHistory] = useState<Place[]>([])
  const [currentScene, setCurrentScene] = useState(1)
  const [narrativeEvents, setNarrativeEvents] = useState<NarrativeEvent[]>([])
  const [knownPeople, setKnownPeople] = useState<string[]>([])
  const [knownEntities, setKnownEntities] = useState<string[]>([])
  const [userFacts, setUserFacts] = useState<string[]>([])
  const [conversationSummary, setConversationSummary] = useState('')
  const [storyProgress, setStoryProgress] = useState<StoryProgress | null>(null)
  const [branches, setBranches] = useState<StoryBranch[]>([])
  const [initialConversation] = useState(() => newConversation())
  const [conversations, setConversations] = useState<JourneyConversation[]>([initialConversation])
  const [activeConversationId, setActiveConversationId] = useState(initialConversation.id)
  const [summaryMessageCount, setSummaryMessageCount] = useState(0)
  const [journeyReady, setJourneyReady] = useState(false)

  function timeline(): JourneyTimeline {
    return { personaId, currentDestination: selectedPlace, mapViewport, destinationHistory, currentScene, messages, knownPeople, knownEntities, userFacts, narrativeEvents, conversationSummary, storyProgress }
  }

  function checkpoint(): StoryCheckpoint {
    const { messages: _messages, storyProgress: _storyProgress, ...snapshot } = timeline()
    return snapshot
  }

  function currentConversation(): JourneyConversation {
    const id = activeConversationId || conversations[0]?.id || crypto.randomUUID()
    const previous = conversations.find((conversation) => conversation.id === id)
    return { id, title: conversationTitle(messages), createdAt: previous?.createdAt ?? new Date().toISOString(), messages, narrativeEvents, conversationSummary, storyProgress, branches }
  }

  function conversationList(): JourneyConversation[] {
    const active = currentConversation()
    return conversations.some((conversation) => conversation.id === active.id)
      ? conversations.map((conversation) => conversation.id === active.id ? active : conversation)
      : [...conversations, active]
  }

  function restoreConversation(conversation: JourneyConversation) {
    setMessages(conversation.messages)
    setNarrativeEvents(conversation.narrativeEvents)
    setConversationSummary(conversation.conversationSummary)
    setStoryProgress(conversation.storyProgress)
    setBranches(conversation.branches)
    setSummaryMessageCount(conversation.messages.length)
  }

  function restoreTimeline(snapshot: JourneyTimeline) {
    setPersonaId(snapshot.personaId ?? DEFAULT_PERSONA_ID)
    setSelectedPlace(snapshot.currentDestination)
    setMapViewport(snapshot.mapViewport ?? null)
    setDestinationHistory(snapshot.destinationHistory)
    setCurrentScene(snapshot.currentScene)
    setMessages(snapshot.messages)
    setNarrativeEvents(snapshot.narrativeEvents)
    setKnownPeople(snapshot.knownPeople)
    setKnownEntities(snapshot.knownEntities)
    setUserFacts(snapshot.userFacts)
    setConversationSummary(snapshot.conversationSummary ?? '')
    setStoryProgress(snapshot.storyProgress ?? null)
    setSummaryMessageCount(snapshot.messages.length)
  }

  function restoreCheckpoint(snapshot: StoryCheckpoint) {
    setPersonaId(snapshot.personaId ?? DEFAULT_PERSONA_ID)
    setSelectedPlace(snapshot.currentDestination)
    setMapViewport(snapshot.mapViewport ?? null)
    setDestinationHistory(snapshot.destinationHistory)
    setCurrentScene(snapshot.currentScene)
    setNarrativeEvents(snapshot.narrativeEvents)
    setKnownPeople(snapshot.knownPeople)
    setKnownEntities(snapshot.knownEntities)
    setUserFacts(snapshot.userFacts)
    setConversationSummary(snapshot.conversationSummary ?? '')
  }

  useEffect(() => {
    void loadActiveJourney().then((journey) => {
      const restored = journey ?? emptyJourney()
      setPersonaId(restored.personaId ?? DEFAULT_PERSONA_ID)
      setSelectedPlace(restored.currentDestination)
      setMapViewport(restored.mapViewport ?? null)
      setDestinationHistory(restored.destinationHistory)
      setCurrentScene(restored.currentScene)
      setKnownPeople(restored.knownPeople)
      setKnownEntities(restored.knownEntities)
      setUserFacts(restored.userFacts)
      const records = restored.conversations?.length ? restored.conversations : [{
        id: crypto.randomUUID(), title: conversationTitle(restored.messages), createdAt: new Date().toISOString(),
        messages: restored.messages.length ? restored.messages : starterEntries(), narrativeEvents: restored.narrativeEvents,
        conversationSummary: restored.conversationSummary ?? '', storyProgress: restored.storyProgress ?? null, branches: restored.branches ?? [],
      }]
      const active = records.find((conversation) => conversation.id === restored.activeConversationId) ?? records[0]
      setConversations(records)
      setActiveConversationId(active.id)
      restoreConversation(active)
      setJourneyReady(true)
    })
  }, [])

  useEffect(() => {
    if (!journeyReady) return
    const timer = window.setTimeout(() => {
      void saveActiveJourney({
        id: 'active',
        personaId,
        currentDestination: selectedPlace,
        mapViewport,
        destinationHistory,
        currentScene,
        messages,
        knownPeople,
        knownEntities,
        userFacts,
        narrativeEvents,
        conversationSummary,
        storyProgress,
        branches,
        conversations: conversationList(),
        activeConversationId: activeConversationId || conversations[0]?.id,
      })
    }, 400)
    return () => window.clearTimeout(timer)
  }, [activeConversationId, branches, conversationSummary, conversations, currentScene, destinationHistory, journeyReady, knownEntities, knownPeople, mapViewport, messages, narrativeEvents, personaId, selectedPlace, storyProgress, userFacts])

  function applyJourney(journey: JourneyState) {
    setPersonaId(journey.personaId ?? DEFAULT_PERSONA_ID)
    setSelectedPlace(journey.currentDestination)
    setMapViewport(journey.mapViewport ?? null)
    setDestinationHistory(journey.destinationHistory)
    setCurrentScene(journey.currentScene)
    setKnownPeople(journey.knownPeople)
    setKnownEntities(journey.knownEntities)
    setUserFacts(journey.userFacts)
    const records = journey.conversations?.length ? journey.conversations : [{
      id: crypto.randomUUID(), title: conversationTitle(journey.messages), createdAt: new Date().toISOString(),
      messages: journey.messages, narrativeEvents: journey.narrativeEvents, conversationSummary: journey.conversationSummary ?? '',
      storyProgress: journey.storyProgress ?? null, branches: journey.branches ?? [],
    }]
    const active = records.find((conversation) => conversation.id === journey.activeConversationId) ?? records[0]
    setConversations(records)
    setActiveConversationId(active.id)
    restoreConversation(active)
  }

  function resetJourney() {
    const journey = emptyJourney()
    setPersonaId(DEFAULT_PERSONA_ID)
    setSelectedPlace(journey.currentDestination)
    setMapViewport(journey.mapViewport ?? null)
    setDestinationHistory(journey.destinationHistory)
    setCurrentScene(journey.currentScene)
    setKnownPeople(journey.knownPeople)
    setKnownEntities(journey.knownEntities)
    setUserFacts(journey.userFacts)
    setConversations(journey.conversations ?? [])
    setActiveConversationId(journey.activeConversationId ?? '')
    restoreConversation(journey.conversations?.[0] ?? newConversation())
    setSummaryMessageCount(0)
  }

  function snapshot(): JourneyState {
    return { id: 'active', ...timeline(), branches, conversations: conversationList(), activeConversationId: activeConversationId || conversations[0]?.id }
  }

  function createConversation() {
    const conversation = newConversation()
    setConversations([...conversationList(), conversation])
    setActiveConversationId(conversation.id)
    restoreConversation(conversation)
  }

  function switchConversation(conversationId: string) {
    if (conversationId === activeConversationId) return
    const records = conversationList()
    const conversation = records.find((item) => item.id === conversationId)
    if (!conversation) return
    setConversations(records)
    setActiveConversationId(conversation.id)
    restoreConversation(conversation)
  }

  function deleteConversation(conversationId: string) {
    const records = conversationList()
    if (records.length <= 1 || !records.some((item) => item.id === conversationId)) return
    const remaining = records.filter((item) => item.id !== conversationId)
    setConversations(remaining)
    if (conversationId !== activeConversationId) return
    const next = [...remaining].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
    setActiveConversationId(next.id)
    restoreConversation(next)
  }

  function forkAt(messagesOnBranch: ChatEntry[], checkpointAtBranch: StoryCheckpoint, progress: StoryProgress) {
    const archived = timeline()
    const completeProgress = latestStoryStop(archived.messages)
    setBranches((current) => [...current, {
      id: crypto.randomUUID(),
      label: `Rewound timeline ${current.length + 1}`,
      createdAt: new Date().toISOString(),
      snapshot: { ...archived, storyProgress: completeProgress },
    }])
    restoreCheckpoint(checkpointAtBranch)
    setMessages(messagesOnBranch)
    setStoryProgress(progress)
    setSummaryMessageCount(messagesOnBranch.length)
  }

  function switchBranch(branchId: string) {
    const selected = branches.find((branch) => branch.id === branchId)
    if (!selected) return
    const current = timeline()
    const currentProgress = latestStoryStop(current.messages)
    setBranches((items) => [
      ...items.filter((branch) => branch.id !== branchId),
      { id: crypto.randomUUID(), label: 'Previous active timeline', createdAt: new Date().toISOString(), snapshot: { ...current, storyProgress: currentProgress } },
    ])
    restoreTimeline(selected.snapshot)
  }

  async function deleteJourney() {
    await deleteActiveJourney()
    resetJourney()
  }

  function appendArrival(text: string, type: NarrativeEvent['type'], placeId: string) {
    setMessages((current) => current.length === 1 && current[0].text === STARTER_MESSAGE ? [newEntry('event', text)] : [...current, newEntry('event', text)])
    setNarrativeEvents((current) => [...current, newJourneyEvent(type, text, placeId)])
    setStoryProgress(null)
  }

  return {
    selectedPlace, setSelectedPlace,
    personaId, setPersonaId,
    mapViewport, setMapViewport,
    messages, setMessages,
    destinationHistory, setDestinationHistory,
    currentScene, setCurrentScene,
    narrativeEvents, setNarrativeEvents,
    knownPeople, setKnownPeople,
    knownEntities, setKnownEntities,
    userFacts, setUserFacts,
    conversationSummary, setConversationSummary,
    summaryMessageCount, setSummaryMessageCount,
    journeyReady,
    storyProgress,
    setStoryProgress,
    branches,
    conversations: conversationList(),
    activeConversationId: activeConversationId || conversations[0]?.id,
    createConversation,
    switchConversation,
    deleteConversation,
    checkpoint,
    forkAt,
    switchBranch,
    applyJourney,
    resetJourney,
    snapshot,
    deleteJourney,
    appendArrival,
  }
}

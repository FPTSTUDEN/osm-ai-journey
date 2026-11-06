import { useEffect, useState } from 'react'
import { deleteActiveJourney, loadActiveJourney, saveActiveJourney } from '../storage/journey'
import { newEntry, starterEntries, STARTER_MESSAGE } from '../storage/messages'
import type { ChatEntry, JourneyState, JourneyTimeline, MapViewport, NarrativeEvent, Place, StoryBranch, StoryCheckpoint, StoryProgress } from '../types/domain'
import { latestStoryStop } from '../providers/storyFormat'

function emptyJourney(): JourneyState {
  return { id: 'active', currentDestination: null, mapViewport: null, destinationHistory: [], currentScene: 1, messages: starterEntries(), knownPeople: [], knownEntities: [], userFacts: [], narrativeEvents: [], conversationSummary: '', storyProgress: null, branches: [] }
}

export function newJourneyEvent(type: NarrativeEvent['type'], text: string, placeId?: string): NarrativeEvent {
  return { id: crypto.randomUUID(), type, createdAt: new Date().toISOString(), text, placeId }
}

export function useJourney() {
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null)
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
  const [summaryMessageCount, setSummaryMessageCount] = useState(0)
  const [journeyReady, setJourneyReady] = useState(false)

  function timeline(): JourneyTimeline {
    return { currentDestination: selectedPlace, mapViewport, destinationHistory, currentScene, messages, knownPeople, knownEntities, userFacts, narrativeEvents, conversationSummary, storyProgress }
  }

  function checkpoint(): StoryCheckpoint {
    const { messages: _messages, storyProgress: _storyProgress, ...snapshot } = timeline()
    return snapshot
  }

  function restoreTimeline(snapshot: JourneyTimeline) {
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
      setSelectedPlace(restored.currentDestination)
      setMapViewport(restored.mapViewport ?? null)
      setDestinationHistory(restored.destinationHistory)
      setCurrentScene(restored.currentScene)
      setMessages(restored.messages.length ? restored.messages : starterEntries())
      setNarrativeEvents(restored.narrativeEvents)
      setKnownPeople(restored.knownPeople)
      setKnownEntities(restored.knownEntities)
      setUserFacts(restored.userFacts)
      setConversationSummary(restored.conversationSummary ?? '')
      setStoryProgress(restored.storyProgress ?? null)
      setBranches(restored.branches ?? [])
      setSummaryMessageCount(restored.messages.length)
      setJourneyReady(true)
    })
  }, [])

  useEffect(() => {
    if (!journeyReady) return
    const timer = window.setTimeout(() => {
      void saveActiveJourney({
        id: 'active',
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
      })
    }, 400)
    return () => window.clearTimeout(timer)
  }, [branches, conversationSummary, currentScene, destinationHistory, journeyReady, knownEntities, knownPeople, mapViewport, messages, narrativeEvents, selectedPlace, storyProgress, userFacts])

  function applyJourney(journey: JourneyState) {
    setSelectedPlace(journey.currentDestination)
    setMapViewport(journey.mapViewport ?? null)
    setDestinationHistory(journey.destinationHistory)
    setCurrentScene(journey.currentScene)
    setMessages(journey.messages)
    setNarrativeEvents(journey.narrativeEvents)
    setKnownPeople(journey.knownPeople)
    setKnownEntities(journey.knownEntities)
    setUserFacts(journey.userFacts)
    setConversationSummary(journey.conversationSummary ?? '')
    setStoryProgress(journey.storyProgress ?? null)
    setBranches(journey.branches ?? [])
    setSummaryMessageCount(journey.messages.length)
  }

  function resetJourney() {
    const journey = emptyJourney()
    setSelectedPlace(journey.currentDestination)
    setMapViewport(journey.mapViewport ?? null)
    setDestinationHistory(journey.destinationHistory)
    setCurrentScene(journey.currentScene)
    setMessages(journey.messages)
    setNarrativeEvents(journey.narrativeEvents)
    setKnownPeople(journey.knownPeople)
    setKnownEntities(journey.knownEntities)
    setUserFacts(journey.userFacts)
    setConversationSummary('')
    setStoryProgress(null)
    setBranches([])
    setSummaryMessageCount(0)
  }

  function snapshot(): JourneyState {
    return { id: 'active', ...timeline(), branches }
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

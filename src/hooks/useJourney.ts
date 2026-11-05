import { useEffect, useState } from 'react'
import { deleteActiveJourney, loadActiveJourney, saveActiveJourney } from '../storage/journey'
import { newEntry, starterEntries, STARTER_MESSAGE } from '../storage/messages'
import type { ChatEntry, JourneyState, MapViewport, NarrativeEvent, Place } from '../types/domain'

function emptyJourney(): JourneyState {
  return { id: 'active', currentDestination: null, mapViewport: null, destinationHistory: [], currentScene: 1, messages: starterEntries(), knownPeople: [], knownEntities: [], userFacts: [], narrativeEvents: [], conversationSummary: '' }
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
  const [summaryMessageCount, setSummaryMessageCount] = useState(0)
  const [journeyReady, setJourneyReady] = useState(false)

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
      })
    }, 400)
    return () => window.clearTimeout(timer)
  }, [conversationSummary, currentScene, destinationHistory, journeyReady, knownEntities, knownPeople, mapViewport, messages, narrativeEvents, selectedPlace, userFacts])

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
    setSummaryMessageCount(0)
  }

  function snapshot(): JourneyState {
    return { id: 'active', currentDestination: selectedPlace, mapViewport, destinationHistory, currentScene, messages, knownPeople, knownEntities, userFacts, narrativeEvents, conversationSummary }
  }

  async function deleteJourney() {
    await deleteActiveJourney()
    resetJourney()
  }

  function appendArrival(text: string, type: NarrativeEvent['type'], placeId: string) {
    setMessages((current) => current.length === 1 && current[0].text === STARTER_MESSAGE ? [newEntry('event', text)] : [...current, newEntry('event', text)])
    setNarrativeEvents((current) => [...current, newJourneyEvent(type, text, placeId)])
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
    applyJourney,
    resetJourney,
    snapshot,
    deleteJourney,
    appendArrival,
  }
}

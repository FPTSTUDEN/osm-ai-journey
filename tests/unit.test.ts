import assert from 'node:assert/strict'
import test from 'node:test'
import { DEFAULT_MAP_VIEWPORT, getInitialMapViewport } from '../src/components/mapViewport'
import { deduplicatePlaces, searchLocalPlaces } from '../src/providers/localPlaceIndex'
import { buildJourneyContext } from '../src/providers/context'
import { weatherLabel } from '../src/providers/weather'
import { journeyJson, parseJourneyJson } from '../src/storage/journeyTransfer'
import { normalizeMessages } from '../src/storage/messages'
import type { ChatEntry, Place } from '../src/types/domain'

const place = (id: string, name: string, category?: string): Place => ({ id, name, category, coordinates: [2.35, 48.85], source: 'map' })

test('local search ranks prefix matches and requires all terms', () => {
  const results = searchLocalPlaces([place('1', 'Central Station', 'transport'), place('2', 'Station Road', 'road'), place('3', 'Museum')], 'central station')
  assert.deepEqual(results.map((item) => item.id), ['1'])
})

test('place indexing removes duplicate feature ids', () => {
  assert.equal(deduplicatePlaces([place('same', 'One'), place('same', 'Replacement'), place('other', 'Two')]).length, 2)
})

test('initial map viewport restores free exploration and prioritizes a selected destination', () => {
  const savedViewport = { center: [-73.9857, 40.7484] as [number, number], zoom: 12.25 }
  assert.deepEqual(getInitialMapViewport(null, savedViewport), savedViewport)
  assert.deepEqual(getInitialMapViewport(null, null), DEFAULT_MAP_VIEWPORT)
  assert.deepEqual(getInitialMapViewport(place('destination', 'Destination'), savedViewport), { center: [2.35, 48.85], zoom: 14 })
})

test('weather codes map to readable condition labels', () => {
  assert.equal(weatherLabel(0), 'Clear sky')
  assert.equal(weatherLabel(61), 'Rain')
  assert.equal(weatherLabel(95), 'Thunderstorm')
})

test('photo metadata is included as untrusted text context without image content', () => {
  const messages = buildJourneyContext({
    settings: {
      llmProvider: 'ollama',
      llmBaseUrl: 'http://localhost:11434/v1',
      llmModel: 'test',
      llmApiKey: '',
      personaName: 'Guide',
      personaInstructions: '',
      onlineGeocoder: 'nominatim',
      calculateWalkingRoutes: false,
      routingBaseUrl: 'https://router.project-osrm.org',
      liveDataEnabled: false,
      weatherBaseUrl: 'https://api.open-meteo.com/v1/forecast',
    },
    selectedPlace: place('place', 'Test Place'),
    journey: { destinationHistory: [], currentScene: 1, knownPeople: [], knownEntities: [], userFacts: [], conversationSummary: '' },
    messages: ['starter'],
    userMessage: 'What is this place like?',
    destinationPhotos: [{
      id: '1',
      title: 'Town square',
      description: 'A market beside the old hall.',
      imageUrl: 'https://example.test/full.jpg',
      thumbnailUrl: 'https://example.test/thumb.jpg',
      sourceUrl: 'https://commons.wikimedia.org/wiki/File:Town_square.jpg',
      source: 'wikimedia-commons',
    }],
  })
  assert.match(messages[0].content, /Town square/)
  assert.match(messages[0].content, /untrusted text/)
  assert.doesNotMatch(messages[0].content, /full\.jpg/)
})

test('journey export round-trips and rejects malformed data', () => {
  const journey = {
    id: 'active' as const,
    currentDestination: place('current', 'Current'),
    mapViewport: null,
    destinationHistory: [place('current', 'Current')],
    currentScene: 2,
    messages: [{ id: 'm1', role: 'user' as const, text: 'hello', createdAt: '2026-01-01T00:00:00.000Z' }],
    knownPeople: ['Ada'],
    knownEntities: [],
    userFacts: ['A fact'],
    narrativeEvents: [],
    conversationSummary: '',
  }
  assert.deepEqual(parseJourneyJson(JSON.parse(journeyJson(journey))), JSON.parse(JSON.stringify(journey)))
  assert.throws(() => parseJourneyJson({ id: 'wrong' }), /invalid id/)
})

const entry = (role: ChatEntry['role'], text: string): ChatEntry => ({ id: text, role, text, createdAt: '2026-01-01T00:00:00.000Z' })
const settings = { llmProvider: 'ollama' as const, llmBaseUrl: '', llmModel: 't', llmApiKey: '', personaName: 'P', personaInstructions: '', onlineGeocoder: 'nominatim' as const, calculateWalkingRoutes: false, routingBaseUrl: '', liveDataEnabled: false, weatherBaseUrl: '' }
const journey = { destinationHistory: [], currentScene: 1, knownPeople: [], knownEntities: [], userFacts: [], conversationSummary: '' }

test('legacy string messages migrate with the old role alternation and arrival lines become events', () => {
  const entries = normalizeMessages(['Start', 'hi', 'hello there', 'You arrive at Louvre. Continuing without a walking route.', 'again', 'sure'])!
  assert.deepEqual(entries.map((item) => item.role), ['assistant', 'user', 'assistant', 'event', 'user', 'assistant'])
  assert.equal(normalizeMessages([{ nope: true }]), null)
  assert.equal(normalizeMessages('x'), null)
})

test('history roles come from entries, so a failed reply cannot flip later roles', () => {
  const out = buildJourneyContext({ settings, selectedPlace: null, journey, userMessage: 'next', messages: [entry('assistant', 'Choose a place on the map, or tell me what kind of journey you want to begin.'), entry('user', 'a'), entry('user', 'b'), entry('event', 'You arrive at X.'), entry('assistant', 'c')] })
  assert.deepEqual(out.slice(1).map((item) => item.role), ['user', 'user', 'assistant', 'assistant', 'user'])
  assert.match(out[3].content, /^\[Narration\]/)
})

test('with a summary only recent entries are sent', () => {
  const many = Array.from({ length: 30 }, (_, index) => entry(index % 2 ? 'assistant' : 'user', `m${index}`))
  const out = buildJourneyContext({ settings, selectedPlace: null, journey: { ...journey, conversationSummary: 'sum' }, userMessage: 'q', messages: many })
  assert.equal(out.length, 1 + 12 + 1)
})

test('source context is sent as untrusted grounding text', () => {
  const out = buildJourneyContext({ settings, selectedPlace: null, journey, userMessage: 'q', messages: [], placeContext: { summary: 'Built in 1762.', facts: [{ label: 'Architect', value: 'Salvi' }] }, placeContextCached: true })
  assert.match(out[0].content, /Built in 1762/)
  assert.match(out[0].content, /Architect: Salvi/)
  assert.match(out[0].content, /untrusted/)
})

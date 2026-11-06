import assert from 'node:assert/strict'
import test from 'node:test'
import { DEFAULT_MAP_VIEWPORT, getInitialMapViewport } from '../src/components/mapViewport'
import { deduplicatePlaces, placeFromFeature, searchLocalPlaces } from '../src/providers/localPlaceIndex'
import { buildJourneyContext } from '../src/providers/context'
import { parseStoryResponse, storyTurnToText } from '../src/providers/storyFormat'
import { weatherLabel } from '../src/providers/weather'
import { createOverpassQuery, parseOverpassResponse } from '../src/providers/overpass'
import { enrichPlace } from '../src/providers/enrichment'
import { parseWikimediaPhotos } from '../src/providers/photos'
import { revealedTextLength } from '../src/components/typewriter'
import { shouldSummarize } from '../src/hooks/chat'
import { journeyJson, parseJourneyJson } from '../src/storage/journeyTransfer'
import { normalizeMessages } from '../src/storage/messages'
import { normalizeStoryPresentationMode } from '../src/storage/settings'
import type { ChatEntry, Place } from '../src/types/domain'

const place = (id: string, name: string, category?: string): Place => ({ id, name, category, coordinates: [2.35, 48.85], source: 'map' })

test('local search ranks prefix matches and requires all terms', () => {
  const results = searchLocalPlaces([place('1', 'Central Station', 'transport'), place('2', 'Station Road', 'road'), place('3', 'Museum')], 'central station')
  assert.deepEqual(results.map((item) => item.id), ['1'])
})

test('place indexing removes duplicate feature ids', () => {
  assert.equal(deduplicatePlaces([place('same', 'One'), place('same', 'Replacement'), place('other', 'Two')]).length, 2)
})

test('places preserve Wikidata IDs and Wikipedia sitelinks from loaded features', () => {
  const mapped = placeFromFeature({
    geometry: { type: 'Point', coordinates: [2.35, 48.85] },
    properties: { name: 'Central Library', wikidata: 'Q12345', wikipedia: 'en:Central_Library' },
  })
  assert.equal(mapped?.wikidataId, 'Q12345')
  assert.equal(mapped?.wikipediaTitle, 'Central Library')
})

test('places preserve opening-hours tags from loaded map features', () => {
  const mapped = placeFromFeature({
    geometry: { type: 'Point', coordinates: [2.35, 48.85] },
    properties: { name: 'Central Library', opening_hours: 'Mo-Fr 09:00-17:00' },
  })
  assert.equal(mapped?.openingHours, 'Mo-Fr 09:00-17:00')
})

test('Overpass queries escape place names and return nearby named transit stops in distance order', () => {
  const destination = { ...place('destination', 'Museum "Central"'), openingHours: undefined }
  const query = createOverpassQuery(destination)
  assert.ok(query.includes('Museum \\"Central\\"'))

  const result = parseOverpassResponse({ elements: [
    { type: 'node', lat: 48.851, lon: 2.35, tags: { name: 'Far stop', highway: 'bus_stop' } },
    { type: 'node', lat: 48.8501, lon: 2.35, tags: { name: 'Near stop', public_transport: 'platform' } },
    { type: 'node', lat: 48.851, lon: 2.35, tags: { name: 'Museum "Central"', opening_hours: 'Mo-Fr 10:00-17:00' } },
    { type: 'node', lat: 48.85, lon: 2.35, tags: { name: 'Museum "Central"', opening_hours: 'Mo-Su 10:00-18:00' } },
  ] }, destination)
  assert.equal(result.openingHours, 'Mo-Su 10:00-18:00')
  assert.deepEqual(result.transitStops.map((stop) => stop.name), ['Near stop', 'Far stop'])
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
      overpassApiUrl: 'https://overpass-api.de/api/interpreter',
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
const settings = { llmProvider: 'ollama' as const, llmBaseUrl: '', llmModel: 't', llmApiKey: '', personaName: 'P', personaInstructions: '', onlineGeocoder: 'nominatim' as const, calculateWalkingRoutes: false, routingBaseUrl: '', liveDataEnabled: false, weatherBaseUrl: '', overpassApiUrl: 'https://overpass-api.de/api/interpreter' }
const journey = { destinationHistory: [], currentScene: 1, knownPeople: [], knownEntities: [], userFacts: [], conversationSummary: '' }

test('legacy string messages migrate with the old role alternation and arrival lines become events', () => {
  const entries = normalizeMessages(['Start', 'hi', 'hello there', 'You arrive at Louvre. Continuing without a walking route.', 'again', 'sure'])!
  assert.deepEqual(entries.map((item) => item.role), ['assistant', 'user', 'assistant', 'event', 'user', 'assistant'])
  assert.equal(entries[2].storyTurn?.format, 'plain-text')
  assert.equal(entries[2].storyTurn?.blocks[0]?.type, 'prose')
  assert.equal(normalizeMessages([{ nope: true }]), null)
  assert.equal(normalizeMessages('x'), null)
})

test('persisted structured assistant entries are normalized and invalid turns fall back to their text', () => {
  const structured = normalizeMessages([{
    id: 'stored-turn', role: 'assistant', text: 'old flattened text', createdAt: '2026-01-01T00:00:00.000Z',
    storyTurn: { format: 'structured', blocks: [{ id: 'stored-block', type: 'dialogue', speaker: 'Mira', text: 'Hello.' }] },
  }])![0]
  const invalid = normalizeMessages([{
    id: 'invalid-turn', role: 'assistant', text: 'keep this text', createdAt: '2026-01-01T00:00:00.000Z',
    storyTurn: { format: 'structured', blocks: [{ type: 'dialogue', text: 'missing speaker' }] },
  }])![0]

  assert.equal(structured.text, 'Mira: Hello.')
  assert.equal(structured.storyTurn?.format, 'structured')
  assert.equal(invalid.text, 'keep this text')
  assert.equal(invalid.storyTurn?.format, 'plain-text')
})

test('history roles come from entries, so a failed reply cannot flip later roles', () => {
  const out = buildJourneyContext({ settings, selectedPlace: null, journey, userMessage: 'next', messages: [entry('assistant', 'Choose a place on the map, or tell me what kind of journey you want to begin.'), entry('user', 'a'), entry('user', 'b'), entry('event', 'You arrive at X.'), entry('assistant', 'c')] })
  assert.deepEqual(out.slice(1).map((item) => item.role), ['user', 'user', 'assistant', 'assistant', 'user'])
  assert.match(out[0].content, /one JSON object with a "blocks" array/)
  assert.match(out[3].content, /^\[Narration\]/)
})

test('structured story responses preserve block order and produce readable legacy text', () => {
  const turn = parseStoryResponse(JSON.stringify({ blocks: [
    { type: 'narration', text: 'The station grows quiet.' },
    { type: 'dialogue', speaker: 'Mira', text: 'Ready to go?' },
    { type: 'scene', text: 'The train pulls away.' },
  ] }), 'turn-1')

  assert.equal(turn.format, 'structured')
  assert.deepEqual(turn.blocks.map((block) => block.type), ['narration', 'dialogue', 'scene'])
  assert.deepEqual(turn.blocks.map((block) => block.id), ['turn-1:1', 'turn-1:2', 'turn-1:3'])
  assert.equal(storyTurnToText(turn), 'The station grows quiet.\n\nMira: Ready to go?\n\n[Scene] The train pulls away.')
})

test('plain-text and malformed structured responses fall back without losing content', () => {
  const prose = 'A quiet street stretches ahead.'
  const plainTurn = parseStoryResponse(prose, 'plain-1')
  const malformed = '{"blocks":[{"type":"dialogue","speaker":"Mira"}]}'
  const malformedTurn = parseStoryResponse(malformed, 'fallback-1')

  assert.equal(plainTurn.format, 'plain-text')
  assert.equal(plainTurn.blocks[0].type, 'prose')
  assert.equal(storyTurnToText(plainTurn), prose)
  assert.equal(malformedTurn.format, 'plain-text')
  assert.equal(storyTurnToText(malformedTurn), malformed)
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

test('Wikidata IDs are resolved directly without a name search', async () => {
  const originalFetch = globalThis.fetch
  const requests: string[] = []
  globalThis.fetch = async (input) => {
    const url = String(input)
    requests.push(url)
    if (url.includes('wbgetentities')) {
      return Response.json({ entities: { Q123: { id: 'Q123', claims: {}, sitelinks: { enwiki: { title: 'Matching Place' } } } } })
    }
    return Response.json({ title: 'Matching Place', extract: 'A grounded description.' })
  }
  try {
    const result = await enrichPlace({ ...place('grounded', 'Matching Place'), wikidataId: 'Q123' })
    assert.equal(result.context.summary, 'A grounded description.')
    assert.equal(requests.some((url) => url.includes('wbsearchentities') || url.includes('opensearch')), false)
    assert.ok(requests.some((url) => url.includes('ids=Q123')))
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('Wikipedia geosearch rejects a similarly named article outside the radius', async () => {
  const originalFetch = globalThis.fetch
  let summaryRequested = false
  globalThis.fetch = async (input) => {
    const url = String(input)
    if (url.includes('action=query')) {
      return Response.json({ query: { geosearch: [{ title: 'Central Station', dist: 12000 }] } })
    }
    summaryRequested = true
    return Response.json({ title: 'Central Station', extract: 'Wrong place.' })
  }
  try {
    const result = await enrichPlace(place('station', 'Central Station'))
    assert.equal(result.context.summary, undefined)
    assert.equal(summaryRequested, false)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('typewriter reveal advances with elapsed time and never exceeds the message', () => {
  assert.equal(revealedTextLength('abcdefghij', 100, 20), 2)
  assert.equal(revealedTextLength('abc', 10000), 3)
  assert.equal(revealedTextLength('abc', -10), 0)
})

test('story presentation settings accept supported modes and default invalid values to novel', () => {
  assert.equal(normalizeStoryPresentationMode('novel'), 'novel')
  assert.equal(normalizeStoryPresentationMode('visual-novel'), 'visual-novel')
  assert.equal(normalizeStoryPresentationMode('chat'), 'chat')
  assert.equal(normalizeStoryPresentationMode('unknown'), 'novel')
})

test('conversation summaries respect minimum history and growth thresholds', () => {
  assert.equal(shouldSummarize(11, 0), false)
  assert.equal(shouldSummarize(20, 13), false)
  assert.equal(shouldSummarize(20, 12), true)
})

test('Wikimedia photo parsing filters unsupported MIME types and sorts by distance', () => {
  const photoInfo = (mime: string, title: string) => ({
    thumburl: `https://images.test/thumb/1600px-${title}`,
    descriptionurl: `https://commons.wikimedia.org/wiki/File:${title}`,
    mime,
    extmetadata: { LicenseShortName: { value: 'CC BY-SA 4.0' }, LicenseUrl: { value: 'https://creativecommons.org/licenses/by-sa/4.0/' }, AttributionRequired: { value: 'true' } },
  })

  const photos = parseWikimediaPhotos({ query: { pages: {
    near: { pageid: 1, title: 'File:Near.jpg', imageinfo: [photoInfo('image/jpeg', 'Near.jpg')], coordinates: [{ lat: 48.8501, lon: 2.3501 }] },
    far: { pageid: 2, title: 'File:Far.jpg', imageinfo: [photoInfo('image/webp', 'Far.jpg')], coordinates: [{ lat: 48.9, lon: 2.4 }] },
    invalid: { pageid: 3, title: 'File:Vector.svg', imageinfo: [photoInfo('image/svg+xml', 'Vector.svg')] },
  } } }, place('museum', 'Museum'))
  assert.deepEqual(photos.map((photo) => photo.id), ['1', '2'])
  assert.equal(photos[0].license, 'CC BY-SA 4.0')
  assert.equal(photos[0].licenseUrl, 'https://creativecommons.org/licenses/by-sa/4.0/')
  assert.equal(photos[0].attributionRequired, true)
  assert.match(photos[0].thumbnailUrl, /640px-Near\.jpg/)
})

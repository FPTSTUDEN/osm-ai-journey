import assert from 'node:assert/strict'
import test from 'node:test'
import { DEFAULT_MAP_VIEWPORT, getInitialMapViewport } from '../src/components/mapViewport'
import { deduplicatePlaces, placeFromFeature, searchLocalPlaces } from '../src/providers/localPlaceIndex'
import { buildJourneyContext } from '../src/providers/context'
import { parseStoryResponse, storyStopIndex, storyStops, storyTurnToText, trimHistoryAtStoryStop } from '../src/providers/storyFormat'
import { weatherLabel } from '../src/providers/weather'
import { createOverpassQuery, parseOverpassResponse } from '../src/providers/overpass'
import { enrichPlace } from '../src/providers/enrichment'
import { parseWikimediaPhotos } from '../src/providers/photos'
import { revealedTextLength } from '../src/components/typewriter'
import { shouldSummarize } from '../src/hooks/chat'
import { journeyJson, parseJourneyJson } from '../src/storage/journeyTransfer'
import { normalizeMessages } from '../src/storage/messages'
import { normalizeMotionPreference, normalizePersonaProfiles, normalizeStoryPresentationMode } from '../src/storage/settings'
import { DEFAULT_PERSONA, DEFAULT_PERSONA_ID } from '../src/providers/config'
import { parsePersonaSpriteFilename } from '../src/providers/personaSprites'
import { defaultZoneFromViewport, isInZone, newZoneFromViewport, replaceOfflineZoneBounds } from '../src/storage/offlineZones'
import { offlineIndexKey, searchOfflineIndex, writeOfflineIndex } from '../src/providers/offlineIndex'
import { enumerateZoneTiles, loadOpenFreeMapTileSource, runCache, tileUrl, type TileJob } from '../src/providers/offlineCache'
import { MAX_OFFLINE_TILES, selectTileEvictions } from '../src/providers/offlineTileCache'
import { placesFromVectorTile } from '../src/providers/vectorTilePlaces'
import { PbfWriter } from 'pbf'
import type { ChatEntry, JourneyLeg, Place } from '../src/types/domain'

const place = (id: string, name: string, category?: string): Place => ({ id, name, category, coordinates: [2.35, 48.85], source: 'map' })

function pointVectorTile(name: string) {
  const tile = new PbfWriter()
  tile.writeMessage(3, (_layer, writer) => {
    writer.writeStringField(1, 'places')
    writer.writeMessage(2, (_feature, feature) => {
      feature.writeVarintField(1, 1)
      feature.writePackedVarint(2, [0, 0])
      feature.writeVarintField(3, 1)
      feature.writePackedVarint(4, [9, 4096, 4096])
    }, {})
    writer.writeStringField(3, 'name')
    writer.writeMessage(4, (_value, value) => value.writeStringField(1, name), {})
    writer.writeVarintField(5, 4096)
    writer.writeVarintField(15, 2)
  }, {})
  return tile.finish()
}

function polygonVectorTile(name: string) {
  const tile = new PbfWriter()
  tile.writeMessage(3, (_layer, writer) => {
    writer.writeStringField(1, 'places')
    writer.writeMessage(2, (_feature, feature) => {
      feature.writePackedVarint(2, [0, 0, 1, 1])
      feature.writeVarintField(3, 3)
      feature.writePackedVarint(4, [9, 3584, 3584, 34, 1024, 0, 0, 1024, 1023, 0, 15])
    }, {})
    writer.writeStringField(3, 'name')
    writer.writeStringField(3, 'class')
    writer.writeMessage(4, (_value, value) => value.writeStringField(1, name), {})
    writer.writeMessage(4, (_value, value) => value.writeStringField(1, 'museum'), {})
    writer.writeVarintField(5, 4096)
    writer.writeVarintField(15, 2)
  }, {})
  return tile.finish()
}

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

test('places use localized English names when a vector feature has no default name', () => {
  const mapped = placeFromFeature({
    geometry: { type: 'Point', coordinates: [2.35, 48.85] },
    properties: { 'name:en': 'Central Library' },
  })
  assert.equal(mapped?.name, 'Central Library')
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

test('journey export round-trips journey legs and rejects malformed data', () => {
  const leg: JourneyLeg = {
    id: 'leg-1',
    from: null,
    to: place('current', 'Current'),
    routed: true,
    geometry: [[2.34, 48.84], [2.35, 48.85]],
    distanceMeters: 1500,
    durationSeconds: 1200,
    createdAt: '2026-01-01T00:05:00.000Z',
  }
  const journey = {
    id: 'active' as const,
    personaId: 'wayfinder',
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
    storyProgress: null,
    legs: [leg],
    branches: [{
      id: 'branch-1', label: 'Earlier future', createdAt: '2026-01-02T00:00:00.000Z',
      snapshot: {
        personaId: 'wayfinder', currentDestination: place('current', 'Current'), mapViewport: null, destinationHistory: [place('current', 'Current')], currentScene: 2,
        messages: [{ id: 'm1', role: 'user' as const, text: 'hello', createdAt: '2026-01-01T00:00:00.000Z' }],
        knownPeople: ['Ada'], knownEntities: [], userFacts: ['A fact'], narrativeEvents: [], conversationSummary: '', storyProgress: null, legs: [leg],
      },
    }],
  }
  const restored = parseJourneyJson(JSON.parse(journeyJson(journey)))
  assert.deepEqual(restored, JSON.parse(JSON.stringify(journey)))
  assert.equal(restored.legs?.length, 1)
  assert.equal(restored.legs?.[0].routed, true)
  assert.equal(restored.legs?.[0].geometry?.length, 2)
  assert.equal(restored.branches?.[0].snapshot.legs?.length, 1)

  const legacyJourney = { ...journey }
  delete (legacyJourney as Partial<typeof journey>).personaId
  assert.equal(parseJourneyJson(legacyJourney).personaId, 'wayfinder')

  const withoutLegs = { ...journey }
  delete (withoutLegs as Partial<typeof journey>).legs
  assert.deepEqual(parseJourneyJson(withoutLegs).legs, [])
  const branchWithoutLegs = { ...journey, branches: journey.branches.map((branch) => ({ ...branch, snapshot: { ...branch.snapshot, legs: undefined } })) }
  assert.deepEqual(parseJourneyJson(branchWithoutLegs).branches?.[0].snapshot.legs, [])

  assert.throws(() => parseJourneyJson({ id: 'wrong' }), /invalid id/)
  assert.throws(() => parseJourneyJson({ ...journey, legs: 'not-an-array' }), /invalid legs/)
})

test('journey export preserves conversation history and validates the active conversation', () => {
  const conversationJourney = {
    id: 'active' as const,
    currentDestination: null,
    mapViewport: null,
    destinationHistory: [],
    currentScene: 1,
    messages: [entry('user', 'A saved chat')],
    knownPeople: [],
    knownEntities: [],
    userFacts: [],
    narrativeEvents: [],
    conversationSummary: '',
    storyProgress: null,
    legs: [],
    branches: [],
    activeConversationId: 'thread-1',
    conversations: [{
      id: 'thread-1', title: 'Old title', createdAt: '2026-01-01T00:00:00.000Z',
      messages: [entry('user', 'A saved chat')], narrativeEvents: [], conversationSummary: '', storyProgress: null, branches: [],
    }],
  }
  const restored = parseJourneyJson(JSON.parse(journeyJson(conversationJourney)))
  assert.equal(restored.activeConversationId, 'thread-1')
  assert.equal(restored.conversations?.[0].title, 'A saved chat')
  assert.equal(restored.conversations?.[0].messages[0].text, 'A saved chat')
  assert.throws(() => parseJourneyJson({ ...conversationJourney, activeConversationId: 'missing' }), /invalid active conversation/)
})

const entry = (role: ChatEntry['role'], text: string): ChatEntry => ({ id: text, role, text, createdAt: '2026-01-01T00:00:00.000Z' })
const settings = { llmProvider: 'ollama' as const, llmBaseUrl: '', llmModel: 't', llmApiKey: '', personaName: 'P', personaInstructions: '', onlineGeocoder: 'nominatim' as const, calculateWalkingRoutes: false, routingBaseUrl: '', liveDataEnabled: false, weatherBaseUrl: '', overpassApiUrl: 'https://overpass-api.de/api/interpreter' }
const journey = { destinationHistory: [], currentScene: 1, knownPeople: [], knownEntities: [], userFacts: [], conversationSummary: '' }

test('journey prompt keeps concise roleplay boundaries', () => {
  const system = buildJourneyContext({ settings, selectedPlace: null, journey, userMessage: 'hello', messages: [] })[0].content
  assert.match(system, /Stay in character and treat the user as the traveler/)
  assert.match(system, /Never invent the traveler’s words, thoughts, choices, or actions/)
  assert.match(system, /leave the next action open/)
})

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

test('story history can rewind to a block and trim the active transcript there', () => {
  const first = { ...entry('assistant', 'First: one\\n\\nSecond'), storyTurn: parseStoryResponse(JSON.stringify({ blocks: [
    { type: 'dialogue', speaker: 'First', text: 'one' },
    { type: 'dialogue', speaker: 'Second', text: 'two' },
  ] }), 'turn') }
  const history = [entry('user', 'start'), first, entry('user', 'later'), entry('assistant', 'future')]
  const stops = storyStops(history)

  assert.equal(stops.length, 3)
  assert.equal(storyStopIndex(history, { entryId: first.id, blockIndex: 0 }), 0)
  const trimmed = trimHistoryAtStoryStop(history, stops[0])
  assert.deepEqual(trimmed.map((item) => item.id), ['start', first.id])
  assert.equal(trimmed.at(-1)?.text, 'First: one')
  assert.equal(trimmed.at(-1)?.storyTurn?.blocks.length, 1)
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

test('persona sprite filenames derive stable IDs, labels, and descriptions', () => {
  assert.deepEqual(parsePersonaSpriteFilename('aurelio-sprite-classic.png'), {
    id: 'aurelio', personaName: 'Aurelio', styleName: 'Classic', label: 'Aurelio · Classic', description: 'Classic style portrait for Aurelio.',
  })
  assert.deepEqual(parsePersonaSpriteFilename('sprites/historian-sprite-painterly.webp'), {
    id: 'historian-painterly', personaName: 'Historian', styleName: 'Painterly', label: 'Historian · Painterly', description: 'Painterly style portrait for Historian.',
  })
  assert.equal(parsePersonaSpriteFilename('not-a-sprite.png'), null)
})

test('persona profiles migrate legacy settings and normalize built-in sprite choices', () => {
  const migrated = normalizePersonaProfiles(undefined, { personaName: 'My Guide', personaInstructions: 'Speak gently.' })
  assert.deepEqual(migrated, [{ ...DEFAULT_PERSONA, name: 'My Guide', instructions: 'Speak gently.' }])
  assert.equal(migrated[0].id, DEFAULT_PERSONA_ID)

  const normalized = normalizePersonaProfiles([
    { id: 'wayfinder', name: 'Wayfinder', instructions: 'Default', spriteId: 'aurelio' },
    { id: 'historian', name: 'Historian', instructions: 'Research carefully.', spriteId: 'historian-painterly' },
    { id: 'custom', name: 'Custom', instructions: 'Custom prompt', spriteId: 'not-a-sprite' },
  ], undefined, ['aurelio', 'historian-painterly'])
  assert.equal(normalized[1].spriteId, 'historian-painterly')
  assert.equal(normalized[2].spriteId, DEFAULT_PERSONA.spriteId)
  assert.equal(normalizePersonaProfiles([]).length, 1)
})

test('story presentation settings accept supported modes and default invalid values to novel', () => {
  assert.equal(normalizeStoryPresentationMode('novel'), 'novel')
  assert.equal(normalizeStoryPresentationMode('visual-novel'), 'visual-novel')
  assert.equal(normalizeStoryPresentationMode('chat'), 'chat')
  assert.equal(normalizeStoryPresentationMode('unknown'), 'novel')
})

test('motion preference accepts on, auto, and off and defaults invalid values to auto', () => {
  assert.equal(normalizeMotionPreference('on'), 'on')
  assert.equal(normalizeMotionPreference('auto'), 'auto')
  assert.equal(normalizeMotionPreference('off'), 'off')
  assert.equal(normalizeMotionPreference(undefined), 'auto')
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

test('offline zone defaults from viewport and contains points inside its bounds', () => {
  const base = defaultZoneFromViewport([2.35, 48.85], 11, 15)
  assert.equal(base.maxZoom, 15)
  assert.equal(base.bounds[0] < 2.35 && base.bounds[2] > 2.35, true)
  assert.equal(base.bounds[1] < 48.85 && base.bounds[3] > 48.85, true)

  const zone = newZoneFromViewport([2.35, 48.85], 11, 15)
  assert.equal(typeof zone.id, 'string')
  assert.equal(zone.status, 'idle')
  assert.equal(zone.cachedBytes, 0)
  assert.equal(isInZone(zone, [2.35, 48.85]), true)
  assert.equal(isInZone(zone, [2.35 + base.bounds[2] - base.bounds[0], 48.85]), false)
})

test('offline index search reports empty when no zone is provided or storage is unavailable', async () => {
  const noZone = await searchOfflineIndex(null, 'anything')
  assert.equal(noZone.source, 'not-indexed')
  assert.deepEqual(noZone.places, [])

  // In the Node test runner there is no IndexedDB, so offline search reports the storage failure.
  const zone = newZoneFromViewport([2.35, 48.85], 11, 15)
  const withZone = await searchOfflineIndex(zone, 'anything')
  assert.equal(withZone.source, 'unavailable')
  assert.deepEqual(withZone.places, [])
  assert.match(withZone.error ?? '', /IndexedDB is unavailable/)
})

test('offline vector tile extraction indexes named point features only inside the zone', () => {
  const zone = { ...newZoneFromViewport([0, 0], 11, 0), bounds: [-1, -1, 1, 1] as [number, number, number, number] }
  const tile = pointVectorTile('Tile Center Place')
  const places = placesFromVectorTile(tile, { z: 0, x: 0, y: 0 }, zone)
  assert.deepEqual(places.map((item) => item.name), ['Tile Center Place'])

  const outsideZone = { ...zone, bounds: [10, 10, 11, 11] as [number, number, number, number] }
  assert.deepEqual(placesFromVectorTile(tile, { z: 0, x: 0, y: 0 }, outsideZone), [])
})

test('high-zoom polygon places make it into the completed offline search index', async () => {
  const zone = { ...newZoneFromViewport([0, 0], 11, 16), bounds: [-180, -85, 180, 85] as [number, number, number, number] }
  let persisted: Place[] = []
  const result = await runCache(zone, {
    enumerate: () => [{ z: 16, x: 33192, y: 22500 }],
    fetchTile: async (tile) => placesFromVectorTile(polygonVectorTile('High-zoom Museum'), tile, zone),
    persistIndex: async (places) => { persisted = places },
  })

  assert.equal(result.status, 'ready')
  assert.equal(result.indexedFeatures, 1)
  assert.deepEqual(persisted.map((item) => item.name), ['High-zoom Museum'])
  assert.equal(Number.isFinite(persisted[0].coordinates[0]) && Number.isFinite(persisted[0].coordinates[1]), true)
})

test('offline zone tile enumeration rejects sampled coverage instead of omitting tiles', () => {
  const zone = { ...newZoneFromViewport([0, 0], 11, 5), bounds: [-180, -85, 180, 85] as [number, number, number, number] }
  assert.throws(() => enumerateZoneTiles(zone), /Reduce the zone or maximum zoom/)
})

test('offline caching uses the current versioned tile template and source maximum zoom', async () => {
  const source = await loadOpenFreeMapTileSource(async () => new Response(JSON.stringify({
    tiles: ['https://tiles.openfreemap.org/planet/20261115_080022_pt/{z}/{x}/{y}.pbf'],
    maxzoom: 14,
  })))
  const zone = { ...newZoneFromViewport([2.35, 48.85], 11, 16), bounds: [2.3, 48.8, 2.4, 48.9] as [number, number, number, number] }
  const jobs = enumerateZoneTiles(zone, source.maxZoom)

  assert.equal(jobs.at(-1)?.z, 14)
  assert.equal(tileUrl({ z: 14, x: 8299, y: 5636 }, source.tileTemplate), 'https://tiles.openfreemap.org/planet/20261115_080022_pt/14/8299/5636.pbf')
})

test('offline zone tile enumeration includes every tile at each zoom level', () => {
  const zone = { ...newZoneFromViewport([0, 0], 11, 1), bounds: [-1, -1, 1, 1] as [number, number, number, number] }
  const jobs = enumerateZoneTiles(zone)
  assert.deepEqual(jobs.filter((job) => job.z === 0), [{ z: 0, x: 0, y: 0 }])
  assert.deepEqual(jobs.filter((job) => job.z === 1), [
    { z: 1, x: 0, y: 0 },
    { z: 1, x: 0, y: 1 },
    { z: 1, x: 1, y: 0 },
    { z: 1, x: 1, y: 1 },
  ])
})

test('offline cache persists the deduplicated index from every enumerated tile before reporting ready', async () => {
  const zone = newZoneFromViewport([2.35, 48.85], 11, 1)
  const jobs: TileJob[] = [{ z: 0, x: 0, y: 0 }, { z: 1, x: 1, y: 1 }]
  let persisted: Place[] | null = null
  const result = await runCache(zone, {
    enumerate: () => jobs,
    fetchTile: async (job) => job.z === 0
      ? [place('shared', 'Shared Place'), place('first', 'First Tile Place')]
      : [place('shared', 'Shared Place'), place('second', 'Second Tile Place')],
    persistIndex: async (places) => { persisted = places },
    concurrency: 1,
  })

  assert.equal(result.status, 'ready')
  assert.equal(result.done, jobs.length)
  assert.equal(result.featuresFound, 3)
  assert.equal(result.indexedFeatures, 3)
  assert.deepEqual(persisted?.map((item) => item.name), ['Shared Place', 'First Tile Place', 'Second Tile Place'])
})

test('offline cache never reports ready or persists an index when a zone tile fails', async () => {
  const zone = newZoneFromViewport([2.35, 48.85], 11, 1)
  const jobs: TileJob[] = [{ z: 0, x: 0, y: 0 }, { z: 1, x: 1, y: 1 }]
  let persistCalled = false
  const result = await runCache(zone, {
    enumerate: () => jobs,
    fetchTile: async (job) => {
      if (job.z === 1) throw new Error('tile unavailable')
      return [place('found', 'Found Place')]
    },
    persistIndex: async () => { persistCalled = true },
    concurrency: 1,
  })

  assert.equal(result.status, 'partial')
  assert.equal(result.failed, 1)
  assert.equal(result.featuresFound, 1)
  assert.equal(result.indexedFeatures, 0)
  assert.match(result.error ?? '', /previous complete index was retained/)
  assert.equal(persistCalled, false)
})

test('offline cache reports index persistence failures instead of claiming readiness', async () => {
  const zone = newZoneFromViewport([2.35, 48.85], 11, 0)
  const result = await runCache(zone, {
    enumerate: () => [{ z: 0, x: 0, y: 0 }],
    fetchTile: async () => [place('found', 'Found Place')],
    persistIndex: async () => { throw new Error('IndexedDB quota exceeded') },
  })

  assert.equal(result.status, 'failed')
  assert.equal(result.indexedFeatures, 0)
  assert.equal(result.error, 'IndexedDB quota exceeded')
})

test('offline index keys distinguish exact zone bounds and zoom levels', () => {
  const zone = newZoneFromViewport([2.35, 48.85], 11, 15)
  assert.notEqual(offlineIndexKey(zone), offlineIndexKey({ ...zone, bounds: [2.35001, ...zone.bounds.slice(1)] as [number, number, number, number] }))
  assert.notEqual(offlineIndexKey(zone), offlineIndexKey({ ...zone, maxZoom: zone.maxZoom - 1 }))
})

test('offline index persistence failures are surfaced to the cache workflow', async () => {
  const zone = newZoneFromViewport([2.35, 48.85], 11, 15)
  await assert.rejects(writeOfflineIndex(zone, []), /IndexedDB is unavailable/)
})

test('tile eviction removes only the oldest unpinned tiles and preserves shared zone references', () => {
  const cached = ['tile-1', 'tile-2', 'tile-3', 'tile-4']
  const pinned = new Set(['tile-2', 'tile-4'])
  assert.deepEqual(selectTileEvictions(cached, pinned, 2), ['tile-1', 'tile-3'])
  assert.throws(() => selectTileEvictions(cached, new Set(cached), 2), /pinned by saved zones/)
  assert.equal(MAX_OFFLINE_TILES > 0, true)
})

test('editing offline zone bounds invalidates its cache and rejects invalid coordinates', () => {
  const zone = {
    ...newZoneFromViewport([2.35, 48.85], 11, 15),
    status: 'ready' as const,
    cachedBytes: 300,
    cachedTileCount: 6,
    cachedTileUrls: ['https://tiles.test/old'],
    cacheGeneration: 'old-generation',
    indexedFeatureCount: 12,
  }
  const updated = replaceOfflineZoneBounds(zone, [2.3, 48.8, 2.4, 48.9])
  assert.equal(updated?.status, 'idle')
  assert.equal(updated?.cacheGeneration, undefined)
  assert.equal(updated?.cachedTileUrls, undefined)
  assert.equal(updated?.indexedFeatureCount, undefined)
  assert.deepEqual(updated?.bounds, [2.3, 48.8, 2.4, 48.9])
  assert.equal(replaceOfflineZoneBounds(zone, [2.4, 48.8, 2.3, 48.9]), null)
})

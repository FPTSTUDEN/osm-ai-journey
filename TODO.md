# Project TODO

The phases below are ordered around a usable single-user MVP. Each phase should leave the app runnable as a static deployment.

## Phase 0: Foundation

- [x] Vite + React + TypeScript scaffold
- [x] Responsive map and chat shell
- [x] MapLibre and OpenFreeMap integration
- [x] Browser settings persistence
- [x] Initial service worker and map-resource caching
- [x] Product and architecture documentation

## Phase 1: Local Map Exploration

- [ ] Extract and normalize place features from loaded vector tiles
- [ ] Improve local place indexing and fuzzy matching
- [ ] Deduplicate features across vector tiles
- [ ] Add selected-place marker and map fly-to behavior
- [ ] Add destination detail panel with coordinates and OSM metadata
- [ ] Add clear local-search states for loading, empty, and unavailable data
- [ ] Verify OpenFreeMap attribution and provider configuration

## Phase 2: Online Search and Destination Context

- [ ] Add explicit online-search flow after local results are exhausted
- [ ] Implement geocoder provider interface
- [ ] Add Nominatim adapter with rate-limit-aware requests
- [ ] Add Photon adapter option
- [ ] Cache online geocoder results in IndexedDB
- [ ] Add cache-key normalization and expiry behavior
- [ ] Add Wikipedia destination enrichment
- [ ] Add Wikidata structured-fact enrichment
- [ ] Label source-backed, cached, live, and user-created information

## Phase 3: Journey State

- [ ] Define persistent journey, destination, scene, and narrative event schemas
- [ ] Add IndexedDB storage boundary
- [ ] Persist and restore the active journey
- [ ] Track current destination and destination history
- [ ] Track current scene, known people, entities, and user-created facts
- [ ] Add destination transition events
- [ ] Add journey reset and delete controls

## Phase 4: LLM Roleplay

- [ ] Implement the unified OpenAI-compatible provider contract
- [ ] Add streaming chat responses
- [ ] Support OpenAI, Ollama, LM Studio, vLLM, and compatible base URLs
- [ ] Add provider connection test and clear error states
- [ ] Add user-created persona editor
- [ ] Build context assembly from place, journey state, and conversation history
- [ ] Keep normal chat available when no destination is selected
- [ ] Preserve user freedom while keeping map and narrative transitions consistent
- [ ] Add conversation summarization for long journeys

## Phase 5: Walking Journeys

- [ ] Implement routing provider interface
- [ ] Add OSRM or OpenRouteService walking adapter
- [ ] Add route preview and route geometry on the map
- [ ] Allow route calculation to be skipped per transition
- [ ] Add configurable default route preference
- [ ] Continue the journey when routing is unavailable or fails
- [ ] Add route and unrouted transition narrative events

## Phase 6: Optional Live Data

- [ ] Add provider settings for live data integrations
- [ ] Add weather adapter as the first optional integration
- [ ] Fetch live data only when enabled and requested
- [ ] Cache live responses with explicit freshness metadata
- [ ] Add optional opening-hours, events, transport, and travel adapters
- [ ] Ensure the AI distinguishes current data from cached and static facts

## Phase 7: Offline and Deployment Polish

- [ ] Cache application shell assets through the service worker
- [ ] Cache recently viewed map styles, glyphs, sprites, and tiles
- [ ] Add cache versioning and cleanup
- [ ] Add cache status and clear-cache controls
- [ ] Test the app while offline with previously viewed areas
- [ ] Evaluate bounded area downloads against OpenFreeMap limits
- [ ] Add PMTiles support if stronger offline maps are required
- [ ] Add deployment instructions for GitHub Pages or Cloudflare Pages
- [ ] Add privacy guidance for browser-stored API keys

## Phase 8: Quality

- [ ] Add unit tests for provider adapters and local search
- [ ] Add journey-state transition tests
- [ ] Add browser tests for the core destination-to-roleplay flow
- [ ] Test responsive layouts at mobile, tablet, and desktop widths
- [ ] Test keyboard navigation and screen-reader labels
- [ ] Add provider failure and offline scenarios to the test matrix
- [ ] Reduce the initial bundle with code splitting where useful
- [ ] Review npm audit findings and dependency updates

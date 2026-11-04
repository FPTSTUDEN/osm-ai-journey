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

- [x] Extract and normalize place features from loaded vector tiles
- [x] Improve local place indexing and fuzzy matching
- [x] Deduplicate features across vector tiles
- [x] Add selected-place marker and map fly-to behavior
- [x] Add destination detail panel with coordinates and OSM metadata
- [x] Add clear local-search states for loading, empty, and unavailable data
- [x] Verify OpenFreeMap attribution and provider configuration

## Phase 2: Online Search and Destination Context

- [x] Add explicit online-search flow after local results are exhausted
- [x] Implement geocoder provider interface
- [x] Add Nominatim adapter with rate-limit-aware requests
- [x] Add Photon adapter option
- [x] Cache online geocoder results in IndexedDB
- [x] Add cache-key normalization and expiry behavior
- [x] Add Wikipedia destination enrichment
- [x] Add Wikidata structured-fact enrichment
- [x] Add illustrative destination photos with source metadata
- [x] Feed photo post metadata to the AI without sending image pixels
- [x] Label source-backed, cached, live, and user-created information

## Phase 3: Journey State

- [x] Define persistent journey, destination, scene, and narrative event schemas
- [x] Add IndexedDB storage boundary
- [x] Persist and restore the active journey
- [x] Track current destination and destination history
- [x] Track current scene, known people, entities, and user-created facts
- [x] Add destination transition events
- [x] Add journey reset and delete controls

## Phase 4: LLM Roleplay

- [x] Implement the unified OpenAI-compatible provider contract
- [x] Add streaming chat responses
- [x] Support OpenAI, Ollama, LM Studio, vLLM, and compatible base URLs
- [x] Add provider connection test and clear error states
- [x] Add user-created persona editor
- [x] Build context assembly from place, journey state, and conversation history
- [x] Keep normal chat available when no destination is selected
- [x] Preserve user freedom while keeping map and narrative transitions consistent
- [x] Add conversation summarization for long journeys

## Phase 5: Walking Journeys

- [x] Implement routing provider interface
- [x] Add OSRM or OpenRouteService walking adapter
- [x] Add route preview and route geometry on the map
- [x] Allow route calculation to be skipped per transition
- [x] Add configurable default route preference
- [x] Continue the journey when routing is unavailable or fails
- [x] Add route and unrouted transition narrative events

## Phase 6: Optional Live Data

- [x] Add provider settings for live data integrations
- [x] Add weather adapter as the first optional integration
- [x] Fetch live data only when enabled and requested
- [x] Cache live responses with explicit freshness metadata
- [ ] Add optional opening-hours, events, transport, and travel adapters
- [x] Ensure the AI distinguishes current data from cached and static facts

## Phase 7: Offline and Deployment Polish

- [x] Cache application shell assets through the service worker
- [x] Cache recently viewed map styles, glyphs, sprites, and tiles
- [x] Add cache versioning and cleanup
- [x] Add cache status and clear-cache controls
- [x] Test the app while offline with previously viewed areas
- [x] Evaluate bounded area downloads against OpenFreeMap limits
- [ ] Add PMTiles support if stronger offline maps are required
- [x] Add deployment instructions for GitHub Pages or Cloudflare Pages
- [x] Add privacy guidance for browser-stored API keys

## Phase 8: Quality

- [x] Add unit tests for provider adapters and local search
- [x] Add journey-state transition tests
- [x] Add browser tests for the core destination-to-roleplay flow
- [x] Test responsive layouts at mobile, tablet, and desktop widths
- [x] Test keyboard navigation and screen-reader labels
- [x] Add provider failure and offline scenarios to the test matrix
- [x] Reduce the initial bundle with code splitting where useful
- [x] Review npm audit findings and dependency updates

## Immersive redesign (implemented)

The interface follows [mockups/05-two-characters.html](./mockups/05-two-characters.html) and [mockups/06-map-and-destination-panels.html](./mockups/06-map-and-destination-panels.html), without changing journey state or provider contracts.

- [x] Keep the scene and narration as a stable, full-screen stage behind navigation panels.
- [x] Make Map, Place, and Journal/Travelogue dock actions explicitly open and close their panels; do not change layout on focus or blur.
- [x] Show the interactive map in a compact panel while the scene stage remains visible, retaining search, place selection, and route flows.
- [x] Show destination context and nearby photos in a separate panel; selecting a photo updates the scene art and keeps its source attribution available.
- [x] Allow Map and Place panels to remain open together; closing one must not implicitly close the other.
- [x] Keep narration and the chat composer available without losing their state when panels open or close.
- [x] Make dock and panel placement responsive and keyboard-accessible; ensure the map redraws correctly when its panel is resized.
- [x] Add UI coverage for explicit panel toggles, simultaneous panels, close behavior, focus/blur stability, and narrow screens.

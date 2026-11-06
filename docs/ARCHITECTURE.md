# Architecture

## Shape

The initial app is a static Vite + React + TypeScript application. It has no required backend, account system, or hosted database. User configuration and journey state are stored locally in the browser.

```text
React UI
  -> journey state
  -> provider adapters
  -> IndexedDB / Cache Storage

Provider adapters
  -> OpenFreeMap / MapLibre
  -> local tile-derived place index
  -> optional geocoder
  -> Wikipedia / Wikidata
  -> Wikimedia Commons destination photos and post metadata
  -> optional Open-Meteo weather and Overpass hours/transit-stop data
  -> optional user-selected local PMTiles archive
  -> optional walking router
  -> OpenAI-compatible or local LLM
```

## Provider contracts

External services must be behind small interfaces. The UI should not know whether a result came from Nominatim, Photon, OpenRouteService, Ollama, or a hosted OpenAI-compatible endpoint.

- `MapProvider`: map style, vector tiles, attribution, and tile cache configuration.
- `LocalPlaceIndex`: searchable features extracted from loaded vector tiles.
- `GeocoderProvider`: explicit online search only.
- `EnrichmentProvider`: Wikipedia/Wikidata destination context.
- `ImageProvider`: illustrative destination images plus source post metadata.
- `LiveDataProvider`: optional weather, opening-hours schedules, or nearby OSM transit stops.
- `RoutingProvider`: optional walking route calculation.
- `LLMProvider`: streaming chat using an OpenAI-compatible request shape.

Assistant replies request one JSON object containing ordered narration, dialogue, and scene blocks. The app normalizes that into a `StoryTurn`; plain-text, malformed, or unsupported responses become a single prose block without requiring provider-specific structured-output APIs. Structured stream content is buffered until it can be parsed so raw JSON is not shown; plain-text fallback can stream directly. The existing `ChatEntry.text` remains a readable flattened form for current UI, conversation history, and summaries.

## Map and tile strategy

MapLibre uses OpenFreeMap's public vector style initially. A user may instead select a local raster or vector `.pmtiles` file; the archive stays in the browser session and is not uploaded or persisted. The local vector style is intentionally generic, recognizes common water/land/building/road source layers, and omits labels to avoid glyph-network requests. OpenFreeMap attribution remains visible for the hosted map; local map display credits OpenStreetMap contributors.

`queryRenderedFeatures` is used for click selection. The local search index is populated opportunistically from loaded source features using `querySourceFeatures`, then normalized and deduplicated in memory. It is not a global place database. Empty local results expose an explicit online-search action.

## Persistence

- `localStorage`: provider settings, feature toggles, UI preferences, and the app-wide story presentation mode (`novel`, `visual-novel`, or `chat`). Invalid or missing mode values normalize to `novel`.
- IndexedDB: journey records, chat messages, destination snapshots, and online geocoder results.
- Cache Storage: static assets and recently viewed map resources through the service worker.
- Local PMTiles archives: held as a selected browser `File` for the current session; no server or cache copy is created.

The current scaffold includes a small storage boundary; full journey persistence can be added without coupling components to browser APIs.

Destination photos are illustrative only. Photo titles, captions, authors, dates, and source links are passed to the language model as source-backed metadata; image pixels are not sent to the model.

## Journey state

Journey state is intentionally soft. It coordinates map and narrative consistency without preventing free-form roleplay.

- Current destination and coordinates
- Destination history and optional walking route
- Current scene
- Active persona
- Known people and entities
- User-created facts
- Source-backed destination context
- Illustrative destination photos and their written source metadata
- Narrative events and conversation summary
- Ordered `StoryTurn` blocks on assistant messages, with per-turn block IDs and speaker identity for dialogue
- Suggested actions, which are never required

Older persisted assistant messages are normalized to one prose block on read. Structured turns also retain flattened text so existing context and summarization paths continue to work. The presentation selector changes only rendering: Novel keeps the existing text-first dialogue/log; Visual novel stages the latest turn with narration, dialogue nameplates, and character portrait/placeholder slots; Chat renders the full history as avatar bubbles with distinct narration and scene events. The uploaded persona image appears in Visual novel and Chat when its speaker matches the configured persona. The selected mode is an app-wide local preference, not per-journey state.

## Static-hosting constraints

Browser-configured API keys are not secrets. The private single-user mode is acceptable for user-owned keys, but shared credentials must not be bundled into the static build. Direct browser providers must support CORS. Overpass requests are only sent after the user asks for nearby data; the request contains the destination coordinates and name. A future Cloudflare Worker, Netlify Function, or other small proxy can be added without changing the provider contracts.

## Directory layout

```text
src/
  components/       UI and map components
  features/         destination, journey, and roleplay logic
  providers/        external service contracts and defaults
  storage/          local browser persistence
  types/            shared domain types
  styles/           visual system
```

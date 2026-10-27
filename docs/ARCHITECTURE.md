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
  -> optional live data
  -> optional walking router
  -> OpenAI-compatible or local LLM
```

## Provider contracts

External services must be behind small interfaces. The UI should not know whether a result came from Nominatim, Photon, OpenRouteService, Ollama, or a hosted OpenAI-compatible endpoint.

- `MapProvider`: map style, vector tiles, attribution, and tile cache configuration.
- `LocalPlaceIndex`: searchable features extracted from loaded vector tiles.
- `GeocoderProvider`: explicit online search only.
- `EnrichmentProvider`: Wikipedia/Wikidata destination context.
- `LiveDataProvider`: optional weather, hours, events, or transport data.
- `RoutingProvider`: optional walking route calculation.
- `LLMProvider`: streaming chat using an OpenAI-compatible request shape.

## Map and tile strategy

MapLibre uses OpenFreeMap's public vector style initially. OpenFreeMap is replaceable through configuration and attribution remains visible. The service worker will cache application assets and recently requested map resources. Explicit offline-area downloads are not part of the first slice because provider download terms and browser request headers need to be handled carefully.

`queryRenderedFeatures` is used for click selection. The local search index is populated opportunistically from loaded source features using `querySourceFeatures`, then normalized and deduplicated in memory. It is not a global place database. Empty local results expose an explicit online-search action.

## Persistence

- `localStorage`: provider settings, feature toggles, and UI preferences.
- IndexedDB: journey records, chat messages, destination snapshots, and online geocoder results.
- Cache Storage: static assets and recently viewed map resources through the service worker.

The current scaffold includes a small storage boundary; full journey persistence can be added without coupling components to browser APIs.

## Journey state

Journey state is intentionally soft. It coordinates map and narrative consistency without preventing free-form roleplay.

- Current destination and coordinates
- Destination history and optional walking route
- Current scene
- Active persona
- Known people and entities
- User-created facts
- Source-backed destination context
- Narrative events and conversation summary
- Suggested actions, which are never required

## Static-hosting constraints

Browser-configured API keys are not secrets. The private single-user mode is acceptable for user-owned keys, but shared credentials must not be bundled into the static build. Direct browser providers must support CORS. A future Cloudflare Worker, Netlify Function, or other small proxy can be added without changing the provider contracts.

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

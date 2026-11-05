# Architecture Decisions

## Static first

The app is a static client because it is single-user, has no accounts, and can persist configuration and journeys locally. This keeps deployment simple and makes local model endpoints practical.

## OpenFreeMap first

OpenFreeMap provides a free OpenStreetMap-based vector map with no API key for the initial public instance. Its public service has no SLA, so map configuration remains replaceable.

## Local-first place search

Geocoding is relatively expensive and often rate-limited. Loaded vector tiles already contain useful place names and categories, so map clicks and local search avoid network calls. Online search is an explicit fallback and its results are cached.

## Optional routing

Narrative movement should not depend on routing availability. Users can skip walking route calculation for a transition, and the journey remains valid with only a destination change and narrative event.

## Optional live data

Live integrations are useful but add API keys, quotas, freshness concerns, and failure modes. They are configured and fetched only when explicitly enabled or requested.

Opening-hours schedules and nearby public-transport stop locations use the public Overpass API with a configurable endpoint and a bounded cache. These are source tags and stop locations only, not computed open/closed state or live departure times. Event listings are deferred because there is no suitable global no-key provider selected; credentialed or regional integrations need a separate provider decision.

## Local offline maps

Users can choose a local PMTiles archive instead of OpenFreeMap for the current browser session. The app does not bundle a global archive or upload/persist a user's file. The generic vector style omits labels to avoid a remote glyph dependency.

## Map is panel-only

The map is rendered only inside an explicitly opened Map panel. It is never a scene background; destination photos are illustrative scene art and retain source attribution.

## Structured chat messages

Conversation entries store explicit `user`, `assistant`, or `event` roles with stable IDs and timestamps. Role inference from array position is reserved for migration of legacy journey data.

## Browser-local companion art

Uploaded companion illustrations are stored as image Blobs in IndexedDB and never uploaded. The feature is off by default, uses a dedicated store, and accepts only JPEG, PNG, and WebP files.

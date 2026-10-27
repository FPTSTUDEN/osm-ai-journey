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

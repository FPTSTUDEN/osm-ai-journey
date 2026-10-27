# Product Brief

## Vision

Osm AI Journey turns map exploration into an open-ended narrative journey. A user can choose a real destination, learn about it, and roleplay with a user-created AI persona in a scenario grounded in the place. The journey can move between destinations without forcing the user into a fixed game path.

## MVP experience

1. The user opens a responsive map and chat workspace.
2. They click a visible place or search locally within loaded map data.
3. The app shows OSM-derived place information and optional Wikipedia/Wikidata context.
4. The user creates or selects a persona and starts a scene.
5. The AI maintains the current place, scene, people, and journey history while allowing normal conversation.
6. The user can move to another destination, with or without calculating a walking route.
7. The map and narrative update together, but user intent always wins over suggested actions.

## Interaction rules

- No destination is required to chat with the AI.
- A map click uses loaded vector-tile features and does not make a geocoding request.
- Search first checks a session-local index derived from loaded vector tiles.
- An explicit `Search online` action is required before calling Nominatim, Photon, or another geocoder.
- Online geocoder responses are cached in IndexedDB and reused for repeated searches.
- Route calculation is opt-in per transition and may be disabled as a default setting.
- Live data such as weather, hours, events, and transport is disabled unless configured and requested.
- AI suggestions are never mandatory; users may reject, revise, or skip them.

## MVP non-goals

- Accounts, collaboration, social sharing, or server-side synchronization.
- Centralized API keys or a shared multi-user quota.
- Transit routing.
- Real-time events or comprehensive travel booking.
- Safety or moderation workflows beyond basic provider error handling.

## Data boundaries

The UI must distinguish between source-backed facts, cached facts, current live data, and user-created narrative details. The model should not present cached or static information as live information.

## Later opportunities

- Optional serverless proxy for providers that do not support browser CORS or should not expose keys.
- PMTiles or bounded offline-area downloads.
- Cloud synchronization without changing the journey state model.
- More routing modes and richer live travel data.

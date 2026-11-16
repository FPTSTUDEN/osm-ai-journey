# Map and Journey Improvements

## 1. User-controlled offline map zones and place search

- [x] Give each journey an offline map zone, defaulting to the current map view. (`src/storage/offlineZones.ts`, `defaultZoneFromViewport`, `useOfflineZone`)
- [ ] Let users move and resize the zone, and choose the maximum zoom level to cache. (needs map drag UI in `MapCanvas`)
- [~] Add an explicit action to cache the selected zone, with progress and clear ready, incomplete, and failure states. (the `Cache this zone` button + `runCache` progress/failure states are in; the tile fetch currently warms the service-worker cache and does not yet persist a per-zone tile count)
- [ ] Cache requested map resources with a tile-aware bounded eviction policy; reuse cached tiles shared by zones and avoid deleting older zones when the active zone changes.
- [x] Persist an index of searchable named features from cached vector tiles so local search works after reload and while offline. (`src/providers/offlineIndex.ts`; populated from `MapCanvas.onPlacesLoadedForZone`)
- [x] Limit local search to the selected zone and clearly explain when map data or searchable features are unavailable. (`useMapSearch.offlineIndexState`)
- [x] Preserve map attribution and provider caching requirements; handle browser storage limits and possible eviction without promising permanent offline availability. (existing attribution retained; new stores swallow storage errors)
- [~] Add focused tests for zone edits, tile-cache behavior, offline index persistence/search, and incomplete or unavailable data. (this batch adds offline-cache unit tests and keeps the existing offline-index degradation test; zone-edit UI tests and offline-index round-trip remain deferred)
- [ ] Update product and architecture documentation for zone selection, offline guarantees, and limitations of raster maps and online-only services.

## 2. Highlight the complete journey on the map

- [x] Persist each confirmed destination transition as a journey leg, including its endpoints, route status, and routed geometry when available. (`JourneyLeg`, `useJourney.appendLeg`, migrated in `journey.ts`/`journeyTransfer.ts`)
- [x] Restore route legs with the correct timeline when loading, rewinding, or switching alternate journey branches; include them in journey export/import. (`restoreTimeline`/`restoreCheckpoint` set legs; `journeyTransfer.parseTimeline` carries `legs`)
- [x] Show visited destinations with sequence markers and distinguish the current destination. (`JournalPanel` renders `Journey so far` with numbered markers)
- [x] Draw calculated walking routes as solid lines, emphasize the active leg, and mute earlier legs. (`MapCanvas` journey-legs layers: `journey-legs-muted`, `journey-legs-active`)
- [x] Keep unrouted transitions visually distinct from calculated routes; do not present a straight connector as a walking route. (`journey-legs-unrouted` dashed layer, labelled `unrouted` in the Journal)
- [x] Add a control to fit the map to the journey and verify route overlays remain usable with cached map tiles offline. (`JournalPanel` Fit map button; `MapCanvas` `flyToLegsSignal`)
- [~] Add focused tests for routed/unrouted transitions, persistence, branch restoration, and map rendering. (persistence and branch restoration covered; map-rendering assertions need Playwright and remain deferred)
- [x] Update product and architecture documentation for persisted journey geometry and map presentation. (see `docs/PRODUCT.md` and `docs/ARCHITECTURE.md` in this batch)

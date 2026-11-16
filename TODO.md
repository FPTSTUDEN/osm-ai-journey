# Map and Journey Improvements

## 1. User-controlled offline map zones and place search

- [x] Give each journey an offline map zone, defaulting to the current map view. (`src/storage/offlineZones.ts`, `defaultZoneFromViewport`)
- [ ] Let users move and resize the zone, and choose the maximum zoom level to cache. (needs map drag UI in `MapCanvas`)
- [ ] Add an explicit action to cache the selected zone, with progress and clear ready, incomplete, and failure states. (state machine exists on `OfflineZone.status`; the tile fetch loop is not implemented)
- [ ] Cache requested map resources with a tile-aware bounded eviction policy; reuse cached tiles shared by zones and avoid deleting older zones when the active zone changes.
- [x] Persist an index of searchable named features from cached vector tiles so local search works after reload and while offline. (`src/providers/offlineIndex.ts`; population from `MapCanvas.onPlacesLoaded` still to be wired)
- [x] Limit local search to the selected zone and clearly explain when map data or searchable features are unavailable. (`useMapSearch.offlineIndexState`)
- [x] Preserve map attribution and provider caching requirements; handle browser storage limits and possible eviction without promising permanent offline availability. (existing attribution retained; new stores swallow storage errors)
- [ ] Add focused tests for zone edits, tile-cache behavior, offline index persistence/search, and incomplete or unavailable data. (this batch adds `offlineZones`/`offlineIndex` unit tests; zone-edit UI tests are deferred with the UI)
- [ ] Update product and architecture documentation for zone selection, offline guarantees, and limitations of raster maps and online-only services.

## 2. Highlight the complete journey on the map

- [x] Persist each confirmed destination transition as a journey leg, including its endpoints, route status, and routed geometry when available. (`JourneyLeg`, `useJourney.appendLeg`, migrated in `journey.ts`/`journeyTransfer.ts`)
- [x] Restore route legs with the correct timeline when loading, rewinding, or switching alternate journey branches; include them in journey export/import. (`restoreTimeline`/`restoreCheckpoint` set legs; `journeyTransfer.parseTimeline` carries `legs`)
- [x] Show visited destinations with sequence markers and distinguish the current destination. (`JournalPanel` renders `Journey so far` with numbered markers)
- [ ] Draw calculated walking routes as solid lines, emphasize the active leg, and mute earlier legs.
- [ ] Keep unrouted transitions visually distinct from calculated routes; do not present a straight connector as a walking route.
- [ ] Add a control to fit the map to the journey and verify route overlays remain usable with cached map tiles offline.
- [ ] Add focused tests for routed/unrouted transitions, persistence, branch restoration, and map rendering. (this batch adds `appendLeg` persistence tests)
- [ ] Update product and architecture documentation for persisted journey geometry and map presentation.

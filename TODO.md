# Map and Journey Improvements

## 1. User-controlled offline map zones and place search

- [x] Give each journey an offline map zone, defaulting to the current map view. (`src/storage/offlineZones.ts`, `defaultZoneFromViewport`, `useOfflineZone`)
- [ ] Let users move and resize the zone, and choose the maximum zoom level to cache. (needs map drag UI in `MapCanvas`; persist the selected bounds and zoom per journey)
- [~] Add an explicit action to cache the selected zone, with progress and clear ready, incomplete, and failure states. (tile and index progress/counts are persisted and ready is gated on a complete index; per-zone durable tile retention and eviction remain in the bounded-cache task)
- [ ] Cache requested map resources with a tile-aware bounded eviction policy; reuse cached tiles shared by zones and avoid deleting older zones when the active zone changes.
- [x] Define the offline-search guarantee: every named point feature exposed by all successfully fetched vector tiles for the selected zone and zoom range is searchable; do not promise features absent from the tile data.
- [x] Persist an index of searchable named features from cached vector tiles so local search works after reload and while offline. (`src/providers/offlineIndex.ts`; written only after complete tile coverage and indexed features are extracted from each tile)
- [x] Build/update the zone's search index from all successfully cached vector tiles, not only features loaded in the visible map viewport; key the index to the exact zone bounds and max zoom.
- [~] Keep cached tiles and the search index in sync when zones are edited, refreshed, or evicted; exact bounds/zoom keys prevent stale or out-of-zone index reuse, and failed refreshes retain the previous complete index. Explicit tile-eviction coordination remains with the bounded cache work.
- [x] Report tile and indexed-feature progress/counts; show `ready` only after all required tiles are fetched and the matching index transaction commits. Surface partial downloads, tile parse errors, storage/quota failures, and unavailable data explicitly.
- [x] Limit local search to the selected zone and clearly explain when map data or searchable features are unavailable. (`useMapSearch.offlineIndexState`)
- [x] Preserve map attribution and provider caching requirements; handle browser storage limits and possible eviction without promising permanent offline availability. (index write/quota failures now surface; browser storage may still evict data)
- [~] Add focused tests for zone edits, tile-cache behavior, offline index persistence/search, and incomplete or unavailable data. (unit and browser coverage now exercise tile parsing, complete coverage, persistence across reload, exact zone keys, and readiness failures; eviction tests remain deferred)
  - [x] Verify features from all enumerated zone tiles are indexed and the index survives reload.
  - [x] Verify indexed results stay within the selected zone and keys reflect exact bounds and max zoom.
  - [x] Verify failed tile downloads or index/storage failures never report the zone as fully ready.
  - [ ] Verify browser refresh and eviction keep the tile cache and search index consistent.
- [~] Update product and architecture documentation for zone selection, the searchable-feature guarantee, and limitations (README documents the guarantee and limits; product/architecture docs remain).

## 2. Highlight the complete journey on the map

- [x] Persist each confirmed destination transition as a journey leg, including its endpoints, route status, and routed geometry when available. (`JourneyLeg`, `useJourney.appendLeg`, migrated in `journey.ts`/`journeyTransfer.ts`)
- [x] Restore route legs with the correct timeline when loading, rewinding, or switching alternate journey branches; include them in journey export/import. (`restoreTimeline`/`restoreCheckpoint` set legs; `journeyTransfer.parseTimeline` carries `legs`)
- [x] Show visited destinations with sequence markers and distinguish the current destination. (`JournalPanel` renders `Journey so far` with numbered markers)
- [x] Draw calculated walking routes as solid lines, emphasize the active leg, and mute earlier legs. (`MapCanvas` journey-legs layers: `journey-legs-muted`, `journey-legs-active`)
- [x] Keep unrouted transitions visually distinct from calculated routes; do not present a straight connector as a walking route. (`journey-legs-unrouted` dashed layer, labelled `unrouted` in the Journal)
- [x] Add a control to fit the map to the journey and verify route overlays remain usable with cached map tiles offline. (`JournalPanel` Fit map button; `MapCanvas` `flyToLegsSignal`)
- [~] Add focused tests for routed/unrouted transitions, persistence, branch restoration, and map rendering. (persistence and branch restoration covered; map-rendering assertions need Playwright and remain deferred)
- [x] Update product and architecture documentation for persisted journey geometry and map presentation. (see `docs/PRODUCT.md` and `docs/ARCHITECTURE.md` in this batch)

# Map and Journey Improvements

## 1. User-controlled offline map zones and place search

- [x] Give each journey an offline map zone, defaulting to the current map view. (`src/storage/offlineZones.ts`, `defaultZoneFromViewport`, `useOfflineZone`)
- [x] Let users move and resize the zone, and choose the maximum zoom level to cache. (map drag handles, editable bounds, and max-zoom slider; edits invalidate prior cache/index metadata)
- [x] Add an explicit action to cache the selected zone, with progress and clear ready, incomplete, and failure states. (tile and index counts persist; ready requires all tiles, the index, and zone manifest to commit)
- [x] Cache requested map resources with a tile-aware bounded eviction policy; reuse cached tiles shared by zones and avoid deleting older zones when the active zone changes. (`offlineTileCache.ts`; 1,200-tile LRU excludes tiles referenced by saved zones)
- [x] Define the offline-search guarantee: every named point feature exposed by all successfully fetched vector tiles for the selected zone and zoom range is searchable; do not promise features absent from the tile data.
- [x] Persist an index of searchable named features from cached vector tiles so local search works after reload and while offline. (`src/providers/offlineIndex.ts`; written only after complete tile coverage and indexed features are extracted from each tile)
- [x] Build/update the zone's search index from all successfully cached vector tiles, not only features loaded in the visible map viewport; key the index to the exact zone bounds and max zoom.
- [x] Keep cached tiles and the search index in sync when zones are edited, refreshed, or evicted; edits invalidate previous manifests/index generations, shared/pinned tiles are retained, and failed refreshes keep the previous complete manifest/index.
- [x] Report tile and indexed-feature progress/counts; show `ready` only after all required tiles are fetched and the matching index transaction commits. Surface partial downloads, tile parse errors, storage/quota failures, and unavailable data explicitly.
- [x] Limit local search to the selected zone and clearly explain when map data or searchable features are unavailable. (`useMapSearch.offlineIndexState`)
- [x] Preserve map attribution and provider caching requirements; handle browser storage limits and possible eviction without promising permanent offline availability. (index write/quota failures now surface; browser storage may still evict data)
- [~] Add focused tests for zone edits, tile-cache behavior, offline index persistence/search, and incomplete or unavailable data. (unit and browser coverage exercise bounds invalidation, tile parsing/coverage, reload persistence, shared tile reuse, and readiness failures; full UI drag and actual eviction integration remain deferred)
  - [x] Verify editing bounds invalidates cached counts, tile references, and index generation.
  - [x] Verify shared tiles are reused and separate saved-zone manifests remain available.
  - [~] Verify map drag handles and browser quota/eviction behavior end to end.
  - [x] Verify features from all enumerated zone tiles are indexed and the index survives reload.
  - [x] Verify indexed results stay within the selected zone and keys reflect exact bounds and max zoom.
  - [x] Verify failed tile downloads or index/storage failures never report the zone as fully ready.
  - [~] Verify browser refresh and eviction keep the tile cache and search index consistent. (unit eviction policy and browser shared-tile manifests are covered; browser quota/eviction integration remains)
- [x] Update product and architecture documentation for zone selection, the searchable-feature guarantee, and limitations. (README, `docs/PRODUCT.md`, and `docs/ARCHITECTURE.md`)
- [x] Fix zero-place indexing for high-zoom vector tiles by indexing named polygon features and localized names; add regression coverage.
- [x] Add separate map-cache status and clearing controls alongside the app cache; clear map indexes and mark affected zones incomplete.
- [x] Enlarge the map panel and make offline-zone tools collapsible so they do not obscure the map.

## 2. Highlight the complete journey on the map

- [x] Persist each confirmed destination transition as a journey leg, including its endpoints, route status, and routed geometry when available. (`JourneyLeg`, `useJourney.appendLeg`, migrated in `journey.ts`/`journeyTransfer.ts`)
- [x] Restore route legs with the correct timeline when loading, rewinding, or switching alternate journey branches; include them in journey export/import. (`restoreTimeline`/`restoreCheckpoint` set legs; `journeyTransfer.parseTimeline` carries `legs`)
- [x] Show visited destinations with sequence markers and distinguish the current destination. (`JournalPanel` renders `Journey so far` with numbered markers)
- [x] Draw calculated walking routes as solid lines, emphasize the active leg, and mute earlier legs. (`MapCanvas` journey-legs layers: `journey-legs-muted`, `journey-legs-active`)
- [x] Keep unrouted transitions visually distinct from calculated routes; do not present a straight connector as a walking route. (`journey-legs-unrouted` dashed layer, labelled `unrouted` in the Journal)
- [x] Add a control to fit the map to the journey and verify route overlays remain usable with cached map tiles offline. (`JournalPanel` Fit map button; `MapCanvas` `flyToLegsSignal`)
- [~] Add focused tests for routed/unrouted transitions, persistence, branch restoration, and map rendering. (persistence and branch restoration covered; map-rendering assertions need Playwright and remain deferred)
- [x] Update product and architecture documentation for persisted journey geometry and map presentation. (see `docs/PRODUCT.md` and `docs/ARCHITECTURE.md` in this batch)

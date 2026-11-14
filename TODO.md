# Map and Journey Improvements

## 1. User-controlled offline map zones and place search

- [ ] Give each journey an offline map zone, defaulting to the current map view.
- [ ] Let users move and resize the zone, and choose the maximum zoom level to cache.
- [ ] Add an explicit action to cache the selected zone, with progress and clear ready, incomplete, and failure states.
- [ ] Cache requested map resources with a tile-aware bounded eviction policy; reuse cached tiles shared by zones and avoid deleting older zones when the active zone changes.
- [ ] Persist an index of searchable named features from cached vector tiles so local search works after reload and while offline.
- [ ] Limit local search to the selected zone and clearly explain when map data or searchable features are unavailable.
- [ ] Preserve map attribution and provider caching requirements; handle browser storage limits and possible eviction without promising permanent offline availability.
- [ ] Add focused tests for zone edits, tile-cache behavior, offline index persistence/search, and incomplete or unavailable data.
- [ ] Update product and architecture documentation for zone selection, offline guarantees, and limitations of raster maps and online-only services.

## 2. Highlight the complete journey on the map

- [ ] Persist each confirmed destination transition as a journey leg, including its endpoints, route status, and routed geometry when available.
- [ ] Restore route legs with the correct timeline when loading, rewinding, or switching alternate journey branches; include them in journey export/import.
- [ ] Show visited destinations with sequence markers and distinguish the current destination.
- [ ] Draw calculated walking routes as solid lines, emphasize the active leg, and mute earlier legs.
- [ ] Keep unrouted transitions visually distinct from calculated routes; do not present a straight connector as a walking route.
- [ ] Add a control to fit the map to the journey and verify route overlays remain usable with cached map tiles offline.
- [ ] Add focused tests for routed/unrouted transitions, persistence, branch restoration, and map rendering.
- [ ] Update product and architecture documentation for persisted journey geometry and map presentation.

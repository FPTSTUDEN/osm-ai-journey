# Architecture

## Offline zone cache and search index

- `offlineZones.ts` persists the active zone and a zone-ID manifest in IndexedDB. Bounds or max-zoom edits clear the zone's cached tile references and index generation.
- `offlineCache.ts` enumerates exact Web Mercator tile coverage. It rejects oversized zones instead of sampling and omitting tiles.
- `offlineTileCache.ts` stores requested vector tiles in a dedicated Cache Storage cache with a 1,200-tile LRU limit. Zone manifests pin referenced tiles; tile URLs shared by zones use one cached response. Unpinned, least-recently-used tiles are evicted first.
- The cache flow extracts named point features from each downloaded vector tile. It writes a generation-keyed index, then commits the matching tile manifest and zone state. A zone is not ready if tile fetching, index persistence, or the manifest commit fails.
- Startup verifies that every tile URL in a ready zone's manifest still exists. The service worker checks this dedicated cache before its general map-resource cache. Clearing offline data removes tile references and marks affected zones incomplete.
- Search reads the index generation associated with the selected bounds and max zoom, then filters results to those bounds. An incomplete zone may still have a usable index, but map tiles must be recached before the zone can be ready again.

The index contains only named point features supplied by the fetched vector tiles. Raster tiles are not searchable, and browser storage quotas or eviction can remove cached data.

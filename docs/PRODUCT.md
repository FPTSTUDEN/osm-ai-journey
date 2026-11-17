# Product Brief

## Offline map zones

Users can adjust the offline zone by dragging its map handles or editing its bounds, and choose a maximum tile zoom. Caching a zone downloads all requested OpenFreeMap vector tiles within the tile limit and builds a local search index from their named point features.

A zone is marked ready only after its tiles, matching search index, and saved zone manifest are committed. Shared tiles are reused across zones, and tiles referenced by saved zones are protected from bounded-cache eviction. Clearing offline map data or detecting missing tiles marks the zone incomplete so it can be refreshed.

Offline search covers named point features present in those vector tiles. It cannot find places omitted from the tile data, features available only in raster maps, or uncached online-geocoder results. Browser storage limits and browser-managed eviction mean offline availability is not permanent.

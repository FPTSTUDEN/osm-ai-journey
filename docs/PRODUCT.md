# Product Brief

## Offline map zones

The uncached default zone follows the current map viewport. Users can adjust the zone by dragging its map handles or editing its bounds, and choose a maximum tile zoom; the selected zone's label, center, and bounds are visible before caching. Caching a zone downloads all requested OpenFreeMap vector tiles within the tile limit and builds a local search index from named point and classified polygon features.

A zone is marked ready only after its tiles, matching search index, and saved zone manifest are committed. Shared tiles are reused across zones, and tiles referenced by saved zones are protected from bounded-cache eviction. Clearing offline map data or detecting missing tiles marks the zone incomplete so it can be refreshed.

Offline search covers named point and classified polygon features present in those vector tiles. It cannot find places omitted from the tile data, features available only in raster maps, or uncached online-geocoder results. Browser storage limits and browser-managed eviction mean offline availability is not permanent. Settings show counts and available size estimates for each offline zone, journey/conversation storage, and other cache categories, with scoped deletion controls and confirmation. Journey reset or deletion exports a JSON backup first. Message text is kept out of the storage overview and remains available through the conversation UI.

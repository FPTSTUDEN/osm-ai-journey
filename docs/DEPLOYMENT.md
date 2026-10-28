# Deployment And Privacy

## Static deployment

The application is a Vite static build. Run `npm run build`, then publish the `dist/` directory to GitHub Pages, Cloudflare Pages, or another static host. The Vite base path is relative, so the generated assets work from a project subpath as well as a domain root.

The service worker is registered only in production. It caches the application shell and recently requested OpenFreeMap resources, serves the shell when a document request fails offline, and removes older `osm-ai-journey-*` cache versions during activation.

## Browser storage

Journey state, provider settings, geocoder results, enrichment responses, weather data, and the offline resource cache remain in the current browser. Clearing site data or using a different browser removes access to that local journey.

API keys are stored in `localStorage` when entered. This is convenient for a single-user local deployment but is not a secure secret store. Do not enter sensitive production keys on a shared computer or deploy a public instance intended for multiple users. Prefer a local Ollama, LM Studio, or vLLM endpoint when possible.

Live weather is opt-in and only requested after enabling live data and asking for current weather. Cached live responses are labeled in the UI and may be stale.

## Map caching limits

The service worker caches resources requested by the normal map viewport. It does not download arbitrary areas in bulk. OpenFreeMap and its upstream data providers have usage and storage limits; bounded area downloads should be evaluated before adding a bulk-download feature. PMTiles remains the stronger option for intentionally packaged offline regions.

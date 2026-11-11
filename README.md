# Osm AI Journey

A static, local-first journey app that combines OpenStreetMap destinations, destination context, an interactive map, and free-form AI roleplay.

## Current status

The app is a client-side Vite/React journey experience with Novel, Visual novel, and Chat presentation modes. Settings and journey data remain in the browser; external providers are optional and replaceable. All modes share ordered story turns, with plain-text fallback when a model does not return structured content.

## Quick start

```bash
pnpm install
pnpm dev
```

Open the local URL printed by Vite. The production build is static:

```bash
pnpm build
pnpm preview
```

Run validation with `pnpm test:unit` and `pnpm test:e2e`.

## Product decisions

- Responsive web app first, with PWA support planned.
- MapLibre with OpenFreeMap is the initial map stack.
- Clicking a visible map feature is local and never geocodes automatically.
- Search checks the local tile-derived index first; online geocoding only happens after an explicit action.
- Online geocoder results are cached in IndexedDB.
- Walking route calculation is optional for every destination transition.
- Weather and other live data integrations are optional and lazy.
- User-created AI personas and free-form roleplay are supported.
- OpenAI-compatible and local model endpoints share one provider contract.

See [docs/PRODUCT.md](docs/PRODUCT.md) and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

The implementation roadmap is tracked in [TODO.md](TODO.md).

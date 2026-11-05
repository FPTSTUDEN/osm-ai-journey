# Deployment And Privacy

## Static deployment

The application is a Vite static build. Run `pnpm build`, then publish the `dist/` directory to GitHub Pages, Cloudflare Pages, or another static host. The Vite base path is relative, so the generated assets work from a project subpath as well as a domain root.

The repository includes a GitHub Actions workflow at `.github/workflows/deploy-pages.yml`. It builds and deploys `main` to GitHub Pages after each push, and can also be started manually from the Actions tab. In the repository settings, set **Pages > Build and deployment > Source** to **GitHub Actions**. The published project URL is `https://fptstuden.github.io/osm-ai-journey/`.

The service worker is registered only in production. It caches the application shell and recently requested OpenFreeMap resources, serves the shell when a document request fails offline, and removes older `osm-ai-journey-*` cache versions during activation.

## Browser storage

Journey state, provider settings, geocoder results, enrichment responses, weather data, and the offline resource cache remain in the current browser. Clearing site data or using a different browser removes access to that local journey.

API keys are stored in `localStorage` when entered. This is convenient for a single-user local deployment but is not a secure secret store. Do not enter sensitive production keys on a shared computer or deploy a public instance intended for multiple users. Prefer a local Ollama, LM Studio, or vLLM endpoint when possible.

Weather and nearby OpenStreetMap data are opt-in. Opening-hours schedules and nearby public-transport stop locations are queried from Overpass only after the user asks; this sends the selected place name and coordinates to the configured endpoint. Hours are displayed as schedule text, not a calculated open/closed state; transit results do not include departure times. Cached results are labeled and stale data is identified.

## Map caching limits

The service worker caches resources requested by the normal map viewport. It does not download arbitrary areas in bulk. OpenFreeMap and its upstream data providers have usage and storage limits.

### Local PMTiles

Open **Settings → Local PMTiles map** and select a `.pmtiles` file. Raster PNG/JPEG/WebP/AVIF archives are supported; vector archives must include vector-layer metadata and common water, land, building, or road layers for the generic local style. Labels are intentionally omitted so the local map does not depend on remote glyphs. The app reads the chosen `File` locally through range reads; it does not upload, copy to IndexedDB, or retain it after the browser session/page reload. Provide a legally usable archive and retain its required data attribution; the map credits OpenStreetMap contributors.

## Branch preview deployments

Cloudflare Workers Builds deploys this app. Pushes to a non-production branch upload a version with a stable alias URL. The version is not promoted, so production traffic does not change. The version command in the Cloudflare build settings is:

```sh
npx wrangler versions upload --preview-alias "$(echo "$WORKERS_CI_BRANCH" | tr '[:upper:]/_.' '[:lower:]---')"
```

The alias is the branch name in lowercase, with `/`, `_`, and `.` replaced by `-`. Alias labels are limited to 63 characters.

Live testing URL for `feat/photo-detail-view`:

https://feat-photo-detail-view-osm-ai-journey.mrdinh.workers.dev/

The alias follows the latest upload for that branch. Each upload also gets its own version URL, which takes the form `https://<version-id>-osm-ai-journey.mrdinh.workers.dev`. Preview URLs are public and are not protected by authentication. Aliases are not isolated per branch, so bindings and secrets are shared with production.

To promote a version to production, run `npx wrangler versions deploy` manually.

### Naming convention for test branches

Every test branch is deployed under its sanitized name, so the URL can be predicted before the build runs:

| Branch | Preview URL |
|---|---|
| `feat/photo-detail-view` | `https://feat-photo-detail-view-osm-ai-journey.mrdinh.workers.dev/` |
| `<type>/<topic>` | `https://<type>-<topic>-osm-ai-journey.mrdinh.workers.dev/` |

Rule: lowercase the branch name, then replace `/`, `_`, and `.` with `-`. Keep the result under 63 characters.

### Checklist for a new test branch

1. Push the branch to `origin`. Cloudflare builds non-production branches automatically, as configured under **Settings → Builds → Branch control**.
2. Confirm the Cloudflare build's version command matches the one above. It lives in the dashboard, not in this repository. Changing it in the repo has no effect.
3. Confirm the Worker name in `wrangler.jsonc` (`osm-ai-journey`) matches the Worker in Cloudflare. A mismatch uploads to a different Worker, and the alias will not resolve.
4. After the build, the log prints `Version Preview Alias URL`. Check that the URL matches the table above.
5. Check the alias serves the new build. The page should reference the `assets/index-<hash>.js` that the build log prints.

# Work packages

Each package lists files, steps and acceptance checks. "Existing e2e" means `tests/app.spec.mjs`; keep it passing, and update selectors only when a step says so. Baseline: `22e2808` plus the F1–F7 fixes in this PR.

---

## WP-Q1 · CI runs the tests (small, do first)

Files: `.github/workflows/deploy-pages.yml`.
1. In the `build` job, after install and before build, add `pnpm exec tsc -b`, `pnpm test:unit`.
2. Add a separate `test` job (not blocking deploy at first): install Playwright Chromium (`pnpm exec playwright install --with-deps chromium`), then `pnpm test:e2e`. Upload `playwright-report` on failure.
3. Add `on: pull_request` for the `test` job only. Deploy must stay on `push` to `main`.

Accept: a PR with a failing unit test shows a red check. Deploy still publishes from `main`.

---

## WP-R2 · One IndexedDB module

Files: new `src/storage/db.ts`; edit `journey.ts`, `geocoderCache.ts`, `liveCache.ts` (check how it opens the DB).
1. Move `openDatabase`, the store list and `DATABASE_VERSION` into `db.ts`. Export `getDb()`, which caches one connection promise, and helpers `get/put/delete(store, …)`.
2. `onupgradeneeded` creates every store: `geocoder-results`, `journeys`, `live-data`. Keep the version at 3. Do not bump it unless you add a store.
3. Handle `onversionchange` by closing the connection.
4. Replace the three copies. Keep the "storage unavailable, continue in memory" behaviour (swallow and return null).

Accept: grep finds exactly one `indexedDB.open`. Existing e2e (restore journey, restore viewport) passes. A browser profile with the v3 database from `main` opens without data loss.

---

## WP-R1 · Split `App.tsx`

Goal: no behaviour change; make the UI work cheap. Target `App.tsx` ≤ 250 lines.

Hooks (`src/hooks/`):
- `useJourney()`: owns destination, history, scene, `messages: ChatEntry[]`, events, memory, summary, load/save (debounced), reset/apply/export/import. Returns state plus actions.
- `useChat(journey, settings, placeData)`: `send`, `cancel`, `retry`, `llmState`, the AbortController and the summary trigger. Move the "summarise at ≥12 entries and +8 since last" rule here as a pure function `shouldSummarize(count, last)` and unit-test it.
- `usePlaceData(place)`: context, photos and weather with `idle|loading|ready|error` and `cached`. Replace the three `useState` triples. Use one `active` flag per effect run, as now.
- `useStoryPanels()`: `storyMode`, `panels`, `fieldNotesOpen`, `toggle/close`, Escape handling.

Components (`src/components/`):
- `PlaceDetails` renders the facts, source context, weather and photos **once**. Props select a compact or full layout. Use it in the Place panel, the Field notes overlay and the Explore map panel. This removes the triple copy.
- `StoryDock`, `MapPanel`, `PlacePanel`, `JournalPanel`, `FieldNotes`, `SettingsDrawer`, `DialogueBox` (created in WP-UI), `ArrivalCard`.
- `JournalPanel` and the in-card "Travelogue" timeline render the same events. Keep one component.

Rules:
- Keep all class names that the e2e tests and `app.css` use. Move CSS by feature only in a later step.
- `MapCanvas` stays lazy and mounted only while the map panel is open. Do not change that decision.
- Do not change the storage schema in this package.

Accept: `tsc -b` clean. All e2e tests pass unchanged. `grep -c "weather-panel" src` shows one definition. Add one unit test per pure helper.

---

## WP-UI · Dialogue box, opening screen, chrome

Files: new components from WP-R1, `app.css` (split it into `styles/*.css` as you go), `index.html`.
Reference mockups: `mockups/01…04`, `06`. Reference spec: `docs/redesign/IMPLEMENTATION.md`.

1. **Top chrome.** Move the companion toggle out of the journey panel into the top bar. It reads "Show companion" / "Hide companion", is icon-only at ≤520px with an `aria-label`, and is off by default. Keep `aria-pressed`.
2. **Dialogue box** (replaces the `journey-panel` card).
   - Nameplate: persona name plus a `COMPANION` tag (green). `event` entries show no nameplate.
   - Body: the latest assistant entry. A **Log** button expands the box to show earlier entries (the existing `.conversation` list moves in here). Give the list `role="log"`, `aria-live="polite"`.
   - Free-text bar always visible, with the existing Send button and label.
   - While streaming: show a **Stop** button (calls `cancel`). On error: show the message and a **Retry** button that resends the last user entry.
   - Remove the duplicate "Travelogue" timeline inside this card. The Journal panel is the only place for events.
3. **Layout.** The box sits at the bottom. On ≥1100px it takes the space between open panels using CSS variables `--l` and `--r` set from the open-panel state. At ≤1100px it is full width and panels are height-limited. At ≤520px the dock is a bottom bar and panels are top sheets (see the mockup CSS in `mockups/*.html` for the rules that were verified at 390, 1100 and 1440).
4. **Opening screen** (when `currentDestination` is null and the user has not sent a message). Headline, search, "drop in" shortcuts, the starter line in the dialogue box. The background is the **ambient gradient**; pins are decorative CSS, never a live map.
   - Search uses loaded map data only. That needs the map, so for now the field opens the Map panel on submit. A shortcut chip performs **one explicit online lookup** (`searchOnlinePlaces`) and then `choosePlace`.
   - "Surprise me" picks from a small bundled list; no network call before the click.
   - Place stays disabled until a destination exists.
5. **Naming.** The panel title is "Journal" (not "Travelogue"); the internal id may remain `travelogue`. Update `aria-label`s and the e2e selectors that use the old name.
6. **Panel a11y.** Escape closes the topmost panel and returns focus to its dock button. Add `aria-labelledby` and `role="complementary"` or `dialog` as appropriate. Do not change layout on focus or blur (an existing e2e test enforces this).
7. **Fonts.** Either load Manrope and DM Mono (self-host or `<link>`; choose one and note the offline-cache impact) or remove them from CSS and use the system stack. Georgia for narration stays.
8. **Reset.** `resetJourney` also clears the selected photo and closes panels (F16).

Accept: Existing e2e passes after selector updates. New e2e: (a) the dialogue box never overlaps an open panel at 1440/1100/390; (b) Log expands and collapses; (c) Stop cancels a mocked slow stream and Retry resends; (d) the opening screen makes no network request before a click (assert with `page.on('request')`); (e) the companion toggle is in the top bar and defaults to off. Verify the layout visually against the mockup at the three sizes.

---

## WP-UI2 · Typewriter, suggestions, companion art

1. **Typewriter.** Reveal the streamed text at a steady rate for display only. The stored entry is always the full text. Respect `prefers-reduced-motion`: show instantly. A click or any key finishes the current reveal. Do not delay the Send button.
2. **Suggestions** (decision pending: LLM-structured vs static). Recommended: static, scene-based, no extra model call (for example "Look around", "Ask a local", "Walk somewhere else"). Label them "Suggestions · optional". They only fill the text bar. They never send.
3. **Companion art.** Recommended: off by default, with a user upload stored in IndexedDB (a `Blob`, not a URL) and the setting `companionImage: boolean`. The placeholder stays when nothing is uploaded. Label as "Illustration". No generated imagery in this package.

Accept: unit test for the reveal function (pure: text, elapsed → visible length). e2e with reduced motion shows the full text immediately.

---

## WP-G1 · Correct Wikipedia/Wikidata matching (F8)

Files: `providers/enrichment.ts`, `providers/localPlaceIndex.ts`, `types/domain.ts`.
1. In `placeFromFeature`, keep the `wikidata` and `wikipedia` tags when the tile feature has them; add optional `wikidataId?: string` to `Place`. If present, use it directly: `wbgetentities` and the sitelink title, with no search.
2. Otherwise use Wikipedia `list=geosearch` around the coordinates (radius ≤ 500 m) and require a title similarity with `place.name`. If nothing matches, show "No source context found" rather than the top name hit.
3. Bump the cache key prefix (`enrich:v2:`) so stale wrong matches expire.

Accept: unit tests with fixture JSON: a place with `wikidataId` skips search; "Central Station" with a far-away article match is rejected. No behaviour change for places that matched correctly before.

---

## WP-G2 · Photo quality and licences (F9)

Files: `providers/photos.ts`, `types/domain.ts`, scene-art markup.
1. Request `iiurlwidth=1600` and use that URL as `sceneUrl`. Keep `thumbnailUrl` at 640. Never load `info.url` (the original) as a background.
2. Add `iiprop=url|extmetadata|mime` and drop results whose mime is not `image/jpeg`, `image/png` or `image/webp`.
3. Capture `LicenseShortName`, `LicenseUrl` and `AttributionRequired` from `extmetadata` into `license` / `licenseUrl`. Show "Photo: <author> · <licence>" in the scene-art note and in Field notes.
4. Sort by `distanceMeters` ascending (unknown last).
5. Bump the cache key (`photos:v3:`).

Accept: unit test on a fixture response (SVG filtered, licence captured, sorted). The scene-art note shows the licence. Existing photo e2e passes.

---

## WP-P1 · Service worker (F12)

Files: `public/sw.js`, `src/storage/offlineCache.ts`, `src/main.tsx`.
1. Documents: network-first with a cached fallback (so a deploy shows at once). Hashed scripts and styles: cache-first.
2. Map tiles and styles: stale-while-revalidate. Cap the tile cache (for example 400 entries, oldest first). Do not cache opaque responses.
3. Bump `CACHE_NAME` to `shell-v3`.
4. Optionally notify the page when a new worker is waiting and offer a reload. Drop `skipWaiting` unless that prompt exists.

Accept: manual: deploy twice and confirm the second build appears on the first reload. Offline e2e still passes. The cache status in Settings shows a bounded count after heavy panning.

---

## WP-S · Small fixes

- F17: `map.flyTo` on selection (duration 0 when `prefers-reduced-motion`). `fitBounds` to the route when one is drawn.
- Persist `storyMode` and open panels? **No.** Keep them session-only. Persist only the journey.
- When the map panel unmounts, reset `mapStatus` to `loading` so stale search state is not shown.
- `docs/DECISIONS.md`: add an entry "Map is panel-only, never a background" and one for "Structured chat messages".
- `TODO.md`: change the "Immersive redesign (implemented)" heading to match reality and add the WPs above as unchecked items.

# Plan: fixes, optimization and the visual-novel UI

Baseline: `FPTSTUDEN/osm-ai-journey` `main` at `22e2808`.
Written for an implementing agent who has not seen earlier discussion. Read this file, then `WORK_PACKAGES.md`.

## 0. How to use this plan

1. The fixes for F1–F7 are already applied in this PR (section 3). Start from the work packages.
2. Do the work packages in the order given in section 5. Each has files, steps and acceptance checks.
3. Keep the product rules in `docs/PRODUCT.md`. They win over anything here.
4. Use `pnpm` (the repo's `packageManager`). Before each commit run `pnpm build` and `pnpm test:unit`. Run `pnpm test:e2e` for UI work.
5. Follow `AGENTS.md` for commit author and co-author lines.

## 1. State of the code (verified by reading the source, 22e2808)

The stack is Vite + React 19 + TS, MapLibre/OpenFreeMap, IndexedDB, and an OpenAI-compatible LLM client.
`tsc -b` and the 6 existing unit tests passed on the unmodified source. `pnpm test:e2e` was **not** run.

What is shipped for the immersive redesign:
- Story/Explore switch in the top bar. A dock with Map / Place / Journal. Each panel opens and closes only by explicit action.
- Scene art from a user-selected Wikimedia photo, with an attribution line. The ambient gradient is used when no photo is selected.
- Arrival card, Field notes overlay, "Show/Hide companion" toggle with a placeholder sprite.
- **The map is panel-only and mounted only while its panel is open. It is never a background** (`TODO.md`, last commits). Mockups must not show a live map behind the scene.

What is **not** shipped, although `TODO.md` calls the redesign implemented:
- No dialogue box. Narration is still the old `journey-panel`: a scrolling message list, a duplicate "Travelogue" timeline and a textarea composer, as a card.
- No opening screen. No nameplate. No typewriter. No suggestions. The companion toggle lives in the journey panel, not in the top chrome.
- The UI says both "Journal" (dock) and "Travelogue" (panel title).

## 2. Findings (ranked)

IDs are used by the work packages. "Verified" means I reproduced it by reading the code path or by running a test.

| ID | Sev | Finding | Where | Status |
|----|-----|---------|-------|--------|
| F1 | High | Arrival **overwrites the last message** (`[...current.slice(0, -1), eventText]`). Any reply or user turn before a transition is destroyed. | `App.tsx` `completeTransition` | Fixed in patch |
| F2 | High | Roles come from array parity (`index % 2`). A failed or empty reply, or F1, flips every later role, so the model sees swapped speakers. | `App.tsx`, `context.ts` | Fixed in patch |
| F3 | High | The model never receives the Wikipedia/Wikidata context the panel shows. "Grounded in the place" is only the name and coordinates. | `context.ts` | Fixed in patch |
| F4 | Med | The summary is generated but the **full history is still sent**, so the context grows without bound and summarising saves nothing. | `context.ts` | Fixed in patch (window of 12) |
| F5 | Med | The whole journey is written to IndexedDB on every state change: once per streamed token, and once per map frame. | `App.tsx` save effect | Fixed in patch (400 ms debounce) |
| F6 | Med | `map.on('move')` calls `setMapViewport` every frame, re-rendering the 700-line `App` while panning. | `MapCanvas.tsx` | Fixed in patch (`moveend`) |
| F7 | Med | Reset or import during a stream lets late tokens land in the new journey. No cancel button. | `App.tsx` | Fixed in patch (AbortController; no cancel UI yet, see WP-UI) |
| F8 | Med | Wikipedia lookup is `opensearch` by name only. A common name ("Central Station") can return the wrong article, which is then labelled "source-backed". | `enrichment.ts` | Open, WP-G1 |
| F9 | Med | Photos: scene art uses `info.url` (the original file, often several MB) for a full-screen background. Thumbnails are 640px. Licence and attribution-required fields are not captured. Non-images (SVG, PDF, audio) are not filtered. | `photos.ts` | Open, WP-G2 |
| F10 | Med | `App.tsx` has about 50 `useState` calls, and the destination, weather, context and photo blocks are **copy-pasted three times** (map panel, Place panel, Field notes). | `App.tsx` | Open, WP-R1 |
| F11 | Low | Two modules each open IndexedDB with their own copy of `onupgradeneeded` and version 3. Adding a store in one breaks the other. A connection is opened and closed on every call. | `storage/*.ts` | Open, WP-R2 |
| F12 | Low | Service worker: stale-while-revalidate for the document and scripts means a deploy shows the old build once. Map tiles are cached without a size or age cap. Opaque responses are cached. | `public/sw.js` | Open, WP-P1 |
| F13 | Low | CI builds only. It runs neither unit nor e2e tests. | `.github/workflows` | Open, WP-Q1 |
| F14 | Low | Accessibility: panels have no Escape-to-close or focus return. The narration is not a `role="log"` / `aria-live` region. Typing animation will need `prefers-reduced-motion`. | `App.tsx`, CSS | Open, WP-UI |
| F15 | Low | CSS declares Manrope and DM Mono but nothing loads them, so they fall back to system fonts. | `app.css`, `index.html` | Open, WP-UI |
| F16 | Low | Reset does not clear the selected photo, the panels or the map viewport. | `App.tsx` | Open, small |
| F17 | Low | Selecting a place uses `jumpTo`, not a fly-to as `TODO.md` states. No `fitBounds` for routes. | `MapCanvas.tsx` | Open, small |

## 3. The included patch

This PR's source changes (9 files) fix F1–F7. They were made against `22e2808`.

Checks run on the patched tree: `tsc -b` clean, `vite build` succeeds, **10 unit tests pass** (6 existing plus 4 new). **Not run:** `pnpm test:e2e`, and no manual browser check. Run the e2e suite before merging.

Changes:
- `ChatEntry { id, role: 'user' | 'assistant' | 'event', text, createdAt }` replaces `messages: string[]`.
  - `storage/messages.ts` migrates old data (IndexedDB and imported JSON) using the old alternation rule. Arrival lines become `event` entries.
- `context.ts`: roles from entries. Event entries are sent as `[Narration] …` assistant lines. The starter line is not sent. With a summary, only the last 12 entries are sent. The system prompt gains an untrusted "Source context" block with the Wikipedia summary (1200 chars max) and up to 8 facts.
- `App.tsx`: arrival appends (it replaces only the untouched starter). A streamed reply is addressed by entry id. Reset and import abort the stream. The arrival timer is cleaned up. The save is debounced.
- `MapCanvas.tsx`: viewport reported on `moveend`. A dead `map.off` was removed.
- CSS: `.message.event`.

Known gaps in the patch: it has no cancel or retry button (WP-UI), and the legacy-string migration cannot recover roles that F1/F2 already corrupted in old saves. Nothing can fix that data.

## 4. Target design

Visual-novel layout from `mockups/` (`01`–`06`), implemented on the existing state model.

- Stage: scene photo if selected, else the ambient gradient. **No live map behind it.** In the opening mockup the map pins are decorative.
- Dock (left, vertically centred): Map · Place · Journal. Left slot Map; right slot Place / Journal / Field notes.
- Bottom: dialogue box with a nameplate, then a free-text bar. The box sits between open panels on wide screens and uses the full width at ≤1100px.
- Top chrome: Explore / Story, **one** companion toggle (default off), settings.
- Data-class chips: source-backed (green), cached (teal), live (blue), story-made (amber).
- Breakpoints 1100 / 900 / 520.

Spec details for the unshipped parts are in `../redesign/IMPLEMENTATION.md`.

## 5. Order of work

```
0001 patch ─► WP-R2 (db) ─► WP-R1 (split App) ─► WP-UI (dialogue, opening, chrome)
                               │                       └► WP-UI2 (typewriter, suggestions, companion art)
                               └► WP-G1/G2 (grounding, photos)    (independent of UI; can run in parallel after R1)
WP-Q1 (CI) can go first and is independent.   WP-P1 (service worker) is independent.
```

WP-R1 should land before WP-UI. Otherwise the UI work edits the same 700-line component twice.

## 6. Out of scope

Accounts or sync, a shared API key or proxy, transit routing, PMTiles (still a `TODO.md` item), the speaker swap in mockup 05 (needs a data-model decision; see `../redesign/IMPLEMENTATION.md`).

## 7. What I did not review

`weather.ts`, `liveCache.ts`, `geocoder.ts`, `offlineCache.ts`, the CSS bodies beyond selectors, `tests/app.spec.mjs` beyond test names, and the Pages/Wrangler deployment docs. Findings above do not cover them.

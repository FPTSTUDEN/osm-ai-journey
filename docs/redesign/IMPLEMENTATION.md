# Immersive redesign: implementation reference

Status: **implemented**, including the opening screen, dialogue/nameplate, typewriter, companion controls, panels,
field notes, shared place details, map search, and panel/settings/journey ownership. `App.tsx` is below the WP-R1
250-line target. The original work plan is in [`../plan/`](../plan/README.md).

Mockups: [`/mockups`](../../mockups/README.md). Original rationale: [`/IMMERSIVE_REDESIGN.md`](../../IMMERSIVE_REDESIGN.md).

## 1. Main idea

A visual novel whose places are real. The nearest available photo for the current destination is scene art over an ambient gradient (**the map is
panel-only and is never a background**, a decision already made in the build). A
dialogue box carries the companion's narration. An optional companion illustration stands opposite any open
panel. Map, Place and Journal are independent panels the user opens and closes explicitly, so the user can move
between places and images without leaving the chat view. Manually selecting a nearby photo shows its location and
details and focuses the map there; a return action restores the original destination and its automatic scene photo.

Principles (from `PRODUCT.md`): the user's intent wins; local-first; online lookups only on explicit action;
photos are illustrative, never presented as a live view; every fact shows its data class.

## 2. Layout contract

- **Dock**, left, vertically centred: **Map · Place · Journal**. Panels open and close only by explicit action.
  Place is disabled until a destination exists.
- **Left slot:** Map. **Right slot:** Place / Journal (stacked) / Field notes (overlay).
- **Bottom:** dialogue box (nameplate) plus a free-text bar that is always visible.
- **Wide screens:** the dialogue box sits between open panels (`--l` / `--r` insets).
- **≤1100px:** the box is full width and panels are height-limited so they cannot overlap it.
- **≤900px:** matches the shipped breakpoint.
- **≤520px:** the dock becomes a bottom bar; panels become top sheets (two open panels split the height);
  the log shrinks to ~14vh; suggestions scroll sideways.
- **Top chrome:** Explore / Story switch, a persisted Novel / Visual novel / Chat presentation selector, and settings. Uploaded companion art appears automatically in Visual novel mode rather than through a separate visibility toggle.

## 3. Decisions

| # | Decision |
|---|----------|
| a | UI name is **Journal**. `travelogue` stays the internal id. The second panel is called **Place** in the dock. |
| b | Field notes opens from the Place panel and carries the provenance record (coordinates, OSM feature). |
| c | **Explore** is the full-screen map with the old layout. No mockup. |
| d | One companion toggle in the top chrome, default off. |
| e | No speaker swap in first scope (see P2-1). |
| f | Suggestions are labelled "Suggestions · optional"; free text is never hidden. |
| g | Listener is dimmed. Companion nameplate is green; NPC nameplate is amber. |
| — | Data-class chips: source-backed (green), cached (teal), live (blue), story-made (amber). |
| — | Removed: auto-advance button (the AI streams), inline hide-character button, emoji. |
| — | Narration font: Georgia (no new font load). |

## 4. Mockup → build mapping

| Mockup | Current implementation |
|--------|------------------------|
| 01 opening | `OpeningScreen` provides local search and explicit online shortcuts without requesting data before user action. |
| 02 arrival | `ArrivalCard` announces a destination transition. |
| 03 narration | `DialogueBox` provides the nameplate, expanded log, Stop/Retry, suggestions, and free-text composer; Journal renders narrative events. |
| 04 visual novel | The companion toggle is in the top bar; browser-local illustration upload is optional and off by default. |
| 05 two characters | Deferred; requires a speaker-selection data-model decision. |
| 06 map + place | Map and Place panels open independently; Field notes and map destination details reuse `PlaceDetails`. |

The map remains panel-only, and selected Wikimedia photos are identified as illustrative scene art with source
attribution. Mobile, tablet, and desktop panel layouts are covered by the browser suite.

## 5. Deferred

- **Speaker swap (mockup 05):** requires a speaker-selection data-model decision.
- **Structured suggestion generation:** current suggestions remain optional and do not replace free text.
- **Sub-250-line `App.tsx`:** achieved. Journey persistence and chat streaming/summary, map search, story-panel rendering,
  settings state, and journey-settings actions are extracted.

## 6. Verification status

The opening-screen request gating, panel behavior, dialogue, reduced-motion handling, local illustration and PMTiles
handling, responsive layouts, map restoration, destination journey, and opt-in Overpass lookups are covered by
Playwright tests. Provider parsing, location handling, and search behavior are covered by unit tests. Event lookup is
deferred because no global public no-key source was selected; nearby transit results are OSM stop locations, not live
departure times. Real-provider behavior and browser variations outside Chromium remain dependent on their respective
external services and runtime environments.

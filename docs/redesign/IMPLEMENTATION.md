# Immersive redesign: implementation reference

Status: **partly implemented.** `TODO.md` marks the redesign done, but a re-read of `main` at `22e2808` shows the dock, panels,
scene art, arrival card and companion toggle are built, while the dialogue box, opening screen, nameplate and top-bar
companion toggle are not. The work plan is in [`../plan/`](../plan/README.md). This document is the design reference.

Mockups: [`/mockups`](../../mockups/README.md). Original rationale: [`/IMMERSIVE_REDESIGN.md`](../../IMMERSIVE_REDESIGN.md).

## 1. Main idea

A visual novel whose places are real. The picked destination's photo is the scene art over an ambient gradient (**the map is
panel-only and is never a background**, a decision already made in the build). A
dialogue box carries the companion's narration. An optional companion illustration stands opposite any open
panel. Map, Place and Journal are independent panels the user opens and closes explicitly, so the user can move
between places and images without leaving the chat view.

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
- **Top chrome:** Explore / Story switch, one **Show/Hide companion** toggle (default **off**; icon-only on
  phones, with an `aria-label`), settings.

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

## 4. Mockup → build mapping (verified against `22e2808`)

Names are from the code (`App.tsx`, `app.css`).

| Mockup | Build today | Gap |
|--------|-------------|-----|
| 01 opening | Nothing. The starter line sits in the old chat card | Whole screen (WP-UI step 4) |
| 02 arrival | `arrival-card` (2.6 s) over the scene | Chapter-card styling is a small CSS change |
| 03 narration | Journal panel exists as `travelogue`, titled "Travelogue". Narration is still the old `journey-panel` card with its own duplicate timeline | Dialogue box, Log, Stop/Retry (WP-UI) |
| 04 visual novel | Placeholder sprite and `Show/Hide companion` exist, but the toggle is in the journey card | Move the toggle to the top bar; nameplate (WP-UI) |
| 05 two characters | None | Phase 2 (P2-1) |
| 06 map + place | Map panel and Place panel can be open together (`story-map-and-destination`) | Layout offsets for the dialogue box (WP-UI step 3) |

Defects in the **original** 05/06 mockups that are fixed in this set: the dialogue box was hidden under the Map
panel below ~1500px; thumbnail captions were wrong ("At night" labelled a daytime aerial); photos were labelled
Wikimedia but were Unsplash; 06 had no "not a live view" chip or free-text bar; no `@media` rules; inconsistent
serif.

## 5. Not yet built

### P1-1 Opening screen (mockup 01)
- Shown before any destination: ambient-gradient stage with decorative pins (no live map), headline, search, "drop in" shortcuts (Trevi Fountain,
  Shibuya Crossing, Bryggen Wharf, Surprise me), and the companion's starter message in the dialogue box.
- Typing searches **loaded map data** only. A shortcut makes **one explicit online lookup** when clicked, and
  the screen says so.
- Free chat works immediately ("No destination needed"). Place stays disabled until a destination exists.
- Acceptance: with no destination, no network request is made until the user clicks a shortcut or "Begin"
  with an online search.

### P1-2 Typewriter
- Pace the streamed deltas in `sendMessage` for display only; the stored message is the full text.
- Respect `prefers-reduced-motion` (show instantly). Any key or click completes the current beat.

### P1-3 Suggestions
- Optional chips under the box. Source is **undecided**: LLM-structured output, or static per-scene. Decide
  before building. Either way they never replace the free-text bar.

### P1-4 Explore mode
- Full-screen map with the pre-redesign layout. The Explore/Story switch must preserve the current destination
  and journal.

### P1-5 Companion illustration source
- Options: placeholder, user upload, AI-generated, or an archetype set. Recommended: **off by default plus user
  upload**, so no new asset licensing or generation dependency is needed. Illustrations are always labelled as
  illustrations.

### P2-1 Speaker swap (mockup 05)
- Blocked by the data model: `messages: string[]` and `context.ts` assigns roles by index parity.
- Needs a `speaker` field per message (or a parsing convention) and a rule for which character is shown.
  `.np.npc` (amber) is defined in CSS and reserved for this.

## 6. Verification status

Mockups were rendered in headless Chromium at 390×844, 1100×800 and 1440×900 (all six). Layout was reviewed from
those screenshots. **Not verified:** the mockups in a real browser with real fonts (Georgia may differ by OS),
anything below 390px, and the claims in section 4 about the build, which come from reading `App.tsx` and
`app.css` at `22e2808`, not from running the app or the e2e suite.

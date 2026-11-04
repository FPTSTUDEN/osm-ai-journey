# Immersive / Visual-Novel Redesign

Status: **implemented.** This document records the shipped presentation direction;
the static HTML mockups remain visual references. The mockups use placeholder
gradients for the map and Unsplash images for destination photos.

## Why

The current UI (`src/App.tsx` + `src/styles/app.css`) reads as a two-pane
dashboard: a map card beside a chat card, with alternating message bubbles, a
scene counter, and always-visible data (coordinates, OSM feature IDs, cache
status). It functions well but feels like "a map app with a chatbot," not the
"open-ended narrative journey" described in `docs/PRODUCT.md`.

The redesign reframes the experience from **two panels** to **one place you are
standing in, with a voice** — and pushes toward a **visual-novel (VN)** grammar:
the destination photo becomes the scene art, the companion appears as an
optional character illustration, and narration reads as prose in a dialogue box.

## Mockups (open in any browser)

| File | Screen | Shows |
|------|--------|-------|
| `mockups/01-opening.html` | Threshold / "begin your journey" | Hushed world map, serif invitation, search + quick "drop in" chips, local-first trust line. |
| `mockups/02-arrival.html` | Arrival + field notes | Full-bleed stage, cinematic "Scene 03 — You arrive" chapter card, hero photo, field-notes drawer, travelogue spine. |
| `mockups/03-ongoing-narration.html` | Mid-conversation (narration) | Narration-as-prose thread over the map (no chat bubbles), typewriter cursor, dock with suggestions + free input. |
| `mockups/04-visual-novel.html` | VN single character | Destination photo as scene art, togglable companion sprite, VN dialogue box with nameplate. Its map-under-photo layering is a visual reference only; the live app does not show the map behind scene art. |
| `mockups/05-two-characters.html` | VN two characters | Vendor (active, amber nameplate) + companion (dimmed), stage directions, left dock with Map / Place / Journal toggles. |
| `mockups/06-map-and-destination-panels.html` | VN + navigation | Map panel (navigate to other places) and Destination panel (image gallery + context) open over the scene so the user can travel and swap scene images without leaving the story. |

> The `.b64` files that may accompany these in the working tree are build
> artifacts used only to preview the HTML in a headless browser; they are not
> part of the design and do not need to be committed.

## Core moves

1. **Full-bleed scene stage.** A selected illustrative photo fills the viewport;
   otherwise, use the app's ambient gradient background. Never render the live
   map behind the scene art. The interactive map exists only in its compact Map
   panel. Opening Explore opens that panel; keyboard focus and blur do not resize it.
2. **Destination photo = scene art (VN).** Only an explicitly selected destination
   photo becomes the full background, with an illustrative label and source link.
   Do not auto-select the first nearby photo. When the photo is cleared or the
   destination changes, return to the ambient gradient until another photo is chosen.
3. **Narration, not messaging.** Render AI output as flowing serif prose with a
   typewriter reveal (the stream already deltas in `sendMessage`); render the
   user's action as a quiet italic line. Drop alternating bubbles and the
   "You / Guide" labels.
4. **Togglable character illustration.** Optional companion/NPC sprite, shown or
   hidden via a toggle. Multi-character scenes swap the sprite + nameplate to the
   active speaker (see mockup 05).
5. **Independent navigation panels inside the story view.** Dock actions open
   Map, Place, and Journal panels independently. Map and Place can be open
   together; explicitly closing one leaves the other open. Map search and travel
   use the existing `choosePlace` / `completeTransition` flows, and photo choices
   set the scene background (see mockup 06).
6. **Field notes drawer.** Tuck provenance-heavy data (coordinates, OSM feature,
   source, cache status) behind an "examine" drawer instead of always-on facts.
7. **Travelogue spine.** Reframe `narrativeEvents` as a journal path of visited
   places rather than a debug-style event log.
8. **Cinematic arrivals.** Dramatize `completeTransition`: fade/vignette, camera
   `flyTo`, a "Scene NN — You arrive at …" chapter card, then dissolve into the
   new scene art.
9. **Explore ⇄ Story toggle.** Story mode immerses with narration; Explore hides
   narration and explicitly opens the compact Map panel for free panning and
   clicking. Neither mode uses the live map as a scene background.

## Constraints to honor (from docs/PRODUCT.md & ARCHITECTURE.md)

- **Provenance must stay visible.** Distinguish source-backed / cached / live /
  user-narrative data. A full-bleed photo must never read as a live camera feed:
  keep an "illustrative photo · not a live view" marker and the source link.
  Photo pixels remain illustrative; only photo *metadata* feeds the model.
- **User intent wins.** Suggested actions / choices are never mandatory; a free
  "say anything" input is always available alongside VN choices. No fixed path.
- **Local-first, static.** No new backend. The redesign is presentation-only over
  the existing provider contracts and journey state.
- **No destination required to chat.** The opening and story views must allow
  free conversation before any place is chosen.

## Character illustrations — open decision

The VN look depends on a sprite, but the product only has text personas today.
Options, in suggested order:

1. **Toggle-off by default + user-uploaded portrait** (recommended first step) —
   no art pipeline; user supplies an image for their persona.
2. **Stylized placeholder frame** (used in the mockups) — zero art, labeled as a
   placeholder.
3. **AI-generated portrait** from the persona description — most VN-authentic;
   adds a provider/cost/latency dependency and its own provenance note
   (generated, not real).
4. **Small curated archetype set** the AI maps NPCs onto.

## Implementation notes

- Dock panel state is explicit and independent; focus and blur do not trigger layout changes.
- The ambient gradient is the default stage. An explicitly selected illustrative photo replaces it; the live map is hidden unless its compact panel is open, and is never a layer beneath the photo.
- Explore opens the compact Map panel. Returning to Story closes it.
- MapLibre remains mounted when its container becomes compact and uses `ResizeObserver` to refresh its rendering after size changes.
- The Journal panel reads existing `narrativeEvents`; no journey schema changes are required.
- Browser coverage for panel toggles, focus stability, and mobile layout lives in `tests/app.spec.mjs`.
- Provider contracts and the journey-state model remain unchanged.

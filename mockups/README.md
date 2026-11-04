# Immersive redesign mockups

Static HTML, no build step: open any file directly in a browser. Photos are Unsplash placeholders and are flagged
on-screen as mock-only. They are not the Wikimedia photos the app would use.

These six files are one visual-novel design family. They share the same dock, dialogue box, nameplate, chips and
responsive rules. For the spec and the mockup-to-build mapping, see
[`docs/redesign/IMPLEMENTATION.md`](../docs/redesign/IMPLEMENTATION.md) and the work plan in [`docs/plan/`](../docs/plan/README.md).

| File | Moment | Status vs. the build (22e2808) |
|------|--------|--------------------------------|
| `01-opening.html` | Before any destination | Not built |
| `02-arrival.html` | Right after a transition | Arrival card exists; chapter-card styling not built |
| `03-ongoing-narration.html` | Mid-story, companion off, Journal open, log expanded | Journal panel built; dialogue box and Log not built |
| `04-visual-novel.html` | Mid-story, companion on, Field notes open | Toggle and placeholder built (toggle in the wrong place); nameplate not built |
| `05-two-characters.html` | Speaker swap | Phase 2 preview, needs a speaker model |
| `06-map-and-destination-panels.html` | Map and Place panels open together | Panels built; dialogue box offsets not built |

Corrections from the original 01–06: panels never overlap the dialogue box; every photo screen carries
"Illustrative photo · not a live view · source"; real `@media` rules at 1100 / 900 / 520; SVG icons instead of
emoji; captions describe what the photo shows; a single Georgia serif for narration.

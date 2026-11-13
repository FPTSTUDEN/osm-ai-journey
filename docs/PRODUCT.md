# Product Brief

## Vision

Osm AI Journey turns map exploration into an open-ended narrative journey. A user can choose a real destination, learn about it, and roleplay with a user-created AI persona in a scenario grounded in the place. The journey can move between destinations without forcing the user into a fixed game path.

## MVP experience

1. The user opens a responsive map and chat workspace.
2. They click a visible place or search locally within loaded map data.
3. The app shows OSM-derived place information and optional Wikipedia/Wikidata context.
4. The destination panel can show nearby illustrative photos; their written post metadata may be used as AI context.
5. The user creates or selects a persona, chooses Novel, Visual novel, or Chat presentation, and starts a scene.
6. One configured LLM produces ordered structured story blocks when possible; Novel, Visual novel, and Chat render the same turn in their own presentation, while plain-text responses remain readable in every mode.
7. The AI maintains the current place, scene, people, and journey history while allowing normal conversation.
8. The user can move to another destination, with or without calculating a walking route.
9. The map and narrative update together, but user intent always wins over suggested actions.

## Story presentation

- Novel is the text-first default and preserves the current dialogue/log experience.
- Visual novel separates narration, dialogue, and scene changes on a character stage; it shows the uploaded persona illustration when available and keeps a placeholder for the traveler.
- Chat uses speaker avatars and bubbles, with narration and scene events presented separately.
- The selected presentation is an app-wide browser preference and survives reloads; changing it does not change journey state or conversation history.
- Novel, Visual novel, and Chat use mode-specific reading widths and story areas on desktop and laptop screens. Side panels slide in and out while the dialogue area eases into its available space; the active Visual novel block also transitions when the reader moves through a story.
- New user and assistant messages animate into view; a typing indicator shows while the companion responds, scene transitions and the active speaker receive brief emphasis, and destination arrivals keep their existing feedback card. These effects respect reduced-motion preferences and never gate story controls.
- The persistent Animations & effects preference offers On, Auto, and Off. Auto follows the device reduced-motion setting; On and Off explicitly override it, including map movement and story text reveal.
- Roleplay stays in character, does not invent traveler actions, preserves scene continuity, and leaves the next action open unless the user asks otherwise.
- Personas are reusable profiles with natural-language instructions and a portrait. The built-in Wayfinder persona and portrait are ready to use; users can create/edit/select additional profiles and choose a bundled sprite or upload a portrait. Bundled sprites are discovered from filenames following `<persona>-sprite-<style>.<png|webp|jpg|jpeg>`; persona/style names and display descriptions are derived from the filename, so adding a correctly named asset requires no code registry entry.
- The active persona is saved per journey and controls both the LLM persona instructions and speaker portrait. Legacy single-persona settings and uploaded companion art migrate to the built-in profile.
- The conversation manager can create, switch, and delete conversations within a journey. Each conversation keeps its own transcript, summary, narration events, and alternate story branches; destination, persona, and journey memory remain shared. At least one conversation is always retained.
- The traveler is first-person and has no sprite. NPC identities and portraits are deferred; NPCs have blank avatars/placeholders for now.
- All modes share the same ordered `StoryTurn` blocks and free-text composer. In Visual novel mode, previous/next controls, stage clicks, and left/right arrow keys move through story blocks; text input remains usable at any point.
- Skip jumps to the end of the remaining story and opens a review panel with the original skipped dialogue and events. Closing it returns to the current scene; the full log remains available.
- Rewinding and continuing creates a returnable alternate timeline. The selected point's destination, scene, conversation, and journey memory are restored for the new continuation.

## Interaction rules

- No destination is required to chat with the AI.
- A map click uses loaded vector-tile features and does not make a geocoding request.
- Search first checks a session-local index derived from loaded vector tiles.
- An explicit `Search online` action is required before calling Nominatim, Photon, or another geocoder.
- Online geocoder responses are cached in IndexedDB and reused for repeated searches.
- Route calculation is opt-in per transition and may be disabled as a default setting.
- Live data such as weather, hours, events, and transport is disabled unless configured and requested.
- AI suggestions are never mandatory; users may reject, revise, or skip them.

## MVP non-goals

- Accounts, collaboration, social sharing, or server-side synchronization.
- Centralized API keys or a shared multi-user quota.
- Transit routing.
- Real-time events or comprehensive travel booking.
- Safety or moderation workflows beyond basic provider error handling.

## Data boundaries

The UI must distinguish between source-backed facts, cached facts, current live data, and user-created narrative details. The model should not present cached or static information as live information.
Photo pixels are illustrative only. Photo titles, captions, authors, dates, and source links are source-backed metadata that may inform the AI.

## Later opportunities

- Optional serverless proxy for providers that do not support browser CORS or should not expose keys.
- PMTiles or bounded offline-area downloads.
- Cloud synchronization without changing the journey state model.
- More routing modes and richer live travel data.

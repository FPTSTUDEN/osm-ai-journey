# Story Presentation Modes Plan

Expand the existing journey and roleplay app into three interchangeable story presentation modes. Keep the map, journey state, persona, and configured LLM shared; this work changes the story format and presentation, not the number of model providers.

## Agreed direction

- **Novel mode:** Preserve the current mostly text-based reading experience, with minimal visual elements.
- **Visual novel mode:** Present narration and character dialogue on a scene stage with character illustrations on the left and/or right. Progression should be flexible, not a forced sequence of clicks.
- **Chat mode:** Present character dialogue as chat bubbles with avatars, and distinguish narration and scene events from messages.
- Use one ordered, structured story turn for all modes. Blocks identify their kind and, when applicable, their speaker and scene metadata. Each mode renders the same content differently.
- Keep one configured LLM/provider contract. Request structured output when generating a turn; if the response is plain text or cannot be parsed, preserve it as a single prose block. Do not require provider-specific structured-output APIs.
- Visual novel mode includes a Skip action and a summary panel so users can move ahead without losing important context.

## Phase 1: Story turn model and compatibility

- [x] Define an ordered story-block schema for narration, character dialogue, and scene changes, with stable IDs and speaker identity where relevant.
- [x] Normalize structured LLM responses and plain-text responses into the same internal story-turn representation; malformed or unsupported structured output must fall back without losing text.
- [x] Update prompt/context assembly to request the structured turn format while continuing to use the selected LLM and existing provider contract.
- [x] Preserve current free-form user input, streaming cancellation, retry, and conversation summarization behavior.
- [x] Migrate or normalize existing persisted `ChatEntry` and journey data so existing journeys remain readable.
- [x] Add unit tests for valid structured responses, plain-text fallback, malformed output, ordering, and legacy journey data.

## Phase 2: Mode selection and shared content rendering

- [x] Add Novel, Visual novel, and Chat as app-wide story presentation modes and persist the selection in browser settings.
- [x] Replace the single-purpose “Show companion” top-bar toggle with a mode selector; show uploaded companion art automatically in Visual novel mode, with no separate visibility toggle.
- [x] Keep the current prose presentation as Novel mode, including the existing composer and story controls.
- [x] Add the Chat renderer with speaker avatars/bubbles and visually distinct narration and scene events.
- [x] Add the Visual novel renderer with a stable scene stage, dialogue/nameplate treatment, and left/right character portrait/placeholder slots.
- [x] Keep destination/map panels, journey state, and persona behavior consistent when switching modes.

## Phase 3: Visual novel pacing and history

- [x] Add click/keyboard progression for story blocks without blocking free-text input or requiring a click after every beat.
- [x] Add a visible Skip action that advances through pending story content and opens a review panel of skipped dialogue and events.
- [x] Let users review skipped content and return to the current scene; preserve access to the underlying story history.
- [x] Preserve later history as a returnable alternate branch when continuing from an earlier dialogue or scene; restore its destination, scene, memory, and conversation checkpoint.
- [x] Ensure progression, skip, summary, rewind, and retry keep the displayed story and LLM conversation context in sync.

## Phase 4: Persona profiles and presentation accessibility

Focus character artwork on user-selectable personas first. NPC identity tracking, NPC sprite assignment, and NPC rosters are deferred; NPCs have no sprite and use a blank avatar/placeholder for now. The traveler remains first-person with no sprite.

- [x] Ship a default persona profile with natural-language instructions and a built-in default sprite.
- [x] Let users create, edit, select, and remove multiple persona profiles, each with its own name, natural-language instructions, and configurable sprite.
- [x] Persist the selected persona per journey so its instructions and sprite stay together when switching journeys.
- [x] Use the active persona profile for LLM context and consistently render its sprite in Visual novel and Chat modes; retain a graceful placeholder if custom or default art is unavailable.
- [x] Migrate existing single-persona settings and browser-local companion art without losing user configuration.
- [x] Make scene composition responsive for mobile and desktop, with no overlap with the map, panels, or composer.
- [x] Support keyboard operation, screen-reader labels for controls and speakers, reduced motion, and readable contrast in all three modes.

## Phase 5: Validation and documentation

- [ ] Add component and integration tests for all three renderers, mode switching, and narration-vs-dialogue presentation.
- [ ] Add end-to-end coverage for a journey across mode changes, structured output and fallback, VN skip/summary/rewind, and existing free-text chat.
- [ ] Verify existing journeys and current chat behavior remain intact after storage normalization.
- [ ] Update product and architecture documentation with the shared story-turn model, mode behavior, persistence, and fallback rules.
- [ ] Update screenshots/mockups if the mode selector or story layouts materially change.

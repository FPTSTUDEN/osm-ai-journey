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

- [ ] Define an ordered story-block schema for narration, character dialogue, and scene changes, with stable IDs and speaker identity where relevant.
- [ ] Normalize structured LLM responses and plain-text responses into the same internal story-turn representation; malformed or unsupported structured output must fall back without losing text.
- [ ] Update prompt/context assembly to request the structured turn format while continuing to use the selected LLM and existing provider contract.
- [ ] Preserve current free-form user input, streaming cancellation, retry, and conversation summarization behavior.
- [ ] Migrate or normalize existing persisted `ChatEntry` and journey data so existing journeys remain readable.
- [ ] Add unit tests for valid structured responses, plain-text fallback, malformed output, ordering, and legacy journey data.

## Phase 2: Mode selection and shared content rendering

- [ ] Add Novel, Visual novel, and Chat as the app's story presentation modes and persist the selection using the existing settings/journey storage conventions.
- [ ] Replace the single-purpose “Show companion” top-bar toggle with a mode selector; decide whether artwork visibility also needs a separate preference.
- [ ] Keep the current prose presentation as Novel mode, including the existing composer and story controls.
- [ ] Add the Chat renderer with speaker avatars/bubbles and visually distinct narration and scene events.
- [ ] Add the Visual novel renderer with a stable scene stage, dialogue/nameplate treatment, and left/right character illustration slots.
- [ ] Keep destination/map panels, journey state, and persona behavior consistent when switching modes.

## Phase 3: Visual novel pacing and history

- [ ] Add click/keyboard progression for story blocks without blocking free-text input or requiring a click after every beat.
- [ ] Add a visible Skip action that advances through pending story content and opens a summary panel of skipped dialogue and events.
- [ ] Let users review the summary and return to the current scene; preserve access to the underlying story history.
- [ ] Define rewind behavior for dialogue and scene history, including how continuing from an earlier point affects later events and journey state.
- [ ] Ensure progression, skip, summary, rewind, and retry keep the displayed story and LLM conversation context in sync.

## Phase 4: Character artwork and accessibility

- [ ] Associate illustrations with character/speaker identities so the correct character appears for each dialogue block; retain a graceful placeholder when art is unavailable.
- [ ] Reuse browser-local artwork where suitable and define the UI for adding or removing character illustrations.
- [ ] Make scene composition responsive for mobile and desktop, with no overlap with the map, panels, or composer.
- [ ] Support keyboard operation, screen-reader labels for controls and speakers, reduced motion, and readable contrast in all three modes.

## Phase 5: Validation and documentation

- [ ] Add component and integration tests for all three renderers, mode switching, and narration-vs-dialogue presentation.
- [ ] Add end-to-end coverage for a journey across mode changes, structured output and fallback, VN skip/summary/rewind, and existing free-text chat.
- [ ] Verify existing journeys and current chat behavior remain intact after storage normalization.
- [ ] Update product and architecture documentation with the shared story-turn model, mode behavior, persistence, and fallback rules.
- [ ] Update screenshots/mockups if the mode selector or story layouts materially change.

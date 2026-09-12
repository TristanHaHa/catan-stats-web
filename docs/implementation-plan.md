# Catan Stats web app — implementation handoff

Implement a responsive browser version of [TristanHaHa/catan-stats](https://github.com/TristanHaHa/catan-stats) in a **new, independent repository named `catan-stats-web`**. Preserve the useful dice and turn-timing workflows, correct the statistical errors, and support **four players by default with an Add player control**. This document is a plan for implementation; no application or remote repository has been created as part of planning.

**1. Source baseline and migration decisions**

Source reviewed: commit `47a4c39616834ed11c7921b062907dbdc24c4f78`, on 2026-09-12. The repository contains a single Python/Pygame implementation, README, gameplay GIF, and MIT license. Read the [pinned implementation](https://github.com/TristanHaHa/catan-stats/blob/47a4c39616834ed11c7921b062907dbdc24c4f78/src/main.py) before coding; treat its interaction intent as the reference, rather than porting its rendering loop or global state.

| Existing behavior | Web implementation |
| --- | --- |
| Start screen, followed by names/colors in turn order | Simple setup screen with prefilled, editable players |
| Four hard-coded setup rows; minimum two named players | Four rows initially; add, remove, and reorder rows; minimum two; no hard-coded maximum |
| Random two-dice roll, manual total entry, clickable roll labels | Roll dice button, validated manual entry, and large quick-entry buttons for totals 2–12 |
| Previous/next roll browsing | Read-only history navigation, separate from Next turn |
| Start/pause timer and advance to next player | Explicit timer state and cyclic player order |
| Roll-frequency and player-time bar charts | Responsive charts plus accessible numeric summaries |
| Reset clears the game while retaining players | Confirmed Reset game with the same roster |
| In-memory session | Browser autosave and restoration |

Correct these observed implementation defects:

- The time chart repeatedly averages the previous average with the newest turn, which is not the arithmetic mean across all turns. Derive averages from completed turn durations.
- Time statistics use player names as dictionary keys, so duplicate names collide. Use stable player IDs throughout.
- The setup parser passes the name into the color field, and charts use a fixed color. Store and render the selected player color.
- Roll actions inconsistently update player turn counters. A completed turn must be recorded by the turn controls, independently of how many dice entries were made.
- Appending a roll while browsing earlier history should select the new last roll; it must not leave the selection pointing to an unrelated earlier entry.

**2. Product assumptions and boundaries**

These are implementation defaults, not additional requirements supplied by the user:

- One person operates the tracker on a shared phone, tablet, or laptop during a physical game.
- The first version runs entirely in the browser, with no account, server, database service, or live device synchronization.
- Additional players are added **during setup**. Lock roster membership and order after starting a session; starting a new game returns to setup. Midgame joins and removals are a later feature.
- Keep the existing minimum of two players. Support 5, 6, 8, and larger custom rosters without encoding official expansion rules or a six-player ceiling.
- Store one current session locally. Past-game libraries, cloud history, CSV export, installable/offline PWA behavior, scoring, trading, board simulation, and expansion-specific turn rules are out of scope for the first release.
- Browser-local data belongs to that browser and origin. Explain this in the README and a short save-status/help message.

**3. New repository and technical approach**

Create a sibling directory with its own Git history and `main` branch. Do not modify the original repository, create a branch inside it, or make the web app depend on its checkout. Copy this plan into `docs/implementation-plan.md` in the new repository. Preserve the original MIT copyright/license notice and add a README attribution link. Verify the destination does not already contain unrelated work before scaffolding.

Use React, TypeScript with strict checking, and Vite. A client-only application fits the scope and can produce static assets; Vite provides a React/TypeScript starter. Choose mutually compatible stable dependency versions at implementation time, commit the lockfile, and pin a supported Node version in project configuration. See the official [Vite setup guide](https://vite.dev/guide/) and [React guidance on app creation](https://react.dev/learn/creating-a-react-app).

- Use a reducer for domain transitions and React context only where sharing state is useful. Avoid a separate global-state library unless implementation exposes a concrete need.
- Use plain CSS or CSS modules and semantic HTML. Render the two simple charts with SVG/CSS, accompanied by text or tables; a chart dependency is optional, not required.
- Use Vitest for domain tests, React Testing Library for interaction checks, and Playwright for the critical browser workflows. Check current official setup instructions when installing them.
- Use a versioned `localStorage` document behind a storage adapter. Keep storage and browser clock access outside pure domain logic.
- Use one application entry screen with internal view state; routing infrastructure is unnecessary for this scope.

Suggested structure:

```text
src/
  app/                  # App composition, provider, view selection
  domain/
    types.ts
    reducer.ts          # Validated state transitions
    selectors.ts        # Dice frequencies and completed-turn statistics
    dice.ts             # Two independent d6 results; injectable RNG
  storage/              # Serialization, validation, restore, storage errors
  features/
    setup/              # Dynamic roster editor
    game/               # Active player, timer, dice entry, history, controls
    stats/              # Frequency chart, time chart, accessible tables
  components/           # Shared form and confirmation components
  styles/
tests/                  # Domain/component tests, or colocate these with src
e2e/
docs/implementation-plan.md
```

**4. Data model and invariants**

Use records similar to the following; adapt field names while preserving semantics:

```ts
type Player = { id: string; name: string; color: string };
type Roll = {
  id: string;
  turnId: string;
  playerId: string;
  total: number;
  dice: [number, number] | null; // null for manually entered totals
  source: 'generated' | 'manual';
  recordedAt: number;           // epoch milliseconds
};
type CompletedTurn = {
  id: string;
  playerId: string;
  durationMs: number;           // excludes pauses
  completedAt: number;
};
type ActiveTurn = {
  id: string;
  playerId: string;
  elapsedMs: number;            // accumulated time before current segment
  segmentStartedAt: number | null;
};
type Game = {
  schemaVersion: 1;
  id: string;
  players: Player[];            // array order is turn order
  phase: 'ready' | 'running' | 'paused' | 'finished';
  activeTurn: ActiveTurn | null;
  completedTurns: CompletedTurn[];
  rolls: Roll[];
};
```

- Generate IDs once when creating records. Never use display names or color strings as identity.
- Derive active player position from the ordered roster and player ID; advance with `(index + 1) % players.length`.
- Keep selected history index and setup draft separate from historical statistics. Clamp selection after reset/restore and select the latest item after adding a roll.
- Derive histogram counts for all eleven totals from `rolls`; derive percentages as `count / rolls.length * 100`. Empty data yields zero counts and no division by zero.
- Derive each player's completed-turn count, total time, and mean from `completedTurns`. An unfinished turn appears in the live timer only. Display an em dash for an average with no completed turns.
- Trim names, require nonempty names, and cap display-name length at a documented reasonable value such as 40 characters. Duplicate names are allowed and remain separate records; show seat numbers wherever necessary to distinguish them.
- Use valid color values and a palette with sensible defaults. Palette exhaustion must never limit roster size; always show name/seat labels in addition to color.

**5. Exact interaction and timing behavior**

Setup:

- Initially render Player 1 through Player 4 with distinct default colors.
- Add player appends a row with a new ID, default name, and usable color. Preserve existing input values.
- Remove and Move up/Move down controls operate on IDs and remain keyboard accessible. Prevent removal below two players. Explicit buttons are sufficient; drag-and-drop is unnecessary.
- Start game snapshots the roster, creates an active turn for the first player, and opens the dashboard in `ready` with a zero timer. The separate Start timer button begins timing, matching the original manual-start workflow.

Dice and history:

- Roll dice generates two independent integers from 1 through 6, displays both dice and their sum, and appends exactly one record. Do not sample uniformly from totals 2–12.
- Manual entry accepts only an integer total from 2 through 12. Reject blank, partial numeric strings, decimals, and out-of-range values without changing state.
- Each quick-entry button records its displayed total through the same action as manual entry.
- Recording rolls does not advance the turn or start/pause the timer. Allow multiple rolls per turn and roll recording while ready or paused, preserving the original separation of controls.
- Previous roll/Next roll browse existing entries only. Clearly distinguish these controls from Next turn. Disable unavailable navigation and show position/total.
- Disable dice and turn mutations once the session is finished.

Timer and turn transitions:

- Inject a timestamp into actions; reducers must not call the clock themselves.
- Start/resume sets `segmentStartedAt = now` and changes the phase to running.
- Display running elapsed time as `elapsedMs + max(0, now - segmentStartedAt)`. A rendering interval only refreshes the display; it must not increment stored elapsed time or drive correctness.
- Pause folds that running segment into `elapsedMs`, clears `segmentStartedAt`, and changes the phase to paused. Duplicate start/pause actions must not reset or double-count time.
- Disable Next turn in ready. In running or paused, Next turn finalizes the active duration once, appends one completed-turn record, advances to the next player, and immediately starts that player's new turn at zero. This preserves the original next-turn auto-start behavior, including from pause.
- End game requires confirmation. If the active turn has been started, finalize it once; if still ready, do not create a zero-duration completed turn. Set the phase to finished and clear the active turn. Keep final statistics and history visible.
- Reset game requires confirmation, clears rolls and turns, retains roster/order, selects the first player, and returns to ready with zero time.
- New game requires confirmation when it would discard a session, then opens setup with the current roster editable. First use alone defaults to four; resetting an eight-player session retains eight.

Autosave and browser lifecycle:

- Save atomically after committed domain transitions. Persist timestamps, not display ticks, so a running timer survives refresh without periodic full-session writes.
- On reload, validate and restore the saved session. Running time includes elapsed wall-clock time while the tab was hidden or closed; paused time remains unchanged. State this behavior in help text.
- Background timer throttling must not change the elapsed result. Clamp negative elapsed segments if the wall clock moves backward; document that manual system-clock changes can affect browser timing.
- Validate schema version, finite nonnegative durations/timestamps, unique IDs, references, roster size, legal roll values, and phase/active-turn consistency. Do not overwrite an unreadable or unsupported save automatically; offer an explicit reset while preserving the raw save until that choice.
- If storage is unavailable or full, keep the session working in memory and show that changes are not saved. Never report a successful save when writing failed.
- Detect changes from another tab and stop automatic writes in the stale tab until it reloads the newer state. Cross-tab simultaneous play is outside scope; avoid silently overwriting another tab's session.

**6. Layout and accessibility**

Design for use at a game table. On narrow screens, place the active player, large timer, Start/Pause, Next turn, and roll-entry controls before the charts. On wider screens, place controls alongside charts. Keep Reset/New game away from frequent actions.

Show a roll-frequency chart with counts and percentages, and a horizontal average-turn-duration chart with one row per player. Let the player chart grow vertically for larger rosters instead of shrinking labels into unreadable bars. Provide completed-turn counts and total time in a table. Keep all eleven dice totals visible even with no rolls.

Use labeled inputs, visible keyboard focus, accessible dialog focus management, and touch targets around 44 CSS pixels. Do not depend on hover or color alone. Announce active-player and roll changes appropriately without announcing every timer tick. Honor reduced-motion preferences if dice animation is added; animation must never create extra roll records.

**7. Implementation sequence and completion checks**

1. **Scaffold the independent repository.** Add the toolchain, license attribution, README, plan, and scripts for dev/build/preview/typecheck/lint/tests. Completion: the starter builds and has no reference to the source checkout at runtime.
2. **Implement the domain layer.** Build actions, transition guards, dice generation, timing calculations, and derived statistics before binding UI controls. Completion: deterministic tests cover the invariants below.
3. **Build setup and the playable dashboard.** Wire dynamic roster editing, timer controls, dice input, and history. Completion: a complete four-player session and an eight-player session both work through the same code paths.
4. **Add statistics and persistence.** Implement the charts/tables, autosave, restore, storage failure states, and tab-conflict handling. Completion: reload and pause preserve the documented timing semantics and data.
5. **Polish and validate.** Check narrow/wide layouts, keyboard navigation, long and duplicate names, colors, empty states, and destructive-action confirmations. Completion: the critical browser scenarios pass against the production build.
6. **Prepare repository delivery and hosting.** Add CI for install, typecheck, lint, tests, and build. Document static hosting; if targeting GitHub Pages, configure Vite's base path for `/catan-stats-web/` and verify asset loading under that path. The implementer should deliver the independent local Git repository and deployment-ready code. Creating/pushing a remote repository and enabling public hosting are follow-up actions under the implementation session's authorization; this planning request itself does not publish anything.

**8. Required verification scenarios**

- Setup initially contains exactly four editable players. Add a fifth, sixth, and eighth; edit/reorder/remove without losing identities or input values. No logic or layout assumes four or six is the maximum.
- With eight players, advancing eight completed turns returns to the first player. Duplicate names produce distinct statistics and turn ownership.
- Completed durations of 10, 20, and 60 seconds produce a mean of 30 seconds. Adding an unfinished turn does not change that mean.
- Start at time 0, pause at 10 seconds, resume at 30 seconds, and advance at 35 seconds: record 15 seconds, not 35. The next player is running at zero.
- Repeated resume or pause actions do not alter accumulated time. A reset clears prior elapsed segments and all derived counts.
- Restoring a running session includes time away; restoring a paused session does not. Hiding the tab does not make the timer run slowly.
- Exhaustively test all 36 combinations of injected d6 outcomes: sums have counts `1,2,3,4,5,6,5,4,3,2,1`. Avoid a flaky statistical randomness test.
- For rolls `[2, 7, 7, 12]`, counts are 1, 2, and 1 respectively, percentages 25%, 50%, and 25%, and every other total remains zero.
- Invalid manual entries leave rolls and statistics unchanged. Browsing history never changes them. Appending while viewing an old roll selects the newest record.
- Reset confirmation cancellation preserves the session; confirmation clears data and keeps the roster. End game counts the active timed turn once and rejects further mutations.
- Malformed/unsupported saves, failed storage writes, and another tab's update produce the intended recovery behavior without an unannounced overwrite.
- Browser checks cover setup → roll → pause/resume → next turn → reload → statistics → end/reset for four and eight players, plus a narrow phone viewport and desktop viewport.

**9. Final handoff from the implementing model**

Provide the new repository location (and remote URL only if created), a concise feature summary, exact setup/run commands, check results, and any remaining limitations. Include README screenshots of setup and the dashboard when tooling permits. Do not call the conversion complete with a static mockup: the controls, arbitrary roster handling, correct statistics, and save/restore flow must all work.

# The Settler’s Ledger — implementation record

## Audit (1 November 2026)

Baseline: 13 passing tests. React 19 / TypeScript / Vite, no backend. Domain transitions and statistics are pure. LocalStorage validates v1 sessions, preserves unreadable saves, detects competing writers, and reports storage failures. Existing desktop screen captured in `before-live.png`.

Preserve: independent generated dice, manual totals 2–12, newest-first history with an eight-row inspection window, stable player IDs and unrestricted roster size (minimum two), editable names/colors/order, separate timer start, pause exclusion, automatic timing on next turn, completed-turn arithmetic mean, confirmed end/reset/new, and wall-clock restoration. Duplicate names are valid. Unfinished turns must never enter timing statistics.

Synchronization constraints: localStorage is not transactional; client clock timestamps and whole-state writes cannot be multiplayer authority. Host identity must not be inferred from a player seat. Seat ownership must not follow names or presence.

## Three directions

1. **Turn desk**: a large active-turn surface, dice tray, narrow player ledger; secondary navigation for analytics/history. Best for one-handed entry and glanceability. Selected.
2. **Round table**: players arranged around a central dice tray. Strong tabletop association, but awkward for unbounded rosters and small screens.
3. **Statistical ledger**: full-width distribution and timing columns, compact controls above. Best for post-game analysis, weaker during play. Used for Insights and recap.

## Design system

Parchment and Dark Walnut use semantic surface/ink/line/accent tokens. Forest green actions, terracotta highlights, amber number tokens; player colors remain independent. Self-hosted Libre Caslon Display headings and DM Sans controls, tabular timing. Original vector terrain/map motif and settlement markers, restrained borders, minimal rounding. Desktop side ledger becomes horizontal lineup on mobile; bottom navigation keeps Live/Insights/History within reach. Native dialogs provide keyboard/focus handling. Motion respects reduced-motion preferences. None of the five named optional design skills was present in the installed skill catalog.

## Delivery checklist

- [x] Read source, tests, storage, deployment, and inspect baseline screenshot
- [x] Compare three layouts and establish design direction
- [x] Implement home, roster/lobby, live, insights, history, management, recap
- [x] Preserve validated v1 local saves and original statistical semantics
- [x] Implement versioned authoritative room commands and permission tests
- [x] Add anonymous auth, Spark-compatible Firestore transactions, subscriptions, seat approval, presence
- [x] Add deny-by-default Firestore rules and emulator security/concurrency tests
- [x] Verify desktop/mobile, both themes, reduced motion, build and Pages subpath
- [x] Document Firebase provisioning, deployment, tradeoffs, and verification limits

## Verification and refinements

- Original 13 tests preserved; regression coverage adds administrative boundaries, stale revisions/turn IDs, unclaimed seats, seat reassignment, late roster changes, corrections, room schema versions, and pre-timer reorder preservation.
- Desktop (1280 px) and phone (390 px) Playwright workflows cover all main local flows, persistence, competing writers, keyboard dialogs, generated dice/reduced motion, roster addition, correction/undo, and theme persistence. Axe checks cover home/setup and four game views in both themes.
- Emulator suite uses five isolated anonymous identities and direct Firestore attempts. It verifies outsider/auth rejection, admitted reads, room enumeration rejection, denied direct writes even from host, spectator/active/waiting boundaries, host-approved and concurrent claims, retry idempotency, concurrent next-turn rejection, realtime subscriptions, late new players, corrections, removal, and identity recovery. A two-browser desktop/phone run exercises the actual UI, offline locks, and reconnection.
- Built and tested the Windows executable: embedded assets, generated dice, reload, single-instance behavior, missing paths, and method rejection.
- Screenshot review tightened the mobile timer, corrected light-theme contrast, made the horizontally scrolling lineup keyboard-focusable, bundled fonts, and refined native-dialog focus restoration. Captures are in `docs/` and can be regenerated with `npm run screenshots`.
- Production dependencies audit clean in the frontend at verification time. Development tooling still reports moderate transitive advisories; no breaking downgrade was applied merely to silence audit output.
- Local redesign results: **23 unit/component tests passed; 18 browser tests passed; lint, TypeScript and production builds passed; emulator integration and two-browser shared play passed; Windows launcher checks passed.** CI repeats these checks but has not been run remotely.

## Spark-only provisioning follow-up (1 November 2026)

The user's free-only constraint supersedes the initial callable backend. Cloud Functions source, dependencies, emulator, and deployment target were removed. The current wire schema is v3, using server-timestamped timer segments in maps and a Firestore transaction for each aggregate/receipt/audit mutation. Security Rules validate exact active-seat transitions and restrict administrative changes to the immutable host identity. The domain model and v1 local saves remain unchanged. Tests now include malicious raw batches that bypass domain/UI checks, including ownership spoofing, roster/history replacement, incorrect dice, timer-clock injection, fake audit text, and commands from waiting/spectator/outsider identities.

The Firebase plugin provisioned the web app and default, free-tier-eligible Standard Firestore database in `catan-65500` (`us-central1`). Anonymous Authentication, authorized domains, rules, and index exemptions are deployed. Billing was checked after provisioning and remained disabled. A real-project two-browser test passed creation, approved joining, roll/turn synchronization, offline locking and reconnection; its QA game was completed afterward. No paid services, billing account, backups, or scheduled cleanup were enabled. See `firebase-setup.md` for the current setup instructions.

## Explicit limits

The frontend release uses the GitHub Pages workflow on `main`; deployment status is recorded in GitHub Actions. App Check is optional and unenforced; physical Safari/iOS remains unverified. Spark quotas can restrict service availability, and shared games have Firestore's 1 MiB document bound. Old-room cleanup and durable host-account recovery are future work. Presence is approximate; disconnection does not automatically pause tabletop time. Production credentials stay in the tool/CLI login, outside the repository; only the public Firebase web configuration is tracked.

# Firebase setup — Spark only, no billing account

The app uses **Firebase Authentication + Cloud Firestore on Spark**. GitHub Pages hosts the frontend. Cloud Functions, Cloud Run, paid hosting, billing accounts, and service-account keys are not used. Keep the project on Spark; do not attach a billing account or accept a paid trial.

## This project's configuration

- Project: `catan-65500` (Catan).
- Web app: `1:789535949519:web:c1e02233a9b8676ca02dba` (The Settler's Ledger).
- Firestore: `(default)`, Standard edition, Native mode, `us-central1`, free-tier eligible. Point-in-time recovery is disabled; no paid backups or TTL cleanup are configured.
- Authentication: anonymous sign-in enabled. Authorized domains include `tristanhaha.github.io`, `localhost`, `127.0.0.1`, and the project's Firebase domains.
- Public client configuration: `src/multiplayer/firebase-public.json`. This is public web configuration, not an Admin credential. Optional `VITE_FIREBASE_*` values override it for another environment.
- GitHub secret scanning can flag this Firebase browser key as a Google API key. That alert identifies the public project-routing key, not a service-account or login credential. Its API restrictions must remain limited to Firebase services; never add the Gemini Developer API. Authentication, Firestore rules and optional App Check enforce access. See [Firebase's API-key guidance](https://firebase.google.com/docs/projects/api-keys).
- `.firebaserc` selects this project. `firebase.json` deploys only anonymous Authentication configuration and Firestore rules/index exemptions. It has no Functions target.

On 1 November 2026, the web app/database were provisioned, anonymous Authentication and Firestore rules/index configuration were deployed, and a two-browser test passed against the real project. Billing was checked separately and remained **disabled**. The QA game was finished after verification. The frontend includes this public configuration and is published by the GitHub Pages workflow on pushes to `main`.

## Running and deploying

```sh
npm ci
npm run dev
# After signing in to the Firebase CLI with the project owner's account:
npx firebase deploy --only auth,firestore --project catan-65500
```

Deploy rules only after the emulator checks pass. The Pages workflow builds the static app with the public project configuration. GitHub variables are optional overrides, not required secrets. Do not place OAuth tokens, service-account JSON, or private keys in the repository, Vite configuration, or Pages assets.

For another project, create a Spark project/web app and its default free-tier Firestore database, enable anonymous Authentication, add your hosting domain, replace the public configuration, update `.firebaserc`, and deploy `auth,firestore`. Local-only play has no Firebase dependency.

## Tests

Java 21+ and the project's pinned Node version are required for emulators:

```sh
npm run typecheck
npm run lint
npm test
npm run build
npm run test:e2e
npm run test:multiplayer
```

`test:multiplayer` uses **only** `demo-settlers-ledger` with Auth at 9099 and Firestore at 8080. It tests the actual transaction adapter and raw malicious writes that bypass all client/domain checks. It also starts temporary Vite on 5174 and verifies the UI in desktop/phone browser contexts. No Functions emulator is involved. The integration test is skipped by ordinary `npm test` when no Firestore emulator is running.

For an explicitly requested live verification, PowerShell can run:

```powershell
$env:LEDGER_REAL_FIREBASE='true'
node scripts/test-multiplayer.mjs
Remove-Item Env:LEDGER_REAL_FIREBASE
```

That optional test creates real anonymous test identities and a QA room, uses a small amount of Spark quota, and finishes the game. The default test command never opts into production testing.

## Schema and authorization

| Path                                    | Purpose                                                                                                                                                                |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `roomCodes/{fourDigits}`                | Immutable server creation timestamp used to reserve short codes atomically; contains no room data or member identity                                                   |
| `rooms/{code}`                          | Wire schema v3: immutable host UID, revision, server creation/update timestamps, roster/turn order, directly claimed seats, timer segments, rolls, and completed turns |
| `rooms/{code}/members/{uid}`            | Display name, server join/last-seen timestamps, revocation state; legacy seat-request field retained for old clients                                                   |
| `rooms/{code}/receipts/{uid_commandId}` | Immutable receipt identifying the committed command/revision                                                                                                           |
| `rooms/{code}/events/{uid_commandId}`   | Immutable audit note with server timestamp and authenticated actor                                                                                                     |
| `accounts/{uid}`                        | Server timestamp and result of most recent room creation; enforces a ten-second per-identity cooldown                                                                  |
| `accounts/{uid}/creations/{requestId}`  | Immutable creation receipt for retrying the same request safely                                                                                                        |

The browser submits a Firestore transaction containing the updated room, receipt, and audit event. Rules use `getAfter()` to require these to commit together, preserve the original host UID and creation time, and increment the revision exactly once. A stale expected revision/turn is rejected by the transaction adapter; a raw modified client also cannot bypass the rules' transition checks. Immutable receipts make retries idempotent. Direct room enumeration, deletion, actor spoofing, self-promotion, and changes to another room are denied.

The host is the room's administrator and may correct/reset its game data. Other members have narrowly validated transitions: the claimed active player can append exactly one valid roll or perform an exact start/pause/next transition. Rules preserve previous rolls, timer segments, completed turns, roster, seat assignments, and turn order. Waiting players and spectators cannot change gameplay. The authorization source is `request.auth.uid`, never client role/host flags or display names. New members can create only their own spectator membership; admitted members can claim a free player, switch from their own previous player, or release their own player. Claims cannot replace another UID, change host authority, or modify gameplay. The host retains explicit release/assignment and revocation controls. Presence never grants ownership.

Native Firestore timestamps are stored in maps rather than timestamped array entries. Each timer segment has a server-issued start and end; rules require those transforms to equal `request.time`. Completed-turn durations are derived from those endpoints. A modified active client cannot inject a device clock, rewrite an earlier segment, move another player's turn, or replace historical data. `decode.ts` translates this representation back into the existing pure domain model. Local v1 saves remain unchanged. Old shared v2 emulator rooms are explicitly unsupported rather than silently reinterpreted; no production v2 rooms were deployed.

## Free-plan limits and behavior

Spark currently provides Firestore quotas including **50,000 document reads/day, 20,000 writes/day, 20,000 deletes/day, and 1 GiB stored data**. If the free limits are exhausted, service requests are restricted; the project is not configured for paid overages. Keep billing unlinked. [Firebase plans](https://firebase.google.com/docs/projects/billing/firebase-pricing-plans), [Firestore quotas](https://firebase.google.com/docs/firestore/quotas).

Gameplay commands generally write a room, receipt, event, and membership timestamp. Presence writes about once every 45 seconds per connected device; each subscriber also consumes document reads as the roster/presence updates. There is no arbitrary spectator cap, but large audiences or tabs left open for days can exhaust free quotas. Close or leave rooms when finished. Quota errors are surfaced; offline gameplay transactions are not silently queued. The server-enforced room document limit is 1 MiB; exceptionally long games need a future paged design. Nested timer/roll maps are exempted from indexing to reduce index growth.

The running timer continues when browsers disconnect or close, because physical play may continue. Pause explicitly to exclude time. The display estimates a browser/server offset from server responses; persisted durations remain based on server timestamps. Rejoining with the same browser identity restores its claimed player. If a player loses their browser identity, the host can release their previous player so the returning guest can select it again, preserving history. Lost **host** identity has no automated recovery; keep the host browser's data until the game finishes.

Optional Firestore App Check can use the client's reCAPTCHA v3 provider and `VITE_FIREBASE_APP_CHECK_KEY`; it has not been registered/enforced for this project. Do not enable enforcement until legitimate clients are tested. No paid reCAPTCHA Enterprise setup or Identity Platform upgrade is required here. Anonymous sign-up quotas and App Check can reduce abuse, but a publicly shared app can still have its free quota exhausted. Old room cleanup is manual; no paid scheduling or automatic data-deletion service is configured.

Implementation references: [transactions](https://firebase.google.com/docs/firestore/manage-data/transactions), [rules validation and atomic operations](https://firebase.google.com/docs/firestore/security/rules-conditions), [anonymous Authentication](https://firebase.google.com/docs/auth/web/anonymous-auth), [CLI Authentication configuration](https://firebase.google.com/docs/auth/configure-providers-cli).

## Four-digit codes and direct player selection

New rooms use zero-padded numeric codes (`0000`–`9999`). Creation atomically reserves an exact `roomCodes/{code}` document with the room, host membership, account throttle and creation receipt. Occupied codes are retried without overwriting saved rooms; retrying the same creation request returns its original code. Reservation enumeration is denied, and each reservation exposes only a timestamp to signed-in users. Existing twelve-character room IDs remain accepted for compatibility. There are 10,000 possible numeric codes; preserved rooms keep their code and no automatic deletion/reuse is introduced.

A `claim` command uses the same revision, immutable receipt and audit protocol as gameplay. Rules permit only adding the caller UID to one free player and removing their own previous assignment. Simultaneous selections of one player have one winner; selections of distinct players re-read after a competing revision while keeping the command receipt ID. Host/roster/game/timer fields cannot change in a claim. Requests and host approval are no longer part of the UI.

The host edits names, colors and order directly in the single player list. Valid edits save after a 450 ms typing pause and appear through existing Firestore snapshots. Starting stays disabled until the edits are saved. Presence shares each player row with ownership: Connected, Disconnected, or Available; unseated people appear in that same list. Leaving explicitly marks a member disconnected; unexpected disconnects are detected after at most about 90 seconds.

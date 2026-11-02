# Lobby UX review · November 2026

The requested [UI/UX Pro Max skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) is installed in the local Codex skills directory and was used for this audit and implementation. This review records the decisions that fit the app, rather than saving raw search recommendations.

## What made the original flow confusing

| Finding                                                                                  | Effect                                                     | Implemented change                                                                                                                                                                                    |
| ---------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fresh browsers opened a marketing page; saved browsers automatically opened a live game. | Desktop and phone appeared to have different entry pages.  | Every normal entry opens Game lobby. Saved games have an explicit Resume action.                                                                                                                      |
| Local setup, online setup, and Join were separate entry pages.                           | The route to playing with friends was unclear.             | Host and Join are two tabs in one responsive lobby, with the same content order on every device.                                                                                                      |
| An empty host name disabled the entire roster.                                           | A user could not customize players before entering a name. | The roster stays editable; the form validates the host name at submission.                                                                                                                            |
| All roster controls were exposed before creating a room.                                 | The first task was buried under configuration.             | Four seats are ready by default. Optional seat editing expands in place.                                                                                                                              |
| Sharing competed with game management.                                                   | Hosts had to infer how to invite friends.                  | The created lobby leads with Share this lobby, Copy invite link, a visible room code and URL, and native Share where supported. Copy feedback tells the host to paste the link into their group chat. |
| Host approvals followed a long roster on phones.                                         | Pending requests were difficult to find.                   | Hosts see Who’s joined before optional roster editing, consistently across screen sizes. Guests see seat choices first.                                                                               |
| Game tools appeared before the game started.                                             | Waiting and active-game states were hard to distinguish.   | Waiting rooms explain requests and approval. Game navigation and correction/reset tools appear after starting.                                                                                        |
| Every shared revision remounted the roster.                                              | Approving a seat could erase unsaved player edits.         | Only roster changes remount the editor. Start stays disabled while roster edits need saving.                                                                                                          |
| Small labels and controls reduced readability and precision.                             | Phones required more effort to read and tap.               | Text is at least 12px, form inputs are 16px, and roster controls have 44px targets with gaps.                                                                                                         |
| The default theme was light.                                                             | It did not match the requested appearance.                 | Fresh visits use Dark Walnut before React renders. Explicit saved Parchment preferences remain supported.                                                                                             |

## Skill guidance applied

The design-system searches for tabletop and multiplayer lobbies returned a marketing showcase, and the narrower gaming search suggested a heavy 3D/esports style. Neither matched this functional tabletop companion; no verified lobby pattern was found in those results. The fallback design judgment keeps the app’s walnut, felt-green, Caslon, and DM Sans identity, while applying the skill’s relevant navigation, progressive disclosure, semantic React forms, visible focus, touch target, contrast, reduced-motion, and responsive-layout guidance.

The interface uses SVG icons, native radios and disclosure controls, keyboard-operable tabs, a skip link, focus on navigation headings, browser Back support, safe-area spacing for mobile navigation, and explicit clipboard/share feedback. A failed clipboard request selects the visible URL so it can be copied manually. Replacing a saved local game still requires confirmation.

## Verification

- Type checking, lint, unit tests, and production build.
- Browser tests on desktop and phone, with entry checks at 375, 768, 1024, and 1440px.
- Saved-game resume, paused/running timers, corrupt saves, storage failures, competing tabs, history, corrections, and destructive-action confirmations.
- Automated WCAG A/AA checks for the lobby and game views in both themes, plus shared host and guest lobbies.
- Firebase demo-emulator integration and two isolated browsers: create, copy the actual invite URL, join, request/approve a seat, preserve a dirty roster during approval, save, start, synchronize rolls/turns, lock offline controls, and reconnect.
- Clipboard success/failure and native-share unit tests. Native share-sheet appearance remains device-dependent; it is offered only when the browser exposes the Web Share API.
- Desktop, mobile, and shared-lobby captures inspected after implementation.

The UI changes do not alter Firestore rules or provision any paid service. The existing Spark backend and GitHub Pages hosting are retained.

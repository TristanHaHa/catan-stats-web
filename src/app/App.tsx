import { useEffect, useState } from 'react';
import type { Game, Player } from '../domain/types';
import { createGame } from '../domain/reducer';
import { applyGameCommand, type GameCommand } from '../domain/commands';
import { KEY, SessionStorage } from '../storage/session';
import { multiplayerConfigured } from '../multiplayer/config';
import { canOperate } from '../multiplayer/model';
import { useRoom } from '../multiplayer/useRoom';
import { Confirm, Landscape, newPlayer, RosterEditor, uid } from './Primitives';
import { Insights } from './Insights';
import { RollDisplay } from './RollDisplay';
import { RollHistory } from './RollHistory';
import { RoomView } from './RoomView';
import { Live } from './Live';

type View = 'home' | 'setup' | 'join' | 'live' | 'insights' | 'history' | 'room';
function boot() {
  try {
    const adapter = new SessionStorage(window.localStorage);
    try {
      return { adapter, game: adapter.load(), error: '', corrupt: false };
    } catch {
      return {
        adapter,
        game: null,
        error:
          'Saved data could not be read. It will be preserved until you explicitly discard it.',
        corrupt: adapter.blocked,
      };
    }
  } catch {
    return {
      adapter: null,
      game: null,
      error: 'Storage unavailable. Changes are not saved.',
      corrupt: false,
    };
  }
}
function saved(key: string) {
  try {
    return localStorage.getItem(key) ?? '';
  } catch {
    return '';
  }
}
export function App() {
  const [initial] = useState(boot);
  const [localGame, setLocalGame] = useState<Game | null>(initial.game);
  const [roster, setRoster] = useState<Player[]>(
    () => initial.game?.players ?? Array.from({ length: 4 }, (_, i) => newPlayer(i)),
  );
  const [saveError, setSaveError] = useState(initial.error);
  const [corrupt, setCorrupt] = useState(initial.corrupt);
  const [stale, setStale] = useState(false);
  const [view, setView] = useState<View>(() =>
    new URLSearchParams(location.search).has('room') ? 'join' : initial.game ? 'live' : 'home',
  );
  const [setupMode, setSetupMode] = useState<'local' | 'shared'>('local');
  const [roomCode, setRoomCode] = useState(
    () => new URLSearchParams(location.search).get('room') ?? saved('ledger.room'),
  );
  const [displayName, setDisplayName] = useState('');
  const [theme, setTheme] = useState(() =>
    saved('ledger.theme') === 'walnut' ? 'walnut' : 'parchment',
  );
  const [now, setNow] = useState(Date.now());
  const [selection, setSelection] = useState((initial.game?.rolls.length ?? 0) - 1);
  const [notice, setNotice] = useState('');
  const [motion, setMotion] = useState<{ generated: boolean } | null>(null);
  const [confirmation, setConfirmation] = useState<{
    title: string;
    body: string;
    action: () => void;
  } | null>(null);
  const shared = useRoom();
  const game = shared.code ? (shared.room?.game ?? null) : localGame;
  const host = !shared.code || shared.room?.hostUid === shared.uid;
  const seated = shared.room?.game.players.find((p) => shared.room?.seats[p.id] === shared.uid);
  const role = !shared.code
    ? 'Table keeper'
    : host
      ? 'Host'
      : seated
        ? seated.id === game?.activeTurn?.playerId
          ? 'Your turn'
          : 'Waiting player'
        : 'Spectator';
  const controls =
    !!game &&
    game.phase !== 'finished' &&
    (!shared.code ||
      (!!shared.room &&
        shared.room.started &&
        canOperate(shared.room, shared.uid) &&
        shared.online &&
        shared.synced &&
        !shared.busy &&
        !shared.pending));
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem('ledger.theme', theme);
    } catch {
      /* Theme remains usable. */
    }
  }, [theme]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!motion) return;
    const timer = window.setTimeout(
      () => setMotion(motion.generated ? { generated: false } : null),
      motion.generated ? 530 : 200,
    );
    return () => window.clearTimeout(timer);
  }, [motion]);
  useEffect(() => {
    setSelection((game?.rolls.length ?? 0) - 1);
  }, [game?.rolls.length, game?.id]);
  useEffect(() => {
    const listener = (e: StorageEvent) => {
      if ((e.key === KEY || e.key === null) && initial.adapter?.changed(e.newValue)) {
        setStale(true);
        setSaveError(
          'Another tab changed this session. Reload to load its state; automatic saves are stopped.',
        );
      }
    };
    window.addEventListener('storage', listener);
    return () => window.removeEventListener('storage', listener);
  }, [initial]);
  function commit(next: Game | null) {
    setLocalGame(next);
    setNow(Date.now());
    try {
      if (!initial.adapter) throw new Error('Storage unavailable. Changes are not saved.');
      initial.adapter.save(next);
      setSaveError('');
    } catch (e) {
      setSaveError(
        `${e instanceof Error ? e.message : 'Storage write failed.'} Changes are not saved.`,
      );
      if (initial.adapter?.blocked) setStale(true);
    }
  }
  function dispatch(command: GameCommand) {
    if (!game) return;
    if (shared.code) {
      void shared.command(command);
      return;
    }
    try {
      commit(applyGameCommand(game, command, Date.now(), uid()));
      setNotice('');
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'Action unavailable.');
    }
  }
  function record(total: number, dice: [number, number] | null = null) {
    if (!controls) return;
    dispatch({ type: 'roll', total, dice });
    if (!shared.code)
      setMotion(
        window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
          ? null
          : { generated: dice !== null },
      );
  }
  function ask(title: string, body: string, action: () => void) {
    setConfirmation({ title, body, action });
  }
  function navigate(next: View) {
    setView(next);
    setNotice('');
    setMotion(null);
  }
  function chooseLocal() {
    if (shared.code) shared.leave();
    window.history.replaceState(null, '', location.pathname);
    setView(localGame ? 'live' : 'setup');
    setSetupMode('local');
  }
  function startLocal(players: Player[]) {
    if (shared.code) shared.leave();
    commit(createGame(players, uid(), uid()));
    setRoster(players);
    setView('live');
  }
  const selectedIndex = game ? Math.max(-1, Math.min(selection, game.rolls.length - 1)) : -1;
  const selected = game?.rolls[selectedIndex];
  const selectedSeat = game?.players.findIndex((p) => p.id === selected?.playerId) ?? -1;
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="masthead">
        <button
          className="brand"
          onClick={() => navigate('home')}
          aria-label="The Settler’s Ledger home"
        >
          <span className="brand-seal" aria-hidden="true">
            ⌂
          </span>
          <span>
            <b>The Settler’s Ledger</b>
            <small>A COMPANION FOR YOUR CATAN TABLE</small>
          </span>
        </button>
        <div className="header-actions">
          {game && (
            <button className="text-button return-table" onClick={() => navigate('live')}>
              Back to the table ↗
            </button>
          )}
          <button
            className="theme-switch"
            onClick={() => setTheme(theme === 'parchment' ? 'walnut' : 'parchment')}
            aria-label={`Switch to ${theme === 'parchment' ? 'Dark Walnut' : 'Parchment'} theme`}
          >
            <span aria-hidden="true">{theme === 'parchment' ? '◐' : '☼'}</span>
            <span>{theme === 'parchment' ? 'Dark Walnut' : 'Parchment'}</span>
          </button>
        </div>
      </header>
      {game && !['home', 'setup', 'join'].includes(view) && (
        <nav className="game-nav" aria-label="Game navigation">
          <div>
            {(['live', 'insights', 'history', 'room'] as const).map((tab, i) => (
              <button
                aria-current={view === tab ? 'page' : undefined}
                key={tab}
                onClick={() => navigate(tab)}
              >
                <span aria-hidden="true">{['⬡', '▥', '≡', '⌂'][i]}</span>
                {tab === 'live'
                  ? 'Live table'
                  : tab === 'room'
                    ? host
                      ? 'Game room'
                      : 'Room'
                    : tab[0].toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>
          <span className="nav-meta">
            {shared.code ? `ROOM ${shared.code}` : 'LOCAL TABLE'}
            <i /> {role}
          </span>
        </nav>
      )}
      <main id="main">
        {(saveError || shared.error || notice) && (
          <div className="warning" role="alert">
            {shared.error || notice || saveError}
            {stale && (
              <button onClick={() => window.location.reload()}>Reload saved session</button>
            )}
            {shared.pending && (
              <button disabled={shared.busy || !shared.online} onClick={() => void shared.retry()}>
                Retry pending command safely
              </button>
            )}
          </div>
        )}
        {corrupt && !shared.code ? (
          <section className="setup-sheet">
            <p className="eyebrow">YOUR LOCAL ARCHIVE</p>
            <h1>Your saved game needs attention</h1>
            <p>The original save has not been overwritten. Discard it to start fresh.</p>
            <button
              className="danger"
              onClick={() =>
                ask(
                  'Discard saved data',
                  'Permanently remove the unreadable save from this browser.',
                  () => {
                    try {
                      initial.adapter?.discard();
                      setCorrupt(false);
                      setStale(false);
                      setSaveError('');
                    } catch {
                      setSaveError('Could not discard saved data.');
                    }
                  },
                )
              }
            >
              Discard saved data
            </button>
          </section>
        ) : view === 'home' ? (
          <>
            <section className="home-hero">
              <div className="home-copy">
                <p className="eyebrow">
                  <span className="small-rule" /> FOR THE LOVE OF GAME NIGHT
                </p>
                <h1>
                  Every roll.
                  <br />
                  Every turn.
                  <br />
                  <em>A story to tell.</em>
                </h1>
                <p>
                  Your dice, your pace, your people. A thoughtful little companion for the island
                  you’re building together.
                </p>
                <div className="home-actions">
                  <button className="primary" onClick={chooseLocal}>
                    {localGame ? 'Resume local game' : 'Play on this device'} <span>→</span>
                  </button>
                  <button
                    onClick={() => {
                      setSetupMode('shared');
                      navigate('setup');
                    }}
                  >
                    Create a shared table
                  </button>
                </div>
                <button className="text-button join-link" onClick={() => navigate('join')}>
                  Have a room code? Join your friends ↗
                </button>
                {shared.code && (
                  <button className="text-button" onClick={() => navigate('live')}>
                    Resume room {shared.code} →
                  </button>
                )}
              </div>
              <div className="island-art">
                <Landscape />
                <span className="map-caption">AN ISLAND OF POSSIBILITY · A LEDGER OF CHANCE</span>
              </div>
            </section>
            <div className="home-footnotes">
              <div>
                <b>01 / Keep the game moving</b>
                <p>Quick dice entry. Clear turn timing. More time at the table.</p>
              </div>
              <div>
                <b>02 / Share the same story</b>
                <p>One device or a room full of friends, all following along.</p>
              </div>
              <div>
                <b>03 / Look a little closer</b>
                <p>See where the dice wandered and how the evening unfolded.</p>
              </div>
            </div>
          </>
        ) : view === 'setup' ? (
          <section className="setup-sheet">
            <button className="text-button back" onClick={() => navigate('home')}>
              ← Back
            </button>
            <p className="eyebrow">BEFORE THE FIRST ROLL</p>
            <h1>{setupMode === 'local' ? 'Gather around.' : 'Make room for everyone.'}</h1>
            <p>Set names, colors, and turn order. There’s a seat for everyone at your table.</p>
            {setupMode === 'shared' && (
              <>
                <div className="inset-note">
                  {multiplayerConfigured
                    ? 'Players can join now or later. You can play every unclaimed seat as host.'
                    : 'Shared tables need Firebase setup in this installation. Local games are ready to play. See the Firebase setup guide in the repository.'}
                </div>
                <label className="host-name">
                  Your name at the table
                  <input
                    required
                    maxLength={40}
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Table keeper"
                  />
                </label>
              </>
            )}
            <RosterEditor
              initial={roster}
              locked={
                shared.busy ||
                (setupMode === 'shared' && (!multiplayerConfigured || !displayName.trim()))
              }
              onSave={(players) => {
                if (setupMode === 'local') startLocal(players);
                else
                  void shared.create(players, displayName).then((ok) => {
                    if (ok) navigate('room');
                  });
              }}
              label={
                setupMode === 'local'
                  ? 'Start game →'
                  : shared.busy
                    ? 'Creating table…'
                    : 'Create shared table →'
              }
            />
          </section>
        ) : view === 'join' ? (
          <section className="join-sheet">
            <button className="text-button back" onClick={() => navigate('home')}>
              ← Back
            </button>
            <p className="eyebrow">PULL UP A CHAIR</p>
            <h1>Your table is waiting.</h1>
            <p>Join as a spectator, then ask the host for your seat. No account to create.</p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void shared.connect(roomCode, displayName).then((ok) => {
                  if (ok) navigate('room');
                });
              }}
            >
              <label>
                Room code
                <input
                  required
                  pattern="[A-Fa-f0-9]{12}"
                  maxLength={12}
                  autoCapitalize="characters"
                  className="code-input"
                  value={roomCode}
                  onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                  placeholder="12-character code"
                />
              </label>
              <label>
                Your display name
                <input
                  required
                  maxLength={40}
                  autoComplete="nickname"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="How should we call you?"
                />
              </label>
              {!multiplayerConfigured && (
                <p className="inset-note">
                  Firebase isn’t configured in this installation. You can still start a local game.
                </p>
              )}
              <button className="primary" disabled={!multiplayerConfigured || shared.busy}>
                {shared.busy ? 'Finding your table…' : 'Join the table →'}
              </button>
            </form>
          </section>
        ) : shared.code && !shared.room ? (
          <section className="setup-sheet" aria-busy="true">
            <h1>Opening the ledger…</h1>
            <p>Waiting for the shared table.</p>
            <button
              onClick={() => {
                shared.leave();
                navigate('home');
              }}
            >
              Return home
            </button>
          </section>
        ) : game ? (
          <>
            {view === 'room' ? (
              <RoomView
                game={game}
                shared={shared}
                host={host}
                onCommand={dispatch}
                onNotice={setNotice}
                onPlay={() => navigate('live')}
                onLeave={() => {
                  shared.leave();
                  navigate('home');
                }}
                ask={ask}
                onNew={() => {
                  setRoster(game.players);
                  commit(null);
                  navigate('setup');
                  setSetupMode('local');
                }}
              />
            ) : view === 'insights' || (game.phase === 'finished' && view === 'live') ? (
              <>
                <Insights game={game} recap={game.phase === 'finished'} />
                {game.phase === 'finished' && (
                  <div className="recap-actions">
                    <button onClick={() => navigate('history')}>Revisit the evening</button>
                    <button className="primary" onClick={() => navigate('room')}>
                      Back to game room →
                    </button>
                  </div>
                )}
              </>
            ) : view === 'history' ? (
              <>
                <div className="view-heading">
                  <p className="eyebrow">THE EVENING, UNFOLDED</p>
                  <h1>One roll leads to another.</h1>
                  <p>A read-only look back. Browsing never changes the live table.</p>
                </div>
                <div className="history-layout">
                  <section className="history-inspect">
                    <div
                      className={`history-view${selectedIndex < game.rolls.length - 1 ? ' viewing-past' : ''}`}
                    >
                      <span>
                        {selected
                          ? selectedIndex === game.rolls.length - 1
                            ? `Latest roll #${selectedIndex + 1}`
                            : `Viewing past roll #${selectedIndex + 1} of ${game.rolls.length}`
                          : 'Ready for your first roll'}
                      </span>
                      {selectedIndex < game.rolls.length - 1 && (
                        <button onClick={() => setSelection(game.rolls.length - 1)}>
                          Back to latest
                        </button>
                      )}
                    </div>
                    <RollDisplay
                      roll={selected}
                      seatLabel={`Seat ${selectedSeat + 1} · ${game.players[selectedSeat]?.name}`}
                      rolling={false}
                      fresh={false}
                    />
                  </section>
                  <RollHistory
                    rolls={game.rolls}
                    players={game.players}
                    selection={selectedIndex}
                    onSelect={setSelection}
                  />
                </div>
                <section className="ledger-section">
                  <h2>Notes from the table</h2>
                  <ol className="event-timeline">
                    {(shared.code
                      ? shared.events.filter((e) => e.text !== 'Dice recorded')
                      : [...(game.events ?? [])].reverse()
                    ).map((e) => (
                      <li key={e.id}>
                        <time>
                          {new Date(e.at).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </time>
                        <span>{e.text}</span>
                      </li>
                    ))}
                  </ol>
                  {!(shared.code ? shared.events.length : game.events?.length) && (
                    <p className="muted">Turn changes and host corrections will be noted here.</p>
                  )}
                  {shared.hasMoreEvents && (
                    <button onClick={shared.loadMoreEvents}>Load earlier notes</button>
                  )}
                </section>
              </>
            ) : (
              <Live
                game={game}
                shared={shared}
                host={host}
                role={role}
                controls={controls}
                now={now + (shared.code ? shared.offset : 0)}
                motion={motion}
                dispatch={dispatch}
                record={record}
                navigate={navigate}
                inspect={(index) => {
                  navigate('history');
                  setSelection(index);
                }}
              />
            )}
          </>
        ) : (
          <section className="setup-sheet">
            <h1>A fresh page awaits.</h1>
            <button onClick={chooseLocal}>Start a local game</button>
          </section>
        )}
      </main>
      <footer className="app-footer">
        <span
          className={
            shared.code && (!shared.online || !shared.synced)
              ? 'sync-status offline'
              : 'sync-status'
          }
          role="status"
        >
          <i />
          {shared.code
            ? !shared.online
              ? 'Offline · shared controls locked'
              : !shared.synced
                ? 'Connecting to the table…'
                : `Live room · ${role}`
            : saveError
              ? saveError
              : localGame
                ? 'Saved in this browser · Local table'
                : 'Made for good company & a little chance'}
        </span>
        <span>
          THE SETTLER’S LEDGER <b>✦</b> {theme === 'walnut' ? 'DARK WALNUT' : 'PARCHMENT'} EDITION
        </span>
      </footer>
      {confirmation && (
        <Confirm
          title={confirmation.title}
          onCancel={() => setConfirmation(null)}
          onConfirm={() => {
            confirmation.action();
            setConfirmation(null);
          }}
        >
          {confirmation.body}
        </Confirm>
      )}
    </div>
  );
}

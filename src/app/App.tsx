import { useEffect, useRef, useState } from 'react';
import type { Game, Player } from '../domain/types';
import { createGame } from '../domain/reducer';
import { applyGameCommand, type GameCommand } from '../domain/commands';
import { KEY, SessionStorage } from '../storage/session';
import { canOperate } from '../multiplayer/model';
import { useRoom } from '../multiplayer/useRoom';
import { Confirm, newPlayer, uid } from './Primitives';
import { Insights } from './Insights';
import { RollDisplay } from './RollDisplay';
import { RollHistory } from './RollHistory';
import { RoomView } from './RoomView';
import { Live } from './Live';
import { Lobby } from './Lobby';
import { Icon, type IconName } from './Icon';

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
    new URLSearchParams(location.search).has('room') ? 'join' : 'home',
  );
  const [setupMode, setSetupMode] = useState<'local' | 'shared'>('shared');
  const previousView = useRef(view);
  const [roomCode, setRoomCode] = useState(
    () => new URLSearchParams(location.search).get('room') ?? saved('ledger.room'),
  );
  const [displayName, setDisplayName] = useState(() => saved('ledger.name'));
  const [theme, setTheme] = useState(() =>
    saved('ledger.theme') === 'parchment' ? 'parchment' : 'walnut',
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
        ? !shared.room?.started
          ? 'Player'
          : seated.id === game?.activeTurn?.playerId
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
    document.documentElement.style.removeProperty('background');
    document.documentElement.style.removeProperty('color-scheme');
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', theme === 'walnut' ? '#25231e' : '#eee9de');
    try {
      localStorage.setItem('ledger.theme', theme);
    } catch {
      /* Theme remains usable. */
    }
  }, [theme]);
  useEffect(() => {
    const back = (event: PopStateEvent) => {
      const next = event.state?.ledgerView;
      setView(
        ['home', 'setup', 'join', 'live', 'insights', 'history', 'room'].includes(next)
          ? next
          : 'home',
      );
      setNotice('');
      setMotion(null);
    };
    window.addEventListener('popstate', back);
    return () => window.removeEventListener('popstate', back);
  }, []);
  useEffect(() => {
    if (previousView.current === view) return;
    previousView.current = view;
    const heading = document.querySelector<HTMLElement>('main h1');
    heading?.setAttribute('tabindex', '-1');
    heading?.focus({ preventScroll: true });
  }, [view]);
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
    if (next === view) {
      window.scrollTo({ top: 0, behavior: 'instant' });
      return;
    }
    window.history.pushState({ ledgerView: next }, '', `${location.pathname}${location.search}`);
    setView(next);
    setNotice('');
    setMotion(null);
    window.scrollTo({ top: 0, behavior: 'instant' });
  }
  function chooseLocal() {
    setSetupMode('local');
    navigate('setup');
  }
  function startLocal(players: Player[]) {
    const start = () => {
      if (shared.code) shared.leave();
      window.history.replaceState(null, '', location.pathname);
      commit(createGame(players, uid(), uid()));
      setRoster(players);
      navigate('live');
    };
    if (localGame)
      ask(
        'Replace saved game',
        'This clears the saved local game and its statistics. Start a new game with this roster?',
        start,
      );
    else start();
  }
  function rememberName() {
    try {
      localStorage.setItem('ledger.name', displayName.trim());
    } catch {
      /* Name remains usable. */
    }
  }
  function validName() {
    if (displayName.trim()) return true;
    setNotice('Enter your display name to join your friends.');
    document
      .querySelector<HTMLInputElement>('.lobby-panel:not([hidden]) input[autocomplete="nickname"]')
      ?.focus();
    return false;
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
          aria-label="The Settler’s Ledger lobby"
        >
          <span className="brand-seal" aria-hidden="true">
            <Icon name="lobby" />
          </span>
          <span>
            <b>The Settler’s Ledger</b>
            <small>A COMPANION FOR YOUR CATAN TABLE</small>
          </span>
        </button>
        <div className="header-actions">
          {!['home', 'setup', 'join'].includes(view) && (
            <button className="header-lobby" onClick={() => navigate('home')}>
              <Icon name="lobby" />
              Lobby
            </button>
          )}
          <button
            className="theme-switch"
            onClick={() => setTheme(theme === 'parchment' ? 'walnut' : 'parchment')}
            aria-label={`Switch to ${theme === 'parchment' ? 'Dark Walnut' : 'Parchment'} theme`}
          >
            <Icon name={theme === 'parchment' ? 'moon' : 'sun'} />
            <span>{theme === 'parchment' ? 'Dark Walnut' : 'Parchment'}</span>
          </button>
        </div>
      </header>
      {game &&
        (!shared.room || shared.room.started) &&
        !['home', 'setup', 'join'].includes(view) && (
          <nav className="game-nav" aria-label="Game navigation">
            <div>
              {(['live', 'insights', 'history', 'room'] as const).map((tab, i) => (
                <button
                  aria-current={view === tab ? 'page' : undefined}
                  key={tab}
                  onClick={() => navigate(tab)}
                >
                  <Icon name={(['dice', 'chart', 'history', 'users'] as IconName[])[i]} />
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
              {shared.code ? (host ? `ROOM ${shared.code}` : 'SHARED GAME') : 'LOCAL TABLE'}
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
        ) : ['home', 'setup', 'join'].includes(view) ? (
          <Lobby
            initialJoin={view === 'join'}
            initialLocal={view === 'setup' && setupMode === 'local'}
            roster={roster}
            localGame={localGame}
            connectedCode={shared.code}
            recentRoom={saved('ledger.room')}
            busy={shared.busy}
            roomCode={roomCode}
            displayName={displayName}
            setRoomCode={setRoomCode}
            setDisplayName={setDisplayName}
            onResume={(local) => {
              if (local) {
                if (shared.code) shared.leave();
                window.history.replaceState(null, '', location.pathname);
                navigate('live');
              } else navigate('room');
            }}
            onCreate={(players, online) => {
              if (!online) {
                startLocal(players);
                return;
              }
              if (!validName()) return;
              void shared.create(players, displayName.trim()).then((ok) => {
                if (ok) {
                  rememberName();
                  window.history.replaceState(null, '', location.pathname);
                  navigate('room');
                }
              });
            }}
            onJoin={() => {
              if (!validName()) return;
              void shared.connect(roomCode, displayName.trim()).then((ok) => {
                if (ok) {
                  rememberName();
                  window.history.replaceState(
                    null,
                    '',
                    `${location.pathname}?room=${roomCode.trim().toUpperCase()}`,
                  );
                  navigate('room');
                }
              });
            }}
          />
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
            {view === 'room' || (shared.room && !shared.room.started) ? (
              <RoomView
                game={game}
                shared={shared}
                host={host}
                onCommand={dispatch}
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
                : `${shared.room?.started ? 'Live room' : 'Lobby'} · ${role}`
            : saveError
              ? saveError
              : localGame
                ? 'Saved in this browser · Local table'
                : 'Ready for game night'}
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

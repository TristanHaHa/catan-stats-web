import type { Game } from '../domain/types';
import type { GameCommand } from '../domain/commands';
import { elapsed } from '../domain/reducer';
import { duration, frequencies } from '../domain/selectors';
import { rollDice } from '../domain/dice';
import type { RoomConnection } from '../multiplayer/useRoom';
import { Marker } from './Primitives';
import { RollDisplay } from './RollDisplay';
import { Distribution } from './Insights';
import { Icon } from './Icon';

export function Live({
  game,
  shared,
  host,
  role,
  controls,
  now,
  motion,
  dispatch,
  record,
  navigate,
  inspect,
}: {
  game: Game;
  shared: RoomConnection;
  host: boolean;
  role: string;
  controls: boolean;
  now: number;
  motion: { generated: boolean } | null;
  dispatch: (c: GameCommand) => void;
  record: (total: number, dice?: [number, number]) => void;
  navigate: (view: 'room' | 'history' | 'insights') => void;
  inspect: (index: number) => void;
}) {
  const active = game.players.find((p) => p.id === game.activeTurn?.playerId);
  const index = game.players.findIndex((p) => p.id === active?.id);
  const next = game.players[(index + 1) % game.players.length];
  const latest = game.rolls.at(-1);
  const common = [...frequencies(game)].sort((a, b) => b.count - a.count)[0];
  return (
    <>
      <div className="view-heading live-heading">
        <div>
          <p className="eyebrow">THE TABLE IS YOURS</p>
          <h1>{role === 'Spectator' ? 'Watching the game' : 'Live game'}</h1>
        </div>
        <span className="chapter">
          {game.players.length} players · {game.completedTurns.length} completed turns
        </span>
      </div>
      {shared.code && !shared.room?.started ? (
        <div className="inset-note">
          The host is preparing the table.{' '}
          <button onClick={() => navigate('room')}>Open lobby →</button>
        </div>
      ) : (
        <>
          <div className="live-layout">
            <section className="play-surface">
              <div className="turn-desk">
                <div className="section-heading">
                  <span className="eyebrow">CURRENT TURN</span>
                  <span className="turn-number">
                    Nº {String(game.completedTurns.length + 1).padStart(2, '0')}
                  </span>
                </div>
                <div className="active-player" aria-live="polite">
                  <Marker color={active?.color ?? '#777777'} large />
                  <div>
                    <small>
                      Seat {index + 1} ·{' '}
                      {game.phase === 'ready'
                        ? 'Ready to begin'
                        : game.phase === 'paused'
                          ? 'Taking a breath'
                          : 'On the island'}
                    </small>
                    <h2>{active?.name}</h2>
                  </div>
                </div>
                <div className="timer" aria-label="Elapsed turn time">
                  {duration(elapsed(game, now))}
                </div>
                <p className="timer-caption">
                  <i className={game.phase === 'running' ? 'running-dot' : ''} />
                  {game.phase === 'running'
                    ? 'The turn is in motion'
                    : game.phase === 'paused'
                      ? 'Timer paused · pauses excluded'
                      : 'Start the timer when you’re ready'}
                </p>
                <button
                  className="timer-control"
                  aria-label={
                    game.phase === 'running'
                      ? 'Pause timer'
                      : game.phase === 'paused'
                        ? 'Resume timer'
                        : 'Start timer'
                  }
                  disabled={!controls}
                  onClick={() => dispatch({ type: game.phase === 'running' ? 'pause' : 'start' })}
                >
                  {game.phase === 'running'
                    ? 'Ⅱ  Pause timer'
                    : game.phase === 'paused'
                      ? '▷  Resume timer'
                      : '▷  Start timer'}
                </button>
                <button
                  className="primary next-turn"
                  aria-label="Next turn →"
                  disabled={!controls || game.phase === 'ready'}
                  onClick={() => dispatch({ type: 'next' })}
                >
                  Next turn <span>→</span>
                </button>
                <p className="up-next">
                  UP NEXT{' '}
                  <b>
                    <Marker color={next.color} />
                    {next.name}
                  </b>
                </p>
              </div>
              <div className="dice-tray">
                <div className="section-heading">
                  <span className="eyebrow">THE DICE TRAY</span>
                  <span className="muted">{game.rolls.length} rolls recorded</span>
                </div>
                <RollDisplay
                  roll={latest}
                  seatLabel={
                    latest
                      ? `${game.players.find((p) => p.id === latest.playerId)?.name} · Latest roll`
                      : ''
                  }
                  rolling={!!motion?.generated}
                  fresh={!!motion && !motion.generated}
                />
                <button
                  className="primary roll-button"
                  aria-label="Roll dice"
                  disabled={!controls || !!motion?.generated}
                  onClick={() => {
                    const dice = rollDice();
                    record(dice[0] + dice[1], dice);
                  }}
                >
                  <Icon name="dice" /> Roll the dice
                </button>
                <div className="manual-heading">
                  <span /> or record your table’s dice <span />
                </div>
                <div className="manual-totals" aria-label="Record a dice total">
                  {Array.from({ length: 11 }, (_, i) => i + 2).map((total) => (
                    <button
                      key={total}
                      className={total === 6 || total === 8 ? 'red-total' : ''}
                      aria-label={`Record ${total}`}
                      disabled={!controls}
                      onClick={() => record(total)}
                    >
                      {total}
                    </button>
                  ))}
                </div>
                <p className="note">A roll records the result. Your turn stays with you.</p>
              </div>
            </section>
            <aside className="player-ledger">
              <div className="section-heading">
                <span className="eyebrow">AROUND THE TABLE</span>
                <span>{String(game.players.length).padStart(2, '0')}</span>
              </div>
              <ol tabIndex={0} aria-label="Player lineup in turn order">
                {game.players.map((p, i) => (
                  <li key={p.id} className={p.id === active?.id ? 'is-active' : ''}>
                    <span className="seat">{String(i + 1).padStart(2, '0')}</span>
                    <Marker color={p.color} />
                    <div>
                      <b>{p.name}</b>
                      <small>
                        {p.id === active?.id
                          ? 'Current turn'
                          : shared.code
                            ? shared.room?.seats[p.id]
                              ? 'Seat claimed'
                              : 'Host-operated seat'
                            : i === (index + 1) % game.players.length
                              ? 'Up next'
                              : 'At the table'}
                      </small>
                    </div>
                    {p.id === active?.id && (
                      <span className="turn-arrow" aria-hidden="true">
                        ←
                      </span>
                    )}
                  </li>
                ))}
              </ol>
              <button className="text-button" onClick={() => navigate('room')}>
                {host ? 'Manage the table' : 'Room & seats'} ↗
              </button>
            </aside>
          </div>
          {!controls && shared.code && (
            <p className="role-note">
              {!shared.online || !shared.synced
                ? 'Reconnecting. Shared controls are unavailable until the table is synchronized.'
                : shared.pending
                  ? 'A command is pending. Retry it safely before taking another action.'
                  : role === 'Spectator'
                    ? 'You’re watching the table. Choose an available player in the room to play.'
                    : `It’s ${active?.name}’s turn. Your controls return when your seat is active.`}
            </p>
          )}
          <div className="live-foot">
            <section className="recent-strip">
              <div className="section-heading">
                <h2>The last few rolls</h2>
                <button className="text-button" onClick={() => navigate('history')}>
                  Full history ↗
                </button>
              </div>
              {game.rolls.length ? (
                <ol>
                  {game.rolls
                    .slice(-7)
                    .reverse()
                    .map((r, i) => (
                      <li key={r.id}>
                        <button
                          aria-label={`Inspect roll ${game.rolls.indexOf(r) + 1}: ${r.total}`}
                          onClick={() => inspect(game.rolls.indexOf(r))}
                        >
                          <span
                            className={`number-token${r.total === 6 || r.total === 8 ? ' red-token' : ''}`}
                          >
                            {r.total}
                          </span>
                          <small>{i === 0 ? 'Latest' : `#${game.rolls.indexOf(r) + 1}`}</small>
                        </button>
                      </li>
                    ))}
                </ol>
              ) : (
                <p className="empty-note">The ledger is open. Your first roll will appear here.</p>
              )}
            </section>
            <section className="chance-preview">
              <div className="section-heading">
                <h2>A glimpse of chance</h2>
                <button className="text-button" onClick={() => navigate('insights')}>
                  Insights ↗
                </button>
              </div>
              <Distribution game={game} compact />
              <p className="note">
                {common.count
                  ? `${common.total} is among the most frequent totals · ${common.count} recorded`
                  : 'Every number has its own odds. Let’s see where the dice take you.'}
              </p>
            </section>
          </div>
        </>
      )}
    </>
  );
}

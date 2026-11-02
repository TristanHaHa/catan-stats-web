import { useState } from 'react';
import type { Game } from '../domain/types';
import type { GameCommand } from '../domain/commands';
import type { RoomConnection } from '../multiplayer/useRoom';
import { RosterEditor } from './Primitives';
import { InvitePanel } from './InvitePanel';
import { PlayerLobby } from './PlayerLobby';

type Props = {
  game: Game;
  shared: RoomConnection;
  host: boolean;
  onCommand: (command: GameCommand) => void;
  onPlay: () => void;
  onLeave: () => void;
  onNew: () => void;
  ask: (title: string, body: string, action: () => void) => void;
};
export function RoomView({ game, shared, host, onCommand, onPlay, onLeave, onNew, ask }: Props) {
  const [correction, setCorrection] = useState('7');
  const [rollId, setRollId] = useState('');
  const [target, setTarget] = useState(game.activeTurn?.playerId ?? '');
  const [rosterDirty, setRosterDirty] = useState(false);
  const waiting = !!shared.room && !shared.room.started;
  const disabled =
    !!shared.code && (shared.busy || !shared.online || !shared.synced || !!shared.pending);
  return (
    <>
      <div className="view-heading">
        <p className="eyebrow">
          {shared.room && !shared.room.started ? 'BEFORE THE FIRST ROLL' : 'KEEP A GOOD TABLE'}
        </p>
        <h1>{waiting ? 'Your game lobby' : 'Your game room.'}</h1>
        <p>
          {host
            ? waiting
              ? 'Invite your friends, let everyone choose a player, then start the game.'
              : 'Manage players and keep your game running smoothly.'
            : waiting
              ? 'Choose your player below. You’re ready as soon as you select a name.'
              : 'Manage your seat or return to the live game.'}
        </p>
      </div>
      {shared.code && host && <InvitePanel code={shared.code} />}
      {waiting && (
        <div className="lobby-ready-bar">
          <div>
            <b>{host ? 'Ready when your table is.' : 'Waiting for the host to start'}</b>
            <p>
              {host
                ? 'Friends can join later too. You can control any unclaimed seat.'
                : game.players.some((p) => shared.room?.seats[p.id] === shared.uid)
                  ? 'Your player is selected. You can open the game when it starts.'
                  : 'Choose your player below, or stay and watch.'}
            </p>
            {rosterDirty && (
              <p className="request-note">
                Player changes are saving. You can start when they’re ready.
              </p>
            )}
          </div>
          {host && (
            <button
              className="primary"
              disabled={disabled || rosterDirty}
              onClick={() =>
                void shared.command({ type: 'begin' }).then((ok) => {
                  if (ok) onPlay();
                })
              }
            >
              Start game →
            </button>
          )}
        </div>
      )}
      {!waiting && shared.code && (
        <div className="lobby-ready-bar">
          <p>
            {game.phase === 'finished'
              ? 'This game is complete. Your recap is ready.'
              : 'The game has started. Your table is live.'}
          </p>
          <button className="primary" onClick={onPlay}>
            {game.phase === 'finished' ? 'View recap →' : 'Go to game →'}
          </button>
        </div>
      )}
      {shared.code ? (
        <PlayerLobby shared={shared} host={host} onDirtyChange={setRosterDirty} ask={ask} />
      ) : (
        <div className="room-layout">
          <section className="ledger-section">
            <div className="section-heading">
              <h2>Players & turn order</h2>
              <button className="text-button" onClick={onPlay}>
                Back to play →
              </button>
            </div>
            <p className="note">
              Edit names, colors, and turn order. Existing players keep their statistics.
            </p>
            <RosterEditor
              key={`${game.id}-${JSON.stringify(game.players)}`}
              initial={game.players}
              label="Save roster"
              allowRemove={false}
              onSave={(players) => onCommand({ type: 'roster', players })}
            />
          </section>
        </div>
      )}
      {host && !waiting && (
        <section className="host-controls ledger-section">
          <span className="eyebrow">TABLE KEEPER’S TOOLS</span>
          <h2>Keep the ledger honest.</h2>
          <fieldset disabled={disabled}>
            <div className="host-tool">
              <div>
                <h3>Correct a recorded roll</h3>
                <p>Original time and seat are retained. Corrections appear in history.</p>
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  ask(
                    'Correct roll',
                    'Replace this recorded total. The correction is noted in history.',
                    () =>
                      onCommand({
                        type: 'correct-roll',
                        rollId: rollId || game.rolls.at(-1)!.id,
                        total: Number(correction),
                      }),
                  );
                }}
              >
                <label>
                  Roll
                  <select
                    value={rollId || game.rolls.at(-1)?.id || ''}
                    onChange={(e) => setRollId(e.target.value)}
                  >
                    {game.rolls.map((r, i) => (
                      <option key={r.id} value={r.id}>
                        #{i + 1} · {r.total}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Total
                  <select value={correction} onChange={(e) => setCorrection(e.target.value)}>
                    {Array.from({ length: 11 }, (_, i) => (
                      <option key={i}>{i + 2}</option>
                    ))}
                  </select>
                </label>
                <button disabled={!game.rolls.length}>Correct roll</button>
              </form>
            </div>
            <div className="host-tool">
              <div>
                <h3>Undo the latest roll</h3>
                <p>Remove a mistaken entry without changing the turn.</p>
              </div>
              <button
                disabled={!game.rolls.length}
                onClick={() =>
                  ask(
                    'Undo latest roll',
                    'Remove the latest roll from all statistics. A correction note is retained.',
                    () => onCommand({ type: 'undo-roll' }),
                  )
                }
              >
                Undo latest roll
              </button>
            </div>
            <div className="host-tool">
              <div>
                <h3>Advance to a different player</h3>
                <p>Completes the current timed turn and starts the selected player.</p>
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  ask(
                    'Change active player',
                    'Complete the current turn and start timing the selected player.',
                    () => onCommand({ type: 'active', playerId: target }),
                  );
                }}
              >
                <label className="sr-only" htmlFor="active-seat">
                  Active player
                </label>
                <select id="active-seat" value={target} onChange={(e) => setTarget(e.target.value)}>
                  {game.players.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <button
                  disabled={game.phase === 'finished' || (!!shared.room && !shared.room.started)}
                >
                  Change player
                </button>
              </form>
            </div>
            <div className="session-actions">
              <button
                disabled={game.phase === 'finished' || (!!shared.room && !shared.room.started)}
                onClick={() =>
                  ask(
                    'End game',
                    'Complete the active timed turn and preserve the final statistical recap.',
                    () => {
                      onCommand({ type: 'end' });
                      onPlay();
                    },
                  )
                }
              >
                End game
              </button>
              <button
                className="danger-text"
                onClick={() =>
                  ask(
                    'Reset game',
                    'Permanently clear dice and timing statistics, keeping the roster. Shared room audit notes remain.',
                    () => onCommand({ type: 'reset' }),
                  )
                }
              >
                Reset game
              </button>
              {!shared.code && (
                <button
                  onClick={() =>
                    ask(
                      'New game',
                      'Discard this local session and return to editable player setup.',
                      onNew,
                    )
                  }
                >
                  New game
                </button>
              )}
            </div>
          </fieldset>
        </section>
      )}
      {shared.code && (
        <div className="room-exit">
          <p className="note">
            Your seat and statistics remain when you leave. Anonymous identity is tied to this
            browser.
          </p>
          <button onClick={onLeave}>Leave room</button>
        </div>
      )}
    </>
  );
}

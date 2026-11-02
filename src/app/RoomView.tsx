import { useState } from 'react';
import type { Game } from '../domain/types';
import type { GameCommand } from '../domain/commands';
import type { RoomConnection } from '../multiplayer/useRoom';
import { Marker, RosterEditor } from './Primitives';
import { InvitePanel } from './InvitePanel';

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
  const member = shared.members.find((m) => m.uid === shared.uid);
  const memberPanel = shared.code ? (
    <section className="ledger-section">
      <span className="eyebrow">CONNECTED COMPANY</span>
      <h2>Who’s joined</h2>
      <p className="note">
        {waiting
          ? 'Friends appear here when they join. Approve a seat request so they can take turns.'
          : 'Offline seats stay in turn order. The timer continues until paused.'}
      </p>
      <ul className="member-list">
        {shared.members.map((m) => {
          const seat = game.players.find((p) => shared.room?.seats[p.id] === m.uid);
          return (
            <li key={m.uid}>
              <div>
                <b>
                  {m.name}
                  {m.uid === shared.uid ? ' (you)' : ''}
                </b>
                <small>
                  {m.revoked
                    ? 'Access removed'
                    : m.uid === shared.room?.hostUid
                      ? 'Host'
                      : seat
                        ? seat.name
                        : 'Spectator'}{' '}
                  · {Date.now() - m.lastSeen < 90000 ? 'Connected' : 'Away'}
                </small>
                {m.requestedSeat && (
                  <small className="request-note">
                    Requests {game.players.find((p) => p.id === m.requestedSeat)?.name}
                  </small>
                )}
              </div>
              {host && (
                <div className="member-actions">
                  <label className="sr-only" htmlFor={`assign-${m.uid}`}>
                    Assign seat to {m.name}
                  </label>
                  <select
                    id={`assign-${m.uid}`}
                    value={seat?.id ?? ''}
                    disabled={disabled || m.revoked}
                    onChange={(e) => {
                      const id = e.target.value;
                      if (id)
                        ask(
                          'Assign seat',
                          'This replaces the seat’s previous owner and keeps all of its statistics.',
                          () =>
                            void shared.command({
                              type: 'assign',
                              playerId: id,
                              memberUid: m.uid,
                            }),
                        );
                      else if (seat)
                        ask(
                          'Release seat',
                          'The player becomes a spectator. The seat and its statistics remain.',
                          () =>
                            void shared.command({
                              type: 'assign',
                              playerId: seat.id,
                              memberUid: null,
                            }),
                        );
                    }}
                  >
                    <option value="">Spectator</option>
                    {game.players.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                        {shared.room?.seats[p.id] ? ' · claimed' : ''}
                      </option>
                    ))}
                  </select>
                  {m.requestedSeat && !m.revoked && (
                    <button
                      disabled={disabled}
                      onClick={() =>
                        void shared.command({
                          type: 'assign',
                          playerId: m.requestedSeat!,
                          memberUid: m.uid,
                        })
                      }
                    >
                      Approve seat
                    </button>
                  )}
                  {m.uid !== shared.uid && (
                    <button
                      className="text-button danger-text"
                      disabled={disabled}
                      onClick={() =>
                        ask(
                          m.revoked ? 'Restore member' : 'Remove member',
                          m.revoked
                            ? 'Allow this identity to rejoin the room.'
                            : 'Remove room access and release their seat. Their recorded history remains.',
                          () => void shared.manageMember(m.uid, !m.revoked),
                        )
                      }
                    >
                      {m.revoked ? 'Restore' : 'Remove'}
                    </button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {host && (
        <p className="note">
          To promote a spectator into a new seat, add a player to the roster, save, then assign the
          seat here. Lost browser identity? Have them rejoin and reassign their original seat.
        </p>
      )}
    </section>
  ) : null;
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
              ? 'Invite your friends, approve their seats, then start the game.'
              : 'Manage players and keep your game running smoothly.'
            : waiting
              ? 'Choose a seat below. The host will approve your request and start the game.'
              : 'Manage your seat or return to the live game.'}
        </p>
      </div>
      {shared.code && <InvitePanel code={shared.code} />}
      {waiting && (
        <div className="lobby-ready-bar">
          <div>
            <b>{host ? 'Ready when your table is.' : 'Waiting for the host to start'}</b>
            <p>
              {host
                ? 'Friends can join later too. You can control any unclaimed seat.'
                : member?.requestedSeat
                  ? 'Seat requested. Waiting for the host to approve it.'
                  : game.players.some((p) => shared.room?.seats[p.id] === shared.uid)
                    ? 'Your seat is confirmed. You can open the game when it starts.'
                    : 'Request a seat below, or stay and watch as a spectator.'}
            </p>
            {rosterDirty && (
              <p className="request-note">Save your roster changes before starting.</p>
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
      <div className="room-layout">
        {host && memberPanel}
        <section className="ledger-section">
          <div className="section-heading">
            <div>
              <span className="eyebrow">THE PLAYER ROSTER</span>
              <h2>{host ? 'Players & turn order' : 'Choose your seat'}</h2>
            </div>
            {!waiting && !shared.code && (
              <button className="text-button" onClick={onPlay}>
                Back to play →
              </button>
            )}
          </div>
          {host ? (
            <>
              <p className="note">
                {shared.room && !shared.room.started
                  ? 'Start with unclaimed seats. Joining is optional; the host can play every seat.'
                  : 'Add players or change order without interrupting the current turn. Existing seats and their history are retained.'}
              </p>
              <RosterEditor
                key={`${game.id}-${JSON.stringify(game.players)}`}
                initial={game.players}
                locked={disabled}
                collapsible={waiting}
                saveDisabled={!rosterDirty}
                allowRemove={!!shared.room && !shared.room.started}
                label="Save roster"
                onDirtyChange={setRosterDirty}
                onSave={(players) => {
                  if (shared.code)
                    void shared.command({ type: 'roster', players }).then((ok) => {
                      if (ok) setRosterDirty(false);
                    });
                  else {
                    onCommand({ type: 'roster', players });
                    setRosterDirty(false);
                  }
                }}
              />
            </>
          ) : (
            <>
              <ol className="seat-claims">
                {game.players.map((p, i) => (
                  <li key={p.id}>
                    <Marker color={p.color} />
                    <span>
                      <b>
                        {i + 1}. {p.name}
                      </b>
                      <small>
                        {shared.room?.seats[p.id]
                          ? shared.room.seats[p.id] === shared.uid
                            ? 'Your seat'
                            : 'Claimed'
                          : 'Available · host approval required'}
                      </small>
                    </span>
                    {!shared.room?.seats[p.id] && (
                      <button
                        disabled={disabled || member?.requestedSeat === p.id}
                        onClick={() => void shared.requestSeat(p.id)}
                      >
                        {member?.requestedSeat === p.id ? 'Requested' : 'Request seat'}
                      </button>
                    )}
                  </li>
                ))}
              </ol>
              {member?.requestedSeat && (
                <button disabled={disabled} onClick={() => void shared.requestSeat(null)}>
                  Cancel seat request
                </button>
              )}
            </>
          )}
        </section>
        {!host && memberPanel}
      </div>
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

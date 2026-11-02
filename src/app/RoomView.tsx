import { useState } from 'react';
import type { Game } from '../domain/types';
import type { GameCommand } from '../domain/commands';
import type { RoomConnection } from '../multiplayer/useRoom';
import { Marker, RosterEditor } from './Primitives';

type Props = {
  game: Game;
  shared: RoomConnection;
  host: boolean;
  onCommand: (command: GameCommand) => void;
  onNotice: (text: string) => void;
  onPlay: () => void;
  onLeave: () => void;
  onNew: () => void;
  ask: (title: string, body: string, action: () => void) => void;
};
export function RoomView({
  game,
  shared,
  host,
  onCommand,
  onNotice,
  onPlay,
  onLeave,
  onNew,
  ask,
}: Props) {
  const [correction, setCorrection] = useState('7');
  const [rollId, setRollId] = useState('');
  const [target, setTarget] = useState(game.activeTurn?.playerId ?? '');
  const disabled =
    !!shared.code && (shared.busy || !shared.online || !shared.synced || !!shared.pending);
  const invite = `${location.origin}${location.pathname}?room=${shared.code}`;
  const member = shared.members.find((m) => m.uid === shared.uid);
  return (
    <>
      <div className="view-heading">
        <p className="eyebrow">
          {shared.room && !shared.room.started ? 'BEFORE THE FIRST ROLL' : 'KEEP A GOOD TABLE'}
        </p>
        <h1>{shared.room && !shared.room.started ? 'Everyone has a place.' : 'Your game room.'}</h1>
        <p>
          {host
            ? 'A little housekeeping, then back to the island.'
            : 'Find your seat, follow the game, and stay for the company.'}
        </p>
      </div>
      {shared.code && (
        <section className="invitation-strip">
          <div>
            <span className="eyebrow">INVITE YOUR TABLE</span>
            <strong className="room-code">{shared.code}</strong>
            <p>Share the link. Players can join at any time.</p>
          </div>
          <div className="invite-actions">
            <button
              onClick={() => {
                void navigator.clipboard
                  .writeText(invite)
                  .then(() => onNotice('Invitation link copied.'))
                  .catch(() => onNotice(`Copy this invitation: ${invite}`));
              }}
            >
              Copy invitation link ↗
            </button>
            <label>
              Invitation URL
              <input readOnly value={invite} onFocus={(e) => e.target.select()} />
            </label>
          </div>
        </section>
      )}
      <div className="room-layout">
        <section className="ledger-section">
          <div className="section-heading">
            <div>
              <span className="eyebrow">THE PLAYER ROSTER</span>
              <h2>In good company.</h2>
            </div>
            <button className="text-button" onClick={onPlay}>
              Back to play →
            </button>
          </div>
          {host ? (
            <>
              <p className="note">
                {shared.room && !shared.room.started
                  ? 'Start with unclaimed seats. Joining is optional; the host can play every seat.'
                  : 'Add players or change order without interrupting the current turn. Existing seats and their history are retained.'}
              </p>
              <RosterEditor
                key={`${game.id}-${shared.room?.revision ?? JSON.stringify(game.players)}`}
                initial={game.players}
                locked={disabled}
                allowRemove={!!shared.room && !shared.room.started}
                label="Save roster"
                onSave={(players) => onCommand({ type: 'roster', players })}
              />
              {shared.room && !shared.room.started && (
                <button
                  className="primary full-width"
                  disabled={disabled}
                  onClick={() =>
                    void shared.command({ type: 'begin' }).then((ok) => {
                      if (ok) onPlay();
                    })
                  }
                >
                  Open the table · start game →
                </button>
              )}
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
        {shared.code && (
          <section className="ledger-section">
            <span className="eyebrow">CONNECTED COMPANY</span>
            <h2>People at the table.</h2>
            <p className="note">
              Presence is approximate. Offline seats stay in turn order; the timer continues until
              paused.
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
                To promote a spectator into a new seat, add a player to the roster, save, then
                assign the seat here. Lost browser identity? Have them rejoin and reassign their
                original seat.
              </p>
            )}
          </section>
        )}
      </div>
      {host && (
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

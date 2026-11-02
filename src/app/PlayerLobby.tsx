import { useEffect, useRef, useState } from 'react';
import type { Player } from '../domain/types';
import { validRoster } from '../domain/reducer';
import type { RoomConnection } from '../multiplayer/useRoom';
import { Marker, newPlayer } from './Primitives';

type Props = {
  shared: RoomConnection;
  host: boolean;
  onDirtyChange: (dirty: boolean) => void;
  ask: (title: string, body: string, action: () => void) => void;
};
const normalized = (players: Player[]) => players.map((p) => ({ ...p, name: p.name.trim() }));
export function PlayerLobby({ shared, host, onDirtyChange, ask }: Props) {
  const players = shared.room!.game.players;
  const [draft, setDraft] = useState(players);
  const [dirty, setDirty] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const command = useRef(shared.command);
  command.current = shared.command;
  const locked = shared.busy || !shared.online || !shared.synced || !!shared.pending;
  const finished = shared.room!.game.phase === 'finished';
  const selected = players.find((p) => shared.room!.seats[p.id] === shared.uid);
  const valid = validRoster(draft);
  useEffect(() => {
    if (!dirty) setDraft(players);
    else if (JSON.stringify(normalized(draft)) === JSON.stringify(players)) {
      setDraft(players);
      setDirty(false);
      setSaveFailed(false);
      onDirtyChange(false);
    }
  }, [players, draft, dirty, onDirtyChange]);
  useEffect(() => {
    if (!host || !dirty || !valid || locked || saveFailed) return;
    const timer = window.setTimeout(() => {
      void command.current({ type: 'roster', players: normalized(draft) }).then((ok) => {
        if (!ok) setSaveFailed(true);
      });
    }, 450);
    return () => window.clearTimeout(timer);
  }, [host, draft, dirty, valid, locked, saveFailed]);
  function edit(next: Player[]) {
    setDraft(next);
    setDirty(true);
    setSaveFailed(false);
    onDirtyChange(true);
  }
  function move(index: number, step: number) {
    const next = [...draft];
    [next[index], next[index + step]] = [next[index + step], next[index]];
    edit(next);
  }
  const connected = (uid: string) => {
    const member = shared.members.find((m) => m.uid === uid);
    return (
      !!member &&
      !member.revoked &&
      member.lastSeen > Date.now() + shared.offset - 90000 &&
      (uid !== shared.uid || shared.online)
    );
  };
  const unseated = shared.members.filter(
    (m) => !Object.values(shared.room!.seats).includes(m.uid) && (!m.revoked || host),
  );
  const visible = host ? draft : players;
  return (
    <section className="players-panel ledger-section" aria-labelledby="players-title">
      <div className="section-heading">
        <div>
          <span className="eyebrow">ONE TABLE. EVERYONE TOGETHER.</span>
          <h2 id="players-title">Players</h2>
        </div>
        <span className="player-count">{players.length} players</span>
      </div>
      <p>
        {host
          ? 'Edit player names, colors, and turn order here. Changes appear on everyone’s screen automatically.'
          : 'Choose your player below. Names update live as the host edits them. You can switch to any available player.'}
      </p>
      <p className="player-save-status" role="status" aria-atomic="true">
        {host
          ? dirty
            ? !valid
              ? 'Enter a name for every player to save changes.'
              : saveFailed
                ? 'Player changes could not be saved. Try again.'
                : !shared.online
                  ? 'Offline. Player changes will save when you reconnect.'
                  : 'Saving player changes…'
            : 'Player changes saved. Friends can choose a player without approval.'
          : selected
            ? `You’re playing as ${selected.name}.`
            : 'Choose a player, or stay and watch.'}
      </p>
      {saveFailed && (
        <button disabled={locked} onClick={() => setSaveFailed(false)}>
          Retry player changes
        </button>
      )}
      <ul className="lobby-players" aria-label="Players and connection status">
        {visible.map((player, i) => {
          const ownerUid = shared.room!.seats[player.id];
          const owner = shared.members.find((m) => m.uid === ownerUid);
          const yours = ownerUid === shared.uid;
          const online = ownerUid && connected(ownerUid);
          return (
            <li className={`lobby-player${yours ? ' your-player' : ''}`} key={player.id}>
              <div className="lobby-player-main">
                <span className="seat">{String(i + 1).padStart(2, '0')}</span>
                <Marker color={player.color} />
                <div className="lobby-player-name">
                  {host ? (
                    <label>
                      Seat {i + 1} name
                      <input
                        required
                        maxLength={40}
                        disabled={!shared.online || !shared.synced}
                        value={player.name}
                        aria-invalid={!player.name.trim() || undefined}
                        onChange={(e) =>
                          edit(
                            draft.map((p) =>
                              p.id === player.id ? { ...p, name: e.target.value } : p,
                            ),
                          )
                        }
                      />
                    </label>
                  ) : (
                    <h3>{player.name}</h3>
                  )}
                  <small>
                    {owner
                      ? `${owner.name}${yours ? ' (you)' : ''}${owner.uid === shared.room!.hostUid ? ' · Host' : ''}`
                      : 'Choose this player to take their turns'}
                  </small>
                </div>
                <span
                  className={`connection-badge ${online ? 'connected' : ownerUid ? 'disconnected' : 'available'}`}
                >
                  <i aria-hidden="true" />
                  {ownerUid ? (online ? 'Connected' : 'Disconnected') : 'Available'}
                </span>
              </div>
              <div className="lobby-player-actions">
                {host && (
                  <div className="player-edit-controls">
                    <label className="player-color">
                      <span className="sr-only">Seat {i + 1} color</span>
                      <input
                        type="color"
                        disabled={!shared.online || !shared.synced}
                        value={player.color}
                        onChange={(e) =>
                          edit(
                            draft.map((p) =>
                              p.id === player.id ? { ...p, color: e.target.value } : p,
                            ),
                          )
                        }
                      />
                    </label>
                    <button
                      aria-label={`Move seat ${i + 1} up`}
                      disabled={i === 0 || !shared.online}
                      onClick={() => move(i, -1)}
                    >
                      ↑
                    </button>
                    <button
                      aria-label={`Move seat ${i + 1} down`}
                      disabled={i === visible.length - 1 || !shared.online}
                      onClick={() => move(i, 1)}
                    >
                      ↓
                    </button>
                    {!shared.room!.started && (
                      <button
                        aria-label={`Remove seat ${i + 1}`}
                        disabled={visible.length <= 2 || !shared.online}
                        onClick={() => edit(draft.filter((p) => p.id !== player.id))}
                      >
                        ×
                      </button>
                    )}
                  </div>
                )}
                {!ownerUid ? (
                  <button
                    className="choose-player"
                    aria-label={`Play as ${player.name} (seat ${i + 1})`}
                    disabled={locked || dirty || finished}
                    onClick={() => void shared.command({ type: 'claim', playerId: player.id })}
                  >
                    Choose player
                  </button>
                ) : yours ? (
                  <>
                    <span className="your-player-label">Your player</span>
                    <button
                      disabled={locked || dirty || finished}
                      onClick={() => void shared.command({ type: 'claim', playerId: null })}
                    >
                      Release player
                    </button>
                  </>
                ) : (
                  host && (
                    <button
                      disabled={locked || dirty}
                      onClick={() =>
                        ask(
                          'Release player',
                          'This makes the player available to choose again. Their statistics are kept.',
                          () =>
                            void shared.command({
                              type: 'assign',
                              playerId: player.id,
                              memberUid: null,
                            }),
                        )
                      }
                    >
                      Release player
                    </button>
                  )
                )}
                {host && owner && owner.uid !== shared.uid && (
                  <button
                    className="text-button danger-text"
                    disabled={locked}
                    onClick={() =>
                      ask(
                        'Remove member',
                        'Remove their lobby access and release their player. Recorded statistics remain.',
                        () => void shared.manageMember(owner.uid, true),
                      )
                    }
                  >
                    Remove guest
                  </button>
                )}
              </div>
            </li>
          );
        })}
        {unseated.map((member) => (
          <li className="lobby-watcher" key={member.uid}>
            <div>
              <b>
                {member.name}
                {member.uid === shared.uid ? ' (you)' : ''}
              </b>
              <small>
                {member.revoked
                  ? 'Access removed'
                  : `${member.uid === shared.room!.hostUid ? 'Host · ' : ''}Watching · no player chosen`}
              </small>
            </div>
            <span
              className={`connection-badge ${connected(member.uid) ? 'connected' : 'disconnected'}`}
            >
              <i aria-hidden="true" />
              {connected(member.uid) ? 'Connected' : 'Disconnected'}
            </span>
            {host && member.uid !== shared.uid && (
              <button
                className="text-button"
                disabled={locked}
                onClick={() =>
                  ask(
                    member.revoked ? 'Restore member' : 'Remove member',
                    member.revoked
                      ? 'Allow them to rejoin and choose a player.'
                      : 'Remove this guest’s lobby access. Statistics remain.',
                    () => void shared.manageMember(member.uid, !member.revoked),
                  )
                }
              >
                {member.revoked ? 'Restore' : 'Remove guest'}
              </button>
            )}
          </li>
        ))}
      </ul>
      {host && (
        <button
          className="text-button add"
          disabled={!shared.online || !shared.synced}
          onClick={() => edit([...draft, newPlayer(draft.length)])}
        >
          + Add player
        </button>
      )}
      <p className="note">
        Connection status updates automatically; an unexpected disconnect may take up to 90 seconds
        to appear. A disconnected player keeps their place and statistics.
      </p>
    </section>
  );
}

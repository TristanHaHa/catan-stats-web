import { useState } from 'react';
import type { Game, Player } from '../domain/types';
import { multiplayerConfigured } from '../multiplayer/config';
import { Icon } from './Icon';
import { Landscape, RosterEditor } from './Primitives';

type Props = {
  initialJoin: boolean;
  initialLocal: boolean;
  roster: Player[];
  localGame: Game | null;
  connectedCode: string;
  recentRoom: string;
  busy: boolean;
  roomCode: string;
  displayName: string;
  setRoomCode: (value: string) => void;
  setDisplayName: (value: string) => void;
  onResume: (local: boolean) => void;
  onCreate: (players: Player[], online: boolean) => void;
  onJoin: () => void;
};
export function Lobby(props: Props) {
  const [tab, setTab] = useState(props.initialJoin ? 'join' : 'host');
  const [online, setOnline] = useState(!props.initialLocal);
  return (
    <section className="lobby-page">
      <div className="lobby-heading">
        <p className="eyebrow">YOUR NEXT GAME STARTS HERE</p>
        <h1>Game lobby</h1>
        <p>Gather your friends. Build your island. Keep every roll.</p>
      </div>
      {(props.localGame || props.connectedCode || (props.recentRoom && !props.initialJoin)) && (
        <div className="resume-list">
          {props.connectedCode && (
            <div className="resume-card">
              <Icon name="users" />
              <div>
                <b>Your shared lobby is open</b>
                <p>Room {props.connectedCode} · return to your friends</p>
              </div>
              <button onClick={() => props.onResume(false)}>
                Open lobby <Icon name="arrow" />
              </button>
            </div>
          )}
          {!props.connectedCode && props.recentRoom && !props.initialJoin && (
            <div className="resume-card">
              <Icon name="users" />
              <div>
                <b>Your last shared lobby</b>
                <p>Room {props.recentRoom} · rejoin with this browser’s identity</p>
              </div>
              <button
                onClick={() => {
                  props.setRoomCode(props.recentRoom);
                  setTab('join');
                  document.getElementById('join-tab')?.focus();
                }}
              >
                Rejoin lobby <Icon name="arrow" />
              </button>
            </div>
          )}
          {props.localGame && (
            <div className="resume-card">
              <Icon name="dice" />
              <div>
                <b>
                  {props.localGame.phase === 'finished'
                    ? 'Your saved game recap'
                    : 'Pick up where you left off'}
                </b>
                <p>
                  {props.localGame.players.length} players · {props.localGame.rolls.length} rolls ·
                  saved on this device
                </p>
              </div>
              <button onClick={() => props.onResume(true)}>
                {props.localGame.phase === 'finished' ? 'View recap' : 'Resume game'}{' '}
                <Icon name="arrow" />
              </button>
            </div>
          )}
        </div>
      )}
      <div className="lobby-layout">
        <div className="lobby-card">
          <div className="lobby-tabs" role="tablist" aria-label="Lobby options">
            {['host', 'join'].map((value) => (
              <button
                key={value}
                id={`${value}-tab`}
                role="tab"
                aria-selected={tab === value}
                aria-controls={`${value}-panel`}
                tabIndex={tab === value ? 0 : -1}
                onClick={() => setTab(value)}
                onKeyDown={(e) => {
                  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
                  e.preventDefault();
                  const next =
                    e.key === 'Home'
                      ? 'host'
                      : e.key === 'End'
                        ? 'join'
                        : tab === 'host'
                          ? 'join'
                          : 'host';
                  setTab(next);
                  document.getElementById(`${next}-tab`)?.focus();
                }}
              >
                <Icon name={value === 'host' ? 'users' : 'link'} />
                {value === 'host' ? 'Host a game' : 'Join a game'}
              </button>
            ))}
          </div>
          <div
            className="lobby-panel"
            id="host-panel"
            role="tabpanel"
            aria-labelledby="host-tab"
            hidden={tab !== 'host'}
          >
            <h2>Make room for everyone.</h2>
            <fieldset className="mode-picker" disabled={props.busy}>
              <legend>How are you playing?</legend>
              {[true, false].map((value) => (
                <label key={String(value)} className={online === value ? 'selected' : ''}>
                  <input
                    type="radio"
                    name="play-mode"
                    checked={online === value}
                    onChange={() => setOnline(value)}
                  />
                  <Icon name={value ? 'users' : 'device'} />
                  <span>
                    <b>{value ? 'Online with friends' : 'One device'}</b>
                    <small>
                      {value ? 'Everyone uses their own phone' : 'Pass one screen around the table'}
                    </small>
                  </span>
                </label>
              ))}
            </fieldset>
            <p className="mode-explanation">
              {online
                ? 'Create a lobby, then share its invite link. Friends can join without an account.'
                : 'Track dice and turns on this device. Your game saves automatically in this browser.'}
            </p>
            {online && !multiplayerConfigured && (
              <p className="inset-note">
                Online lobbies are unavailable in this installation. Choose One device to play.
              </p>
            )}
            <RosterEditor
              initial={props.roster}
              collapsible
              locked={props.busy || (online && !multiplayerConfigured)}
              label={props.busy ? 'Creating lobby…' : online ? 'Create lobby' : 'Start game →'}
              onSave={(players) => props.onCreate(players, online)}
            >
              {online && (
                <label className="lobby-name">
                  Your name
                  <input
                    required
                    autoComplete="nickname"
                    maxLength={40}
                    value={props.displayName}
                    onChange={(e) => props.setDisplayName(e.target.value)}
                    placeholder="e.g. Alex"
                  />
                </label>
              )}
            </RosterEditor>
          </div>
          <div
            className="lobby-panel"
            id="join-panel"
            role="tabpanel"
            aria-labelledby="join-tab"
            hidden={tab !== 'join'}
          >
            <h2>Your friends are waiting.</h2>
            <p>
              Open their invite link or enter a room code. Once inside, choose your seat or follow
              along as a spectator.
            </p>
            <form
              className="join-form"
              onSubmit={(e) => {
                e.preventDefault();
                props.onJoin();
              }}
            >
              <label>
                Room code
                <input
                  required
                  pattern="([0-9]{4}|[A-Fa-f0-9]{12})"
                  inputMode="numeric"
                  maxLength={12}
                  autoCapitalize="characters"
                  autoCorrect="off"
                  spellCheck={false}
                  className="code-input"
                  value={props.roomCode}
                  onChange={(e) =>
                    props.setRoomCode(e.target.value.toUpperCase().replace(/\s/g, ''))
                  }
                  placeholder="4-digit code"
                  aria-describedby="code-hint"
                />
              </label>
              <p id="code-hint" className="field-hint">
                Ask the host for the code shown in their lobby.
              </p>
              <label>
                Your display name
                <input
                  required
                  maxLength={40}
                  autoComplete="nickname"
                  value={props.displayName}
                  onChange={(e) => props.setDisplayName(e.target.value)}
                  placeholder="e.g. Alex"
                />
              </label>
              {!multiplayerConfigured && (
                <p className="inset-note">Online lobbies are unavailable in this installation.</p>
              )}
              <button className="primary" disabled={props.busy || !multiplayerConfigured}>
                {props.busy ? 'Joining lobby…' : 'Join lobby'} <Icon name="arrow" />
              </button>
            </form>
          </div>
        </div>
        <aside className="lobby-guide" aria-label="How to play together">
          <div className="lobby-art">
            <Landscape />
          </div>
          <p className="eyebrow">GOOD COMPANY. ONE SHARED GAME.</p>
          <h2>A place for every player.</h2>
          <ol className="lobby-steps">
            <li>
              <span>1</span>
              <div>
                <b>Create your lobby</b>
                <p>Set up players and turn order. You’re the host.</p>
              </div>
            </li>
            <li>
              <span>2</span>
              <div>
                <b>Share the invite link</b>
                <p>Copy it into your group chat. Friends open it on their phones and join.</p>
              </div>
            </li>
            <li>
              <span>3</span>
              <div>
                <b>Choose players. Start playing.</b>
                <p>
                  Friends choose their own player. Start when you’re ready. Dice, turns, and stats
                  stay in sync.
                </p>
              </div>
            </li>
          </ol>
          <p className="lobby-reassurance">No accounts to create. No payment required.</p>
        </aside>
      </div>
    </section>
  );
}

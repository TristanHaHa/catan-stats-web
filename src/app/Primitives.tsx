import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import type { Player } from '../domain/types';
import { validRoster } from '../domain/reducer';

export const uid = () => crypto.randomUUID();
const colors = ['#bb4938', '#3277a0', '#d19a24', '#658254', '#8261a0', '#b45b82'];
export const newPlayer = (i: number): Player => ({
  id: uid(),
  name: `Player ${i + 1}`,
  color: colors[i % colors.length],
});
export function Marker({ color, large = false }: { color: string; large?: boolean }) {
  return (
    <svg
      className={`settlement${large ? ' large' : ''}`}
      style={{ '--player': color } as CSSProperties}
      viewBox="0 0 40 44"
      fill="none"
      aria-hidden="true"
    >
      <path d="M5 21 20 7l15 14v18H5Z" fill="currentColor" />
      <path
        d="m5 21 15-14 15 14M20 7v32"
        stroke="var(--paper)"
        strokeOpacity=".25"
        strokeWidth="2"
      />
      <path d="M1 41h38" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}
export function Landscape() {
  return (
    <svg
      className="landscape"
      viewBox="0 0 580 440"
      role="img"
      aria-label="Original illustrated hexagonal island with fields, forest, hills, and mountains"
    >
      <defs>
        <pattern id="waves" width="28" height="18" patternUnits="userSpaceOnUse">
          <path
            d="M0 8q7 6 14 0t14 0"
            fill="none"
            stroke="#547b7e"
            strokeWidth=".7"
            opacity=".25"
          />
        </pattern>
        <clipPath id="island">
          <path d="m290 38 209 121v169L290 449 81 328V159Z" />
        </clipPath>
      </defs>
      <circle cx="290" cy="230" r="204" fill="var(--sea)" opacity=".28" />
      <circle cx="290" cy="230" r="204" fill="url(#waves)" />
      <circle cx="290" cy="230" r="216" fill="none" stroke="var(--line)" strokeDasharray="3 9" />
      <g transform="translate(0 -20)" stroke="var(--paper)" strokeWidth="7" strokeLinejoin="round">
        <path d="m290 62 79 46v91l-79 46-79-46v-91Z" fill="#aaba83" />
        <path d="m132 153 79-45v91l79 46v91l-79 46-79-46-79-45v-91Z" fill="#41674d" />
        <path d="m369 108 79 45 79 46v91l-79 46-79-45-79-46 79-46Z" fill="#c8a45b" />
        <path d="m290 245 79 46v91l-79 46-79-46v-91Z" fill="#c9b384" />
        <path d="m132 245 79 46v91l-79-46-79-45Z" fill="#b96b4b" />
        <path d="m369 291 79 45-79 46Z" fill="#8a968d" />
      </g>
      <g fill="#284e3d">
        <path d="m115 165-20 36h12l-18 30h51l-18-30h12Z" />
        <path d="m159 184-17 29h10l-15 28h44l-15-28h10Z" />
        <path d="m131 224-20 34h12l-17 29h50l-17-29h12Z" />
      </g>
      <g fill="none" stroke="#927032" strokeWidth="2">
        <path d="M412 166v69m-13-57 13 10 13-10m-26 5 13 10 13-10m-26 5 13 10 13-10m-54 0v51m-10-42 10 8 10-8m-20 5 10 8 10-8m45 15v47m-10-39 10 9 10-9" />
      </g>
      <path d="m256 149 32-56 31 56Z" fill="#f0ebd7" />
      <path d="m256 149 32-56v56Z" fill="#879486" />
      <path d="m278 151 34-42 30 42Z" fill="#dce1c9" />
      <path d="m260 330 19-18 19 18v24h-38Z" fill="#b64b35" />
      <path d="m302 345 13-13 14 13v19h-27Z" fill="#d4a141" />
      <path
        d="m288 359 43 25m-77-16-35 20"
        stroke="#b67442"
        strokeWidth="6"
        strokeLinecap="round"
      />
      <g transform="translate(290 227)">
        <circle r="30" fill="#fbf1d5" stroke="#a68b53" strokeWidth="1.5" />
        <text y="7" textAnchor="middle" fontFamily="Georgia,serif" fontSize="28" fill="#a94830">
          8
        </text>
        <g fill="#a94830">
          <circle cx="-10" cy="17" r="1.8" />
          <circle cx="-5" cy="17" r="1.8" />
          <circle cy="17" r="1.8" />
          <circle cx="5" cy="17" r="1.8" />
          <circle cx="10" cy="17" r="1.8" />
        </g>
      </g>
      <path
        d="M480 44v48m-24-24h48m-24-24-7 24 7 24 7-24Z"
        stroke="var(--muted)"
        fill="none"
        strokeWidth="1"
      />
      <text
        x="480"
        y="34"
        textAnchor="middle"
        fill="var(--muted)"
        fontFamily="Georgia"
        fontSize="12"
      >
        N
      </text>
    </svg>
  );
}
export function Confirm({
  title,
  children,
  onCancel,
  onConfirm,
}: {
  title: string;
  children: ReactNode;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    ref.current?.showModal();
    return () =>
      window.queueMicrotask(() => {
        if (previous?.isConnected) previous.focus();
        else {
          const heading = document.querySelector<HTMLElement>('main h1');
          heading?.setAttribute('tabindex', '-1');
          heading?.focus({ preventScroll: true });
        }
      });
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby="confirm-title"
      onCancel={(e) => {
        e.preventDefault();
        ref.current?.close();
        onCancel();
      }}
    >
      <span className="eyebrow">A MOMENT AT THE TABLE</span>
      <h2 id="confirm-title">{title}?</h2>
      <p>{children}</p>
      <div className="actions">
        <button
          autoFocus
          onClick={() => {
            ref.current?.close();
            onCancel();
          }}
        >
          Cancel
        </button>
        <button
          className="danger"
          onClick={() => {
            ref.current?.close();
            onConfirm();
          }}
        >
          Confirm {title.toLowerCase()}
        </button>
      </div>
    </dialog>
  );
}
export function RosterEditor({
  initial,
  onSave,
  locked,
  allowRemove = true,
  label = 'Start game →',
}: {
  initial: Player[];
  onSave: (players: Player[]) => void;
  locked?: boolean;
  allowRemove?: boolean;
  label?: string;
}) {
  const [players, setPlayers] = useState(initial);
  function move(index: number, step: number) {
    const next = [...players];
    [next[index], next[index + step]] = [next[index + step], next[index]];
    setPlayers(next);
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (validRoster(players)) onSave(players);
      }}
    >
      <fieldset disabled={locked}>
        <legend className="sr-only">Player roster in turn order</legend>
        <div className="roster">
          {players.map((p, i) => (
            <div className="player-row" key={p.id}>
              <span className="seat">{String(i + 1).padStart(2, '0')}</span>
              <Marker color={p.color} />
              <label className="name-label">
                Seat {i + 1} name
                <input
                  required
                  maxLength={40}
                  value={p.name}
                  onChange={(e) =>
                    setPlayers(
                      players.map((v) => (v.id === p.id ? { ...v, name: e.target.value } : v)),
                    )
                  }
                />
              </label>
              <label className="color-label">
                Color
                <input
                  aria-label={`Seat ${i + 1} color`}
                  type="color"
                  value={p.color}
                  onChange={(e) =>
                    setPlayers(
                      players.map((v) => (v.id === p.id ? { ...v, color: e.target.value } : v)),
                    )
                  }
                />
              </label>
              <div className="row-actions">
                <button
                  type="button"
                  aria-label={`Move seat ${i + 1} up`}
                  disabled={i === 0}
                  onClick={() => move(i, -1)}
                >
                  ↑
                </button>
                <button
                  type="button"
                  aria-label={`Move seat ${i + 1} down`}
                  disabled={i === players.length - 1}
                  onClick={() => move(i, 1)}
                >
                  ↓
                </button>
                {allowRemove && (
                  <button
                    type="button"
                    aria-label={`Remove seat ${i + 1}`}
                    disabled={players.length <= 2}
                    onClick={() => setPlayers(players.filter((v) => v.id !== p.id))}
                  >
                    ×
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
        <button
          className="text-button add"
          type="button"
          onClick={() => setPlayers([...players, newPlayer(players.length)])}
        >
          + Add player
        </button>
        <div className="setup-footer">
          <span className="muted">
            {players.length} players · at least two seats
            <br />
            Names may repeat. Every seat stays distinct.
          </span>
          <button className="primary" disabled={!validRoster(players)}>
            {label}
          </button>
        </div>
      </fieldset>
    </form>
  );
}

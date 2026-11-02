import { useEffect, useRef } from 'react';
import type { Player, Roll } from '../domain/types';

export function RollHistory({
  rolls,
  players,
  selection,
  onSelect,
}: {
  rolls: Roll[];
  players: Player[];
  selection: number;
  onSelect: (index: number) => void;
}) {
  const list = useRef<HTMLOListElement>(null);
  const end = Math.min(rolls.length, Math.max(8, selection + 8));
  const start = Math.max(0, end - 8);
  const entries = rolls
    .slice(start, end)
    .map((roll, i) => ({ roll, index: start + i }))
    .reverse();
  useEffect(() => {
    const container = list.current;
    const selected = container?.querySelector<HTMLElement>('[aria-current="true"]');
    if (!container || !selected) return;
    const top = selected.offsetTop;
    if (top < container.scrollTop) container.scrollTop = top;
    else if (top + selected.offsetHeight > container.scrollTop + container.clientHeight)
      container.scrollTop = top + selected.offsetHeight - container.clientHeight;
  }, [selection, rolls.length]);
  return (
    <section className="roll-history" aria-labelledby="roll-log-title">
      <nav className="history" aria-label="Roll history">
        <button disabled={selection <= 0} onClick={() => onSelect(selection - 1)}>
          Previous roll
        </button>
        <span>{rolls.length ? `${selection + 1} / ${rolls.length}` : '0 / 0'}</span>
        <button disabled={selection >= rolls.length - 1} onClick={() => onSelect(selection + 1)}>
          Next roll
        </button>
      </nav>
      <div className="log-heading">
        <h3 id="roll-log-title">Roll log</h3>
        <span>{rolls.length ? `#${start + 1}–${end} · newest first` : 'No rolls yet'}</span>
      </div>
      <p className="log-help">
        Up to 8 entries. Select a row to inspect it; use Previous roll to go further back.
      </p>
      <ol className="roll-log" ref={list} aria-label="Recorded rolls">
        {entries.map(({ roll, index }) => {
          const seat = players.findIndex((p) => p.id === roll.playerId);
          return (
            <li key={roll.id}>
              <button
                aria-current={index === selection ? 'true' : undefined}
                onClick={() => onSelect(index)}
              >
                <span className="log-number">#{index + 1}</span>
                <b className="log-total">{roll.total}</b>
                <span className="log-detail">
                  <span>
                    Seat {seat + 1} · {players[seat]?.name}
                  </span>
                  <small>
                    {roll.dice ? `${roll.dice[0]} + ${roll.dice[1]} · Dice` : 'Manual'} ·{' '}
                    <time dateTime={new Date(roll.recordedAt).toISOString()}>
                      {new Date(roll.recordedAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })}
                    </time>
                  </small>
                </span>
                <span className="log-marker">
                  {index === selection ? 'Viewing' : index === rolls.length - 1 ? 'Latest' : ''}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

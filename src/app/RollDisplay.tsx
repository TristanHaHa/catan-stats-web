import { useEffect, useState } from 'react';
import type { Roll } from '../domain/types';

const pips: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};
function Die({ value }: { value: number }) {
  return (
    <div className="die" data-value={value}>
      {Array.from({ length: 9 }, (_, i) => (
        <i key={i} className={pips[value].includes(i) ? 'pip visible' : 'pip'} />
      ))}
    </div>
  );
}
export function RollDisplay({
  roll,
  seatLabel,
  rolling,
  fresh,
}: {
  roll: Roll | undefined;
  seatLabel: string;
  rolling: boolean;
  fresh: boolean;
}) {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    if (!rolling) return;
    const timer = window.setInterval(() => setFrame((f) => f + 1), 65);
    return () => window.clearInterval(timer);
  }, [rolling]);
  return (
    <div
      className={`roll-display${rolling ? ' is-rolling' : ''}${fresh && !rolling ? ' is-fresh' : ''}`}
    >
      {roll?.dice && (
        <div className="dice-pair" aria-hidden="true">
          <Die value={rolling ? (frame % 6) + 1 : roll.dice[0]} />
          <Die value={rolling ? ((frame + 3) % 6) + 1 : roll.dice[1]} />
        </div>
      )}
      <div className="roll-result" aria-live={rolling ? 'off' : 'polite'} aria-atomic="true">
        <strong>{rolling ? '…' : (roll?.total ?? '—')}</strong>
        <span>
          {rolling
            ? 'Rolling…'
            : roll
              ? roll.dice
                ? `${roll.dice[0]} + ${roll.dice[1]} · two dice`
                : 'Manually recorded'
              : 'Your next story starts with a roll'}
        </span>
        <small>{roll && seatLabel}</small>
      </div>
    </div>
  );
}

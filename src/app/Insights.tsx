import type { Game } from '../domain/types';
import { duration, frequencies, playerStats } from '../domain/selectors';
import { Marker } from './Primitives';

export function Distribution({ game, compact = false }: { game: Game; compact?: boolean }) {
  const values = frequencies(game).map((f) => ({
    ...f,
    expected: ((6 - Math.abs(7 - f.total)) / 36) * 100,
  }));
  const max = Math.max(20, ...values.map((f) => Math.max(f.percent, f.expected)));
  return (
    <div
      className={compact ? 'distribution compact' : 'distribution'}
      role="img"
      aria-label={`Dice distribution across ${game.rolls.length} recorded rolls. ${values.map((f) => `${f.total}: ${f.count} (${f.percent.toFixed(1)}%)`).join('; ')}. Expected probabilities shown as horizontal marks.`}
    >
      {values.map((f) => (
        <div
          className="distribution-column"
          key={f.total}
          title={`${f.total}: ${f.count} rolls · ${f.percent.toFixed(1)}% observed · ${f.expected.toFixed(1)}% expected`}
        >
          <span className="count">{f.count}</span>
          <div className="bar-space">
            <i
              className={`frequency-bar${f.total === 7 ? ' seven' : ''}`}
              style={{ height: `${(f.percent / max) * 100}%` }}
            />
            <i className="expected-mark" style={{ bottom: `${(f.expected / max) * 100}%` }} />
          </div>
          <b className={`number-token${f.total === 6 || f.total === 8 ? ' red-token' : ''}`}>
            {f.total}
          </b>
        </div>
      ))}
    </div>
  );
}
export function Insights({ game, recap = false }: { game: Game; recap?: boolean }) {
  const stats = playerStats(game);
  const values = frequencies(game);
  const common = [...values].sort((a, b) => b.count - a.count)[0];
  const totalTime = stats.reduce((sum, p) => sum + p.totalMs, 0);
  const maxMean = Math.max(1, ...stats.map((p) => p.meanMs ?? 0));
  return (
    <>
      <div className="view-heading">
        <p className="eyebrow">{recap ? 'THE FINAL CHAPTER' : 'A LITTLE PERSPECTIVE'}</p>
        <h1>{recap ? 'A game well spent.' : 'The story in the numbers.'}</h1>
        <p>
          {recap
            ? 'Good company, recorded in rolls and turns. Your final ledger is saved.'
            : 'A closer look at chance, pace, and your time around the table.'}
        </p>
      </div>
      <div className="ledger-metrics">
        <div>
          <span>Recorded rolls</span>
          <strong>{game.rolls.length}</strong>
        </div>
        <div>
          <span>Completed turn time</span>
          <strong>{duration(totalTime)}</strong>
        </div>
        <div>
          <span>Most frequent total</span>
          <strong>
            {common.count
              ? values
                  .filter((v) => v.count === common.count)
                  .map((v) => v.total)
                  .join(' · ')
              : '—'}
          </strong>
          <small>
            {common.count
              ? `${common.count} ${common.count === 1 ? 'time each' : 'times each'}`
              : 'Waiting for the first roll'}
          </small>
        </div>
      </div>
      <section className="ledger-section">
        <div className="section-heading">
          <div>
            <span className="eyebrow">THE DICE LEDGER</span>
            <h2>Chance has a pattern.</h2>
          </div>
          <span className="chart-key">
            <i /> Observed <em /> Expected
          </span>
        </div>
        <Distribution game={game} />
        <p className="note">
          Expected = independent, fair six-sided dice. Small samples naturally wander.
        </p>
        <details>
          <summary>All counts & percentages</summary>
          <div
            className="table-scroll"
            tabIndex={0}
            role="region"
            aria-label="Dice probabilities table"
          >
            <table>
              <caption>Dice total frequencies</caption>
              <thead>
                <tr>
                  <th>Total</th>
                  {values.map((f) => (
                    <th key={f.total}>{f.total}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th>Count</th>
                  {values.map((f) => (
                    <td key={f.total}>{f.count}</td>
                  ))}
                </tr>
                <tr>
                  <th>Observed</th>
                  {values.map((f) => (
                    <td key={f.total}>{f.percent.toFixed(1)}%</td>
                  ))}
                </tr>
                <tr>
                  <th>Expected</th>
                  {values.map((f) => (
                    <td key={f.total}>{(((6 - Math.abs(7 - f.total)) / 36) * 100).toFixed(1)}%</td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </details>
      </section>
      <section className="ledger-section">
        <div className="section-heading">
          <div>
            <span className="eyebrow">THE PACE OF PLAY</span>
            <h2>Everyone has their rhythm.</h2>
          </div>
          <span className="muted">Average completed turn</span>
        </div>
        <div className="time-comparison">
          {stats.map((p) => (
            <div className="time-row" key={p.id}>
              <span className="time-player">
                <Marker color={p.color} />
                {p.seat}. {p.name}
              </span>
              <div className="time-track">
                <i
                  style={{ width: `${((p.meanMs ?? 0) / maxMean) * 100}%`, background: p.color }}
                />
              </div>
              <b>{p.meanMs === null ? '—' : `${(p.meanMs / 1000).toFixed(1)}s`}</b>
            </div>
          ))}
        </div>
        <div className="table-scroll" tabIndex={0} role="region" aria-label="Player timing table">
          <table>
            <caption>
              Completed turn statistics · active and paused unfinished turns excluded
            </caption>
            <thead>
              <tr>
                <th>Player / seat</th>
                <th>Turns</th>
                <th>Total time</th>
                <th>Mean turn</th>
              </tr>
            </thead>
            <tbody>
              {stats.map((p) => (
                <tr key={p.id}>
                  <th>
                    {p.seat}. {p.name}
                  </th>
                  <td>{p.count}</td>
                  <td>{duration(p.totalMs)}</td>
                  <td>{p.meanMs === null ? '—' : `${(p.meanMs / 1000).toFixed(1)}s`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="note">
          Mean = total completed turn time ÷ completed turns. Pauses are excluded. These records
          don’t track victory points or a winner.
        </p>
      </section>
    </>
  );
}

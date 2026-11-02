import { describe, expect, it } from 'vitest';
import { createGame, elapsed, reducer } from '../src/domain/reducer';
import { frequencies, playerStats } from '../src/domain/selectors';
import { manualTotal, rollDice } from '../src/domain/dice';
import { KEY, parseGame, SessionStorage } from '../src/storage/session';
const roster = Array.from({ length: 8 }, (_, i) => ({
  id: `p${i}`,
  name: 'Same name',
  color: '#123456',
}));
const fresh = () => createGame(roster, 'game', 't0');
describe('turns and timing', () => {
  it('excludes pauses, ignores duplicate transitions and auto-starts next turn', () => {
    let g = fresh();
    expect(reducer(g, { type: 'next', now: 0, turnId: 't1' })).toBe(g);
    g = reducer(g, { type: 'start', now: 0 });
    g = reducer(g, { type: 'start', now: 5000 });
    g = reducer(g, { type: 'pause', now: 10000 });
    g = reducer(g, { type: 'pause', now: 20000 });
    expect(elapsed(g, 30000)).toBe(10000);
    g = reducer(g, { type: 'start', now: 30000 });
    g = reducer(g, { type: 'next', now: 35000, turnId: 't1' });
    expect(g.completedTurns[0].durationMs).toBe(15000);
    expect(g.phase).toBe('running');
    expect(elapsed(g, 35000)).toBe(0);
    expect(elapsed(g, 34000)).toBe(0);
  });
  it('cycles eight seats independently of names and rolls', () => {
    let g = reducer(fresh(), { type: 'start', now: 0 });
    for (let i = 1; i <= 8; i++) g = reducer(g, { type: 'next', now: i * 1000, turnId: `t${i}` });
    expect(g.activeTurn?.playerId).toBe('p0');
    expect(playerStats(g).map((p) => p.count)).toEqual(Array(8).fill(1));
  });
  it('computes an arithmetic mean only from completed turns', () => {
    const g = fresh();
    g.completedTurns = [10000, 20000, 60000].map((durationMs, i) => ({
      id: `done${i}`,
      playerId: 'p0',
      durationMs,
      completedAt: 100000,
    }));
    expect(playerStats(g)[0].meanMs).toBe(30000);
    expect(playerStats(g)[1].meanMs).toBeNull();
  });
  it('ends exactly once, rejects finished mutations and resets the roster', () => {
    expect(reducer(fresh(), { type: 'end', now: 100 }).completedTurns).toHaveLength(0);
    let g = reducer(fresh(), { type: 'start', now: 0 });
    g = reducer(g, { type: 'end', now: 10000 });
    expect(reducer(g, { type: 'end', now: 20000 })).toBe(g);
    expect(reducer(g, { type: 'start', now: 20000 })).toBe(g);
    const reset = reducer(g, { type: 'reset', id: 'new', turnId: 'newturn' });
    expect(reset.players).toEqual(roster);
    expect(reset.completedTurns).toEqual([]);
    expect(reset.phase).toBe('ready');
  });
});
describe('dice', () => {
  it('maps all 36 pairs to the two-dice distribution', () => {
    const counts = Array(11).fill(0);
    for (let a = 0; a < 6; a++)
      for (let b = 0; b < 6; b++) {
        const values = [a / 6, b / 6];
        const dice = rollDice(() => values.shift()!);
        counts[dice[0] + dice[1] - 2]++;
      }
    expect(counts).toEqual([1, 2, 3, 4, 5, 6, 5, 4, 3, 2, 1]);
  });
  it('rejects partial, decimal and out-of-range manual totals', () => {
    for (const value of ['', '7x', '7.0', '1', '13', '2e0', '-2'])
      expect(manualTotal(value)).toBeNull();
    expect(manualTotal('12')).toBe(12);
  });
  it('derives frequencies without completing turns', () => {
    let g = fresh();
    [2, 7, 7, 12].forEach((total, i) => {
      g = reducer(g, {
        type: 'roll',
        roll: {
          id: `r${i}`,
          playerId: 'p0',
          turnId: 't0',
          total,
          dice: null,
          source: 'manual',
          recordedAt: 0,
        },
      });
    });
    expect(
      frequencies(g)
        .filter((f) => f.count)
        .map((f) => [f.total, f.count, f.percent]),
    ).toEqual([
      [2, 1, 25],
      [7, 2, 50],
      [12, 1, 25],
    ]);
    expect(g.completedTurns).toHaveLength(0);
    expect(frequencies(fresh()).every((f) => f.percent === 0)).toBe(true);
  });
});
describe('storage', () => {
  it('restores timestamps for running and paused time', () => {
    const running = reducer(fresh(), { type: 'start', now: 1000 });
    expect(elapsed(parseGame(JSON.stringify(running)), 11000)).toBe(10000);
    const paused = reducer(running, { type: 'pause', now: 3000 });
    expect(elapsed(parseGame(JSON.stringify(paused)), 11000)).toBe(2000);
  });
  it('rejects invalid schema, references, identities and phase consistency', () => {
    const g = fresh();
    for (const invalid of [
      { ...g, schemaVersion: 2 },
      { ...g, players: [roster[0], roster[0]] },
      { ...g, activeTurn: null },
      { ...g, activeTurn: { ...g.activeTurn, elapsedMs: -1 } },
      { ...g, completedTurns: [{ id: 'bad', playerId: 'missing', durationMs: 0, completedAt: 0 }] },
    ])
      expect(() => parseGame(JSON.stringify(invalid))).toThrow();
  });
  it('preserves corrupt saves until explicitly discarded', () => {
    localStorage.clear();
    localStorage.setItem(KEY, '{bad');
    const storage = new SessionStorage(localStorage);
    expect(() => storage.load()).toThrow();
    expect(() => storage.save(fresh())).toThrow();
    expect(localStorage.getItem(KEY)).toBe('{bad');
    storage.discard();
    storage.save(fresh());
    expect(parseGame(localStorage.getItem(KEY)!).id).toBe('game');
  });
  it('detects another writer even before a storage event arrives', () => {
    localStorage.clear();
    const storage = new SessionStorage(localStorage);
    storage.load();
    localStorage.setItem(KEY, 'newer');
    expect(() => storage.save(fresh())).toThrow(/Another tab/);
    expect(localStorage.getItem(KEY)).toBe('newer');
  });
  it('reports failed writes', () => {
    const storage = new SessionStorage({
      getItem: () => null,
      setItem: () => {
        throw new Error('Quota exceeded');
      },
      removeItem: () => {},
    });
    storage.load();
    expect(() => storage.save(fresh())).toThrow('Quota');
  });
});

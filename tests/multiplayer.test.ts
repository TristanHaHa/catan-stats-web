import { describe, expect, it } from 'vitest';
import { applyGameCommand } from '../src/domain/commands';
import { createGame, elapsed } from '../src/domain/reducer';
import { playerStats } from '../src/domain/selectors';
import { parseGame } from '../src/storage/session';
import { parseRoom, transition, type Room, type RoomCommand } from '../src/multiplayer/model';
const players = [
  { id: 'p0', name: 'Alex', color: '#bb4938' },
  { id: 'p1', name: 'Alex', color: '#3277a0' },
];
function fresh(): Room {
  return {
    schemaVersion: 2,
    hostUid: 'host',
    revision: 0,
    started: true,
    createdAt: 0,
    updatedAt: 0,
    game: createGame(players, 'game', 'turn'),
    seats: { p0: 'active', p1: 'waiting' },
  };
}
function act(
  room: Room,
  uid: string,
  command: RoomCommand,
  now = 1000,
  id = `command-${room.revision}`,
) {
  return transition(
    room,
    uid,
    { id, revision: room.revision, turnId: room.game.activeTurn?.id ?? null, command },
    now,
  );
}
describe('authoritative command boundaries', () => {
  it('allows only the active seat or host to roll and operate timers', () => {
    for (const command of [
      { type: 'roll', total: 7, dice: null },
      { type: 'start' },
    ] as RoomCommand[]) {
      for (const uid of ['waiting', 'spectator', 'imposter'])
        expect(() => act(fresh(), uid, command)).toThrow(/permission/);
      for (const uid of ['active', 'host']) expect(act(fresh(), uid, command).revision).toBe(1);
    }
  });
  it('keeps every administrative command host-only even for the active seat', () => {
    const commands: RoomCommand[] = [
      { type: 'roster', players },
      { type: 'reset' },
      { type: 'end' },
      { type: 'active', playerId: 'p1' },
      { type: 'assign', playerId: 'p0', memberUid: 'spectator' },
      { type: 'undo-roll' },
      { type: 'correct-roll', rollId: 'roll', total: 8 },
    ];
    for (const c of commands)
      for (const uid of ['active', 'waiting', 'spectator'])
        expect(() => act(fresh(), uid, c)).toThrow(/permission/);
  });
  it('rejects duplicate/stale commands and incorrect turn IDs', () => {
    const initial = fresh();
    const started = act(initial, 'host', { type: 'start' });
    const envelope = {
      id: 'next',
      revision: started.revision,
      turnId: 'turn',
      command: { type: 'next' } as const,
    };
    const advanced = transition(started, 'active', envelope, 5000);
    expect(() => transition(advanced, 'host', envelope, 6000)).toThrow(/changed/);
    expect(() => transition(started, 'host', { ...envelope, turnId: 'other' }, 6000)).toThrow(
      /changed/,
    );
    expect(advanced.game.completedTurns).toHaveLength(1);
    expect(advanced.game.activeTurn?.playerId).toBe('p1');
  });
  it('starts with unclaimed seats and never skips them', () => {
    const room = { ...fresh(), seats: {}, started: false };
    let g = act(room, 'host', { type: 'begin' });
    g = act(g, 'host', { type: 'start' });
    g = act(g, 'host', { type: 'next' });
    expect(g.game.activeTurn?.playerId).toBe('p1');
    expect(() => act(g, 'spectator', { type: 'start' })).toThrow(/permission/);
  });
  it('assigns seats without changing past stats or conflating host identity', () => {
    let room = act(fresh(), 'host', { type: 'start' });
    room = act(room, 'host', { type: 'next' }, 11000);
    const before = room.game;
    room = act(room, 'host', { type: 'assign', playerId: 'p0', memberUid: 'host' });
    expect(room.hostUid).toBe('host');
    expect(room.seats.p0).toBe('host');
    expect(room.game).toBe(before);
    room = act(room, 'host', { type: 'assign', playerId: 'p1', memberUid: 'host' });
    expect(room.seats.p0).toBeUndefined();
    expect(playerStats(room.game)[0].totalMs).toBe(10000);
  });
});
describe('roster evolution and corrections', () => {
  it('preserves the active seat and untimed dice when reordering before timer start', () => {
    let game = applyGameCommand(fresh().game, { type: 'roll', total: 7, dice: null }, 0, 'r0');
    game = applyGameCommand(
      game,
      { type: 'roster', players: [...players].reverse() },
      1000,
      'edit',
    );
    expect(game.activeTurn?.playerId).toBe('p0');
    expect(parseGame(JSON.stringify(game))).toEqual(game);
    game = applyGameCommand(game, { type: 'end' }, 2000, 'end');
    expect(parseGame(JSON.stringify(game)).completedTurns).toEqual([]);
  });
  it('validates room versions and exclusive seat assignments', () => {
    expect(parseRoom(fresh())).toEqual(fresh());
    expect(() => parseRoom({ ...fresh(), schemaVersion: 3 })).toThrow(/Unsupported/);
    expect(() => parseRoom({ ...fresh(), seats: { p0: 'same', p1: 'same' } })).toThrow(
      /assignments/,
    );
  });
  it('adds and reorders midgame without interrupting active timing or history', () => {
    let room = act(fresh(), 'host', { type: 'start' });
    room = act(room, 'active', { type: 'roll', total: 7, dice: null });
    const turn = room.game.activeTurn;
    const rolls = room.game.rolls;
    const p2 = { id: 'p2', name: 'Late arrival', color: '#123456' };
    room = act(room, 'host', { type: 'roster', players: [players[1], p2, players[0]] }, 9000);
    expect(room.game.activeTurn).toBe(turn);
    expect(room.game.rolls).toBe(rolls);
    expect(elapsed(room.game, 11000)).toBe(10000);
    expect(parseGame(JSON.stringify(room.game))).toEqual(room.game);
    expect(() => act(room, 'host', { type: 'roster', players: [p2, players[0]] })).toThrow(
      /existing seats/,
    );
  });
  it('edits lobby player count and clears assignments for removed seats', () => {
    const room = { ...fresh(), started: false };
    const third = { id: 'p2', name: 'Third', color: '#123456' };
    const next = act(room, 'host', { type: 'roster', players: [players[1], third] });
    expect(next.seats.p0).toBeUndefined();
    expect(next.game.activeTurn?.playerId).toBe('p1');
  });
  it('corrects and undoes a roll without changing timing, IDs, or source provenance', () => {
    let g = applyGameCommand(fresh().game, { type: 'roll', total: 7, dice: [3, 4] }, 1000, 'r0');
    g = applyGameCommand(g, { type: 'correct-roll', rollId: 'r0', total: 8 }, 2000, 'c0');
    expect(g.rolls[0]).toMatchObject({
      id: 'r0',
      total: 8,
      recordedAt: 1000,
      source: 'manual',
      dice: null,
    });
    expect(g.events?.[0].text).toContain('7 to 8');
    expect(g.completedTurns).toEqual([]);
    g = applyGameCommand(g, { type: 'undo-roll' }, 3000, 'u0');
    expect(g.rolls).toEqual([]);
    expect(g.events).toHaveLength(2);
  });
});

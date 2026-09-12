import type { Game, Player, Roll } from './types';
export const validRoster = (players: Player[]) => players.length >= 2 && new Set(players.map(p => p.id)).size === players.length && players.every(p => p.id && p.name.trim() && p.name.trim().length <= 40 && /^#[0-9a-f]{6}$/i.test(p.color));
export function createGame(players: Player[], id: string, turnId: string): Game {
  if (!validRoster(players)) throw new Error('Use at least two players with names of 1–40 characters and valid colors.');
  return { schemaVersion: 1, id, players: players.map(p => ({ ...p, name: p.name.trim() })), phase: 'ready', activeTurn: { id: turnId, playerId: players[0].id, elapsedMs: 0, segmentStartedAt: null }, completedTurns: [], rolls: [] };
}
export function elapsed(game: Game, now: number): number { const t = game.activeTurn; return t ? t.elapsedMs + (t.segmentStartedAt === null ? 0 : Math.max(0, now - t.segmentStartedAt)) : 0; }
export type Action = { type: 'start'; now: number } | { type: 'pause'; now: number } | { type: 'end'; now: number } | { type: 'next'; now: number; turnId: string } | { type: 'roll'; roll: Roll } | { type: 'reset'; id: string; turnId: string };
export function reducer(game: Game, action: Action): Game {
  if (action.type === 'reset') return createGame(game.players, action.id, action.turnId);
  if (game.phase === 'finished' || !game.activeTurn) return game;
  const turn = game.activeTurn;
  if (action.type === 'roll') {
    const r = action.roll;
    if (!Number.isInteger(r.total) || r.total < 2 || r.total > 12 || r.turnId !== turn.id || r.playerId !== turn.playerId || !r.id || game.rolls.some(v => v.id === r.id) || !Number.isFinite(r.recordedAt) || r.recordedAt < 0) return game;
    if (r.source === 'generated' ? !r.dice || r.dice.length !== 2 || r.dice.some(d => !Number.isInteger(d) || d < 1 || d > 6) || r.dice[0] + r.dice[1] !== r.total : r.source !== 'manual' || r.dice !== null) return game;
    return { ...game, rolls: [...game.rolls, r] };
  }
  if (!Number.isFinite(action.now) || action.now < 0) return game;
  if (action.type === 'start') return game.phase === 'running' ? game : { ...game, phase: 'running', activeTurn: { ...turn, segmentStartedAt: action.now } };
  if (action.type === 'pause') return game.phase !== 'running' ? game : { ...game, phase: 'paused', activeTurn: { ...turn, elapsedMs: elapsed(game, action.now), segmentStartedAt: null } };
  if (action.type === 'next' && (game.phase === 'ready' || !action.turnId || action.turnId === turn.id || game.completedTurns.some(t => t.id === action.turnId))) return game;
  const completedTurns = game.phase === 'ready' ? game.completedTurns : [...game.completedTurns, { id: turn.id, playerId: turn.playerId, durationMs: elapsed(game, action.now), completedAt: action.now }];
  if (action.type === 'end') return { ...game, phase: 'finished', activeTurn: null, completedTurns };
  const index = game.players.findIndex(p => p.id === turn.playerId);
  return { ...game, phase: 'running', completedTurns, activeTurn: { id: action.turnId, playerId: game.players[(index + 1) % game.players.length].id, elapsedMs: 0, segmentStartedAt: action.now } };
}

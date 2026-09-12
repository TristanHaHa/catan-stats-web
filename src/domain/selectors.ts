import type { Game } from './types';
export const frequencies = (game: Game) => Array.from({ length: 11 }, (_, i) => { const total = i + 2; const count = game.rolls.filter(r => r.total === total).length; return { total, count, percent: game.rolls.length ? count / game.rolls.length * 100 : 0 }; });
export const playerStats = (game: Game) => game.players.map((player, i) => { const turns = game.completedTurns.filter(t => t.playerId === player.id); const totalMs = turns.reduce((sum, t) => sum + t.durationMs, 0); return { ...player, seat: i + 1, count: turns.length, totalMs, meanMs: turns.length ? totalMs / turns.length : null }; });
export const duration = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;

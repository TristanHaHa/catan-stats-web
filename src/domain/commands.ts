import { createGame, reducer, validRoster } from './reducer';
import type { Game, Player } from './types';

export type GameCommand =
  | { type: 'start' | 'pause' | 'next' | 'end' | 'reset' | 'undo-roll' }
  | { type: 'roll'; total: number; dice: [number, number] | null }
  | { type: 'correct-roll'; rollId: string; total: number }
  | { type: 'roster'; players: Player[] }
  | { type: 'active'; playerId: string };
export const hostOnly = (command: GameCommand) =>
  ['end', 'reset', 'undo-roll', 'correct-roll', 'roster', 'active'].includes(command.type);

/** Timestamp and identifiers come from the authority, never from a multiplayer payload. */
export function applyGameCommand(game: Game, command: GameCommand, now: number, id: string): Game {
  let next: Game;
  let text: string;
  const turn = game.activeTurn;
  switch (command.type) {
    case 'roll':
      if (!turn) throw new Error('This game has finished.');
      next = reducer(game, {
        type: 'roll',
        roll: {
          id,
          turnId: turn.id,
          playerId: turn.playerId,
          total: command.total,
          dice: command.dice,
          source: command.dice ? 'generated' : 'manual',
          recordedAt: now,
        },
      });
      // Rolls already have their own chronological record.
      if (next === game) throw new Error('Invalid dice result.');
      return next;
    case 'reset':
      next = createGame(game.players, id, `${id}-turn`);
      text = 'Game reset; previous rolls and timing cleared';
      break;
    case 'roster': {
      if (
        !validRoster(command.players) ||
        game.players.some((p) => !command.players.some((n) => n.id === p.id))
      )
        throw new Error('Keep existing seats; add players or edit names, colors and order.');
      next = {
        ...game,
        players: command.players.map((p) => ({ id: p.id, name: p.name.trim(), color: p.color })),
        activeTurn: turn,
      };
      text = 'Host updated player names, colors or turn order';
      break;
    }
    case 'undo-roll':
      if (!game.rolls.length) throw new Error('There is no roll to undo.');
      text = `Host removed latest roll (${game.rolls.at(-1)!.total})`;
      next = { ...game, rolls: game.rolls.slice(0, -1) };
      break;
    case 'correct-roll':
      if (
        !Number.isInteger(command.total) ||
        command.total < 2 ||
        command.total > 12 ||
        !game.rolls.some((r) => r.id === command.rollId)
      )
        throw new Error('Choose a recorded roll and a total from 2 to 12.');
      text = `Host corrected roll from ${game.rolls.find((r) => r.id === command.rollId)!.total} to ${command.total}`;
      next = {
        ...game,
        rolls: game.rolls.map((r) =>
          r.id === command.rollId
            ? { ...r, total: command.total, dice: null, source: 'manual' }
            : r,
        ),
      };
      break;
    case 'active': {
      if (
        !turn ||
        game.phase === 'finished' ||
        !game.players.some((p) => p.id === command.playerId)
      )
        throw new Error('Choose an available player.');
      const started = game.phase === 'ready' ? reducer(game, { type: 'start', now }) : game;
      next = reducer(started, { type: 'next', now, turnId: `${id}-turn` });
      next = { ...next, activeTurn: { ...next.activeTurn!, playerId: command.playerId } };
      text = `Host advanced to ${game.players.find((p) => p.id === command.playerId)!.name}`;
      break;
    }
    default:
      next =
        command.type === 'next'
          ? reducer(game, { type: 'next', now, turnId: `${id}-turn` })
          : reducer(game, { type: command.type, now });
      text =
        command.type === 'next'
          ? `Turn completed · ${game.players.find((p) => p.id === turn?.playerId)?.name}`
          : command.type === 'end'
            ? 'Game ended'
            : command.type === 'start'
              ? 'Turn timer started / resumed'
              : 'Turn timer paused';
  }
  if (next === game)
    throw new Error('This action is no longer available. Refresh the game and try again.');
  return {
    ...next,
    events: [...(command.type === 'reset' ? [] : (game.events ?? [])), { id, at: now, text }],
  };
}

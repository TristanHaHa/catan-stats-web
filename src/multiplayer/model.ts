import { applyGameCommand, hostOnly, type GameCommand } from '../domain/commands';
import { createGame } from '../domain/reducer';
import type { Game } from '../domain/types';
import { parseGame } from '../domain/validation';

export type Room = {
  schemaVersion: 2;
  hostUid: string;
  revision: number;
  started: boolean;
  createdAt: number;
  updatedAt: number;
  game: Game;
  seats: Record<string, string>;
};
export type Member = {
  uid: string;
  name: string;
  joinedAt: number;
  lastSeen: number;
  requestedSeat: string | null;
  revoked: boolean;
};
export type RoomCommand =
  | GameCommand
  | { type: 'begin' }
  | { type: 'claim'; playerId: string | null }
  | { type: 'assign'; playerId: string; memberUid: string | null };
export type Envelope = {
  id: string;
  revision: number;
  turnId: string | null;
  command: RoomCommand;
};
export function parseRoom(value: unknown): Room {
  const r = value as Room;
  if (
    !r ||
    r.schemaVersion !== 2 ||
    typeof r.hostUid !== 'string' ||
    !r.hostUid ||
    !Number.isSafeInteger(r.revision) ||
    r.revision < 0 ||
    typeof r.started !== 'boolean' ||
    !Number.isFinite(r.createdAt) ||
    !Number.isFinite(r.updatedAt) ||
    !r.seats ||
    typeof r.seats !== 'object' ||
    Array.isArray(r.seats)
  )
    throw new Error('Unsupported or unreadable room. Update the app before continuing.');
  const game = parseGame(JSON.stringify(r.game));
  if (
    Object.entries(r.seats).some(
      ([seat, owner]) =>
        !game.players.some((p) => p.id === seat) || typeof owner !== 'string' || !owner,
    ) ||
    new Set(Object.values(r.seats)).size !== Object.values(r.seats).length
  )
    throw new Error('Invalid seat assignments. Ask the host to repair this room.');
  return { ...r, game };
}
export function canOperate(room: Room, uid: string) {
  return (
    room.hostUid === uid ||
    (!!room.game.activeTurn && room.seats[room.game.activeTurn.playerId] === uid)
  );
}
export function transition(room: Room, uid: string, envelope: Envelope, now: number): Room {
  if (room.schemaVersion !== 2) throw new Error('Unsupported room version.');
  if (envelope.revision !== room.revision || envelope.turnId !== (room.game.activeTurn?.id ?? null))
    throw new Error('The table changed. Review the latest state and try again.');
  const { command } = envelope;
  const host = room.hostUid === uid;
  const admin =
    command.type === 'begin' || command.type === 'assign' || hostOnly(command as GameCommand);
  if (command.type !== 'claim' && (admin ? !host : !canOperate(room, uid)))
    throw new Error('You do not have permission for this action.');
  let next: Room;
  if (command.type === 'claim') {
    if (room.game.phase === 'finished') throw new Error('This game has finished.');
    if (command.playerId !== null && !room.game.players.some((p) => p.id === command.playerId))
      throw new Error('Choose a player from the current list.');
    if (
      command.playerId !== null &&
      room.seats[command.playerId] &&
      room.seats[command.playerId] !== uid
    )
      throw new Error('That player has already been chosen. Please choose another.');
    const seats = Object.fromEntries(
      Object.entries(room.seats).filter(([, owner]) => owner !== uid),
    );
    if (command.playerId !== null) seats[command.playerId] = uid;
    next = { ...room, seats };
  } else if (command.type === 'begin') {
    if (room.started) throw new Error('The game has already started.');
    next = { ...room, started: true };
  } else if (command.type === 'assign') {
    if (!room.game.players.some((p) => p.id === command.playerId)) throw new Error('Unknown seat.');
    const seats = { ...room.seats };
    if (command.memberUid) {
      for (const key of Object.keys(seats)) if (seats[key] === command.memberUid) delete seats[key];
      seats[command.playerId] = command.memberUid;
    } else delete seats[command.playerId];
    next = { ...room, seats };
  } else {
    if (!room.started && !['roster', 'reset'].includes(command.type))
      throw new Error('The host must open the table first.');
    next = {
      ...room,
      game:
        !room.started && command.type === 'roster'
          ? createGame(command.players, room.game.id, room.game.activeTurn!.id)
          : applyGameCommand(room.game, command, now, envelope.id),
      started: command.type === 'reset' ? false : room.started,
    };
  }
  return {
    ...next,
    seats: Object.fromEntries(
      Object.entries(next.seats).filter(([id]) => next.game.players.some((p) => p.id === id)),
    ),
    revision: room.revision + 1,
    updatedAt: now,
  };
}

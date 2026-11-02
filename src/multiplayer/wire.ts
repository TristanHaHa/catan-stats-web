import { serverTimestamp, type FieldValue, type Timestamp } from 'firebase/firestore';
import type { Game, Player, Roll } from '../domain/types';
import { createGame } from '../domain/reducer';
import { transition, type Envelope } from './model';
import { decodeRoom } from './decode';
export { decodeRoom, milliseconds } from './decode';

export type Time = Timestamp | FieldValue;
type Segment = { startedAt: Time; endedAt: Time | null };
export type WireTurn = {
  id: string;
  playerId: string;
  segments: Record<string, Segment>;
  runningSegment: string | null;
  completedAt: Time | null;
};
type WireRoll = Omit<Roll, 'recordedAt'> & { recordedAt: Time; sequence: number };
export type WireRoom = {
  schemaVersion: 3;
  hostUid: string;
  revision: number;
  started: boolean;
  createdAt: Time;
  updatedAt: Time;
  seats: Record<string, string>;
  nextSeat: Record<string, string>;
  lastCommand: {
    id: string;
    kind: string;
    actorUid: string;
    baseRevision: number;
    turnId: string | null;
  };
  game: {
    schemaVersion: 1;
    id: string;
    players: Player[];
    phase: Game['phase'];
    activeTurn: WireTurn | null;
    completedTurns: Record<string, WireTurn>;
    rolls: Record<string, WireRoll>;
  };
};
const order = (players: Player[]) =>
  Object.fromEntries(players.map((p, i) => [p.id, players[(i + 1) % players.length].id]));
const turn = (id: string, playerId: string): WireTurn => ({
  id,
  playerId,
  segments: {},
  runningSegment: null,
  completedAt: null,
});
export function createWireRoom(players: Player[], uid: string, requestId: string): WireRoom {
  const game = createGame(players, crypto.randomUUID(), crypto.randomUUID());
  return {
    schemaVersion: 3,
    hostUid: uid,
    revision: 0,
    started: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    seats: {},
    nextSeat: order(game.players),
    lastCommand: { id: requestId, kind: 'create', actorUid: uid, baseRevision: -1, turnId: null },
    game: {
      ...game,
      activeTurn: turn(game.activeTurn!.id, game.activeTurn!.playerId),
      completedTurns: {},
      rolls: {},
    },
  };
}
function closeTurn(t: WireTurn): WireTurn {
  const segments = { ...t.segments };
  if (t.runningSegment)
    segments[t.runningSegment] = { ...segments[t.runningSegment], endedAt: serverTimestamp() };
  return { ...t, segments, runningSegment: null, completedAt: serverTimestamp() };
}
/** Native timestamp transforms keep elapsed durations authoritative without a server or paid service. */
export function applyWireCommand(
  wire: WireRoom,
  uid: string,
  envelope: Envelope,
): { room: WireRoom; text: string } {
  const previous = decodeRoom(wire);
  const next = transition(previous, uid, envelope, Date.now());
  const { command, id } = envelope;
  const completedTurns: Record<string, WireTurn> = {};
  for (const t of next.game.completedTurns)
    completedTurns[t.id] = wire.game.completedTurns[t.id] ?? closeTurn(wire.game.activeTurn!);
  const rolls: Record<string, WireRoll> = {};
  for (const r of next.game.rolls)
    rolls[r.id] = {
      ...r,
      recordedAt: wire.game.rolls[r.id]?.recordedAt ?? serverTimestamp(),
      sequence: wire.game.rolls[r.id]?.sequence ?? next.revision,
    };
  let activeTurn: WireTurn | null = null;
  if (next.game.activeTurn) {
    const t = next.game.activeTurn;
    activeTurn =
      wire.game.activeTurn?.id === t.id ? { ...wire.game.activeTurn } : turn(t.id, t.playerId);
    if (command.type === 'start' || command.type === 'next' || command.type === 'active')
      activeTurn = {
        ...activeTurn,
        runningSegment: id,
        segments: { ...activeTurn.segments, [id]: { startedAt: serverTimestamp(), endedAt: null } },
      };
    if (command.type === 'pause') {
      const segment = activeTurn.runningSegment!;
      activeTurn = {
        ...activeTurn,
        runningSegment: null,
        segments: {
          ...activeTurn.segments,
          [segment]: { ...activeTurn.segments[segment], endedAt: serverTimestamp() },
        },
      };
    }
    if (!next.started && command.type === 'roster') activeTurn = turn(t.id, t.playerId);
  }
  return {
    room: {
      ...wire,
      revision: next.revision,
      started: next.started,
      seats: next.seats,
      nextSeat: order(next.game.players),
      updatedAt: serverTimestamp(),
      lastCommand: {
        id,
        kind: command.type,
        actorUid: uid,
        baseRevision: wire.revision,
        turnId: previous.game.activeTurn?.id ?? null,
      },
      game: {
        schemaVersion: 1,
        id: next.game.id,
        players: next.game.players,
        phase: next.game.phase,
        activeTurn,
        completedTurns,
        rolls,
      },
    },
    text:
      (command.type === 'next' ? 'Turn completed' : next.game.events?.at(-1)?.text) ??
      (command.type === 'begin'
        ? 'Host opened the table'
        : command.type === 'assign'
          ? 'Host updated a seat assignment'
          : 'Dice recorded'),
  };
}

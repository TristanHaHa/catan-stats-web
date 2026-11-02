import type { Time, WireRoom, WireTurn } from './wire';
import { parseRoom, type Room, type Member } from './model';
export function milliseconds(value: Time): number {
  if (!value || !('toMillis' in value)) throw new Error('Waiting for server timestamps.');
  return value.toMillis();
}
function timing(turn: WireTurn) {
  let elapsedMs = 0;
  for (const segment of Object.values(turn.segments)) {
    if (segment.endedAt !== null)
      elapsedMs += Math.max(0, milliseconds(segment.endedAt) - milliseconds(segment.startedAt));
  }
  return {
    elapsedMs,
    segmentStartedAt: turn.runningSegment
      ? milliseconds(turn.segments[turn.runningSegment].startedAt)
      : null,
  };
}
export function decodeRoom(value: unknown): Room {
  const wire = value as WireRoom;
  if (!wire || wire.schemaVersion !== 3)
    throw new Error('Unsupported room version. This build uses the free-plan room format (v3).');
  const turn = wire.game.activeTurn;
  return parseRoom({
    schemaVersion: 2,
    hostUid: wire.hostUid,
    revision: wire.revision,
    started: wire.started,
    createdAt: milliseconds(wire.createdAt),
    updatedAt: milliseconds(wire.updatedAt),
    seats: wire.seats,
    game: {
      schemaVersion: 1,
      id: wire.game.id,
      players: wire.game.players,
      phase: wire.game.phase,
      activeTurn: turn ? { id: turn.id, playerId: turn.playerId, ...timing(turn) } : null,
      completedTurns: Object.values(wire.game.completedTurns)
        .map((t) => ({
          id: t.id,
          playerId: t.playerId,
          durationMs: timing(t).elapsedMs,
          completedAt: milliseconds(t.completedAt!),
        }))
        .sort((a, b) => a.completedAt - b.completedAt),
      rolls: Object.values(wire.game.rolls)
        .sort((a, b) => a.sequence - b.sequence)
        .map((r) => ({
          id: r.id,
          turnId: r.turnId,
          playerId: r.playerId,
          total: r.total,
          dice: r.dice,
          source: r.source,
          recordedAt: milliseconds(r.recordedAt),
        })),
    },
  });
}
export function decodeMember(value: Record<string, unknown>): Member {
  return {
    ...value,
    joinedAt: milliseconds(value.joinedAt as Time),
    lastSeen: value.lastSeen ? milliseconds(value.lastSeen as Time) : 0,
  } as Member;
}

export type Player = { id: string; name: string; color: string };
export type Roll = {
  id: string;
  turnId: string;
  playerId: string;
  total: number;
  dice: [number, number] | null;
  source: 'generated' | 'manual';
  recordedAt: number;
};
export type CompletedTurn = {
  id: string;
  playerId: string;
  durationMs: number;
  completedAt: number;
};
export type ActiveTurn = {
  id: string;
  playerId: string;
  elapsedMs: number;
  segmentStartedAt: number | null;
};
export type GameEvent = { id: string; at: number; text: string };
export type Game = {
  schemaVersion: 1;
  id: string;
  players: Player[];
  phase: 'ready' | 'running' | 'paused' | 'finished';
  activeTurn: ActiveTurn | null;
  completedTurns: CompletedTurn[];
  rolls: Roll[];
  events?: GameEvent[];
};

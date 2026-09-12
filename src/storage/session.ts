import type { Game } from '../domain/types';
import { validRoster } from '../domain/reducer';
export const KEY = 'catan-stats.session.v1';
const finite = (n: unknown) => typeof n === 'number' && Number.isFinite(n) && n >= 0;
const id = (s: unknown) => typeof s === 'string' && s.length > 0;
export function parseGame(raw: string): Game {
  const g: Game = JSON.parse(raw);
  try {
    if (!g || g.schemaVersion !== 1 || !id(g.id) || !Array.isArray(g.players) || !validRoster(g.players) || !Array.isArray(g.rolls) || !Array.isArray(g.completedTurns) || !['ready','running','paused','finished'].includes(g.phase)) throw 0;
    const players = new Set(g.players.map(p => p.id));
    if (g.players.some(p => typeof p.name !== 'string' || p.name !== p.name.trim())) throw 0;
    const turns = new Map<string, string>();
    for (const t of g.completedTurns) { if (!id(t.id) || turns.has(t.id) || !players.has(t.playerId) || !finite(t.durationMs) || !finite(t.completedAt)) throw 0; turns.set(t.id, t.playerId); }
    if (g.phase === 'finished') { if (g.activeTurn !== null) throw 0; }
    else {
      const t = g.activeTurn;
      if (!t || !id(t.id) || turns.has(t.id) || !players.has(t.playerId) || !finite(t.elapsedMs) || (g.phase === 'running' ? !finite(t.segmentStartedAt) : t.segmentStartedAt !== null)) throw 0;
      if (g.phase === 'ready' && (t.elapsedMs !== 0 || g.completedTurns.length !== 0 || t.playerId !== g.players[0].id)) throw 0;
      turns.set(t.id, t.playerId);
    }
    const rolls = new Set<string>();
    // Ending before starting a timer keeps dice history without counting a turn.
    let untimedId: string | null = null;
    for (const r of g.rolls) {
      if (!id(r.id) || rolls.has(r.id) || !id(r.turnId) || !players.has(r.playerId) || !finite(r.recordedAt) || !Number.isInteger(r.total) || r.total < 2 || r.total > 12) throw 0;
      if (!turns.has(r.turnId) && g.phase === 'finished' && !g.completedTurns.length && r.playerId === g.players[0].id) { untimedId ??= r.turnId; if (untimedId !== r.turnId) throw 0; }
      else if (turns.get(r.turnId) !== r.playerId) throw 0;
      if (r.source === 'generated') { if (!Array.isArray(r.dice) || r.dice.length !== 2 || r.dice.some(d => !Number.isInteger(d) || d < 1 || d > 6) || r.dice[0] + r.dice[1] !== r.total) throw 0; }
      else if (r.source !== 'manual' || r.dice !== null) throw 0;
      rolls.add(r.id);
    }
    return g;
  } catch { throw new Error('This save is unreadable or uses an unsupported version.'); }
}
export class SessionStorage {
  private expected: string | null = null;
  blocked = false;
  constructor(private storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>) {}
  load(): Game | null {
    this.expected = this.storage.getItem(KEY);
    try { return this.expected === null ? null : parseGame(this.expected); }
    catch (error) { this.blocked = true; throw error; }
  }
  save(game: Game | null) {
    if (this.blocked || this.storage.getItem(KEY) !== this.expected) { this.blocked = true; throw new Error('Another tab changed this session. Reload to continue saving.'); }
    const raw = game ? JSON.stringify(game) : null;
    if (raw === null) this.storage.removeItem(KEY); else this.storage.setItem(KEY, raw);
    this.expected = raw;
  }
  discard() { this.storage.removeItem(KEY); this.expected = null; this.blocked = false; }
  changed(raw: string | null) { if (raw !== this.expected) this.blocked = true; return this.blocked; }
}

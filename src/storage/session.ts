import type { Game } from '../domain/types';
import { parseGame } from '../domain/validation';
export { parseGame } from '../domain/validation';
export const KEY = 'catan-stats.session.v1';
export class SessionStorage {
  private expected: string | null = null;
  blocked = false;
  constructor(private storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>) {}
  load(): Game | null {
    this.expected = this.storage.getItem(KEY);
    try {
      return this.expected === null ? null : parseGame(this.expected);
    } catch (error) {
      this.blocked = true;
      throw error;
    }
  }
  save(game: Game | null) {
    if (this.blocked || this.storage.getItem(KEY) !== this.expected) {
      this.blocked = true;
      throw new Error('Another tab changed this session. Reload to continue saving.');
    }
    const raw = game ? JSON.stringify(game) : null;
    if (raw === null) this.storage.removeItem(KEY);
    else this.storage.setItem(KEY, raw);
    this.expected = raw;
  }
  discard() {
    this.storage.removeItem(KEY);
    this.expected = null;
    this.blocked = false;
  }
  changed(raw: string | null) {
    if (raw !== this.expected) this.blocked = true;
    return this.blocked;
  }
}

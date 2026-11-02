// @vitest-environment node
import { afterAll, beforeAll, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { initializeApp, deleteApp, type FirebaseApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, signInAnonymously } from 'firebase/auth';
import {
  doc,
  getDoc,
  getDocs,
  collection,
  getFirestore,
  connectFirestoreEmulator,
  writeBatch,
  serverTimestamp,
  type Firestore,
} from 'firebase/firestore';
import {
  initializeTestEnvironment,
  assertFails,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { roomApi } from '../src/multiplayer/store';
import { applyWireCommand, decodeRoom, type WireRoom } from '../src/multiplayer/wire';
import type { Envelope, RoomCommand } from '../src/multiplayer/model';

const enabled = !!process.env.FIRESTORE_EMULATOR_HOST;
const projectId = 'demo-settlers-ledger';
const apps: FirebaseApp[] = [];
let env: RulesTestEnvironment;
async function client(label: string) {
  const app = initializeApp({ projectId, apiKey: 'demo-key', appId: 'demo-app' }, label);
  apps.push(app);
  const auth = getAuth(app);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  const uid = (await signInAnonymously(auth)).user.uid;
  const db = getFirestore(app);
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  return { uid, db, api: (data: Parameters<typeof roomApi>[2]) => roomApi(db, uid, data) };
}
beforeAll(async () => {
  if (enabled)
    env = await initializeTestEnvironment({
      projectId,
      firestore: {
        host: '127.0.0.1',
        port: 8080,
        rules: await readFile('firestore.rules', 'utf8'),
      },
    });
});
afterAll(async () => {
  await Promise.all(apps.map(deleteApp));
  await env?.cleanup();
});
it.skipIf(!enabled)(
  'Spark rules authorize real transactions, protect roles, and preserve server timing and concurrency',
  async () => {
    const [host, active, waiting, spectator, outsider] = await Promise.all(
      ['host', 'active', 'waiting', 'spectator', 'outsider'].map(client),
    );
    const players = [
      { id: 'p0', name: 'Alex', color: '#bb4938' },
      { id: 'p1', name: 'Alex', color: '#3277a0' },
    ];
    const requestId = crypto.randomUUID();
    const {
      data: { code },
    } = await host.api({ operation: 'create', name: 'Host', players, requestId });
    expect(
      (await host.api({ operation: 'create', name: 'Host', players, requestId })).data.code,
    ).toBe(code);
    const ref = doc(host.db, 'rooms', code);
    const read = async () => (await getDoc(ref)).data() as WireRoom;
    const envelope = (wire: WireRoom, command: RoomCommand): Envelope => ({
      id: crypto.randomUUID(),
      revision: wire.revision,
      turnId: wire.game.activeTurn?.id ?? null,
      command,
    });
    const command = async (who: Awaited<ReturnType<typeof client>>, c: RoomCommand) =>
      who.api({ operation: 'command', code, envelope: envelope(await read(), c) });
    await assertFails(getDoc(doc(outsider.db, 'rooms', code)));
    await assertFails(getDocs(collection(host.db, 'rooms')));
    for (const who of [active, waiting, spectator])
      await who.api({ operation: 'join', code, name: 'Alex' });
    await command(host, { type: 'begin' });
    await active.api({ operation: 'request-seat', code, playerId: 'p0' });
    await waiting.api({ operation: 'request-seat', code, playerId: 'p0' });
    await command(host, { type: 'assign', playerId: 'p0', memberUid: active.uid });
    await waiting.api({ operation: 'heartbeat', code });
    await waiting.api({ operation: 'request-seat', code, playerId: null });
    await command(host, { type: 'assign', playerId: 'p1', memberUid: waiting.uid });
    await expect(
      command(spectator, { type: 'assign', playerId: 'p0', memberUid: spectator.uid }),
    ).rejects.toThrow();
    await expect(command(waiting, { type: 'roll', total: 7, dice: null })).rejects.toThrow();
    await expect(command(active, { type: 'reset' })).rejects.toThrow();
    await command(active, { type: 'start' });
    await command(active, { type: 'pause' });
    const paused = decodeRoom(await read());
    expect(paused.game.phase).toBe('paused');
    expect(paused.game.activeTurn!.elapsedMs).toBeGreaterThanOrEqual(0);
    await command(active, { type: 'start' });
    const roll = envelope(await read(), { type: 'roll', total: 7, dice: [3, 4] });
    await active.api({ operation: 'command', code, envelope: roll });
    await active.api({ operation: 'command', code, envelope: roll });
    expect(decodeRoom(await read()).game.rolls).toHaveLength(1);
    // Bypass all client/domain permission checks: forge complete, transaction-shaped writes.
    async function forge(
      db: Firestore,
      actor: string,
      wire: WireRoom,
      edit: (r: WireRoom) => void,
      kind = 'roll',
      text = 'Dice recorded',
    ) {
      const e = envelope(wire, { type: 'roll', total: 8, dice: null });
      const next = applyWireCommand(wire, host.uid, e).room;
      next.lastCommand.actorUid = actor;
      next.lastCommand.kind = kind;
      edit(next);
      const batch = writeBatch(db);
      batch.set(doc(db, 'rooms', code), next);
      batch.set(doc(db, 'rooms', code, 'receipts', `${actor}_${e.id}`), {
        actorUid: actor,
        commandId: e.id,
        revision: next.revision,
        at: serverTimestamp(),
      });
      batch.set(doc(db, 'rooms', code, 'events', `${actor}_${e.id}`), {
        actorUid: actor,
        kind,
        text,
        at: serverTimestamp(),
      });
      return batch.commit();
    }
    for (const who of [waiting, spectator, outsider])
      await assertFails(forge(who.db, who.uid, await read(), () => {}));
    await assertFails(forge(active.db, active.uid, await read(), () => {}, 'assign'));
    await assertFails(
      forge(active.db, active.uid, await read(), () => {}, 'roll', 'Host changed turn order'),
    );
    await assertFails(
      forge(active.db, active.uid, await read(), (r) => {
        r.hostUid = active.uid;
      }),
    );
    await assertFails(
      forge(active.db, active.uid, await read(), (r) => {
        r.seats.p1 = active.uid;
      }),
    );
    await assertFails(
      forge(active.db, active.uid, await read(), (r) => {
        r.game.players[1].name = 'Hacked';
      }),
    );
    await assertFails(
      forge(active.db, active.uid, await read(), (r) => {
        r.game.rolls[Object.keys(r.game.rolls).at(-1)!].total = 99;
      }),
    );
    await assertFails(
      forge(active.db, active.uid, await read(), (r) => {
        delete r.game.rolls[roll.id];
      }),
    );
    await assertFails(
      forge(active.db, active.uid, await read(), (r) => {
        r.game.activeTurn!.segments = {};
      }),
    );
    // Pause forgery cannot replace earlier segments or inject client-clock timestamps.
    const beforePause = await read();
    const pauseEnv = envelope(beforePause, { type: 'pause' });
    const badPause = applyWireCommand(beforePause, host.uid, pauseEnv).room;
    badPause.lastCommand.actorUid = active.uid;
    badPause.game.activeTurn!.segments[beforePause.game.activeTurn!.runningSegment!].endedAt =
      beforePause.createdAt;
    const batch = writeBatch(active.db);
    batch.set(doc(active.db, 'rooms', code), badPause);
    batch.set(doc(active.db, 'rooms', code, 'receipts', `${active.uid}_${pauseEnv.id}`), {
      actorUid: active.uid,
      commandId: pauseEnv.id,
      revision: badPause.revision,
      at: serverTimestamp(),
    });
    batch.set(doc(active.db, 'rooms', code, 'events', `${active.uid}_${pauseEnv.id}`), {
      actorUid: active.uid,
      kind: 'pause',
      text: 'Turn timer paused',
      at: serverTimestamp(),
    });
    await assertFails(batch.commit());
    const concurrent = await read();
    const results = await Promise.allSettled(
      [host, active].map((who) =>
        who.api({ operation: 'command', code, envelope: envelope(concurrent, { type: 'next' }) }),
      ),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    let state = decodeRoom(await read());
    expect(state.game.completedTurns).toHaveLength(1);
    expect(state.game.activeTurn?.playerId).toBe('p1');
    const turnId = state.game.activeTurn!.id;
    await command(host, {
      type: 'roster',
      players: [...players, { id: 'p2', name: 'Late arrival', color: '#658254' }],
    });
    expect(decodeRoom(await read()).game.activeTurn!.id).toBe(turnId);
    await command(host, { type: 'assign', playerId: 'p2', memberUid: spectator.uid });
    await command(waiting, { type: 'roll', total: 8, dice: null });
    await command(host, { type: 'correct-roll', rollId: roll.id, total: 6 });
    await command(host, { type: 'undo-roll' });
    await host.api({ operation: 'member', code, memberUid: spectator.uid, revoked: true });
    await assertFails(getDoc(doc(spectator.db, 'rooms', code)));
    await expect(spectator.api({ operation: 'join', code, name: 'Back' })).rejects.toThrow();
    await host.api({ operation: 'member', code, memberUid: spectator.uid, revoked: false });
    await spectator.api({ operation: 'join', code, name: 'Back' });
    await command(host, { type: 'end' });
    state = decodeRoom(await read());
    expect(state.game.phase).toBe('finished');
    expect(state.game.rolls).toHaveLength(1);
    await command(host, { type: 'reset' });
    expect(decodeRoom(await read()).game.rolls).toHaveLength(0);
  },
  60000,
);

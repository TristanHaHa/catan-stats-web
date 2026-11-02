import {
  doc,
  getDocFromServer,
  runTransaction,
  serverTimestamp,
  type Firestore,
} from 'firebase/firestore';
import type { Player } from '../domain/types';
import type { Envelope } from './model';
import { applyWireCommand, createWireRoom, milliseconds, type WireRoom } from './wire';

type Request = {
  operation: string;
  code?: string;
  name?: string;
  requestId?: string;
  players?: Player[];
  envelope?: Envelope;
  playerId?: string | null;
  memberUid?: string;
  revoked?: boolean;
  leaving?: boolean;
};
const validKey = (v: unknown): v is string =>
  typeof v === 'string' &&
  /^[\w-]{1,128}$/.test(v) &&
  !['__proto__', 'prototype', 'constructor'].includes(v);
const validName = (v: unknown): v is string =>
  typeof v === 'string' && !!v.trim() && v.trim().length <= 40;
/** Every write is checked by Firestore Rules, including commands from a modified client. */
export async function roomApi(db: Firestore, uid: string, data: Request) {
  if (!uid) throw new Error('Sign in anonymously before joining a room.');
  if (data.operation === 'create') {
    if (!data.players || !validName(data.name) || !validKey(data.requestId))
      throw new Error('Enter a roster and display name.');
    const code = crypto.randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase();
    const receipt = doc(db, 'accounts', uid, 'creations', data.requestId);
    const profile = doc(db, 'accounts', uid);
    const actualCode = await runTransaction(db, async (tx) => {
      const previous = await tx.get(receipt);
      if (previous.exists()) return previous.get('code') as string;
      await tx.get(profile);
      const root = doc(db, 'rooms', code);
      tx.set(root, createWireRoom(data.players!, uid, data.requestId!));
      tx.set(doc(root, 'members', uid), {
        uid,
        name: data.name!.trim(),
        joinedAt: serverTimestamp(),
        lastSeen: serverTimestamp(),
        requestedSeat: null,
        revoked: false,
      });
      tx.set(profile, {
        latestCode: code,
        requestId: data.requestId,
        lastCreatedAt: serverTimestamp(),
      });
      tx.set(receipt, { code, at: serverTimestamp() });
      return code;
    });
    const root = await getDocFromServer(doc(db, 'rooms', actualCode));
    return { data: { code: actualCode, serverNow: milliseconds(root.get('updatedAt')) } };
  }
  if (!data.code || !/^[A-F0-9]{12}$/.test(data.code))
    throw new Error('Use the 12-character room code.');
  const code = data.code;
  const root = doc(db, 'rooms', code),
    own = doc(root, 'members', uid);
  await runTransaction(db, async (tx) => {
    const member = await tx.get(own);
    if (member.exists() && member.get('revoked'))
      throw new Error('The host removed this membership. Ask the host to restore access.');
    if (data.operation === 'join') {
      if (!validName(data.name)) throw new Error('Use a display name of 1–40 characters.');
      if (member.exists()) tx.update(own, { name: data.name.trim(), lastSeen: serverTimestamp() });
      else {
        tx.set(own, {
          uid,
          name: data.name.trim(),
          joinedAt: serverTimestamp(),
          lastSeen: serverTimestamp(),
          requestedSeat: null,
          revoked: false,
        });
        tx.set(doc(root, 'events', `${uid}_join`), {
          at: serverTimestamp(),
          text: `${data.name.trim()} joined the room`,
          actorUid: uid,
          kind: 'join',
        });
      }
      return;
    }
    if (!member.exists()) throw new Error('Join this room first.');
    if (data.operation === 'heartbeat') {
      tx.update(own, { lastSeen: data.leaving ? null : serverTimestamp() });
      return;
    }
    const snapshot = await tx.get(root);
    const room = snapshot.data() as WireRoom;
    if (data.operation === 'request-seat') {
      if (
        data.playerId !== null &&
        (!validKey(data.playerId) || !room.nextSeat[data.playerId] || room.seats[data.playerId])
      )
        throw new Error('Choose an unclaimed seat.');
      tx.update(own, { requestedSeat: data.playerId, lastSeen: serverTimestamp() });
      return;
    }
    const envelope = data.envelope;
    const commandId = data.operation === 'member' ? crypto.randomUUID() : envelope?.id;
    if (!validKey(commandId)) throw new Error('Invalid command ID.');
    const receipt = doc(root, 'receipts', `${uid}_${commandId}`);
    if ((await tx.get(receipt)).exists()) return;
    let next: WireRoom;
    let text: string;
    if (data.operation === 'member') {
      if (
        uid !== room.hostUid ||
        !validKey(data.memberUid) ||
        data.memberUid === uid ||
        typeof data.revoked !== 'boolean'
      )
        throw new Error('Only the host can manage other members.');
      const target = doc(root, 'members', data.memberUid);
      if (!(await tx.get(target)).exists()) throw new Error('Unknown member.');
      const seats = Object.fromEntries(
        Object.entries(room.seats).filter(([, owner]) => !data.revoked || owner !== data.memberUid),
      );
      next = {
        ...room,
        seats,
        revision: room.revision + 1,
        updatedAt: serverTimestamp(),
        lastCommand: {
          id: commandId,
          kind: 'member',
          actorUid: uid,
          baseRevision: room.revision,
          turnId: room.game.activeTurn?.id ?? null,
        },
      };
      text = data.revoked ? 'Host removed a room member' : 'Host restored a room member';
      tx.update(target, { revoked: data.revoked, requestedSeat: null });
    } else {
      if (data.operation !== 'command' || !envelope) throw new Error('Unknown operation.');
      const c = envelope.command;
      let target: ReturnType<typeof doc> | undefined;
      if (c.type === 'assign' && c.memberUid) {
        target = doc(root, 'members', c.memberUid);
        const recipient = await tx.get(target);
        if (!recipient.exists() || recipient.get('revoked'))
          throw new Error('Assign an existing member with access.');
      }
      ({ room: next, text } = applyWireCommand(room, uid, envelope));
      if (target) tx.update(target, { requestedSeat: null });
    }
    tx.set(root, next);
    tx.set(receipt, { actorUid: uid, commandId, revision: next.revision, at: serverTimestamp() });
    tx.set(doc(root, 'events', `${uid}_${commandId}`), {
      at: serverTimestamp(),
      actorUid: uid,
      text,
      kind: next.lastCommand.kind,
    });
    tx.update(own, { lastSeen: serverTimestamp() });
  });
  const ownData = await getDocFromServer(own);
  const seen = ownData.get('lastSeen');
  return { data: { code, serverNow: seen ? milliseconds(seen) : Date.now() } };
}

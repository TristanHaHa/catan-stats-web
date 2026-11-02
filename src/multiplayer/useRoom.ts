import { useEffect, useRef, useState } from 'react';
import type { GameEvent, Player } from '../domain/types';
import type { Envelope, Member, Room, RoomCommand } from './model';
import { decodeRoom, milliseconds, decodeMember } from './decode';

export function useRoom() {
  const [code, setCode] = useState('');
  const [uid, setUid] = useState('');
  const [room, setRoom] = useState<Room | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [events, setEvents] = useState<GameEvent[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const [synced, setSynced] = useState(false);
  const [offset, setOffset] = useState(0);
  const [pending, setPending] = useState<Envelope | null>(null);
  const [eventLimit, setEventLimit] = useState(100);
  const [subscriptionVersion, setSubscriptionVersion] = useState(0);
  const lock = useRef(false);
  const creation = useRef<{ fingerprint: string; id: string } | null>(null);
  const roomRef = useRef(room);
  roomRef.current = room;
  async function invoke(data: Record<string, unknown>) {
    if (!navigator.onLine)
      throw new Error('You are offline. Reconnect before changing the shared game.');
    const { getClient } = await import('./client');
    const client = await getClient();
    setUid(client.uid);
    const sent = Date.now();
    const result = await client.api(data as Parameters<typeof client.api>[0]);
    setOffset(result.data.serverNow - (sent + Date.now()) / 2);
    return result.data;
  }
  async function run(operation: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      await operation();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not reach the room.');
      return false;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  function remember(value: string) {
    setRoom(null);
    setMembers([]);
    setEvents([]);
    setPending(null);
    setSynced(false);
    setCode(value);
    setSubscriptionVersion((n) => n + 1);
    try {
      localStorage.setItem('ledger.room', value);
    } catch {
      /* Membership still works in memory. */
    }
  }
  const connect = (roomCode: string, name: string) =>
    run(async () => {
      const result = await invoke({ operation: 'join', code: roomCode.trim().toUpperCase(), name });
      remember(result.code);
    });
  const create = (players: Player[], name: string) =>
    run(async () => {
      const fingerprint = JSON.stringify({ players, name });
      if (creation.current?.fingerprint !== fingerprint)
        creation.current = { fingerprint, id: crypto.randomUUID() };
      const result = await invoke({
        operation: 'create',
        players,
        name,
        requestId: creation.current.id,
      });
      remember(result.code);
      creation.current = null;
    });
  useEffect(() => {
    const update = () => {
      setOnline(navigator.onLine);
      if (!navigator.onLine) setSynced(false);
    };
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  useEffect(() => {
    if (!code) return;
    let stopped = false;
    const cleanup: (() => void)[] = [];
    void (async () => {
      const [{ getClient }, firestore] = await Promise.all([
        import('./client'),
        import('firebase/firestore'),
      ]);
      const client = await getClient();
      if (stopped) return;
      const fail = (e: Error) => {
        setError(e.message);
        setSynced(false);
      };
      cleanup.push(
        firestore.onSnapshot(
          firestore.doc(client.db, 'rooms', code),
          { includeMetadataChanges: true },
          (snapshot) => {
            if (snapshot.exists() && !snapshot.metadata.hasPendingWrites) {
              try {
                setRoom(decodeRoom(snapshot.data()));
                setSynced(!snapshot.metadata.fromCache);
              } catch (error) {
                setRoom(null);
                setSynced(false);
                setError(String(error));
              }
            }
          },
          fail,
        ),
      );
      cleanup.push(
        firestore.onSnapshot(
          firestore.collection(client.db, 'rooms', code, 'members'),
          (snapshot) => {
            if (!snapshot.docs.some((d) => d.metadata.hasPendingWrites))
              setMembers(snapshot.docs.map((d) => decodeMember(d.data())));
          },
          fail,
        ),
      );
      const heartbeat = () => {
        void invoke({ operation: 'heartbeat', code })
          .then(() => {
            if (!stopped) setSynced(true);
          })
          .catch((e) => {
            if (!stopped) fail(e);
          });
      };
      heartbeat();
      const timer = window.setInterval(heartbeat, 45000);
      const visibility = () => {
        if (!document.hidden) heartbeat();
      };
      window.addEventListener('online', heartbeat);
      document.addEventListener('visibilitychange', visibility);
      cleanup.push(() => {
        window.clearInterval(timer);
        window.removeEventListener('online', heartbeat);
        document.removeEventListener('visibilitychange', visibility);
      });
    })().catch((e) => {
      if (!stopped) setError(String(e));
    });
    return () => {
      stopped = true;
      cleanup.forEach((fn) => fn());
    };
  }, [code, subscriptionVersion]);
  useEffect(() => {
    if (!code) return;
    let stopped = false;
    let unsubscribe: (() => void) | undefined;
    void (async () => {
      const [{ getClient }, f] = await Promise.all([
        import('./client'),
        import('firebase/firestore'),
      ]);
      const { db } = await getClient();
      if (stopped) return;
      unsubscribe = f.onSnapshot(
        f.query(
          f.collection(db, 'rooms', code, 'events'),
          f.orderBy('at', 'desc'),
          f.limit(eventLimit),
        ),
        (s) => {
          if (!s.docs.some((d) => d.metadata.hasPendingWrites))
            setEvents(
              s.docs.map(
                (d) => ({ ...d.data(), id: d.id, at: milliseconds(d.get('at')) }) as GameEvent,
              ),
            );
        },
        (e) => {
          setError(e.message);
          setSynced(false);
        },
      );
    })().catch((e) => setError(String(e)));
    return () => {
      stopped = true;
      unsubscribe?.();
    };
  }, [code, eventLimit, subscriptionVersion]);
  const command = (command: RoomCommand, retry?: Envelope) =>
    run(async () => {
      const current = roomRef.current;
      if (!current || (!synced && !retry))
        throw new Error('Waiting for the authoritative room. Reconnect first.');
      if (pending && !retry)
        throw new Error('Resolve the pending command before making another change.');
      const envelope: Envelope = retry ?? {
        id: crypto.randomUUID(),
        revision: current.revision,
        turnId: current.game.activeTurn?.id ?? null,
        command,
      };
      setPending(envelope);
      try {
        await invoke({ operation: 'command', code, envelope });
        setPending(null);
      } catch (e) {
        const reason = (e as { code?: string }).code;
        if (!['unavailable', 'deadline-exceeded', 'internal', 'unknown'].includes(reason ?? ''))
          setPending(null);
        throw e;
      }
    });
  function leave() {
    void invoke({ operation: 'heartbeat', code, leaving: true }).catch(() => {});
    setCode('');
    setRoom(null);
    setMembers([]);
    setEvents([]);
    setSynced(false);
    setPending(null);
    setError('');
  }
  return {
    code,
    uid,
    room,
    members,
    events,
    busy,
    error,
    online,
    synced,
    offset,
    pending,
    connect,
    create,
    command,
    leave,
    retry: () => pending && command(pending.command, pending),
    manageMember: (memberUid: string, revoked: boolean) =>
      run(async () => {
        await invoke({ operation: 'member', code, memberUid, revoked });
      }),
    loadMoreEvents: () => setEventLimit((n) => n + 100),
    hasMoreEvents: events.length === eventLimit,
  };
}
export type RoomConnection = ReturnType<typeof useRoom>;

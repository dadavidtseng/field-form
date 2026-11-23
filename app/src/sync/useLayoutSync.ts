import type { Role } from '@field-form/shared';
import { randomUUID } from 'expo-crypto';
import { useEffect, useState } from 'react';
import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';
import { SyncClient, type SyncSnapshot } from './SyncClient';
import { syncUrl } from './serverUrl';

/** One id per app launch; persisted with the offline outbox in P1. */
const CLIENT_ID = randomUUID();

const idle = createStore<SyncSnapshot>(() => ({
  view: null,
  status: 'connecting',
  pendingCount: 0,
  lastSeq: 0,
  notice: null,
}));

/** Connects to one layout for the lifetime of the screen. */
export function useLayoutSync(layoutId: string, role: Role) {
  const [client, setClient] = useState<SyncClient | null>(null);

  // Created in an effect (not useMemo) so StrictMode's double-mount can't leave a disposed client in use.
  useEffect(() => {
    const c = new SyncClient(syncUrl(), layoutId, CLIENT_ID, role);
    setClient(c);
    return () => c.dispose();
  }, [layoutId, role]);

  const snapshot = useStore(client?.store ?? idle);
  return { ...snapshot, submit: client?.submit ?? (() => 'Not connected yet') };
}

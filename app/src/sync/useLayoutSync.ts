import type { Role } from '@field-form/shared';
import { useEffect, useMemo } from 'react';
import { useStore } from 'zustand';
import { SyncClient } from './SyncClient';
import { CLIENT_ID } from './clientId';
import { syncUrl } from './serverUrl';

/** Connects to one layout while the screen is mounted. */
export function useLayoutSync(layoutId: string, role: Role) {
  const client = useMemo(() => new SyncClient(syncUrl(), layoutId, CLIENT_ID, role), [layoutId, role]);

  // start/stop are idempotent, so StrictMode's mount → unmount → mount just reconnects.
  useEffect(() => {
    client.start();
    return () => client.stop();
  }, [client]);

  const snapshot = useStore(client.store);
  return { ...snapshot, submit: client.submit };
}

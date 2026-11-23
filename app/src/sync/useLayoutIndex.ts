import type { LayoutSummary, Role } from '@field-form/shared';
import { useEffect, useMemo } from 'react';
import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';
import { ReconnectingSocket, type SocketStatus } from './ReconnectingSocket';
import { CLIENT_ID } from './clientId';
import { syncUrl } from './serverUrl';

interface IndexSnapshot {
  layouts: LayoutSummary[];
  status: SocketStatus;
}

/** Live list of every layout, most recently edited first, pushed by the server. */
export function useLayoutIndex(role: Role): IndexSnapshot {
  const { store, socket } = useMemo(() => {
    const store = createStore<IndexSnapshot>(() => ({ layouts: [], status: 'connecting' }));
    const socket: ReconnectingSocket = new ReconnectingSocket(syncUrl(), {
      onOpen: () => socket.send({ type: 'watchIndex', clientId: CLIENT_ID, role }),
      onMessage: (msg) => {
        if (msg.type === 'index') store.setState({ layouts: msg.layouts });
      },
      onStatus: (status) => store.setState({ status }),
    });
    return { store, socket };
  }, [role]);

  useEffect(() => {
    socket.start();
    return () => socket.stop();
  }, [socket]);

  return useStore(store);
}

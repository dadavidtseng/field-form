import { applyOp, restoreState, type LayoutDoc, type LayoutSummary, type Op, type Role } from '@field-form/shared';
import { useEffect, useMemo } from 'react';
import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';
import { ReconnectingSocket, type SocketStatus } from './ReconnectingSocket';
import { CLIENT_ID } from './clientId';
import { sqliteStorage } from './localStore';
import { syncUrl } from './serverUrl';

/** A list row; `unsynced` marks a space that so far exists only on this device. */
export type LayoutRow = LayoutSummary & { unsynced?: boolean };

interface IndexSnapshot {
  layouts: LayoutSummary[];
  status: SocketStatus;
}

/**
 * Spaces saved on this device with edits the server has not seen (e.g. created with no signal),
 * so Dana can find and continue them before they sync.
 */
function unsyncedLocalSpaces(known: Set<string>): LayoutRow[] {
  let saved: ReturnType<typeof sqliteStorage.list>;
  try {
    saved = sqliteStorage.list();
  } catch {
    return [];
  }
  const rows: LayoutRow[] = [];
  for (const { layoutId, savedAt, state } of saved) {
    if (known.has(layoutId) || state.pending.length === 0) continue;
    const view: LayoutDoc = restoreState<LayoutDoc, Op>(state.confirmed, state.lastSeq, state.pending, applyOp).state
      .view;
    if (!view || view.archived) continue;
    const closed = view.outline.closingWallId !== null;
    rows.push({
      id: layoutId,
      name: view.name,
      kind: view.kind,
      updatedAt: savedAt,
      walls: view.outline.walls.length + (closed ? 1 : 0),
      closed,
      live: false,
      unsynced: true,
    });
  }
  return rows;
}

/** Live list of every layout, most recently edited first, pushed by the server. */
export function useLayoutIndex(role: Role): IndexSnapshot & { rows: LayoutRow[] } {
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

  const snapshot = useStore(store);
  // Only the field creates spaces, so only the field has local-only ones to show.
  const rows = useMemo<LayoutRow[]>(() => {
    if (role !== 'field') return snapshot.layouts;
    const local = unsyncedLocalSpaces(new Set(snapshot.layouts.map((l) => l.id)));
    return [...local, ...snapshot.layouts];
  }, [role, snapshot.layouts]);

  return { ...snapshot, rows };
}

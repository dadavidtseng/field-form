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
  /** False until the server's first list arrives (e.g. the app was restarted with no signal). */
  received: boolean;
  status: SocketStatus;
}

/**
 * Spaces saved on this device that the server's list does not show. Before the server has
 * answered, that is every saved space, so an offline restart still lists the day's work;
 * afterwards only those with edits the server has not seen (e.g. created with no signal).
 */
function localSpaces(known: Set<string>, includeSynced: boolean): LayoutRow[] {
  let saved: ReturnType<typeof sqliteStorage.list>;
  try {
    saved = sqliteStorage.list();
  } catch {
    return [];
  }
  const rows: LayoutRow[] = [];
  for (const { layoutId, savedAt, state } of saved) {
    const unsynced = state.pending.length > 0;
    if (known.has(layoutId) || (!unsynced && !includeSynced)) continue;
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
      unsynced,
    });
  }
  return rows;
}

/** Live list of every layout, most recently edited first, pushed by the server. */
export function useLayoutIndex(role: Role): IndexSnapshot & { rows: LayoutRow[] } {
  const { store, socket } = useMemo(() => {
    const store = createStore<IndexSnapshot>(() => ({ layouts: [], received: false, status: 'connecting' }));
    const socket: ReconnectingSocket = new ReconnectingSocket(syncUrl(), {
      onOpen: () => socket.send({ type: 'watchIndex', clientId: CLIENT_ID, role }),
      onMessage: (msg) => {
        if (msg.type === 'index') store.setState({ layouts: msg.layouts, received: true });
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
  const rows = useMemo<LayoutRow[]>(() => {
    // Once the server has answered, only the field can have spaces it hasn't seen (it creates them).
    if (snapshot.received && role !== 'field') return snapshot.layouts;
    const local = localSpaces(new Set(snapshot.layouts.map((l) => l.id)), !snapshot.received);
    return [...local, ...snapshot.layouts].sort((a, b) => b.updatedAt - a.updatedAt);
  }, [role, snapshot.layouts, snapshot.received]);

  return { ...snapshot, rows };
}

import type { LayoutDoc, Op, Pending } from '@field-form/shared';
import { openDatabaseSync, type SQLiteDatabase } from 'expo-sqlite';

/** What has to survive an app restart for one layout. The view is always recomputed from it. */
export interface SavedState {
  confirmed: LayoutDoc;
  lastSeq: number;
  pending: Pending<Op>[];
}

/** Storage seam, so the sync client does not depend on SQLite directly. */
export interface StateStorage {
  load(layoutId: string): SavedState | null;
  save(layoutId: string, state: SavedState): void;
  /** Every layout saved on this device, newest first (for spaces the server has not seen yet). */
  list(): { layoutId: string; savedAt: number; state: SavedState }[];
}

let db: SQLiteDatabase | null = null;

function database(): SQLiteDatabase {
  if (db) return db;
  db = openDatabaseSync('field-form.db');
  db.execSync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS layout_state (
      layout_id TEXT PRIMARY KEY,
      confirmed TEXT NOT NULL,
      last_seq  INTEGER NOT NULL,
      saved_at  INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS pending_op (
      layout_id TEXT NOT NULL,
      position  INTEGER NOT NULL,
      op_id     TEXT NOT NULL,
      op        TEXT NOT NULL,
      PRIMARY KEY (layout_id, position)
    );
  `);
  return db;
}

interface StateRow {
  layout_id: string;
  confirmed: string;
  last_seq: number;
  saved_at: number;
}

interface PendingRow {
  op_id: string;
  op: string;
}

function readPending(d: SQLiteDatabase, layoutId: string): Pending<Op>[] {
  return d
    .getAllSync<PendingRow>('SELECT op_id, op FROM pending_op WHERE layout_id = ? ORDER BY position', layoutId)
    .map((r) => ({ opId: r.op_id, op: JSON.parse(r.op) as Op }));
}

const toState = (d: SQLiteDatabase, row: StateRow): SavedState => ({
  confirmed: JSON.parse(row.confirmed) as LayoutDoc,
  lastSeq: row.last_seq,
  pending: readPending(d, row.layout_id),
});

/** expo-sqlite implementation. The whole state is rewritten in one transaction: a crash keeps the old or the new, never half. */
export const sqliteStorage: StateStorage = {
  load(layoutId) {
    const d = database();
    const row = d.getFirstSync<StateRow>('SELECT * FROM layout_state WHERE layout_id = ?', layoutId);
    return row ? toState(d, row) : null;
  },

  save(layoutId, state) {
    const d = database();
    d.withTransactionSync(() => {
      d.runSync(
        `INSERT INTO layout_state (layout_id, confirmed, last_seq, saved_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(layout_id) DO UPDATE SET confirmed = excluded.confirmed, last_seq = excluded.last_seq,
         saved_at = excluded.saved_at`,
        layoutId,
        JSON.stringify(state.confirmed),
        state.lastSeq,
        Date.now(),
      );
      d.runSync('DELETE FROM pending_op WHERE layout_id = ?', layoutId);
      state.pending.forEach((p, i) =>
        d.runSync(
          'INSERT INTO pending_op (layout_id, position, op_id, op) VALUES (?, ?, ?, ?)',
          layoutId,
          i,
          p.opId,
          JSON.stringify(p.op),
        ),
      );
    });
  },

  list() {
    const d = database();
    return d
      .getAllSync<StateRow>('SELECT * FROM layout_state ORDER BY saved_at DESC')
      .map((row) => ({ layoutId: row.layout_id, savedAt: row.saved_at, state: toState(d, row) }));
  },
};

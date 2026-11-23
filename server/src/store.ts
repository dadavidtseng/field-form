import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { Op } from '@field-form/shared';

export interface StoredCommit {
  layoutId: string;
  seq: number;
  opId: string;
  clientId: string;
  op: Op;
  at: number;
}

/** Storage seam: moving from SQLite to Postgres means one new implementation of this interface. */
export interface CommitStore {
  since(layoutId: string, afterSeq: number): StoredCommit[];
  byOpId(opId: string): StoredCommit | undefined;
  append(commit: StoredCommit): void;
  /** Every layout that has at least one commit. */
  layoutIds(): string[];
}

interface Row {
  layout_id: string;
  seq: number;
  op_id: string;
  client_id: string;
  op: string;
  at: number;
}

const toCommit = (r: Row): StoredCommit => ({
  layoutId: r.layout_id,
  seq: r.seq,
  opId: r.op_id,
  clientId: r.client_id,
  op: JSON.parse(r.op) as Op,
  at: r.at,
});

/** `path` may be ':memory:' for tests. */
export function openSqliteStore(path: string): CommitStore {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS commits (
      layout_id TEXT    NOT NULL,
      seq       INTEGER NOT NULL,
      op_id     TEXT    NOT NULL UNIQUE,
      client_id TEXT    NOT NULL,
      op        TEXT    NOT NULL,
      at        INTEGER NOT NULL,
      PRIMARY KEY (layout_id, seq)
    );
  `);
  const sinceStmt = db.prepare('SELECT * FROM commits WHERE layout_id = ? AND seq > ? ORDER BY seq');
  const byOpIdStmt = db.prepare('SELECT * FROM commits WHERE op_id = ?');
  const insertStmt = db.prepare(
    'INSERT INTO commits (layout_id, seq, op_id, client_id, op, at) VALUES (?, ?, ?, ?, ?, ?)',
  );
  const layoutIdsStmt = db.prepare('SELECT DISTINCT layout_id FROM commits');

  return {
    since: (layoutId, afterSeq) => (sinceStmt.all(layoutId, afterSeq) as unknown as Row[]).map(toCommit),
    byOpId: (opId) => {
      const row = byOpIdStmt.get(opId) as unknown as Row | undefined;
      return row ? toCommit(row) : undefined;
    },
    // A single INSERT is atomic; the (layout_id, seq) key and UNIQUE op_id reject duplicates.
    append: (c) => {
      insertStmt.run(c.layoutId, c.seq, c.opId, c.clientId, JSON.stringify(c.op), c.at);
    },
    layoutIds: () => (layoutIdsStmt.all() as unknown as { layout_id: string }[]).map((r) => r.layout_id),
  };
}

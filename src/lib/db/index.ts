import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import { buildCounterPool, buildRuntimePool } from '../../../db/connection';
import * as schema from '../../../db/schema';

/**
 * The server's two Postgres pools. Next dev hot-reloads modules, so each
 * pool is cached on globalThis to avoid leaking connections on every edit.
 * It is cached in production too, so a second import of this module (there
 * should only ever be one) reuses the same pools. `buildRuntimePool`
 * (db/connection.ts) does the actual construction. It is shared with
 * db/test/runtime-pool.test.ts so both exercise the same code path, and it
 * is safe to call at import time: nothing in it throws with no DB env at
 * all, which is how `next build` runs.
 */
const globalForDb = globalThis as unknown as { pool?: Pool; counterPool?: Pool };

const pool = globalForDb.pool ?? buildRuntimePool();

// Rate limits and Studio prompt allowances get two connections of their own
// through buildCounterPool. They give up in 400 ms in Postgres, 500 ms in the
// client, or 2 s while waiting for a connection. The main pool's sessions and
// history do not queue behind counters. The connect bound is looser because it
// also covers opening a connection through the Cloud SQL connector, which a
// quiet instance does again after 30 s idle.
const counterPool = globalForDb.counterPool ?? buildCounterPool();

globalForDb.pool = pool;
globalForDb.counterPool = counterPool;

/** Accounts, conversation history, and shares. */
export const db = drizzle(pool, { schema });

/** Per-address rate limits and Studio prompt-allowance counters. */
export const counterDb = drizzle(counterPool, { schema });

export type Db = typeof db;

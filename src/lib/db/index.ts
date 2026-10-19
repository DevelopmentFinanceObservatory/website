import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import { buildRuntimePool } from '../../../db/connection';
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

// Every /api and /mcp call counts against its address's limit
// (src/lib/proxy/rateLimit), so the counts get two connections of their own
// and give up fast: a count fails, instead of running later, when it waits
// longer than COUNTER_CONNECT_MS for a connection or COUNTER_QUERY_MS for its
// answer. The main pool's sessions and history do not queue behind the
// counts. The connect bound is the looser one because it also covers opening
// a connection through the Cloud SQL connector, which a quiet instance does
// again after 30 s idle.
const COUNTER_CONNECT_MS = 2_000;
const COUNTER_QUERY_MS = 500;

const counterPool =
    globalForDb.counterPool ??
    buildRuntimePool(process.env, {
        max: 2,
        connectionTimeoutMillis: COUNTER_CONNECT_MS,
        query_timeout: COUNTER_QUERY_MS,
    });

globalForDb.pool = pool;
globalForDb.counterPool = counterPool;

/** Accounts, conversation history, shares, the Studio's prompt allowances. */
export const db = drizzle(pool, { schema });

/** The per-address rate-limit counters only. */
export const counterDb = drizzle(counterPool, { schema });

export type Db = typeof db;

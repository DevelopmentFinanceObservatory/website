import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import { buildRuntimePool } from '../../../db/connection';
import * as schema from '../../../db/schema';

/**
 * The one Postgres pool for the server (accounts, conversation history). Next
 * dev hot-reloads modules, so the pool is cached on globalThis to avoid
 * leaking connections on every edit -- cached in production too, so a
 * second import of this module (there should only ever be one) reuses the
 * same pool. `buildRuntimePool` (db/connection.ts) does the actual
 * construction -- shared with db/test/runtime-pool.test.ts so both exercise
 * the same code path -- and is safe to call at import time: nothing in it
 * throws with no DB env at all, which is how `next build` runs.
 */
const globalForDb = globalThis as unknown as { pool?: Pool };

const pool = globalForDb.pool ?? buildRuntimePool();

globalForDb.pool = pool;

export const db = drizzle(pool, { schema });

export type Db = typeof db;

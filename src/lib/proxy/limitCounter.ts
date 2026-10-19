import { sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { limitCounter } from '../../../db/schema.ts';

/**
 * Fixed-window counters in Postgres (table `limit_counter`), shared by every
 * server instance: the per-address limits on /api and /mcp
 * (./rateLimit) and the Studio's daily prompt allowances
 * (src/lib/studio/spendPrompt). Each function takes the database handle
 * first, so `node --test` runs them on a migrated test database.
 */
export type CounterDb = Pick<NodePgDatabase, 'execute'>;

export type Verdict = {
    allowed: boolean;
    limit: number;
    remaining: number;
    // Whole seconds until the window ends.
    reset: number;
};

// Rows whose window started this long ago are dead for any window of a day
// or less, the longest the site uses.
const PRUNE_AFTER_S = 2 * 86_400;

/**
 * Count one hit on `key` in the current window of `windowS` seconds, and
 * say whether it is within `limit`. A refused hit counts too. Windows are
 * aligned to the Unix epoch on the database's clock, so every instance
 * agrees where one starts and a day-long window runs from 00:00 UTC. A row
 * left from an earlier window starts over at 1. Concurrent hits on one key
 * queue on the row's lock, so none is lost, and a hit that read the clock
 * just before a boundary leaves the row in the later window.
 */
export const countHit = async (
    db: CounterDb,
    key: string,
    limit: number,
    windowS: number,
): Promise<Verdict> => {
    const stride = sql`make_interval(secs => ${windowS})`;
    const { rows } = await db.execute<{ count: number; reset: number }>(sql`
        insert into ${limitCounter} (key, window_start, count)
        values (${key}, date_bin(${stride}, now(), timestamptz 'epoch'), 1)
        on conflict (key) do update set
            count = case
                when ${limitCounter.windowStart} >= excluded.window_start
                    then ${limitCounter.count} + 1
                else 1
            end,
            window_start = greatest(${limitCounter.windowStart}, excluded.window_start)
        returning
            count,
            ceil(extract(epoch from window_start + ${stride} - now()))::int as reset
    `);
    const { count, reset } = rows[0]!;

    return { allowed: count <= limit, limit, remaining: Math.max(0, limit - count), reset };
};

/**
 * Give back one hit on `key`, for a call that turned out to cost nothing.
 * Only within the window the hit was counted in, so it runs straight after
 * the call. A row that has since started a new window is left alone.
 */
export const refundHit = async (db: CounterDb, key: string, windowS: number): Promise<void> => {
    await db.execute(sql`
        update ${limitCounter}
        set count = count - 1
        where key = ${key}
            and count > 0
            and window_start = date_bin(make_interval(secs => ${windowS}), now(), timestamptz 'epoch')
    `);
};

/** Delete the counters whose window started more than two days ago. */
export const pruneCounters = async (db: CounterDb): Promise<void> => {
    await db.execute(sql`
        delete from ${limitCounter}
        where ${limitCounter.windowStart} < now() - make_interval(secs => ${PRUNE_AFTER_S})
    `);
};

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

/** A successful conditional reservation, tied to the exact counter window it spent. */
export type Reservation = {
    key: string;
    windowStart: Date;
};

export type ReservationVerdict =
    | { admitted: true; receipt: Reservation; limit: number; remaining: number; reset: number }
    | { admitted: false; limit: number; remaining: 0; reset: number };

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
 * Reserve one hit only if it fits within `limit`. Unlike `countHit`, a
 * refusal does not change the counter. The receipt identifies the exact
 * window that accepted the hit, so a later refund cannot credit a new one.
 */
export const reserveHit = async (
    db: CounterDb,
    key: string,
    limit: number,
    windowS: number,
): Promise<ReservationVerdict> => {
    const stride = sql`make_interval(secs => ${windowS})`;
    const { rows } = await db.execute<{
        count: number | null;
        window_start: Date | null;
        reset: number;
    }>(
        sql`
            with current_window as (
                select
                    date_bin(${stride}, now(), timestamptz 'epoch') as window_start,
                    ceil(
                        extract(
                            epoch from date_bin(${stride}, now(), timestamptz 'epoch') + ${stride} - now()
                        )
                    )::int as reset
            ), reserved as (
                insert into ${limitCounter} (key, window_start, count)
                select ${key}, window_start, 1 from current_window
                on conflict (key) do update set
                    count = case
                        when ${limitCounter.windowStart} < excluded.window_start then 1
                        else ${limitCounter.count} + 1
                    end,
                    window_start = greatest(${limitCounter.windowStart}, excluded.window_start)
                where ${limitCounter.windowStart} < excluded.window_start
                    or (
                        ${limitCounter.windowStart} = excluded.window_start
                        and ${limitCounter.count} < ${limit}
                    )
                returning count, window_start
            )
            select reserved.count, reserved.window_start, current_window.reset
            from current_window
            left join reserved on true
        `,
    );
    const { count, window_start: windowStart, reset } = rows[0]!;

    if (count === null || windowStart === null) {
        return { admitted: false, limit, remaining: 0, reset };
    }

    return {
        admitted: true,
        receipt: { key, windowStart },
        limit,
        remaining: Math.max(0, limit - count),
        reset,
    };
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

/** Give back a reservation only in the exact window that accepted it. */
export const refundReservation = async (db: CounterDb, receipt: Reservation): Promise<void> => {
    await db.execute(sql`
        update ${limitCounter}
        set count = count - 1
        where key = ${receipt.key}
            and window_start = ${receipt.windowStart}
            and count > 0
    `);
};

/** Delete the counters whose window started more than two days ago. */
export const pruneCounters = async (db: CounterDb): Promise<void> => {
    await db.execute(sql`
        delete from ${limitCounter}
        where ${limitCounter.windowStart} < now() - make_interval(secs => ${PRUNE_AFTER_S})
    `);
};

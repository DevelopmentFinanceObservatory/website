import { inArray, sql, type SQL } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { limitCounter } from '../../../db/schema.ts';

import { limiterBucket } from './caller.ts';

/**
 * Fixed-window counters in Postgres (table `limit_counter`), shared by every
 * server instance: the per-address limits on /api and /mcp
 * (./rateLimit), the Studio's daily prompt allowances
 * (src/lib/studio/spendPrompt) and the hourly caps on sign-in codes sent
 * (src/lib/auth/codeLimit). Each function takes the database handle
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

/** The window of a daily API quota in seconds: a UTC day, epoch-aligned. */
export const DAY_S = 86_400;

/** Age of `window_start` past which the prune deletes a row whatever its `expires_at`. */
const PRUNE_AFTER_S = 2 * DAY_S;

/** The counter key of an account's daily API quota, which every key of the account spends. */
export const accountDailyCounterKey = (accountId: string): string => `apiday:user:${accountId}`;

/** The counter key of one API key's own daily cap. */
export const keyDailyCounterKey = (keyId: string): string => `apiday:key:${keyId}`;

/** The counter key of the visitor `visitorId`'s anonymous calls on `surface` in a UTC day. */
export const visitorDailyCounterKey = (surface: string, visitorId: string): string =>
    `anonday:${surface}:visitor:${visitorId}`;

/**
 * The counter key of the address `ip`'s anonymous calls on `surface` with no
 * valid visitor token in a UTC day (limiterBucket names the address).
 */
export const cookielessDailyCounterKey = (surface: string, ip: string): string =>
    `anonday:${surface}:cookieless:${limiterBucket(ip)}`;

/**
 * The counter key of all the address `ip`'s anonymous calls on `surface` in a
 * UTC day, with a visitor token or without: the address's daily ceiling.
 */
export const addressDailyCounterKey = (surface: string, ip: string): string =>
    `anonday:${surface}:addr:${limiterBucket(ip)}`;

/**
 * The per-minute counter key of the address `ip`'s calls on `surface`
 * (limiterBucket names the address): every call while visitor limits are
 * off, and 'mcp' and 'pin' always.
 */
export const addressCounterKey = (surface: string, ip: string): string =>
    `${surface}:${limiterBucket(ip)}`;

/** The per-minute counter key of the visitor `visitorId`'s calls on `surface`. */
export const visitorCounterKey = (surface: string, visitorId: string): string =>
    `${surface}:visitor:${visitorId}`;

/**
 * The per-minute counter key of the address `ip`'s calls on `surface` with
 * no valid visitor token, apart from addressCounterKey's.
 */
export const cookielessCounterKey = (surface: string, ip: string): string =>
    `${surface}:cookieless:${limiterBucket(ip)}`;

/**
 * The per-minute counter key of the address `ip`'s backstop on `surface`:
 * all its anonymous calls, with visitor tokens or without.
 */
export const backstopCounterKey = (surface: string, ip: string): string =>
    `${surface}:backstop:${limiterBucket(ip)}`;

// The upsert of one hit on a row that exists: a row from an earlier window
// starts over at 1 in the hit's window, and `expires_at` moves with the
// window, its length taken from the hit's own row.
const countOnConflict = sql`
    count = case
        when ${limitCounter.windowStart} >= excluded.window_start then ${limitCounter.count} + 1
        else 1
    end,
    window_start = greatest(${limitCounter.windowStart}, excluded.window_start),
    expires_at = greatest(${limitCounter.windowStart}, excluded.window_start)
        + (excluded.expires_at - excluded.window_start)
`;

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
        insert into ${limitCounter} (key, window_start, count, expires_at)
        values (
            ${key},
            date_bin(${stride}, now(), timestamptz 'epoch'),
            1,
            date_bin(${stride}, now(), timestamptz 'epoch') + ${stride}
        )
        on conflict (key) do update set ${countOnConflict}
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
                insert into ${limitCounter} (key, window_start, count, expires_at)
                select ${key}, window_start, 1, window_start + ${stride} from current_window
                on conflict (key) do update set ${countOnConflict}
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
 * The counters one anonymous call spends, by stage: `minute` and `day` are
 * the call's own counts, the visitor's or the address's cookieless one, per
 * window and per UTC day. `backstop` (per window) and `ceiling` (per UTC
 * day) are the address's counts, which every anonymous call at the address
 * shares. A stage left out is not counted.
 */
export type AdmissionStage = 'backstop' | 'ceiling' | 'minute' | 'day';

export type AdmissionCounter = { key: string; limit: number };

export type AdmissionPlan = {
    backstop?: AdmissionCounter;
    ceiling?: AdmissionCounter;
    minute: AdmissionCounter;
    day?: AdmissionCounter;
};

/**
 * The outcome of admitHit: the stage that refused the call, or null, and
 * each stage's verdict, a gate's read where the call never reached its
 * debit. A counter's verdict is in the shape countHit's is.
 */
export type Admission = {
    refusedBy: AdmissionStage | null;
    verdicts: Partial<Record<AdmissionStage, Verdict>>;
};

/** The order admitHit reads, counts and debits a plan's stages in. */
export const GATE_STAGES = ['backstop', 'ceiling'] as const;
export const TIER_STAGES = ['minute', 'day'] as const;

/** Whether `stage` counts in a UTC day, else in the per-minute window. */
export const isDailyStage = (stage: AdmissionStage): boolean =>
    stage === 'ceiling' || stage === 'day';

/** The verdict of a count of `count` hits against `limit`, as countHit gives it. */
export const countVerdict = (count: number, limit: number, reset: number): Verdict => ({
    allowed: count <= limit,
    limit,
    remaining: Math.max(0, limit - count),
    reset,
});

/** The verdict of a read of `used` hits against `limit`: whether one more fits. */
export const readVerdict = (used: number, limit: number, reset: number): Verdict => ({
    allowed: used < limit,
    limit,
    remaining: Math.max(0, limit - used),
    reset,
});

type AdmissionRow = {
    backstop_used: number;
    ceiling_used: number;
    minute_count: number | null;
    day_count: number | null;
    backstop_count: number | null;
    ceiling_count: number | null;
    minute_reset: number;
    day_reset: number;
};

/**
 * Count one anonymous call on `plan` in one statement, per-minute windows
 * of `minuteS` seconds, and in this order, each step only once the one
 * before admits the call:
 *
 *   1. read the address's backstop and daily ceiling, an ended window as 0;
 *      either one spent refuses the call, and nothing is written
 *   2. count the call's own per-minute count, a refused hit included
 *   3. count its own daily count, a refused hit included
 *   4. debit the backstop, then the ceiling
 *
 * So calls refused at the gates, such as fresh visitor ids from an address
 * over its budget, create no rows, and the address's shared counts are
 * spent only by calls their own counts admit. Each step selects from the
 * previous one's RETURNING, which fixes the order Postgres runs the writes
 * and locks the rows in: every call at an address takes the backstop row
 * before the ceiling row, so two calls never wait on each other in a cycle.
 * The gate read is the statement's snapshot, so calls in flight at the
 * edge of the budget all pass it. The debits count under the row lock and
 * decide the call: a debit past its limit refuses it, its own counts
 * already spent.
 */
export const admitHit = async (
    db: CounterDb,
    plan: AdmissionPlan,
    minuteS: number,
): Promise<Admission> => {
    const minute = sql`make_interval(secs => ${minuteS})`;
    const day = sql`make_interval(secs => ${DAY_S})`;
    const key = (stage: AdmissionStage) => sql`${plan[stage]?.key ?? null}::text`;
    const limit = (stage: AdmissionStage) => sql`${plan[stage]?.limit ?? 0}::int`;
    // A stage left out of the plan passes, and its hit selects no row.
    const within = (stage: AdmissionStage, count: SQL) =>
        sql`(${key(stage)} is null or ${count} <= ${limit(stage)})`;

    const { rows } = await db.execute<AdmissionRow>(sql`
        with clock as (
            select
                date_bin(${minute}, now(), timestamptz 'epoch') as minute_start,
                date_bin(${day}, now(), timestamptz 'epoch') as day_start
        ), gates as (
            select
                clock.minute_start,
                clock.day_start,
                coalesce((
                    select ${limitCounter.count} from ${limitCounter}
                    where ${limitCounter.key} = ${key('backstop')}
                        and ${limitCounter.windowStart} >= clock.minute_start
                ), 0) as backstop_used,
                coalesce((
                    select ${limitCounter.count} from ${limitCounter}
                    where ${limitCounter.key} = ${key('ceiling')}
                        and ${limitCounter.windowStart} >= clock.day_start
                ), 0) as ceiling_used
            from clock
        ), minute_hit as (
            insert into ${limitCounter} (key, window_start, count, expires_at)
            select ${key('minute')}, minute_start, 1, minute_start + ${minute}
            from gates
            where ${within('backstop', sql`backstop_used + 1`)}
                and ${within('ceiling', sql`ceiling_used + 1`)}
            on conflict (key) do update set ${countOnConflict}
            returning count
        ), day_hit as (
            insert into ${limitCounter} (key, window_start, count, expires_at)
            select ${key('day')}, gates.day_start, 1, gates.day_start + ${day}
            from gates, minute_hit
            where ${key('day')} is not null and ${within('minute', sql`minute_hit.count`)}
            on conflict (key) do update set ${countOnConflict}
            returning count
        ), backstop_hit as (
            insert into ${limitCounter} (key, window_start, count, expires_at)
            select ${key('backstop')}, gates.minute_start, 1, gates.minute_start + ${minute}
            from gates
            cross join minute_hit
            left join day_hit on true
            where ${key('backstop')} is not null
                and ${within('minute', sql`minute_hit.count`)}
                and ${within('day', sql`day_hit.count`)}
            on conflict (key) do update set ${countOnConflict}
            returning count
        ), ceiling_hit as (
            insert into ${limitCounter} (key, window_start, count, expires_at)
            select ${key('ceiling')}, gates.day_start, 1, gates.day_start + ${day}
            from gates
            cross join minute_hit
            left join day_hit on true
            left join backstop_hit on true
            where ${key('ceiling')} is not null
                and ${within('minute', sql`minute_hit.count`)}
                and ${within('day', sql`day_hit.count`)}
                and ${within('backstop', sql`backstop_hit.count`)}
            on conflict (key) do update set ${countOnConflict}
            returning count
        )
        select
            gates.backstop_used,
            gates.ceiling_used,
            (select count from minute_hit) as minute_count,
            (select count from day_hit) as day_count,
            (select count from backstop_hit) as backstop_count,
            (select count from ceiling_hit) as ceiling_count,
            ceil(extract(epoch from gates.minute_start + ${minute} - now()))::int as minute_reset,
            ceil(extract(epoch from gates.day_start + ${day} - now()))::int as day_reset
        from gates
    `);
    const row = rows[0]!;
    const reset = (stage: AdmissionStage) =>
        isDailyStage(stage) ? row.day_reset : row.minute_reset;
    const counts: Record<AdmissionStage, number | null> = {
        backstop: row.backstop_count,
        ceiling: row.ceiling_count,
        minute: row.minute_count,
        day: row.day_count,
    };
    const reads = { backstop: row.backstop_used, ceiling: row.ceiling_used };
    const verdicts: Admission['verdicts'] = {};
    let refusedBy: AdmissionStage | null = null;

    for (const stage of GATE_STAGES) {
        const counter = plan[stage];

        if (counter) {
            verdicts[stage] = readVerdict(reads[stage], counter.limit, reset(stage));
            refusedBy ??= verdicts[stage].allowed ? null : stage;
        }
    }

    for (const stage of [...TIER_STAGES, ...GATE_STAGES]) {
        const counter = plan[stage];
        const count = counts[stage];

        if (counter && count !== null) {
            verdicts[stage] = countVerdict(count, counter.limit, reset(stage));
            refusedBy ??= verdicts[stage].allowed ? null : stage;
        }
    }

    return { refusedBy, verdicts };
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

/**
 * Delete the counters whose window has ended. Nothing reads an ended window:
 * a count, a refund and dailyUsage each read the current one.
 *
 * A revision that does not write `expires_at` leaves the column's default,
 * `infinity`, on the rows it inserts, and leaves it unchanged, at or before
 * `window_start`, on a row it rolls into a new window. Neither row's
 * `expires_at` says when its window ends, so the prune deletes it only once
 * its window started two days ago, a test the window_start index serves.
 */
export const pruneCounters = async (db: CounterDb): Promise<void> => {
    await db.execute(
        sql`delete from ${limitCounter}
            where (${limitCounter.expiresAt} < now()
                    and ${limitCounter.expiresAt} > ${limitCounter.windowStart})
                or ${limitCounter.windowStart} < now() - make_interval(secs => ${PRUNE_AFTER_S})`,
    );
};

/**
 * The current UTC day's count of each daily counter in `counterKeys`
 * (accountDailyCounterKey, keyDailyCounterKey), refused calls included, by
 * counter key. A counter that does not exist, or is from an earlier day, is 0.
 */
export const dailyUsage = async (
    db: Pick<NodePgDatabase, 'select'>,
    counterKeys: string[],
): Promise<Map<string, number>> => {
    const used = new Map(counterKeys.map((key) => [key, 0]));

    if (counterKeys.length === 0) {
        return used;
    }

    const rows = await db
        .select({ key: limitCounter.key, count: limitCounter.count })
        .from(limitCounter)
        .where(
            sql`${inArray(limitCounter.key, counterKeys)}
                and ${limitCounter.windowStart} >= date_bin(make_interval(secs => ${DAY_S}), now(), timestamptz 'epoch')`,
        );

    for (const { key, count } of rows) {
        used.set(key, count);
    }

    return used;
};

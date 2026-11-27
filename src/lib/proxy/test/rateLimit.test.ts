/**
 * `rateLimit.ts`'s limiter on a migrated database: an address and an account
 * count apart, each against its own limit, on each surface; and a count that
 * fails or is slow does not let a burst through, since the instance counts it
 * in memory. With no env set, the allowances are the documented defaults.
 */
import '../../test/serverModules.ts';

import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

import { drizzle } from 'drizzle-orm/node-postgres';

import { applyMigrations } from '../../../../db/apply-migrations.ts';
import { buildCounterPool } from '../../../../db/connection.ts';
import { createTestDatabase } from '../../../../db/test/harness.ts';
import { createFallbackCounter } from '../limitFallback.ts';

const { createLimiter, dailyAllowance } = await import('../rateLimit.ts');

/** Whole seconds from `nowMs` to the next 00:00 UTC. */
const secondsToUtcMidnight = (nowMs: number): number => {
    const dayMs = 86_400_000;

    return Math.ceil((dayMs - (nowMs % dayMs)) / 1000);
};

const MIGRATIONS_FOLDER = path.resolve(import.meta.dirname, '../../../../db/migrations');

test('limiter: counts an address and an account apart, per surface, at the limit given', async (t) => {
    const database = await createTestDatabase();

    await applyMigrations(database.migratorPool(), {
        migrationsFolder: MIGRATIONS_FOLDER,
        runtimeDbUser: database.runtimeUser,
        migratorDbUser: database.migratorUser,
    });

    const host = process.env.PGHOST ?? 'localhost';
    const port = process.env.PGPORT ?? '5433';
    const pool = buildCounterPool({
        DATABASE_URL: `postgres://${database.runtimeUser}:${database.runtimePassword}@${host}:${port}/${database.databaseName}`,
    });

    t.after(async () => {
        await pool.end();
        await database.teardown();
    });

    const limiter = createLimiter(drizzle(pool), {
        windowS: 3600,
        warn: () => assert.fail('warned'),
    });

    await t.test('an account is held to its limit, and an address to its own', async () => {
        const account = [];

        for (let i = 0; i < 4; i++) {
            account.push(await limiter.hitKey('api', 'acct:a', 3));
        }

        assert.deepEqual(
            account.map(({ allowed, remaining }) => [allowed, remaining]),
            [
                [true, 2],
                [true, 1],
                [true, 0],
                [false, 0],
            ],
        );
        assert.equal(account[0]!.limit, 3);
        assert.equal((await limiter.hitKey('api', '203.0.113.7', 120)).remaining, 119);
    });

    await t.test('the same account counts on each surface apart', async () => {
        assert.equal((await limiter.hitKey('mcp', 'acct:a', 3)).remaining, 2);
        assert.equal((await limiter.hitKey('api', 'acct:b', 3)).remaining, 2);
    });

    await t.test('a daily counter is counted in a one-day window under its own key', async () => {
        const before = secondsToUtcMidnight(Date.now());
        const first = await limiter.hitDaily('apiday:user:k1', 2);
        const after = secondsToUtcMidnight(Date.now());
        const second = await limiter.hitDaily('apiday:user:k1', 2);
        const third = await limiter.hitDaily('apiday:user:k1', 2);

        assert.deepEqual(
            [first, second, third].map(({ allowed, remaining }) => [allowed, remaining]),
            [
                [true, 1],
                [true, 0],
                [false, 0],
            ],
        );
        // The window is a UTC day, whatever window the per-minute counts use.
        // Postgres counts the seconds, so allow its rounding and the call's own latency. When
        // the day turned during the call, the window it counted in is the new one.
        const turned = after > before;

        assert.ok(
            turned
                ? first.reset >= 86_400 - 2 || first.reset <= before + 1
                : first.reset >= after - 1 && first.reset <= before + 1,
            `reset ${first.reset} outside the seconds to midnight UTC, ${after} to ${before}`,
        );

        const { rows } = await pool.query(
            "select count from limit_counter where key = 'apiday:user:k1'",
        );

        assert.equal(rows[0].count, 3);
        // The same key's per-window count is separate.
        assert.equal((await limiter.hitKey('api', 'k1', 2)).remaining, 1);
    });

    await t.test(
        'a caller refused on the shared count stays refused when it then fails',
        async () => {
            // Postgres answers, then stops answering, within one window.
            let down = false;
            const real = drizzle(pool);
            const flaky = {
                execute: (...args: Parameters<typeof real.execute>) =>
                    down ? Promise.reject(new Error('database is down')) : real.execute(...args),
            };
            const limiter = createLimiter(flaky as never, {
                windowS: 3600,
                warn: () => {},
                prune: false,
            });

            assert.equal((await limiter.hitKey('api', 'acct:flaky', 1)).allowed, true);
            assert.equal((await limiter.hitKey('api', 'acct:flaky', 1)).allowed, false);

            down = true;
            assert.equal((await limiter.hitKey('api', 'acct:flaky', 1)).allowed, false);

            // A caller with room left goes on from its shared count, not from zero.
            down = false;
            assert.equal((await limiter.hitKey('api', 'acct:room', 3)).remaining, 2);
            down = true;
            assert.equal((await limiter.hitKey('api', 'acct:room', 3)).remaining, 1);
        },
    );

    await t.test(
        'an admission refused on the shared counts stays refused when the database then fails',
        async () => {
            let down = false;
            const real = drizzle(pool);
            const flaky = {
                execute: (...args: Parameters<typeof real.execute>) =>
                    down ? Promise.reject(new Error('database is down')) : real.execute(...args),
            };
            const limiter = createLimiter(flaky as never, {
                windowS: 3600,
                warn: () => {},
                prune: false,
            });
            const plan = (visitor: string) => ({
                minute: { key: `api:visitor:${visitor}`, limit: 1 },
                backstop: { key: 'api:backstop:198.51.100.40', limit: 2 },
            });

            assert.equal((await limiter.admit(plan('a'))).refusedBy, null);
            assert.equal((await limiter.admit(plan('a'))).refusedBy, 'minute');
            assert.equal((await limiter.admit(plan('b'))).refusedBy, null);

            // The in-memory count goes on from the shared counts it saw: the
            // visitor's own, and the backstop its admitted calls spent.
            down = true;
            assert.equal((await limiter.admit(plan('a'))).refusedBy, 'backstop');
            assert.equal((await limiter.admit(plan('c'))).refusedBy, 'backstop');
        },
    );

    await t.test(
        'a daily hit given back leaves the shared count and the in-memory count one lower',
        async () => {
            let down = false;
            const real = drizzle(pool);
            const flaky = {
                execute: (...args: Parameters<typeof real.execute>) =>
                    down ? Promise.reject(new Error('database is down')) : real.execute(...args),
            };
            const limiter = createLimiter(flaky as never, { warn: () => {}, prune: false });

            assert.equal((await limiter.hitDaily('apiday:key:refund', 1)).allowed, true);
            await limiter.refundDaily('apiday:key:refund');

            const { rows } = await pool.query(
                "select count from limit_counter where key = 'apiday:key:refund'",
            );

            assert.equal(rows[0].count, 0);

            // With the database down, the count goes on from the refunded one.
            down = true;
            assert.equal((await limiter.hitDaily('apiday:key:refund', 1)).allowed, true);
            assert.equal((await limiter.hitDaily('apiday:key:refund', 1)).allowed, false);
        },
    );
});

test('limiter: a count that fails is counted in memory instead of passing, and warns', async () => {
    const warned: string[] = [];
    const broken = {
        execute: async () => {
            throw new Error('database is down');
        },
    };
    const limiter = createLimiter(broken as never, {
        windowS: 60,
        warn: (message) => warned.push(message),
        prune: false,
        fallback: createFallbackCounter(60),
    });
    const verdicts = [];

    for (let i = 0; i < 4; i++) {
        verdicts.push(await limiter.hitKey('api', '203.0.113.7', 3));
    }

    assert.deepEqual(
        verdicts.map(({ allowed, remaining }) => [allowed, remaining]),
        [
            [true, 2],
            [true, 1],
            [true, 0],
            [false, 0],
        ],
    );
    assert.equal(warned.length, 4);

    // Keyed callers fall back the same way, each account apart.
    assert.equal((await limiter.hitKey('api', 'acct:a', 1)).allowed, true);
    assert.equal((await limiter.hitKey('api', 'acct:a', 1)).allowed, false);
    assert.equal((await limiter.hitKey('api', 'acct:b', 1)).allowed, true);
});

test('limiter: a failed count warns with the error code or class, never the query or its keys', async () => {
    const warned: string[] = [];
    const failing = (error: unknown) =>
        createLimiter(
            {
                execute: async () => {
                    throw error;
                },
            } as never,
            { warn: (message, error) => warned.push(`${message}: ${error}`), prune: false },
        );
    // A failed query's message carries its parameters, the visitor id among them.
    const timedOut = new Error(
        'Failed query: insert into "limit_counter" ... params: api:visitor:v-secret,1',
        { cause: Object.assign(new Error('canceling statement'), { code: '57014' }) },
    );
    const plan = { minute: { key: 'api:visitor:v-secret', limit: 5 } };

    for (const [error, code] of [
        [timedOut, '57014'],
        [new TypeError('bad params: api:visitor:v-secret'), 'TypeError'],
    ] as const) {
        const limiter = failing(error);

        warned.length = 0;
        await limiter.admit(plan);
        await limiter.hitKey('api', 'visitor:v-secret', 5);
        await limiter.hitDaily('anonday:api:visitor:v-secret', 5);
        await limiter.refundDaily('anonday:api:visitor:v-secret');

        assert.equal(warned.length, 4);
        assert.ok(
            warned.every((line) => line.endsWith(`: ${code}`)),
            warned.join('\n'),
        );
    }
});

test('limiter: a count that times out falls back too', async () => {
    const slow = {
        execute: () =>
            new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 10)),
    };
    const limiter = createLimiter(slow as never, { windowS: 60, warn: () => {}, prune: false });

    assert.equal((await limiter.hitKey('mcp', 'x', 1)).allowed, true);
    assert.equal((await limiter.hitKey('mcp', 'x', 1)).allowed, false);
    // The daily count falls back on its own one-day window.
    assert.equal((await limiter.hitDaily('x', 1)).allowed, true);
    assert.equal((await limiter.hitDaily('x', 1)).allowed, false);

    // An admission replays its whole order in memory: the daily stages on
    // the one-day window, so the day the hitDaily calls spent refuses it.
    const admission = await limiter.admit({
        minute: { key: 'mcp:y', limit: 5 },
        day: { key: 'x', limit: 1 },
    });

    assert.equal(admission.refusedBy, 'day');
    assert.equal(admission.verdicts.minute?.remaining, 4);
});

test('dailyAllowance: 0 turns the cap off, and an unset or malformed value keeps the default', () => {
    for (const [raw, expected] of [
        [undefined, 1000],
        ['', 1000],
        ['0', 0],
        ['250', 250],
        [' 250 ', 250],
        ['-1', 1000],
        ['1.5', 1000],
        ['lots', 1000],
    ] as const) {
        assert.equal(dailyAllowance(raw, 1000), expected, String(raw));
    }
});

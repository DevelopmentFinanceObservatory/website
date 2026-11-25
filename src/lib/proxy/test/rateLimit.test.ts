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

const {
    ACCOUNT_DAILY_LIMIT,
    ANONYMOUS_DAILY_LIMITS,
    COOKIELESS_LIMITS,
    createLimiter,
    dailyAllowance,
} = await import('../rateLimit.ts');

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
        const first = await limiter.hitDaily('apiday:user:k1', 2);
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
        assert.ok(first.reset > 3600 && first.reset <= 86_400);

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
});

test('defaults: 20 cookieless API calls a minute, 1,000 anonymous calls a day, 10,000 per account', () => {
    for (const name of [
        'RATE_LIMIT_API_ANON',
        'RATE_LIMIT_ANON_DAILY_API',
        'RATE_LIMIT_ANON_DAILY_DATASETS',
        'API_KEY_DAILY_LIMIT',
    ]) {
        assert.equal(process.env[name], undefined, `${name} is set, so the defaults are not seen`);
    }

    assert.equal(COOKIELESS_LIMITS.api, 20);
    assert.deepEqual(ANONYMOUS_DAILY_LIMITS, { api: 1000, datasets: 1000 });
    assert.equal(ACCOUNT_DAILY_LIMIT, 10_000);
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

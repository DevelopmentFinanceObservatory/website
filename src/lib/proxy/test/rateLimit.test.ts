/**
 * `rateLimit.ts`'s limiter on a migrated database: an address and an account
 * count apart, each against its own limit, on each surface; and a count that
 * fails or is slow does not let a burst through, since the instance counts it
 * in memory.
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

const { createLimiter } = await import('../rateLimit.ts');

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
});

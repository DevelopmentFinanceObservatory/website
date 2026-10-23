import path from 'node:path';
import assert from 'node:assert/strict';
import test from 'node:test';
import { drizzle } from 'drizzle-orm/node-postgres';

import { buildCounterPool, buildRuntimePool } from '../connection.ts';
import { applyMigrations } from '../apply-migrations.ts';
import { createTestDatabase } from './harness.ts';
import { countHit } from '../../src/lib/proxy/limitCounter.ts';

const MIGRATIONS_FOLDER = path.resolve(import.meta.dirname, '../migrations');

const causeOf = (error: Error): Error => {
    const cause = Reflect.get(error, 'cause');
    assert.ok(cause instanceof Error);

    return cause;
};

const testUrl = (database: {
    databaseName: string;
    runtimePassword: string;
    runtimeUser: string;
}): string => {
    const host = process.env.PGHOST ?? 'localhost';
    const port = process.env.PGPORT ?? '5433';

    return `postgres://${database.runtimeUser}:${database.runtimePassword}@${host}:${port}/${database.databaseName}`;
};

test('the counter pool bounds locked and queued counter work without blocking the main pool', async (t) => {
    const database = await createTestDatabase();
    t.after(() => database.teardown());

    await applyMigrations(database.migratorPool(), {
        migrationsFolder: MIGRATIONS_FOLDER,
        runtimeDbUser: database.runtimeUser,
        migratorDbUser: database.migratorUser,
    });

    await t.test(
        'a locked counter statement times out and the main pool keeps serving',
        async (t) => {
            const url = testUrl(database);
            const counterPool = buildCounterPool({ DATABASE_URL: url });
            const mainPool = buildRuntimePool({ DATABASE_URL: url });

            const counterDb = drizzle(counterPool);
            const mainDb = drizzle(mainPool);
            const key = 'api:locked-counter';
            await countHit(mainDb, key, 10, 60);

            const blocker = database.runtimePool();
            await blocker.query('begin');
            t.after(async () => {
                await blocker.query('rollback');
                await Promise.all([counterPool.end(), mainPool.end()]);
            });
            await blocker.query('select 1 from limit_counter where key = $1 for update', [key]);

            assert.deepEqual((await counterPool.query('show statement_timeout')).rows, [
                { statement_timeout: '400ms' },
            ]);

            let rejection: unknown;
            try {
                await countHit(counterDb, key, 10, 60);
            } catch (error) {
                rejection = error;
            }
            assert.ok(rejection instanceof Error);
            const cause = causeOf(rejection);
            assert.equal(Reflect.get(cause, 'code'), '57014');
            assert.match(cause.message, /statement timeout/i);
            assert.deepEqual((await mainPool.query('select 1 as one')).rows, [{ one: 1 }]);
            assert.equal(
                (
                    await database.adminPool().query<{ count: number }>(
                        `select count(*)::int as count
                     from pg_stat_activity
                     where datname = $1 and wait_event_type = 'Lock'`,
                        [database.databaseName],
                    )
                ).rows[0]?.count,
                0,
            );

            // The row remains locked, so this proves a timed-out counter does not
            // make the counter pool wait behind it before serving another key.
            assert.equal((await countHit(counterDb, 'api:after-timeout', 10, 60)).allowed, true);
        },
    );

    await t.test(
        'a counter queued behind both pool connections fails within the connection bound',
        async (t) => {
            const counterPool = buildCounterPool({ DATABASE_URL: testUrl(database) });
            const held = await Promise.all([counterPool.connect(), counterPool.connect()]);
            t.after(async () => {
                for (const client of held) {
                    client.release();
                }
                await counterPool.end();
            });

            const started = Date.now();
            await assert.rejects(
                () => countHit(drizzle(counterPool), 'api:queued-counter', 10, 60),
                (error: unknown) =>
                    error instanceof Error && /timeout/i.test(causeOf(error).message),
            );
            const elapsed = Date.now() - started;

            assert.ok(elapsed >= 1_500 && elapsed < 4_000, `queued for ${elapsed} ms`);
        },
    );
});

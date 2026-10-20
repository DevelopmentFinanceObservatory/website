import assert from 'node:assert/strict';
import test from 'node:test';
import { buildRuntimePool } from '../connection.ts';
import { createTestDatabase } from './harness.ts';

/**
 * pg-pool emits 'error' on the pool when an idle client's backend goes
 * away. Without a listener Node throws and the server dies, so
 * `buildRuntimePool` attaches one. The backend is terminated from the
 * admin pool. The test fails with an uncaught 'error' if the listener is
 * missing.
 */
test('a dropped idle connection is logged and the pool keeps serving', async (t) => {
    const database = await createTestDatabase();
    t.after(() => database.teardown());

    const logged = Promise.withResolvers<unknown[]>();
    t.mock.method(console, 'error', (...args: unknown[]) => logged.resolve(args));
    const host = process.env.PGHOST ?? 'localhost';
    const port = process.env.PGPORT ?? '5433';
    const url = `postgres://${database.runtimeUser}:${database.runtimePassword}@${host}:${port}/${database.databaseName}`;
    const pool = buildRuntimePool({ DATABASE_URL: url });
    t.after(() => pool.end());

    const {
        rows: [{ pid }],
    } = await pool.query<{ pid: number }>('select pg_backend_pid() as pid');

    await database.adminPool().query('select pg_terminate_backend($1)', [pid]);

    const [, error] = await logged.promise;
    assert.ok(error instanceof Error);
    assert.deepEqual((await pool.query('select 1 as one')).rows, [{ one: 1 }]);
});

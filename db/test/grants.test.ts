import path from 'node:path';
import assert from 'node:assert/strict';
import test from 'node:test';
import { applyMigrations } from '../apply-migrations.ts';
import { createTestDatabase } from './harness.ts';

const MIGRATIONS_FOLDER = path.resolve(import.meta.dirname, '../migrations');

/**
 * Proves migration 0000's global function-EXECUTE revoke and its
 * schema-scoped table/sequence grants both do what
 * `0000_bootstrap_grants.sql`'s comments claim, against a migrator that
 * holds only what production grants it (CONNECT + CREATE on the database,
 * CREATE + USAGE on schema `public`) -- never the superuser used to set
 * the database up. A superuser or database-owner migrator would let both
 * assertions below pass even if the revoke were missing.
 */
test('migration 0000 revokes function EXECUTE from PUBLIC but keeps table/sequence grants for the runtime role', async (t) => {
    const database = await createTestDatabase();
    t.after(() => database.teardown());

    const migratorPool = database.migratorPool();

    await applyMigrations(migratorPool, {
        migrationsFolder: MIGRATIONS_FOLDER,
        runtimeDbUser: database.runtimeUser,
        migratorDbUser: database.migratorUser,
    });

    // Objects created by the migrator AFTER the migration -- the same
    // ordering every real migration after 0000 follows.
    await migratorPool.query(`
        create table probe_rows (
            id serial primary key,
            value text not null
        )
    `);
    await migratorPool.query(`
        create function probe_whoami() returns text
        language sql
        security definer
        as $$ select current_user $$
    `);

    const runtimePool = database.runtimePool();

    await t.test('the runtime role cannot call the SECURITY DEFINER function', async () => {
        await assert.rejects(
            () => runtimePool.query('select probe_whoami()'),
            (error: unknown) => {
                assert.match(String(error), /permission denied for function probe_whoami/);
                return true;
            },
        );
    });

    await t.test('the runtime role can read and write the table', async () => {
        await runtimePool.query('insert into probe_rows (value) values ($1)', ['first']);

        const { rows } = await runtimePool.query<{ id: number; value: string }>(
            'select id, value from probe_rows where id = 1',
        );
        assert.equal(rows[0]?.id, 1);
        assert.equal(rows[0]?.value, 'first');

        await runtimePool.query('update probe_rows set value = $1 where id = 1', ['second']);

        const updated = await runtimePool.query<{ value: string }>(
            'select value from probe_rows where id = 1',
        );
        assert.equal(updated.rows[0]?.value, 'second');

        await runtimePool.query('delete from probe_rows where id = 1');

        const remaining = await runtimePool.query('select 1 from probe_rows where id = 1');
        assert.equal(remaining.rowCount, 0);
    });
});

test('ensureDatabaseRoles revokes PUBLIC default CONNECT on the database', async (t) => {
    const database = await createTestDatabase();
    t.after(() => database.teardown());

    const adminPool = database.adminPool();
    const { rows } = await adminPool.query<{ has_connect: boolean }>(
        'select has_database_privilege($1, $2, $3) as has_connect',
        ['public', database.databaseName, 'connect'],
    );

    assert.equal(rows[0]?.has_connect, false);
});

test('migration 0000 applies cleanly a second time (idempotent)', async (t) => {
    const database = await createTestDatabase();
    t.after(() => database.teardown());

    const migratorPool = database.migratorPool();
    const options = {
        migrationsFolder: MIGRATIONS_FOLDER,
        runtimeDbUser: database.runtimeUser,
        migratorDbUser: database.migratorUser,
    };

    await applyMigrations(migratorPool, options);
    await assert.doesNotReject(() => applyMigrations(migratorPool, options));
});

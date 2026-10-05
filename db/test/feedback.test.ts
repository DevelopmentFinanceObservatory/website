import path from 'node:path';
import assert from 'node:assert/strict';
import test from 'node:test';
import { applyMigrations } from '../apply-migrations.ts';
import { createTestDatabase } from './harness.ts';

const MIGRATIONS_FOLDER = path.resolve(import.meta.dirname, '../migrations');

/**
 * Proves migration 0005 creates the feedback table with the shape
 * `src/app/api/feedback/route.ts` depends on, and that migration 0000's
 * default privileges reach it: the table is created by the migrator, so
 * the runtime role must get its INSERT/SELECT without any grant of its
 * own inside 0005.
 */
test('migration 0005 creates a feedback table the runtime role can write', async (t) => {
    const database = await createTestDatabase();
    t.after(() => database.teardown());

    await applyMigrations(database.migratorPool(), {
        migrationsFolder: MIGRATIONS_FOLDER,
        runtimeDbUser: database.runtimeUser,
        migratorDbUser: database.migratorUser,
    });

    const runtimePool = database.runtimePool();

    await t.test('the runtime role inserts and reads back a submission', async () => {
        const inserted = await runtimePool.query<{ id: number }>(
            `insert into feedback (message, email, page, user_agent)
             values ($1, $2, $3, $4)
             returning id`,
            ['The data explorer is great.', 'visitor@example.org', '/topics/health', 'node-test'],
        );
        assert.ok(inserted.rows[0].id >= 1);

        const { rows } = await runtimePool.query<{ message: string; created_at: Date }>(
            'select message, created_at from feedback where id = $1',
            [inserted.rows[0].id],
        );
        assert.equal(rows[0]?.message, 'The data explorer is great.');
        assert.ok(rows[0]?.created_at instanceof Date);
    });

    await t.test('nullable columns accept an anonymous submission', async () => {
        const inserted = await runtimePool.query<{ id: number }>(
            'insert into feedback (message) values ($1) returning id',
            ['Anonymous note.'],
        );
        assert.ok(inserted.rows[0].id >= 1);
    });

    await t.test('the length check rejects an empty message', async () => {
        await assert.rejects(
            () => runtimePool.query('insert into feedback (message) values ($1)', ['']),
            (error: unknown) => {
                assert.match(String(error), /feedback_message_length/);
                return true;
            },
        );
    });

    await t.test('the length check rejects a message over 5000 characters', async () => {
        await assert.rejects(
            () => runtimePool.query('insert into feedback (message) values ($1)', ['x'.repeat(5001)]),
            (error: unknown) => {
                assert.match(String(error), /feedback_message_length/);
                return true;
            },
        );
    });

    await t.test('the identity column refuses a caller-supplied id', async () => {
        await assert.rejects(
            () =>
                runtimePool.query('insert into feedback (id, message) values ($1, $2)', [
                    999,
                    'forged id',
                ]),
            (error: unknown) => {
                // Postgres 18 words this "cannot insert a non-DEFAULT value into column"; older majors name GENERATED ALWAYS or say "can only be updated to DEFAULT".
                assert.match(String(error), /GENERATED ALWAYS|non-DEFAULT value|DEFAULT/i);
                return true;
            },
        );
    });
});

import { readFileSync } from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import test from 'node:test';
import { applyMigrations, MigrationLockError } from '../apply-migrations.ts';
import { createTestDatabase } from './harness.ts';

const MIGRATIONS_FOLDER = path.resolve(import.meta.dirname, '../migrations');

// Every migration in the journal, so the count below keeps holding as
// migrations are added.
const MIGRATION_COUNT = (
    JSON.parse(readFileSync(path.join(MIGRATIONS_FOLDER, 'meta/_journal.json'), 'utf8')) as {
        entries: unknown[];
    }
).entries.length;

// Bounds the test itself, independent of the lock's own retry budget
// (apply-migrations.ts: 10 attempts * 500ms = 5s), so a regression that
// brings back the blocking pg_advisory_lock (and therefore a real hang)
// fails this test instead of hanging the CI job.
const TEST_TIMEOUT_MS = 20_000;

/**
 * Proves two overlapping `applyMigrations` runs against the same database
 * serialize behind the advisory lock rather than both deciding to apply.
 * Each migration has exactly one `__drizzle_migrations` row afterward, and neither run
 * hangs. Each side gets its own `pool` with `max: 1`, mirroring
 * `connection.ts` in production -- this is what proves the single-checked-
 * out-client path (`applyMigrations` handing its own client to `drizzle()`
 * rather than keeping the whole pool) doesn't deadlock at that pool size.
 */
test(
    'two concurrent applyMigrations runs apply exactly once and neither hangs',
    { timeout: TEST_TIMEOUT_MS },
    async (t) => {
        const database = await createTestDatabase();
        t.after(() => database.teardown());

        const poolA = database.migratorPool();
        const poolB = database.migratorPool();
        const options = {
            migrationsFolder: MIGRATIONS_FOLDER,
            runtimeDbUser: database.runtimeUser,
            migratorDbUser: database.migratorUser,
        };

        const results = await Promise.allSettled([
            applyMigrations(poolA, options),
            applyMigrations(poolB, options),
        ]);

        for (const result of results) {
            if (result.status === 'rejected') {
                assert.ok(
                    result.reason instanceof MigrationLockError,
                    `expected a losing run to fail with MigrationLockError naming the ` +
                        `conflict, got: ${String(result.reason)}`,
                );
            }
        }

        assert.ok(
            results.some((result) => result.status === 'fulfilled'),
            'expected at least one of the two concurrent runs to apply the migration',
        );

        const admin = database.adminPool();
        const { rows } = await admin.query<{ count: string }>(
            'select count(*)::text as count from __drizzle_migrations',
        );
        assert.equal(
            rows[0]?.count,
            String(MIGRATION_COUNT),
            'each migration must be applied exactly once',
        );
    },
);

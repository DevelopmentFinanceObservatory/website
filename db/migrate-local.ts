import path from 'node:path';
import { Pool } from 'pg';
import { applyMigrations } from './apply-migrations.ts';
import { ensureDatabaseRoles, type AdminConnection } from './local-roles.ts';

const MIGRATIONS_FOLDER = path.resolve(import.meta.dirname, 'migrations');

// Same PG* env vars db/test/harness.ts reads, defaulting to `just db-up`'s
// container (postgres:18.4, superuser password `postgres`).
const SUPERUSER_HOST = process.env.PGHOST ?? 'localhost';
const SUPERUSER_PORT = Number(process.env.PGPORT ?? 5433);
const SUPERUSER_USER = process.env.PGUSER ?? 'postgres';
const SUPERUSER_PASSWORD = process.env.PGPASSWORD ?? 'postgres';

// Fixed identities for the one local database this script manages -- unlike
// db/test/harness.ts's randomly-suffixed roles, a developer's local
// database is a single long-lived thing they connect `psql` and
// DATABASE_URL to by name, so the names have to be stable across runs.
// Keep these in sync with the DATABASE_URL example in .env.example.
const DATABASE_NAME = 'website';
const MIGRATOR_USER = 'website_migrator';
const MIGRATOR_PASSWORD = 'website_migrator_dev_password';
const RUNTIME_USER = 'website_runtime';
const RUNTIME_PASSWORD = 'website_runtime_dev_password';

/**
 * `just db-migrate`'s entrypoint: brings a local Postgres server (started
 * by `just db-up`) up to the same migrator/runtime role split
 * `db/migrate.ts` assumes already exists on Cloud SQL, then applies every
 * migration through the same `applyMigrations` the deployed Job uses.
 * Idempotent both in role/grant setup (`ensureDatabaseRoles`) and in
 * migration application (drizzle-orm's own journal), so re-running this
 * after `just db-up` already ran is a no-op.
 */
async function main(): Promise<void> {
    const adminConnection: AdminConnection = {
        host: SUPERUSER_HOST,
        port: SUPERUSER_PORT,
        user: SUPERUSER_USER,
        password: SUPERUSER_PASSWORD,
    };

    await ensureDatabaseRoles(adminConnection, {
        databaseName: DATABASE_NAME,
        migratorUser: MIGRATOR_USER,
        migratorPassword: MIGRATOR_PASSWORD,
        runtimeUser: RUNTIME_USER,
        runtimePassword: RUNTIME_PASSWORD,
    });

    // `max: 1` mirrors connection.ts's production migrator pool -- this
    // script also runs one migration batch and exits.
    const migratorPool = new Pool({
        host: SUPERUSER_HOST,
        port: SUPERUSER_PORT,
        user: MIGRATOR_USER,
        password: MIGRATOR_PASSWORD,
        database: DATABASE_NAME,
        max: 1,
    });

    try {
        await applyMigrations(migratorPool, {
            migrationsFolder: MIGRATIONS_FOLDER,
            runtimeDbUser: RUNTIME_USER,
            migratorDbUser: MIGRATOR_USER,
        });

        console.log('local migrations applied');
    } finally {
        await migratorPool.end();
    }
}

main().catch((error: unknown) => {
    console.error('ERROR:', error instanceof Error ? error.stack : error);
    process.exitCode = 1;
});

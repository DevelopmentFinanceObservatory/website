import { randomBytes } from 'node:crypto';
import { Client, Pool } from 'pg';
import { ensureDatabaseRoles, type AdminConnection } from '../local-roles.ts';

/**
 * Connection info for the Postgres instance the CI `postgres:18` service
 * container (or `just db-up`'s local `postgres:18.4`) exposes. These are
 * the same PG* env vars `pg`/libpq read natively; defaults match
 * `just db-up`'s container on port 5433, so `pnpm test` needs no extra
 * setup beyond having that container up. ci.yml sets them explicitly.
 */
const SUPERUSER_HOST = process.env.PGHOST ?? 'localhost';
const SUPERUSER_PORT = Number(process.env.PGPORT ?? 5433);
const SUPERUSER_USER = process.env.PGUSER ?? 'postgres';
const SUPERUSER_PASSWORD = process.env.PGPASSWORD ?? 'postgres';

const ADMIN_CONNECTION: AdminConnection = {
    host: SUPERUSER_HOST,
    port: SUPERUSER_PORT,
    user: SUPERUSER_USER,
    password: SUPERUSER_PASSWORD,
};

export interface TestDatabase {
    databaseName: string;
    migratorUser: string;
    migratorPassword: string;
    runtimeUser: string;
    runtimePassword: string;
    /** A pool connected as the migrator, `max: 1` to mirror `connection.ts`. */
    migratorPool(): Pool;
    /** A pool connected as the runtime role, for asserting its privileges. */
    runtimePool(): Pool;
    /** A superuser pool scoped to this database, for setup/assertion only. */
    adminPool(): Pool;
    teardown(): Promise<void>;
}

function poolFor(database: string, user: string, password: string): Pool {
    return new Pool({
        host: SUPERUSER_HOST,
        port: SUPERUSER_PORT,
        user,
        password,
        database,
        max: 1,
    });
}

/**
 * Creates a fresh, uniquely-named database plus a non-superuser migrator
 * role holding only the privileges the migrator's IAM database user has in
 * production -- CONNECT + CREATE on the database, CREATE + USAGE on schema
 * `public` -- and a non-superuser runtime role with no privileges beyond
 * PUBLIC's defaults. A superuser (or database-owner) connection would make
 * migration 0000's grant/revoke assertions pass vacuously, so every pool
 * this harness hands back for applying or probing migrations authenticates
 * as one of these two roles, never as the superuser used to set them up.
 */
export async function createTestDatabase(): Promise<TestDatabase> {
    const suffix = randomBytes(4).toString('hex');
    const databaseName = `test_migrate_${suffix}`;
    const migratorUser = `test_migrator_${suffix}`;
    const runtimeUser = `test_runtime_${suffix}`;
    const migratorPassword = randomBytes(16).toString('hex');
    const runtimePassword = randomBytes(16).toString('hex');

    // These names are freshly randomly generated, so `ensureDatabaseRoles`
    // always takes its create-fresh path here; its idempotent
    // (create-or-converge) behaviour only matters for db/migrate-local.ts's
    // fixed names.
    await ensureDatabaseRoles(ADMIN_CONNECTION, {
        databaseName,
        migratorUser,
        migratorPassword,
        runtimeUser,
        runtimePassword,
    });

    const pools: Pool[] = [];
    const closed: Promise<void>[] = [];

    const open = (user: string, password: string): Pool => {
        const pool = poolFor(databaseName, user, password);
        pool.on('connect', (client) => {
            closed.push(new Promise((resolve) => client.once('end', resolve)));
        });
        pools.push(pool);
        return pool;
    };

    return {
        databaseName,
        migratorUser,
        migratorPassword,
        runtimeUser,
        runtimePassword,
        migratorPool(): Pool {
            return open(migratorUser, migratorPassword);
        },
        runtimePool(): Pool {
            return open(runtimeUser, runtimePassword);
        },
        adminPool(): Pool {
            return open(SUPERUSER_USER, SUPERUSER_PASSWORD);
        },
        async teardown(): Promise<void> {
            // pool.end() resolves once it has asked its clients to close, not
            // once they have. A backend that has not yet read its client's
            // Terminate when the terminate below reaches it sends the client
            // a FATAL error, which the ended pool emits with no listener.
            await Promise.all(pools.map((pool) => pool.end()));
            await Promise.all(closed);

            const admin = new Client({
                host: SUPERUSER_HOST,
                port: SUPERUSER_PORT,
                user: SUPERUSER_USER,
                password: SUPERUSER_PASSWORD,
                database: 'postgres',
            });
            await admin.connect();

            try {
                // Drop any straggling connections before dropping the
                // database. A leaked pool would otherwise fail this.
                await admin.query(
                    `select pg_terminate_backend(pid) from pg_stat_activity
                     where datname = $1 and pid <> pg_backend_pid()`,
                    [databaseName],
                );
                await admin.query(`drop database if exists "${databaseName}"`);
                await admin.query(`drop role if exists "${migratorUser}"`);
                await admin.query(`drop role if exists "${runtimeUser}"`);
            } finally {
                await admin.end();
            }
        },
    };
}

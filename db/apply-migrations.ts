import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import type { Pool, PoolClient } from 'pg';

// Matches the character set the `dataset_store` migrator (dfo-apis)
// validates substitutions against. A Postgres role name can be an
// email-shaped SA identity (dots, @, hyphens), and this pattern is narrow
// enough to rule out breaking out of the quoted identifier the template
// substitutes it into.
const VALID_IDENTIFIER = /^[A-Za-z0-9@._-]+$/;
const PLACEHOLDER = /\{\{(\w+)\}\}/g;

// Bookkeeping lives in `public`, matching drizzle.config.ts's
// `migrations.schema`. `drizzle-kit migrate` run locally and this runner
// must agree on where `__drizzle_migrations` is recorded, or one thinks a
// migration the other already applied is still pending.
const MIGRATIONS_SCHEMA = 'public';

// drizzle-orm reads `__drizzle_migrations` with a plain `select ... order by
// created_at desc limit 1` BEFORE opening a transaction (pg-core's
// `PgDialect.migrate`), so two overlapping `applyMigrations` runs both read
// "nothing applied yet" and both decide to apply. GitHub Actions
// concurrency groups don't cover a manual `gcloud run jobs execute`, so
// this has to be enforced in-process with a Postgres advisory lock.
//
// Advisory locks are scoped to the session's current database, not the
// cluster (https://www.postgresql.org/docs/current/explicit-locking.html
// #ADVISORY-LOCKS), so two environments sharing one Cloud SQL instance
// (each with its own database) cannot collide over this key.
//
// The key is a literal rather than a runtime `hashtext('...')` call.
// `hashtext` is undocumented and not guaranteed stable across Postgres
// versions, which would silently change the key (and stop protecting
// anything) on an upgrade. Derived once, offline, as the first 52 bits of
// a sha256 digest, kept below Number.MAX_SAFE_INTEGER so it round-trips
// through the pg driver as a plain JS number:
//   node -e "console.log(BigInt('0x' + require('node:crypto')
//     .createHash('sha256')
//     .update('dfo-website:db/apply-migrations.ts:advisory-lock')
//     .digest('hex').slice(0, 13)).toString())"
const MIGRATION_LOCK_KEY = 4148185744282626;

// Bounded so a run that loses the race fails in seconds naming the
// conflict, instead of blocking on `pg_advisory_lock` and burning the
// Cloud Run Job's 600s timeout (`max_retries = 0`, so that failure mode
// takes every deploy down with it). 10 attempts * 500ms is long enough
// for a peer's in-flight migration batch to finish and release the lock,
// short enough that a genuinely stuck peer is reported quickly.
const MIGRATION_LOCK_RETRY_ATTEMPTS = 10;
const MIGRATION_LOCK_RETRY_DELAY_MS = 500;

export class MigrationTemplateError extends Error {}

export class MigrationLockError extends Error {}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Acquires the migration advisory lock on `client`'s session, retrying
 * `pg_try_advisory_lock` (non-blocking) rather than calling the blocking
 * `pg_advisory_lock`. Throws `MigrationLockError` naming the conflict if
 * the retry budget is exhausted. The caller is expected to let that
 * propagate and fail the run rather than swallow it.
 */
async function acquireMigrationLock(client: PoolClient): Promise<void> {
    for (let attempt = 1; attempt <= MIGRATION_LOCK_RETRY_ATTEMPTS; attempt++) {
        const result = await client.query<{ locked: boolean }>(
            'select pg_try_advisory_lock($1) as locked',
            [MIGRATION_LOCK_KEY],
        );

        if (result.rows[0]?.locked) {
            return;
        }

        if (attempt < MIGRATION_LOCK_RETRY_ATTEMPTS) {
            await sleep(MIGRATION_LOCK_RETRY_DELAY_MS);
        }
    }

    throw new MigrationLockError(
        `could not acquire migration advisory lock ${MIGRATION_LOCK_KEY} after ` +
            `${MIGRATION_LOCK_RETRY_ATTEMPTS} attempts (` +
            `${MIGRATION_LOCK_RETRY_ATTEMPTS * MIGRATION_LOCK_RETRY_DELAY_MS}ms); ` +
            'another applyMigrations run holds it',
    );
}

function renderTemplate(sqlText: string, substitutions: Record<string, string>): string {
    return sqlText.replace(PLACEHOLDER, (_match, key: string) => {
        if (!(key in substitutions)) {
            throw new MigrationTemplateError(
                `migration references undefined placeholder {{${key}}}`,
            );
        }

        const value = substitutions[key];

        if (!VALID_IDENTIFIER.test(value)) {
            throw new MigrationTemplateError(
                `substitution value for ${key} contains characters outside ` +
                    `[A-Za-z0-9@._-]: ${JSON.stringify(value)}`,
            );
        }

        return value;
    });
}

/**
 * Copies `migrationsFolder` to a scratch directory with every `.sql` file's
 * `{{KEY}}` placeholders rendered from `substitutions`, so drizzle-orm's own
 * `migrate()` (which parses the journal and hashes each file unmodified)
 * can read the result. Only migration 0000 has placeholders, but every
 * file is rendered, so an unreferenced `{{KEY}}` in a future migration
 * surfaces as an error here rather than passing through silently.
 */
function renderMigrationsFolder(
    migrationsFolder: string,
    substitutions: Record<string, string>,
): string {
    const scratchDir = fs.mkdtempSync(path.join(os.tmpdir(), 'website-migrations-'));

    fs.cpSync(migrationsFolder, scratchDir, { recursive: true });

    for (const entry of fs.readdirSync(scratchDir)) {
        if (!entry.endsWith('.sql')) continue;

        const filePath = path.join(scratchDir, entry);
        const rendered = renderTemplate(fs.readFileSync(filePath, 'utf8'), substitutions);

        fs.writeFileSync(filePath, rendered);
    }

    return scratchDir;
}

export interface ApplyMigrationsOptions {
    migrationsFolder: string;
    runtimeDbUser: string;
    migratorDbUser: string;
}

/**
 * Renders `migrationsFolder`'s `{{...}}` placeholders (see
 * `renderMigrationsFolder`) and applies the result with drizzle-orm's own
 * `migrate()`, serialized against any concurrent `applyMigrations` run by
 * the advisory lock described above. The pool's own authentication
 * (connector + IAM in production, plain TCP in a local test) is none of
 * this function's concern.
 *
 * Checks out exactly ONE client from `pool` and passes that same client
 * (not the pool) to `drizzle()`. `pool`'s `max: 1` in production
 * (`connection.ts`) means there is only one connection to give out. If
 * this function instead kept the pool for `drizzle()` and opened a
 * second, separate client to hold the lock, that second checkout would
 * queue behind the first forever, and the Job would hang to its 600s
 * timeout. `drizzle-orm/node-postgres`'s `NodePgClient` type is
 * `Pool | PoolClient | Client`, so handing it a checked-out `PoolClient`
 * is supported. Lock, migrate, unlock, release, all on that one
 * connection.
 */
export async function applyMigrations(pool: Pool, options: ApplyMigrationsOptions): Promise<void> {
    const scratchDir = renderMigrationsFolder(options.migrationsFolder, {
        RUNTIME_DB_USER: options.runtimeDbUser,
        MIGRATOR_DB_USER: options.migratorDbUser,
    });

    const client = await pool.connect();
    let lockHeld = false;

    try {
        await acquireMigrationLock(client);
        lockHeld = true;

        const db = drizzle(client);

        await migrate(db, {
            migrationsFolder: scratchDir,
            migrationsSchema: MIGRATIONS_SCHEMA,
        });
    } finally {
        // Nested so a thrown unlock (dead connection, killed backend,
        // statement timeout) can't skip `client.release()`. At `max: 1`,
        // a client that's never released leaves `pool.end()` in
        // `migrate.ts` waiting on a connection that never comes back,
        // hanging the Job to its 600s timeout. Release and cleanup must
        // run unconditionally, so they get their own try/finally.
        try {
            if (lockHeld) {
                await client.query('select pg_advisory_unlock($1)', [MIGRATION_LOCK_KEY]);
            }
        } finally {
            client.release();
            fs.rmSync(scratchDir, { recursive: true, force: true });
        }
    }
}

import type { Config } from 'drizzle-kit';

// `drizzle-kit generate` reads this to diff db/schema.ts against
// db/migrations. The runner (db/migrate.ts, db/migrate-local.ts) reads the
// generated migrations folder directly and has no need for this file's
// `drizzle-kit` config beyond `generate` -- `drizzle-kit migrate` does NOT
// work locally: migration 0000 has `{{MIGRATOR_DB_USER}}` /
// `{{RUNTIME_DB_USER}}` placeholders only the runner's `applyMigrations`
// renders (db/apply-migrations.ts). Use `just db-migrate` instead.
//
// `migrations.schema` must match the `migrationsSchema` the runner passes
// to drizzle-orm's `migrate()` (db/apply-migrations.ts): both name where
// `__drizzle_migrations` bookkeeping lives, and a stray `drizzle-kit
// migrate` run has to agree with the runner on that, or each thinks
// nothing the other applied has happened.
export default {
    schema: './db/schema.ts',
    out: './db/migrations',
    dialect: 'postgresql',
    migrations: {
        schema: 'public',
    },
} satisfies Config;

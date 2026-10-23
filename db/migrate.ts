import path from 'node:path';
import { applyMigrations } from './apply-migrations';
import { buildMigratorPool, readMigratorEnv } from './connection';
import { syncWebmailDomains } from './webmail-domains';

// Resolved from cwd, not `__dirname`. The compiled bundle
// (dist/migrate.cjs) and the migrations directory (db/migrations) are
// copied to fixed, sibling paths under the Cloud Run Job's working
// directory (deploy/Dockerfile), and cwd is more robust than __dirname
// against exactly how esbuild lays out the bundle.
const MIGRATIONS_FOLDER = path.resolve(process.cwd(), 'db/migrations');

async function main(): Promise<void> {
    const env = readMigratorEnv();
    const { pool, connector } = await buildMigratorPool(env);

    try {
        await applyMigrations(pool, {
            migrationsFolder: MIGRATIONS_FOLDER,
            runtimeDbUser: env.runtimeDbUser,
            migratorDbUser: env.migratorDbUser,
        });
        await syncWebmailDomains(pool);

        console.log('migrations applied');
    } finally {
        // Order matters. Closing the pool first lets in-flight queries
        // finish over the connector's tunnel before the connector itself
        // (and the background refresh thread it started) shuts down.
        await pool.end();
        connector.close();
    }
}

main().catch((error: unknown) => {
    console.error('ERROR:', error instanceof Error ? error.stack : error);
    process.exitCode = 1;
});

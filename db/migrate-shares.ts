import { drizzle } from 'drizzle-orm/node-postgres';

import { searchApiBase } from '../src/lib/searchApi.ts';
import { openPool } from '../scripts/open-pool.ts';
import { requiredEnv } from './connection.ts';
import { readShares } from './share-export.ts';
import { importOverHttp, migrateShares } from './share-migrate.ts';

// The share migration Job's command (`node dist/migrate-shares.cjs`, see
// deploy/Dockerfile). It reads every row of `share` and sends each to
// dfo-apis' share import route at SEARCH_API_BASE with the principal in
// PRESENTATION_SHARE_IMPORT_PRINCIPAL (db/share-migrate.ts). It reads the
// database as the runtime does, through WEBSITE_DB_* over the Cloud SQL
// connector, or DATABASE_URL locally, and writes owners' tokens to
// `share_token`. It exits 0 when every share is imported or unchanged, and
// 1 otherwise; a run again is safe.
const main = async (): Promise<void> => {
    const principal = requiredEnv('PRESENTATION_SHARE_IMPORT_PRINCIPAL');
    const base = searchApiBase();
    const { pool, close } = await openPool();

    try {
        process.exitCode = await migrateShares({
            db: drizzle(pool),
            rows: await readShares(pool),
            importShare: importOverHttp({ base, principal }),
            log: (line) => console.log(line),
        });
    } finally {
        await close();
    }
};

main().catch((error: unknown) => {
    console.error('ERROR:', error instanceof Error ? error.stack : error);
    process.exitCode = 1;
});

import { drizzle } from 'drizzle-orm/node-postgres';

import { apisFetch } from '../src/lib/apisAuth.ts';
import { searchApiBase } from '../src/lib/searchApi.ts';
import { openPool } from '../scripts/open-pool.ts';
import { checkArtifact, checkLibraryShares, readLiveArtifacts } from './library-share-check.ts';

// The Library share check Job's command (`node dist/check-library-shares.cjs`,
// see deploy/Dockerfile). It lists the published rows of `library_artifact`
// and reads each one's share from dfo-apis at SEARCH_API_BASE, through
// `apisFetch`, which adds the runtime service account's ID token on Cloud
// Run. It reads the database as the runtime does, through WEBSITE_DB_* over
// the Cloud SQL connector, or DATABASE_URL locally. It exits 0 when every
// artifact reads, and 1 otherwise (db/library-share-check.ts).
const main = async (): Promise<void> => {
    const base = searchApiBase();
    // The check is the site's own, made for no visitor, so it names no caller.
    const backend = { base, fetch: apisFetch, nameCaller: () => {} };
    const { pool, close } = await openPool();

    try {
        process.exitCode = await checkLibraryShares({
            artifacts: await readLiveArtifacts(drizzle(pool)),
            check: (artifact) => checkArtifact(backend, artifact),
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

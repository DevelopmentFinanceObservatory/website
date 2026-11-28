import { drizzle } from 'drizzle-orm/node-postgres';

import { apisFetch } from '../src/lib/apisAuth.ts';
import { searchApiBase } from '../src/lib/searchApi.ts';
import { openPool } from '../scripts/open-pool.ts';
import {
    checkLibraryShares,
    guardCheck,
    readLiveArtifacts,
    RUN_DEADLINE_MS,
} from './library-share-check.ts';

// The run's deadline counts from the command's start, so the pool's open
// and the artifacts' listing spend it too.
const deadline = AbortSignal.timeout(RUN_DEADLINE_MS);

// The Library share check Job's command (`node dist/check-library-shares.cjs`,
// see deploy/Dockerfile). It lists the published rows of `library_artifact`
// and reads each one's share from dfo-apis at SEARCH_API_BASE, through
// `apisFetch`, which adds the runtime service account's ID token on Cloud
// Run. It reads the database as the runtime does, through WEBSITE_DB_* over
// the Cloud SQL connector, or DATABASE_URL locally. It stops reading at
// RUN_DEADLINE_MS, under the Job's task timeout, and logs the artifacts it
// left unfinished. It exits 0 when every artifact reads, and 1 otherwise,
// logging a `check_failed` line when the run cannot run at all
// (db/library-share-check.ts).
const main = async (): Promise<0 | 1> => {
    const base = searchApiBase();
    // The check is the site's own, made for no visitor, so it names no caller.
    const backend = { base, fetch: apisFetch, nameCaller: () => {} };
    const { pool, close } = await openPool();

    try {
        return await checkLibraryShares({
            artifacts: await readLiveArtifacts(drizzle(pool)),
            backend,
            log: (line) => console.log(line),
            deadline,
        });
    } finally {
        await close();
    }
};

// A run that cannot run logs its failure line on stderr.
void guardCheck(main, (line) => console.error(line)).then((code) => {
    process.exitCode = code;
});

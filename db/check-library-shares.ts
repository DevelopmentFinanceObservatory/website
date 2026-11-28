import { setTimeout as sleep } from 'node:timers/promises';
import { drizzle } from 'drizzle-orm/node-postgres';

import { apisFetch } from '../src/lib/apisAuth.ts';
import { searchApiBase } from '../src/lib/searchApi.ts';
import { openPool } from '../scripts/open-pool.ts';
import {
    beforeDeadline,
    checkLibraryShares,
    guardCheck,
    readLiveArtifacts,
    RUN_DEADLINE_MS,
} from './library-share-check.ts';

// The run's deadline counts from the command's start, so the pool's open
// and the artifacts' listing spend it too, and a database that never
// answers ends the run with a `check_failed` line of code `run_deadline`.
const deadline = AbortSignal.timeout(RUN_DEADLINE_MS);

// How long the run waits for the pool to close before it exits.
const CLOSE_MS = 5_000;

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
    const { pool, close } = await beforeDeadline(openPool(), deadline);

    try {
        return await checkLibraryShares({
            artifacts: await beforeDeadline(readLiveArtifacts(drizzle(pool)), deadline),
            backend,
            log: (line) => console.log(line),
            deadline,
        });
    } finally {
        await Promise.race([close().catch(() => {}), sleep(CLOSE_MS)]);
    }
};

// A run that cannot run logs its failure line on stderr. The command exits
// once the run ends, so a connection or connector left open cannot hold the
// task to its timeout. Cloud Run's stdout and stderr are pipes, which Node
// writes synchronously on Linux, so every line is out before the exit.
void guardCheck(main, (line) => console.error(line)).then((code) => process.exit(code));

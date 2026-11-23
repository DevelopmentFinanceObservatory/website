// The refs step, run by hand with `pnpm data <slug>`. It rewrites refs.json, the reads the
// page's build makes (../_lib/build.ts), which git keeps as the page's query config. The figures
// come from the build, which reads each ref at DFO's newest stored version.
//
//   pnpm data <slug>             fetch each committed ref's newest version, pin it, rewrite
//   pnpm data <slug> --search    ask QUERY, pin the answer and write it as the `series` read
//
// `pnpm check:data` requires every ref's versions to be pinned, so the step pins what it writes.
// Each new pin counts against a daily allowance.
import { readFileSync } from 'node:fs';

import { Client, type Dataset, DatasetRef } from '@developmentfinance/client';

import { writeDataFile } from '#lib/dataFile.mts';

// `deriveSeries` (../_lib/build.ts) takes rows by `financingProvider`, which this answer has.
const QUERY = 'OECD headline ODA by provider';
const REFS = new URL('./refs.json', import.meta.url);

// Without a key the client calls the API anonymously, under a per-IP quota.
const client = new Client();

const fetched: Record<string, Dataset> = {};

if (process.argv.includes('--search')) {
    const answer = await client.search(QUERY);

    console.log(String(answer));
    fetched.series = await answer.fetch();
} else {
    const committed = JSON.parse(readFileSync(REFS, 'utf8')) as {
        data: Record<string, { ref: unknown }>;
    };

    for (const [key, { ref }] of Object.entries(committed.data)) {
        fetched[key] = await client.fetch(DatasetRef.fromJSON(ref), { latest: true });
    }
}

const data: Record<string, { ref: unknown; provenance: unknown }> = {};

for (const [key, dataset] of Object.entries(fetched)) {
    const pinned = await client.pin(dataset);

    data[key] = { ref: pinned.ref.toJSON(), provenance: pinned.provenance.toJSON() };
}

writeDataFile(REFS, { query: '__SLUG__ reads', data });

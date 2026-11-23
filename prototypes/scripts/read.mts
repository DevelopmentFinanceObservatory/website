// `pnpm read`: every build-read page's DFO reads, in one process through one set of lanes, each
// page's result written to .build-data/<page>.json (lib/buildData.ts). `pnpm build` runs it
// before `next build`; a failed read stops the build there, naming the page and the cause.
// BUILD_PENDING_BOUND_S bounds how long a read waits while DFO's freshness is `pending`
// (lib/buildRead.ts): unset, the build takes what DFO serves.
import path from 'node:path';

import { fragilityBuild } from '../app/fragility-finance/_lib/build.ts';
import { hivBuild } from '../app/hiv-financing/_lib/build.ts';
import { odaBuild } from '../app/oda-counts/_lib/build.ts';
import { BUILD_DATA_DIR, readPages } from '../lib/buildData.ts';
import type { BuildPage } from '../lib/buildRead.ts';

const APP = path.join(import.meta.dirname, '..');

const PAGES: readonly BuildPage<unknown>[] = [fragilityBuild, hivBuild, odaBuild];

const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`;

const started = Date.now();

try {
    const timings = await readPages(PAGES, { dir: path.join(APP, BUILD_DATA_DIR) });

    for (const { page, ms } of timings) {
        console.log(`read: ${page} in ${seconds(ms)}`);
    }

    console.log(
        `read: ${timings.length} pages to ${BUILD_DATA_DIR}/ in ${seconds(Date.now() - started)}`,
    );
} catch (error) {
    console.error('read:', error);
    process.exit(1);
}

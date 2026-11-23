// Everything the page shows from DFO, as the build reads it before `next build`
// (lib/buildData.ts): the 2025 thresholds view, which the data step's Python pipeline makes from
// DFO's newest stored data in a child process (./pipeline.ts), and the net transfers of the 75
// countries in _data/groups.csv, read from the `transfers` ref in refs.json at DFO's newest
// stored version (lib/buildRead.ts). The 2024 view comes from outside DFO and stays committed
// (_data/thresholds-2024.json); `thresholdsData` (./views.ts) puts the two views together. A
// failed read, a refused check or a failed pipeline run fails the build, naming the page, so
// production keeps the last good deploy. Runs on the server only; the client components take
// the result as props.
import { readFileSync } from 'node:fs';
import path from 'node:path';

import refs from '../_data/refs.json' with { type: 'json' };
import committed from '../_data/thresholds-2024.json' with { type: 'json' };
import type { ThresholdsData, ViewData } from '../_data/types.ts';

import { type BuiltThresholds, runPipeline } from './pipeline.ts';
import {
    parseGroups,
    type TransferSeries,
    type TransfersData,
    transfersByCountry,
} from './transfers.ts';
import { thresholdsData } from './views.ts';

import {
    BUILD_TIMEOUT_MS,
    type BuildPage,
    type BuildRead,
    buildLanes,
    readSettled,
    settle,
} from '#lib/buildRead.ts';

const PAGE = 'debt-thresholds';

/** How long one run of the pipeline may take: its 45 or so DFO reads, one at a time, and a
 *  cold install of its environment. */
export const PIPELINE_TIMEOUT_MS = 2 * BUILD_TIMEOUT_MS;

/** The members of the net-transfers section, under the build's working directory,
 *  `prototypes/`. */
const GROUPS = path.join(process.cwd(), 'app', PAGE, '_data', 'groups.csv');

/** The 2024 view the data step committed. */
// The file is the envelope `pipeline.run` writes, whose `data` is `pipeline.build.view_data`.
export const COMMITTED_VIEW = committed.data as ViewData;

export type Built = {
    thresholds: BuildRead<string, BuiltThresholds>;
    transfers: BuildRead<'transfers', TransferSeries>;
};

/** The page's thresholds: the committed 2024 view and the built 2025 view. */
export const pageThresholds = ({ thresholds }: Built): ThresholdsData =>
    thresholdsData([COMMITTED_VIEW, thresholds.value.view], thresholds.value.defaultYear);

/** The net transfers with the IDS release the build read them from, which the 2025 view names. */
export const pageTransfers = ({ thresholds, transfers }: Built): TransfersData => ({
    ...transfers.value,
    release: thresholds.value.view.vintage.ids,
});

/** The page's build-time read: the 2025 view and the net transfers. */
export const debtBuild: BuildPage<Built> = {
    name: PAGE,
    build: async (options = {}) => {
        const members = parseGroups(readFileSync(GROUPS, 'utf8'));
        const { reads } = options.lanes ?? buildLanes;
        const [thresholds, transfers] = await Promise.all([
            settle(PAGE, (timeout) => runPipeline({ timeout, reads }), {
                ...options,
                timeout: options.timeout ?? PIPELINE_TIMEOUT_MS,
            }),
            readSettled(
                PAGE,
                { transfers: { ref: refs.data.transfers.ref } },
                (rows) => transfersByCountry(rows.transfers, members),
                options,
            ),
        ]);
        const built = { thresholds, transfers };

        // Refuse views that do not fit together here, so the build stops before next build.
        pageThresholds(built);

        return built;
    },
};

export default debtBuild;

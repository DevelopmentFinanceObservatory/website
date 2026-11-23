// Everything the page shows from DFO, as the build reads it before `next build`
// (lib/buildData.ts): the 2025 thresholds view, which the data step's Python pipeline makes from
// DFO's newest stored data in a child process (./pipeline.ts), and the net transfers of the 75
// countries in _data/groups.csv, read from the `transfers` ref in refs.json at DFO's newest
// stored version (lib/buildRead.ts). The 2024 view comes from outside DFO and stays committed
// (_data/thresholds-2024.json); `thresholdsData` (./views.ts) puts the two views together. A
// failed read, a refused check or a failed pipeline run fails the build, naming the page, so
// production keeps the last good deploy, and a failed transfers read stops the pipeline's child.
// The pipeline also reads the transfers ref, between two reads of the IDS release it names, so
// a build whose transfers read took another version of it than the pipeline did, or that took
// any spec at two versions, stops: the section's release label would not match its data. Runs
// on the server only; the client components take the result as props.
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { isDatasetMember } from '@developmentfinance/client/types';

import refs from '../_data/refs.json' with { type: 'json' };
import committed from '../_data/thresholds-2024.json' with { type: 'json' };
import type { ThresholdsData, ViewData } from '../_data/types.ts';

import { type BuiltThresholds, runPipeline, type Spawn } from './pipeline.ts';
import {
    parseGroups,
    type TransferSeries,
    type TransfersData,
    transfersFromRead,
} from './transfers.ts';
import { thresholdsData } from './views.ts';

import {
    BUILD_TIMEOUT_MS,
    type BuildPage,
    type BuildRead,
    type BuildReadOptions,
    buildLanes,
    checkOneVersionPerSpec,
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

/** The page's build-time read: the 2025 view and the net transfers. `run` stands in for starting
 *  the pipeline's child, as a test does. */
export const debtBuild = {
    name: PAGE,
    build: async ({ run, ...options }: BuildReadOptions & { run?: Spawn } = {}) => {
        const members = parseGroups(readFileSync(GROUPS, 'utf8'));
        const { reads } = options.lanes ?? buildLanes;
        // Aborted when either read fails, so a failed transfers read stops the child.
        const abandon = new AbortController();
        const abandonOnFailure = <T>(read: Promise<T>): Promise<T> =>
            read.catch((error: unknown) => {
                abandon.abort();
                throw error;
            });
        const [thresholds, transfers] = await Promise.all([
            abandonOnFailure(
                settle(
                    PAGE,
                    (timeout) => runPipeline({ timeout, reads, signal: abandon.signal, run }),
                    { ...options, timeout: options.timeout ?? PIPELINE_TIMEOUT_MS },
                ),
            ),
            abandonOnFailure(
                readSettled(
                    PAGE,
                    { transfers: { ref: refs.data.transfers.ref } },
                    (rows, datasets) => {
                        const [member] = datasets.transfers.ref.members;

                        return transfersFromRead(
                            rows.transfers,
                            members,
                            member !== undefined && isDatasetMember(member)
                                ? member.spec.definition
                                : undefined,
                        );
                    },
                    options,
                ),
            ),
        ]);
        const built = { thresholds, transfers };

        // Refuse reads and views that do not fit together here, so the build stops before
        // next build.
        checkOneVersionPerSpec(PAGE, thresholds.sources, transfers.sources);
        pageThresholds(built);

        return built;
    },
} satisfies BuildPage<Built>;

export default debtBuild;

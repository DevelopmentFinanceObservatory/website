// Everything the page shows from DFO, as the build reads it before `next build`
// (lib/buildData.ts): the 19 DAC1 reads of live-refs.json at DFO's newest stored versions
// (lib/buildRead.ts), the graph nodes the definitions come from, and the currencies Search
// converts the series to. Any failed read or refused answer fails the build, so production keeps
// the last good deploy. Runs on the server only; the client components take the result as props.
import { Client } from '@developmentfinance/client';

import liveRefs from '../_data/live-refs.json' with { type: 'json' };
import type { CountsData, Definition, LiveData } from '../_data/types.ts';

import { definitionsFromNodes, NODE_IDS } from './definitions.ts';
import { BASE_YEAR, countsFromRows, READ_KEYS, type ReadKey, YEARS } from './derive.ts';
import { identitiesFromRefs, MAX_ENTRIES, offerFromResponses, offerRequests } from './live.ts';

import {
    type BuildPage,
    type BuildRead,
    type BuildReadOptions,
    buildLanes,
    readSettled,
} from '#lib/buildRead.ts';
import type { Derive } from '#lib/liveRead.ts';
import type { Lane } from '#lib/pacing.ts';
import { recordOf } from '#lib/record.ts';

const PAGE = 'oda-counts';

/** How long each graph lookup and Search request may take, a cold Search answer included. */
const LOOKUP_TIMEOUT_MS = 120_000;

/** The Search route a resolve request posts to, under the client's base URL. */
const RESOLVE_PATH = '/search/resolve';

/** The figures and the citation of the reads. */
export type BuiltCounts = { data: CountsData; citation: string };

export type Built = {
    counts: BuildRead<ReadKey, BuiltCounts>;
    definitions: Definition[];
    /** The series' identities and the offer, for the reader's currency picks. */
    live: LiveData;
};

/** The part of a client the lookups and the offer use. */
export type Lookups = {
    lookup: Pick<Client['lookup'], 'node'>;
    request: (
        method: 'POST',
        path: string,
        options: { json: unknown; timeout: number },
    ) => Promise<{ status: number; json: () => unknown }>;
};

/** The page's figures from the rows, and the citation the gross read gives. */
export const deriveCounts: Derive<ReadKey, BuiltCounts> = (rows, datasets) => ({
    data: countsFromRows(rows, {
        years: [...YEARS],
        baseYear: BASE_YEAR,
        members: recordOf(READ_KEYS, (key) => datasets[key].members.length),
    }),
    citation: datasets['gross/current'].citation.text,
});

/** Runs `task` in `lane`, or at once with no lane. */
const inLane = <T>(lane: Lane | undefined, task: () => Promise<T>): Promise<T> =>
    lane === undefined ? task() : lane.run(task);

/** The definitions, from a lookup of each graph node in NODE_IDS, each run in `lane` when
 *  given. */
export const readDefinitions = async (client: Lookups, lane?: Lane): Promise<Definition[]> =>
    definitionsFromNodes(
        await Promise.all(
            NODE_IDS.map(async (id) => {
                const node = await inLane(lane, () =>
                    client.lookup.node(id, { timeout: LOOKUP_TIMEOUT_MS }),
                );

                return { id, name: node.name, description: node.raw.description };
            }),
        ),
    );

/** The identities from live-refs.json and the offer Search gives for them, in two requests,
 *  each run in `lane` when given. */
export const readLive = async (
    client: Lookups,
    refs: Readonly<Record<string, unknown>>,
    lane?: Lane,
): Promise<LiveData> => {
    const identities = identitiesFromRefs(refs);
    const answers = await Promise.all(
        offerRequests(identities).map(async ({ keys, body }) => {
            const response = await inLane(lane, () =>
                client.request('POST', RESOLVE_PATH, { json: body, timeout: LOOKUP_TIMEOUT_MS }),
            );

            if (response.status !== 200) {
                throw new Error(`Search answered ${response.status} to the offer request.`);
            }

            return { keys, body: response.json() };
        }),
    );

    return { maxEntries: MAX_ENTRIES, identities, offer: offerFromResponses(answers) };
};

/**
 * The page's reads of `refs`, live-refs.json's `data`, with `options` for the DAC1 reads. The
 * graph lookups and Search requests run in the same reads lane as the DAC1 reads, the build's
 * shared lanes unless `options` gives others, so the build's requests share one bound.
 *
 * @throws An error naming the page, whose cause is the failed read or the refused answer.
 */
export const readOdaCounts = async (
    refs: Readonly<Record<ReadKey, unknown>>,
    options: BuildReadOptions = {},
): Promise<Built> => {
    const client = new Client({ apiKey: false });
    const started = Date.now();
    const sources = recordOf(READ_KEYS, (key) => ({ ref: refs[key] }));
    const { reads } = options.lanes ?? buildLanes;
    const [counts, definitions, live] = await Promise.all([
        readSettled(PAGE, sources, deriveCounts, options),
        readDefinitions(client, reads),
        readLive(client, refs, reads),
    ]).catch((error: unknown) => {
        throw new Error(`The build read of ${PAGE} failed, so the build stops.`, {
            cause: error,
        });
    });

    console.info(
        `${PAGE}: ${READ_KEYS.length} reads, ${NODE_IDS.length} graph lookups and ${offerRequests(live.identities).length} Search requests in ${((Date.now() - started) / 1000).toFixed(1)} s`,
    );

    return { counts, definitions, live };
};

/** The page's build-time read: the counts, the definitions and the currency offer. */
export const odaBuild: BuildPage<Built> = {
    name: PAGE,
    build: (options) => readOdaCounts(liveRefs.data, options),
};

export default odaBuild;

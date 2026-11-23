// Everything the page shows from DFO, read once while `next build` renders it: the 19 DAC1 reads
// of live-refs.json at DFO's newest stored versions (lib/buildRead.ts), the graph nodes the
// definitions come from, and the currencies Search converts the series to. Any failed read or
// refused answer fails the build, so production keeps the last good deploy. Runs on the server
// only; the client components take the result as props.
import { Client } from '@developmentfinance/client';

import type { CountsData, Definition, LiveData } from '../_data/types.ts';

import { definitionsFromNodes, NODE_IDS } from './definitions.ts';
import { BASE_YEAR, countsFromRows, READ_KEYS, type ReadKey, YEARS } from './derive.ts';
import { identitiesFromRefs, MAX_ENTRIES, offerFromResponses, offerRequests } from './live.ts';

import { type BuildRead, buildFetch, readAtBuild } from '#lib/buildRead.ts';
import type { Derive } from '#lib/liveRead.ts';
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

/** The definitions, from a lookup of each graph node in NODE_IDS. */
export const readDefinitions = async (client: Lookups): Promise<Definition[]> =>
    definitionsFromNodes(
        await Promise.all(
            NODE_IDS.map(async (id) => {
                const node = await client.lookup.node(id, { timeout: LOOKUP_TIMEOUT_MS });

                return { id, name: node.name, description: node.raw.description };
            }),
        ),
    );

/** The identities from live-refs.json and the offer Search gives for them, in two requests. */
export const readLive = async (
    client: Lookups,
    refs: Readonly<Record<string, unknown>>,
): Promise<LiveData> => {
    const identities = identitiesFromRefs(refs);
    const answers = await Promise.all(
        offerRequests(identities).map(async ({ keys, body }) => {
            const response = await client.request('POST', RESOLVE_PATH, {
                json: body,
                timeout: LOOKUP_TIMEOUT_MS,
            });

            if (response.status !== 200) {
                throw new Error(`Search answered ${response.status} to the offer request.`);
            }

            return { keys, body: response.json() };
        }),
    );

    return { maxEntries: MAX_ENTRIES, identities, offer: offerFromResponses(answers) };
};

let built: Promise<Built> | undefined;

/**
 * The page's reads of `refs`, live-refs.json's `data`, run once per process. A failed read is
 * dropped, so under `next dev` the next request reads again.
 *
 * @throws An error naming the page, whose cause is the failed read or the refused answer.
 */
export const readOdaCounts = (refs: Readonly<Record<ReadKey, unknown>>): Promise<Built> => {
    if (built !== undefined) {
        return built;
    }

    // Past Next's data cache, as the build's reads go, so a later build never reuses an answer.
    const client = new Client({ apiKey: false, fetch: buildFetch });
    const read = (async (): Promise<Built> => {
        const started = Date.now();
        const sources = recordOf(READ_KEYS, (key) => ({ ref: refs[key] }));
        const [counts, definitions, live] = await Promise.all([
            readAtBuild(PAGE, sources, deriveCounts),
            readDefinitions(client),
            readLive(client, refs),
        ]).catch((error: unknown) => {
            throw new Error(`The build read of ${PAGE} failed, so the build stops.`, {
                cause: error,
            });
        });

        console.info(
            `${PAGE}: ${READ_KEYS.length} reads, ${NODE_IDS.length} graph lookups and ${offerRequests(live.identities).length} Search requests in ${((Date.now() - started) / 1000).toFixed(1)} s`,
        );

        return { counts, definitions, live };
    })();

    built = read;
    read.catch(() => {
        built = undefined;
    });

    return read;
};

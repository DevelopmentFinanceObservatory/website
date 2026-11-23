// How a page reads DFO data in the browser. Each read takes the version DFO stores as the newest
// of each dataset's spec, so a page shows a release DFO took in after its step ran. When any of a
// page's stored reads fails, takes longer than STORED_TIMEOUT_MS, or gives rows the page's own
// derivation refuses, the page falls back as a whole, so the figures come from one tier:
//
// - `committed`: the figures the step wrote to the page's JSON, with no request. A page whose
//   reads include an analysis recipe must fall back here, since a pinned analysis posts to the
//   same server and fails the same way.
// - `pinned`: every ref's pinned version, the rows the step read. A page whose committed JSON
//   leaves the figures out reads them this way.
//
// DFO refreshes each spec on its own, so stored reads of two specs can come from releases a
// refresh apart. The client is anonymous, since DFO serves these reads to DFO pages with no key.
// The reads run through the page's pacer (./pacing.ts), which bounds the reads in flight and
// reads the gateway's allowance, shared with the page's Search resolve calls. A file the edge
// cache serves does not reach the gateway.
// Pages own the React hook that calls this, and put the tier on their root as `data-read-tier`.
import { DatasetRef, type Client, type Dataset, type recipe } from '@developmentfinance/client';
import type { Row } from '@developmentfinance/client/types';

import { liveClient, pacer, READ_CONCURRENCY } from './pacing.ts';
import { recordOf } from './record.ts';

export { READ_CONCURRENCY };

/** How long each stored read may take before the page falls back. One waits on a build when
 *  DFO stores no version it can serve. */
export const STORED_TIMEOUT_MS = 10_000;

/** Where a page's figures came from: DFO's newest stored data, the refs' pinned versions, or
 *  the page's committed JSON. */
export type ReadTier = 'stored' | 'pinned' | 'committed';

/** The value of a page root's `data-read-tier`: the tier its figures came from, `loading`
 *  before a page with no committed figures has any, and `failed` when every tier failed. */
export type ReadTierAttribute = ReadTier | 'loading' | 'failed';

export type Recipe = ReturnType<typeof recipe>;

/** One read: the parsed JSON of a `DatasetRef`, as a step writes it to `live-refs.json` or
 *  `refs.json`, or an analysis recipe whose roots are refs. */
export type LiveSource = { ref: unknown } | { recipe: Recipe };

/** What the page falls back to: its committed figures, or the refs' pinned versions. */
export type Fallback<T> = { tier: 'committed'; value: T } | { tier: 'pinned' };

export type LiveRead<K extends string, T> =
    | {
          tier: 'stored' | 'pinned';
          /** What the page's derivation made of the rows. */
          value: T;
          datasets: Record<K, Dataset>;
          /** Every dataset holds the version its ref pins, so a label the step committed beside
           *  the ref, such as a release name, describes these rows. False for a recipe's stored
           *  read, which has no pinned ref to compare. */
          asCommitted: boolean;
      }
    | { tier: 'committed'; value: T; datasets: null; asCommitted: true };

type Fetcher = Pick<Client, 'fetch'>;

type Parsed = { ref: DatasetRef } | { recipe: Recipe };

type CallOptions = { signal?: AbortSignal; timeout?: number };

/** A page's derivation: its figures from each read's rows. `datasets` carries what a read holds
 *  beside its rows, such as its members. */
export type Derive<K extends string, T> = (
    rows: Record<K, Row[]>,
    datasets: Record<K, Dataset>,
) => T;

/**
 * Runs a recipe on the newest versions DFO stores of the datasets it starts from: one manifest
 * GET per dataset, no file, then the analysis POST and the result's manifest and file.
 */
const fetchStoredRecipe = (
    client: Fetcher,
    source: Recipe,
    options: CallOptions,
): Promise<Dataset> => client.fetch(source, { ...options, latest: 'stored' });

/**
 * `fn` of each item, through the page's pacer, in the items' order. After the first rejection no
 * other item starts, and the result rejects with it.
 */
const mapPaced = async <I, O>(items: readonly I[], fn: (item: I) => Promise<O>): Promise<O[]> => {
    let failed = false;

    return Promise.all(
        items.map((item) =>
            pacer.run(async () => {
                if (failed) {
                    throw new Error('An earlier read failed.');
                }

                try {
                    return await fn(item);
                } catch (error) {
                    failed = true;
                    throw error;
                }
            }),
        ),
    );
};

const read = async <K extends string, T>(
    client: Fetcher,
    keys: readonly K[],
    sources: Record<K, Parsed>,
    derive: Derive<K, T>,
    tier: 'stored' | 'pinned',
    options: CallOptions,
): Promise<LiveRead<K, T>> => {
    const readOne = async (key: K) => {
        const source = sources[key];
        const data =
            'recipe' in source
                ? await fetchStoredRecipe(client, source.recipe, options)
                : await client.fetch(
                      source.ref,
                      tier === 'stored' ? { ...options, latest: 'stored' } : options,
                  );

        return { data, rows: await data.toRows() };
    };
    // Recipes go first, so a recipe that cannot be read stops the page before any ref is read.
    const recipes = keys.filter((key) => 'recipe' in sources[key]);
    const refs = keys.filter((key) => !('recipe' in sources[key]));
    const done = [...(await mapPaced(recipes, readOne)), ...(await mapPaced(refs, readOne))];
    const byKey = new Map([...recipes, ...refs].map((key, index) => [key, done[index]!]));
    const datasets = recordOf(keys, (key) => byKey.get(key)!.data);

    return {
        tier,
        value: derive(
            recordOf(keys, (key) => byKey.get(key)!.rows),
            datasets,
        ),
        datasets,
        asCommitted: keys.every((key) => {
            const source = sources[key];

            return 'ref' in source && source.ref.sameData(datasets[key].ref);
        }),
    };
};

/**
 * Fetches the newest stored data for each of `sources`, through the page's pacer, and runs
 * `derive` on the rows. When a stored read or `derive` fails, it returns `fallback.value` as the
 * `committed` tier or, when `fallback.tier` is `pinned`, reads every ref's pinned version and
 * derives from those rows. The stored read's failure goes to `console.warn`. A dataset's `freshness` says how new a stored
 * read is. `client` stands in for the anonymous one on the production API, as a test does.
 *
 * @throws A ref the client cannot read, or a recipe with a `pinned` fallback, before any
 *   request; the pinned read's errors or `derive`'s on the pinned rows; or an aborted `signal`,
 *   which skips the fallback.
 */
export const readLive = async <K extends string, T>(
    sources: Record<K, LiveSource>,
    derive: Derive<K, T>,
    {
        fallback,
        client = liveClient(),
        signal,
        timeout = STORED_TIMEOUT_MS,
    }: { fallback: Fallback<T>; client?: Fetcher; signal?: AbortSignal; timeout?: number },
): Promise<LiveRead<K, T>> => {
    // Object.keys widens to string. These are the keys of `sources`.
    const keys = Object.keys(sources) as K[];
    const parsed = recordOf(keys, (key): Parsed => {
        const source = sources[key];

        if ('recipe' in source) {
            if (fallback.tier === 'pinned') {
                throw new Error(
                    `${key} is a recipe, which needs the page's committed figures to fall back to.`,
                );
            }

            return source;
        }

        return { ref: DatasetRef.fromJSON(source.ref) };
    });
    // Stops the stored reads still running once one fails, so they leave the connection to the
    // pinned reads.
    const stored = new AbortController();
    const storedSignal = signal ? AbortSignal.any([signal, stored.signal]) : stored.signal;

    try {
        return await read(client, keys, parsed, derive, 'stored', {
            signal: storedSignal,
            timeout,
        });
    } catch (error) {
        if (signal?.aborted) {
            throw error;
        }
        stored.abort();
        console.warn(
            `The newest stored data failed to load, timed out, or gave rows the page refused, so the page shows the ${fallback.tier === 'committed' ? 'committed figures' : 'pinned versions'}.`,
            error,
        );

        if (fallback.tier === 'committed') {
            return { tier: 'committed', value: fallback.value, datasets: null, asCommitted: true };
        }

        return read(client, keys, parsed, derive, 'pinned', { signal });
    }
};

/** The `data-read-tier` of a page root whose figures load in the browser, from its read's
 *  state: the tier once ready, `loading` before, and `failed` when every tier failed. */
export const tierAttribute = (
    state: { status: 'loading' } | { status: 'error' } | { status: 'ready'; tier: ReadTier },
): ReadTierAttribute => {
    if (state.status === 'ready') {
        return state.tier;
    }

    return state.status === 'loading' ? 'loading' : 'failed';
};

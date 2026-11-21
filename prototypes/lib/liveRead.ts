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
// Each request that reaches the website's gateway counts against one allowance per address,
// 120 a minute on /api/v1 (src/lib/proxy/rateLimit.ts at the repository root), which the page's
// Search resolve calls share. A file the edge cache serves does not reach the gateway.
// Pages own the React hook that calls this, and put the tier on their root as `data-read-tier`.
import { Client, DatasetRef, type Dataset, type recipe } from '@developmentfinance/client';
import type { Row } from '@developmentfinance/client/types';

import { recordOf } from './record.ts';

/** How long each stored read may take before the page falls back. One waits on a build when
 *  DFO stores no version it can serve. */
export const STORED_TIMEOUT_MS = 10_000;

/**
 * How many reads run at once. A stored read is two GETs: the spec's newest stored version, then
 * its file. oda-counts' 19 stored reads, run all at once against production, drew 11 retried
 * 503s from dfo-apis (49 requests, 1.7 s); four at a time drew none (38 requests, 1.0 s).
 */
export const READ_CONCURRENCY = 4;

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
 * Reads a recipe on the newest versions DFO stores of the datasets it starts from. Client 0.5.0
 * refuses `latest: "stored"` on a recipe, so this rejects before any request and the page
 * falls back.
 */
const fetchStoredRecipe = async (
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- a stored recipe read takes the read's client, recipe and options
    ...[client, source, options]: [Fetcher, Recipe, CallOptions]
): Promise<Dataset> => {
    throw new Error('Client 0.5.0 has no stored read for a recipe.');
};

/**
 * `fn` of each item, at most `limit` at once, in the items' order. After the first rejection no
 * other item starts, and the result rejects with it.
 */
const mapBounded = async <I, O>(
    items: readonly I[],
    limit: number,
    fn: (item: I) => Promise<O>,
): Promise<O[]> => {
    const results: O[] = [];
    let next = 0;
    let failed = false;
    const worker = async () => {
        for (let index = next++; index < items.length && !failed; index = next++) {
            try {
                results[index] = await fn(items[index]!);
            } catch (error) {
                failed = true;
                throw error;
            }
        }
    };

    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));

    return results;
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
    const done = [
        ...(await mapBounded(recipes, READ_CONCURRENCY, readOne)),
        ...(await mapBounded(refs, READ_CONCURRENCY, readOne)),
    ];
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
 * Fetches the newest stored data for each of `sources`, `READ_CONCURRENCY` at a time, and runs
 * `derive` on the rows. When a stored read or `derive` fails, it returns `fallback.value` as the
 * `committed` tier, or with `fallback.tier` `pinned` reads every ref's pinned version and
 * derives from those rows. The
 * stored read's failure goes to `console.warn`. A dataset's `freshness` says how new a stored
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
        client = new Client({ apiKey: false }),
        signal,
        timeout = STORED_TIMEOUT_MS,
    }: { fallback: Fallback<T>; client?: Fetcher; signal?: AbortSignal; timeout?: number },
): Promise<LiveRead<K, T>> => {
    // Object.keys widens to string; these are the keys of `sources`.
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

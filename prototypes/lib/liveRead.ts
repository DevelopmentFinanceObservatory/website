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
// Pages own the React hook that calls this, and put the tier on their root as `data-read-tier`.
import { Client, DatasetRef, type Dataset, type recipe } from '@developmentfinance/client';
import type { Row } from '@developmentfinance/client/types';

/** How long each stored read may take before the page falls back. The reads run in parallel,
 *  and one waits on a build when DFO stores no version it can serve. */
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

/**
 * Reads a recipe on the newest versions DFO stores of the datasets it starts from. Client 0.5.0
 * refuses `latest: "stored"` on a recipe, so this rejects before any request and the page
 * falls back. Client 0.6.0 resolves each root's stored version from its spec's manifest, and
 * the body becomes `client.fetch(source, { ...options, latest: 'stored' })`.
 */
const fetchStoredRecipe = async (
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- the 0.6.0 call takes all three
    ...[client, source, options]: [Fetcher, Recipe, CallOptions]
): Promise<Dataset> => {
    throw new Error('Client 0.5.0 has no stored read for a recipe; it arrives with client 0.6.0.');
};

const read = async <K extends string, T>(
    client: Fetcher,
    sources: Record<K, Parsed>,
    derive: (rows: Record<K, Row[]>) => T,
    tier: 'stored' | 'pinned',
    options: CallOptions,
): Promise<LiveRead<K, T>> => {
    const keys = Object.keys(sources) as K[];
    const datasets = await Promise.all(
        keys.map((key) => {
            const source = sources[key];

            if ('recipe' in source) {
                return fetchStoredRecipe(client, source.recipe, options);
            }

            return tier === 'stored'
                ? client.fetch(source.ref, { ...options, latest: 'stored' })
                : client.fetch(source.ref, options);
        }),
    );
    const rows = await Promise.all(datasets.map((data) => data.toRows()));
    const byKey = <V>(values: V[]) =>
        Object.fromEntries(keys.map((key, index) => [key, values[index]])) as Record<K, V>;

    return {
        tier,
        value: derive(byKey(rows)),
        datasets: byKey(datasets),
        asCommitted: keys.every((key, index) => {
            const source = sources[key];

            return 'ref' in source && source.ref.sameData(datasets[index]!.ref);
        }),
    };
};

/**
 * Fetches the newest stored data for each of `sources` and runs `derive` on the rows. When a
 * stored read or `derive` fails, it returns `fallback.value` as the `committed` tier, or with
 * `fallback.tier` `pinned` reads every ref's pinned version and derives from those rows. The
 * stored read's failure goes to `console.warn`. A dataset's `freshness` says how new a stored
 * read is. `client` stands in for the anonymous one on the production API, as a test does.
 *
 * @throws A ref the client cannot read, or a recipe with a `pinned` fallback, before any
 *   request; the pinned read's errors or `derive`'s on the pinned rows; or an aborted `signal`,
 *   which skips the fallback.
 */
export const readLive = async <K extends string, T>(
    sources: Record<K, LiveSource>,
    derive: (rows: Record<K, Row[]>) => T,
    {
        fallback,
        client = new Client({ apiKey: false }),
        signal,
        timeout = STORED_TIMEOUT_MS,
    }: { fallback: Fallback<T>; client?: Fetcher; signal?: AbortSignal; timeout?: number },
): Promise<LiveRead<K, T>> => {
    const parsed = Object.fromEntries(
        Object.entries<LiveSource>(sources).map(([key, source]) => {
            if ('recipe' in source) {
                if (fallback.tier === 'pinned') {
                    throw new Error(
                        `${key} is a recipe, which needs the page's committed figures to fall back to.`,
                    );
                }

                return [key, source];
            }

            return [key, { ref: DatasetRef.fromJSON(source.ref) }];
        }),
    ) as Record<K, Parsed>;
    // Stops the stored reads still running once one fails, so they leave the connection to the
    // pinned reads.
    const stored = new AbortController();
    const storedSignal = signal ? AbortSignal.any([signal, stored.signal]) : stored.signal;

    try {
        return await read(client, parsed, derive, 'stored', { signal: storedSignal, timeout });
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

        return read(client, parsed, derive, 'pinned', { signal });
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

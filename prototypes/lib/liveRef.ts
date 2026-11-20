// How a page reads the refs in a step's `_data/live-refs.json` in the browser. Each read takes
// the version DFO stores as the newest of each member's spec, so a page shows a release DFO took
// in after the step ran. When any of a page's stored reads fails, takes longer than
// STORED_TIMEOUT_MS, or gives rows the page's own derivation refuses, the page reads every ref's
// pinned version instead, the numbers the step committed, so the derivation runs on stored rows
// for every ref or pinned rows for every ref. DFO refreshes each spec on its own, so stored reads
// of two specs can come from releases a refresh apart. The client is anonymous, since DFO serves
// both reads to DFO pages with no key. Pages own the React hook that calls this.
import { Client, DatasetRef, type Dataset } from '@developmentfinance/client';
import type { Row } from '@developmentfinance/client/types';

/** How long each stored read may take before the page reads the pinned versions. The reads run
 *  in parallel, and one waits on a build when DFO stores no version it can serve. */
export const STORED_TIMEOUT_MS = 10_000;

export type LiveRead<K extends string, T> = {
    /** What the page's derivation made of the rows. */
    value: T;
    datasets: Record<K, Dataset>;
    /** Every dataset holds the version its ref pins, so a label the step committed beside the
     *  ref, such as a release name, describes these rows. */
    asCommitted: boolean;
};

type Fetcher = Pick<Client, 'fetch'>;

const read = async <K extends string, T>(
    client: Fetcher,
    refs: Record<K, DatasetRef>,
    derive: (rows: Record<K, Row[]>) => T,
    options: { latest?: 'stored'; signal?: AbortSignal; timeout?: number },
): Promise<LiveRead<K, T>> => {
    const keys = Object.keys(refs) as K[];
    const datasets = await Promise.all(keys.map((key) => client.fetch(refs[key], options)));
    const rows = await Promise.all(datasets.map((data) => data.toRows()));
    const byKey = <V>(values: V[]) =>
        Object.fromEntries(keys.map((key, index) => [key, values[index]])) as Record<K, V>;

    return {
        value: derive(byKey(rows)),
        datasets: byKey(datasets),
        asCommitted: keys.every((key, index) => refs[key].sameData(datasets[index]!.ref)),
    };
};

/**
 * Fetches the newest stored data for each of `refs` and runs `derive` on the rows, or does the
 * same with every ref's pinned versions when a stored read or `derive` fails. Each ref is the
 * parsed JSON of a `DatasetRef`, as the step wrote it to `live-refs.json`. A dataset's
 * `freshness` says how new a stored read is, and is null after the fallback. The stored read's
 * failure goes to `console.warn`. `client` stands in for the anonymous one on the production
 * API, as a test does.
 *
 * @throws A ref the client cannot read, before any request; the pinned read's errors or
 *   `derive`'s on the pinned rows; or an aborted `signal`, which skips the fallback.
 */
export const readLiveRefs = async <K extends string, T>(
    refs: Record<K, unknown>,
    derive: (rows: Record<K, Row[]>) => T,
    {
        client = new Client({ apiKey: false }),
        signal,
        timeout = STORED_TIMEOUT_MS,
    }: { client?: Fetcher; signal?: AbortSignal; timeout?: number } = {},
): Promise<LiveRead<K, T>> => {
    const parsed = Object.fromEntries(
        Object.entries(refs).map(([key, ref]) => [key, DatasetRef.fromJSON(ref)]),
    ) as Record<K, DatasetRef>;
    // Stops the stored reads still running once one fails, so they leave the connection to the
    // pinned reads.
    const stored = new AbortController();
    const storedSignal = signal ? AbortSignal.any([signal, stored.signal]) : stored.signal;

    try {
        return await read(client, parsed, derive, {
            latest: 'stored',
            signal: storedSignal,
            timeout,
        });
    } catch (error) {
        if (signal?.aborted) {
            throw error;
        }
        stored.abort();
        console.warn(
            'The newest stored data failed to load, timed out, or gave rows the page refused, so the page reads the pinned versions.',
            error,
        );

        return read(client, parsed, derive, { signal });
    }
};

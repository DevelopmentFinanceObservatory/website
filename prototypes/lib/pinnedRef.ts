// How a page reads a committed ref in the browser: a ref object from a step's
// `_data/live-refs.json` goes in, and the Dataset with its rows comes out. A
// pinned file is a fixed version that anyone may read, so no key is needed and
// the numbers match what the step committed. Errors reach the caller as the
// client raises them; there is no fallback to other data. Pages own the React
// hook that calls this.
import { Client, DatasetRef, type Dataset } from '@developmentfinance/client';
import type { Row } from '@developmentfinance/client/types';

export type PinnedRead = {
    data: Dataset;
    rows: Row[];
};

/**
 * Fetches the data a ref names, with an anonymous client on the production
 * API. `ref` is the parsed JSON of a `DatasetRef`, as the step wrote it to
 * `live-refs.json`. `client` stands in for the anonymous one, as a test does.
 *
 * @throws The client's own errors: a ref it cannot read, a version DFO no
 *   longer keeps, a failed request, or an aborted `signal`.
 */
export const readPinnedRef = async (
    ref: unknown,
    {
        client = new Client({ apiKey: false }),
        signal,
    }: { client?: Pick<Client, 'fetch'>; signal?: AbortSignal } = {},
): Promise<PinnedRead> => {
    const data = await client.fetch(DatasetRef.fromJSON(ref), { signal });

    return { data, rows: await data.toRows() };
};

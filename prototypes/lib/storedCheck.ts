// How a built page learns, in the browser, whether DFO has stored newer data than its build
// read. The build records DFO's stored versions of every spec its reads took (`readChecked`,
// ./buildRead.ts). After paint the page asks DFO for the same specs' stored versions in one GET
// (`client.storedVersions`), which edge caches may answer for up to five minutes. When no spec
// changed, the page reads nothing. When any did, it reads every source again at DFO's newest
// stored versions (`readStored`, ./liveRead.ts) and derives its figures as the build does, since
// each page derives its figures from all its sources together, and shows them in place of the
// built ones. Any failure, a figure check the new rows break included, leaves the built figures.
//
// The check and the reads go through the page's anonymous client and pacer (./pacing.ts), as
// every other browser read does. The page's root carries the outcome as `data-stored-check`.
import { type Client, type Spec, StoredVersions } from '@developmentfinance/client';
import type { StoredVersionsJson } from '@developmentfinance/client/types';

import { type Derive, type LiveSource, readStored, STORED_TIMEOUT_MS } from './liveRead.ts';
import { type Lane, liveClient, pacer } from './pacing.ts';

/** A page root's `data-stored-check`: `checking` until DFO answers, `unchanged` when DFO
 *  stores nothing newer than the build read, `refreshed` when the page shows figures read
 *  again, and `failed` when the check or the read again failed and the page shows the built
 *  figures. */
export type StoredCheckState = 'checking' | 'unchanged' | 'refreshed' | 'failed';

/** The values `data-stored-check` takes. */
export const STORED_CHECK_STATES: readonly StoredCheckState[] = [
    'checking',
    'unchanged',
    'refreshed',
    'failed',
];

/** What a page reads again and how it derives its figures, loaded only once a spec changed, so
 *  a page whose data has not moved does not download its refs. */
export type RefreshPlan<K extends string, T> = {
    sources: Record<K, LiveSource>;
    derive: Derive<K, T>;
};

/** The outcome of a check: the figures read again, and when that read finished as an ISO 8601
 *  time, only when it is `refreshed`. */
export type StoredRefresh<T> =
    | { status: 'unchanged' }
    | { status: 'refreshed'; value: T; retrieved: string }
    | { status: 'failed' };

/** What a checked page shows: its figures, when they were read as an ISO 8601 time, and the
 *  check's state. */
export type Checked<T> = { value: T; retrieved: string; check: StoredCheckState };

/** What a page shows once its check settles on `result`: the figures read again and their
 *  time when it refreshed, else the built figures and the build's time. */
export const settledState = <T>(
    built: { value: T; retrieved: string },
    result: StoredRefresh<T>,
): Checked<T> =>
    result.status === 'refreshed'
        ? { value: result.value, retrieved: result.retrieved, check: 'refreshed' }
        : { ...built, check: result.status };

/** The UTC day, as YYYY-MM-DD, and time, as HH:MM, of an ISO 8601 time. */
export const retrievedParts = (retrieved: string): { day: string; time: string } => {
    const [day = '', time = ''] = retrieved.split('T');

    return { day, time: time.slice(0, 5) };
};

/** The part of a client the check uses. */
export type StoredChecker = Pick<Client, 'fetch' | 'storedVersions'>;

/** The specs a check names, as specs. A spec target needs only its id, and the client sends
 *  the ids sorted, so the request matches the one every other reader of the page sends. */
const specsOf = (built: StoredVersions): Spec[] =>
    Object.keys(built.heads).map((spec_id) => ({ spec_id, definition: {} }));

/**
 * Checks DFO's stored versions of the specs `stored` names and, when any changed, reads every
 * source of `load()` again and derives the page's figures. Resolves `failed`, logging only to
 * `console.debug`, when the check, the load, a read or the derivation fails, or `signal` aborts.
 * `client`, `lane` and `now` stand in for the page's client, pacer and clock, as a test does.
 */
export const refreshIfNewer = async <K extends string, T>({
    stored,
    load,
    client = liveClient(),
    lane = pacer,
    now = Date.now,
    signal,
}: {
    stored: StoredVersionsJson;
    load: () => Promise<RefreshPlan<K, T>>;
    client?: StoredChecker;
    lane?: Lane;
    now?: () => number;
    signal?: AbortSignal;
}): Promise<StoredRefresh<T>> => {
    try {
        const built = StoredVersions.fromJSON(stored);
        const current = await lane.run(
            () => client.storedVersions(specsOf(built), { signal, timeout: STORED_TIMEOUT_MS }),
            signal,
        );

        if (current.changedSince(built).length === 0) {
            return { status: 'unchanged' };
        }

        const { sources, derive } = await load();
        const read = await readStored(sources, derive, { client, signal });

        return {
            status: 'refreshed',
            value: read.value,
            retrieved: new Date(now()).toISOString(),
        };
    } catch (error) {
        console.debug('The stored-data check failed, so the page shows the built figures.', error);

        return { status: 'failed' };
    }
};

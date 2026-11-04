/**
 * The "What data is available?" overview, read on the server for the Studio
 * landing. Two reads, each already cached: the search catalogue (five
 * minutes, catalogueLoader.ts) and the graph's source catalogue (an hour,
 * sources/graph.ts). Neither failure stops the landing: a failed read
 * leaves its half of the overview null and the drawer renders the rest.
 *
 * The graph read waits up to SOURCES_WAIT_MS. A cold graph can take its
 * whole 15 s timeout and a retry, which suits the Sources page but not a
 * landing. Past the wait the landing goes on without the publishers, and
 * the read runs to its end so the hour cache is filled for the next visit.
 *
 * Server-only, without a `server-only` import so `node --test` can load it.
 */

import { loadSearchCatalogue } from '../search/catalogueLoader.ts';
import type { Filterable } from '../sources/filters.ts';
import { loadSources } from '../sources/graph.ts';

import { type DataAvailability, dataAvailabilityOf } from './dataAvailability.ts';

const SOURCES_WAIT_MS = 3000;

/** The Sources page's cards, or null when the graph fails or is slow. */
const loadSourcesInTime = async (): Promise<Filterable[] | null> => {
    const read = loadSources().catch((error: unknown) => {
        console.warn('data availability: the sources read failed', error);

        return null;
    });

    let timer: ReturnType<typeof setTimeout> | undefined;
    const waited = new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), SOURCES_WAIT_MS);
    });

    try {
        return await Promise.race([read, waited]);
    } finally {
        clearTimeout(timer);
    }
};

/** The overview: counts from the search catalogue and publishers from the
 *  graph, each null when its read gives nothing. Safe to call from a server
 *  component. */
export const loadDataAvailability = async (): Promise<DataAvailability> => {
    const [catalogue, sources] = await Promise.all([loadSearchCatalogue(), loadSourcesInTime()]);

    return dataAvailabilityOf(catalogue?.counts ?? null, sources);
};

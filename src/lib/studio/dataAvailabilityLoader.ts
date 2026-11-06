/**
 * The "What data is available?" overview, read on the server for
 * `GET /api/data-availability`. Two reads, each already cached: the search
 * catalogue (five minutes, catalogueLoader.ts) and the graph's source
 * catalogue (an hour, sources/graph.ts). A failed read leaves its half of
 * the overview null and the route still answers.
 *
 * The graph read keeps its own failure memory here, as catalogueLoader
 * does, because the hour cache stores only a 200 answer. While the graph is
 * down, this module answers null for FAILURE_TTL_MS before it reads again,
 * and callers that arrive during one read share it. Otherwise each drawer
 * opened during an outage would hold its own read, with the retry, open
 * against an API that is already struggling.
 *
 * Server-only, without a `server-only` import so `node --test` can load it.
 */

import { loadSearchCatalogue } from '../search/catalogueLoader.ts';
import type { Filterable } from '../sources/filters.ts';
import { loadSources } from '../sources/graph.ts';

import { type DataAvailability, dataAvailabilityOf } from './dataAvailability.ts';

const FAILURE_TTL_MS = 60_000;

// When the last failed graph read happened, or null after a success.
let failedAt: number | null = null;

// The graph read in progress, which concurrent callers share.
let inFlight: Promise<Filterable[] | null> | null = null;

/** The Sources page's cards, or null when the graph read fails or failed
 *  within the last FAILURE_TTL_MS. */
const loadSourcesOrNull = (): Promise<Filterable[] | null> => {
    if (failedAt !== null && Date.now() - failedAt < FAILURE_TTL_MS) {
        return Promise.resolve(null);
    }

    inFlight ??= loadSources()
        .then(
            (cards) => {
                failedAt = null;

                return cards;
            },
            (error: unknown) => {
                console.warn('data availability: the sources read failed', error);
                failedAt = Date.now();

                return null;
            },
        )
        .finally(() => {
            inFlight = null;
        });

    return inFlight;
};

/** The overview: counts from the search catalogue and sources from the
 *  graph, each null when its read gives nothing. */
export const loadDataAvailability = async (): Promise<DataAvailability> => {
    const [catalogue, cards] = await Promise.all([loadSearchCatalogue(), loadSourcesOrNull()]);

    return dataAvailabilityOf(catalogue?.counts ?? null, cards);
};

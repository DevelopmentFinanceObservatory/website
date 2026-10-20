/**
 * The search catalogue, read on the server for /data and the homepage (see
 * catalogue.ts for what it holds). The endpoint sends Cache-Control
 * max-age=300, and the read is cached for the same period, so a page reaches
 * the API at most every five minutes however many people open it.
 *
 * Server-only, without a `server-only` import so `node --test` can load it.
 * A failed read logs a warning and returns null, and the page renders
 * without counts or examples rather than failing. The cache keeps no failed
 * read, so this module remembers a failure itself for FAILURE_TTL_MS: while
 * the endpoint is down, the API sees one read a minute per server instance
 * rather than one per render.
 */

import { unstable_cache } from 'next/cache.js';

import { apisFetch } from '../apisAuth.ts';
import { searchApiBase } from '../searchApi.ts';

import { parseCatalogue, type SearchCatalogue } from './catalogue.ts';

const REVALIDATE_SECONDS = 300;

// The endpoint is a lookup. A slower answer holds up the page render.
const READ_TIMEOUT_MS = 3000;

const FAILURE_TTL_MS = 60_000;

const CATALOGUE_PATH = '/api/search/catalogue';

// When the last failed read happened, or null after a success.
let failedAt: number | null = null;

/**
 * The endpoint's body, cached for REVALIDATE_SECONDS under its path. Only a
 * 200 body is stored. Any other answer throws, and a throw leaves the cache
 * untouched. The cache sits around the call because Next's fetch cache keys
 * on the request headers, and the apis token (apisAuth.ts) changes at every
 * refresh. The fetch itself is `no-store`.
 */
const cachedCatalogueRead = unstable_cache(
    async (path: string): Promise<unknown> => {
        const res = await apisFetch(`${searchApiBase()}${path}`, {
            cache: 'no-store',
            signal: AbortSignal.timeout(READ_TIMEOUT_MS),
        });

        if (res.status !== 200) {
            throw new Error(`the API answered HTTP ${res.status}`);
        }

        return res.json();
    },
    ['search-catalogue-read'],
    { revalidate: REVALIDATE_SECONDS },
);

const readCatalogue = async (): Promise<SearchCatalogue | null> => {
    try {
        const catalogue = parseCatalogue(await cachedCatalogueRead(CATALOGUE_PATH));

        if (!catalogue) {
            console.warn('search catalogue: the API answered with a body that is not a catalogue');
        }

        return catalogue;
    } catch (error) {
        console.warn('search catalogue: the read failed', error);

        return null;
    }
};

/** The whole catalogue, or null when the API does not serve one. */
export const loadSearchCatalogue = async (): Promise<SearchCatalogue | null> => {
    if (failedAt !== null && Date.now() - failedAt < FAILURE_TTL_MS) {
        return null;
    }

    const catalogue = await readCatalogue();

    failedAt = catalogue ? null : Date.now();

    return catalogue;
};

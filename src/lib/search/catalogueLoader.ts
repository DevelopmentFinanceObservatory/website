/**
 * The search catalogue, read on the server for /data and the homepage (see
 * catalogue.ts for what it holds). The endpoint sends Cache-Control
 * max-age=300, and the read revalidates on the same period, so a page
 * reaches the API at most every five minutes however many people open it.
 *
 * Server-only. A failed read logs a warning and returns null, and the page
 * renders without counts or examples rather than failing. The fetch cache
 * keeps no failed read, so this module remembers a failure itself for
 * FAILURE_TTL_MS: while the endpoint is down, the API sees one read a minute
 * per server instance rather than one per render.
 */

import 'server-only';

import { parseCatalogue, type SearchCatalogue } from './catalogue';

import { searchApiBase } from '@/lib/searchApi';

const REVALIDATE_SECONDS = 300;

// The endpoint is a lookup. A slower answer holds up the page render.
const READ_TIMEOUT_MS = 3000;

const FAILURE_TTL_MS = 60_000;

// When the last failed read happened, or null after a success.
let failedAt: number | null = null;

const readCatalogue = async (): Promise<SearchCatalogue | null> => {
    try {
        const res = await fetch(`${searchApiBase()}/api/search/catalogue`, {
            signal: AbortSignal.timeout(READ_TIMEOUT_MS),
            next: { revalidate: REVALIDATE_SECONDS },
        });

        if (!res.ok) {
            console.warn(`search catalogue: the API answered HTTP ${res.status}`);

            return null;
        }

        const catalogue = parseCatalogue(await res.json());

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

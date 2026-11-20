'use client';

import { useEffect, useState } from 'react';

import type { OriginSwitch } from '@/lib/graphExplorer/explore';
import {
    GRAPH_SEARCH_PAUSE_MS,
    GRAPH_SEARCH_TIMEOUT_MS,
    graphSearchUrl,
} from '@/lib/graphExplorer/graphSearch';
import { readGraphSearch, type GraphSearch } from '@/lib/graphExplorer/wire';

/**
 * The graph search for one URL: idle when no query is sent, loading while
 * one waits or runs, then its answer, or failed when it did not come.
 */
export type GraphSearchState =
    | { readonly status: 'idle' }
    | { readonly status: 'loading'; readonly url: string }
    | { readonly status: 'ready'; readonly url: string; readonly value: GraphSearch }
    | { readonly status: 'failed'; readonly url: string };

const IDLE: GraphSearchState = { status: 'idle' };

// Answers kept for the visit, so typing back to an earlier query reads no
// more. The oldest goes first past the cap.
const ANSWERS = new Map<string, GraphSearch>();
const ANSWERS_CAP = 100;

const remember = (url: string, value: GraphSearch) => {
    ANSWERS.set(url, value);
    if (ANSWERS.size > ANSWERS_CAP) ANSWERS.delete(ANSWERS.keys().next().value as string);
};

/**
 * Asks GET /api/graph/schema/search once typing pauses on a query long
 * enough to send. A newer query cancels the request before it, and a
 * request that runs past the timeout fails.
 */
export const useGraphSearch = (
    query: string,
    switches: Readonly<Record<OriginSwitch, boolean>>,
): GraphSearchState => {
    const url = graphSearchUrl(query, switches);
    const [state, setState] = useState<GraphSearchState>(IDLE);

    useEffect(() => {
        if (url === null || ANSWERS.has(url)) return undefined;
        const controller = new AbortController();
        let cancelled = false;
        let timeout: ReturnType<typeof setTimeout> | undefined;
        const pause = setTimeout(() => {
            timeout = setTimeout(() => controller.abort(), GRAPH_SEARCH_TIMEOUT_MS);
            fetch(url, { signal: controller.signal, headers: { accept: 'application/json' } })
                .then(async (response) => {
                    if (!response.ok) throw new Error(`graph search answered ${response.status}`);
                    const value = readGraphSearch(await response.json());
                    remember(url, value);
                    if (!cancelled) setState({ status: 'ready', url, value });
                })
                .catch(() => {
                    if (!cancelled) setState({ status: 'failed', url });
                })
                .finally(() => clearTimeout(timeout));
        }, GRAPH_SEARCH_PAUSE_MS);
        return () => {
            cancelled = true;
            clearTimeout(pause);
            clearTimeout(timeout);
            controller.abort();
        };
    }, [url]);

    // A state left from an earlier URL never shows against the current query.
    if (url === null) return IDLE;
    const known = ANSWERS.get(url);
    if (known) return { status: 'ready', url, value: known };
    return 'url' in state && state.url === url ? state : { status: 'loading', url };
};

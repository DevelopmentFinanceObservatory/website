/**
 * The landing's "What data is available?" drawer reads two halves, each from
 * its own route, and shows each when it arrives:
 *
 * - The counts come from the search catalogue (`GET /api/search/catalogue`,
 *   served to the drawer at `GET /api/data-availability/counts`). They give
 *   the scope line, the aid line and the indicator and dataset tiles.
 * - The sources come from the graph's source catalogue
 *   (`GET /api/graph/sources`, served at `GET /api/data-availability/sources`)
 *   as the Sources page's publisher list, one row per publisher name with
 *   its source count. Each row links to that page with `?publisher=`.
 *
 * A route answers 503 when its read fails. The drawer then shows that half
 * as empty, meaning the scope line without counts or no source rows, and
 * keeps the link to the Sources page. The drawer reads a failed half again
 * the next time it opens.
 */

import { type CatalogueCounts, formatCount, parseCatalogue } from '../search/catalogue.ts';
import { type PublisherOption, serializePublishers } from '../sources/search.ts';

/** One half of the drawer: not read yet, on its way, read, or failed. A
 *  failed half shows as empty. */
export type Half<T> = { status: 'unread' | 'reading' | 'failed' } | { status: 'read'; value: T };

export const UNREAD = { status: 'unread' } as const satisfies Half<never>;
export const READING = { status: 'reading' } as const satisfies Half<never>;

/** Whether opening the drawer reads this half, which holds when it is unread
 *  or its last read failed. A half on its way is left to arrive. */
export const needsRead = (half: Half<unknown>): boolean =>
    half.status === 'unread' || half.status === 'failed';

/** A finished read as a half. Null is a failed read. */
export const settledHalf = <T>(value: T | null): Half<T> =>
    value === null ? { status: 'failed' } : { status: 'read', value };

/** "12 datasets", for a source's row. */
export const sourceDatasetCount = (count: number): string =>
    `${formatCount(count)} ${count === 1 ? 'dataset' : 'datasets'}`;

/** The Sources page with the row's publisher picked (`?publisher=`). */
export const sourceHref = (source: PublisherOption): string =>
    `/data/sources?${new URLSearchParams({ publisher: serializePublishers([source.label])! })}`;

const isSource = (value: unknown): value is PublisherOption => {
    const source = value as Partial<PublisherOption> | null;

    return typeof source?.label === 'string' && typeof source.count === 'number';
};

/** The sources route's body (`{ sources }`) read off the wire, or null when
 *  it is not one. A malformed row is dropped. */
export const parseSources = (body: unknown): PublisherOption[] | null => {
    const sources = (body as { sources?: unknown } | null)?.sources;

    return Array.isArray(sources) ? sources.filter(isSource) : null;
};

/** One route's body, parsed, or null when the read fails or the body does
 *  not parse. */
const fetchHalf = async <T>(
    path: string,
    parse: (body: unknown) => T | null,
    signal?: AbortSignal,
): Promise<T | null> => {
    try {
        const res = await fetch(path, { signal });

        return res.ok ? parse(await res.json()) : null;
    } catch {
        return null;
    }
};

/** The catalogue's counts, or null when the read fails. The route serves
 *  the catalogue the server parsed, and the same parseCatalogue checks it
 *  here, so a malformed body reads as no counts. */
export const fetchCounts = (signal?: AbortSignal): Promise<CatalogueCounts | null> =>
    fetchHalf(
        '/api/data-availability/counts',
        (body) => parseCatalogue(body)?.counts ?? null,
        signal,
    );

/** The Sources page's publisher list, most sources first, or null when the
 *  read fails. */
export const fetchSources = (signal?: AbortSignal): Promise<PublisherOption[] | null> =>
    fetchHalf('/api/data-availability/sources', parseSources, signal);

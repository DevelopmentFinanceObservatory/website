/**
 * The landing's "What data is available?" drawer reads two halves, each from
 * its own route, and shows each when it arrives:
 *
 * - The counts come from the search catalogue (`GET /api/search/catalogue`,
 *   served to the drawer at `GET /api/data-availability/counts`). They give
 *   the scope line, the aid line and the indicator and dataset tiles.
 * - The sources come from the graph's source catalogue
 *   (`GET /api/graph/sources`, served at `GET /api/data-availability/sources`)
 *   as the Sources page's filter rows, each with its dataset count.
 *
 * A route answers 503 when its read fails. The drawer then shows that half
 * as empty, meaning the scope line without counts or no source rows, and
 * keeps the link to the Sources page. The drawer reads a failed half again
 * the next time it opens.
 */

import { type CatalogueCounts, formatCount, parseCatalogue } from '../search/catalogue.ts';
import type { FilterGroup } from '../sources/filters.ts';

/** One row of the Sources page's filter chips: a publisher the Observatory
 *  imports itself, or a Data Commons that serves many publishers. `id` is
 *  what its chip filters by (lib/sources/filters.ts). */
export type DataSource = FilterGroup;

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

/** The Sources page filtered to one row, the way its chips filter it
 *  (`?filter=<id>`). */
export const sourceHref = (source: DataSource): string =>
    `/data/sources?filter=${encodeURIComponent(source.id)}`;

const isSource = (value: unknown): value is DataSource => {
    const source = value as Partial<DataSource> | null;

    return (
        typeof source?.id === 'string' &&
        typeof source.label === 'string' &&
        typeof source.count === 'number'
    );
};

/** The sources route's body (`{ sources }`) read off the wire, or null when
 *  it is not one. A malformed row is dropped. */
export const parseSources = (body: unknown): DataSource[] | null => {
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

/** The Sources page's rows, in its chip order, or null when the read
 *  fails. */
export const fetchSources = (signal?: AbortSignal): Promise<DataSource[] | null> =>
    fetchHalf('/api/data-availability/sources', parseSources, signal);

/** The question "Ask a follow-up" opens a fresh canvas with. It is specific
 *  enough that the agent answers it outright without asking what is meant. */
export const DATA_AVAILABILITY_PROMPT =
    'What data is available in DFO? Give me an overview of the datasets, publishers, countries and years covered, so I can ask about what interests me.';

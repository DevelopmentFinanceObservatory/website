/**
 * The landing's "What data is available?" overview. It is built from the
 * two reads the Data pages make. The search catalogue
 * (`GET /api/search/catalogue`) gives the counts that /data's starting point
 * shows: indicators, datasets, publishers, countries and the reach of the
 * aid data. The graph's source catalogue (`GET /api/graph/sources`) gives
 * what /data/sources lists: each source and the datasets under it.
 *
 * The server joins the two reads (dataAvailabilityLoader.ts) and serves
 * them at `GET /api/data-availability`. The drawer fetches that route when
 * it opens (fetchDataAvailability). Either half can be missing. Without
 * counts the drawer keeps the scope line, as /data does. Without sources it
 * keeps the link to the Sources page, which is the full list anyway.
 */

import { type CatalogueCounts, formatCount } from '../search/catalogue.ts';
import { filterGroups, type Filterable, type FilterGroup } from '../sources/filters.ts';

/** One row of the Sources page's filter chips: a publisher the Observatory
 *  imports itself, or a Data Commons that serves many publishers. `id` is
 *  what its chip filters by (lib/sources/filters.ts). */
export type DataSource = FilterGroup;

export type DataAvailability = {
    /** what DFO holds as a whole; null when the catalogue read failed */
    counts: CatalogueCounts | null;
    /** the Sources page's rows, in its chip order; null when the graph read
     *  failed */
    sources: DataSource[] | null;
};

/** The overview with nothing read. The drawer still opens with it, showing
 *  the scope line and the ways on. */
export const EMPTY_DATA_AVAILABILITY: DataAvailability = { counts: null, sources: null };

/** The overview from the two reads. `cards` are the Sources page's cards
 *  (lib/sources/graph.ts loadSources), grouped the way its chips are. */
export const dataAvailabilityOf = (
    counts: CatalogueCounts | null,
    cards: readonly Filterable[] | null,
): DataAvailability => ({
    counts,
    sources: cards ? filterGroups(cards) : null,
});

/** "12 datasets", for a source's row. */
export const sourceDatasetCount = (count: number): string =>
    `${formatCount(count)} ${count === 1 ? 'dataset' : 'datasets'}`;

/** The Sources page filtered to one row, the way its chips filter it
 *  (`?filter=<id>`). */
export const sourceHref = (source: DataSource): string =>
    `/data/sources?filter=${encodeURIComponent(source.id)}`;

/** The route the drawer reads. */
export const DATA_AVAILABILITY_PATH = '/api/data-availability';

const isSource = (value: unknown): value is DataSource => {
    const source = value as Partial<DataSource> | null;

    return (
        typeof source?.id === 'string' &&
        typeof source.label === 'string' &&
        typeof source.count === 'number'
    );
};

/** The route's body read off the wire, or null when it is not an overview.
 *  The counts are the catalogue's own object, which the server already
 *  parsed (lib/search/catalogue.ts parseCatalogue). */
export const parseDataAvailability = (body: unknown): DataAvailability | null => {
    const overview = body as Partial<DataAvailability> | null;

    if (
        !overview ||
        typeof overview !== 'object' ||
        (overview.counts !== null && typeof overview.counts !== 'object') ||
        (overview.sources !== null && !Array.isArray(overview.sources))
    ) {
        return null;
    }

    return {
        counts: overview.counts ?? null,
        sources: overview.sources?.filter(isSource) ?? null,
    };
};

/** The overview from the site's own route, or null when the read fails. */
export const fetchDataAvailability = async (
    signal?: AbortSignal,
): Promise<DataAvailability | null> => {
    try {
        const res = await fetch(DATA_AVAILABILITY_PATH, { signal });

        return res.ok ? parseDataAvailability(await res.json()) : null;
    } catch {
        return null;
    }
};

/** The question "Ask a follow-up" opens a fresh canvas with. It is specific
 *  enough that the agent answers it outright instead of asking what is
 *  meant. */
export const DATA_AVAILABILITY_PROMPT =
    'What data is available in DFO? Give me an overview of the datasets, publishers, countries and years covered, so I can ask about what interests me.';

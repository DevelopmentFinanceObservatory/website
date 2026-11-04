/**
 * The landing's "What data is available?" overview, built from the same two
 * reads the Data pages make rather than from copy: the search catalogue
 * (`GET /api/search/catalogue`, what /data's starting point shows: how many
 * indicators, datasets, publishers and countries DFO holds, and the reach of
 * its aid data) and the graph's source catalogue (`GET /api/graph/sources`,
 * what /data/sources lists: each publisher and the datasets under it). The
 * server reads both (dataAvailabilityLoader.ts); this module shapes them.
 *
 * Either read can be missing. Without counts the drawer keeps the scope
 * line, as /data does; without sources it keeps the link to the Sources
 * page, which is the full list anyway.
 */

import type { CatalogueCounts } from '../search/catalogue.ts';
import { filterGroups, type Filterable, type FilterGroup } from '../sources/filters.ts';

/** A publisher on the Sources page, with its dataset count and the filter
 *  id its chip answers to (lib/sources/filters.ts). */
export type DataPublisher = FilterGroup;

export type DataAvailability = {
    /** what DFO holds as a whole; null when the catalogue read failed */
    counts: CatalogueCounts | null;
    /** the Sources page's publishers, in its chip order; null when the graph
     *  read failed or did not answer in time */
    publishers: DataPublisher[] | null;
};

/** One line of the drawer's fact list. */
export type DataFact = { label: string; value: string };

/** The overview with nothing read: the drawer still opens, with the scope
 *  line and the ways on. */
export const EMPTY_DATA_AVAILABILITY: DataAvailability = { counts: null, publishers: null };

/** The overview from the two reads. `sources` are the Sources page's cards
 *  (lib/sources/graph.ts loadSources), grouped the way its chips are. */
export const dataAvailabilityOf = (
    counts: CatalogueCounts | null,
    sources: readonly Filterable[] | null,
): DataAvailability => ({
    counts,
    publishers: sources ? filterGroups(sources) : null,
});

const formatCount = (value: number): string => value.toLocaleString('en-GB');

/**
 * The fact list under the scope line: the catalogue's counts, each on its
 * own line, the aid years as a range. None without counts.
 */
export const dataFacts = (counts: CatalogueCounts | null): DataFact[] => {
    if (!counts) {
        return [];
    }

    const facts: DataFact[] = [
        { label: 'Indicators', value: formatCount(counts.indicators) },
        { label: 'Datasets', value: formatCount(counts.datasets) },
        { label: 'Publishers', value: formatCount(counts.publishers) },
        { label: 'Countries', value: formatCount(counts.countries) },
        { label: 'Aid donors', value: formatCount(counts.aid.donors) },
        { label: 'Aid recipients', value: formatCount(counts.aid.recipients) },
    ];

    if (counts.aid.years) {
        facts.push({
            label: 'Aid data years',
            value: `${counts.aid.years.first}–${counts.aid.years.last}`,
        });
    }

    return facts;
};

/** "12 datasets", for a publisher's line. */
export const datasetCount = (count: number): string =>
    `${formatCount(count)} ${count === 1 ? 'dataset' : 'datasets'}`;

/** The Sources page filtered to one publisher, the way its chips filter it
 *  (`?filter=<id>`). */
export const publisherHref = (publisher: DataPublisher): string =>
    `/data/sources?filter=${encodeURIComponent(publisher.id)}`;

/** The question "Ask a follow-up" opens a fresh canvas with: specific enough
 *  that the agent answers it outright rather than asking what is meant. */
export const DATA_AVAILABILITY_PROMPT =
    'What data is available in DFO? Give me an overview of the datasets, publishers, countries and years covered, so I can ask about what interests me.';

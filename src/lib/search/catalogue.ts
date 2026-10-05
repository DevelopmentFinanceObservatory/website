/**
 * The search catalogue (`GET /api/search/catalogue`, and `?place=<dcid>` for
 * one country): the counts behind the scope line and the example sentences
 * the starting point, a declined answer and the idle prompt's chips offer.
 * Every example has been checked to resolve, so a click runs it as a search.
 *
 * The page reads the whole catalogue on the server (catalogueLoader.ts) and
 * a country's on the client (searchClient.ts's fetchSearchCatalogue). With
 * neither, the starting point keeps its scope line without counts and offers
 * no examples.
 */

/** One example sentence: a checked template filled with a place. */
export type CatalogueExample = {
    /** the sentence to show and run, e.g. "Health aid to Ethiopia" */
    text: string;
    /** the template it fills, e.g. "Health aid to {place}" */
    template: string;
    /** the StatVar the sentence resolves to */
    stat_var: string;
    /** the place it is filled with */
    place: string;
};

/** CRS counts. `years` is null when the build holds no CRS rows. */
export type AidCounts = {
    donors: number;
    recipients: number;
    years: { first: number; last: number } | null;
};

/** What DFO holds as a whole. */
export type CatalogueCounts = {
    publishers: number;
    countries: number;
    aid: AidCounts;
};

/** What DFO holds at one country. For aid, `donors` counts the donors to the
 *  country and `recipients` the recipients of its own aid. */
export type PlaceCounts = {
    publishers: number;
    variables: number;
    aid: AidCounts;
};

/** The whole catalogue (`GET /api/search/catalogue`). */
export type SearchCatalogue = {
    catalogue_version: string;
    counts: CatalogueCounts;
    examples: CatalogueExample[];
};

/** One country's catalogue (`?place=`): its counts, and the examples with
 *  data there, filled with its name. */
export type PlaceCatalogue = {
    catalogue_version: string;
    counts: PlaceCounts;
    examples: CatalogueExample[];
};

/** The first idle chip. It shows the starting point from the catalogue the
 *  page already holds, with no search call. */
export const STARTING_POINT_QUERY = 'What data do you have?';

/** How many examples a declined out_of_scope answer offers. */
export const DECLINED_EXAMPLE_COUNT = 3;

const isCount = (value: unknown): value is number =>
    typeof value === 'number' && Number.isFinite(value);

const isExample = (value: unknown): value is CatalogueExample => {
    const example = value as Partial<CatalogueExample> | null;

    return (
        typeof example?.text === 'string' &&
        example.text.trim() !== '' &&
        typeof example.template === 'string' &&
        typeof example.stat_var === 'string' &&
        typeof example.place === 'string'
    );
};

type CatalogueBody = {
    catalogue_version?: unknown;
    counts?: { publishers?: unknown; countries?: unknown; variables?: unknown; aid?: unknown };
    examples?: unknown;
};

const parseAid = (body: unknown): AidCounts | null => {
    const aid = body as { donors?: unknown; recipients?: unknown; years?: unknown } | null;
    const years = aid?.years as { first?: unknown; last?: unknown } | null | undefined;

    if (!isCount(aid?.donors) || !isCount(aid.recipients)) {
        return null;
    }

    if (years === null) {
        return { donors: aid.donors, recipients: aid.recipients, years: null };
    }

    return isCount(years?.first) && isCount(years.last)
        ? {
              donors: aid.donors,
              recipients: aid.recipients,
              years: { first: years.first, last: years.last },
          }
        : null;
};

/**
 * A catalogue body read off the wire, with `scoped` as the count that tells
 * the whole catalogue (`countries`) from one country's (`variables`), or null
 * when the body is not one. An example missing a field is dropped, since the
 * rest still run.
 */
const parseBody = (body: unknown, scoped: 'countries' | 'variables') => {
    const catalogue = body as CatalogueBody | null;
    const counts = catalogue?.counts;
    const aid = parseAid(counts?.aid);

    if (
        typeof catalogue?.catalogue_version !== 'string' ||
        !isCount(counts?.publishers) ||
        !isCount(counts[scoped]) ||
        !aid ||
        !Array.isArray(catalogue.examples)
    ) {
        return null;
    }

    return {
        catalogue_version: catalogue.catalogue_version,
        publishers: counts.publishers,
        scoped: counts[scoped],
        aid,
        examples: catalogue.examples.filter(isExample),
    };
};

/** The whole catalogue read off the wire, or null when the body is not one. */
export function parseCatalogue(body: unknown): SearchCatalogue | null {
    const read = parseBody(body, 'countries');

    return (
        read && {
            catalogue_version: read.catalogue_version,
            counts: { publishers: read.publishers, countries: read.scoped, aid: read.aid },
            examples: read.examples,
        }
    );
}

/** One country's catalogue read off the wire, or null when the body is not
 *  one. */
export function parsePlaceCatalogue(body: unknown): PlaceCatalogue | null {
    const read = parseBody(body, 'variables');

    return (
        read && {
            catalogue_version: read.catalogue_version,
            counts: { publishers: read.publishers, variables: read.scoped, aid: read.aid },
            examples: read.examples,
        }
    );
}

/** The idle prompt's chips: the starting point, then every example. */
export function catalogueChips(catalogue: SearchCatalogue | null): string[] {
    return [STARTING_POINT_QUERY, ...(catalogue?.examples ?? []).map((example) => example.text)];
}

const formatCount = (value: number): string => value.toLocaleString('en-GB');

const publisherCount = (publishers: number): string =>
    `${formatCount(publishers)} ${publishers === 1 ? 'publisher' : 'publishers'}`;

const variableCount = (variables: number): string =>
    `${formatCount(variables)} ${variables === 1 ? 'variable' : 'variables'}`;

/** The starting point's scope line for the whole catalogue. With no counts,
 *  the line still says what DFO holds. */
export function scopeLine(counts: CatalogueCounts | null): string {
    const subject = 'DFO holds aid, debt and development data';

    return counts
        ? `${subject} from ${publisherCount(counts.publishers)}, covering ${formatCount(counts.countries)} countries.`
        : `${subject}.`;
}

/** The starting point's scope line for one country, from its `?place=`
 *  counts: the variables with data there and the publishers behind them. With no counts, the line still says what DFO holds there. */
export function placeScopeLine(counts: PlaceCounts | null, placeLabel: string): string {
    const subject = `DFO holds aid, debt and development data on ${placeLabel}`;

    return counts
        ? `${subject}, with ${variableCount(counts.variables)} from ${publisherCount(counts.publishers)}.`
        : `${subject}.`;
}

/**
 * The examples a declined out_of_scope answer offers: the first `count`
 * filled with the confirmed country when its catalogue has any, otherwise
 * the first `count` of the whole catalogue.
 */
export function declinedExamples(
    catalogue: SearchCatalogue | null,
    placeCatalogue: PlaceCatalogue | null,
    count = DECLINED_EXAMPLE_COUNT,
): CatalogueExample[] {
    const placed = placeCatalogue?.examples ?? [];

    return (placed.length > 0 ? placed : (catalogue?.examples ?? [])).slice(0, count);
}

/** The stat tiles on /data and the homepage: publishers and countries, or
 *  none without a catalogue. */
export function catalogueTiles(
    catalogue: SearchCatalogue | null,
): { value: string; label: string }[] {
    if (!catalogue) {
        return [];
    }

    return [
        { value: formatCount(catalogue.counts.publishers), label: 'Publishers' },
        { value: formatCount(catalogue.counts.countries), label: 'Countries' },
    ];
}

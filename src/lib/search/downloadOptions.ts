/**
 * The download sheet's choices and the words for its extra columns: the
 * choices a viewer last made (format, bundle, extra columns), read back from
 * storage; the extra-column tokens a mint posts for them; and the extra columns an
 * answer offers, grouped by the entity column they join onto and headed by
 * the role that column plays.
 *
 * This module has no DOM dependency, so `node --test` can import it directly.
 */

import { capitalise } from '../capitalise.ts';
import {
    DATASET_FORMATS,
    type DatasetCoverageDimension,
    type DatasetEnrichment,
    type DatasetFormat,
    type DatasetOutputOptions,
} from './searchClient.ts';

export type DownloadChoices = {
    format: DatasetFormat;
    bundle: boolean;
    // Enrichment tokens ({column}_{field}) from every answer the viewer has
    // downloaded. Each answer uses the ones it offers (offeredEnrichment).
    enrichment: string[];
};

export const DEFAULT_DOWNLOAD_CHOICES: DownloadChoices = {
    format: 'csv',
    bundle: true,
    enrichment: [],
};

const FORMATS: readonly string[] = ['csv', 'xlsx', 'parquet'] satisfies DatasetFormat[];

/** Stored choices, or the defaults for anything missing or malformed. */
export const parseDownloadChoices = (raw: string | null): DownloadChoices => {
    let stored: unknown = null;

    try {
        stored = raw ? JSON.parse(raw) : null;
    } catch {
        return DEFAULT_DOWNLOAD_CHOICES;
    }

    if (!stored || typeof stored !== 'object') {
        return DEFAULT_DOWNLOAD_CHOICES;
    }

    const { format, bundle, enrichment } = stored as Record<string, unknown>;

    return {
        format:
            typeof format === 'string' && FORMATS.includes(format)
                ? (format as DatasetFormat)
                : DEFAULT_DOWNLOAD_CHOICES.format,
        bundle: typeof bundle === 'boolean' ? bundle : DEFAULT_DOWNLOAD_CHOICES.bundle,
        enrichment: Array.isArray(enrichment)
            ? enrichment.filter((token): token is string => typeof token === 'string')
            : DEFAULT_DOWNLOAD_CHOICES.enrichment,
    };
};

/** The extra columns an answer can join: `available` and `partial` alike, a
 *  partial one showing its coverage on its row. A column the long layout
 *  already writes (`long_layout_defaults`) is not an extra. */
export const enrichmentChoices = (options: DatasetOutputOptions | null | undefined) =>
    (options?.enrichments ?? []).filter(
        (entry) =>
            (entry.state === 'available' || entry.state === 'partial') &&
            !options?.long_layout_defaults?.includes(entry.token),
    );

/** The remembered tokens this answer offers, in the answer's own order, so a
 *  token only another answer offered is left out of this one's mint. */
export const offeredEnrichment = (
    remembered: readonly string[],
    options: DatasetOutputOptions | null | undefined,
): string[] =>
    enrichmentChoices(options)
        .map((entry) => entry.token)
        .filter((token) => remembered.includes(token));

/**
 * The `options.columns` a mint posts: the chosen extras this answer offers,
 * as enrichment tokens only. The API keeps every default column when
 * `columns` names tokens alone and appends each token's column. Undefined
 * (the dataset as is) when no extra applies.
 */
export const mintColumns = (
    remembered: readonly string[],
    options: DatasetOutputOptions | null | undefined,
): string[] | undefined => {
    const extras = offeredEnrichment(remembered, options);

    return extras.length ? extras : undefined;
};

/** The formats this dataset renders; all three until its options document
 *  answers. */
export const formatChoicesFor = (options: DatasetOutputOptions | null | undefined) => {
    const live = (options?.formats ?? [])
        .filter((entry) => entry.state === 'available')
        .map((entry) => entry.name);

    return live.length
        ? DATASET_FORMATS.filter((entry) => live.includes(entry.id))
        : DATASET_FORMATS;
};

/**
 * The remembered choices narrowed to what this answer offers: a format it
 * renders (its first one when the remembered format is not), the bundle only
 * where offered, and the mint's extra columns. Without an options document
 * every format and the bundle count as offered.
 */
export const resolveChoices = (
    choices: DownloadChoices,
    options: DatasetOutputOptions | null | undefined,
) => {
    const formats = formatChoicesFor(options);
    const bundleOffered = (options?.bundle?.state ?? 'available') === 'available';

    return {
        formats,
        format: formats.some((entry) => entry.id === choices.format)
            ? choices.format
            : (formats[0]?.id ?? choices.format),
        bundleOffered,
        bundle: choices.bundle && bundleOffered,
        columns: mintColumns(choices.enrichment, options),
    };
};

/**
 * Whether a one-click download must read the answer's options document
 * before it mints: a remembered extra column must be one the answer offers,
 * and a remembered format other than CSV may be one this answer cannot
 * render (Excel over its row limit). CSV always renders, and the bundle is a
 * deployment-wide capability, so the defaults mint straight away.
 */
export const choicesNeedOptions = (choices: DownloadChoices): boolean =>
    choices.enrichment.length > 0 || choices.format !== 'csv';

// An enrichment names its field on the wire; these are the words for it.
const ENRICHMENT_LABELS: Record<string, string> = {
    iso3: 'ISO3 country codes',
    iso2: 'ISO2 country codes',
    label: 'Entity names',
    type: 'Entity types',
};

// What a role column is called when the answer has a word for its role.
const AXIS_HEADINGS: Record<string, string> = {
    origin: 'Provider',
    destination: 'Recipient',
};

const OBSERVATION_ABOUT = 'observationAbout';

/** A camelCase wire name as words in sentence case: "financingProvider" reads
 *  "Financing provider". */
const readableName = (raw: string): string => {
    const words = raw
        .replace(/[_-]+/g, ' ')
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .trim()
        .toLowerCase();

    return capitalise(words);
};

export const enrichmentLabel = (entry: DatasetEnrichment): string =>
    ENRICHMENT_LABELS[entry.field] ?? readableName(entry.field);

/** A partial enrichment's coverage ("118 of 132"), or null for a full one. */
export const coverageNote = (entry: DatasetEnrichment): string | null => {
    if (entry.state !== 'partial') {
        return null;
    }

    const { covered, entities } = entry.coverage ?? {};

    return covered == null || entities == null ? 'partial' : `${covered} of ${entities}`;
};

/** What a role column is called for the viewer: Provider or Recipient for a
 *  flow's role column (its coverage dimension's axis), the bound entity's type
 *  for observationAbout ("Country"), and the column's own name otherwise. */
const roleHeading = ({
    column,
    dimensions,
    entities,
}: {
    column: string;
    dimensions?: DatasetCoverageDimension[] | null;
    // The answer's bound entities, which name observationAbout's type.
    entities?: { role?: string; entity_type?: string | null }[] | null;
}): string => {
    const axis = (dimensions ?? []).find((dimension) => dimension.label === column)?.axis;

    if (axis && AXIS_HEADINGS[axis]) {
        return AXIS_HEADINGS[axis];
    }

    if (column === OBSERVATION_ABOUT) {
        const type = entities?.find((entity) => entity.role === OBSERVATION_ABOUT)?.entity_type;

        return type ? readableName(type) : 'Place';
    }

    return readableName(column);
};

export type EnrichmentGroup = {
    column: string;
    heading: string;
    entries: DatasetEnrichment[];
};

/**
 * The offered extras grouped by the column they join onto, in wire order,
 * each headed by the role that column plays: Provider or Recipient for a flow's
 * role column (its coverage dimension's axis), the bound entity's type for
 * observationAbout ("Country"), and the column's own name otherwise.
 */
export const enrichmentGroups = ({
    options,
    dimensions,
    entities,
}: {
    options: DatasetOutputOptions | null | undefined;
    dimensions?: DatasetCoverageDimension[] | null;
    // The answer's bound entities, which name observationAbout's type.
    entities?: { role?: string; entity_type?: string | null }[] | null;
}): EnrichmentGroup[] => {
    const groups = new Map<string, EnrichmentGroup>();

    for (const entry of enrichmentChoices(options)) {
        const group = groups.get(entry.column);

        if (group) {
            group.entries.push(entry);
        } else {
            groups.set(entry.column, {
                column: entry.column,
                heading: roleHeading({ column: entry.column, dimensions, entities }),
                entries: [entry],
            });
        }
    }

    return [...groups.values()];
};

/**
 * Where the total rows of a download go. The options document's
 * `long_layout_totals` names the roles whose totals (rows for a group such as
 * a region, which hold the figures of its members) a long CSV or Excel file
 * keeps out of its main table. The server lists roles that can hold a total,
 * and an open role may hold none in this answer, so the note says
 * "Any ... totals". A bundle's CSV writes them to a second file, an Excel file
 * to a second sheet, and a bare CSV leaves them out. Null when no role sets
 * rows apart, and for Parquet, which keeps every row.
 */
export const totalsNote = ({
    options,
    dimensions,
    entities,
    format,
    bundle,
    bundleOffered,
}: {
    options: DatasetOutputOptions | null | undefined;
    dimensions?: DatasetCoverageDimension[] | null;
    entities?: { role?: string; entity_type?: string | null }[] | null;
    format: DatasetFormat;
    bundle: boolean;
    bundleOffered: boolean;
}): string | null => {
    const roles = options?.long_layout_totals ?? [];

    if (roles.length === 0 || format === 'parquet') {
        return null;
    }

    const who = new Intl.ListFormat('en-GB', { type: 'conjunction' }).format(
        roles.map((column) => roleHeading({ column, dimensions, entities }).toLowerCase()),
    );
    // "Any": a role listed here can hold a total, and this answer may hold none.
    const subject = `Any ${who} totals`;
    const why = "so the main table's rows can be added up";

    if (format === 'xlsx') {
        return `${subject} go on a second sheet, ${why}.`;
    }

    if (bundle) {
        return `${subject} go in a second CSV file in the download, ${why}.`;
    }

    return `${subject} are left out of the file, ${why}.${
        bundleOffered ? ' Tick README to get them as a second file.' : ''
    }`;
};

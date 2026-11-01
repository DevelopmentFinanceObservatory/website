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

// The enrichment fields the long layout reads into a party role's
// `{column}_kind` column.
const KIND_FIELDS: readonly string[] = ['party_kind', 'party_class', 'party_whole'];

/** The role column the long layout writes an enrichment field into, by its
 *  suffix: a role's names go to `{column}_label`, its party fields to
 *  `{column}_kind`. Null for a field the long layout writes under its own
 *  token. */
const longLayoutSuffix = (field: string): 'label' | 'kind' | null => {
    if (field === 'label') {
        return 'label';
    }

    return KIND_FIELDS.includes(field) ? 'kind' : null;
};

/**
 * Whether the long layout, the one Get Data downloads, already writes this
 * enrichment, so ticking it would add nothing. The options document's
 * `in_long_layout` flag decides where it is served. An API that leaves the
 * flag out still lists the columns the long layout writes in
 * `long_layout_defaults`: a label is in the file when `{column}_label` is
 * listed, a party field (kind, class, whole) when `{column}_kind` is, and any
 * other field when its own token is.
 */
export const enrichmentAlreadyInFile = (
    entry: DatasetEnrichment,
    options: DatasetOutputOptions,
): boolean => {
    if (typeof entry.in_long_layout === 'boolean') {
        return entry.in_long_layout;
    }

    const suffix = longLayoutSuffix(entry.field);

    return (
        options.long_layout_defaults?.includes(
            suffix ? `${entry.column}_${suffix}` : entry.token,
        ) ?? false
    );
};

/** The extra columns an answer can join: `available` and `partial` alike, a
 *  partial one saying on its row which entities it leaves blank. An
 *  enrichment the long layout already writes is not an extra. */
export const enrichmentChoices = (options: DatasetOutputOptions | null | undefined) =>
    options
        ? (options.enrichments ?? []).filter(
              (entry) =>
                  (entry.state === 'available' || entry.state === 'partial') &&
                  !enrichmentAlreadyInFile(entry, options),
          )
        : [];

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

/** One of the answer's bound entities, as the spec carries it: `role` is
 *  observationAbout, origin or destination, and a country's `ref` is its
 *  Data Commons id, `country/` and its ISO 3-letter code. */
export type BoundEntity = {
    ref?: string;
    label?: string | null;
    role?: string;
    entity_type?: string | null;
};

const COUNTRY_REF = /^country\/([A-Z]{3})$/;

// Each enrichment field in plain words, and its value for the role's bound
// entity, the example a row shows. A field with no value to read (an ISO
// 2-letter code, an open role) shows no example. `countries` marks a field
// that holds a country code, so an entity without one is not a country.
const FIELD_WORDS: Record<
    string,
    { name: string; example?: (entity: BoundEntity) => string | null; countries?: true }
> = {
    iso3: {
        name: 'ISO 3-letter code',
        example: (entity) => COUNTRY_REF.exec(entity.ref ?? '')?.[1] ?? null,
        countries: true,
    },
    iso2: { name: 'ISO 2-letter code', countries: true },
    label: { name: 'Name', example: (entity) => entity.label ?? null },
    type: {
        name: 'Type',
        example: (entity) => (entity.entity_type ? readableName(entity.entity_type) : null),
    },
};

// The kinds the long layout writes for a party role, by the axis its column
// serves: a provider is official or private, a recipient a country or
// organisation or private, and either side can be a total. A role column with
// no known axis gets the kinds both sides share.
const KIND_EXAMPLES: Record<string, string> = {
    origin: 'official, private or a total',
    destination: 'a country or organisation, private or a total',
};
const SHARED_KINDS = 'private or a total';

/**
 * Whether the long layout writes a role column's names (`label`) or kinds
 * (`kind`), by the rule `enrichmentAlreadyInFile` applies to each enrichment:
 * where any of the column's enrichments of that suffix carries
 * `in_long_layout`, the flags decide; otherwise `long_layout_defaults` decides
 * through `{column}_{suffix}`.
 */
const longLayoutWrites = (
    options: DatasetOutputOptions,
    { column, suffix }: { column: string; suffix: 'label' | 'kind' },
): boolean => {
    const flagged = (options.enrichments ?? []).filter(
        (entry) =>
            entry.column === column &&
            longLayoutSuffix(entry.field) === suffix &&
            typeof entry.in_long_layout === 'boolean',
    );

    return flagged.length
        ? flagged.some((entry) => entry.in_long_layout)
        : (options.long_layout_defaults?.includes(`${column}_${suffix}`) ?? false);
};

type Noun = { singular: string; plural: string };

/** Which entities a partial enrichment leaves blank, in words: "blank for the
 *  9 providers that are not countries". Null for a full one. */
const blankNote = (entry: DatasetEnrichment, noun: Noun | null, countries: boolean) => {
    if (entry.state !== 'partial') {
        return null;
    }

    const { covered, entities } = entry.coverage ?? {};

    if (covered == null || entities == null) {
        return 'blank for some';
    }

    const missing = entities - covered;

    if (missing <= 0) {
        return null;
    }

    if (!noun && !countries) {
        return `blank for ${missing} of ${entities}`;
    }

    const one = missing === 1;
    const who = noun ? ` ${one ? noun.singular : noun.plural}` : '';
    const why = countries ? (one ? ' that is not a country' : ' that are not countries') : '';

    return `blank for the ${missing}${who}${why}`;
};

/** One extra column as the dialog shows it: the token it posts, a plain name,
 *  and a detail line with an example and the entities it leaves blank. */
export type ExtraColumn = { token: string; name: string; detail: string | null };

const extraColumn = (
    entry: DatasetEnrichment,
    { bound, noun }: { bound: readonly BoundEntity[]; noun: Noun | null },
): ExtraColumn => {
    const words = FIELD_WORDS[entry.field];
    // The first bound entity with a value: Official donors has no code, France has.
    const value = bound.map((entity) => words?.example?.(entity)).find(Boolean);
    const example = value ? `${value}, for example` : null;
    const blank = blankNote(entry, noun, words?.countries ?? false);

    return {
        token: entry.token,
        name: words?.name ?? readableName(entry.field),
        detail: [example, blank].filter(Boolean).join('; ') || null,
    };
};

/** What a role column is called for the viewer, the one word the dialog uses
 *  for it: its coverage dimension's noun ("Debtor"), else Provider or
 *  Recipient for a flow's role column (the dimension's axis), the bound
 *  entity's type for observationAbout ("Country"), and the column's own name
 *  otherwise. */
const roleHeading = ({
    column,
    dimensions,
    entities,
}: {
    column: string;
    dimensions?: DatasetCoverageDimension[] | null;
    // The answer's bound entities, which name observationAbout's type.
    entities?: BoundEntity[] | null;
}): string => {
    const dimension = dimensions?.find((candidate) => candidate.label === column);
    const axis = dimension?.axis;

    if (dimension?.noun) {
        return capitalise(dimension.noun.singular);
    }

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
    // The heading in lower case ("provider"), for the in-file note.
    singular: string;
    // Whether the long layout already writes the column's names, and the
    // kinds it writes for the column in words ("official, private or a
    // total"), null when it writes none.
    named: boolean;
    kinds: string | null;
    entries: ExtraColumn[];
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
    // The answer's bound entities: observationAbout's type, and each row's
    // example value.
    entities?: BoundEntity[] | null;
}): EnrichmentGroup[] => {
    if (!options) {
        return [];
    }

    const groups = new Map<string, EnrichmentGroup>();

    for (const entry of enrichmentChoices(options)) {
        let group = groups.get(entry.column);
        const dimension = dimensions?.find((candidate) => candidate.label === entry.column);
        const noun = dimension?.noun ?? null;

        if (!group) {
            const heading = roleHeading({ column: entry.column, dimensions, entities });

            group = {
                column: entry.column,
                heading,
                singular: heading.toLowerCase(),
                named: longLayoutWrites(options, { column: entry.column, suffix: 'label' }),
                kinds: longLayoutWrites(options, { column: entry.column, suffix: 'kind' })
                    ? (KIND_EXAMPLES[dimension?.axis ?? ''] ?? SHARED_KINDS)
                    : null,
                entries: [],
            };
            groups.set(entry.column, group);
        }

        // A flow role's entity carries its axis as its role (origin).
        const role = dimension?.axis ?? entry.column;
        const bound = entities?.filter((entity) => entity.role === role) ?? [];

        group.entries.push(extraColumn(entry, { bound, noun }));
    }

    return [...groups.values()];
};

/** What the long layout already writes for the roles that offer extras, so
 *  the viewer sees why names and kinds are not on the list: "The file already
 *  names each provider and says what kind each is, such as official, private
 *  or a total". Each role's kinds are its own, and roles that share them share
 *  one clause: "names each provider and recipient, and says what kind each
 *  provider is, such as …, and what kind each recipient is, such as …". Null
 *  when it writes neither. */
export const inFileNote = (groups: readonly EnrichmentGroup[]): string | null => {
    const list = (roles: string[]) =>
        new Intl.ListFormat('en-GB', { type: 'conjunction' }).format(roles);
    const named = groups.filter((group) => group.named).map((group) => group.singular);
    // The roles under each kinds text, in wire order.
    const byKinds = new Map<string, EnrichmentGroup[]>();

    for (const group of groups) {
        if (group.kinds !== null) {
            byKinds.set(group.kinds, [...(byKinds.get(group.kinds) ?? []), group]);
        }
    }

    const kinded = [...byKinds.values()].flat();

    if (kinded.length === 0) {
        return named.length ? `The file already names each ${list(named)}.` : null;
    }

    // Every named role has the same kinds, so one short clause covers them.
    if (
        byKinds.size === 1 &&
        kinded.length === named.length &&
        kinded.every((group) => group.named)
    ) {
        return `The file already names each ${list(named)} and says what kind each is, such as ${kinded[0]?.kinds}.`;
    }

    const kindClauses = [...byKinds].map(
        ([kinds, roles]) =>
            `what kind each ${list(roles.map((group) => group.singular))} is, such as ${kinds}`,
    );
    const says = `says ${kindClauses.join(', and ')}`;

    return named.length
        ? `The file already names each ${list(named)}, and ${says}.`
        : `The file already ${says}.`;
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
    entities?: BoundEntity[] | null;
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

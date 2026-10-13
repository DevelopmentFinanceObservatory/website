/**
 * A card's description, as the platform stores it in the card payload's
 * `description`: the reader's five questions in five blocks (`about`,
 * `sources`, `freshness`, `steps`, `cite`), with `caveats`, `gaps` and
 * `built_from` beside them. A live render adds `rendering: "live"` and the
 * frame it drew on. The types mirror dfo-spec-kit's
 * `dfo_descriptions/schemas/description.schema.json`.
 *
 * A member that may be `null` reads two ways: `null` with its dotted path in
 * `gaps` is unknown, and `null` with no gap is one the data declares none
 * of. An absent member is one the description does not speak to.
 *
 * `readDescription` reads an untyped payload member into these types. It
 * refuses a value missing a required block or holding a rendering without
 * its frame, and says why. A list holding a malformed entry does not read:
 * a required list refuses the description, and an optional one is left
 * out, as is a drawn dimension's `values` whose length or refs disagree
 * with its `count`. A list is never compacted, so the gap paths that name its entries by
 * position (`sources.1.licence`) still address them. The panel never
 * renders a shape it does not know.
 */

import { asRecord } from '../asRecord.ts';

export type Ref = { ref: string; label: string; at_mint?: true };

/** A reference with the definition of what it names, absent when the graph
 *  holds none. */
export type DefinedRef = Ref & { definition?: string };

/** A computed version's input. Its `id` is `null` when the input's version
 *  is known by content version and label alone. */
export type InputRef = {
    id: string | null;
    content_version: string;
    label: string;
    at_mint?: true;
};

/** A unit by dcid (`ref`), by ISO 4217 code (`currency`), or both, with
 *  its price basis and, for constant prices, the base year. */
export type SimpleUnit = {
    ref?: string;
    currency?: string;
    label: string;
    at_mint?: true;
    prices?: string;
    base_year?: number;
};

/** A composed unit's side that counts a variable, such as the population in
 *  a per-capita denominator. */
export type VariableSide = { stat_var: string; label: string; at_mint?: true };

export type UnitSide = SimpleUnit | VariableSide;

export type ComposedUnit = { numerator: UnitSide; denominator: UnitSide };

export type DescriptionUnit = SimpleUnit | ComposedUnit;

export type Span = { start: string; end: string; grain?: string };

export type Version = { id: string; content_version: string };

export type Describes =
    | { kind: 'dataset_version' | 'computed_version'; id: string; content_version: string }
    | { kind: 'card_revision'; component_id: string; revision: number };

export type Measure = { ref?: string; label: string; definition: string | null; at_mint?: true };

export type OpenDimension = {
    property: Ref;
    within?: Ref;
    count: number | null;
    partial?: true;
    undeclared_variables?: number;
    top?: { ref?: string; label: string; variables: number; at_mint?: true }[];
    more?: number;
    values?: string;
};

/** What a card draws against what its version holds. A dimension lists the
 *  values the card draws (`values`) only when it lists every one, as `count`
 *  entries with distinct refs. The reader leaves out a list that does not. */
export type Drawn = {
    dimensions?: { property: Ref; count: number; of: number; values?: DefinedRef[] }[];
    series?: number;
    period?: Span;
};

export type About = {
    name?: string | null;
    measure?: Measure | null;
    fixed?: { property: Ref; value: DefinedRef }[];
    varies?: OpenDimension[];
    variables?: { admitted_at_mint: number | null; with_data: number | null };
    series?: number | null;
    period?: Span | null;
    unit?: DescriptionUnit | null;
    drawn?: Drawn;
};

/** A source used, or a computed version's input. Publisher and licence are
 *  as recorded at mint. `documentation` is the API route of the source's
 *  document. An input whose id is unknown has a `null` ref. */
export type DescriptionSource = {
    ref: string | null;
    label: string;
    at_mint?: true;
    publisher?: string | null;
    licence?: string | null;
    series?: number | null;
    content_version?: string;
    documentation?: string;
    description?: string;
};

export type DescriptionFreshness = {
    prepared?: string;
    computed?: string;
    latest_period?: string | null;
    series_reaching_it?: number | null;
    source_release?: string | null;
    source_downloaded_at_mint?: string | null;
    source_downloaded_since?: string | null;
    next_release?: string | null;
    estimated_values?: number | null;
    provisional_values?: number | null;
    inputs?: InputRef[];
};

/** A step as served: its record, which the panel does not read, and the
 *  composer's sentence for it. */
export type ServedStep = { id: string; op: string; text: string };

/** A fact about the data, naming what it applies to, with the composer's
 *  sentence for it. The panel shows every caveat by its `text`, whatever
 *  its kind; the card face reads the kind to keep the ones that say what
 *  the data leaves out (`leftOutOf`). */
export type Caveat = {
    kind: string;
    text: string;
    series?: Ref[];
    entities?: Ref[];
    periods?: string[];
    step?: string;
    count?: number;
};

export type Cite = {
    title: string;
    text: string;
    id?: string;
    content_version?: string;
    retrieved?: string;
    data?: string;
    component_id?: string;
    revision?: number;
    inputs?: InputRef[];
};

export type Description = {
    describes: Describes;
    title: string;
    about: About;
    sources: DescriptionSource[];
    freshness: DescriptionFreshness;
    steps: ServedStep[] | null;
    cite: Cite;
    caveats: Caveat[];
    gaps: string[];
    built_from: { facts_schema: number; vocabulary: string };
    rendering?: 'live';
    frame?: Version;
};

type UnknownRecord = Record<string, unknown>;

// Reads a value, or reports it malformed.
type Reader<T> = (value: unknown) => T | undefined;

const asText: Reader<string> = (value) =>
    typeof value === 'string' && value.length > 0 ? value : undefined;

const asCount: Reader<number> = (value) =>
    typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : undefined;

const asAtMint = (record: UnknownRecord): { at_mint?: true } =>
    record['at_mint'] === true ? { at_mint: true } : {};

// The member under `key` when it reads, else nothing: an absent or
// malformed optional member leaves the key out.
const optional = <K extends string, T>(
    record: UnknownRecord,
    key: K,
    read: Reader<T>,
): { [P in K]?: T } => {
    const value = read(record[key]);

    // A computed key widens to an index signature; it is exactly `key`.
    return value === undefined ? {} : ({ [key]: value } as { [P in K]?: T });
};

// A nullable member keeps its `null`, which the panel reads against `gaps`.
const orNull =
    <T>(read: Reader<T>): Reader<T | null> =>
    (value) =>
        value === null ? null : read(value);

// A list whose every entry reads; undefined when the value is no list or
// an entry is malformed.
const listOf =
    <T>(read: Reader<T>): Reader<T[]> =>
    (value) => {
        if (!Array.isArray(value)) {
            return undefined;
        }

        const items = value.map(read);

        return items.every((item): item is T => item !== undefined) ? items : undefined;
    };

const asRef: Reader<Ref> = (value) => {
    const record = asRecord(value);
    const ref = asText(record?.['ref']);
    const label = asText(record?.['label']);

    return record && ref && label ? { ref, label, ...asAtMint(record) } : undefined;
};

const asDefinedRef: Reader<DefinedRef> = (value) => {
    const record = asRecord(value);
    const ref = asRef(value);

    return record && ref ? { ...ref, ...optional(record, 'definition', asText) } : undefined;
};

const asVersion: Reader<Version> = (value) => {
    const record = asRecord(value);
    const id = asText(record?.['id']);
    const contentVersion = asText(record?.['content_version']);

    return id && contentVersion ? { id, content_version: contentVersion } : undefined;
};

const asInputRef: Reader<InputRef> = (value) => {
    const record = asRecord(value);
    const id = orNull(asText)(record?.['id']);
    const contentVersion = asText(record?.['content_version']);
    const label = asText(record?.['label']);

    return record && id !== undefined && contentVersion && label
        ? { id, content_version: contentVersion, label, ...asAtMint(record) }
        : undefined;
};

const asSimpleUnit: Reader<SimpleUnit> = (value) => {
    const record = asRecord(value);
    const label = asText(record?.['label']);

    if (!record || !label || !(asText(record['ref']) || asText(record['currency']))) {
        return undefined;
    }

    return {
        ...optional(record, 'ref', asText),
        ...optional(record, 'currency', asText),
        label,
        ...asAtMint(record),
        ...optional(record, 'prices', asText),
        ...optional(record, 'base_year', asCount),
    };
};

const asUnitSide: Reader<UnitSide> = (value) => {
    const record = asRecord(value);
    const statVar = asText(record?.['stat_var']);
    const label = asText(record?.['label']);

    if (record && 'stat_var' in record) {
        return statVar && label ? { stat_var: statVar, label, ...asAtMint(record) } : undefined;
    }

    return asSimpleUnit(value);
};

const asUnit: Reader<DescriptionUnit> = (value) => {
    const record = asRecord(value);

    if (record && ('numerator' in record || 'denominator' in record)) {
        const numerator = asUnitSide(record['numerator']);
        const denominator = asUnitSide(record['denominator']);

        return numerator && denominator ? { numerator, denominator } : undefined;
    }

    return asSimpleUnit(value);
};

const asSpan: Reader<Span> = (value) => {
    const record = asRecord(value);
    const start = asText(record?.['start']);
    const end = asText(record?.['end']);

    return record && start && end
        ? { start, end, ...optional(record, 'grain', asText) }
        : undefined;
};

const asDescribes: Reader<Describes> = (value) => {
    const record = asRecord(value);
    const kind = record?.['kind'];

    if (kind === 'card_revision') {
        const componentId = asText(record?.['component_id']);
        const revision = asCount(record?.['revision']);

        return componentId && revision !== undefined
            ? { kind, component_id: componentId, revision }
            : undefined;
    }

    const version = asVersion(value);

    return (kind === 'dataset_version' || kind === 'computed_version') && version
        ? { kind, ...version }
        : undefined;
};

const asMeasure: Reader<Measure> = (value) => {
    const record = asRecord(value);
    const label = asText(record?.['label']);
    const definition = orNull(asText)(record?.['definition']);

    return record && label && definition !== undefined
        ? { ...optional(record, 'ref', asText), label, definition, ...asAtMint(record) }
        : undefined;
};

const asFixed: Reader<{ property: Ref; value: DefinedRef }> = (value) => {
    const record = asRecord(value);
    const property = asRef(record?.['property']);
    const fixed = asDefinedRef(record?.['value']);

    return property && fixed ? { property, value: fixed } : undefined;
};

const asTopValue: Reader<NonNullable<OpenDimension['top']>[number]> = (value) => {
    const record = asRecord(value);
    const label = asText(record?.['label']);
    const variables = asCount(record?.['variables']);

    return record && label && variables !== undefined
        ? { ...optional(record, 'ref', asText), label, variables, ...asAtMint(record) }
        : undefined;
};

const asOpenDimension: Reader<OpenDimension> = (value) => {
    const record = asRecord(value);
    const property = asRef(record?.['property']);
    const count = orNull(asCount)(record?.['count']);

    if (!record || !property || count === undefined) {
        return undefined;
    }

    return {
        property,
        ...optional(record, 'within', asRef),
        count,
        ...(record['partial'] === true ? { partial: true as const } : {}),
        ...optional(record, 'undeclared_variables', asCount),
        ...optional(record, 'top', listOf(asTopValue)),
        ...optional(record, 'more', asCount),
        ...optional(record, 'values', asText),
    };
};

// A drawn dimension's values when they list every value it counts, as `count`
// entries with distinct refs. A list that disagrees with its count would
// show part of the values as all of them, so it does not read.
const valuesCounted =
    (count: number): Reader<DefinedRef[]> =>
    (value) => {
        const values = listOf(asDefinedRef)(value);

        return values?.length === count && new Set(values.map((entry) => entry.ref)).size === count
            ? values
            : undefined;
    };

const asDrawnDimension: Reader<NonNullable<Drawn['dimensions']>[number]> = (value) => {
    const record = asRecord(value);
    const property = asRef(record?.['property']);
    const count = asCount(record?.['count']);
    const of = asCount(record?.['of']);

    return record && property && count !== undefined && of !== undefined
        ? { property, count, of, ...optional(record, 'values', valuesCounted(count)) }
        : undefined;
};

const asDrawn: Reader<Drawn> = (value) => {
    const record = asRecord(value);

    return record
        ? {
              ...optional(record, 'dimensions', listOf(asDrawnDimension)),
              ...optional(record, 'series', asCount),
              ...optional(record, 'period', asSpan),
          }
        : undefined;
};

const asVariables: Reader<NonNullable<About['variables']>> = (value) => {
    const record = asRecord(value);
    const admitted = orNull(asCount)(record?.['admitted_at_mint']);
    const withData = orNull(asCount)(record?.['with_data']);

    return admitted !== undefined && withData !== undefined
        ? { admitted_at_mint: admitted, with_data: withData }
        : undefined;
};

const asAbout: Reader<About> = (value) => {
    const record = asRecord(value);

    return record
        ? {
              ...optional(record, 'name', orNull(asText)),
              ...optional(record, 'measure', orNull(asMeasure)),
              ...optional(record, 'fixed', listOf(asFixed)),
              ...optional(record, 'varies', listOf(asOpenDimension)),
              ...optional(record, 'variables', asVariables),
              ...optional(record, 'series', orNull(asCount)),
              ...optional(record, 'period', orNull(asSpan)),
              ...optional(record, 'unit', orNull(asUnit)),
              ...optional(record, 'drawn', asDrawn),
          }
        : undefined;
};

const asSource: Reader<DescriptionSource> = (value) => {
    const record = asRecord(value);
    const ref = orNull(asText)(record?.['ref']);
    const label = asText(record?.['label']);

    return record && ref !== undefined && label
        ? {
              ref,
              label,
              ...asAtMint(record),
              ...optional(record, 'publisher', orNull(asText)),
              ...optional(record, 'licence', orNull(asText)),
              ...optional(record, 'series', orNull(asCount)),
              ...optional(record, 'content_version', asText),
              ...optional(record, 'documentation', asText),
              ...optional(record, 'description', asText),
          }
        : undefined;
};

const asFreshness: Reader<DescriptionFreshness> = (value) => {
    const record = asRecord(value);

    return record
        ? {
              ...optional(record, 'prepared', asText),
              ...optional(record, 'computed', asText),
              ...optional(record, 'latest_period', orNull(asText)),
              ...optional(record, 'series_reaching_it', orNull(asCount)),
              ...optional(record, 'source_release', orNull(asText)),
              ...optional(record, 'source_downloaded_at_mint', orNull(asText)),
              ...optional(record, 'source_downloaded_since', orNull(asText)),
              ...optional(record, 'next_release', orNull(asText)),
              ...optional(record, 'estimated_values', orNull(asCount)),
              ...optional(record, 'provisional_values', orNull(asCount)),
              ...optional(record, 'inputs', listOf(asInputRef)),
          }
        : undefined;
};

const asStep: Reader<ServedStep> = (value) => {
    const record = asRecord(value);
    const id = asText(record?.['id']);
    const op = asText(record?.['op']);
    const text = asText(record?.['text']);

    return id && op && text ? { id, op, text } : undefined;
};

const asCaveat: Reader<Caveat> = (value) => {
    const record = asRecord(value);
    const kind = asText(record?.['kind']);
    const text = asText(record?.['text']);

    return record && kind && text
        ? {
              kind,
              text,
              ...optional(record, 'series', listOf(asRef)),
              ...optional(record, 'entities', listOf(asRef)),
              ...optional(record, 'periods', listOf(asText)),
              ...optional(record, 'step', asText),
              ...optional(record, 'count', asCount),
          }
        : undefined;
};

const asCite: Reader<Cite> = (value) => {
    const record = asRecord(value);
    const title = asText(record?.['title']);
    const text = asText(record?.['text']);

    return record && title && text
        ? {
              title,
              text,
              ...optional(record, 'id', asText),
              ...optional(record, 'content_version', asText),
              ...optional(record, 'retrieved', asText),
              ...optional(record, 'data', asText),
              ...optional(record, 'component_id', asText),
              ...optional(record, 'revision', asCount),
              ...optional(record, 'inputs', listOf(asInputRef)),
          }
        : undefined;
};

const asBuiltFrom: Reader<Description['built_from']> = (value) => {
    const record = asRecord(value);
    const factsSchema = asCount(record?.['facts_schema']);
    const vocabulary = asText(record?.['vocabulary']);

    return factsSchema !== undefined && vocabulary
        ? { facts_schema: factsSchema, vocabulary }
        : undefined;
};

type AllRead<T> = { [K in keyof T]: Exclude<T[K], undefined> };

// The blocks when every one reads, else the names of those that do not.
const allRead = <T extends Record<string, unknown>>(blocks: T): AllRead<T> | string[] => {
    const unread = Object.keys(blocks).filter((key) => blocks[key] === undefined);

    // Every value is defined, which is what `AllRead<T>` says.
    return unread.length > 0 ? unread : (blocks as AllRead<T>);
};

// A live rendering and its frame, which the schema requires together.
const asRendering = (record: UnknownRecord): { rendering?: 'live'; frame?: Version } | string => {
    const { rendering, frame } = record;

    if (rendering === undefined && frame === undefined) {
        return {};
    }

    if (rendering === undefined || frame === undefined) {
        return rendering === undefined ? 'frame without rendering' : 'rendering without frame';
    }

    const version = asVersion(frame);

    if (rendering !== 'live' || !version) {
        return 'rendering or frame unreadable';
    }

    return { rendering, frame: version };
};

/** A description read from an untyped value, or why it is refused: the
 *  required blocks that are missing or malformed, or a rendering without
 *  its frame. */
export const readDescription = (
    value: unknown,
): { description: Description } | { refused: string } => {
    const record = asRecord(value);

    if (!record) {
        return { refused: 'not an object' };
    }

    const blocks = allRead({
        describes: asDescribes(record['describes']),
        title: asText(record['title']),
        about: asAbout(record['about']),
        sources: listOf(asSource)(record['sources']),
        freshness: asFreshness(record['freshness']),
        steps: orNull(listOf(asStep))(record['steps']),
        cite: asCite(record['cite']),
        caveats: listOf(asCaveat)(record['caveats']),
        gaps: listOf(asText)(record['gaps']),
        built_from: asBuiltFrom(record['built_from']),
    });

    if (Array.isArray(blocks)) {
        return { refused: `unreadable ${blocks.join(', ')}` };
    }

    const rendering = asRendering(record);

    if (typeof rendering === 'string') {
        return { refused: rendering };
    }

    return { description: { ...blocks, ...rendering } };
};

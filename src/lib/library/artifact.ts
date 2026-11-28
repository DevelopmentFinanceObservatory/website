/**
 * A Library artifact as its pages read it, and the list's filters. Pure, so
 * the client list and the server pages share it (the rows are read in
 * ./store.ts).
 *
 * A reader narrows the list by text (`?q=`, matched against the title, the
 * description, the topics and the sources) and by four filters, each any
 * number of values: type (`?type=`), topic (`?topic=`), source
 * (`?source=`) and status (`?status=`). An artifact shows when it holds the
 * text and, for each filter with values picked, one of them.
 */

import type { LibraryCardDates, LibrarySource, LibraryStep } from '../../../db/schema.ts';

export type { LibraryCardDates, LibrarySource, LibraryStep };

/** The kinds an artifact can have. The check constraint on
 *  `library_artifact.kind` holds the same values. */
export const ARTIFACT_KINDS = ['chart', 'table', 'key_number', 'canvas', 'data'] as const;

export type ArtifactKind = (typeof ARTIFACT_KINDS)[number];

export const isArtifactKind = (value: unknown): value is ArtifactKind =>
    (ARTIFACT_KINDS as readonly unknown[]).includes(value);

export type ArtifactMode = 'live' | 'snapshot';

export type LibraryArtifact = {
    id: string;
    slug: string;
    shareId: string;
    kind: ArtifactKind;
    mode: ArtifactMode;
    title: string;
    description: string;
    contentTitle: string | null;
    content: string | null;
    sources: LibrarySource[];
    steps: LibraryStep[];
    topics: string[];
    /** Each published card's data dates as they were at publish, in card
     *  order. */
    cardDates: LibraryCardDates[];
    /** ISO 8601. */
    publishedAt: string;
    /** ISO 8601. The last change to the text or topics, or `publishedAt`
     *  when there was none. */
    updatedAt: string;
    /** The edit the text and topics are at, which an edit sends back. */
    revision: number;
};

/** An artifact a withdrawn one's address links to. */
export type Replacement = { slug: string; title: string };

/** What the address of a withdrawn artifact shows. */
export type WithdrawnArtifact = {
    /** For an admin's replacement picker alone. */
    id: string;
    slug: string;
    kind: ArtifactKind;
    /** ISO 8601. */
    publishedAt: string;
    /** ISO 8601. */
    withdrawnAt: string;
    /** The artifact it names as its replacement, for an admin's picker. */
    replacedBy: string | null;
    /** The first published artifact down its chain of replacements, or null
     *  when none was named or none in the chain is published. */
    replacement: Replacement | null;
};

/** A published artifact an admin can name as a withdrawn one's
 *  replacement. */
export type ReplacementChoice = { id: string; title: string };

/** Each kind's name, in the order the type filter lists them. */
export const KIND_LABELS: Record<ArtifactKind, string> = {
    chart: 'Chart',
    table: 'Table',
    key_number: 'Key number',
    canvas: 'Canvas',
    data: 'Data',
};

/** The kind's name, as labels, filters and citations print it. */
export const kindLabel = (kind: ArtifactKind): string => KIND_LABELS[kind];

export const MODE_LABELS: Record<ArtifactMode, string> = {
    live: 'Live',
    snapshot: 'Snapshot',
};

export type LibraryFilters = {
    q: string;
    types: readonly string[];
    topics: readonly string[];
    sources: readonly string[];
    statuses: readonly string[];
};

const fold = (text: string): string => text.trim().toLowerCase().replace(/\s+/g, ' ');

/** Whether the artifact's title, description, topics or sources hold the
 *  query. An empty query matches every artifact. */
export const matchesText = (artifact: LibraryArtifact, q: string): boolean => {
    const needle = fold(q);

    return (
        needle === '' ||
        [
            artifact.title,
            artifact.description,
            ...artifact.topics,
            ...artifact.sources.map((source) => source.name),
        ].some((text) => fold(text).includes(needle))
    );
};

const anyOf = (picked: readonly string[], values: readonly string[]): boolean =>
    picked.length === 0 || values.some((value) => picked.includes(value));

/** The artifacts the filters admit, in the order given. */
export const filterArtifacts = (
    artifacts: readonly LibraryArtifact[],
    { q, types, topics, sources, statuses }: LibraryFilters,
): LibraryArtifact[] =>
    artifacts.filter(
        (artifact) =>
            anyOf(types, [artifact.kind]) &&
            anyOf(topics, artifact.topics) &&
            anyOf(
                sources,
                artifact.sources.map((source) => source.name),
            ) &&
            anyOf(statuses, [artifact.mode]) &&
            matchesText(artifact, q),
    );

export type FilterOption = { value: string; label: string; count: number };

const collate = (a: string, b: string) => a.localeCompare(b, 'en');

// Each value once, with how many artifacts carry it, by name.
const optionsOf = (
    artifacts: readonly LibraryArtifact[],
    valuesOf: (artifact: LibraryArtifact) => readonly string[],
): FilterOption[] => {
    const counts = new Map<string, number>();

    for (const artifact of artifacts) {
        for (const value of new Set(valuesOf(artifact))) {
            counts.set(value, (counts.get(value) ?? 0) + 1);
        }
    }

    return [...counts]
        .map(([value, count]) => ({ value, label: value, count }))
        .sort((a, b) => collate(a.label, b.label));
};

// A value's name in `labels`, or the value itself when `labels` lacks it.
const labelIn =
    (labels: Readonly<Record<string, string>>) =>
    (value: string): string =>
        Object.hasOwn(labels, value) ? labels[value] : value;

// `options`, then each picked value they lack with a count of 0, so a pick
// a stale link carries can be unticked.
const withPicked = (
    options: FilterOption[],
    picked: readonly string[],
    labelOf: (value: string) => string,
): FilterOption[] => [
    ...options,
    ...picked
        .filter((value) => !options.some((option) => option.value === value))
        .map((value) => ({ value, label: labelOf(value), count: 0 })),
];

const NO_PICKS: Omit<LibraryFilters, 'q'> = { types: [], topics: [], sources: [], statuses: [] };

/** The values each filter offers, from the artifacts there are, then each
 *  value in `picked` no artifact carries, under its name and with a count
 *  of 0. Types and statuses keep their fixed order. */
export const filterOptions = (
    artifacts: readonly LibraryArtifact[],
    picked: Omit<LibraryFilters, 'q'> = NO_PICKS,
) => {
    const fixed = <K extends string>(labels: Record<K, string>, pick: (a: LibraryArtifact) => K) =>
        (Object.keys(labels) as K[])
            .map((value) => ({
                value,
                label: labels[value],
                count: artifacts.filter((artifact) => pick(artifact) === value).length,
            }))
            .filter((option) => option.count > 0);
    const asIs = (value: string) => value;

    return {
        types: withPicked(
            fixed(KIND_LABELS, (artifact) => artifact.kind),
            picked.types,
            labelIn(KIND_LABELS),
        ),
        topics: withPicked(
            optionsOf(artifacts, (artifact) => artifact.topics),
            picked.topics,
            asIs,
        ),
        sources: withPicked(
            optionsOf(artifacts, (artifact) => artifact.sources.map((source) => source.name)),
            picked.sources,
            asIs,
        ),
        statuses: withPicked(
            fixed(MODE_LABELS, (artifact) => artifact.mode),
            picked.statuses,
            labelIn(MODE_LABELS),
        ),
    };
};

// A list param joins its values with a bar, since source names hold commas.
const SEPARATOR = '|';

/** A `?type=`-style param as the values it names, each once. */
export const parseList = (raw: string | null): string[] =>
    [...new Set((raw ?? '').split(SEPARATOR))].filter(Boolean);

/** Values as a list param, or null with none. */
export const serializeList = (values: readonly string[]): string | null =>
    values.length > 0 ? values.join(SEPARATOR) : null;

/** The artifact's page, the citable URL. */
export const artifactPath = (slug: string): string => `/library/${slug}`;

/** The author every Library page and citation names. */
export const LIBRARY_AUTHOR = 'Development Finance Observatory';

const DATE = new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
});

/** A moment as the Library prints it, as a UTC day: "12 December 2026". */
export const libraryDate = (moment: string | Date): string => DATE.format(new Date(moment));

/** Whether the text was changed after publication. */
export const textUpdated = (artifact: Pick<LibraryArtifact, 'publishedAt' | 'updatedAt'>) =>
    new Date(artifact.updatedAt).getTime() > new Date(artifact.publishedAt).getTime();

/**
 * The reference a reader copies: "Development Finance Observatory (2026).
 * Health ODA to Ethiopia, 2016–2024 [Chart]. DFO Library. <url> (Accessed:
 * 27 January 2026). Data: OECD CRS, World Bank IDS."
 */
export const citation = (artifact: LibraryArtifact, origin: string, accessed: Date): string => {
    const year = new Date(artifact.publishedAt).getUTCFullYear();
    const data = artifact.sources.map((source) => source.name).join(', ');

    return [
        `${LIBRARY_AUTHOR} (${year}). ${artifact.title} [${kindLabel(artifact.kind)}]. DFO Library.`,
        `${origin}${artifactPath(artifact.slug)}`,
        `(Accessed: ${libraryDate(accessed)}).${data ? ` Data: ${data}.` : ''}`,
    ].join(' ');
};

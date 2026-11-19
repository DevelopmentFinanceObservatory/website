/**
 * A seed for a new dataset, in dfo-pipelines' minimal layout: one row per
 * source code, the identity columns, one snake_case column per constraint
 * property, `unit`, `measurement_method` and `measurement_denominator`. The
 * columns come from an existing dataset's patterns, the rows from pasted
 * codes.
 *
 * - The constraint columns are the union over the dataset's patterns, in the
 *   order the patterns first name them. A reader drops or adds columns.
 * - Cells are pre-filled only when the patterns' StatVar counts sum to the
 *   dataset's own count, so every StatVar of the dataset follows a listed
 *   pattern. The usage document can list patterns for part of a dataset
 *   (OECD DAC1's cover 554 of its 653 StatVars), and then nothing fills.
 * - An identity column (population type, measured property, stat type,
 *   measurement qualifier, measurement denominator) is pre-filled, as a
 *   `dcid:` cell, when every pattern carries it with the same value. A
 *   dataset that spans several values leaves the column empty.
 * - A constraint column is pre-filled the same way when every pattern
 *   carries the property and one value is held by every StatVar of the
 *   dataset (DAC2A's `financial_flow_type` is `dcid:Disbursement`). Other
 *   constraint cells, `unit`, `measurement_method` and `statvar_name` start
 *   empty. A pasted label fills `statvar_name`.
 * - The CSV writes cells verbatim, RFC 4180 quoting only. A seed is read by
 *   dbt, so a leading `=`, `+`, `-` or `@` stays as written, and formulaRows
 *   names the rows a spreadsheet would run as a formula.
 * - The query holds `dataset`, `drop` (the dropped constraint properties) and
 *   `add` (the added ones), each a comma-separated list of dcids, with the
 *   carried parameters (explore.ts). A query with no `drop` takes the
 *   dataset's default (defaultDrops); an empty `drop=` drops nothing.
 */
import {
    queryString,
    queryValue,
    writeCarried,
    type Carried,
    type QueryReader,
} from './explore.ts';
import { scan } from './delimited.ts';
import { listHead, type ListHead } from './lists.ts';
import { SEED_PATH } from './paths.ts';
import { patternGroups } from './sentence.ts';
import { toCsv } from './sheet.ts';
import type { ProvenanceUsage, SchemaPattern } from './wire.ts';

/** The dataset's StatVar count, patterns and constraint values a seed's columns are read from. */
export type SeedSource = Pick<ProvenanceUsage, 'stat_var_count' | 'patterns' | 'constraint_values'>;

/** The dataset a seed copies: its id, label, StatVar count, patterns and constraint values. */
export type SeedDataset = SeedSource & { readonly id: string; readonly label: string };

/** The identity fields of a pattern that become columns of the same name. */
type IdentityName =
    | 'population_type'
    | 'measured_property'
    | 'stat_type'
    | 'measurement_qualifier'
    | 'measurement_denominator';

/** A column of the seed. `property` names the constraint property of a constraint column. */
export type SeedColumn = {
    readonly name: string;
    readonly kind: 'reference' | 'identity' | 'constraint' | 'extra';
    readonly property: string | null;
    /** The cell every row starts with. */
    readonly fill: string;
    readonly description: string;
};

/** The columns a reader changed, as constraint properties dropped from or added to the dataset's. */
export type SeedChoice = {
    readonly dropped: readonly string[];
    readonly added: readonly string[];
};

export const NO_SEED_CHOICE: SeedChoice = Object.freeze({ dropped: [], added: [] });

/**
 * A property dcid as a seed column name, splitting before each capital that
 * follows a lower-case letter or digit and before the last capital of a run:
 * `dac2aAidType` is `dac2a_aid_type`, `includesIMFCredit` is
 * `includes_imf_credit`. Reading a seed header back to its property uses the
 * same rule (pasted.ts).
 */
export const columnName = (property: string): string =>
    property.replace(/(?<=[a-z0-9])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])/g, '_').toLowerCase();

/** The constraint properties the dataset's patterns name, each once, in first-named order. */
export const datasetConstraints = (dataset: Pick<SeedDataset, 'patterns'>): readonly string[] => [
    ...new Set(dataset.patterns.flatMap((pattern) => pattern.constraint_properties)),
];

/**
 * The dataset's constraint properties that a split combination leaves out,
 * in first-named order: the `drop` list that seeds a table with the
 * combination's columns only.
 */
export const dropsOutside = (
    dataset: Pick<SeedDataset, 'patterns'>,
    split: readonly string[],
): readonly string[] => {
    const kept = new Set(split);
    return datasetConstraints(dataset).filter((property) => !kept.has(property));
};

/**
 * The dataset's constraint properties by the StatVars of the patterns that
 * name each, most first, ties in first-named order.
 */
export const constraintsByShare = (dataset: Pick<SeedDataset, 'patterns'>): readonly string[] => {
    const share = new Map<string, number>();
    for (const pattern of dataset.patterns) {
        for (const property of pattern.constraint_properties) {
            share.set(property, (share.get(property) ?? 0) + pattern.stat_var_count);
        }
    }
    return datasetConstraints(dataset).toSorted(
        (a, b) => (share.get(b) ?? 0) - (share.get(a) ?? 0),
    );
};

/**
 * The dataset's constraint tick boxes on show, as constraintsByShare orders
 * them: the head, plus every ticked box (one not in `dropped`) past it, or
 * every box when `open`. A list whose head and ticked boxes already hold
 * every box reads as short, so it offers no "All N".
 */
export const constraintBoxes = (
    dataset: Pick<SeedDataset, 'patterns'>,
    { dropped, open }: { dropped: readonly string[]; open: boolean },
): ListHead<string> => {
    const ordered = constraintsByShare(dataset);
    const unticked = new Set(dropped);
    const closed = listHead(ordered, { open: false, keep: (property) => !unticked.has(property) });
    if (closed.shown.length === ordered.length) return { ...closed, long: false };
    return open ? listHead(ordered, { open: true }) : closed;
};

/**
 * The most constraint properties a dataset's seed starts with all of. Past
 * it, a column for every property the patterns name (WHO's 96) gives a
 * table no single source fills, so the seed starts with one combination's.
 */
export const ALL_CONSTRAINTS_UP_TO = 12;

/**
 * The constraint properties a seed drops when the URL names none: nothing
 * for a dataset with at most ALL_CONSTRAINTS_UP_TO, else every one outside
 * its largest split combination (patternGroups' first).
 */
export const defaultDrops = (dataset: Pick<SeedDataset, 'patterns'>): readonly string[] => {
    if (datasetConstraints(dataset).length <= ALL_CONSTRAINTS_UP_TO) return [];
    const [largest] = patternGroups(dataset.patterns);
    return largest === undefined ? [] : dropsOutside(dataset, largest.split);
};

/** The constraint properties the seed holds: the dataset's, minus dropped, plus added. */
export const activeConstraints = (
    dataset: Pick<SeedDataset, 'patterns'>,
    choice: SeedChoice = NO_SEED_CHOICE,
): readonly string[] => {
    const dropped = new Set(choice.dropped);
    return [...new Set([...datasetConstraints(dataset), ...choice.added])].filter(
        (property) => !dropped.has(property),
    );
};

/**
 * The value every pattern gives a field, as a `dcid:` cell, or '' when a
 * pattern has none or the patterns differ.
 */
const sharedValue = (patterns: readonly SchemaPattern[], field: keyof SchemaPattern): string => {
    const values = new Set(patterns.map((pattern) => pattern[field]));
    if (values.size !== 1) return '';
    const [value] = values;
    return typeof value === 'string' && value !== '' ? `dcid:${value}` : '';
};

const IDENTITY_DESCRIPTIONS: Readonly<Record<IdentityName, string>> = {
    population_type: 'The class the StatVar counts, as a dcid: node id.',
    measured_property: 'The property the StatVar measures, as a dcid: node id.',
    stat_type: 'How the value is read (for example measuredValue), as a dcid: node id.',
    measurement_qualifier:
        'The qualifier of the measurement (for example Nominal), as a dcid: node id.',
    measurement_denominator:
        'The StatVar this one is a ratio of, as a dcid: node id. Empty for none.',
};

/** Whether the patterns' StatVar counts sum to the dataset's, so every StatVar follows a listed pattern. */
const patternsCover = (dataset: SeedSource): boolean =>
    dataset.patterns.reduce((sum, pattern) => sum + pattern.stat_var_count, 0) ===
    dataset.stat_var_count;

/**
 * The one value every StatVar of the dataset gives a constraint property, as
 * a `dcid:` cell, or ''. The value fills only when every pattern carries the
 * property, the dataset's constraint values hold that one value, and its
 * StatVar count equals the dataset's, so no StatVar is left unknown.
 */
const sharedConstraint = (dataset: SeedSource, property: string): string => {
    if (!dataset.patterns.every((pattern) => pattern.constraint_properties.includes(property))) {
        return '';
    }
    const values = dataset.constraint_values.find((entry) => entry.property === property)?.values;
    const [only] = values?.length === 1 ? values : [];
    return only !== undefined && only.stat_var_count === dataset.stat_var_count
        ? `dcid:${only.value}`
        : '';
};

/** The columns of a seed for a dataset, in the minimal layout. */
export function seedColumns(
    dataset: SeedSource,
    choice: SeedChoice = NO_SEED_CHOICE,
): readonly SeedColumn[] {
    const covered = patternsCover(dataset);
    const column = (
        name: string,
        kind: SeedColumn['kind'],
        description: string,
        fill = '',
        property: string | null = null,
    ): SeedColumn => Object.freeze({ name, kind, property, fill, description });
    const identity = (name: IdentityName): SeedColumn =>
        column(
            name,
            'identity',
            IDENTITY_DESCRIPTIONS[name],
            covered ? sharedValue(dataset.patterns, name) : '',
        );
    const constraint = (property: string): SeedColumn =>
        column(
            columnName(property),
            'constraint',
            `The value of the constraint property ${property}, as a dcid: node id. Empty for no constraint.`,
            covered ? sharedConstraint(dataset, property) : '',
            property,
        );
    return Object.freeze([
        column('source_code', 'reference', "The source's own code for the row."),
        column('statvar_name', 'reference', 'The name of the StatVar, from the source label.'),
        identity('population_type'),
        identity('measured_property'),
        identity('stat_type'),
        identity('measurement_qualifier'),
        ...activeConstraints(dataset, choice).map(constraint),
        column('unit', 'extra', 'The unit of the value. Empty for none.'),
        column(
            'measurement_method',
            'extra',
            'How the value was measured (for example Modelled), as a dcid: node id. Empty for none.',
        ),
        identity('measurement_denominator'),
    ]);
}

/** The seed's rows, and how many pasted lines repeated an earlier code and were merged into its row. */
export type SeedRows = {
    readonly rows: readonly (readonly string[])[];
    readonly merged: number;
};

/**
 * The rows pasted codes make, one per code. Each non-blank line gives a code
 * (its first tab-separated cell) and a label (its second), read with the
 * quotes a spreadsheet puts around a cell that holds a line break or a
 * quote. A code repeated on a later line is merged into its first row, which
 * takes the first label any of its lines give. Every other cell is the
 * column's fill.
 */
export function seedRows(columns: readonly SeedColumn[], pasted: string): SeedRows {
    const labels = new Map<string, string>();
    let merged = 0;
    for (const [first = '', second = ''] of scan(pasted, '\t').records) {
        const code = first.trim();
        if (code === '') continue;
        const label = second.trim();
        const held = labels.get(code);
        if (held !== undefined) merged += 1;
        if (held === undefined || held === '') labels.set(code, label);
    }
    const rows = [...labels].map(([code, label]) =>
        columns.map((column) => {
            if (column.name === 'source_code') return code;
            if (column.name === 'statvar_name') return label;
            return column.fill;
        }),
    );
    return { rows, merged };
}

/** The seed as CSV: a header row, then the rows, lines ending CRLF, cells verbatim. */
export const seedCsv = (
    columns: readonly SeedColumn[],
    rows: readonly (readonly string[])[],
): string => toCsv([columns.map((column) => column.name), ...rows], { verbatim: true });

/**
 * The indexes of the rows whose code or label starts with `=`, `+`, `-` or
 * `@`, which a spreadsheet opening the CSV may run as a formula.
 */
export const formulaRows = (rows: readonly (readonly string[])[]): number[] =>
    rows.flatMap((row, index) =>
        row.slice(0, 2).some((cell) => /^[=+\-@]/.test(cell)) ? [index] : [],
    );

/** The name a new seed's file and `seeds.yml` entry take until the author renames them. */
export const NEW_SEED_NAME = 'new_indicator_mapping';

/**
 * The `seeds.yml` entry for a seed: every column a string, with a
 * description, and `source_code` tested unique and not null. The identity
 * columns carry no test, since a row that reuses a StatVar defined
 * elsewhere leaves them empty.
 */
export function seedsYml(name: string, columns: readonly SeedColumn[]): string {
    const lines = [
        'version: 2',
        '',
        'seeds:',
        `  - name: ${name}`,
        '    config:',
        '      column_types:',
        ...columns.map((column) => `        ${column.name}: string`),
        '    columns:',
    ];
    for (const column of columns) {
        lines.push(
            `      - name: ${column.name}`,
            `        description: ${JSON.stringify(column.description)}`,
        );
        if (column.name === 'source_code') {
            lines.push('        data_tests:', '          - unique', '          - not_null');
        }
    }
    return `${lines.join('\n')}\n`;
}

/**
 * The page state as the URL holds it. `dropped` is null when the URL names
 * no drop list, so the dataset's default applies (defaultDrops).
 */
export type SeedQuery = {
    readonly dataset: string | null;
    readonly dropped: readonly string[] | null;
    readonly added: readonly string[];
};

export const NO_SEED_QUERY: SeedQuery = Object.freeze({ dataset: null, dropped: null, added: [] });

const readList = (params: QueryReader, name: string): readonly string[] => [
    ...new Set((queryValue(params, name) ?? '').split(',').filter((id) => id !== '')),
];

/** The page state a query string holds. */
export const readSeedQuery = (params: QueryReader): SeedQuery => ({
    dataset: queryValue(params, 'dataset'),
    dropped: params.get('drop') === null ? null : readList(params, 'drop'),
    added: readList(params, 'add'),
});

/** The query string for a page state and the carried parameters, `?` included, or '' when nothing is set. */
export const seedQuery = (query: SeedQuery, carried: Carried): string => {
    const params = new URLSearchParams();
    if (query.dataset !== null) params.set('dataset', query.dataset);
    if (query.dropped !== null) params.set('drop', query.dropped.join(','));
    if (query.added.length > 0) params.set('add', query.added.join(','));
    writeCarried(params, carried);
    return queryString(params);
};

/** The Seed a dataset address for a page state and the carried parameters. */
export const seedHref = (query: Partial<SeedQuery>, carried: Carried): string =>
    `${SEED_PATH}${seedQuery({ ...NO_SEED_QUERY, ...query }, carried)}`;

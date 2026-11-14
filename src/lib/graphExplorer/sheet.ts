/**
 * The columns of a mapping sheet for a new dataset, the sheet draft the
 * Start a sheet page shows and exports, the closest existing dataset
 * pattern to copy, and CSV output.
 */
import type { SheetRequest } from './googleSheet.ts';
import type { Model } from './model.ts';
import type { OntologyPattern } from './wire.ts';

/** A reference column carries the source's own identifiers; a definition field is part of the StatVar definition; a property column holds one constraint property. */
export type ColumnKind = 'reference' | 'definition' | 'property';

/** One member of a value list as a sheet lookup offers it. */
export type LookupMember = {
    readonly id: string;
    readonly label: string;
    /** The member's classification code, when it has one. */
    readonly code: string | null;
};

/** The value list behind a property column. */
export type Lookup = {
    readonly valueList: string;
    readonly members: readonly LookupMember[];
    /** False when the graph holds members of the value list that `members` leaves out. */
    readonly complete: boolean;
};

export type SheetColumn = {
    readonly name: string;
    readonly kind: ColumnKind;
    /** The value a pattern supplies for the column; null when there is none. */
    readonly fill: string | null;
    /** Set on a property whose range names a value list. */
    readonly lookup: Lookup | null;
};

export type SheetSpec = {
    readonly classId: string | null;
    readonly measuredProperty: string;
    readonly statType: string | null;
    readonly qualifier: string | null;
    /** The constraint properties to give a column each. */
    readonly properties: readonly string[];
};

const REFERENCE_COLUMNS = ['source_code', 'source_label'] as const;

const lookupOf = (model: Model, property: string): Lookup | null => {
    const valueList = model.valueListOfProperty(property);
    if (valueList === undefined) return null;
    const members = model.members(valueList).map((id): LookupMember =>
        Object.freeze({
            id,
            label: model.label(id),
            code: model.node(id)?.classification_code[0] ?? null,
        }),
    );
    return Object.freeze({
        valueList,
        members: Object.freeze(members),
        complete: model.membersComplete(valueList),
    });
};

/** The ordered columns of a mapping sheet. */
export function sheetColumns(model: Model, spec: SheetSpec): readonly SheetColumn[] {
    const column = (
        name: string,
        kind: ColumnKind,
        fill: string | null,
        lookup: Lookup | null = null,
    ): SheetColumn => Object.freeze({ name, kind, fill, lookup });
    return Object.freeze([
        ...REFERENCE_COLUMNS.map((name) => column(name, 'reference', null)),
        column('populationType', 'definition', spec.classId),
        column('measuredProperty', 'definition', spec.measuredProperty),
        column('statType', 'definition', spec.statType),
        column('measurementQualifier', 'definition', spec.qualifier),
        ...spec.properties.map((property) =>
            column(property, 'property', null, lookupOf(model, property)),
        ),
    ]);
}

export type ClosestPattern = {
    readonly dataset: string;
    readonly pattern: OntologyPattern;
    /** How many of the chosen properties the pattern splits by. */
    readonly shared: number;
};

/**
 * The pattern about the class that splits by the most of the chosen
 * properties; the larger StatVar count wins a tie, then the earlier dataset.
 * Null when no pattern shares any.
 */
export function closestPattern(
    model: Model,
    classId: string,
    properties: readonly string[],
): ClosestPattern | null {
    const chosen = new Set(properties);
    let best: ClosestPattern | null = null;
    for (const dataset of model.datasets) {
        for (const pattern of dataset.patterns) {
            if (pattern.population_type !== classId) continue;
            const shared = pattern.constraint_properties.filter((id) => chosen.has(id)).length;
            if (shared === 0) continue;
            const better =
                best === null ||
                shared > best.shared ||
                (shared === best.shared && pattern.stat_var_count > best.pattern.stat_var_count);
            if (better) best = { dataset: dataset.dcid, pattern, shared };
        }
    }
    return best;
}

/**
 * A field as CSV. A value starting with `=`, `+`, `-`, `@`, a tab or a
 * carriage return gains a leading `'`, so a spreadsheet opening the file
 * shows it as text instead of running it as a formula.
 */
const csvField = (raw: string): string => {
    const value = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
    return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
};

/**
 * RFC 4180: fields with a comma, quote or line break are quoted, quotes
 * doubled, lines end CRLF; a field that could run as a formula starts with `'`.
 */
export const toCsv = (rows: readonly (readonly string[])[]): string =>
    rows.map((row) => row.map(csvField).join(',')).join('\r\n');

/**
 * Example rows for a sheet: reference columns numbered, definition fields
 * as filled, and each property column a member of its value list, the rows
 * spread across the list. A property with no value list stays empty.
 */
export function exampleRows(
    columns: readonly SheetColumn[],
    count = 3,
): readonly (readonly string[])[] {
    return Array.from({ length: count }, (_, row) =>
        columns.map((column) => {
            if (column.kind === 'reference') {
                return column.name === 'source_code' ? `EX-${row + 1}` : `Example row ${row + 1}`;
            }
            if (column.kind === 'definition') return column.fill ?? '';
            const members = column.lookup?.members ?? [];
            return members[Math.floor((row * members.length) / count)]?.id ?? '';
        }),
    );
}

/** A file name from a label: lower case, runs of other characters as one hyphen. */
export const csvFileName = (label: string): string => {
    const stem = label
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
    return `${stem || 'sheet'}.csv`;
};

/** The sheet the Start a sheet page shows, as each export receives it. */
export type SheetDraft = {
    /** The label of the kind of thing the figures are about. */
    readonly title: string;
    /** The graph generation the model was read from, or null when it has none. */
    readonly generation: string | null;
    /** The CSV file name built from the title. */
    readonly fileName: string;
    /** The columns in order, each property column with its value list's members as `lookup`. */
    readonly columns: readonly SheetColumn[];
    /** The example rows under the header, one value per column. */
    readonly rows: readonly (readonly string[])[];
};

/** The draft for a sheet spec: its columns, example rows, title and file name. */
export function sheetDraft(model: Model, spec: SheetSpec & { classId: string }): SheetDraft {
    const columns = sheetColumns(model, spec);
    const title = model.label(spec.classId);
    return Object.freeze({
        title,
        generation: model.generation,
        fileName: csvFileName(`${title} mapping sheet`),
        columns,
        rows: exampleRows(columns),
    });
}

/** The draft as CSV rows: the header row, then the example rows. */
export const draftCsvRows = (draft: SheetDraft): (readonly string[])[] => [
    draft.columns.map((column) => column.name),
    ...draft.rows,
];

/** The draft as the Google sheet handler takes it. */
export const sheetRequest = (draft: SheetDraft): SheetRequest => ({
    title: draft.title,
    generation: draft.generation,
    columns: draft.columns.map((column) => ({
        name: column.name,
        kind: column.kind,
        lookup: column.lookup && {
            valueList: column.lookup.valueList,
            members: column.lookup.members.map(({ id, label, code }) => ({ id, label, code })),
            complete: column.lookup.complete,
        },
    })),
    rows: draft.rows.map((row) => [...row]),
});

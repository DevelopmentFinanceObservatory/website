/**
 * The columns of a mapping sheet for a new dataset, the closest existing
 * dataset pattern to copy, and CSV output.
 */
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
    return Object.freeze({ valueList, members: Object.freeze(members) });
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

/** The sheet a dataset's pattern describes: its definition fields filled, its constraints as columns. */
export function sheetFromPattern(model: Model, pattern: OntologyPattern): readonly SheetColumn[] {
    return sheetColumns(model, {
        classId: pattern.population_type,
        measuredProperty: pattern.measured_property,
        statType: pattern.stat_type,
        qualifier: pattern.measurement_qualifier,
        properties: pattern.constraint_properties,
    });
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

const csvField = (value: string): string =>
    /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;

/** RFC 4180: fields with a comma, quote or line break are quoted, quotes doubled, lines end CRLF. */
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

/** The header row and the example rows. */
export const sheetTable = (columns: readonly SheetColumn[]): readonly (readonly string[])[] => [
    columns.map((column) => column.name),
    ...exampleRows(columns),
];

/** A file name from a label: lower case, runs of other characters as one hyphen. */
export const csvFileName = (label: string): string => {
    const stem = label
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
    return `${stem || 'sheet'}.csv`;
};

/**
 * A range pasted from a spreadsheet, read into check rows, and a finding
 * placed back on the cell it belongs to.
 */
import type { Model } from './model.ts';
import { findingProperty, type OntologyCheckRow, type OntologyFinding } from './wire.ts';

export type PastedRange = {
    readonly header: readonly string[];
    readonly rows: readonly (readonly string[])[];
};

/** The cell delimiter of a paste: a tab when its header line holds one, else a comma. */
const delimiterOf = (text: string): '\t' | ',' => {
    const lineEnd = text.search(/[\r\n]/);
    return (lineEnd === -1 ? text : text.slice(0, lineEnd)).includes('\t') ? '\t' : ',';
};

/**
 * Tab-separated text as spreadsheets copy it, or comma-separated text as
 * they save it: a cell wrapped in quotes may hold delimiters, line breaks
 * and doubled quotes. One leading byte-order mark is dropped. A quote that
 * opens a cell and never closes is read as an ordinary character, so the
 * rows after it stay rows. The first row is the header; trailing blank rows
 * are dropped.
 */
export function parsePasted(pasted: string): PastedRange {
    const text = pasted.startsWith('\uFEFF') ? pasted.slice(1) : pasted;
    const delimiter = delimiterOf(text);
    const records: string[][] = [];
    let record: string[] = [];
    let cell = '';
    let quoted = false;
    let cellStart = true;
    // Where the open quoted cell began, and the records finished before it.
    let opened = { at: 0, records: 0, record: [] as string[] };

    const endCell = () => {
        record.push(cell);
        cell = '';
        cellStart = true;
    };
    const endRecord = () => {
        endCell();
        records.push(record);
        record = [];
    };

    for (let i = 0; i <= text.length; i += 1) {
        if (i === text.length) {
            if (!quoted) break;
            // The quote never closed: read its cell again from the quote, unquoted.
            records.length = opened.records;
            record = [...opened.record];
            cell = '"';
            quoted = false;
            cellStart = false;
            i = opened.at;
            continue;
        }
        const char = text.charAt(i);
        if (quoted) {
            if (char !== '"') cell += char;
            else if (text.charAt(i + 1) === '"') {
                cell += '"';
                i += 1;
            } else quoted = false;
        } else if (char === '"' && cellStart) {
            opened = { at: i, records: records.length, record: [...record] };
            quoted = true;
            cellStart = false;
        } else if (char === delimiter) endCell();
        else if (char === '\n') endRecord();
        else if (char === '\r') {
            if (text.charAt(i + 1) === '\n') i += 1;
            endRecord();
        } else {
            cell += char;
            cellStart = false;
        }
    }
    if (cell !== '' || record.length > 0) endRecord();

    while (records.length > 0 && isBlank(records[records.length - 1] ?? [])) records.pop();
    const [header = [], ...rows] = records;
    return { header, rows };
}

const isBlank = (row: readonly string[]): boolean => row.every((cell) => cell.trim() === '');

/** The members of a check row a sheet can fill besides constraint properties. */
export const DEFINITION_FIELDS = [
    'dcid',
    'populationType',
    'measuredProperty',
    'statType',
    'measurementQualifier',
    'measurementDenominator',
    'observationProperties',
] as const;

export type DefinitionField = (typeof DEFINITION_FIELDS)[number];

/** What one column of the pasted range becomes. */
export type ColumnTarget =
    | { readonly kind: 'definition'; readonly field: DefinitionField }
    | { readonly kind: 'property'; readonly property: string }
    | { readonly kind: 'ignored' };

export type MappedColumn = {
    readonly index: number;
    readonly header: string;
    /** What the header reads as, or what the reader switched the column to. */
    readonly wanted: ColumnTarget;
    /** What the check reads the column as: `wanted`, or ignored when it repeats an earlier column. */
    readonly target: ColumnTarget;
    /** The earlier column that holds the same property or field, when this one is ignored for it. */
    readonly duplicateOf: number | null;
};

/** One entry per header, in order. No two columns share a property or a definition field. */
export type Mapping = readonly MappedColumn[];

/** The property or definition field a target fills, or null for ignored. */
const targetKey = (target: ColumnTarget): string | null => {
    if (target.kind === 'definition') return `definition:${target.field}`;
    return target.kind === 'property' ? `property:${target.property}` : null;
};

/**
 * Each column with its wanted target, except that the first column wanting
 * a property or field keeps it and each later one is ignored, naming the
 * first in `duplicateOf`. A column already settled is kept as it is.
 */
const settle = (columns: readonly MappedColumn[]): Mapping => {
    const first = new Map<string, number>();
    return columns.map((column) => {
        const key = targetKey(column.wanted);
        const holder = key === null ? undefined : first.get(key);
        if (key !== null && holder === undefined) first.set(key, column.index);
        const duplicateOf = holder ?? null;
        const target: ColumnTarget = duplicateOf === null ? column.wanted : { kind: 'ignored' };
        const unchanged =
            column.duplicateOf === duplicateOf &&
            (duplicateOf === null
                ? column.target === column.wanted
                : column.target.kind === 'ignored');
        return unchanged ? column : { ...column, target, duplicateOf };
    });
};

const snakeCase = (name: string): string =>
    name.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();

const camelCase = (name: string): string =>
    name.replace(/_+([a-z0-9])/gi, (_, char: string) => char.toUpperCase());

const fieldOf = (header: string): DefinitionField | undefined =>
    DEFINITION_FIELDS.find((field) => field === header || field === camelCase(header));

/** The property a header names: the dcid itself, or the one whose snake case form it is. */
const propertyOf = (model: Model, header: string, properties: readonly string[]) => {
    if (model.kind(header) === 'property') return header;
    const named = properties.filter((id) => snakeCase(id) === header);
    return named.length === 1 ? named[0] : undefined;
};

/**
 * Reads each header as a definition field, a property of the model, or
 * neither. A column naming the same property or field as an earlier one is
 * ignored, with `duplicateOf` naming the earlier column.
 */
export function mapHeaders(model: Model, headers: readonly string[]): Mapping {
    const properties = model.nodes
        .filter((node) => model.kind(node.dcid) === 'property')
        .map((node) => node.dcid);
    const read = (header: string): ColumnTarget => {
        const field = fieldOf(header);
        if (field !== undefined) return { kind: 'definition', field };
        const property = propertyOf(model, header, properties);
        return property === undefined ? { kind: 'ignored' } : { kind: 'property', property };
    };
    return settle(
        headers.map((raw, index): MappedColumn => {
            const header = raw.trim();
            const wanted = read(header);
            return { index, header, wanted, target: wanted, duplicateOf: null };
        }),
    );
}

/**
 * Switches one column between a property and ignored. A property column
 * names the header as typed, which the check reports when the graph lacks it.
 * Duplicates are settled again, so ignoring the first of two columns hands
 * its property or field to the second.
 */
export function switchColumn(mapping: Mapping, index: number, to: 'property' | 'ignored'): Mapping {
    return settle(
        mapping.map((column) => {
            if (column.index !== index) return column;
            const wanted: ColumnTarget =
                to === 'ignored'
                    ? { kind: 'ignored' }
                    : { kind: 'property', property: column.header };
            return { ...column, wanted, target: wanted, duplicateOf: null };
        }),
    );
}

/** A reader's choice for one column, kept while the column's header reads `header`. */
export type ColumnSwitch = { readonly header: string; readonly to: 'property' | 'ignored' };

/**
 * The mapping with the reader's switches applied. A switch whose column's
 * header has changed since it was made is passed over, so editing the rows
 * keeps every choice and editing a header drops only that column's.
 */
export function applySwitches(
    mapping: Mapping,
    switches: ReadonlyMap<number, ColumnSwitch>,
): Mapping {
    let switched = mapping;
    for (const [index, { header, to }] of switches) {
        if (mapping[index]?.header === header) switched = switchColumn(switched, index, to);
    }
    return switched;
}

/** The sheet row a data row sits on as the reader sees it: the header is row 1. */
export const sheetRow = (dataIndex: number): number => dataIndex + 2;

/**
 * Check rows in the wire shape. `ref` is the sheet row number. Each property
 * or field is read from the one column the mapping gives it, the column
 * `locateFinding` places its findings on. An empty cell in a property
 * column leaves the property out; an empty measured property is sent as an
 * empty string so the check reports it. Blank rows are skipped.
 */
export function rowsToCheck(
    mapping: Mapping,
    rows: readonly (readonly string[])[],
): OntologyCheckRow[] {
    return rows.flatMap((cells, dataIndex): OntologyCheckRow[] => {
        if (isBlank(cells)) return [];
        const cell = (index: number): string => (cells[index] ?? '').trim();
        const definition = (field: DefinitionField): string => {
            const column = mapping.find(
                ({ target }) => target.kind === 'definition' && target.field === field,
            );
            return column === undefined ? '' : cell(column.index);
        };
        const constraints: Record<string, string> = {};
        for (const { target, index } of mapping) {
            if (target.kind !== 'property') continue;
            const value = cell(index);
            if (value !== '') constraints[target.property] = value;
        }
        const optional = (field: DefinitionField): string | null => definition(field) || null;
        return [
            {
                ref: String(sheetRow(dataIndex)),
                dcid: optional('dcid'),
                population_type: optional('populationType'),
                measured_property: definition('measuredProperty'),
                stat_type: optional('statType'),
                measurement_qualifier: optional('measurementQualifier'),
                measurement_denominator: optional('measurementDenominator'),
                constraint_properties: constraints,
                observation_properties: definition('observationProperties')
                    .split(',')
                    .map((id) => id.trim())
                    .filter((id) => id !== ''),
            },
        ];
    });
}

/** The cell a finding belongs to; `column` is null when its field maps to no column. */
export type FindingLocation = { readonly row: number; readonly column: number | null };

/** Places a finding by its `ref` (a sheet row number) and `field`. Null when `ref` is no row number. */
export function locateFinding(mapping: Mapping, finding: OntologyFinding): FindingLocation | null {
    const row = Number(finding.ref);
    if (finding.ref === null || !Number.isInteger(row) || row < 1) return null;
    const property = findingProperty(finding);
    const column = mapping.find(({ target }) =>
        property === null
            ? target.kind === 'definition' && target.field === camelCase(finding.field)
            : target.kind === 'property' && target.property === property,
    );
    return { row, column: column?.index ?? null };
}

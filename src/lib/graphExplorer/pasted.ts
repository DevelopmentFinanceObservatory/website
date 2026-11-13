/**
 * A range pasted from a spreadsheet, read into check rows, and a finding
 * placed back on the cell it belongs to.
 */
import type { Model } from './model.ts';
import { CHECK_MAX_ROWS } from './wire.ts';
import type { OntologyCheckRow, OntologyFinding } from './wire.ts';

export type PastedRange = {
    readonly header: readonly string[];
    readonly rows: readonly (readonly string[])[];
};

/**
 * Tab-separated text as spreadsheets copy it: a cell wrapped in quotes may
 * hold tabs, line breaks and doubled quotes. The first row is the header;
 * trailing blank rows are dropped.
 */
export function parsePasted(text: string): PastedRange {
    const records: string[][] = [];
    let record: string[] = [];
    let cell = '';
    let quoted = false;
    let cellStart = true;

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

    for (let i = 0; i < text.length; i += 1) {
        const char = text.charAt(i);
        if (quoted) {
            if (char !== '"') cell += char;
            else if (text.charAt(i + 1) === '"') {
                cell += '"';
                i += 1;
            } else quoted = false;
        } else if (char === '"' && cellStart) {
            quoted = true;
            cellStart = false;
        } else if (char === '\t') endCell();
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
    readonly target: ColumnTarget;
};

/** One entry per header, in order. */
export type Mapping = readonly MappedColumn[];

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

/** Reads each header as a definition field, a property of the model, or neither. */
export function mapHeaders(model: Model, headers: readonly string[]): Mapping {
    const properties = model.nodes
        .filter((node) => model.kind(node.dcid) === 'property')
        .map((node) => node.dcid);
    return headers.map((raw, index): MappedColumn => {
        const header = raw.trim();
        const field = fieldOf(header);
        if (field !== undefined) {
            return { index, header, target: { kind: 'definition', field } };
        }
        const property = propertyOf(model, header, properties);
        if (property !== undefined)
            return { index, header, target: { kind: 'property', property } };
        return { index, header, target: { kind: 'ignored' } };
    });
}

/**
 * Switches one column between a property and ignored. A property column
 * names the header as typed, which the check reports when the graph lacks it.
 */
export function switchColumn(mapping: Mapping, index: number, to: 'property' | 'ignored'): Mapping {
    return mapping.map((column) => {
        if (column.index !== index) return column;
        const target: ColumnTarget =
            to === 'ignored' ? { kind: 'ignored' } : { kind: 'property', property: column.header };
        return { ...column, target };
    });
}

/** The sheet row a data row sits on as the reader sees it: the header is row 1. */
const sheetRow = (dataIndex: number): number => dataIndex + 2;

/**
 * Check rows in the wire shape. `ref` is the sheet row number. An empty cell
 * in a property column leaves the property out; an empty measured property
 * is sent as an empty string so the check reports it. Blank rows are skipped.
 */
export function rowsToCheck(
    mapping: Mapping,
    rows: readonly (readonly string[])[],
): OntologyCheckRow[] {
    return rows.flatMap((cells, dataIndex): OntologyCheckRow[] => {
        if (isBlank(cells)) return [];
        const cell = (index: number): string => (cells[index] ?? '').trim();
        const definition = (field: DefinitionField): string =>
            mapping
                .filter((c) => c.target.kind === 'definition' && c.target.field === field)
                .map((c) => cell(c.index))
                .find((value) => value !== '') ?? '';
        const constraints: Record<string, string> = {};
        for (const column of mapping) {
            if (column.target.kind !== 'property') continue;
            const value = cell(column.index);
            if (value !== '') constraints[column.target.property] = value;
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

const CONSTRAINT_PREFIX = 'constraint_properties.';

/** Places a finding by its `ref` (a sheet row number) and `field`. Null when `ref` is no row number. */
export function locateFinding(mapping: Mapping, finding: OntologyFinding): FindingLocation | null {
    const row = Number(finding.ref);
    if (finding.ref === null || !Number.isInteger(row) || row < 1) return null;
    const column = mapping.find(({ target }) => {
        if (finding.field.startsWith(CONSTRAINT_PREFIX)) {
            return (
                target.kind === 'property' &&
                target.property === finding.field.slice(CONSTRAINT_PREFIX.length)
            );
        }
        return target.kind === 'definition' && target.field === camelCase(finding.field);
    });
    return { row, column: column?.index ?? null };
}

/** The rows in runs of at most `size`, the most one check request takes. */
export function chunkRows<TRow>(rows: readonly TRow[], size = CHECK_MAX_ROWS): TRow[][] {
    const chunks: TRow[][] = [];
    for (let start = 0; start < rows.length; start += size) {
        chunks.push(rows.slice(start, start + size));
    }
    return chunks;
}

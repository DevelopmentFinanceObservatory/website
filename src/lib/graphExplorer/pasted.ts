/**
 * A range pasted from a spreadsheet, read into check rows, and a finding
 * placed back on the cell it belongs to.
 */
import { plural } from './counts.ts';
import type { Model } from './model.ts';
import {
    CHECK_MAX_CONSTRAINT_PROPERTIES,
    CHECK_MAX_OBSERVATION_PROPERTIES,
    CHECK_MAX_STRING_LENGTH,
    type SchemaCheckRow,
    type SchemaFinding,
} from './wire.ts';

export type PastedRange = {
    readonly header: readonly string[];
    readonly rows: readonly (readonly string[])[];
};

type Scan = {
    readonly records: string[][];
    /** The delimiters that ended a cell outside quotes. */
    readonly split: ReadonlySet<string>;
};

/**
 * Reads `text` into records, each cell ended by any character of
 * `delimiters` or by a line end. A cell that opens with a quote may hold
 * delimiters, line breaks and doubled quotes. Its closing quote counts only
 * when a delimiter, a line end or the end of the text follows it. When
 * anything else follows, or the quote does not close, the cell is read again
 * from its opening quote as plain text, so the rows after it stay rows.
 * Stops after `limit` records.
 */
const scan = (text: string, delimiters: string, limit = Infinity): Scan => {
    const records: string[][] = [];
    const split = new Set<string>();
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
    const closes = (next: string): boolean =>
        next === '' || next === '\n' || next === '\r' || delimiters.includes(next);

    for (let i = 0; i <= text.length && records.length < limit; i += 1) {
        const char = text.charAt(i);
        const unclosed = i === text.length && quoted;
        const stray =
            quoted && char === '"' && text.charAt(i + 1) !== '"' && !closes(text.charAt(i + 1));
        if (unclosed || stray) {
            // Read the quoted cell again from its opening quote, unquoted.
            records.length = opened.records;
            record = [...opened.record];
            cell = '"';
            quoted = false;
            cellStart = false;
            i = opened.at;
            continue;
        }
        if (i === text.length) break;
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
        } else if (delimiters.includes(char)) {
            split.add(char);
            endCell();
        } else if (char === '\n') endRecord();
        else if (char === '\r') {
            if (text.charAt(i + 1) === '\n') i += 1;
            endRecord();
        } else {
            cell += char;
            cellStart = false;
        }
    }
    if (records.length < limit && (cell !== '' || record.length > 0)) endRecord();
    return { records, split };
};

/**
 * The cell delimiter of a paste, a tab when one ends a cell of the header
 * record read with quotes honoured, else a comma.
 */
const delimiterOf = (text: string): '\t' | ',' =>
    scan(text, '\t,', 1).split.has('\t') ? '\t' : ',';

/**
 * Tab-separated text as spreadsheets copy it, or comma-separated text as
 * they save it, read by the quote rules of `scan`. One leading byte-order
 * mark is dropped. The first row is the header, and trailing blank rows
 * are dropped.
 */
export function parsePasted(pasted: string): PastedRange {
    const text = pasted.startsWith('\uFEFF') ? pasted.slice(1) : pasted;
    const { records } = scan(text, delimiterOf(text));
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
 * first in `duplicateOf`. A column already settled is returned as it is.
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

export const camelCase = (name: string): string =>
    name.replace(/_+([a-z0-9])/gi, (_, char: string) => char.toUpperCase());

const fieldOf = (header: string): DefinitionField | undefined =>
    DEFINITION_FIELDS.find((field) => field === header || field === camelCase(header));

/** The property a header names, which is the dcid itself or the one whose snake case form it is. */
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

/** A reader's choice for one column, applied while the column's header reads `header`. */
export type ColumnSwitch = { readonly header: string; readonly to: 'property' | 'ignored' };

/**
 * The mapping with the reader's switches applied. A switch whose column's
 * header differs from the one it was made for is passed over, so editing the
 * rows keeps every choice and editing a header drops only that column's.
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

/** The sheet row a data row sits on as the reader sees it, with the header as row 1. */
export const sheetRow = (dataIndex: number): number => dataIndex + 2;

/** Check rows in the wire shape, and the sheet row each was read from. */
export type SheetCheck = {
    readonly rows: readonly SchemaCheckRow[];
    /** The sheet row of `rows[i]`, at `i`. */
    readonly sheetRows: readonly number[];
};

/** A node reference as the check reads it: a leading `dcid:`, as dcp-tools sheets write it, dropped. */
const nodeRef = (cell: string): string =>
    cell.startsWith('dcid:') ? cell.slice('dcid:'.length).trim() : cell;

/**
 * Check rows in the wire shape. `ref` is the sheet row number, which the
 * route echoes. Each property or field is read from the one column the
 * mapping gives it, the column `findingColumn` places its findings on, and
 * a leading `dcid:` is dropped from each value. An empty cell leaves its
 * property or field out (null), and the route reports a missing measured
 * property as a finding. Blank rows are skipped.
 */
export function rowsToCheck(mapping: Mapping, rows: readonly (readonly string[])[]): SheetCheck {
    const checked: SchemaCheckRow[] = [];
    const sheetRows: number[] = [];
    rows.forEach((cells, dataIndex) => {
        if (isBlank(cells)) return;
        const cell = (index: number): string => nodeRef((cells[index] ?? '').trim());
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
        checked.push({
            ref: String(sheetRow(dataIndex)),
            dcid: optional('dcid'),
            population_type: optional('populationType'),
            measured_property: optional('measuredProperty'),
            stat_type: optional('statType'),
            measurement_qualifier: optional('measurementQualifier'),
            measurement_denominator: optional('measurementDenominator'),
            constraint_properties: constraints,
            observation_properties: definition('observationProperties')
                .split(',')
                .map((id) => nodeRef(id.trim()))
                .filter((id) => id !== ''),
        });
        sheetRows.push(sheetRow(dataIndex));
    });
    return { rows: checked, sheetRows };
}

/**
 * What in a sheet the check route would refuse outright, as it answers 400
 * for a request that breaks its size bounds. Everything else about a row's
 * content comes back from the route as findings.
 * - `too_many_constraint_properties`: the rows fill more than
 *   CHECK_MAX_CONSTRAINT_PROPERTIES property columns.
 * - `too_many_observation_properties`: the rows name more than
 *   CHECK_MAX_OBSERVATION_PROPERTIES observation properties.
 * - `header_too_long`: a property column's header is longer than
 *   CHECK_MAX_STRING_LENGTH characters, and the rows fill it.
 * - `value_too_long`: the rows hold a value longer than
 *   CHECK_MAX_STRING_LENGTH characters.
 */
export type SheetProblemCode =
    | 'too_many_constraint_properties'
    | 'too_many_observation_properties'
    | 'header_too_long'
    | 'value_too_long';

export type SheetProblem = {
    readonly code: SheetProblemCode;
    /** The column at fault, or null when the fault is a row's. */
    readonly column: number | null;
    /** The column's header, or null with no column. */
    readonly header: string | null;
    /** The sheet rows at fault, in order. */
    readonly rows: readonly number[];
};

/** Whether `text` is past the route's string bound, counted in code points as the route counts. */
const tooLong = (text: string): boolean =>
    text.length > CHECK_MAX_STRING_LENGTH && [...text].length > CHECK_MAX_STRING_LENGTH;

/** The definition fields of a check row, by the sheet field that fills each. */
const STRING_FIELDS = [
    ['dcid', 'dcid'],
    ['populationType', 'population_type'],
    ['measuredProperty', 'measured_property'],
    ['statType', 'stat_type'],
    ['measurementQualifier', 'measurement_qualifier'],
    ['measurementDenominator', 'measurement_denominator'],
] as const satisfies readonly (readonly [DefinitionField, keyof SchemaCheckRow])[];

/**
 * What in `sheet` the check route would refuse, one problem per cause and
 * column, so the reader can fix the sheet before any request. `sheet` is
 * what `rowsToCheck` built from `mapping`.
 */
export function sheetProblems(mapping: Mapping, { rows, sheetRows }: SheetCheck): SheetProblem[] {
    const problems: SheetProblem[] = [];
    const columnOf = (field: DefinitionField) =>
        mapping.find(({ target }) => target.kind === 'definition' && target.field === field);
    const add = (
        code: SheetProblemCode,
        column: MappedColumn | undefined,
        at: (row: SchemaCheckRow) => boolean,
    ) => {
        const faulty = sheetRows.filter((_, index) => at(rows[index]!));
        if (faulty.length === 0) return;
        problems.push({
            code,
            column: column?.index ?? null,
            header: column?.header ?? null,
            rows: faulty,
        });
    };

    for (const [field, key] of STRING_FIELDS) {
        add('value_too_long', columnOf(field), (row) => {
            const value = row[key];
            return typeof value === 'string' && tooLong(value);
        });
    }
    const observations = columnOf('observationProperties');
    add('value_too_long', observations, (row) => (row.observation_properties ?? []).some(tooLong));
    add(
        'too_many_observation_properties',
        observations,
        (row) => (row.observation_properties ?? []).length > CHECK_MAX_OBSERVATION_PROPERTIES,
    );
    add(
        'too_many_constraint_properties',
        undefined,
        (row) =>
            Object.keys(row.constraint_properties ?? {}).length > CHECK_MAX_CONSTRAINT_PROPERTIES,
    );
    for (const column of mapping) {
        const { target } = column;
        if (target.kind !== 'property') continue;
        const value = (row: SchemaCheckRow) => row.constraint_properties?.[target.property];
        if (tooLong(target.property)) {
            add('header_too_long', column, (row) => value(row) !== undefined);
        }
        add('value_too_long', column, (row) => {
            const cell = value(row);
            return typeof cell === 'string' && tooLong(cell);
        });
    }
    return problems;
}

/** The most row numbers a problem's line names before it counts the rest. */
const NAMED_ROWS = 5;

/** "row 3", "rows 3, 5 and 9", "rows 3, 5, 9, 12, 14 and 6 more". */
const rowsText = (rows: readonly number[]): string => {
    const named = rows.slice(0, NAMED_ROWS).map(String);
    const rest = rows.length - named.length;
    const parts = rest > 0 ? [...named, `${rest.toLocaleString('en-GB')} more`] : named;
    const list =
        parts.length < 2
            ? (parts[0] ?? '')
            : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`;
    return `${rows.length === 1 ? 'row' : 'rows'} ${list}`;
};

/** A problem as one line: what the check would refuse, where, and what to do. */
export function sheetProblemText(problem: SheetProblem): string {
    const column = `Column ${problem.header || '(no header)'}`;
    const on = rowsText(problem.rows);
    switch (problem.code) {
        case 'too_many_constraint_properties':
            return `${on.charAt(0).toUpperCase()}${on.slice(1)} ${problem.rows.length === 1 ? 'fills' : 'fill'} more than ${plural(CHECK_MAX_CONSTRAINT_PROPERTIES, 'property column')}, the most one row can have. Set some columns to Ignored.`;
        case 'too_many_observation_properties':
            return `${column} names more than ${plural(CHECK_MAX_OBSERVATION_PROPERTIES, 'observation property', 'observation properties')} on ${on}, the most one row can have.`;
        case 'header_too_long':
            return `${column} is read as a property, but its header is longer than ${CHECK_MAX_STRING_LENGTH} characters. Rename the header, or set the column to Ignored.`;
        case 'value_too_long':
            return `${column} holds a value longer than ${CHECK_MAX_STRING_LENGTH} characters on ${on}. Shorten it, or set the column to Ignored.`;
    }
}

/**
 * The column a finding belongs to: the property column of its constraint
 * property, else the column of its definition field. Null when the mapping
 * has no such column.
 */
export function findingColumn(mapping: Mapping, finding: SchemaFinding): number | null {
    const column = mapping.find(({ target }) =>
        finding.field === 'constraint_properties'
            ? target.kind === 'property' && target.property === finding.property
            : target.kind === 'definition' && target.field === camelCase(finding.field),
    );
    return column?.index ?? null;
}

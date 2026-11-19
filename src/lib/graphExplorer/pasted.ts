/**
 * A range pasted from a spreadsheet, read into check rows, and a finding
 * placed back on the cell it belongs to.
 */
import { plural } from './counts.ts';
import { scan } from './delimited.ts';
import type { Model } from './model.ts';
import { columnName } from './seed.ts';
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
    /** Why the check skips the column, or null when it reads it. */
    readonly skip: SkipReason | null;
    /** Why the header's own reading is ignored, kept so a reader's switch back to a property can undo it. */
    readonly defaultSkip: SkipReason | null;
    /** The model property the header names, which a switch to a property uses in place of the header text. */
    readonly candidate: string | null;
};

/**
 * Why a column is not checked:
 * - `no_field`: the header names no property or field the model knows.
 * - `never_constraint`: the header names something that is never a constraint
 *   (see NEVER_CONSTRAINT).
 * - `codes`: in a seed, the column names a property but holds source codes,
 *   with no cell carrying the `dcid:` prefix.
 * - `duplicate`: an earlier column holds the same property or field.
 * - `switched`: the reader set the column to ignored.
 */
export type SkipReason = 'no_field' | 'never_constraint' | 'codes' | 'duplicate' | 'switched';

/** Headers that read as a property of the model by name yet are never constraints of a StatVar. */
export const NEVER_CONSTRAINT: ReadonlySet<string> = new Set([
    'unit',
    'measurement_method',
    'entity_property',
    'name',
    'statvar_name',
    'constraint_properties',
]);

/** A seed has no `dcid` column. StatVar output (`dc_<dataset>_statvars`) has one. */
export type PastedKind = 'seed' | 'statvars';

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
        const skip: SkipReason | null =
            duplicateOf !== null
                ? 'duplicate'
                : target.kind === 'ignored'
                  ? (column.defaultSkip ?? 'switched')
                  : null;
        const unchanged =
            column.duplicateOf === duplicateOf &&
            column.skip === skip &&
            (duplicateOf === null
                ? column.target === column.wanted
                : column.target.kind === 'ignored');
        return unchanged ? column : { ...column, target, duplicateOf, skip };
    });
};

export const camelCase = (name: string): string =>
    name.replace(/_+([a-z0-9])/gi, (_, char: string) => char.toUpperCase());

const fieldOf = (header: string): DefinitionField | undefined =>
    DEFINITION_FIELDS.find((field) => field === header || field === camelCase(header));

/** Whether the headers carry a `dcid` column. */
export const pastedKind = (headers: readonly string[]): PastedKind =>
    headers.some((header) => fieldOf(header.trim()) === 'dcid') ? 'statvars' : 'seed';

/**
 * The property a header names: the dcid itself, or the one property whose
 * seed column name (`columnName`) it is. Each tier is tried in order, so a
 * header that names a DFO property keeps it whatever an outside model holds.
 */
const propertyOf = (header: string, tiers: readonly (readonly string[])[]) => {
    for (const properties of tiers) {
        if (properties.includes(header)) return header;
        const named = properties.filter((id) => columnName(id) === header);
        if (named.length > 0) return named.length === 1 ? named[0] : undefined;
    }
    return undefined;
};

/**
 * The properties a header may name, in the order they are tried: the
 * schema's, then those an outside usage document's `terms` name. A seed
 * copied from a base or UN dataset names such a property (`sex` from a UN
 * agency) by its column name, so reading the seed against a model built
 * over that document gives the column its property.
 */
const headerProperties = (model: Model): readonly (readonly string[])[] => {
    const held = model.nodes
        .filter((node) => model.kind(node.ref) === 'property')
        .map((node) => node.ref);
    const known = new Set(held);
    const outside = model.usageDocuments
        .flatMap((document) => document.terms ?? [])
        .filter((term) => term.types.includes('Property') && !known.has(term.ref))
        .map((term) => term.ref);
    return [held, [...new Set(outside)]];
};

/**
 * Reads each header as a definition field, a property of the model or of
 * its outside usage documents (`headerProperties`), or neither. A column naming the same property or field as an earlier one is
 * ignored, with `duplicateOf` naming the earlier column.
 *
 * In a seed (no `dcid` column), a property column holds source codes and is
 * skipped when it has a filled cell, no cell carrying the `dcid:` prefix, and
 * a cell that names no member of the property's value list. A column of bare
 * members is checked, and prefixFindings flags each cell. The decision reads
 * the rows rowsToCheck sends, so a row that reuses a StatVar does not count,
 * and with no rows no column is skipped. StatVar output checks every column
 * that maps.
 */
export function mapHeaders(
    model: Model,
    headers: readonly string[],
    rows: readonly (readonly string[])[] = [],
): Mapping {
    const properties = headerProperties(model);
    const seed = pastedKind(headers) === 'seed';
    // The identity columns as settle gives them out: the first column naming each field.
    const identity = IDENTITY_FIELDS.flatMap((field) => {
        const index = headers.findIndex((header) => fieldOf(header.trim()) === field);
        return index === -1 ? [] : [index];
    });
    const sent = rows.filter((cells) => !isBlank(cells) && !reusesStatVar(identity, cells));
    const holdsCodes = (index: number, property: string): boolean => {
        const cells = sent.map((row) => (row[index] ?? '').trim()).filter((cell) => cell !== '');
        if (cells.length === 0 || cells.some((cell) => cell.startsWith('dcid:'))) return false;
        const members = new Set(model.valueListOfProperty(property)?.members);
        return !cells.every((cell) => members.has(cell));
    };
    return settle(
        headers.map((raw, index): MappedColumn => {
            const header = raw.trim();
            const field = fieldOf(header);
            const never = field === undefined && NEVER_CONSTRAINT.has(columnName(header));
            const property =
                field === undefined && !never ? propertyOf(header, properties) : undefined;
            let wanted: ColumnTarget = { kind: 'ignored' };
            let defaultSkip: SkipReason | null = null;
            if (field !== undefined) wanted = { kind: 'definition', field };
            else if (never) defaultSkip = 'never_constraint';
            else if (property === undefined) defaultSkip = 'no_field';
            else if (seed && holdsCodes(index, property)) defaultSkip = 'codes';
            else wanted = { kind: 'property', property };
            return {
                index,
                header,
                wanted,
                target: wanted,
                duplicateOf: null,
                skip: null,
                defaultSkip,
                candidate: property ?? null,
            };
        }),
    );
}

/**
 * Switches one column between a property and ignored, which overrides the
 * default skip. A property column names the property its header reads as, or
 * else the header as typed, which the check reports when the graph lacks it.
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
                    : { kind: 'property', property: column.candidate ?? column.header };
            return {
                ...column,
                wanted,
                target: wanted,
                duplicateOf: null,
                defaultSkip: to === 'ignored' ? (column.defaultSkip ?? 'switched') : null,
            };
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
    /** The sheet rows left out of `rows` because they define no StatVar, in order. */
    readonly skipped: readonly number[];
};

/** A node reference as the check reads it: a leading `dcid:`, as dcp-tools sheets write it, dropped. */
const nodeRef = (cell: string): string =>
    cell.startsWith('dcid:') ? cell.slice('dcid:'.length).trim() : cell;

/** The definition fields whose cells all being empty mark a row that defines no StatVar. */
const IDENTITY_FIELDS = ['populationType', 'measuredProperty', 'statType'] as const;

/**
 * Whether a seed row fills none of the identity columns at `identity`, so it
 * reuses a StatVar defined elsewhere. False when the sheet has none of them.
 */
const reusesStatVar = (identity: readonly number[], cells: readonly string[]): boolean =>
    identity.length > 0 && identity.every((index) => nodeRef((cells[index] ?? '').trim()) === '');

/**
 * Check rows in the wire shape, with `sheetRows` naming the sheet row of
 * each. Each property or field is read from the one column the
 * mapping gives it, the column `findingColumn` places its findings on, and
 * a leading `dcid:` is dropped from each value. An empty cell leaves its
 * property or field out (null), and the route reports a missing measured
 * property as a finding. Blank rows are skipped. In a seed, so is a row
 * whose population type, measured property and stat type cells are all
 * empty, when the sheet has any of those columns; `skipped` names it. StatVar
 * output sends every nonblank row, since each defines the StatVar its `dcid`
 * names.
 */
export function rowsToCheck(mapping: Mapping, rows: readonly (readonly string[])[]): SheetCheck {
    const checked: SchemaCheckRow[] = [];
    const sheetRows: number[] = [];
    const skipped: number[] = [];
    const seed = pastedKind(mapping.map(({ header }) => header)) === 'seed';
    const identity = IDENTITY_FIELDS.flatMap((field) =>
        mapping.flatMap(({ target, index }) =>
            target.kind === 'definition' && target.field === field ? [index] : [],
        ),
    );
    rows.forEach((cells, dataIndex) => {
        if (isBlank(cells)) return;
        const cell = (index: number): string => nodeRef((cells[index] ?? '').trim());
        const definition = (field: DefinitionField): string => {
            const column = mapping.find(
                ({ target }) => target.kind === 'definition' && target.field === field,
            );
            return column === undefined ? '' : cell(column.index);
        };
        if (seed && reusesStatVar(identity, cells)) {
            skipped.push(sheetRow(dataIndex));
            return;
        }
        const constraints: Record<string, string> = {};
        for (const { target, index } of mapping) {
            if (target.kind !== 'property') continue;
            const value = cell(index);
            if (value !== '') constraints[target.property] = value;
        }
        const optional = (field: DefinitionField): string | null => definition(field) || null;
        checked.push({
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
    return { rows: checked, sheetRows, skipped };
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

/** A cell of a checked seed column that lacks the `dcid:` prefix. */
export type PrefixFinding = {
    readonly code: 'missing_prefix';
    readonly column: number;
    readonly header: string;
    /** The sheet row of the cell. */
    readonly row: number;
    readonly value: string;
};

/**
 * The unprefixed cells of each checked property column of a seed, read from
 * the rows `sheet` sends to the check, where the column also holds
 * `dcid:`-prefixed cells or, with `model`, every filled cell names a member
 * of the property's value list. The column is checked and each cell is sent.
 * StatVar output carries bare values and gets no findings.
 */
export function prefixFindings(
    kind: PastedKind,
    mapping: Mapping,
    rows: readonly (readonly string[])[],
    sheet: SheetCheck,
    model?: Model,
): PrefixFinding[] {
    if (kind !== 'seed') return [];
    const sent = new Set(sheet.sheetRows);
    const found: PrefixFinding[] = [];
    for (const { index, header, target } of mapping) {
        if (target.kind !== 'property') continue;
        const cells = rows
            .map((cells, dataIndex) => ({
                row: sheetRow(dataIndex),
                value: (cells[index] ?? '').trim(),
            }))
            .filter(({ row }) => sent.has(row));
        const present = cells.filter(({ value }) => value !== '');
        const members = new Set(model?.valueListOfProperty(target.property)?.members);
        const bareMembers = present.length > 0 && present.every(({ value }) => members.has(value));
        if (!bareMembers && !present.some(({ value }) => value.startsWith('dcid:'))) continue;
        for (const { row, value } of present) {
            if (!value.startsWith('dcid:'))
                found.push({ code: 'missing_prefix', column: index, header, row, value });
        }
    }
    return found;
}

/** What the reader did with a paste, for the line above the findings. */
export type ReadSummary = {
    readonly kind: PastedKind;
    /** Data rows read, blank rows excluded, counting both the rows sent to the check and the skipped ones. */
    readonly rows: number;
    readonly skippedRows: number;
    /** The columns the check reads, in order. Blank headers are left out. */
    readonly checked: readonly { readonly index: number; readonly header: string }[];
    readonly skipped: readonly {
        readonly index: number;
        readonly header: string;
        readonly reason: SkipReason;
    }[];
};

/** The summary of reading `sheet` through `mapping`. */
export function readSummary(kind: PastedKind, mapping: Mapping, sheet: SheetCheck): ReadSummary {
    const named = mapping.filter(({ header }) => header !== '');
    return {
        kind,
        rows: sheet.rows.length + sheet.skipped.length,
        skippedRows: sheet.skipped.length,
        checked: named
            .filter(({ skip }) => skip === null)
            .map(({ index, header }) => ({ index, header })),
        skipped: named.flatMap(({ index, header, skip }) =>
            skip === null ? [] : [{ index, header, reason: skip }],
        ),
    };
}

/** A pasted or loaded text read to the end. */
export type PastedRead = {
    readonly range: PastedRange;
    readonly mapping: Mapping;
    readonly sheet: SheetCheck;
    readonly summary: ReadSummary;
    readonly prefixFindings: readonly PrefixFinding[];
};

/** A parsed range read through its headers' own mapping with the reader's `switches` applied. */
const readRange = (
    model: Model,
    range: PastedRange,
    mapped: Mapping,
    switches: ReadonlyMap<number, ColumnSwitch>,
): PastedRead => {
    const kind = pastedKind(range.header);
    const mapping = applySwitches(mapped, switches);
    const sheet = rowsToCheck(mapping, range.rows);
    return {
        range,
        mapping,
        sheet,
        summary: readSummary(kind, mapping, sheet),
        prefixFindings: prefixFindings(kind, mapping, range.rows, sheet, model),
    };
};

/**
 * Reads a paste, or the text of a chosen `.csv` file, which parse alike,
 * with the reader's column `switches` applied.
 */
export function readPasted(
    model: Model,
    text: string,
    switches: ReadonlyMap<number, ColumnSwitch> = new Map(),
): PastedRead {
    const range = parsePasted(text);
    return readRange(model, range, mapHeaders(model, range.header, range.rows), switches);
}

/**
 * The same text as `read` with `switches` applied, from `read`'s parsed
 * range, so the text is not scanned again. `read` is a read with no switches.
 */
export const switchRead = (
    model: Model,
    read: PastedRead,
    switches: ReadonlyMap<number, ColumnSwitch>,
): PastedRead => readRange(model, read.range, read.mapping, switches);

/** Every skip reason, in the order the summary line names them. */
const SKIP_REASONS = [
    'no_field',
    'never_constraint',
    'codes',
    'duplicate',
    'switched',
] as const satisfies readonly SkipReason[];

/** Why columns are not checked, for one column and for several. */
const REASON_TEXT: Record<SkipReason, readonly [string, string]> = {
    no_field: ['the check has no field for it', 'the check has no field for them'],
    never_constraint: ['never a constraint', 'never constraints'],
    codes: ['holds codes', 'hold codes'],
    duplicate: ['repeats an earlier column', 'repeat earlier columns'],
    switched: ['set to ignored', 'set to ignored'],
};

/** "aid_type", "aid_type and unit", "a, b and c". */
const listText = (names: readonly string[]): string =>
    names.length < 2 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;

/**
 * The line above the findings: how the paste was read, how many rows and
 * columns, why rows were skipped, and why each skipped column is not
 * checked. When every row is skipped, it says the check waits for a row.
 */
export function readSummaryText(summary: ReadSummary): string {
    const kind =
        summary.kind === 'seed' ? 'a seed (no dcid column)' : 'StatVar output (dcid column)';
    const one = summary.skippedRows === 1;
    const skippedRows =
        summary.skippedRows === 0
            ? ''
            : `, ${plural(summary.skippedRows, 'row')} skipped (${one ? 'it fills' : 'they fill'} no population type, measured property or stat type, so ${one ? 'it reuses' : 'they reuse'} a StatVar defined elsewhere)`;
    const lines = [`Read as ${kind}, ${plural(summary.rows, 'row')}${skippedRows}.`];
    if (summary.rows > 0 && summary.skippedRows === summary.rows) {
        lines.push('There is nothing to check until a row fills one of those columns.');
    }
    lines.push(`Checked: ${plural(summary.checked.length, 'column')}.`);
    const reasons = SKIP_REASONS.flatMap((reason) => {
        const names = summary.skipped.filter((column) => column.reason === reason);
        return names.length === 0
            ? []
            : [
                  `${listText(names.map(({ header }) => header))} (${REASON_TEXT[reason][names.length === 1 ? 0 : 1]})`,
              ];
    });
    if (reasons.length > 0) lines.push(`Not checked: ${reasons.join(', ')}.`);
    return lines.join(' ');
}

/**
 * A mapping sheet as a Google spreadsheet: the request body the Start a sheet
 * page sends, its bounds, and the Sheets API request bodies built from it.
 *
 * The spreadsheet has two tabs. The mapping tab holds the header row in bold
 * and frozen, then the example rows; its first cell carries a note naming the
 * graph generation and the date. The value-list tab holds one block per
 * property column with a value list: the property's name, then a row of
 * `dcid`, `label` and `code`, then one row per member, each block followed by
 * an empty column. Each such property column gets a dropdown fed from its
 * block's dcid range.
 *
 * Reference: https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets/create
 * and https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets/request#setdatavalidationrequest
 */
import { asRecord } from '../asRecord.ts';
import { PARTIAL_LIST_LINE } from './counts.ts';
import type { ColumnKind } from './sheet.ts';

/** The Google OAuth scope that lets the tool create files and see only those it created. */
export const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

export const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';

export const MAPPING_TAB = { sheetId: 0, title: 'Mapping sheet' } as const;
export const VALUE_LIST_TAB = { sheetId: 1, title: 'Value lists' } as const;

/** The mapping tab's rows a dropdown covers, under the header. */
export const DROPDOWN_ROWS = 1000;

export const LIMITS = {
    /** The request body in bytes, read before parsing. */
    bodyBytes: 5_000_000,
    title: 200,
    generation: 200,
    columns: 64,
    columnName: 200,
    rows: 50,
    cell: 1000,
    members: 5000,
    /** A value list's dcid, a member's dcid, label or code. */
    term: 500,
} as const;

/** One member of a value list, as the page sends it. */
export type SheetMember = { id: string; label: string; code: string | null };

export type SheetRequestColumn = {
    name: string;
    kind: ColumnKind;
    /** `complete` is false when the graph holds members of the value list that `members` leaves out. */
    lookup: { valueList: string; members: SheetMember[]; complete: boolean } | null;
};

/** The body of `POST /graph-explorer/api/sheets`. */
export type SheetRequest = {
    title: string;
    /** The graph generation the sheet was made from, or null when the model has none. */
    generation: string | null;
    columns: SheetRequestColumn[];
    /** The example rows under the header, one value per column. */
    rows: string[][];
};

/**
 * Why the reader must grant Google access before a sheet can be created:
 * no Google account is linked, the linked one lacks the `drive.file`
 * scope, or its token has expired and Better Auth holds no refresh token to
 * renew it with (or Google refused the token).
 */
export type GoogleAccessReason = 'no_google_account' | 'scope_missing' | 'token_expired';

/** What the handler answers. A sheet whose dropdowns could not be added is still a sheet. */
export type SheetsAnswer =
    | { ok: true; url: string; dropdowns: 'added' | 'none' | 'failed' }
    | {
          ok: false;
          code: 'signed_out' | 'email_not_verified' | 'domain_not_allowed' | 'invalid_body';
          message: string;
      }
    | {
          ok: false;
          code: 'google_access_needed';
          reason: GoogleAccessReason;
          message: string;
      }
    | {
          ok: false;
          code: 'google_failed' | 'auth_failed' | 'google_renewal_failed';
          message: string;
      };

const KINDS: readonly ColumnKind[] = ['reference', 'definition', 'property'];

const isText = (value: unknown, max: number, min = 0): value is string =>
    typeof value === 'string' && value.length >= min && value.length <= max;

const readMember = (value: unknown): SheetMember | null => {
    const member = asRecord(value);
    if (member === undefined) return null;
    const { id, label, code } = member;
    if (!isText(id, LIMITS.term, 1) || !isText(label, LIMITS.term)) return null;
    if (code !== null && !isText(code, LIMITS.term)) return null;
    return { id, label, code };
};

const readLookup = (value: unknown): SheetRequestColumn['lookup'] | undefined => {
    if (value === null) return null;
    const lookup = asRecord(value);
    if (lookup === undefined) return undefined;
    const { valueList, members, complete } = lookup;
    if (!isText(valueList, LIMITS.term, 1)) return undefined;
    if (typeof complete !== 'boolean') return undefined;
    if (!Array.isArray(members) || members.length > LIMITS.members) return undefined;
    const read = members.map(readMember);
    if (read.some((member) => member === null)) return undefined;
    return { valueList, members: read.filter((member) => member !== null), complete };
};

const readColumn = (value: unknown): SheetRequestColumn | null => {
    const column = asRecord(value);
    if (column === undefined) return null;
    const { name, kind, lookup } = column;
    if (!isText(name, LIMITS.columnName, 1)) return null;
    const known = KINDS.find((each) => each === kind);
    if (known === undefined) return null;
    const read = readLookup(lookup);
    if (read === undefined) return null;
    return { name, kind: known, lookup: read };
};

/** The request body checked against its bounds, or null when it breaks one. */
export const readSheetRequest = (value: unknown): SheetRequest | null => {
    const body = asRecord(value);
    if (body === undefined) return null;
    const { title, generation, columns, rows } = body;
    if (!isText(title, LIMITS.title, 1)) return null;
    if (generation !== null && !isText(generation, LIMITS.generation, 1)) return null;
    if (!Array.isArray(columns) || columns.length === 0 || columns.length > LIMITS.columns) {
        return null;
    }
    const read = columns.map(readColumn);
    if (read.some((column) => column === null)) return null;
    if (!Array.isArray(rows) || rows.length > LIMITS.rows) return null;
    const fits = (row: unknown): row is string[] =>
        Array.isArray(row) &&
        row.length === columns.length &&
        row.every((cell) => isText(cell, LIMITS.cell));
    if (!rows.every(fits)) return null;
    return {
        title,
        generation,
        columns: read.filter((column) => column !== null),
        rows,
    };
};

/** A column's letters in A1 notation from its zero-based index: 0 is A, 26 is AA. */
export const columnLetters = (index: number): string => {
    let letters = '';
    for (let rest = index + 1; rest > 0; rest = Math.floor((rest - 1) / 26)) {
        letters = String.fromCharCode(65 + ((rest - 1) % 26)) + letters;
    }
    return letters;
};

/** A property column with a non-empty value list, where its block sits on the value-list tab. */
type Block = {
    /** The column's index on the mapping tab. */
    column: number;
    name: string;
    members: SheetMember[];
    complete: boolean;
    /** The block's first column on the value-list tab. */
    start: number;
};

const BLOCK_WIDTH = 4;

const blocksOf = (request: SheetRequest): Block[] =>
    request.columns
        .flatMap((column, index) =>
            column.kind === 'property' && column.lookup && column.lookup.members.length > 0
                ? [
                      {
                          column: index,
                          name: column.name,
                          members: column.lookup.members,
                          complete: column.lookup.complete,
                      },
                  ]
                : [],
        )
        .map((block, at) => ({ ...block, start: at * BLOCK_WIDTH }));

/**
 * The value-list tab's rows above the members: the property's name, the
 * partial-list line when any block's list is partial, then the field names.
 */
const headerRows = (blocks: readonly Block[]): number =>
    blocks.every((block) => block.complete) ? 2 : 3;

/** A cell as the create body writes it: always a string value, never parsed as a formula. */
export type Cell = {
    userEnteredValue?: { stringValue: string };
    userEnteredFormat?: { textFormat: { bold: boolean } };
    note?: string;
};

const EMPTY: Cell = {};

const text = (value: string): Cell => ({ userEnteredValue: { stringValue: value } });
const bold = (value: string): Cell => ({
    ...text(value),
    userEnteredFormat: { textFormat: { bold: true } },
});

/** The note on the mapping tab's first cell. */
export const generationNote = (generation: string | null, today: string): string =>
    `Made with the DFO Graph Explorer on ${today} from ${
        generation === null
            ? 'a graph with no generation recorded'
            : `graph generation ${generation}`
    }. Each property column takes a dcid from the ${VALUE_LIST_TAB.title} tab.`;

/** The value-list tab's rows: the blocks side by side, an empty column between two. */
const valueListRows = (blocks: Block[]) => {
    const header = headerRows(blocks);
    const height = Math.max(0, ...blocks.map((block) => block.members.length)) + header;
    return Array.from({ length: height }, (_, row) => ({
        values: blocks.flatMap((block, at) => {
            const gap = at < blocks.length - 1 ? [EMPTY] : [];
            if (row === 0) return [bold(block.name), EMPTY, EMPTY, ...gap];
            if (row === header - 1) return [bold('dcid'), bold('label'), bold('code'), ...gap];
            if (row < header) {
                return [block.complete ? EMPTY : text(PARTIAL_LIST_LINE), EMPTY, EMPTY, ...gap];
            }
            const member = block.members[row - header];
            if (member === undefined) return [EMPTY, EMPTY, EMPTY, ...gap];
            return [text(member.id), text(member.label), text(member.code ?? ''), ...gap];
        }),
    }));
};

/** The `spreadsheets.create` body: both tabs, filled. */
export const createSpreadsheetBody = (request: SheetRequest, today: string) => {
    const blocks = blocksOf(request);
    const valueRows =
        blocks.length > 0
            ? valueListRows(blocks)
            : [{ values: [text('No column of this sheet takes a value from a value list.')] }];
    const [first, ...rest] = request.columns;

    return {
        properties: { title: `${request.title} mapping sheet` },
        sheets: [
            {
                properties: {
                    ...MAPPING_TAB,
                    index: 0,
                    gridProperties: {
                        rowCount: DROPDOWN_ROWS + 1,
                        columnCount: Math.max(request.columns.length, 26),
                        frozenRowCount: 1,
                    },
                },
                data: [
                    {
                        startRow: 0,
                        startColumn: 0,
                        rowData: [
                            {
                                values: [
                                    {
                                        ...bold(first?.name ?? ''),
                                        note: generationNote(request.generation, today),
                                    },
                                    ...rest.map((column) => bold(column.name)),
                                ],
                            },
                            ...request.rows.map((row) => ({ values: row.map(text) })),
                        ],
                    },
                ],
            },
            {
                properties: {
                    ...VALUE_LIST_TAB,
                    index: 1,
                    gridProperties: {
                        rowCount: valueRows.length,
                        columnCount: Math.max(1, blocks.length * BLOCK_WIDTH - 1),
                        frozenRowCount: blocks.length > 0 ? headerRows(blocks) : 0,
                    },
                },
                data: [{ startRow: 0, startColumn: 0, rowData: valueRows }],
            },
        ],
    };
};

/** A block's dcid cells in A1 notation, as a formula on the value-list tab. */
const dcidRange = (block: Block, header: number): string => {
    const letters = columnLetters(block.start);
    const top = header + 1;
    return `='${VALUE_LIST_TAB.title}'!$${letters}$${top}:$${letters}$${top + block.members.length - 1}`;
};

/**
 * The `spreadsheets.batchUpdate` body that puts a dropdown on each property
 * column with a value list, over the first DROPDOWN_ROWS rows under the
 * header, or null when no column has one. A value outside the list is
 * flagged, not refused, so pasted source values stay visible.
 */
export const dropdownRequestBody = (request: SheetRequest) => {
    const blocks = blocksOf(request);
    if (blocks.length === 0) return null;
    const header = headerRows(blocks);
    return {
        requests: blocks.map((block) => ({
            setDataValidation: {
                range: {
                    sheetId: MAPPING_TAB.sheetId,
                    startRowIndex: 1,
                    endRowIndex: DROPDOWN_ROWS + 1,
                    startColumnIndex: block.column,
                    endColumnIndex: block.column + 1,
                },
                rule: {
                    condition: {
                        type: 'ONE_OF_RANGE',
                        values: [{ userEnteredValue: dcidRange(block, header) }],
                    },
                    strict: false,
                    showCustomUi: true,
                },
            },
        })),
    };
};
